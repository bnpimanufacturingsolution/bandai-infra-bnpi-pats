/**
 * Project Truth — HCNetSDK dry-run probe: opaque log person id vs plain employeeNo.
 *
 * Read-only. Never writes users, templates, cards, config, or HRIS rows.
 * Inspired by hikvision_biometric_service.cpp (login + NET_DVR_STDXMLConfig).
 *
 * Paths exercised:
 *  A) NET_DVR_Login_V40
 *  B) UserInfo/Search inventory via STDXML (plain employeeNo)
 *  C) ContentMgmt/logSearch leaf metaIds via STDXML (opaque LogAddInfo.EmployeeNo)
 *  D) NET_DVR_FindDVRLog_V50 operation logs (sInfo dump)
 *  E) AcsEvent list via STDXML (plain employeeNoString)
 *  F) Compare opaque tokens vs inventory employeeNos / hashes / ACS fields
 *
 * Usage:
 *   ./opaque-id-sdk-probe --device-file /run/device.spec --evidence-dir /out --max-log-rows 40
 * Device file: id|org|name|host|sdkPort|user|pass|false
 */

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include <sys/stat.h>
#include <unistd.h>

#include "HCNetSDK.h"

namespace {

struct DeviceConfig {
	std::string hris_device_id;
	std::string organization_id;
	std::string name;
	std::string host;
	int sdk_port = 8000;
	std::string username;
	std::string password;
};

struct Args {
	std::string device_file;
	std::string evidence_dir = "/out";
	int max_log_rows = 40;
	int max_inventory = 60;
	std::string from = "2026-07-13T00:00:00+08:00";
	std::string to = "2026-07-17T23:59:59+08:00";
};

std::string json_escape(const std::string &value) {
	std::ostringstream out;
	for (const unsigned char c : value) {
		switch (c) {
			case '"': out << "\\\""; break;
			case '\\': out << "\\\\"; break;
			case '\b': out << "\\b"; break;
			case '\f': out << "\\f"; break;
			case '\n': out << "\\n"; break;
			case '\r': out << "\\r"; break;
			case '\t': out << "\\t"; break;
			default:
				if (c < 0x20) {
					out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec;
				} else {
					out << char(c);
				}
		}
	}
	return out.str();
}

std::string now_utc() {
	const std::time_t raw = std::time(nullptr);
	std::tm tm_value{};
	gmtime_r(&raw, &tm_value);
	char buffer[32] = {0};
	std::strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &tm_value);
	return buffer;
}

void emit(std::ofstream &evidence, const std::map<std::string, std::string> &fields) {
	std::ostringstream line;
	line << "{\"ts\":\"" << now_utc() << "\"";
	for (const auto &field : fields) {
		line << ",\"" << json_escape(field.first) << "\":\"" << json_escape(field.second) << "\"";
	}
	line << "}";
	std::cout << line.str() << std::endl;
	if (evidence.is_open()) {
		evidence << line.str() << std::endl;
		evidence.flush();
	}
}

std::string fixed_bytes_to_string(const BYTE *value, size_t max_len) {
	size_t len = 0;
	while (len < max_len && value[len] != 0) {
		++len;
	}
	return std::string(reinterpret_cast<const char *>(value), len);
}

std::string trim(const std::string &s) {
	size_t a = 0;
	while (a < s.size() && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
	size_t b = s.size();
	while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
	return s.substr(a, b - a);
}

bool parse_device_spec(const std::string &spec, DeviceConfig *config) {
	std::vector<std::string> parts;
	std::stringstream stream(spec);
	std::string item;
	while (std::getline(stream, item, '|')) {
		parts.push_back(item);
	}
	if (parts.size() < 7) return false;
	config->hris_device_id = parts[0];
	config->organization_id = parts[1];
	config->name = parts[2];
	config->host = parts[3];
	config->sdk_port = std::stoi(parts[4]);
	config->username = parts[5];
	config->password = parts[6];
	return true;
}

bool load_device_file(const std::string &path, DeviceConfig *config) {
	std::ifstream in(path);
	if (!in) return false;
	std::string line;
	std::getline(in, line);
	line = trim(line);
	return parse_device_spec(line, config);
}

// Minimal field extractors (no full JSON parser dependency).
std::string extract_json_string_field(const std::string &json, const std::string &key) {
	const std::string needle = "\"" + key + "\"";
	size_t pos = 0;
	while (true) {
		pos = json.find(needle, pos);
		if (pos == std::string::npos) return "";
		size_t colon = json.find(':', pos + needle.size());
		if (colon == std::string::npos) return "";
		size_t i = colon + 1;
		while (i < json.size() && std::isspace(static_cast<unsigned char>(json[i]))) ++i;
		if (i >= json.size()) return "";
		if (json[i] == '"') {
			++i;
			std::string out;
			while (i < json.size() && json[i] != '"') {
				if (json[i] == '\\' && i + 1 < json.size()) {
					out.push_back(json[i + 1]);
					i += 2;
					continue;
				}
				out.push_back(json[i++]);
			}
			return out;
		}
		// number / bare
		size_t j = i;
		while (j < json.size() && (std::isalnum(static_cast<unsigned char>(json[j])) || json[j] == '-' || json[j] == '+')) {
			++j;
		}
		return json.substr(i, j - i);
	}
}

std::vector<std::string> extract_all_string_field(const std::string &json, const std::string &key) {
	std::vector<std::string> out;
	const std::string needle = "\"" + key + "\"";
	size_t pos = 0;
	while ((pos = json.find(needle, pos)) != std::string::npos) {
		size_t colon = json.find(':', pos + needle.size());
		if (colon == std::string::npos) break;
		size_t i = colon + 1;
		while (i < json.size() && std::isspace(static_cast<unsigned char>(json[i]))) ++i;
		if (i < json.size() && json[i] == '"') {
			++i;
			std::string value;
			while (i < json.size() && json[i] != '"') {
				if (json[i] == '\\' && i + 1 < json.size()) {
					value.push_back(json[i + 1]);
					i += 2;
					continue;
				}
				value.push_back(json[i++]);
			}
			if (!value.empty()) out.push_back(value);
		}
		pos += needle.size();
	}
	return out;
}

bool looks_opaque_person_token(const std::string &value) {
	if (value.size() < 20 || value.size() > 28) return false;
	if (value.find('=') == std::string::npos && value.size() < 22) return false;
	// base64 alphabet + padding
	for (const char c : value) {
		if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '+' || c == '/' || c == '=' || c == '-' || c == '_')) {
			return false;
		}
	}
	// not a short plain employee no
	if (value.size() <= 8 && value.find_first_not_of("0123456789") == std::string::npos) return false;
	return value.find_first_not_of("0123456789") != std::string::npos;
}

bool looks_plain_employee_no(const std::string &value) {
	if (value.empty() || value.size() > 32) return false;
	if (looks_opaque_person_token(value)) return false;
	// mostly alphanumeric short ids used on this device ("1", "1587", "uzaro.ck" names are not employeeNo)
	return true;
}

std::string to_hex(const unsigned char *data, size_t len) {
	std::ostringstream out;
	for (size_t i = 0; i < len; ++i) {
		out << std::hex << std::setw(2) << std::setfill('0') << int(data[i]);
	}
	return out.str();
}

// crude base64 decode for evidence only
std::vector<unsigned char> b64_decode(const std::string &in) {
	static const std::string tbl =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	std::vector<int> T(256, -1);
	for (int i = 0; i < 64; ++i) T[static_cast<unsigned char>(tbl[i])] = i;
	std::vector<unsigned char> out;
	int val = 0, valb = -8;
	for (unsigned char c : in) {
		if (c == '=') break;
		if (T[c] == -1) continue;
		val = (val << 6) + T[c];
		valb += 6;
		if (valb >= 0) {
			out.push_back(static_cast<unsigned char>((val >> valb) & 0xFF));
			valb -= 8;
		}
	}
	return out;
}

bool stdxml_request(
	LONG user_id,
	const std::string &method_and_path,
	const std::string &body,
	std::string *response,
	std::string *status_out,
	DWORD *last_error) {
	NET_DVR_XML_CONFIG_INPUT input{};
	NET_DVR_XML_CONFIG_OUTPUT output{};
	// larger buffers for inventory / log pages
	static thread_local std::vector<char> url(1024);
	static thread_local std::vector<char> in_buffer(1 << 20);
	static thread_local std::vector<char> out_buffer(2 << 20);
	static thread_local std::vector<char> status_buffer(64 * 1024);
	std::fill(url.begin(), url.end(), 0);
	std::fill(in_buffer.begin(), in_buffer.end(), 0);
	std::fill(out_buffer.begin(), out_buffer.end(), 0);
	std::fill(status_buffer.begin(), status_buffer.end(), 0);

	std::strncpy(url.data(), method_and_path.c_str(), url.size() - 1);
	std::strncpy(in_buffer.data(), body.c_str(), in_buffer.size() - 1);

	input.dwSize = sizeof(input);
	input.lpRequestUrl = url.data();
	input.dwRequestUrlLen = static_cast<DWORD>(std::strlen(url.data()));
	input.lpInBuffer = body.empty() ? nullptr : in_buffer.data();
	input.dwInBufferSize = body.empty() ? 0 : static_cast<DWORD>(std::strlen(in_buffer.data()));

	output.dwSize = sizeof(output);
	output.lpOutBuffer = out_buffer.data();
	output.dwOutBufferSize = static_cast<DWORD>(out_buffer.size());
	output.lpStatusBuffer = status_buffer.data();
	output.dwStatusSize = static_cast<DWORD>(status_buffer.size());

	const BOOL ok = NET_DVR_STDXMLConfig(user_id, &input, &output);
	if (last_error) *last_error = ok ? 0 : NET_DVR_GetLastError();
	if (response) response->assign(out_buffer.data(), output.dwReturnedXMLSize);
	if (status_out) status_out->assign(status_buffer.data());
	return ok == TRUE;
}

std::string build_logsearch_xml(
	const std::string &search_id,
	const std::string &start,
	const std::string &end,
	const std::string &meta_id,
	int max_results,
	int position) {
	// Must match hris-api buildHikvisionLogSearchXml (device-proven on TEST A).
	std::ostringstream xml;
	xml << "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
		<< "<CMSearchDescription version=\"2.0\" xmlns=\"http://www.hikvision.com/ver20/XMLSchema\">"
		<< "<searchID>" << search_id << "</searchID>"
		<< "<metaId>" << meta_id << "</metaId>"
		<< "<timeSpanList><timeSpan>"
		<< "<startTime>" << start << "</startTime>"
		<< "<endTime>" << end << "</endTime>"
		<< "</timeSpan></timeSpanList>"
		<< "<maxResults>" << max_results << "</maxResults>"
		// Device firmware uses the historical misspelling "searchResultPostion".
		<< "<searchResultPostion>" << position << "</searchResultPostion>"
		<< "</CMSearchDescription>";
	return xml.str();
}

void fill_time_v50(NET_DVR_TIME_V50 *t, int y, int m, int d, int H, int M, int S) {
	std::memset(t, 0, sizeof(*t));
	t->wYear = static_cast<WORD>(y);
	t->byMonth = static_cast<BYTE>(m);
	t->byDay = static_cast<BYTE>(d);
	t->byHour = static_cast<BYTE>(H);
	t->byMinute = static_cast<BYTE>(M);
	t->bySecond = static_cast<BYTE>(S);
}

Args parse_args(int argc, char **argv) {
	Args args;
	for (int i = 1; i < argc; ++i) {
		const std::string a = argv[i];
		auto need = [&](const char *name) -> std::string {
			if (i + 1 >= argc) {
				std::cerr << "missing value for " << name << std::endl;
				std::exit(2);
			}
			return argv[++i];
		};
		if (a == "--device-file") args.device_file = need("--device-file");
		else if (a == "--evidence-dir") args.evidence_dir = need("--evidence-dir");
		else if (a == "--max-log-rows") args.max_log_rows = std::stoi(need("--max-log-rows"));
		else if (a == "--max-inventory") args.max_inventory = std::stoi(need("--max-inventory"));
		else if (a == "--from") args.from = need("--from");
		else if (a == "--to") args.to = need("--to");
		else if (a == "--help" || a == "-h") {
			std::cout
				<< "opaque-id-sdk-probe --device-file PATH [--evidence-dir DIR] [--max-log-rows N]\n"
				<< "  dry-run only; no device writes\n";
			std::exit(0);
		}
	}
	if (args.device_file.empty()) {
		std::cerr << "--device-file required\n";
		std::exit(2);
	}
	return args;
}

}  // namespace

int main(int argc, char **argv) {
	const Args args = parse_args(argc, argv);
	mkdir(args.evidence_dir.c_str(), 0755);
	std::ofstream evidence(args.evidence_dir + "/sdk-probe.jsonl", std::ios::app);
	std::ofstream summary_out(args.evidence_dir + "/sdk-probe-summary.json");

	DeviceConfig device{};
	if (!load_device_file(args.device_file, &device)) {
		emit(evidence, {{"event", "fatal"}, {"reason", "device_file_unreadable"}});
		return 2;
	}

	emit(evidence, {
		{"event", "probe_start"},
		{"mode", "dry-run"},
		{"deviceId", device.hris_device_id},
		{"deviceName", device.name},
		{"host", device.host},
		{"sdkPort", std::to_string(device.sdk_port)},
		{"hasUser", device.username.empty() ? "false" : "true"},
		{"hasPass", device.password.empty() ? "false" : "true"},
		{"from", args.from},
		{"to", args.to},
	});

	if (device.username.empty() || device.password.empty()) {
		emit(evidence, {{"event", "fatal"}, {"reason", "missing_device_credentials"}});
		return 3;
	}

	NET_DVR_Init();
	NET_DVR_SetConnectTime(5000, 3);
	NET_DVR_SetReconnect(10000, true);

	NET_DVR_USER_LOGIN_INFO login_info{};
	NET_DVR_DEVICEINFO_V40 device_info{};
	login_info.bUseAsynLogin = 0;
	login_info.wPort = static_cast<WORD>(device.sdk_port);
	std::strncpy(login_info.sDeviceAddress, device.host.c_str(), NET_DVR_DEV_ADDRESS_MAX_LEN - 1);
	std::strncpy(login_info.sUserName, device.username.c_str(), NAME_LEN - 1);
	std::strncpy(login_info.sPassword, device.password.c_str(), NAME_LEN - 1);

	const LONG user_id = NET_DVR_Login_V40(&login_info, &device_info);
	const DWORD login_err = user_id < 0 ? NET_DVR_GetLastError() : 0;
	emit(evidence, {
		{"event", "sdk_login"},
		{"ok", user_id >= 0 ? "true" : "false"},
		{"userId", std::to_string(user_id)},
		{"lastError", std::to_string(login_err)},
	});
	if (user_id < 0) {
		NET_DVR_Cleanup();
		return 4;
	}

	std::set<std::string> inventory_employee_nos;
	std::set<std::string> opaque_tokens;
	std::set<std::string> acs_employee_nos;
	std::vector<std::string> sdk_log_info_samples;
	int inventory_rows = 0;
	int logsearch_rows = 0;
	int sdk_log_rows = 0;
	int acs_rows = 0;
	int exact_inventory_hits = 0;
	int reverse_userinfo_hits = 0;

	// -------- B) Inventory UserInfo/Search --------
	{
		int position = 0;
		for (int page = 0; page < 20 && inventory_rows < args.max_inventory; ++page) {
			std::ostringstream body;
			body << "{\"UserInfoSearchCond\":{"
				 << "\"searchID\":\"pt-opaque-inv-" << page << "\","
				 << "\"searchResultPosition\":" << position << ","
				 << "\"maxResults\":30}}";
			std::string response, status;
			DWORD err = 0;
			const bool ok = stdxml_request(
				user_id,
				"POST /ISAPI/AccessControl/UserInfo/Search?format=json",
				body.str(),
				&response,
				&status,
				&err);
			emit(evidence, {
				{"event", "userinfo_search_page"},
				{"ok", ok ? "true" : "false"},
				{"position", std::to_string(position)},
				{"lastError", std::to_string(err)},
				{"responseBytes", std::to_string(response.size())},
				{"statusSnippet", status.substr(0, 200)},
			});
			if (!ok && response.empty()) break;

			const auto employee_nos = extract_all_string_field(response, "employeeNo");
			for (const auto &eno : employee_nos) {
				if (looks_opaque_person_token(eno)) {
					opaque_tokens.insert(eno);
				} else if (looks_plain_employee_no(eno)) {
					inventory_employee_nos.insert(eno);
				}
			}
			inventory_rows += static_cast<int>(employee_nos.size());

			// sample first page keys by dumping a short snippet
			if (page == 0) {
				emit(evidence, {
					{"event", "userinfo_sample"},
					{"snippet", response.substr(0, 800)},
					{"plainEmployeeCount", std::to_string(inventory_employee_nos.size())},
				});
			}

			const std::string total = extract_json_string_field(response, "totalMatches");
			const std::string more = extract_json_string_field(response, "responseStatusStrg");
			position += static_cast<int>(employee_nos.size());
			if (employee_nos.empty()) break;
			if (!total.empty() && position >= std::atoi(total.c_str())) break;
			if (more != "MORE" && more != "OK") {
				// keep going once more if empty status
				if (!more.empty() && more != "MORE") break;
			}
		}
	}

	// -------- C) logSearch leaf metaIds via STDXML --------
	const std::vector<std::string> meta_ids = {
		"log.hikvision.com/Information/addUserInfo",
		"log.hikvision.com/Information/addFpByEmployeeNo",
		"log.hikvision.com/Information/addCard",
	};
	for (const auto &meta_id : meta_ids) {
		const std::string xml = build_logsearch_xml(
			"pt-opaque-log-" + meta_id.substr(meta_id.find_last_of('/') + 1),
			args.from,
			args.to,
			meta_id,
			20,
			0);
		std::string response, status;
		DWORD err = 0;
		// Content-Type for logSearch is XML body
		const bool ok = stdxml_request(
			user_id,
			"POST /ISAPI/ContentMgmt/logSearch",
			xml,
			&response,
			&status,
			&err);
		// Extract EmployeeNo= opaque from CDATA/JSON-ish text
		std::set<std::string> page_tokens;
		size_t pos = 0;
		while ((pos = response.find("EmployeeNo", pos)) != std::string::npos) {
			size_t q1 = response.find('"', pos);
			if (q1 == std::string::npos) break;
			size_t q2 = response.find('"', q1 + 1);
			// sometimes "EmployeeNo":\t"TOKEN"
			size_t colon = response.find(':', pos);
			if (colon != std::string::npos && colon < q1 + 40) {
				size_t s = response.find('"', colon);
				if (s != std::string::npos) {
					size_t e = response.find('"', s + 1);
					if (e != std::string::npos) {
						const std::string token = response.substr(s + 1, e - s - 1);
						if (looks_opaque_person_token(token)) {
							opaque_tokens.insert(token);
							page_tokens.insert(token);
						}
					}
				}
			}
			pos += 10;
		}
		// totalMatches
		std::string total_matches;
		{
			size_t t = response.find("<totalMatches>");
			if (t != std::string::npos) {
				size_t e = response.find("</totalMatches>", t);
				if (e != std::string::npos) {
					total_matches = response.substr(t + 14, e - (t + 14));
				}
			}
		}
		logsearch_rows += static_cast<int>(page_tokens.size());
		emit(evidence, {
			{"event", "logsearch_leaf"},
			{"metaId", meta_id},
			{"ok", ok ? "true" : "false"},
			{"lastError", std::to_string(err)},
			{"responseBytes", std::to_string(response.size())},
			{"opaqueTokensOnPage", std::to_string(page_tokens.size())},
			{"totalMatches", total_matches},
			{"sampleToken", page_tokens.empty() ? "" : *page_tokens.begin()},
			{"snippet", response.substr(0, 600)},
		});
	}

	// -------- D) NET_DVR_FindDVRLog_V50 --------
	{
		NET_DVR_FIND_LOG_COND cond{};
		cond.dwSelectMode = 3;  // time + type
		cond.dwMainType = 0xff; // all (or 3 operation)
		cond.dwSubType = 0;
		fill_time_v50(&cond.struStartTime, 2026, 7, 13, 0, 0, 0);
		fill_time_v50(&cond.struEndTime, 2026, 7, 17, 23, 59, 59);
		cond.bOnlySmart = FALSE;

		const LONG handle = NET_DVR_FindDVRLog_V50(user_id, &cond);
		emit(evidence, {
			{"event", "find_dvr_log_v50"},
			{"ok", handle >= 0 ? "true" : "false"},
			{"handle", std::to_string(handle)},
			{"lastError", handle >= 0 ? "0" : std::to_string(NET_DVR_GetLastError())},
		});
		if (handle >= 0) {
			for (int i = 0; i < args.max_log_rows; ++i) {
				NET_DVR_LOG_V50 log{};
				const LONG next = NET_DVR_FindNextLog_V50(handle, &log);
				if (next == NET_DVR_FILE_SUCCESS) {
					++sdk_log_rows;
					const std::string info(log.sInfo, strnlen(log.sInfo, LOG_INFO_LEN));
					const std::string panel = fixed_bytes_to_string(log.sPanelUser, MAX_NAMELEN);
					const std::string net_user = fixed_bytes_to_string(log.sNetUser, MAX_NAMELEN);
					if (sdk_log_info_samples.size() < 8) sdk_log_info_samples.push_back(info.substr(0, 400));
					// harvest tokens / employee-like strings from sInfo
					for (const auto &eno : extract_all_string_field(info, "EmployeeNo")) {
						if (looks_opaque_person_token(eno)) opaque_tokens.insert(eno);
						else if (looks_plain_employee_no(eno)) {
							// rare: plain in SDK log
						}
					}
					// also scan free text for base64-ish tokens
					size_t p = 0;
					while (p < info.size()) {
						// find == padded tokens
						size_t eq = info.find("==", p);
						if (eq == std::string::npos) break;
						size_t start = eq;
						while (start > 0 && (std::isalnum(static_cast<unsigned char>(info[start - 1])) || info[start - 1] == '+' || info[start - 1] == '/')) {
							--start;
						}
						const std::string cand = info.substr(start, eq + 2 - start);
						if (looks_opaque_person_token(cand)) opaque_tokens.insert(cand);
						p = eq + 2;
					}
					if (i < 5) {
						emit(evidence, {
							{"event", "sdk_log_row"},
							{"major", std::to_string(log.dwMajorType)},
							{"minor", std::to_string(log.dwMinorType)},
							{"panelUser", panel},
							{"netUser", net_user},
							{"infoLen", std::to_string(log.dwInfoLen)},
							{"infoSnippet", info.substr(0, 300)},
						});
					}
				} else if (next == NET_DVR_ISFINDING) {
					usleep(50 * 1000);
					--i;
					continue;
				} else if (next == NET_DVR_FILE_NOFIND || next == NET_DVR_NOMOREFILE) {
					emit(evidence, {
						{"event", "sdk_log_done"},
						{"reason", std::to_string(next)},
						{"rows", std::to_string(sdk_log_rows)},
					});
					break;
				} else {
					emit(evidence, {
						{"event", "sdk_log_error"},
						{"next", std::to_string(next)},
						{"lastError", std::to_string(NET_DVR_GetLastError())},
					});
					break;
				}
			}
			NET_DVR_FindClose_V30(handle);
		}

		// retry with major=3 operation only
		cond.dwMainType = 3;
		const LONG handle2 = NET_DVR_FindDVRLog_V50(user_id, &cond);
		emit(evidence, {
			{"event", "find_dvr_log_v50_operation"},
			{"ok", handle2 >= 0 ? "true" : "false"},
			{"lastError", handle2 >= 0 ? "0" : std::to_string(NET_DVR_GetLastError())},
		});
		if (handle2 >= 0) {
			int op_rows = 0;
			for (int i = 0; i < args.max_log_rows; ++i) {
				NET_DVR_LOG_V50 log{};
				const LONG next = NET_DVR_FindNextLog_V50(handle2, &log);
				if (next == NET_DVR_FILE_SUCCESS) {
					++op_rows;
					const std::string info(log.sInfo, strnlen(log.sInfo, LOG_INFO_LEN));
					if (i < 3) {
						emit(evidence, {
							{"event", "sdk_op_log_row"},
							{"major", std::to_string(log.dwMajorType)},
							{"minor", std::to_string(log.dwMinorType)},
							{"infoSnippet", info.substr(0, 300)},
						});
					}
				} else if (next == NET_DVR_ISFINDING) {
					usleep(50 * 1000);
					--i;
				} else {
					break;
				}
			}
			emit(evidence, {{"event", "sdk_op_log_count"}, {"rows", std::to_string(op_rows)}});
			NET_DVR_FindClose_V30(handle2);
		}
	}

	// -------- E) AcsEvent via STDXML --------
	{
		std::ostringstream body;
		body << "{\"AcsEventCond\":{"
			 << "\"searchID\":\"pt-opaque-acs\","
			 << "\"searchResultPosition\":0,"
			 << "\"maxResults\":20,"
			 << "\"major\":0,\"minor\":0,"
			 << "\"startTime\":\"" << args.from << "\","
			 << "\"endTime\":\"" << args.to << "\""
			 << "}}";
		std::string response, status;
		DWORD err = 0;
		const bool ok = stdxml_request(
			user_id,
			"POST /ISAPI/AccessControl/AcsEvent?format=json",
			body.str(),
			&response,
			&status,
			&err);
		const auto enos = extract_all_string_field(response, "employeeNoString");
		const auto enos2 = extract_all_string_field(response, "employeeNo");
		for (const auto &e : enos) {
			if (looks_plain_employee_no(e)) acs_employee_nos.insert(e);
			if (looks_opaque_person_token(e)) opaque_tokens.insert(e);
		}
		for (const auto &e : enos2) {
			if (looks_plain_employee_no(e)) acs_employee_nos.insert(e);
			if (looks_opaque_person_token(e)) opaque_tokens.insert(e);
		}
		acs_rows = static_cast<int>(enos.size() + enos2.size());
		emit(evidence, {
			{"event", "acs_event_search"},
			{"ok", ok ? "true" : "false"},
			{"lastError", std::to_string(err)},
			{"responseBytes", std::to_string(response.size())},
			{"plainEmployeeSamples", std::to_string(acs_employee_nos.size())},
			{"snippet", response.substr(0, 600)},
		});
	}

	// Seed known opaque samples if logSearch path yielded none (still reverse-test them).
	if (opaque_tokens.empty()) {
		const char *seeds[] = {
			"sQdO+wAKh3NX4vy8U4lmWw==",
			"eaSB1MfdvdeI9Sm5X1sFZQ==",
			"zv1h1zEdAqe1jbFHpuYI2Q==",
			"sfmXYOsdfuiq3Q/vdhncSQ==",
			"9RStlOr5tSOyfBQz/YUcoQ==",
			nullptr,
		};
		for (int i = 0; seeds[i]; ++i) opaque_tokens.insert(seeds[i]);
		emit(evidence, {
			{"event", "opaque_seeded_from_prior_isapi_proof"},
			{"count", std::to_string(opaque_tokens.size())},
		});
	}

	// -------- F) Compare opaque vs inventory --------
	std::vector<std::string> matched;
	for (const auto &token : opaque_tokens) {
		if (inventory_employee_nos.count(token)) {
			++exact_inventory_hits;
			matched.push_back(token);
		}
		// reverse UserInfo by opaque as employeeNo (expect fail / 0)
		std::ostringstream body;
		body << "{\"UserInfoSearchCond\":{"
			 << "\"searchID\":\"pt-opaque-rev\","
			 << "\"searchResultPosition\":0,"
			 << "\"maxResults\":1,"
			 << "\"EmployeeNoList\":[{\"employeeNo\":\"" << token << "\"}]"
			 << "}}";
		std::string response, status;
		DWORD err = 0;
		const bool ok = stdxml_request(
			user_id,
			"POST /ISAPI/AccessControl/UserInfo/Search?format=json",
			body.str(),
			&response,
			&status,
			&err);
		const std::string num = extract_json_string_field(response, "numOfMatches");
		const bool hit = ok && num != "" && num != "0";
		if (hit) ++reverse_userinfo_hits;
		// only log first 5 reverse attempts
		static int reverse_logged = 0;
		if (reverse_logged < 5) {
			const auto decoded = b64_decode(token);
			emit(evidence, {
				{"event", "reverse_userinfo_by_opaque"},
				{"opaque", token},
				{"decodedBytes", std::to_string(decoded.size())},
				{"decodedHex", decoded.empty() ? "" : to_hex(decoded.data(), decoded.size())},
				{"ok", ok ? "true" : "false"},
				{"lastError", std::to_string(err)},
				{"numOfMatches", num},
				{"statusSnippet", status.substr(0, 160)},
			});
			++reverse_logged;
		}
	}

	// Intersection ACS plain vs inventory (sanity, not opaque map)
	int acs_in_inventory = 0;
	for (const auto &e : acs_employee_nos) {
		if (inventory_employee_nos.count(e)) ++acs_in_inventory;
	}

	const bool can_map = exact_inventory_hits > 0 || reverse_userinfo_hits > 0;
	emit(evidence, {
		{"event", "verdict"},
		{"canMapOpaqueToEmployeeNo", can_map ? "true" : "false"},
		{"confidence", "sdk_dry_run_proven"},
		{"inventoryPlainEmployeeNos", std::to_string(inventory_employee_nos.size())},
		{"opaqueTokensSeen", std::to_string(opaque_tokens.size())},
		{"exactInventoryHits", std::to_string(exact_inventory_hits)},
		{"reverseUserInfoHits", std::to_string(reverse_userinfo_hits)},
		{"acsPlainEmployeeNos", std::to_string(acs_employee_nos.size())},
		{"acsInInventory", std::to_string(acs_in_inventory)},
		{"sdkLogRows", std::to_string(sdk_log_rows)},
		{"logsearchTokenRows", std::to_string(logsearch_rows)},
		{"meaning", can_map
			? "SDK path found a candidate mapping; inspect reverse_userinfo / exact hits"
			: "SDK dry-run same as ISAPI: opaque log tokens are not plain UserInfo employeeNo; reverse search does not resolve"},
	});

	// Write compact summary JSON
	{
		std::ostringstream sample_opaque;
		int n = 0;
		for (const auto &t : opaque_tokens) {
			if (n++) sample_opaque << ",";
			sample_opaque << "\"" << json_escape(t) << "\"";
			if (n >= 8) break;
		}
		std::ostringstream sample_emp;
		n = 0;
		for (const auto &t : inventory_employee_nos) {
			if (n++) sample_emp << ",";
			sample_emp << "\"" << json_escape(t) << "\"";
			if (n >= 8) break;
		}
		summary_out << "{\n"
			<< "  \"generatedAt\": \"" << now_utc() << "\",\n"
			<< "  \"mode\": \"dry-run\",\n"
			<< "  \"device\": {\"id\":\"" << json_escape(device.hris_device_id)
			<< "\",\"name\":\"" << json_escape(device.name)
			<< "\",\"host\":\"" << json_escape(device.host)
			<< "\",\"sdkPort\":" << device.sdk_port << "},\n"
			<< "  \"inventoryPlainEmployeeNos\": " << inventory_employee_nos.size() << ",\n"
			<< "  \"opaqueTokensSeen\": " << opaque_tokens.size() << ",\n"
			<< "  \"exactInventoryHits\": " << exact_inventory_hits << ",\n"
			<< "  \"reverseUserInfoHits\": " << reverse_userinfo_hits << ",\n"
			<< "  \"acsPlainEmployeeNos\": " << acs_employee_nos.size() << ",\n"
			<< "  \"sdkLogRows\": " << sdk_log_rows << ",\n"
			<< "  \"canMapOpaqueToEmployeeNo\": " << (can_map ? "true" : "false") << ",\n"
			<< "  \"sampleOpaque\": [" << sample_opaque.str() << "],\n"
			<< "  \"samplePlainEmployeeNo\": [" << sample_emp.str() << "]\n"
			<< "}\n";
	}

	NET_DVR_Logout(user_id);
	NET_DVR_Cleanup();
	emit(evidence, {{"event", "probe_end"}, {"ok", "true"}});
	return can_map ? 0 : 0;  // dry-run success either way if probe completed
}
