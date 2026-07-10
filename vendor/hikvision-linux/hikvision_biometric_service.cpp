#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <deque>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <regex>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include <unistd.h>

#include "HCNetSDK.h"

namespace {

volatile std::sig_atomic_t keep_running = 1;

struct DeviceConfig {
    std::string hris_device_id;
    std::string organization_id;
    std::string name;
    std::string host;
    int sdk_port = 8000;
    std::string username;
    std::string password;
    bool biometric_peer = true;
};

struct DeviceSession {
    DeviceConfig config;
    LONG user_id = -1;
    LONG alarm_handle = -1;
};

struct ReconcileJob {
    std::string source_host;
    std::string source_device_id;
    std::string employee_no;
    std::string card_no;
    std::string door_no;
    std::string verify_mode;
    std::string serial_no;
    DWORD major = 0;
    DWORD minor = 0;
    std::string event_kind;
    std::string sdk_time;
    bool include_fingerprints = false;
};

std::mutex queue_mutex;
std::condition_variable queue_cv;
std::deque<ReconcileJob> hris_event_queue;
std::deque<ReconcileJob> reconcile_queue;
std::vector<DeviceSession> sessions;
std::ofstream evidence_stream;
std::mutex evidence_mutex;
std::mutex peer_apply_guard_mutex;
std::map<std::string, std::chrono::steady_clock::time_point> recent_peer_apply_by_host;
bool execute_mode = true;
std::string hris_api_base;
std::string hris_api_token;
std::string min_sdk_time;

void handle_signal(int) {
    keep_running = 0;
    queue_cv.notify_all();
}

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

std::string minor_name(DWORD minor) {
    switch (minor) {
        case 80: return "OBSERVED_OPERATION_MINOR_80";
        case 112: return "OBSERVED_OPERATION_MINOR_112";
        case 121: return "OBSERVED_OPERATION_MINOR_121";
        case 122: return "OBSERVED_OPERATION_MINOR_122";
        case MINOR_ADD_FINGER_BY_CARD: return "MINOR_ADD_FINGER_BY_CARD";
        case MINOR_ADD_FINGER_BY_EMPLOYEE_NO: return "MINOR_ADD_FINGER_BY_EMPLOYEE_NO";
        case MINOR_MOD_FINGER_BY_CARD: return "MINOR_MOD_FINGER_BY_CARD";
        case MINOR_MOD_FINGER_BY_EMPLOYEE_NO: return "MINOR_MOD_FINGER_BY_EMPLOYEE_NO";
        case MINOR_DEL_FINGER: return "MINOR_DEL_FINGER";
        case MINOR_CLR_FINGER_BY_READER: return "MINOR_CLR_FINGER_BY_READER";
        case MINOR_CLR_FINGER_BY_CARD: return "MINOR_CLR_FINGER_BY_CARD";
        case MINOR_CLR_FINGER_BY_EMPLOYEE_ON: return "MINOR_CLR_FINGER_BY_EMPLOYEE_ON";
        case MINOR_ADD_CARD: return "MINOR_ADD_CARD";
        case MINOR_MOD_CARD: return "MINOR_MOD_CARD";
        case MINOR_ADD_CARD_INFO: return "MINOR_ADD_CARD_INFO";
        case MINOR_MODIFY_CARD_INFO: return "MINOR_MODIFY_CARD_INFO";
        case MINOR_DELETE_CARD_INFO: return "MINOR_DELETE_CARD_INFO";
        case MINOR_CLR_CARD: return "MINOR_CLR_CARD";
        case MINOR_CLR_CARD_BY_CARD_OR_EMPLOYEE: return "MINOR_CLR_CARD_BY_CARD_OR_EMPLOYEE";
        case MINOR_ADD_USER_INFO: return "MINOR_ADD_USER_INFO";
        case MINOR_MODIFY_USER_INFO: return "MINOR_MODIFY_USER_INFO";
        case MINOR_CLR_USER_INFO: return "MINOR_CLR_USER_INFO";
        case MINOR_FINGERPRINT_COMPARE_PASS: return "MINOR_FINGERPRINT_COMPARE_PASS";
        case MINOR_FINGERPRINT_COMPARE_FAIL: return "MINOR_FINGERPRINT_COMPARE_FAIL";
        case MINOR_FINGERPRINT_INEXISTENCE: return "MINOR_FINGERPRINT_INEXISTENCE";
        case MINOR_CARD_FINGERPRINT_VERIFY_PASS: return "MINOR_CARD_FINGERPRINT_VERIFY_PASS";
        case MINOR_CARD_FINGERPRINT_VERIFY_FAIL: return "MINOR_CARD_FINGERPRINT_VERIFY_FAIL";
        default: return "UNKNOWN_MINOR";
    }
}

bool is_fingerprint_management_minor(DWORD minor) {
    return minor == MINOR_ADD_FINGER_BY_CARD ||
           minor == MINOR_ADD_FINGER_BY_EMPLOYEE_NO ||
           minor == MINOR_MOD_FINGER_BY_CARD ||
           minor == MINOR_MOD_FINGER_BY_EMPLOYEE_NO ||
           minor == MINOR_DEL_FINGER ||
           minor == MINOR_CLR_FINGER_BY_READER ||
           minor == MINOR_CLR_FINGER_BY_CARD ||
           minor == MINOR_CLR_FINGER_BY_EMPLOYEE_ON;
}

bool is_user_management_minor(DWORD minor) {
    return minor == MINOR_ADD_USER_INFO ||
           minor == MINOR_MODIFY_USER_INFO ||
           minor == MINOR_CLR_USER_INFO;
}

bool is_observed_operation_sync_minor(DWORD minor) {
    return minor == 80 || minor == 112 || minor == 121 || minor == 122;
}

bool is_card_management_minor(DWORD minor) {
    return minor == MINOR_ADD_CARD ||
           minor == MINOR_MOD_CARD ||
           minor == MINOR_ADD_CARD_INFO ||
           minor == MINOR_MODIFY_CARD_INFO ||
           minor == MINOR_DELETE_CARD_INFO ||
           minor == MINOR_CLR_CARD ||
           minor == MINOR_CLR_CARD_BY_CARD_OR_EMPLOYEE;
}

bool is_user_delete_minor(DWORD minor) {
    return minor == MINOR_CLR_USER_INFO;
}

bool is_fingerprint_delete_minor(DWORD minor) {
    return minor == MINOR_DEL_FINGER ||
           minor == MINOR_CLR_FINGER_BY_READER ||
           minor == MINOR_CLR_FINGER_BY_CARD ||
           minor == MINOR_CLR_FINGER_BY_EMPLOYEE_ON;
}

std::string classify_event(DWORD major, DWORD minor) {
    if (major == MAJOR_OPERATION && is_fingerprint_management_minor(minor)) {
        return "biometric_fingerprint_management";
    }
    if (major == MAJOR_OPERATION && is_card_management_minor(minor)) {
        return "biometric_card_management";
    }
    if (major == MAJOR_OPERATION && is_user_management_minor(minor)) {
        return "biometric_user_management";
    }
    if (major == MAJOR_OPERATION && is_observed_operation_sync_minor(minor)) {
        return "biometric_operation_sync";
    }
    if (minor == MINOR_FINGERPRINT_COMPARE_PASS ||
        minor == MINOR_CARD_FINGERPRINT_VERIFY_PASS) {
        return "attendance_fingerprint_success";
    }
    if (minor == MINOR_FINGERPRINT_COMPARE_FAIL ||
        minor == MINOR_CARD_FINGERPRINT_VERIFY_FAIL ||
        minor == MINOR_FINGERPRINT_INEXISTENCE) {
        return "attendance_fingerprint_failed";
    }
    return "acs_event";
}

bool should_queue_reconcile(DWORD major, DWORD minor) {
    return major == MAJOR_OPERATION &&
           (is_fingerprint_management_minor(minor) ||
            is_card_management_minor(minor) ||
            is_user_management_minor(minor) ||
            is_observed_operation_sync_minor(minor));
}

bool should_full_mirror_reconcile(const ReconcileJob &job) {
    return job.major == MAJOR_OPERATION &&
           (job.employee_no.empty() || is_observed_operation_sync_minor(job.minor));
}

void mark_recent_peer_apply(const std::string &host) {
    if (host.empty()) {
        return;
    }
    std::lock_guard<std::mutex> lock(peer_apply_guard_mutex);
    recent_peer_apply_by_host[host] = std::chrono::steady_clock::now();
}

bool should_suppress_recent_peer_apply(const std::string &host, DWORD major, DWORD minor) {
    if (host.empty() || major != MAJOR_OPERATION || !is_observed_operation_sync_minor(minor)) {
        return false;
    }

    std::lock_guard<std::mutex> lock(peer_apply_guard_mutex);
    const auto found = recent_peer_apply_by_host.find(host);
    if (found == recent_peer_apply_by_host.end()) {
        return false;
    }

    const auto age = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - found->second);
    if (age > std::chrono::seconds(20)) {
        recent_peer_apply_by_host.erase(found);
        return false;
    }
    return true;
}

void enable_default_card_reader(BYTE *readers, size_t count) {
    if (readers == nullptr || count == 0) {
        return;
    }
    readers[0] = 1;
}

DeviceSession *find_session_by_host(const std::string &host) {
    for (auto &session : sessions) {
        if (session.config.host == host) {
            return &session;
        }
    }
    return nullptr;
}

void queue_reconcile(const ReconcileJob &job) {
    {
        std::lock_guard<std::mutex> lock(queue_mutex);
        reconcile_queue.push_back(job);
    }
    queue_cv.notify_one();
    emit_json({
        {"event", "reconcile_queued"},
        {"sourceDeviceId", job.source_device_id},
        {"sourceHost", job.source_host},
        {"employeeNo", job.employee_no},
        {"minor", minor_name(job.minor)},
        {"includeFingerprints", job.include_fingerprints ? "true" : "false"},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });
}

void queue_hris_device_event(const ReconcileJob &job) {
    {
        std::lock_guard<std::mutex> lock(queue_mutex);
        hris_event_queue.push_back(job);
    }
    queue_cv.notify_one();
    emit_json({
        {"event", "hris_device_event_queued"},
        {"sourceDeviceId", job.source_device_id},
        {"sourceHost", job.source_host},
        {"employeeNo", job.employee_no},
        {"minor", std::to_string(job.minor)},
        {"minorName", minor_name(job.minor)},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });
}

void CALLBACK alarm_callback(
    LONG command,
    NET_DVR_ALARMER *alarmer,
    char *alarm_info,
    DWORD buffer_length,
    void *) {
    std::string host;
    if (alarmer != nullptr) {
        host = alarmer->sDeviceIP;
    }

    if (command != COMM_ALARM_ACS || alarm_info == nullptr || buffer_length < sizeof(NET_DVR_ACS_ALARM_INFO)) {
        emit_json({
            {"event", "alarm_callback_ignored"},
            {"command", std::to_string(command)},
            {"sourceHost", host},
            {"bufferLength", std::to_string(buffer_length)}
        });
        return;
    }

    auto *acs = reinterpret_cast<NET_DVR_ACS_ALARM_INFO *>(alarm_info);
    const std::string employee_no =
        acs->struAcsEventInfo.dwEmployeeNo > 0 ? std::to_string(acs->struAcsEventInfo.dwEmployeeNo) : "";
    const std::string card_no =
        fixed_bytes_to_string(acs->struAcsEventInfo.byCardNo, ACS_CARD_NO_LEN);
    const std::string kind = classify_event(acs->dwMajor, acs->dwMinor);
    const std::string source_device_id =
        find_session_by_host(host) != nullptr ? find_session_by_host(host)->config.hris_device_id : "";
    const std::string door_no = std::to_string(acs->struAcsEventInfo.dwDoorNo);
    const std::string verify_mode =
        acs->struAcsEventInfo.byCardReaderKind == 4 ? "fingerprint" : "";
    const std::string serial_no = std::to_string(acs->struAcsEventInfo.dwSerialNo);

    emit_json({
        {"event", "acs_alarm_received"},
        {"sourceDeviceId", source_device_id},
        {"sourceHost", host},
        {"major", std::to_string(acs->dwMajor)},
        {"minor", minor_name(acs->dwMinor)},
        {"eventKind", kind},
        {"employeeNo", employee_no},
        {"cardNo", card_no},
        {"doorNo", door_no},
        {"verifyMode", verify_mode},
        {"serialNo", serial_no},
        {"sdkTime", sdk_time_to_string(acs->struTime)}
    });

    ReconcileJob job;
    job.source_host = host;
    job.source_device_id = source_device_id;
    job.employee_no = employee_no;
    job.card_no = card_no;
    job.door_no = door_no;
    job.verify_mode = verify_mode;
    job.serial_no = serial_no;
    job.major = acs->dwMajor;
    job.minor = acs->dwMinor;
    job.event_kind = kind;
    job.sdk_time = sdk_time_to_string(acs->struTime);

    if (!min_sdk_time.empty() && job.sdk_time < min_sdk_time) {
        emit_json({
            {"event", "acs_alarm_ignored_before_min_sdk_time"},
            {"sourceDeviceId", source_device_id},
            {"sourceHost", job.source_host},
            {"employeeNo", job.employee_no},
            {"serialNo", job.serial_no},
            {"major", std::to_string(job.major)},
            {"minor", std::to_string(job.minor)},
            {"sdkTime", job.sdk_time},
            {"minSdkTime", min_sdk_time}
        });
        return;
    }

    job.include_fingerprints = is_fingerprint_management_minor(acs->dwMinor);
    queue_hris_device_event(job);

    if (!should_queue_reconcile(acs->dwMajor, acs->dwMinor)) {
        return;
    }
    if (should_suppress_recent_peer_apply(job.source_host, job.major, job.minor)) {
        emit_json({
            {"event", "reconcile_suppressed_recent_peer_apply"},
            {"sourceDeviceId", job.source_device_id},
            {"sourceHost", job.source_host},
            {"minor", minor_name(job.minor)}
        });
        return;
    }
    queue_reconcile(job);
}

std::string build_status_contract_json(const ReconcileJob &job, const std::string &status) {
    std::ostringstream body;
    body << "{"
         << "\"source\":\"EN_HCNETSDK_ALARM\","
         << "\"mode\":\"" << (execute_mode ? "execute" : "dry-run") << "\","
         << "\"status\":\"" << json_escape(status) << "\","
         << "\"sourceDeviceId\":\"" << json_escape(job.source_device_id) << "\","
         << "\"employeeNo\":\"" << json_escape(job.employee_no) << "\","
         << "\"cardNo\":\"" << json_escape(job.card_no) << "\","
         << "\"eventKind\":\"" << json_escape(job.event_kind) << "\","
         << "\"minor\":\"" << json_escape(minor_name(job.minor)) << "\","
         << "\"sdkTime\":\"" << json_escape(job.sdk_time) << "\","
         << "\"rawFingerprintTemplateStored\":false"
         << "}";
    return body.str();
}

bool stdxml_json_request(DeviceSession &session, const std::string &method_and_path, const std::string &body, std::string *response) {
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

std::string build_hikvision_callback_json(const ReconcileJob &job) {
    std::ostringstream body;
    body << "{"
         << "\"source\":\"EN_HCNETSDK_ALARM\","
         << "\"deviceId\":\"" << json_escape(job.source_device_id) << "\","
         << "\"deviceIP\":\"" << json_escape(job.source_host) << "\","
         << "\"ipAddress\":\"" << json_escape(job.source_host) << "\","
         << "\"time\":\"" << json_escape(job.sdk_time) << "\","
         << "\"dateTime\":\"" << json_escape(job.sdk_time) << "\","
         << "\"employeeNo\":\"" << json_escape(job.employee_no) << "\","
         << "\"employeeNoString\":\"" << json_escape(job.employee_no) << "\","
         << "\"cardNo\":\"" << json_escape(job.card_no) << "\","
         << "\"major\":" << job.major << ","
         << "\"minor\":" << job.minor << ","
         << "\"actionCode\":\"" << json_escape(minor_name(job.minor)) << "\","
         << "\"eventKind\":\"" << json_escape(job.event_kind) << "\","
         << "\"doorNo\":\"" << json_escape(job.door_no) << "\","
         << "\"verifyMode\":\"" << json_escape(job.verify_mode) << "\","
         << "\"currentVerifyMode\":\"" << json_escape(job.verify_mode) << "\","
         << "\"serialNo\":\"" << json_escape(job.serial_no) << "\","
         << "\"rawAlarm\":{"
         << "\"deviceIp\":\"" << json_escape(job.source_host) << "\","
         << "\"sourceDeviceId\":\"" << json_escape(job.source_device_id) << "\","
         << "\"rawFingerprintTemplateStored\":false"
         << "}"
         << "}";
    return body.str();
}

bool read_source_user(DeviceSession &source, const ReconcileJob &job, std::string *user_json) {
    if (job.employee_no.empty()) {
        emit_json({
            {"event", "source_user_read_skipped"},
            {"reason", "missing_employee_no"},
            {"sourceDeviceId", source.config.hris_device_id}
        });
        return false;
    }

    std::ostringstream body;
    body << "{\"UserInfoSearchCond\":{\"searchID\":\"pt-biometric-"
         << json_escape(job.employee_no)
         << "\",\"searchResultPosition\":0,\"maxResults\":1,\"EmployeeNoList\":[{\"employeeNo\":\""
         << json_escape(job.employee_no)
         << "\"}]}}";

    std::string response;
    const bool ok = stdxml_json_request(
        source,
        "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
        body.str(),
        &response);

    emit_json({
        {"event", "source_user_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", ok ? "true" : "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });

    if (ok && user_json != nullptr) {
        *user_json = response;
    }
    return ok;
}

std::string extract_first_object_for_key(const std::string &json, const std::string &key) {
    const size_t key_pos = json.find(key);
    if (key_pos == std::string::npos) {
        return "";
    }

    const size_t object_start = json.find('{', key_pos + key.size());
    if (object_start == std::string::npos) {
        return "";
    }

    int depth = 0;
    bool in_string = false;
    bool escaped = false;
    for (size_t index = object_start; index < json.size(); ++index) {
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
                return json.substr(object_start, index - object_start + 1);
            }
        }
    }
    return "";
}

std::string build_user_setup_payload_from_search_response(const std::string &response) {
    const std::string user_object = extract_first_object_for_key(response, "\"UserInfo\"");
    if (user_object.empty()) {
        return "";
    }
    return std::string("{\"UserInfo\":") + user_object + "}";
}

std::set<std::string> extract_employee_numbers_from_search_response(const std::string &response) {
    std::set<std::string> employee_numbers;
    static const std::regex employee_regex("\"employeeNo\"\\s*:\\s*\"([^\"]+)\"");
    for (std::sregex_iterator it(response.begin(), response.end(), employee_regex), end; it != end; ++it) {
        const std::string employee_no = (*it)[1].str();
        if (!employee_no.empty()) {
            employee_numbers.insert(employee_no);
        }
    }
    return employee_numbers;
}

std::vector<std::string> read_source_employee_numbers(DeviceSession &source) {
    constexpr int page_size = 64;
    std::set<std::string> employee_numbers;

    for (int offset = 0; offset < 1024; offset += page_size) {
        std::ostringstream body;
        body << "{\"UserInfoSearchCond\":{\"searchID\":\"pt-full-mirror-" << offset
             << "\",\"searchResultPosition\":" << offset
             << ",\"maxResults\":" << page_size << "}}";

        std::string response;
        const bool ok = stdxml_json_request(
            source,
            "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
            body.str(),
            &response);

        if (!ok) {
            emit_json({
                {"event", "source_user_inventory_read"},
                {"sourceDeviceId", source.config.hris_device_id},
                {"ok", "false"},
                {"offset", std::to_string(offset)},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
            break;
        }

        const std::set<std::string> page_employee_numbers =
            extract_employee_numbers_from_search_response(response);
        employee_numbers.insert(page_employee_numbers.begin(), page_employee_numbers.end());
        emit_json({
            {"event", "source_user_inventory_read"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"ok", "true"},
            {"offset", std::to_string(offset)},
            {"pageEmployees", std::to_string(page_employee_numbers.size())}
        });

        if (page_employee_numbers.size() < page_size) {
            break;
        }
    }

    return std::vector<std::string>(employee_numbers.begin(), employee_numbers.end());
}

struct FingerprintReadContext {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    bool failed = false;
    bool saw_failure = false;
    int records = 0;
    std::vector<NET_DVR_FINGER_PRINT_CFG_V50> templates;
};

void CALLBACK fingerprint_callback(DWORD type, void *buffer, DWORD buffer_length, void *user_data) {
    auto *ctx = reinterpret_cast<FingerprintReadContext *>(user_data);
    if (ctx == nullptr) {
        return;
    }

    std::lock_guard<std::mutex> lock(ctx->mutex);
    if (type == NET_SDK_CALLBACK_TYPE_DATA && buffer != nullptr &&
        buffer_length >= sizeof(NET_DVR_FINGER_PRINT_CFG_V50)) {
        NET_DVR_FINGER_PRINT_CFG_V50 record{};
        std::memcpy(&record, buffer, sizeof(record));
        if (record.dwFingerPrintLen > 0) {
            ctx->templates.push_back(record);
            ctx->records += 1;
        }
    } else if (type == NET_SDK_CALLBACK_TYPE_DATA && buffer != nullptr &&
        buffer_length >= sizeof(NET_DVR_FINGER_PRINT_STATUS_V50)) {
        NET_DVR_FINGER_PRINT_STATUS_V50 status{};
        std::memcpy(&status, buffer, sizeof(status));
        const bool reader_failed =
            status.dwCardReaderNo < MAX_CARD_READER_NUM_512 &&
            status.byCardReaderRecvStatus[status.dwCardReaderNo] != 0 &&
            status.byCardReaderRecvStatus[status.dwCardReaderNo] != 1;
        if (status.byRecvStatus != 0 || reader_failed) {
            ctx->saw_failure = true;
        }
    } else if (type == NET_SDK_CALLBACK_TYPE_STATUS) {
        if (buffer != nullptr && buffer_length >= sizeof(DWORD)) {
            DWORD status = 0;
            std::memcpy(&status, buffer, sizeof(status));
            if (status == NET_SDK_REMOTE_CONFIG_STATUS_SUCCESS) {
                ctx->done = true;
            } else if (status == NET_SDK_REMOTE_CONFIG_STATUS_FAILED) {
                ctx->failed = true;
                ctx->done = true;
            }
        }
    }
    ctx->cv.notify_all();
}

std::vector<NET_DVR_FINGER_PRINT_CFG_V50> read_source_fingerprints(DeviceSession &source, const ReconcileJob &job) {
    std::vector<NET_DVR_FINGER_PRINT_CFG_V50> empty;
    if (job.employee_no.empty()) {
        emit_json({
            {"event", "source_fingerprint_read_skipped"},
            {"reason", "missing_employee_no"},
            {"sourceDeviceId", source.config.hris_device_id}
        });
        return empty;
    }

    NET_DVR_FINGER_PRINT_INFO_COND_V50 cond{};
    cond.dwSize = sizeof(cond);
    cond.dwFingerPrintNum = 0xffffffff;
    cond.byFingerPrintID = 0xff;
    std::strncpy(reinterpret_cast<char *>(cond.byEmployeeNo), job.employee_no.c_str(), NET_SDK_EMPLOYEE_NO_LEN - 1);
    enable_default_card_reader(cond.byEnableCardReader, sizeof(cond.byEnableCardReader));

    FingerprintReadContext ctx;
    const LONG handle = NET_DVR_StartRemoteConfig(
        source.user_id,
        NET_DVR_GET_FINGERPRINT_CFG_V50,
        &cond,
        sizeof(cond),
        fingerprint_callback,
        &ctx);

    if (handle < 0) {
        emit_json({
            {"event", "source_fingerprint_read"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"ok", "false"},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        return empty;
    }

    {
        std::unique_lock<std::mutex> lock(ctx.mutex);
        ctx.cv.wait_for(lock, std::chrono::seconds(10), [&ctx] { return ctx.done; });
    }
    NET_DVR_StopRemoteConfig(handle);

    emit_json({
        {"event", "source_fingerprint_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", ctx.failed ? "false" : "true"},
        {"templateCount", std::to_string(ctx.records)},
        {"rawFingerprintTemplateStored", "false"}
    });

    return ctx.templates;
}

bool write_peer_user(DeviceSession &target, const ReconcileJob &job, const std::string &user_json) {
    const std::string setup_payload = build_user_setup_payload_from_search_response(user_json);
    if (setup_payload.empty()) {
        emit_json({
            {"event", "peer_user_write_skipped"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"reason", "invalid_source_user_payload"}
        });
        return false;
    }

    if (!execute_mode) {
        emit_json({
            {"event", "peer_user_write_preview"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"wouldCall", "PUT /ISAPI/AccessControl/UserInfo/SetUp?format=json"}
        });
        return true;
    }

    std::string response;
    const bool ok = stdxml_json_request(
        target,
        "PUT /ISAPI/AccessControl/UserInfo/SetUp?format=json",
        setup_payload,
        &response);

    emit_json({
        {"event", "peer_user_write"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", ok ? "true" : "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    if (ok) {
        mark_recent_peer_apply(target.config.host);
    }
    return ok;
}

bool write_peer_fingerprints(
    DeviceSession &target,
    const ReconcileJob &job,
    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> &templates) {
    if (templates.empty()) {
        emit_json({
            {"event", "peer_fingerprint_write_skipped"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"reason", "no_source_templates"}
        });
        return true;
    }

    if (!execute_mode) {
        emit_json({
            {"event", "peer_fingerprint_write_preview"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"templateCount", std::to_string(templates.size())},
            {"rawFingerprintTemplateStored", "false"}
        });
        return true;
    }

    NET_DVR_FINGER_PRINT_INFO_COND_V50 cond{};
    cond.dwSize = sizeof(cond);
    cond.dwFingerPrintNum = static_cast<DWORD>(templates.size());
    cond.byFingerPrintID = 0xff;
    std::strncpy(reinterpret_cast<char *>(cond.byEmployeeNo), job.employee_no.c_str(), NET_SDK_EMPLOYEE_NO_LEN - 1);
    enable_default_card_reader(cond.byEnableCardReader, sizeof(cond.byEnableCardReader));

    FingerprintReadContext ctx;
    const LONG handle = NET_DVR_StartRemoteConfig(
        target.user_id,
        NET_DVR_SET_FINGERPRINT_CFG_V50,
        &cond,
        sizeof(cond),
        fingerprint_callback,
        &ctx);

    if (handle < 0) {
        emit_json({
            {"event", "peer_fingerprint_write"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"ok", "false"},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        return false;
    }

    bool ok = true;
    for (auto record : templates) {
        record.dwSize = sizeof(record);
        std::strncpy(reinterpret_cast<char *>(record.byEmployeeNo), job.employee_no.c_str(), NET_SDK_EMPLOYEE_NO_LEN - 1);
        enable_default_card_reader(record.byEnableCardReader, sizeof(record.byEnableCardReader));
        const BOOL send_ok = NET_DVR_SendRemoteConfig(
            handle,
            3,
            reinterpret_cast<char *>(&record),
            sizeof(record));
        if (send_ok != TRUE) {
            ok = false;
            emit_json({
                {"event", "peer_fingerprint_write_status"},
                {"targetDeviceId", target.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"sendStatus", "send_remote_config_failed"},
                {"recvStatus", "unknown"},
                {"fingerPrintId", std::to_string(record.byFingerPrintID)},
                {"attempts", "1"},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
        }
    }
    {
        std::unique_lock<std::mutex> lock(ctx.mutex);
        ctx.cv.wait_for(lock, std::chrono::seconds(10), [&ctx] { return ctx.done; });
    }
    NET_DVR_StopRemoteConfig(handle);
    ok = ok && !ctx.failed && !ctx.saw_failure;
    if (!ok) {
        const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> verified_templates =
            read_source_fingerprints(target, job);
        if (verified_templates.size() >= templates.size() && !verified_templates.empty()) {
            ok = true;
            emit_json({
                {"event", "peer_fingerprint_write_verified_after_error"},
                {"targetDeviceId", target.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"verifiedTemplateCount", std::to_string(verified_templates.size())}
            });
        }
    }

    emit_json({
        {"event", "peer_fingerprint_write"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", ok ? "true" : "false"},
        {"templateCount", std::to_string(templates.size())},
        {"rawFingerprintTemplateStored", "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    if (ok) {
        mark_recent_peer_apply(target.config.host);
    }
    return ok;
}

bool delete_peer_user(DeviceSession &target, const ReconcileJob &job) {
    if (job.employee_no.empty()) {
        emit_json({
            {"event", "peer_user_delete_skipped"},
            {"targetDeviceId", target.config.hris_device_id},
            {"reason", "missing_employee_no"}
        });
        return false;
    }

    if (!execute_mode) {
        emit_json({
            {"event", "peer_user_delete_preview"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"wouldCall", "POST /ISAPI/AccessControl/UserInfoDetail/Delete?format=json"}
        });
        return true;
    }

    std::ostringstream body;
    body << "{\"UserInfoDetail\":{\"mode\":\"byEmployeeNo\",\"EmployeeNoList\":[{\"employeeNo\":\""
         << json_escape(job.employee_no)
         << "\"}]}}";

    std::string response;
    bool ok = stdxml_json_request(
        target,
        "POST /ISAPI/AccessControl/UserInfoDetail/Delete?format=json",
        body.str(),
        &response);

    if (!ok) {
        std::ostringstream fallback;
        fallback << "{\"UserInfo\":{\"employeeNo\":\"" << json_escape(job.employee_no) << "\",\"deleteUser\":true}}";
        ok = stdxml_json_request(
            target,
            "PUT /ISAPI/AccessControl/UserInfo/SetUp?format=json",
            fallback.str(),
            &response);
    }

    emit_json({
        {"event", "peer_user_delete"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", ok ? "true" : "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    if (ok) {
        mark_recent_peer_apply(target.config.host);
    }
    return ok;
}

bool delete_peer_fingerprints(DeviceSession &target, const ReconcileJob &job) {
    if (job.employee_no.empty()) {
        emit_json({
            {"event", "peer_fingerprint_delete_skipped"},
            {"targetDeviceId", target.config.hris_device_id},
            {"reason", "missing_employee_no"}
        });
        return false;
    }

    if (!execute_mode) {
        emit_json({
            {"event", "peer_fingerprint_delete_preview"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"wouldCall", "NET_DVR_DEL_FINGERPRINT_CFG_V50"},
            {"rawFingerprintTemplateStored", "false"}
        });
        return true;
    }

    NET_DVR_FINGER_PRINT_INFO_CTRL_V50 cond{};
    cond.dwSize = sizeof(cond);
    cond.byMode = 0;
    std::strncpy(
        reinterpret_cast<char *>(cond.struProcessMode.struByCard.byEmployeeNo),
        job.employee_no.c_str(),
        NET_SDK_EMPLOYEE_NO_LEN - 1);
    enable_default_card_reader(
        cond.struProcessMode.struByCard.byEnableCardReader,
        sizeof(cond.struProcessMode.struByCard.byEnableCardReader));
    for (size_t i = 0; i < sizeof(cond.struProcessMode.struByCard.byFingerPrintID); ++i) {
        cond.struProcessMode.struByCard.byFingerPrintID[i] = 1;
    }

    FingerprintReadContext ctx;
    const LONG handle = NET_DVR_StartRemoteConfig(
        target.user_id,
        NET_DVR_DEL_FINGERPRINT_CFG_V50,
        &cond,
        sizeof(cond),
        fingerprint_callback,
        &ctx);

    bool ok = handle >= 0;
    if (handle >= 0) {
        {
            std::unique_lock<std::mutex> lock(ctx.mutex);
            ctx.cv.wait_for(lock, std::chrono::seconds(10), [&ctx] { return ctx.done; });
        }
        NET_DVR_StopRemoteConfig(handle);
        ok = !ctx.failed;
    }

    emit_json({
        {"event", "peer_fingerprint_delete"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", ok ? "true" : "false"},
        {"rawFingerprintTemplateStored", "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    if (ok) {
        mark_recent_peer_apply(target.config.host);
    }
    return ok;
}

void post_hris_contract_preview(const ReconcileJob &job, const std::string &status) {
    const std::string contract = build_status_contract_json(job, status);
    emit_json({
        {"event", "hris_contract_preview"},
        {"apiBase", hris_api_base},
        {"contractPath", "/api/device/biometric-sync/reconcile"},
        {"body", contract}
    });
}

std::string shell_quote(const std::string &value) {
    std::string quoted = "'";
    for (const char c : value) {
        if (c == '\'') {
            quoted += "'\\''";
        } else {
            quoted += c;
        }
    }
    quoted += "'";
    return quoted;
}

bool curl_post_json(const std::string &url, const std::string &body, const std::string &event_name) {
    char body_template[] = "/tmp/project-truth-hikvision-body-XXXXXX";
    const int body_fd = mkstemp(body_template);
    if (body_fd < 0) {
        emit_json({{"event", event_name}, {"ok", "false"}, {"reason", "body_tempfile_failed"}});
        return false;
    }
    FILE *body_file = fdopen(body_fd, "w");
    if (body_file == nullptr) {
        close(body_fd);
        std::remove(body_template);
        emit_json({{"event", event_name}, {"ok", "false"}, {"reason", "body_fdopen_failed"}});
        return false;
    }
    std::fwrite(body.data(), 1, body.size(), body_file);
    std::fclose(body_file);

    char config_template[] = "/tmp/project-truth-hikvision-curl-XXXXXX";
    const int config_fd = mkstemp(config_template);
    if (config_fd < 0) {
        std::remove(body_template);
        emit_json({{"event", event_name}, {"ok", "false"}, {"reason", "curl_config_tempfile_failed"}});
        return false;
    }
    FILE *config_file = fdopen(config_fd, "w");
    if (config_file == nullptr) {
        close(config_fd);
        std::remove(body_template);
        std::remove(config_template);
        emit_json({{"event", event_name}, {"ok", "false"}, {"reason", "curl_config_fdopen_failed"}});
        return false;
    }

    std::fprintf(config_file, "url = \"%s\"\n", url.c_str());
    std::fprintf(config_file, "request = \"POST\"\n");
    std::fprintf(config_file, "header = \"Content-Type: application/json\"\n");
    if (!hris_api_token.empty()) {
        std::fprintf(config_file, "header = \"Authorization: Bearer %s\"\n", hris_api_token.c_str());
    }
    std::fprintf(config_file, "data = \"@%s\"\n", body_template);
    std::fclose(config_file);

    const std::string command = "curl --fail --silent --show-error --config " + shell_quote(config_template) + " >/dev/null";
    const int rc = std::system(command.c_str());
    std::remove(body_template);
    std::remove(config_template);
    emit_json({{"event", event_name}, {"ok", rc == 0 ? "true" : "false"}, {"exitCode", std::to_string(rc)}});
    return rc == 0;
}

bool post_hikvision_callback(const ReconcileJob &job) {
    const std::string body = build_hikvision_callback_json(job);
    if (hris_api_base.empty()) {
        emit_json({
            {"event", "hikvision_callback_post_skipped"},
            {"reason", "missing_hris_api_base"},
            {"body", body}
        });
        return false;
    }
    if (!execute_mode) {
        emit_json({
            {"event", "hikvision_callback_preview"},
            {"apiBase", hris_api_base},
            {"contractPath", "/api/hikvision/callback"},
            {"body", body}
        });
        return true;
    }

    const std::string url = hris_api_base + "/api/hikvision/callback";
    const bool ok = curl_post_json(url, body, "hikvision_callback_post");
    emit_json({
        {"event", "hikvision_callback_post_result"},
        {"sourceDeviceId", job.source_device_id},
        {"sourceHost", job.source_host},
        {"employeeNo", job.employee_no},
        {"serialNo", job.serial_no},
        {"ok", ok ? "true" : "false"}
    });
    return ok;
}

bool post_hris_contract(const ReconcileJob &job, const std::string &status) {
    const std::string contract = build_status_contract_json(job, status);
    if (hris_api_base.empty()) {
        post_hris_contract_preview(job, status);
        emit_json({
            {"event", "hris_contract_post_skipped"},
            {"reason", "missing_hris_api_base"}
        });
        return false;
    }
    if (!execute_mode) {
        post_hris_contract_preview(job, status);
        return true;
    }

    const std::string url = hris_api_base + "/api/device/biometric-sync/reconcile";
    const bool ok = curl_post_json(url, contract, "hris_contract_post");
    emit_json({
        {"event", "hris_contract_post"},
        {"apiBase", hris_api_base},
        {"ok", ok ? "true" : "false"}
    });
    return ok;
}

void process_reconcile_job(const ReconcileJob &job) {
    DeviceSession *source = find_session_by_host(job.source_host);
    if (source == nullptr && !job.source_device_id.empty()) {
        for (auto &session : sessions) {
            if (session.config.hris_device_id == job.source_device_id) {
                source = &session;
                break;
            }
        }
    }

    if (source == nullptr) {
        emit_json({
            {"event", "reconcile_failed"},
            {"reason", "source_session_not_found"},
            {"sourceHost", job.source_host},
            {"sourceDeviceId", job.source_device_id}
        });
        return;
    }

    const bool user_delete = is_user_delete_minor(job.minor);
    const bool fingerprint_delete = is_fingerprint_delete_minor(job.minor);
    int peer_count = 0;
    int peer_write_count = 0;
    if (should_full_mirror_reconcile(job)) {
        const std::vector<std::string> employee_numbers = read_source_employee_numbers(*source);
        int mirrored_users = 0;

        for (const auto &employee_no : employee_numbers) {
            ReconcileJob mirror_job = job;
            mirror_job.employee_no = employee_no;
            mirror_job.include_fingerprints = true;

            std::string mirror_user_json;
            if (!read_source_user(*source, mirror_job, &mirror_user_json)) {
                continue;
            }
            const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> mirror_fingerprints =
                read_source_fingerprints(*source, mirror_job);

            for (auto &target : sessions) {
                if (target.config.host == source->config.host || !target.config.biometric_peer) {
                    continue;
                }
                peer_count += 1;
                if (write_peer_user(target, mirror_job, mirror_user_json)) {
                    peer_write_count += 1;
                }
                write_peer_fingerprints(target, mirror_job, mirror_fingerprints);
            }
            mirrored_users += 1;
        }

        post_hris_contract(job, "mirrored");
        emit_json({
            {"event", "reconcile_full_mirror_completed"},
            {"sourceDeviceId", source->config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"mirroredUsers", std::to_string(mirrored_users)},
            {"peerDevices", std::to_string(peer_count)},
            {"peerUserWrites", std::to_string(peer_write_count)},
            {"mode", execute_mode ? "execute" : "dry-run"}
        });
        return;
    }

    std::string user_json;
    const bool user_ok = user_delete ? true : read_source_user(*source, job, &user_json);
    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> fingerprints =
        job.include_fingerprints && !fingerprint_delete
            ? read_source_fingerprints(*source, job)
            : std::vector<NET_DVR_FINGER_PRINT_CFG_V50>{};

    for (auto &target : sessions) {
        if (target.config.host == source->config.host || !target.config.biometric_peer) {
            continue;
        }
        peer_count += 1;
        if (user_delete ? delete_peer_user(target, job) : (user_ok && write_peer_user(target, job, user_json))) {
            peer_write_count += 1;
        }
        if (fingerprint_delete) {
            delete_peer_fingerprints(target, job);
        } else if (job.include_fingerprints) {
            write_peer_fingerprints(target, job, fingerprints);
        }
    }

    post_hris_contract(job, user_delete ? "deleted" : user_ok ? "reviewed" : "source-user-read-failed");
    emit_json({
        {"event", "reconcile_completed"},
        {"sourceDeviceId", source->config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"peerDevices", std::to_string(peer_count)},
        {"peerUserWrites", std::to_string(peer_write_count)},
        {"sourceTemplateCount", std::to_string(fingerprints.size())},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });
}

void worker_loop() {
    while (keep_running) {
        ReconcileJob hris_job;
        bool has_hris_job = false;
        ReconcileJob reconcile_job;
        bool has_reconcile_job = false;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            queue_cv.wait_for(lock, std::chrono::milliseconds(500), [] {
                return !hris_event_queue.empty() || !reconcile_queue.empty() || !keep_running;
            });
            if (!hris_event_queue.empty()) {
                hris_job = hris_event_queue.front();
                hris_event_queue.pop_front();
                has_hris_job = true;
            }
            if (!reconcile_queue.empty()) {
                reconcile_job = reconcile_queue.front();
                reconcile_queue.pop_front();
                has_reconcile_job = true;
            }
            if (!has_hris_job && !has_reconcile_job) {
                continue;
            }
        }
        if (has_hris_job) {
            post_hikvision_callback(hris_job);
        }
        if (has_reconcile_job) {
            process_reconcile_job(reconcile_job);
        }
    }
}

bool parse_device_spec(const std::string &spec, DeviceConfig *config) {
    std::vector<std::string> parts;
    std::stringstream stream(spec);
    std::string item;
    while (std::getline(stream, item, '|')) {
        parts.push_back(item);
    }
    if (parts.size() < 7) {
        return false;
    }
    config->hris_device_id = parts[0];
    config->organization_id = parts[1];
    config->name = parts[2];
    config->host = parts[3];
    config->sdk_port = std::stoi(parts[4]);
    config->username = parts[5];
    config->password = parts[6];
    if (parts.size() >= 8) {
        config->biometric_peer = parts[7] != "false" && parts[7] != "0";
    }
    return true;
}

bool login_device(DeviceSession &session) {
    NET_DVR_USER_LOGIN_INFO login_info{};
    NET_DVR_DEVICEINFO_V40 device_info{};
    login_info.bUseAsynLogin = false;
    login_info.wPort = static_cast<WORD>(session.config.sdk_port);
    std::strncpy(login_info.sDeviceAddress, session.config.host.c_str(), NET_DVR_DEV_ADDRESS_MAX_LEN - 1);
    std::strncpy(login_info.sUserName, session.config.username.c_str(), NAME_LEN - 1);
    std::strncpy(login_info.sPassword, session.config.password.c_str(), NAME_LEN - 1);

    session.user_id = NET_DVR_Login_V40(&login_info, &device_info);
    emit_json({
        {"event", "sdk_login"},
        {"deviceId", session.config.hris_device_id},
        {"deviceName", session.config.name},
        {"host", session.config.host},
        {"sdkPort", std::to_string(session.config.sdk_port)},
        {"ok", session.user_id >= 0 ? "true" : "false"},
        {"lastError", session.user_id >= 0 ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    return session.user_id >= 0;
}

bool arm_alarm(DeviceSession &session) {
    NET_DVR_SETUPALARM_PARAM_V50 param{};
    param.dwSize = sizeof(param);
    param.byRetAlarmTypeV40 = TRUE;
    param.byRetDevInfoVersion = TRUE;
    param.byAlarmInfoType = 1;
    param.bySupport = 4;

    session.alarm_handle = NET_DVR_SetupAlarmChan_V50(session.user_id, &param, nullptr, 0);
    emit_json({
        {"event", "sdk_alarm_arm"},
        {"deviceId", session.config.hris_device_id},
        {"host", session.config.host},
        {"ok", session.alarm_handle >= 0 ? "true" : "false"},
        {"alarmHandle", std::to_string(session.alarm_handle)},
        {"lastError", session.alarm_handle >= 0 ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    return session.alarm_handle >= 0;
}

void close_sessions() {
    for (auto &session : sessions) {
        if (session.alarm_handle >= 0) {
            NET_DVR_CloseAlarmChan_V30(session.alarm_handle);
            emit_json({{"event", "sdk_alarm_close"}, {"deviceId", session.config.hris_device_id}});
        }
        if (session.user_id >= 0) {
            NET_DVR_Logout_V30(session.user_id);
            emit_json({{"event", "sdk_logout"}, {"deviceId", session.config.hris_device_id}});
        }
    }
}

void usage(const char *program) {
    std::cerr
        << "Usage: " << program << " --device id|org|name|host|sdkPort|username|password[|peer] "
        << "[--device-file path] "
        << "[--device ...] [--evidence-jsonl path] [--hris-api-base url] [--hris-api-token token] "
        << "[--min-sdk-time YYYY-MM-DDTHH:MM:SS] [--execute|--dry-run] [--seconds n]\n";
}

}  // namespace

int main(int argc, char **argv) {
    int seconds = 0;
    std::vector<DeviceConfig> configs;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        auto next = [&](std::string *value) -> bool {
            if (i + 1 >= argc) {
                usage(argv[0]);
                return false;
            }
            *value = argv[++i];
            return true;
        };

        if (arg == "--device") {
            std::string value;
            if (!next(&value)) return 2;
            DeviceConfig config;
            if (!parse_device_spec(value, &config)) {
                std::cerr << "Invalid --device spec. Expected id|org|name|host|sdkPort|username|password[|peer]\n";
                return 2;
            }
            configs.push_back(config);
        } else if (arg == "--device-file") {
            std::string value;
            if (!next(&value)) return 2;
            std::ifstream device_file(value);
            if (!device_file) {
                std::cerr << "Unable to open --device-file: " << value << "\n";
                return 2;
            }
            std::string line;
            while (std::getline(device_file, line)) {
                const auto first = line.find_first_not_of(" \t\r\n");
                if (first == std::string::npos || line[first] == '#') continue;
                const auto last = line.find_last_not_of(" \t\r\n");
                const std::string spec = line.substr(first, last - first + 1);
                DeviceConfig config;
                if (!parse_device_spec(spec, &config)) {
                    std::cerr << "Invalid --device-file entry. Expected id|org|name|host|sdkPort|username|password[|peer]\n";
                    return 2;
                }
                configs.push_back(config);
            }
        } else if (arg == "--evidence-jsonl") {
            std::string value;
            if (!next(&value)) return 2;
            evidence_stream.open(value, std::ios::app);
        } else if (arg == "--hris-api-base") {
            if (!next(&hris_api_base)) return 2;
        } else if (arg == "--hris-api-token") {
            if (!next(&hris_api_token)) return 2;
        } else if (arg == "--min-sdk-time") {
            if (!next(&min_sdk_time)) return 2;
        } else if (arg == "--execute") {
            execute_mode = true;
        } else if (arg == "--dry-run") {
            execute_mode = false;
        } else if (arg == "--seconds") {
            std::string value;
            if (!next(&value)) return 2;
            seconds = std::stoi(value);
        } else {
            usage(argv[0]);
            return 2;
        }
    }

    if (configs.empty()) {
        usage(argv[0]);
        return 2;
    }

    std::signal(SIGINT, handle_signal);
    std::signal(SIGTERM, handle_signal);

    if (!NET_DVR_Init()) {
        emit_json({{"event", "sdk_init"}, {"ok", "false"}, {"lastError", std::to_string(NET_DVR_GetLastError())}});
        return 1;
    }
    emit_json({
        {"event", "sdk_init"},
        {"ok", "true"},
        {"sdkVersion", std::to_string(NET_DVR_GetSDKVersion())},
        {"sdkBuildVersion", std::to_string(NET_DVR_GetSDKBuildVersion())},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });

    if (!NET_DVR_SetDVRMessageCallBack_V51(0, alarm_callback, nullptr)) {
        emit_json({
            {"event", "sdk_callback_register"},
            {"ok", "false"},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        NET_DVR_Cleanup();
        return 1;
    }
    emit_json({{"event", "sdk_callback_register"}, {"ok", "true"}});

    for (const auto &config : configs) {
        DeviceSession session;
        session.config = config;
        if (login_device(session) && arm_alarm(session)) {
            sessions.push_back(session);
        } else if (session.user_id >= 0) {
            NET_DVR_Logout_V30(session.user_id);
        }
    }

    if (sessions.empty()) {
        emit_json({{"event", "service_start_failed"}, {"reason", "no_armed_devices"}});
        NET_DVR_Cleanup();
        return 1;
    }

    std::thread worker(worker_loop);
    emit_json({
        {"event", "service_started"},
        {"armedDevices", std::to_string(sessions.size())},
        {"mode", execute_mode ? "execute" : "dry-run"},
        {"hrisApiBase", hris_api_base}
    });

    const auto start = std::chrono::steady_clock::now();
    while (keep_running) {
        if (seconds > 0 && std::chrono::steady_clock::now() - start >= std::chrono::seconds(seconds)) {
            keep_running = 0;
            queue_cv.notify_all();
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
    }

    if (worker.joinable()) {
        worker.join();
    }
    close_sessions();
    NET_DVR_Cleanup();
    emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
    return 0;
}
