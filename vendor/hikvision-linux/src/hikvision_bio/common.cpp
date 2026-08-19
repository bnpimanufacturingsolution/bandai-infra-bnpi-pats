#include "hikvision_bio/common.hpp"

#include <cstdio>
#include <ctime>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <regex>
#include <sstream>

#include "HCNetSDK.h"

namespace hikvision_bio {

std::mutex sdk_request_mutex;
std::mutex evidence_mutex;
std::ofstream evidence_stream;

std::string json_escape(const std::string &value) {
    std::ostringstream out;
    for (const char c : value) {
        switch (c) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    out << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                        << static_cast<int>(static_cast<unsigned char>(c));
                } else {
                    out << c;
                }
        }
    }
    return out.str();
}

std::string now_utc() {
    const std::time_t raw = std::time(nullptr);
    std::tm tm_value{};
#ifdef _WIN32
    gmtime_s(&tm_value, &raw);
#else
    gmtime_r(&raw, &tm_value);
#endif
    char buffer[32] = {0};
    std::strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &tm_value);
    return buffer;
}

void emit_json(const std::map<std::string, std::string> &fields) {
    std::ostringstream line;
    line << "{\"ts\":\"" << now_utc() << "\"";
    for (const auto &field : fields) {
        line << ",\"" << json_escape(field.first) << "\":\"" << json_escape(field.second) << "\"";
    }
    line << "}";

    std::lock_guard<std::mutex> lock(evidence_mutex);
    std::cout << line.str() << std::endl;
    if (evidence_stream.is_open()) {
        evidence_stream << line.str() << std::endl;
        evidence_stream.flush();
    }
}

void emit_sensitive_json_stdout_only(const std::map<std::string, std::string> &fields) {
    std::ostringstream line;
    line << "{\"ts\":\"" << now_utc() << "\"";
    for (const auto &field : fields) {
        line << ",\"" << json_escape(field.first) << "\":\"" << json_escape(field.second) << "\"";
    }
    line << "}";

    std::lock_guard<std::mutex> lock(evidence_mutex);
    std::cout << line.str() << std::endl;
}

bool stdxml_json_request(
    DeviceSession &session,
    const std::string &method_and_path,
    const std::string &body,
    std::string *response) {
    std::lock_guard<std::mutex> sdk_lock(sdk_request_mutex);
    NET_DVR_XML_CONFIG_INPUT input{};
    NET_DVR_XML_CONFIG_OUTPUT output{};
    char url[512] = {0};
    char in_buffer[8192] = {0};
    char out_buffer[65536] = {0};
    char status_buffer[4096] = {0};

    std::strncpy(url, method_and_path.c_str(), sizeof(url) - 1);
    std::strncpy(in_buffer, body.c_str(), sizeof(in_buffer) - 1);

    input.dwSize = sizeof(input);
    input.lpRequestUrl = url;
    input.dwRequestUrlLen = static_cast<DWORD>(std::strlen(url));
    input.lpInBuffer = in_buffer;
    input.dwInBufferSize = static_cast<DWORD>(std::strlen(in_buffer));

    output.dwSize = sizeof(output);
    output.lpOutBuffer = out_buffer;
    output.dwOutBufferSize = sizeof(out_buffer);
    output.lpStatusBuffer = status_buffer;
    output.dwStatusSize = sizeof(status_buffer);

    const BOOL ok = NET_DVR_STDXMLConfig(session.user_id, &input, &output);
    if (response != nullptr) {
        response->assign(out_buffer, output.dwReturnedXMLSize);
    }
    return ok == TRUE;
}

std::string xml_inner_tag(const std::string &xml, const char *tag) {
    const std::string open = std::string("<") + tag + ">";
    const std::string close = std::string("</") + tag + ">";
    const auto start = xml.find(open);
    if (start == std::string::npos) {
        return "";
    }
    const auto from = start + open.size();
    const auto end = xml.find(close, from);
    if (end == std::string::npos) {
        return "";
    }
    return xml.substr(from, end - from);
}

std::string json_string_field(const std::string &json, const char *key) {
    const std::string needle = std::string("\"") + key + "\"";
    auto pos = json.find(needle);
    if (pos == std::string::npos) {
        return "";
    }
    pos = json.find(':', pos + needle.size());
    if (pos == std::string::npos) {
        return "";
    }
    pos = json.find('"', pos + 1);
    if (pos == std::string::npos) {
        return "";
    }
    const auto end = json.find('"', pos + 1);
    if (end == std::string::npos) {
        return "";
    }
    return json.substr(pos + 1, end - pos - 1);
}

void parse_time_payload(
    const std::string &payload,
    std::string *local_time,
    std::string *time_mode,
    std::string *time_zone) {
    *local_time = xml_inner_tag(payload, "localTime");
    *time_mode = xml_inner_tag(payload, "timeMode");
    *time_zone = xml_inner_tag(payload, "timeZone");
    if (local_time->empty()) {
        *local_time = json_string_field(payload, "localTime");
    }
    if (time_mode->empty()) {
        *time_mode = json_string_field(payload, "timeMode");
    }
    if (time_zone->empty()) {
        *time_zone = json_string_field(payload, "timeZone");
    }
}

std::string extract_string_field_from_json(const std::string &json, const std::string &field_name) {
    const std::regex field_regex("\"" + field_name + "\"\\s*:\\s*\"([^\"]*)\"");
    std::smatch match;
    if (std::regex_search(json, match, field_regex) && match.size() > 1) {
        return match[1].str();
    }
    return "";
}

int extract_int_field_from_json(const std::string &json, const std::string &field_name) {
    const std::regex field_regex("\"" + field_name + "\"\\s*:\\s*([0-9]+)");
    std::smatch match;
    if (std::regex_search(json, match, field_regex) && match.size() > 1) {
        try {
            return std::stoi(match[1].str());
        } catch (...) {
            return -1;
        }
    }
    return -1;
}

std::string extract_enclosing_json_object(const std::string &json, size_t pos_inside) {
    if (json.empty() || pos_inside >= json.size()) {
        return "";
    }
    int depth = 0;
    bool in_string = false;
    bool escaped = false;
    size_t start = pos_inside;
    for (size_t i = pos_inside + 1; i-- > 0;) {
        const char c = json[i];
        if (in_string) {
            if (escaped) {
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                in_string = false;
            }
            continue;
        }
        if (c == '"') {
            in_string = true;
            continue;
        }
        if (c == '}') {
            depth += 1;
        } else if (c == '{') {
            if (depth == 0) {
                start = i;
                break;
            }
            depth -= 1;
        }
        if (i == 0) {
            break;
        }
    }
    depth = 0;
    in_string = false;
    escaped = false;
    for (size_t index = start; index < json.size(); ++index) {
        const char c = json[index];
        if (in_string) {
            if (escaped) {
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                in_string = false;
            }
            continue;
        }
        if (c == '"') {
            in_string = true;
            continue;
        }
        if (c == '{') {
            depth += 1;
        } else if (c == '}') {
            depth -= 1;
            if (depth == 0) {
                return json.substr(start, index - start + 1);
            }
        }
    }
    return "";
}

std::string sdk_time_to_string(const NET_DVR_TIME &value) {
    char buffer[32] = {0};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "%04u-%02u-%02uT%02u:%02u:%02u",
        value.dwYear,
        value.dwMonth,
        value.dwDay,
        value.dwHour,
        value.dwMinute,
        value.dwSecond);
    return buffer;
}

std::string fixed_bytes_to_string(const BYTE *value, size_t max_len) {
    size_t len = 0;
    while (len < max_len && value[len] != 0) {
        ++len;
    }
    return std::string(reinterpret_cast<const char *>(value), len);
}

}  // namespace hikvision_bio
