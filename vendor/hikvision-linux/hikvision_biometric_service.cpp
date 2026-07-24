#include <chrono>
#include <cctype>
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
#include <algorithm>
#include <atomic>
#include <cerrno>
#include <functional>

#include <dirent.h>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
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
    DWORD last_login_error = 0;
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
    bool include_face_recognition = true;
    bool include_card = false;
    // Manual merge jobs may copy biometric credentials without rewriting the
    // already-converged user/profile/card plane.
    bool credential_only = false;
    // Filled by enrich_hris_job_before_post when ACS person was empty or templates needed.
    // identity_source: acs_dwEmployeeNo | inventory_delta | userinfo_touch |
    //                  poll_inventory | empty
    std::string identity_source;
    // JSON array of {fingerPrintId,fingerType,length,data} with base64 fingerData (raw).
    std::string fingerprints_json;
    std::string face_template_b64;
    std::string face_picture_b64;
    int fingerprint_count = 0;
};

template <typename Operation>
bool retry_peer_operation(
    const std::string &operation,
    DeviceSession &target,
    const std::string &employee_no,
    Operation operation_fn);

std::mutex queue_mutex;
std::condition_variable queue_cv;
std::deque<ReconcileJob> hris_immediate_event_queue;
std::deque<ReconcileJob> hris_enrichment_event_queue;
std::deque<ReconcileJob> reconcile_queue;
std::vector<DeviceSession> sessions;
std::mutex sessions_mutex;
std::ofstream evidence_stream;
std::mutex evidence_mutex;
std::mutex sdk_request_mutex;
std::mutex peer_apply_guard_mutex;
std::mutex delayed_reconcile_guard_mutex;
std::mutex full_mirror_guard_mutex;
std::mutex reconcile_spool_mutex;
std::mutex callback_spool_mutex;
std::set<std::string> callback_posts_in_flight;
std::mutex recent_employee_candidate_mutex;
std::mutex poll_reconcile_guard_mutex;
// UserInfo/Search behaves like a device-global cursor on the TEST A firmware.
// Serialize full paginated inventories; interleaved searches can fail mid-page
// and must never be mistaken for a complete baseline/delta.
std::mutex inventory_read_mutex;
std::mutex inventory_baseline_mutex;
std::map<std::string, std::chrono::steady_clock::time_point> recent_peer_apply_by_host;
std::map<std::string, unsigned long long> delayed_reconcile_by_host;
// last_seen timestamps (not expiry). TTL applied when reading.
std::map<std::string, std::chrono::steady_clock::time_point> recent_employee_candidates;
std::map<std::string, std::chrono::steady_clock::time_point> recent_poll_reconcile_by_key;
std::mutex callback_identity_scan_mutex;
std::map<std::string, std::chrono::steady_clock::time_point>
    recent_callback_identity_scan_by_host;
std::map<std::string, std::set<std::string>> observed_employee_numbers_by_host;
std::set<std::string> inventory_baseline_ready_hosts;
// UserInfo field fingerprint per host/employee for modify detection when ACS person is empty.
// Fingerprint = name|numOfFP|numOfFace. Detects name edits and FP count changes; does not invent ids.
struct UserInfoTouchSnapshot {
    std::string name;
    int num_of_fp = -1;
    int num_of_face = -1;
    std::string fingerprint() const {
        return name + "|" + std::to_string(num_of_fp) + "|" + std::to_string(num_of_face);
    }
};
std::mutex userinfo_touch_mutex;
std::map<std::string, std::map<std::string, UserInfoTouchSnapshot>> userinfo_touch_baseline_by_host;
std::set<std::string> userinfo_touch_baseline_ready_hosts;
std::set<std::string> pending_full_mirror_hosts;
std::atomic<unsigned long long> delayed_reconcile_token{0};
std::atomic<unsigned long long> callback_spool_token{0};
constexpr size_t HRIS_IMMEDIATE_WORKER_COUNT = 2;
bool execute_mode = true;
bool automatic_peer_reconcile_enabled = true;
std::string hris_api_base;
std::string hris_api_token;
std::string min_sdk_time;
std::string reconcile_spool_dir = "/tmp/project-truth-hikvision-reconcile-spool";
std::string reconcile_quarantine_dir =
    "/tmp/project-truth-hikvision-reconcile-quarantine";
std::string callback_spool_dir = "/tmp/project-truth-hikvision-callback-spool";
// Long enough for panel create → enroll / modify multipass without inventing ids.
constexpr auto recent_employee_candidate_ttl = std::chrono::seconds(180);
constexpr auto poll_reconcile_min_interval = std::chrono::seconds(3);
constexpr auto inventory_poll_interval = std::chrono::seconds(2);
// A full UserInfo inventory is 29 SDK pages on the current 865-user panels.
// Keep it out of the ordinary callback hot path and coalesce the remaining
// explicit management-event fallback scans for a full minute per device.
constexpr auto callback_identity_scan_min_interval = std::chrono::minutes(1);

bool curl_post_json(
    const std::string &url,
    const std::string &body,
    const std::string &event_name,
    int max_time_seconds = 5);
void queue_reconcile(const ReconcileJob &job);
std::string pick_newest_plain_employee_no(const std::vector<std::string> &candidates);
std::vector<std::string> get_recent_employee_candidates_for_host(const std::string &host);
void seed_userinfo_touch_baseline_for_session(DeviceSession &device);

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

// Raw biometric custody is a process-to-process transport contract only. It must
// never be duplicated into the durable listener JSONL evidence stream.
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

bool should_attempt_fast_user_delta_reconcile(const ReconcileJob &job) {
    return job.major == MAJOR_OPERATION &&
           job.employee_no.empty() &&
           is_observed_operation_sync_minor(job.minor) &&
           job.event_kind != "manual_full_mirror";
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

void schedule_delayed_reconcile(const ReconcileJob &job, std::chrono::seconds delay) {
    if (job.source_host.empty()) {
        queue_reconcile(job);
        return;
    }

    const unsigned long long token = delayed_reconcile_token.fetch_add(1) + 1;
    {
        std::lock_guard<std::mutex> lock(delayed_reconcile_guard_mutex);
        const auto found = delayed_reconcile_by_host.find(job.source_host);
        if (found != delayed_reconcile_by_host.end()) {
            emit_json({
                {"event", "reconcile_deferred_already_pending"},
                {"sourceDeviceId", job.source_device_id},
                {"sourceHost", job.source_host},
                {"minor", minor_name(job.minor)},
                {"delaySeconds", std::to_string(delay.count())}
            });
            return;
        }
        delayed_reconcile_by_host[job.source_host] = token;
    }

    emit_json({
        {"event", "reconcile_deferred_recent_peer_apply"},
        {"sourceDeviceId", job.source_device_id},
        {"sourceHost", job.source_host},
        {"minor", minor_name(job.minor)},
        {"delaySeconds", std::to_string(delay.count())}
    });

    std::thread([job, delay, token]() {
        std::this_thread::sleep_for(delay);
        {
            std::lock_guard<std::mutex> lock(delayed_reconcile_guard_mutex);
            const auto found = delayed_reconcile_by_host.find(job.source_host);
            if (found == delayed_reconcile_by_host.end() || found->second != token) {
                return;
            }
            delayed_reconcile_by_host.erase(found);
        }
        emit_json({
            {"event", "reconcile_deferred_queue_release"},
            {"sourceDeviceId", job.source_device_id},
            {"sourceHost", job.source_host},
            {"minor", minor_name(job.minor)}
        });
        queue_reconcile(job);
    }).detach();
}

void enable_default_card_reader(BYTE *readers, size_t count) {
    if (readers == nullptr || count == 0) {
        return;
    }
    readers[0] = 1;
}

std::string base64_encode(const BYTE *data, size_t length) {
    static constexpr char alphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string encoded;
    encoded.reserve(((length + 2) / 3) * 4);
    for (size_t i = 0; i < length; i += 3) {
        const size_t remaining = length - i;
        const unsigned int a = data[i];
        const unsigned int b = remaining > 1 ? data[i + 1] : 0;
        const unsigned int c = remaining > 2 ? data[i + 2] : 0;
        encoded.push_back(alphabet[(a >> 2) & 0x3f]);
        encoded.push_back(alphabet[((a << 4) | (b >> 4)) & 0x3f]);
        encoded.push_back(remaining > 1 ? alphabet[((b << 2) | (c >> 6)) & 0x3f] : '=');
        encoded.push_back(remaining > 2 ? alphabet[c & 0x3f] : '=');
    }
    return encoded;
}

bool base64_decode(const std::string &input, std::vector<char> *output) {
    static const std::string alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    output->clear();
    std::string compact;
    compact.reserve(input.size());
    for (unsigned char c : input) {
        if (!std::isspace(c)) compact.push_back(static_cast<char>(c));
    }
    if (compact.empty() || compact.size() % 4 != 0) return false;
    auto sextet = [&](char c, unsigned int *value) {
        const auto position = alphabet.find(c);
        if (position == std::string::npos) return false;
        *value = static_cast<unsigned int>(position);
        return true;
    };
    for (size_t i = 0; i < compact.size(); i += 4) {
        const bool final_group = i + 4 == compact.size();
        const bool third_padding = compact[i + 2] == '=';
        const bool fourth_padding = compact[i + 3] == '=';
        if ((!final_group && (third_padding || fourth_padding)) ||
            (third_padding && !fourth_padding)) {
            return false;
        }
        unsigned int a = 0;
        unsigned int b = 0;
        unsigned int c = 0;
        unsigned int d = 0;
        if (!sextet(compact[i], &a) || !sextet(compact[i + 1], &b) ||
            (!third_padding && !sextet(compact[i + 2], &c)) ||
            (!fourth_padding && !sextet(compact[i + 3], &d))) {
            return false;
        }
        output->push_back(static_cast<char>((a << 2) | (b >> 4)));
        if (!third_padding) {
            output->push_back(static_cast<char>((b << 4) | (c >> 2)));
        }
        if (!fourth_padding) {
            output->push_back(static_cast<char>((c << 6) | d));
        }
    }
    return !output->empty();
}

DeviceSession *find_session_by_host(const std::string &host) {
    std::lock_guard<std::mutex> lock(sessions_mutex);
    for (auto &session : sessions) {
        if (session.config.host == host) {
            return &session;
        }
    }
    return nullptr;
}

std::string find_session_device_id_by_host(const std::string &host) {
    std::lock_guard<std::mutex> lock(sessions_mutex);
    for (const auto &session : sessions) {
        if (session.config.host == host) {
            return session.config.hris_device_id;
        }
    }
    return "";
}

std::string recent_employee_candidate_key(const std::string &host, const std::string &employee_no) {
    return host + "|" + employee_no;
}

void mark_recent_employee_candidate(const std::string &host, const std::string &employee_no) {
    if (host.empty() || employee_no.empty()) {
        return;
    }
    std::lock_guard<std::mutex> lock(recent_employee_candidate_mutex);
    // Store last_seen (not absolute expiry) so we can pick the most recent candidate.
    recent_employee_candidates[recent_employee_candidate_key(host, employee_no)] =
        std::chrono::steady_clock::now();
}

std::vector<std::string> get_recent_employee_candidates_for_host(const std::string &host) {
    std::vector<std::string> employee_numbers;
    if (host.empty()) {
        return employee_numbers;
    }

    const std::string prefix = host + "|";
    const auto now = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> lock(recent_employee_candidate_mutex);
    for (auto it = recent_employee_candidates.begin(); it != recent_employee_candidates.end();) {
        if (now - it->second > recent_employee_candidate_ttl) {
            it = recent_employee_candidates.erase(it);
            continue;
        }
        if (it->first.rfind(prefix, 0) == 0) {
            employee_numbers.push_back(it->first.substr(prefix.size()));
        }
        ++it;
    }
    return employee_numbers;
}

bool should_queue_poll_reconcile_now(const std::string &key) {
    const auto now = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> lock(poll_reconcile_guard_mutex);
    const auto found = recent_poll_reconcile_by_key.find(key);
    if (found != recent_poll_reconcile_by_key.end() &&
        now - found->second < poll_reconcile_min_interval) {
        return false;
    }
    recent_poll_reconcile_by_key[key] = now;
    return true;
}

bool claim_callback_identity_scan(const std::string &host) {
    if (host.empty()) {
        return false;
    }
    const auto now = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> lock(callback_identity_scan_mutex);
    const auto found = recent_callback_identity_scan_by_host.find(host);
    if (found != recent_callback_identity_scan_by_host.end() &&
        now - found->second < callback_identity_scan_min_interval) {
        return false;
    }
    recent_callback_identity_scan_by_host[host] = now;
    return true;
}

void queue_reconcile(const ReconcileJob &job) {
    if (!job.employee_no.empty()) {
        mark_recent_employee_candidate(job.source_host, job.employee_no);
    }
    const bool manual_reconcile = job.event_kind.rfind("manual_", 0) == 0;
    if (!automatic_peer_reconcile_enabled && !manual_reconcile) {
        emit_json({
            {"event", "automatic_peer_reconcile_paused"},
            {"sourceDeviceId", job.source_device_id},
            {"sourceHost", job.source_host},
            {"employeeNo", job.employee_no},
            {"minor", minor_name(job.minor)},
            {"reason", "explicit_merge_owns_sdk_writes"}
        });
        return;
    }
    const bool full_mirror = should_full_mirror_reconcile(job);
    if (full_mirror && !job.source_host.empty()) {
        std::lock_guard<std::mutex> lock(full_mirror_guard_mutex);
        if (pending_full_mirror_hosts.find(job.source_host) != pending_full_mirror_hosts.end()) {
            emit_json({
                {"event", "reconcile_queue_deduped_full_mirror"},
                {"sourceDeviceId", job.source_device_id},
                {"sourceHost", job.source_host},
                {"minor", minor_name(job.minor)}
            });
            return;
        }
        pending_full_mirror_hosts.insert(job.source_host);
    }

    {
        std::lock_guard<std::mutex> lock(queue_mutex);
        reconcile_queue.push_back(job);
    }
    // The condition variable is shared by lane-specific workers. notify_all avoids
    // waking a worker whose queue predicate is false while the intended worker sleeps.
    queue_cv.notify_all();
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

// Authentication events contain all identity evidence that the device supplied and
// must be posted without an SDK inventory/template read. A separate worker owns this
// lane so a slow empty operation callback cannot delay a later attendance tap.
bool is_immediate_hris_job(const ReconcileJob &job) {
    return job.event_kind.find("attendance_") == 0 || job.major == 5;
}

void queue_hris_device_event(const ReconcileJob &job) {
    const bool immediate = is_immediate_hris_job(job);
    {
        std::lock_guard<std::mutex> lock(queue_mutex);
        if (immediate) {
            hris_immediate_event_queue.push_back(job);
        } else {
            hris_enrichment_event_queue.push_back(job);
        }
    }
    // Multiple queue consumers have different predicates; wake each so the owner of
    // this lane runs now instead of relying on its polling timeout.
    queue_cv.notify_all();
    emit_json({
        {"event", "hris_device_event_queued"},
        {"sourceDeviceId", job.source_device_id},
        {"sourceHost", job.source_host},
        {"employeeNo", job.employee_no},
        {"minor", std::to_string(job.minor)},
        {"minorName", minor_name(job.minor)},
        {"lane", immediate ? "immediate" : "enrichment"},
        {"priority", immediate ? "true" : "false"},
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
    // Identity from ACS (SDK docs: Person/Card-Based Access Control):
    // 1) dwEmployeeNo DWORD on struAcsEventInfo (0 = invalid)
    // 2) byEmployeeNo string on NET_DVR_ACS_EVENT_INFO_EXTEND when byAcsEventInfoExtend=1
    // Prefer non-empty string/plain; do not invent when both empty.
    const std::string employee_no_dw =
        acs->struAcsEventInfo.dwEmployeeNo > 0
            ? std::to_string(acs->struAcsEventInfo.dwEmployeeNo)
            : "";
    std::string employee_no_ext;
    if (acs->byAcsEventInfoExtend == 1 && acs->pAcsEventInfoExtend != nullptr) {
        auto *ext =
            reinterpret_cast<NET_DVR_ACS_EVENT_INFO_EXTEND *>(acs->pAcsEventInfoExtend);
        employee_no_ext =
            fixed_bytes_to_string(ext->byEmployeeNo, NET_SDK_EMPLOYEE_NO_LEN);
    }
    std::string employee_no = !employee_no_ext.empty() ? employee_no_ext : employee_no_dw;
    std::string identity_from_acs = "empty";
    if (!employee_no_ext.empty()) {
        identity_from_acs = "acs_byEmployeeNo_extend";
    } else if (!employee_no_dw.empty()) {
        identity_from_acs = "acs_dwEmployeeNo";
    }
    const std::string card_no =
        fixed_bytes_to_string(acs->struAcsEventInfo.byCardNo, ACS_CARD_NO_LEN);
    const std::string kind = classify_event(acs->dwMajor, acs->dwMinor);
    const std::string source_device_id = find_session_device_id_by_host(host);
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
        {"employeeNoDw", employee_no_dw},
        {"employeeNoExt", employee_no_ext},
        {"acsIdentitySource", identity_from_acs},
        {"acsEventInfoExtend", acs->byAcsEventInfoExtend == 1 ? "true" : "false"},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"doorNo", door_no},
        {"verifyMode", verify_mode},
        {"serialNo", serial_no},
        {"sdkTime", sdk_time_to_string(acs->struTime)}
    });

    ReconcileJob job;
    job.source_host = host;
    job.source_device_id = source_device_id;
    job.employee_no = employee_no;
    if (!employee_no.empty()) {
        job.identity_source = identity_from_acs;
    }
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

    // Attempt template enrich only on evidenced biometric/user/card operation paths.
    // Observed TEST A minors (112/121/122) are not always vendor management macros;
    // ordinary attendance taps must not trigger template reads.
    job.include_fingerprints = is_fingerprint_management_minor(acs->dwMinor) ||
        is_user_management_minor(acs->dwMinor) || is_card_management_minor(acs->dwMinor) ||
        is_observed_operation_sync_minor(acs->dwMinor);
    job.include_face_recognition = job.include_fingerprints;
    // Fastest face path when ACS already carries a picture buffer (SDK COMM_ALARM_ACS).
    if (job.include_face_recognition && acs->dwPicDataLen > 0 && acs->pPicData != nullptr) {
        job.face_picture_b64 = base64_encode(
            reinterpret_cast<const BYTE *>(acs->pPicData),
            static_cast<size_t>(acs->dwPicDataLen));
        emit_json({
            {"event", "acs_alarm_pic_attached"},
            {"sourceDeviceId", source_device_id},
            {"serialNo", serial_no},
            {"facePictureChars", std::to_string(job.face_picture_b64.size())},
            {"picTransType", std::to_string(acs->byPicTransType)}
        });
    }
    if (!job.employee_no.empty()) {
        mark_recent_employee_candidate(job.source_host, job.employee_no);
    }
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
        schedule_delayed_reconcile(job, std::chrono::seconds(25));
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

std::string build_hikvision_callback_json(const ReconcileJob &job) {
    const std::string identity_source =
        !job.identity_source.empty()
            ? job.identity_source
            : (!job.employee_no.empty() ? "acs_dwEmployeeNo" : "empty");
    const bool has_raw_fp = !job.fingerprints_json.empty() && job.fingerprints_json != "[]";
    const bool has_raw_face =
        !job.face_template_b64.empty() || !job.face_picture_b64.empty();
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
         << "\"identitySource\":\"" << json_escape(identity_source) << "\","
         << "\"cardNo\":\"" << json_escape(job.card_no) << "\","
         << "\"major\":" << job.major << ","
         << "\"minor\":" << job.minor << ","
         << "\"actionCode\":\"" << json_escape(minor_name(job.minor)) << "\","
         << "\"eventKind\":\"" << json_escape(job.event_kind) << "\","
         << "\"doorNo\":\"" << json_escape(job.door_no) << "\","
         << "\"verifyMode\":\"" << json_escape(job.verify_mode) << "\","
         << "\"currentVerifyMode\":\"" << json_escape(job.verify_mode) << "\","
         << "\"serialNo\":\"" << json_escape(job.serial_no) << "\","
         << "\"fingerprintCount\":" << job.fingerprint_count << ","
         // Raw base64 templates when C++ could read them (not AES). Empty array when none.
         << "\"fingerprints\":" << (has_raw_fp ? job.fingerprints_json : "[]") << ","
         << "\"faceTemplate\":\"" << json_escape(job.face_template_b64) << "\","
         << "\"facePicture\":\"" << json_escape(job.face_picture_b64) << "\","
         << "\"rawAlarm\":{"
         << "\"deviceIp\":\"" << json_escape(job.source_host) << "\","
         << "\"sourceDeviceId\":\"" << json_escape(job.source_device_id) << "\","
         << "\"identitySource\":\"" << json_escape(identity_source) << "\","
         << "\"rawFingerprintTemplateStored\":" << (has_raw_fp ? "true" : "false") << ","
         << "\"rawFaceTemplateStored\":" << (has_raw_face ? "true" : "false")
         << "}"
         << "}";
    return body.str();
}

std::set<std::string> extract_employee_numbers_from_search_response(
    const std::string &response);

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

    const std::set<std::string> returned_employees =
        extract_employee_numbers_from_search_response(response);
    const bool exact_owner =
        ok && returned_employees.size() == 1 &&
        returned_employees.count(job.employee_no) == 1;
    emit_json({
        {"event", "source_user_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", exact_owner ? "true" : "false"},
        {"responseAccepted", ok ? "true" : "false"},
        {"returnedEmployeeCount", std::to_string(returned_employees.size())},
        {"exactEmployeePresent",
         returned_employees.count(job.employee_no) == 1 ? "true" : "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });

    if (exact_owner && user_json != nullptr) {
        *user_json = response;
    }
    return exact_owner;
}

std::string extract_enclosing_json_object(const std::string &json, size_t pos_inside);
std::string extract_string_field_from_json(
    const std::string &json,
    const std::string &field_name);
int extract_int_field_from_json(const std::string &json, const std::string &field_name);

std::string extract_card_object_for_employee(
    const std::string &response,
    const std::string &employee_no) {
    if (response.empty() || employee_no.empty()) {
        return "";
    }
    static const std::regex employee_regex("\"employeeNo\"\\s*:\\s*\"([^\"]+)\"");
    for (std::sregex_iterator it(response.begin(), response.end(), employee_regex), end;
         it != end;
         ++it) {
        if ((*it)[1].str() != employee_no) {
            continue;
        }
        const size_t pos = static_cast<size_t>((*it).position(0));
        const std::string object = extract_enclosing_json_object(response, pos);
        if (!object.empty() && !extract_string_field_from_json(object, "cardNo").empty()) {
            return object;
        }
    }
    // Some HCNetSDK STDXML responses wrap the single CardInfo record such that
    // object-bound extraction is not stable. A one-row response is still safe
    // when its complete employee set contains only the requested exact owner.
    const std::set<std::string> employees =
        extract_employee_numbers_from_search_response(response);
    const std::string sole_card_no = extract_string_field_from_json(response, "cardNo");
    if (employees.size() == 1 &&
        employees.count(employee_no) == 1 &&
        !sole_card_no.empty()) {
        return std::string("{\"employeeNo\":\"") + json_escape(employee_no) +
            "\",\"cardNo\":\"" + json_escape(sole_card_no) + "\"}";
    }
    return "";
}

bool read_source_card(DeviceSession &source, const ReconcileJob &job, std::string *card_json) {
    if (job.employee_no.empty()) {
        emit_json({
            {"event", "source_card_read_skipped"},
            {"reason", "missing_employee_no"},
            {"sourceDeviceId", source.config.hris_device_id}
        });
        return false;
    }

    std::ostringstream body;
    body << "{\"CardInfoSearchCond\":{\"searchID\":\"pt-card-"
         << json_escape(job.employee_no)
         << "\",\"searchResultPosition\":0,\"maxResults\":10,\"EmployeeNoList\":[{\"employeeNo\":\""
         << json_escape(job.employee_no)
         << "\"}]}}";

    std::string response;
    const bool filtered_ok = stdxml_json_request(
        source,
        "POST /ISAPI/AccessControl/CardInfo/Search?format=json",
        body.str(),
        &response);
    std::string exact_card = filtered_ok
        ? extract_card_object_for_employee(response, job.employee_no)
        : "";
    const std::set<std::string> filtered_employees =
        extract_employee_numbers_from_search_response(response);

    emit_json({
        {"event", "source_card_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"strategy", "filtered_exact_owner"},
        {"ok", !exact_card.empty() ? "true" : "false"},
        {"responseAccepted", filtered_ok ? "true" : "false"},
        {"returnedEmployeeCount", std::to_string(filtered_employees.size())},
        {"exactEmployeePresent",
         filtered_employees.count(job.employee_no) == 1 ? "true" : "false"},
        {"lastError", filtered_ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });

    if (!exact_card.empty()) {
        if (card_json != nullptr) {
            *card_json = std::string("{\"CardInfo\":") + exact_card + "}";
        }
        return true;
    }

    // Some deployed panels return an empty or failed response for EmployeeNoList
    // CardInfo searches even though the exact owned card is present. Fall back to a
    // complete, stable-search-ID inventory scan and accept only an exact employee owner.
    constexpr int request_page_size = 200;
    constexpr int max_pages = 100;
    const std::string search_id = "pt-card-full-" + job.employee_no;
    int position = 0;
    int total_matches = -1;
    int scanned_rows = 0;
    bool read_failed = false;
    for (int page = 0; page < max_pages; ++page) {
        std::ostringstream full_body;
        full_body << "{\"CardInfoSearchCond\":{\"searchID\":\""
                  << json_escape(search_id)
                  << "\",\"searchResultPosition\":" << position
                  << ",\"maxResults\":" << request_page_size << "}}";

        std::string full_response;
        const bool page_ok = stdxml_json_request(
            source,
            "POST /ISAPI/AccessControl/CardInfo/Search?format=json",
            full_body.str(),
            &full_response);
        if (!page_ok) {
            read_failed = true;
            emit_json({
                {"event", "source_card_inventory_page"},
                {"sourceDeviceId", source.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"ok", "false"},
                {"offset", std::to_string(position)},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
            break;
        }

        const int page_matches = extract_int_field_from_json(full_response, "numOfMatches");
        const int response_total = extract_int_field_from_json(full_response, "totalMatches");
        if (response_total >= 0) {
            total_matches = response_total;
        }
        exact_card = extract_card_object_for_employee(full_response, job.employee_no);
        const int advance = page_matches > 0
            ? page_matches
            : static_cast<int>(
                extract_employee_numbers_from_search_response(full_response).size());
        scanned_rows += std::max(advance, 0);

        emit_json({
            {"event", "source_card_inventory_page"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"ok", "true"},
            {"offset", std::to_string(position)},
            {"pageRows", std::to_string(std::max(advance, 0))},
            {"scannedRows", std::to_string(scanned_rows)},
            {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""},
            {"exactOwnerFound", !exact_card.empty() ? "true" : "false"}
        });

        if (!exact_card.empty()) {
            if (card_json != nullptr) {
                *card_json = std::string("{\"CardInfo\":") + exact_card + "}";
            }
            emit_json({
                {"event", "source_card_read"},
                {"sourceDeviceId", source.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"strategy", "full_inventory_exact_owner"},
                {"ok", "true"},
                {"scannedRows", std::to_string(scanned_rows)}
            });
            return true;
        }
        if (advance <= 0) {
            break;
        }
        position += advance;
        if ((total_matches >= 0 && position >= total_matches) ||
            (page_matches >= 0 && page_matches < request_page_size &&
             full_response.find("\"MORE\"") == std::string::npos &&
             full_response.find("\"More\"") == std::string::npos)) {
            break;
        }
    }

    emit_json({
        {"event", "source_card_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"strategy", "full_inventory_exact_owner"},
        {"ok", "false"},
        {"complete", !read_failed && total_matches >= 0 && position >= total_matches ? "true" : "false"},
        {"scannedRows", std::to_string(scanned_rows)},
        {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""}
    });
    return false;
}

std::string build_sync_card_no(const std::string &employee_no) {
    std::string digits;
    for (const char c : employee_no) {
        if (c >= '0' && c <= '9') digits.push_back(c);
    }
    if (digits.empty()) digits = "1";
    if (digits.size() > 10) digits = digits.substr(digits.size() - 10);
    return "98" + digits;
}

bool add_sync_card(DeviceSession &target, const std::string &employee_no, const std::string &card_no) {
    std::ostringstream body;
    body << "{\"CardInfo\":{\"employeeNo\":\"" << json_escape(employee_no)
         << "\",\"cardNo\":\"" << json_escape(card_no)
         << "\",\"cardType\":\"normalCard\",\"checkCardNo\":true}}";
    std::string response;
    const bool ok = stdxml_json_request(
        target,
        "POST /ISAPI/AccessControl/CardInfo/Record?format=json",
        body.str(),
        &response);
    emit_json({
        {"event", "peer_sync_card"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardPresent", "true"},
        {"ok", ok ? "true" : "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
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

// Expand from a position inside a JSON object to the full {...} object bounds.
std::string extract_enclosing_json_object(const std::string &json, size_t pos_inside) {
    if (json.empty() || pos_inside >= json.size()) {
        return "";
    }
    // Walk left to the matching '{' for this object.
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
    // Walk right from start to matching '}'.
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

// Parse per-user name/numOfFP/numOfFace from a UserInfo/Search page.
// Uses enclosing JSON object so name fields that appear BEFORE employeeNo are captured.
void extract_userinfo_touch_from_response(
    const std::string &response,
    std::map<std::string, UserInfoTouchSnapshot> *out) {
    if (out == nullptr || response.empty()) {
        return;
    }
    static const std::regex employee_regex("\"employeeNo\"\\s*:\\s*\"([^\"]+)\"");
    for (std::sregex_iterator it(response.begin(), response.end(), employee_regex), end;
         it != end;
         ++it) {
        const std::string employee_no = (*it)[1].str();
        if (employee_no.empty()) {
            continue;
        }
        const size_t pos = static_cast<size_t>((*it).position(0));
        std::string window = extract_enclosing_json_object(response, pos);
        if (window.empty()) {
            // Fallback: look both before and after employeeNo (name often precedes it).
            const size_t left = pos > 250 ? pos - 250 : 0;
            const size_t right = std::min(response.size(), pos + 500);
            window = response.substr(left, right - left);
        }
        UserInfoTouchSnapshot snap;
        snap.name = extract_string_field_from_json(window, "name");
        snap.num_of_fp = extract_int_field_from_json(window, "numOfFP");
        if (snap.num_of_fp < 0) {
            snap.num_of_fp = extract_int_field_from_json(window, "numOfFingerPrint");
        }
        snap.num_of_face = extract_int_field_from_json(window, "numOfFace");
        (*out)[employee_no] = snap;
    }
}

// Full UserInfo touch map (employeeNo -> name|numOfFP|numOfFace). Shares inventory_read_mutex.
std::map<std::string, UserInfoTouchSnapshot> read_device_userinfo_touch_map(
    DeviceSession &device,
    bool *complete_out = nullptr) {
    std::lock_guard<std::mutex> inventory_lock(inventory_read_mutex);
    if (complete_out != nullptr) {
        *complete_out = false;
    }
    constexpr int request_page_size = 30;
    std::map<std::string, UserInfoTouchSnapshot> touches;
    int position = 0;
    int total_matches = -1;
    bool read_failed = false;
    const std::string search_id =
        "pt-touch-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count());

    for (int page = 0; page < 80 && position < 4000; ++page) {
        std::ostringstream body;
        body << "{\"UserInfoSearchCond\":{\"searchID\":\"" << search_id
             << "\",\"searchResultPosition\":" << position
             << ",\"maxResults\":" << request_page_size << "}}";

        std::string response;
        const bool ok = stdxml_json_request(
            device,
            "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
            body.str(),
            &response);
        if (!ok) {
            read_failed = true;
            emit_json({
                {"event", "source_userinfo_touch_read"},
                {"sourceDeviceId", device.config.hris_device_id},
                {"ok", "false"},
                {"offset", std::to_string(position)},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
            break;
        }
        {
            static const std::regex total_regex("\"totalMatches\"\\s*:\\s*([0-9]+)");
            std::smatch m;
            if (std::regex_search(response, m, total_regex) && m.size() > 1) {
                try {
                    total_matches = std::stoi(m[1].str());
                } catch (...) {
                }
            }
        }
        const bool more =
            response.find("\"responseStatusStrg\"") != std::string::npos &&
            (response.find("\"MORE\"") != std::string::npos ||
             response.find("\"More\"") != std::string::npos ||
             response.find(":\"MORE\"") != std::string::npos);

        const size_t before = touches.size();
        extract_userinfo_touch_from_response(response, &touches);
        const int page_count = static_cast<int>(touches.size() - before);
        // Prefer page employee count from employeeNo extraction when windowing misses some.
        const int employee_page_count =
            static_cast<int>(extract_employee_numbers_from_search_response(response).size());
        const int advance = employee_page_count > 0 ? employee_page_count : page_count;

        emit_json({
            {"event", "source_userinfo_touch_read"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"ok", "true"},
            {"offset", std::to_string(position)},
            {"pageEmployees", std::to_string(advance)},
            {"totalSoFar", std::to_string(touches.size())},
            {"more", more ? "true" : "false"}
        });

        if (advance <= 0) {
            break;
        }
        position += advance;
        if (total_matches >= 0 && static_cast<int>(touches.size()) >= total_matches) {
            break;
        }
        if (!more && advance < request_page_size) {
            break;
        }
    }

    const bool complete =
        !read_failed &&
        (total_matches < 0 || static_cast<int>(touches.size()) >= total_matches);
    if (complete_out != nullptr) {
        *complete_out = complete;
    }
    if (!complete) {
        emit_json({
            {"event", "source_userinfo_touch_incomplete"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"employeeCount", std::to_string(touches.size())}
        });
        return {};
    }
    return touches;
}

void seed_userinfo_touch_baseline_for_session(DeviceSession &device) {
    bool complete = false;
    const auto current = read_device_userinfo_touch_map(device, &complete);
    if (!complete || current.empty()) {
        emit_json({
            {"event", "userinfo_touch_baseline_seed_failed"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host}
        });
        return;
    }
    std::lock_guard<std::mutex> lock(userinfo_touch_mutex);
    userinfo_touch_baseline_by_host[device.config.host] = current;
    userinfo_touch_baseline_ready_hosts.insert(device.config.host);
    emit_json({
        {"event", "userinfo_touch_baseline_seeded"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"sourceHost", device.config.host},
        {"employeeCount", std::to_string(current.size())}
    });
}

// When ACS person empty and inventory_delta has no NEW plain (modify of existing person),
// resolve plain id from UserInfo field changes (name / numOfFP / numOfFace). Device truth only.
std::string resolve_plain_employee_no_from_userinfo_touch(DeviceSession &device) {
    bool complete = false;
    const auto current = read_device_userinfo_touch_map(device, &complete);
    if (!complete || current.empty()) {
        emit_json({
            {"event", "callback_identity_userinfo_touch_incomplete"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host}
        });
        return "";
    }

    std::lock_guard<std::mutex> lock(userinfo_touch_mutex);
    auto &baseline = userinfo_touch_baseline_by_host[device.config.host];
    if (userinfo_touch_baseline_ready_hosts.find(device.config.host) ==
        userinfo_touch_baseline_ready_hosts.end()) {
        baseline = current;
        userinfo_touch_baseline_ready_hosts.insert(device.config.host);
        emit_json({
            {"event", "callback_identity_userinfo_touch_baseline"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host},
            {"employeeCount", std::to_string(current.size())},
            {"note", "late_baseline"}
        });
        return "";
    }

    std::vector<std::string> changed;
    for (const auto &entry : current) {
        const auto found = baseline.find(entry.first);
        if (found == baseline.end() ||
            found->second.fingerprint() != entry.second.fingerprint()) {
            changed.push_back(entry.first);
        }
    }
    // Always advance baseline so the same edit is not re-reported forever.
    baseline = current;

    if (changed.empty()) {
        emit_json({
            {"event", "callback_identity_userinfo_touch_no_change"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host},
            {"employeeCount", std::to_string(current.size())}
        });
        return "";
    }

    std::string plain;
    if (changed.size() == 1) {
        plain = changed.front();
    } else {
        // Multiple field changes are ambiguous. Resolve only when exactly one changed
        // person is also present in the recent device-evidence candidate set.
        const auto recent = get_recent_employee_candidates_for_host(device.config.host);
        std::set<std::string> changed_set(changed.begin(), changed.end());
        std::vector<std::string> intersections;
        for (const auto &candidate : recent) {
            if (changed_set.find(candidate) != changed_set.end()) {
                intersections.push_back(candidate);
            }
        }
        std::sort(intersections.begin(), intersections.end());
        intersections.erase(std::unique(intersections.begin(), intersections.end()), intersections.end());
        if (intersections.size() == 1) {
            plain = intersections.front();
        }
    }

    emit_json({
        {"event", "callback_identity_userinfo_touch"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"sourceHost", device.config.host},
        {"changedCount", std::to_string(changed.size())},
        {"employeeNo", plain}
    });
    return plain;
}

// Full UserInfo inventory. Critical: many Hikvision firmwares return at most ~30
// rows even when maxResults is larger. Never advance by requested page_size alone
// and never stop just because page_count < requested maxResults when MORE remains.
std::vector<std::string> read_device_employee_numbers(DeviceSession &device, bool *complete_out = nullptr) {
    std::lock_guard<std::mutex> inventory_lock(inventory_read_mutex);
    if (complete_out != nullptr) {
        *complete_out = false;
    }
    constexpr int request_page_size = 30;
    std::set<std::string> employee_numbers;
    int position = 0;
    int total_matches = -1;
    bool read_failed = false;
    const std::string search_id =
        "pt-inv-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count());

    for (int page = 0; page < 80 && position < 4000; ++page) {
        std::ostringstream body;
        body << "{\"UserInfoSearchCond\":{\"searchID\":\"" << search_id
             << "\",\"searchResultPosition\":" << position
             << ",\"maxResults\":" << request_page_size << "}}";

        std::string response;
        const bool ok = stdxml_json_request(
            device,
            "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
            body.str(),
            &response);

        if (!ok) {
            read_failed = true;
            emit_json({
                {"event", "source_user_inventory_read"},
                {"sourceDeviceId", device.config.hris_device_id},
                {"ok", "false"},
                {"offset", std::to_string(position)},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
            break;
        }

        // Parse totals / MORE flag from this page.
        {
            static const std::regex total_regex("\"totalMatches\"\\s*:\\s*([0-9]+)");
            static const std::regex num_regex("\"numOfMatches\"\\s*:\\s*([0-9]+)");
            std::smatch m;
            if (std::regex_search(response, m, total_regex) && m.size() > 1) {
                try {
                    total_matches = std::stoi(m[1].str());
                } catch (...) {
                }
            }
            (void)num_regex;
        }
        const bool more =
            response.find("\"responseStatusStrg\"") != std::string::npos &&
            (response.find("\"MORE\"") != std::string::npos ||
             response.find("\"More\"") != std::string::npos ||
             response.find(":\"MORE\"") != std::string::npos);

        const std::set<std::string> page_employee_numbers =
            extract_employee_numbers_from_search_response(response);
        const size_t before = employee_numbers.size();
        employee_numbers.insert(page_employee_numbers.begin(), page_employee_numbers.end());
        const int page_count = static_cast<int>(page_employee_numbers.size());
        const int added = static_cast<int>(employee_numbers.size() - before);

        emit_json({
            {"event", "source_user_inventory_read"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"ok", "true"},
            {"offset", std::to_string(position)},
            {"pageEmployees", std::to_string(page_count)},
            {"added", std::to_string(added)},
            {"totalSoFar", std::to_string(employee_numbers.size())},
            {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""},
            {"more", more ? "true" : "false"}
        });

        if (page_count <= 0) {
            break;
        }

        // Advance by actual returned row count (device page size), not request_page_size.
        position += page_count;

        if (total_matches >= 0 && static_cast<int>(employee_numbers.size()) >= total_matches) {
            break;
        }
        if (!more && page_count < request_page_size && added == 0) {
            break;
        }
        // If device returns a full native page, keep going even when page_count < 64.
        if (!more && page_count < request_page_size) {
            // Last short page without MORE → done.
            break;
        }
        // Guard against infinite loops if position does not advance uniquely.
        if (added == 0 && !more) {
            break;
        }
    }

    emit_json({
        {"event", "source_user_inventory_complete"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"employeeCount", std::to_string(employee_numbers.size())},
        {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""},
        {"complete", (!read_failed && (total_matches < 0 || static_cast<int>(employee_numbers.size()) >= total_matches)) ? "true" : "false"}
    });

    const bool complete =
        !read_failed &&
        (total_matches < 0 || static_cast<int>(employee_numbers.size()) >= total_matches);
    if (!complete) {
        emit_json({
            {"event", "source_user_inventory_incomplete_discarded"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"employeeCount", std::to_string(employee_numbers.size())},
            {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""}
        });
        return {};
    }
    if (complete_out != nullptr) {
        *complete_out = true;
    }

    return std::vector<std::string>(employee_numbers.begin(), employee_numbers.end());
}

std::vector<std::string> find_missing_employee_numbers(
    const std::vector<std::string> &source_employee_numbers,
    const std::vector<std::string> &target_employee_numbers) {
    std::set<std::string> target_set(target_employee_numbers.begin(), target_employee_numbers.end());
    std::vector<std::string> missing;
    for (const auto &employee_no : source_employee_numbers) {
        if (!employee_no.empty() && target_set.find(employee_no) == target_set.end()) {
            missing.push_back(employee_no);
        }
    }
    return missing;
}

struct FingerprintReadContext {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    bool failed = false;
    bool saw_failure = false;
    int status_packets = 0;
    int records = 0;
    std::string device_id;
    std::string employee_no;
    std::string operation;
    std::chrono::steady_clock::time_point last_activity = std::chrono::steady_clock::now();
    std::vector<NET_DVR_FINGER_PRINT_CFG_V50> templates;
};

struct FingerprintCaptureContext {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    bool ok = false;
    bool has_data = false;
    DWORD sdk_error = 0;
    NET_DVR_CAPTURE_FINGERPRINT_CFG capture{};
    std::chrono::steady_clock::time_point last_activity = std::chrono::steady_clock::now();
};

struct FaceCaptureContext {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    bool failed = false;
    BYTE progress = 0;
    std::vector<char> face_template;
    std::vector<char> face_picture;
};

struct FaceWriteContext {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    bool ok = false;
};

struct FaceReadContext {
    std::mutex mutex;
    std::condition_variable cv;
    bool done = false;
    bool failed = false;
    DWORD sdk_error = 0;
    std::vector<char> face_template;
    std::vector<char> face_picture;
};

void CALLBACK face_capture_callback(DWORD type, void *buffer, DWORD buffer_length, void *user_data) {
    auto *ctx = reinterpret_cast<FaceCaptureContext *>(user_data);
    if (ctx == nullptr) return;
    std::lock_guard<std::mutex> lock(ctx->mutex);
    if (type == NET_SDK_CALLBACK_TYPE_STATUS && buffer != nullptr && buffer_length >= sizeof(DWORD)) {
        const DWORD status = *reinterpret_cast<DWORD *>(buffer);
        ctx->failed = status == NET_SDK_CALLBACK_STATUS_FAILED;
        if (ctx->failed) ctx->done = true;
    } else if (type == NET_SDK_CALLBACK_TYPE_DATA && buffer != nullptr &&
               buffer_length >= sizeof(NET_DVR_CAPTURE_FACE_CFG)) {
        auto *face = reinterpret_cast<NET_DVR_CAPTURE_FACE_CFG *>(buffer);
        ctx->progress = face->byCaptureProgress;
        if (face->byCaptureProgress >= 100) {
            if (face->pFaceTemplate1Buffer != nullptr && face->dwFaceTemplate1Size > 0) {
                ctx->face_template.assign(
                    face->pFaceTemplate1Buffer,
                    face->pFaceTemplate1Buffer + face->dwFaceTemplate1Size);
            }
            if (face->pFacePicBuffer != nullptr && face->dwFacePicSize > 0) {
                ctx->face_picture.assign(
                    face->pFacePicBuffer,
                    face->pFacePicBuffer + face->dwFacePicSize);
            }
            ctx->done = !ctx->face_template.empty() && !ctx->face_picture.empty();
        }
    }
    ctx->cv.notify_all();
}

void CALLBACK face_write_callback(DWORD type, void *buffer, DWORD buffer_length, void *user_data) {
    auto *ctx = reinterpret_cast<FaceWriteContext *>(user_data);
    if (ctx == nullptr) return;
    std::lock_guard<std::mutex> lock(ctx->mutex);
    if (type == NET_SDK_CALLBACK_TYPE_STATUS && buffer != nullptr && buffer_length >= sizeof(DWORD)) {
        const DWORD status = *reinterpret_cast<DWORD *>(buffer);
        ctx->ok = status == NET_SDK_CALLBACK_STATUS_SUCCESS;
        if (status == NET_SDK_CALLBACK_STATUS_FAILED || status == NET_SDK_CALLBACK_STATUS_SUCCESS) {
            ctx->done = true;
        }
    } else if (type == NET_SDK_CALLBACK_TYPE_DATA && buffer != nullptr &&
               buffer_length >= sizeof(NET_DVR_FACE_AND_TEMPLATE_STATUS)) {
        auto *status = reinterpret_cast<NET_DVR_FACE_AND_TEMPLATE_STATUS *>(buffer);
        ctx->ok = status->byRecvStatus == 1;
        ctx->done = true;
    }
    ctx->cv.notify_all();
}

void CALLBACK face_read_callback(DWORD type, void *buffer, DWORD buffer_length, void *user_data) {
    auto *ctx = reinterpret_cast<FaceReadContext *>(user_data);
    if (ctx == nullptr) return;
    std::lock_guard<std::mutex> lock(ctx->mutex);
    if (type == NET_SDK_CALLBACK_TYPE_DATA && buffer != nullptr &&
        buffer_length >= sizeof(NET_DVR_FACE_AND_TEMPLATE_CFG)) {
        auto *record = reinterpret_cast<NET_DVR_FACE_AND_TEMPLATE_CFG *>(buffer);
        if (record->pFaceTemplateBuffer != nullptr && record->dwFaceTemplateLen > 0) {
            ctx->face_template.assign(
                record->pFaceTemplateBuffer,
                record->pFaceTemplateBuffer + record->dwFaceTemplateLen);
        }
        if (record->pFaceBuffer != nullptr && record->dwFaceLen > 0) {
            ctx->face_picture.assign(
                record->pFaceBuffer,
                record->pFaceBuffer + record->dwFaceLen);
        }
    } else if (type == NET_SDK_CALLBACK_TYPE_STATUS && buffer != nullptr &&
               buffer_length >= sizeof(DWORD)) {
        DWORD status = 0;
        std::memcpy(&status, buffer, sizeof(status));
        if (status == NET_SDK_CALLBACK_STATUS_SUCCESS) {
            ctx->done = true;
        } else if (status == NET_SDK_CALLBACK_STATUS_FAILED ||
                   status == NET_SDK_CALLBACK_STATUS_EXCEPTION) {
            ctx->failed = true;
            ctx->done = true;
            if (buffer_length >= sizeof(DWORD) * 2) {
                std::memcpy(&ctx->sdk_error,
                            reinterpret_cast<const char *>(buffer) + sizeof(DWORD),
                            sizeof(DWORD));
            }
        }
    }
    ctx->cv.notify_all();
}

void CALLBACK fingerprint_callback(DWORD type, void *buffer, DWORD buffer_length, void *user_data) {
    auto *ctx = reinterpret_cast<FingerprintReadContext *>(user_data);
    if (ctx == nullptr) {
        return;
    }

    std::lock_guard<std::mutex> lock(ctx->mutex);
    ctx->last_activity = std::chrono::steady_clock::now();
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
            status.byCardReaderRecvStatus[status.dwCardReaderNo] != 1 &&
            status.byCardReaderRecvStatus[status.dwCardReaderNo] != 8;
        emit_json({
            {"event", "fingerprint_remote_status"},
            {"targetDeviceId", ctx->device_id},
            {"employeeNo", ctx->employee_no},
            {"operation", ctx->operation},
            {"recvStatus", std::to_string(status.byRecvStatus)},
            {"readerRecvStatus", status.dwCardReaderNo < MAX_CARD_READER_NUM_512
                ? std::to_string(status.byCardReaderRecvStatus[status.dwCardReaderNo])
                : "out_of_range"},
            {"fingerPrintId", std::to_string(status.byFingerPrintID)},
            {"fingerType", std::to_string(status.byFingerType)},
            {"cardReaderNo", std::to_string(status.dwCardReaderNo)}
        });
        if (status.byRecvStatus != 0 || reader_failed) {
            ctx->saw_failure = true;
        }
    } else if (type == NET_SDK_CALLBACK_TYPE_STATUS) {
        if (buffer != nullptr && buffer_length >= sizeof(DWORD)) {
            DWORD status = 0;
            std::memcpy(&status, buffer, sizeof(status));
            ctx->status_packets += 1;
            if (status == NET_SDK_CALLBACK_STATUS_SUCCESS ||
                status == NET_SDK_REMOTE_CONFIG_STATUS_SUCCESS) {
                ctx->done = true;
            } else if (status == NET_SDK_CALLBACK_STATUS_FAILED ||
                status == NET_SDK_CALLBACK_STATUS_EXCEPTION ||
                status == NET_SDK_REMOTE_CONFIG_STATUS_FAILED) {
                ctx->failed = true;
                ctx->done = true;
            }
        }
    }
    ctx->cv.notify_all();
}

void CALLBACK fingerprint_capture_callback(DWORD type, void *buffer, DWORD buffer_length, void *user_data) {
    auto *ctx = reinterpret_cast<FingerprintCaptureContext *>(user_data);
    if (ctx == nullptr) {
        return;
    }

    std::lock_guard<std::mutex> lock(ctx->mutex);
    ctx->last_activity = std::chrono::steady_clock::now();
    if (type == NET_SDK_CALLBACK_TYPE_DATA &&
        buffer != nullptr &&
        buffer_length >= sizeof(NET_DVR_CAPTURE_FINGERPRINT_CFG)) {
        NET_DVR_CAPTURE_FINGERPRINT_CFG capture{};
        std::memcpy(&capture, buffer, sizeof(capture));
        capture.pFingerPrintPicBuffer = nullptr;
        if (capture.dwFingerPrintDataSize > 0) {
            ctx->capture = capture;
            ctx->has_data = true;
        }
    } else if (type == NET_SDK_CALLBACK_TYPE_STATUS &&
        buffer != nullptr &&
        buffer_length >= sizeof(DWORD)) {
        DWORD status = 0;
        std::memcpy(&status, buffer, sizeof(status));
        if (status == NET_SDK_CALLBACK_STATUS_SUCCESS ||
            status == NET_SDK_REMOTE_CONFIG_STATUS_SUCCESS) {
            ctx->ok = ctx->has_data;
            ctx->done = true;
        } else if (status == NET_SDK_CALLBACK_STATUS_FAILED ||
            status == NET_SDK_CALLBACK_STATUS_EXCEPTION ||
            status == NET_SDK_REMOTE_CONFIG_STATUS_FAILED) {
            ctx->ok = false;
            ctx->done = true;
            if (buffer_length >= sizeof(DWORD) * 2) {
                std::memcpy(&ctx->sdk_error, reinterpret_cast<const char *>(buffer) + sizeof(DWORD), sizeof(DWORD));
            }
        }
    }
    ctx->cv.notify_all();
}

bool wait_for_fingerprint_remote_config(
    FingerprintReadContext &ctx,
    std::chrono::milliseconds total_timeout,
    std::chrono::milliseconds settle_timeout) {
    const auto deadline = std::chrono::steady_clock::now() + total_timeout;
    std::unique_lock<std::mutex> lock(ctx.mutex);
    while (true) {
        if (ctx.done) {
            return !ctx.failed;
        }
        const auto now = std::chrono::steady_clock::now();
        if (now >= deadline) {
            return false;
        }
        const auto idle = now - ctx.last_activity;
        if ((ctx.records > 0 || ctx.status_packets > 0) && idle >= settle_timeout) {
            return !ctx.failed && !ctx.saw_failure;
        }
        const auto remaining = deadline - now;
        const auto wait_time = remaining < std::chrono::milliseconds(200)
            ? remaining
            : std::chrono::milliseconds(200);
        ctx.cv.wait_for(lock, wait_time);
    }
}

bool wait_for_fingerprint_capture(
    FingerprintCaptureContext &ctx,
    std::chrono::milliseconds total_timeout,
    std::chrono::milliseconds settle_timeout) {
    const auto deadline = std::chrono::steady_clock::now() + total_timeout;
    std::unique_lock<std::mutex> lock(ctx.mutex);
    while (true) {
        if (ctx.done) {
            return ctx.ok && ctx.has_data;
        }
        const auto now = std::chrono::steady_clock::now();
        if (now >= deadline) {
            return ctx.has_data;
        }
        const auto idle = now - ctx.last_activity;
        if (ctx.has_data && idle >= settle_timeout) {
            return true;
        }
        const auto remaining = deadline - now;
        const auto wait_time = remaining < std::chrono::milliseconds(200)
            ? remaining
            : std::chrono::milliseconds(200);
        ctx.cv.wait_for(lock, wait_time);
    }
}

bool capture_fingerprint_template(
    DeviceSession &source,
    BYTE finger_no,
    NET_DVR_CAPTURE_FINGERPRINT_CFG *capture,
    std::chrono::milliseconds total_timeout) {
    if (capture == nullptr) {
        return false;
    }

    NET_DVR_CAPTURE_FINGERPRINT_COND cond{};
    cond.dwSize = sizeof(cond);
    cond.byFingerPrintPicType = 0;
    cond.byFingerNo = finger_no;

    FingerprintCaptureContext ctx;
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
    const LONG handle = NET_DVR_StartRemoteConfig(
        source.user_id,
        NET_DVR_CAPTURE_FINGERPRINT_INFO,
        &cond,
        sizeof(cond),
        fingerprint_capture_callback,
        &ctx);

    if (handle < 0) {
        emit_json({
            {"event", "source_fingerprint_capture"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"fingerNo", std::to_string(finger_no)},
            {"ok", "false"},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        return false;
    }

    const bool wait_ok = wait_for_fingerprint_capture(
        ctx,
        total_timeout,
        std::chrono::milliseconds(500));
    NET_DVR_StopRemoteConfig(handle);
    sdk_lock.unlock();

    emit_json({
        {"event", "source_fingerprint_capture"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"fingerNo", std::to_string(finger_no)},
        {"ok", wait_ok && ctx.has_data ? "true" : "false"},
        {"dataSize", std::to_string(ctx.capture.dwFingerPrintDataSize)},
        {"quality", std::to_string(ctx.capture.byFingerPrintQuality)},
        {"lastError", wait_ok && ctx.has_data ? "0" : std::to_string(ctx.sdk_error)}
    });

    if (!wait_ok || !ctx.has_data) {
        return false;
    }

    *capture = ctx.capture;
    return true;
}

bool capture_face_template(
    DeviceSession &source,
    std::vector<char> *face_template,
    std::vector<char> *face_picture) {
    NET_DVR_CAPTURE_FACE_COND cond{};
    cond.dwSize = sizeof(cond);
    FaceCaptureContext ctx;
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
    const LONG handle = NET_DVR_StartRemoteConfig(
        source.user_id,
        NET_DVR_CAPTURE_FACE_INFO,
        &cond,
        sizeof(cond),
        face_capture_callback,
        &ctx);
    if (handle < 0) {
        emit_json({
            {"event", "source_face_capture"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"ok", "false"},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        return false;
    }
    {
        std::unique_lock<std::mutex> lock(ctx.mutex);
        ctx.cv.wait_for(lock, std::chrono::seconds(30), [&ctx] { return ctx.done || ctx.failed; });
    }
    NET_DVR_StopRemoteConfig(handle);
    sdk_lock.unlock();
    const bool ok = !ctx.failed && !ctx.face_template.empty() && !ctx.face_picture.empty();
    if (ok) {
        *face_template = ctx.face_template;
        *face_picture = ctx.face_picture;
    }
    emit_json({
        {"event", "source_face_capture"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"ok", ok ? "true" : "false"},
        {"progress", std::to_string(ctx.progress)},
        {"templateSize", std::to_string(ctx.face_template.size())},
        {"pictureSize", std::to_string(ctx.face_picture.size())},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    return ok;
}

bool write_face_and_template(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no,
    const std::vector<char> &face_template,
    const std::vector<char> &face_picture,
    bool redact_card_no = false) {
    const auto operation_started_at = std::chrono::steady_clock::now();
    const auto elapsed_ms = [&]() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - operation_started_at).count();
    };
    if (!execute_mode) {
        emit_json({
            {"event", "peer_face_write_preview"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"cardNo", card_no.empty() ? "" : "[redacted]"},
            {"templateSize", std::to_string(face_template.size())},
            {"pictureSize", std::to_string(face_picture.size())},
            {"wouldCall", "NET_DVR_SET_FACE_AND_TEMPLATE"}
        });
        return !face_template.empty() && !face_picture.empty();
    }
    NET_DVR_FACE_AND_TEMPLATE_COND cond{};
    cond.dwSize = sizeof(cond);
    cond.dwFaceNum = 1;
    std::strncpy(reinterpret_cast<char *>(cond.byCardNo), card_no.c_str(), ACS_CARD_NO_LEN - 1);
    FaceWriteContext ctx;
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
    const auto remote_config_started_at = std::chrono::steady_clock::now();
    const LONG handle = NET_DVR_StartRemoteConfig(
        target.user_id,
        NET_DVR_SET_FACE_AND_TEMPLATE,
        &cond,
        sizeof(cond),
        face_write_callback,
        &ctx);
    const auto start_remote_config_ms =
        std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - remote_config_started_at).count();
    if (handle < 0) {
        emit_json({
            {"event", "peer_face_write"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"startRemoteConfigMs", std::to_string(start_remote_config_ms)},
            {"durationMs", std::to_string(elapsed_ms())},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        return false;
    }
    NET_DVR_FACE_AND_TEMPLATE_CFG record{};
    record.dwSize = sizeof(record);
    std::strncpy(reinterpret_cast<char *>(record.byCardNo), card_no.c_str(), ACS_CARD_NO_LEN - 1);
    record.dwFaceLen = static_cast<DWORD>(face_picture.size());
    record.pFaceBuffer = const_cast<char *>(face_picture.data());
    record.dwFaceTemplateLen = static_cast<DWORD>(face_template.size());
    record.pFaceTemplateBuffer = const_cast<char *>(face_template.data());
    const auto send_started_at = std::chrono::steady_clock::now();
    const BOOL send_ok = NET_DVR_SendRemoteConfig(
        handle,
        ENUM_ACS_SEND_DATA,
        reinterpret_cast<char *>(&record),
        sizeof(record));
    if (send_ok == TRUE) {
        std::unique_lock<std::mutex> lock(ctx.mutex);
        ctx.cv.wait_for(lock, std::chrono::seconds(10), [&ctx] { return ctx.done; });
    }
    const auto send_and_callback_ms =
        std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - send_started_at).count();
    NET_DVR_StopRemoteConfig(handle);
    sdk_lock.unlock();
    const bool ok = send_ok == TRUE && ctx.ok;
    emit_json({
        {"event", "peer_face_write"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"ok", ok ? "true" : "false"},
        {"templateSize", std::to_string(face_template.size())},
        {"pictureSize", std::to_string(face_picture.size())},
        {"startRemoteConfigMs", std::to_string(start_remote_config_ms)},
        {"sendAndCallbackMs", std::to_string(send_and_callback_ms)},
        {"callbackCompleted", ctx.done ? "true" : "false"},
        {"durationMs", std::to_string(elapsed_ms())},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    return ok;
}

bool read_face_and_template(
    DeviceSession &source,
    const std::string &employee_no,
    const std::string &card_no,
    std::vector<char> *face_template,
    std::vector<char> *face_picture,
    bool redact_card_no = false) {
    NET_DVR_FACE_AND_TEMPLATE_COND cond{};
    cond.dwSize = sizeof(cond);
    cond.dwFaceNum = 1;
    std::strncpy(reinterpret_cast<char *>(cond.byCardNo), card_no.c_str(), ACS_CARD_NO_LEN - 1);
    FaceReadContext ctx;
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
    const LONG handle = NET_DVR_StartRemoteConfig(
        source.user_id,
        NET_DVR_GET_FACE_AND_TEMPLATE,
        &cond,
        sizeof(cond),
        face_read_callback,
        &ctx);
    if (handle < 0) {
        emit_json({
            {"event", "source_face_read"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", employee_no},
            {"cardNo", card_no.empty() ? "" : "[redacted]"},
            {"ok", "false"},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        return false;
    }
    {
        std::unique_lock<std::mutex> lock(ctx.mutex);
        ctx.cv.wait_for(lock, std::chrono::seconds(10), [&ctx] { return ctx.done; });
    }
    NET_DVR_StopRemoteConfig(handle);
    sdk_lock.unlock();
    const bool ok = !ctx.failed && !ctx.face_template.empty() && !ctx.face_picture.empty();
    if (ok) {
        *face_template = ctx.face_template;
        *face_picture = ctx.face_picture;
    }
    emit_json({
        {"event", "source_face_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"ok", ok ? "true" : "false"},
        {"templateSize", std::to_string(ctx.face_template.size())},
        {"pictureSize", std::to_string(ctx.face_picture.size())},
        {"lastError", ok ? "0" : std::to_string(ctx.sdk_error ? ctx.sdk_error : NET_DVR_GetLastError())}
    });
    return ok;
}

std::string extract_string_field_from_json(
    const std::string &json,
    const std::string &field_name);

bool target_card_allows_owner(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no,
    bool *already_owned_by_employee) {
    if (already_owned_by_employee != nullptr) *already_owned_by_employee = false;
    std::ostringstream body;
    body << "{\"CardInfoSearchCond\":{\"searchID\":\"pt-card-owner-"
         << json_escape(employee_no)
         << "\",\"searchResultPosition\":0,\"maxResults\":5,\"CardNoList\":[{\"cardNo\":\""
         << json_escape(card_no) << "\"}]}}";
    std::string response;
    const bool read_ok = stdxml_json_request(
        target,
        "POST /ISAPI/AccessControl/CardInfo/Search?format=json",
        body.str(),
        &response);
    if (!read_ok) {
        emit_json({
            {"event", "peer_card_owner_probe"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"reason", "target_card_owner_read_failed"}
        });
        return false;
    }
    const std::string owner = extract_string_field_from_json(response, "employeeNo");
    if (!owner.empty() && owner != employee_no) {
        emit_json({
            {"event", "peer_card_owner_conflict"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"existingOwner", owner},
            {"ok", "false"}
        });
        return false;
    }
    if (already_owned_by_employee != nullptr) {
        *already_owned_by_employee = owner == employee_no;
    }
    return true;
}

bool add_sync_card_if_unowned(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no) {
    bool already_owned = false;
    if (!target_card_allows_owner(target, employee_no, card_no, &already_owned)) {
        return false;
    }
    if (already_owned) {
        emit_json({
            {"event", "peer_sync_card"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"cardPresent", "true"},
            {"ok", "true"},
            {"retained", "true"}
        });
        return true;
    }
    return add_sync_card(target, employee_no, card_no);
}

struct StoredFaceWritePayload {
    std::string target_device_id;
    std::string employee_no;
    std::string card_no;
    std::vector<char> face_template;
    std::vector<char> face_picture;
};

bool load_stored_face_write_payload(
    const std::string &payload_path,
    StoredFaceWritePayload *payload,
    std::string *reason) {
    const int payload_fd = open(payload_path.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (payload_fd < 0) {
        *reason = "payload_open_failed";
        return false;
    }
    struct stat file_stat {};
    if (fstat(payload_fd, &file_stat) != 0) {
        close(payload_fd);
        *reason = "payload_stat_failed";
        return false;
    }
    if (!S_ISREG(file_stat.st_mode) || file_stat.st_uid != geteuid()) {
        close(payload_fd);
        *reason = "payload_owner_or_type_invalid";
        return false;
    }
    if ((file_stat.st_mode & 0777) != 0600) {
        close(payload_fd);
        *reason = "payload_permissions_must_be_0600";
        return false;
    }
    if (file_stat.st_size <= 0 || file_stat.st_size > 16 * 1024 * 1024) {
        close(payload_fd);
        *reason = "payload_size_invalid";
        return false;
    }
    std::string body(static_cast<size_t>(file_stat.st_size), '\0');
    size_t offset = 0;
    while (offset < body.size()) {
        const ssize_t count = read(payload_fd, &body[offset], body.size() - offset);
        if (count <= 0) break;
        offset += static_cast<size_t>(count);
    }
    close(payload_fd);
    if (offset != body.size()) {
        *reason = "payload_read_failed";
        return false;
    }
    payload->target_device_id = extract_string_field_from_json(body, "targetDeviceId");
    payload->employee_no = extract_string_field_from_json(body, "employeeNo");
    payload->card_no = extract_string_field_from_json(body, "cardNo");
    const std::string template_b64 = extract_string_field_from_json(body, "faceTemplate");
    const std::string picture_b64 = extract_string_field_from_json(body, "facePicture");
    if (payload->target_device_id.empty() || payload->employee_no.empty() ||
        payload->card_no.empty()) {
        *reason = "payload_identity_or_card_missing";
        return false;
    }
    if (!base64_decode(template_b64, &payload->face_template) ||
        !base64_decode(picture_b64, &payload->face_picture)) {
        *reason = "payload_face_template_and_picture_required";
        return false;
    }
    return true;
}

std::string stored_face_lock_path(const std::string &device_id) {
    std::string safe;
    safe.reserve(device_id.size());
    for (unsigned char c : device_id) {
        safe.push_back(std::isalnum(c) || c == '-' || c == '_' ? static_cast<char>(c) : '_');
    }
    return "/tmp/project-truth-hikvision-face-" + safe + ".lock";
}

bool write_stored_face_with_reread(
    DeviceSession &target,
    const StoredFaceWritePayload &payload) {
    const auto operation_started_at = std::chrono::steady_clock::now();
    const std::string lock_path = stored_face_lock_path(payload.target_device_id);
    const int lock_fd = open(
        lock_path.c_str(),
        O_CREAT | O_CLOEXEC | O_NOFOLLOW | O_RDWR,
        0600);
    struct stat lock_stat {};
    const bool secure_lock =
        lock_fd >= 0 &&
        fstat(lock_fd, &lock_stat) == 0 &&
        S_ISREG(lock_stat.st_mode) &&
        lock_stat.st_uid == geteuid() &&
        (lock_stat.st_mode & 0777) == 0600;
    if (!secure_lock || flock(lock_fd, LOCK_EX | LOCK_NB) != 0) {
        if (lock_fd >= 0) close(lock_fd);
        emit_json({
            {"event", "stored_face_write_blocked"},
            {"targetDeviceId", payload.target_device_id},
            {"employeeNo", payload.employee_no},
            {"reason", secure_lock ? "device_write_lock_busy" : "device_write_lock_unsafe"}
        });
        return false;
    }
    auto release_lock = [&]() {
        flock(lock_fd, LOCK_UN);
        close(lock_fd);
    };
    if (!execute_mode) {
        const bool preview = write_face_and_template(
            target,
            payload.employee_no,
            payload.card_no,
            payload.face_template,
            payload.face_picture,
            true);
        emit_json({
            {"event", "stored_face_write_preview_completed"},
            {"targetDeviceId", payload.target_device_id},
            {"employeeNo", payload.employee_no},
            {"ok", preview ? "true" : "false"},
            {"templateSize", std::to_string(payload.face_template.size())},
            {"pictureSize", std::to_string(payload.face_picture.size())},
            {"physicalRereadRequired", "true"}
        });
        release_lock();
        return preview;
    }
    const char *enabled = std::getenv("HIKVISION_ENABLE_STORED_FACE_WRITE");
    const char *writer_tested = std::getenv("HIKVISION_STORED_FACE_WRITER_TESTED");
    const char *authorized_canary =
        std::getenv("HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID");
    if (enabled == nullptr || std::string(enabled) != "1" ||
        writer_tested == nullptr || std::string(writer_tested) != "1" ||
        authorized_canary == nullptr ||
        std::string(authorized_canary) != payload.target_device_id) {
        emit_json({
            {"event", "stored_face_write_blocked"},
            {"targetDeviceId", payload.target_device_id},
            {"employeeNo", payload.employee_no},
            {"reason", "feature_disabled_pending_authorized_canary"}
        });
        release_lock();
        return false;
    }
    const auto write_started_at = std::chrono::steady_clock::now();
    const bool wrote = write_face_and_template(
        target,
        payload.employee_no,
        payload.card_no,
        payload.face_template,
        payload.face_picture,
        true);
    const auto write_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - write_started_at).count();
    if (wrote) std::this_thread::sleep_for(std::chrono::milliseconds(750));
    std::vector<char> reread_template;
    std::vector<char> reread_picture;
    const auto reread_started_at = std::chrono::steady_clock::now();
    const bool reread = wrote && read_face_and_template(
        target,
        payload.employee_no,
        payload.card_no,
        &reread_template,
        &reread_picture,
        true);
    const auto reread_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - reread_started_at).count();
    const bool template_match = reread && reread_template == payload.face_template;
    const bool picture_match = reread && reread_picture == payload.face_picture;
    const bool verified = wrote && reread && template_match && picture_match;
    emit_json({
        {"event", "stored_face_write_reread_completed"},
        {"targetDeviceId", payload.target_device_id},
        {"employeeNo", payload.employee_no},
        {"ok", verified ? "true" : "false"},
        {"writeOk", wrote ? "true" : "false"},
        {"rereadOk", reread ? "true" : "false"},
        {"templateMatch", template_match ? "true" : "false"},
        {"pictureMatch", picture_match ? "true" : "false"},
        {"templateSize", std::to_string(payload.face_template.size())},
        {"pictureSize", std::to_string(payload.face_picture.size())},
        {"rereadTemplateSize", std::to_string(reread_template.size())},
        {"rereadPictureSize", std::to_string(reread_picture.size())},
        {"writeMs", std::to_string(write_ms)},
        {"stabilizationWaitMs", wrote ? "750" : "0"},
        {"rereadMs", std::to_string(reread_ms)},
        {"durationMs", std::to_string(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - operation_started_at).count())}
    });
    release_lock();
    return verified;
}

NET_DVR_FINGER_PRINT_CFG_V50 build_fingerprint_record(
    const NET_DVR_CAPTURE_FINGERPRINT_CFG &capture,
    const std::string &employee_no,
    const std::string &card_no,
    BYTE finger_type) {
    NET_DVR_FINGER_PRINT_CFG_V50 record{};
    record.dwSize = sizeof(record);
    record.dwFingerPrintLen =
        capture.dwFingerPrintDataSize < static_cast<DWORD>(sizeof(record.byFingerData))
            ? capture.dwFingerPrintDataSize
            : static_cast<DWORD>(sizeof(record.byFingerData));
    std::memcpy(record.byFingerData, capture.byFingerData, record.dwFingerPrintLen);
    record.byFingerPrintID = capture.byFingerNo;
    record.byFingerType = finger_type;
    std::strncpy(reinterpret_cast<char *>(record.byEmployeeNo), employee_no.c_str(), NET_SDK_EMPLOYEE_NO_LEN - 1);
    if (!card_no.empty()) {
        std::strncpy(reinterpret_cast<char *>(record.byCardNo), card_no.c_str(), ACS_CARD_NO_LEN - 1);
    }
    enable_default_card_reader(record.byEnableCardReader, sizeof(record.byEnableCardReader));
    return record;
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
    ctx.device_id = source.config.hris_device_id;
    ctx.employee_no = job.employee_no;
    ctx.operation = "read";
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
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

    const bool wait_ok = wait_for_fingerprint_remote_config(
        ctx,
        std::chrono::milliseconds(2500),
        std::chrono::milliseconds(350));
    NET_DVR_StopRemoteConfig(handle);
    sdk_lock.unlock();

    const bool have_templates = wait_ok && !ctx.failed && !ctx.templates.empty();
    emit_json({
        {"event", "source_fingerprint_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", wait_ok && !ctx.failed ? "true" : "false"},
        {"templateCount", std::to_string(ctx.templates.size())},
        // Truth: templates are held in memory for callback POST — not "false" when non-empty.
        {"rawFingerprintTemplateStored", have_templates ? "true" : "false"}
    });

    return ctx.templates;
}

bool export_biometric_templates_for_employee(
    DeviceSession &source,
    const std::string &employee_no,
    bool include_fingerprints,
    bool include_face) {
    ReconcileJob job;
    job.source_host = source.config.host;
    job.source_device_id = source.config.hris_device_id;
    job.employee_no = employee_no;
    job.include_fingerprints = include_fingerprints;
    job.include_face_recognition = include_face;
    job.event_kind = "manual_biometric_export";

    std::string user_json;
    std::string card_json;
    const bool user_read_ok = read_source_user(source, job, &user_json);
    const bool card_owner_verified = read_source_card(source, job, &card_json);
    std::string card_no = extract_string_field_from_json(card_json, "cardNo");

    std::vector<NET_DVR_FINGER_PRINT_CFG_V50> fingerprints;
    if (include_fingerprints) {
        fingerprints = read_source_fingerprints(source, job);
    }

    std::vector<char> face_template;
    std::vector<char> face_picture;
    bool face_ok = false;
    if (include_face && !card_no.empty()) {
        face_ok = read_face_and_template(source, employee_no, card_no, &face_template, &face_picture);
    }

    std::ostringstream fingerprint_json;
    fingerprint_json << "[";
    for (size_t index = 0; index < fingerprints.size(); ++index) {
        const auto &record = fingerprints[index];
        if (index > 0) fingerprint_json << ",";
        fingerprint_json
            << "{\"fingerPrintId\":" << static_cast<int>(record.byFingerPrintID)
            << ",\"fingerType\":" << static_cast<int>(record.byFingerType)
            << ",\"length\":" << record.dwFingerPrintLen
            << ",\"data\":\""
            << base64_encode(record.byFingerData, record.dwFingerPrintLen)
            << "\"}";
    }
    fingerprint_json << "]";

    emit_sensitive_json_stdout_only({
        {"event", "manual_biometric_export_completed"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"userReadOk", user_read_ok ? "true" : "false"},
        {"cardOwnerVerified", card_owner_verified ? "true" : "false"},
        {"cardAssociationStrategy", card_owner_verified ? "exact_employee_owner" : "none"},
        {"ok", ((!include_fingerprints || !fingerprints.empty()) &&
                (!include_face || face_ok)) ? "true" : "false"},
        {"fingerprintCount", std::to_string(fingerprints.size())},
        {"faceTemplateSize", std::to_string(face_template.size())},
        {"facePictureSize", std::to_string(face_picture.size())},
        {"fingerprints", fingerprint_json.str()},
        {"faceTemplate", face_template.empty() ? "" : base64_encode(reinterpret_cast<const BYTE *>(face_template.data()), face_template.size())},
        {"facePicture", face_picture.empty() ? "" : base64_encode(reinterpret_cast<const BYTE *>(face_picture.data()), face_picture.size())}
    });

    return (!include_fingerprints || !fingerprints.empty()) &&
        (!include_face || (card_owner_verified && !face_template.empty() && !face_picture.empty()));
}

bool delete_face_for_exact_owner(
    DeviceSession &target,
    const std::string &employee_no) {
    const char *authorized_target_env =
        std::getenv("HIKVISION_AUTHORIZED_FACE_CANARY_DEVICE_ID");
    const std::string authorized_target =
        authorized_target_env == nullptr ? "" : authorized_target_env;
    if (authorized_target.empty() ||
        authorized_target != target.config.hris_device_id ||
        employee_no.empty()) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"reason", "authorized_exact_canary_target_required"}
        });
        return false;
    }

    ReconcileJob job;
    job.source_device_id = target.config.hris_device_id;
    job.source_host = target.config.host;
    job.employee_no = employee_no;
    std::string pre_user_json;
    if (!read_source_user(target, job, &pre_user_json)) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"reason", "exact_employee_userinfo_not_found"}
        });
        return false;
    }
    const int pre_face_count = extract_int_field_from_json(pre_user_json, "numOfFace");
    const int pre_fingerprint_count = extract_int_field_from_json(pre_user_json, "numOfFP");
    const int pre_card_count = extract_int_field_from_json(pre_user_json, "numOfCard");
    const std::string pre_name = extract_string_field_from_json(pre_user_json, "name");
    if (pre_face_count < 1 ||
        pre_fingerprint_count < 0 ||
        pre_card_count < 0) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"reason", pre_face_count < 1
                ? "exact_employee_has_no_face"
                : "predelete_credential_counts_unreadable"},
            {"preDeleteFaceCount",
             pre_face_count >= 0 ? std::to_string(pre_face_count) : ""},
            {"preDeleteFingerprintCount",
             pre_fingerprint_count >= 0 ? std::to_string(pre_fingerprint_count) : ""},
            {"preDeleteCardCount",
             pre_card_count >= 0 ? std::to_string(pre_card_count) : ""}
        });
        return false;
    }
    std::string card_json;
    if (!read_source_card(target, job, &card_json)) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"reason", "exact_employee_owned_card_not_found"}
        });
        return false;
    }
    const std::string card_no = extract_string_field_from_json(card_json, "cardNo");
    if (card_no.empty()) {
        return false;
    }
    if (!execute_mode) {
        emit_json({
            {"event", "face_delete_preview"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", employee_no},
            {"exactCardOwnerVerified", "true"},
            {"preDeleteFaceCount", std::to_string(pre_face_count)},
            {"preDeleteFingerprintCount", std::to_string(pre_fingerprint_count)},
            {"preDeleteCardCount", std::to_string(pre_card_count)},
            {"wouldCall", "NET_DVR_DEL_FACE_PARAM_CFG"},
            {"postDeleteIsolationRequired", "true"}
        });
        return true;
    }

    NET_DVR_FACE_PARAM_CTRL control{};
    control.dwSize = sizeof(control);
    control.byMode = 0;
    std::strncpy(
        reinterpret_cast<char *>(control.struProcessMode.struByCard.byCardNo),
        card_no.c_str(),
        ACS_CARD_NO_LEN - 1);
    control.struProcessMode.struByCard.byEnableCardReader[0] = 1;
    control.struProcessMode.struByCard.byFaceID[0] = 1;
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
    const BOOL deleted = NET_DVR_RemoteControl(
        target.user_id,
        NET_DVR_DEL_FACE_PARAM_CFG,
        &control,
        sizeof(control));
    const DWORD delete_error = deleted == TRUE ? 0 : NET_DVR_GetLastError();
    sdk_lock.unlock();

    std::this_thread::sleep_for(std::chrono::milliseconds(1200));
    std::string user_json;
    const bool reread_ok = read_source_user(target, job, &user_json);
    const int face_count = extract_int_field_from_json(user_json, "numOfFace");
    const int fingerprint_count = extract_int_field_from_json(user_json, "numOfFP");
    const int card_count = extract_int_field_from_json(user_json, "numOfCard");
    const std::string post_name = extract_string_field_from_json(user_json, "name");
    std::string post_card_json;
    const bool post_card_owner_verified =
        reread_ok && read_source_card(target, job, &post_card_json);
    const std::string post_card_no =
        extract_string_field_from_json(post_card_json, "cardNo");
    const bool identity_retained =
        reread_ok && pre_name == post_name;
    const bool fingerprint_retained =
        reread_ok && fingerprint_count == pre_fingerprint_count;
    const bool card_count_retained =
        reread_ok && card_count == pre_card_count;
    const bool exact_card_retained =
        post_card_owner_verified && post_card_no == card_no;
    const bool physically_absent = reread_ok && face_count == 0;
    const bool credential_isolation_retained =
        physically_absent &&
        identity_retained &&
        fingerprint_retained &&
        card_count_retained &&
        exact_card_retained;
    emit_json({
        {"event", "face_delete_reread_completed"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", employee_no},
        {"deleteAccepted", deleted == TRUE ? "true" : "false"},
        {"sdkLastError", std::to_string(delete_error)},
        {"preDeleteFaceCount", std::to_string(pre_face_count)},
        {"postDeleteFaceCount", face_count >= 0 ? std::to_string(face_count) : ""},
        {"preDeleteFingerprintCount", std::to_string(pre_fingerprint_count)},
        {"postDeleteFingerprintCount",
         fingerprint_count >= 0 ? std::to_string(fingerprint_count) : ""},
        {"preDeleteCardCount", std::to_string(pre_card_count)},
        {"postDeleteCardCount", card_count >= 0 ? std::to_string(card_count) : ""},
        {"identityRetained", identity_retained ? "true" : "false"},
        {"fingerprintCountRetained", fingerprint_retained ? "true" : "false"},
        {"cardCountRetained", card_count_retained ? "true" : "false"},
        {"exactCardAssociationRetained", exact_card_retained ? "true" : "false"},
        {"physicallyAbsent", physically_absent ? "true" : "false"},
        {"credentialIsolationRetained",
         credential_isolation_retained ? "true" : "false"}
    });
    return deleted == TRUE && credential_isolation_retained;
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

bool write_fingerprint_via_isapi(
    DeviceSession &target,
    const ReconcileJob &job,
    const NET_DVR_FINGER_PRINT_CFG_V50 &record) {
    const std::string finger_data = base64_encode(record.byFingerData, record.dwFingerPrintLen);
    std::ostringstream setup;
    setup << "{\"FingerPrintCfg\":{";
    setup << "\"employeeNo\":\"" << json_escape(job.employee_no) << "\",";
    setup << "\"enableCardReader\":[1],";
    setup << "\"fingerPrintID\":" << static_cast<int>(record.byFingerPrintID) << ",";
    setup << "\"fingerType\":\"normalFP\",";
    setup << "\"fingerData\":\"" << finger_data << "\"}}";

    std::string setup_response;
    const bool setup_ok = stdxml_json_request(
        target,
        "POST /ISAPI/AccessControl/FingerPrintDownload?format=json",
        setup.str(),
        &setup_response);

    // FingerPrintDownload often returns HTTP OK while the reader still processes async.
    // Live TEST A 2026-07-19: cloning person-15 template onto another employee returns
    // cardReaderRecvStatus=5 errorMsg="15" (device anti-dupe) while setup statusString=OK.
    // Status 6 observed as success when rewriting the same person's existing template.
    bool progress_recv_ok = false;
    int progress_status = -1;
    std::string progress_error_msg;
    std::string progress_response;
    for (int attempt = 0; attempt < 6; ++attempt) {
        if (attempt > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(400 * attempt));
        }
        progress_response.clear();
        const bool progress_ok = stdxml_json_request(
            target,
            "GET /ISAPI/AccessControl/FingerPrintProgress?format=json",
            "",
            &progress_response);
        if (!progress_ok || progress_response.empty()) {
            continue;
        }
        static const std::regex status_regex("\"cardReaderRecvStatus\"\\s*:\\s*([0-9]+)");
        static const std::regex err_regex("\"errorMsg\"\\s*:\\s*\"([^\"]*)\"");
        std::smatch sm;
        if (std::regex_search(progress_response, sm, status_regex)) {
            progress_status = std::atoi(sm[1].str().c_str());
        }
        if (std::regex_search(progress_response, sm, err_regex)) {
            progress_error_msg = sm[1].str();
        }
        // 6 = accepted/applied on this device family; 5 = failed (often duplicate template).
        if (progress_status == 6) {
            progress_recv_ok = true;
            break;
        }
        if (progress_status == 5) {
            progress_recv_ok = false;
            break;
        }
    }

    std::ostringstream query;
    query << "{\"FingerPrintCond\":{";
    query << "\"searchID\":\"pt-fingerprint-" << json_escape(job.employee_no) << "\",";
    query << "\"employeeNo\":\"" << json_escape(job.employee_no) << "\",";
    query << "\"cardReaderNo\":1,";
    query << "\"fingerPrintID\":" << static_cast<int>(record.byFingerPrintID) << "}}";
    std::string query_response;
    const bool query_ok = stdxml_json_request(
        target,
        "POST /ISAPI/AccessControl/FingerPrintUpload?format=json",
        query.str(),
        &query_response);
    const bool list_verified = query_ok &&
        query_response.find("\"status\"") != std::string::npos &&
        query_response.find("OK") != std::string::npos &&
        query_response.find("FingerPrintList") != std::string::npos &&
        query_response.find("fingerData") != std::string::npos;
    // Require re-read list verification. Progress status 5 is hard fail even if setup OK.
    const bool verified = list_verified && progress_status != 5;

    emit_json({
        {"event", "peer_fingerprint_write_isapi"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"fingerPrintId", std::to_string(record.byFingerPrintID)},
        {"setupOk", setup_ok ? "true" : "false"},
        {"progressRecvOk", progress_recv_ok ? "true" : "false"},
        {"progressStatus", std::to_string(progress_status)},
        {"progressErrorMsg", progress_error_msg},
        {"progressResponse", progress_response.substr(0, 1200)},
        {"queryOk", query_ok ? "true" : "false"},
        {"listVerified", list_verified ? "true" : "false"},
        {"verified", verified ? "true" : "false"},
        {"setupResponse", setup_response.substr(0, 1200)},
        {"queryResponse", query_response.substr(0, 1200)}
    });
    return verified;
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

    bool isapi_all_ok = true;
    int isapi_ok_count = 0;
    for (const auto &record : templates) {
        const bool record_ok = write_fingerprint_via_isapi(target, job, record);
        if (record_ok) {
            isapi_ok_count += 1;
        } else {
            isapi_all_ok = false;
        }
    }
    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> isapi_verified_templates =
        read_source_fingerprints(target, job);
    const bool isapi_count_verified =
        isapi_verified_templates.size() >= templates.size() && !isapi_verified_templates.empty();
    emit_json({
        {"event", "peer_fingerprint_write_isapi_summary"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"templateCount", std::to_string(templates.size())},
        {"isapiOkCount", std::to_string(isapi_ok_count)},
        {"verifiedTemplateCount", std::to_string(isapi_verified_templates.size())},
        {"ok", (isapi_all_ok && isapi_count_verified) ? "true" : "false"}
    });
    if (isapi_all_ok && isapi_count_verified) {
        mark_recent_peer_apply(target.config.host);
        return true;
    }

    NET_DVR_FINGER_PRINT_INFO_COND_V50 cond{};
    cond.dwSize = sizeof(cond);
    cond.dwFingerPrintNum = static_cast<DWORD>(templates.size());
    cond.byFingerPrintID = 0xff;
    std::strncpy(reinterpret_cast<char *>(cond.byEmployeeNo), job.employee_no.c_str(), NET_SDK_EMPLOYEE_NO_LEN - 1);
    enable_default_card_reader(cond.byEnableCardReader, sizeof(cond.byEnableCardReader));

    FingerprintReadContext ctx;
    ctx.device_id = target.config.hris_device_id;
    ctx.employee_no = job.employee_no;
    ctx.operation = "write";
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
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
    const bool wait_ok = wait_for_fingerprint_remote_config(
        ctx,
        std::chrono::milliseconds(2500),
        std::chrono::milliseconds(350));
    NET_DVR_StopRemoteConfig(handle);
    sdk_lock.unlock();
    ok = ok && wait_ok && !ctx.failed && !ctx.saw_failure;
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

    if (!ok && !job.card_no.empty()) {
        emit_json({
            {"event", "peer_fingerprint_write_legacy_attempt"},
            {"targetDeviceId", target.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"cardNo", "[redacted]"},
            {"templateCount", std::to_string(templates.size())}
        });

        NET_DVR_FINGERPRINT_COND legacy_cond{};
        legacy_cond.dwSize = sizeof(legacy_cond);
        legacy_cond.dwFingerprintNum = static_cast<DWORD>(templates.size());
        legacy_cond.dwEnableReaderNo = 1;
        std::strncpy(reinterpret_cast<char *>(legacy_cond.byCardNo), job.card_no.c_str(), ACS_CARD_NO_LEN - 1);

        FingerprintReadContext legacy_ctx;
        legacy_ctx.device_id = target.config.hris_device_id;
        legacy_ctx.employee_no = job.employee_no;
        legacy_ctx.operation = "legacy_write";

        std::unique_lock<std::mutex> legacy_sdk_lock(sdk_request_mutex);
        const LONG legacy_handle = NET_DVR_StartRemoteConfig(
            target.user_id,
            NET_DVR_SET_FINGERPRINT,
            &legacy_cond,
            sizeof(legacy_cond),
            fingerprint_callback,
            &legacy_ctx);
        if (legacy_handle >= 0) {
            bool legacy_send_ok = true;
            for (const auto &record : templates) {
                NET_DVR_FINGERPRINT_RECORD legacy_record{};
                legacy_record.dwSize = sizeof(legacy_record);
                legacy_record.dwFingerPrintLen = record.dwFingerPrintLen;
                legacy_record.dwEnableReaderNo = 1;
                legacy_record.byFingerPrintID = record.byFingerPrintID;
                legacy_record.byFingerType = record.byFingerType;
                std::strncpy(reinterpret_cast<char *>(legacy_record.byCardNo), job.card_no.c_str(), ACS_CARD_NO_LEN - 1);
                std::memcpy(legacy_record.byFingerData, record.byFingerData, record.dwFingerPrintLen);
                const BOOL send_ok = NET_DVR_SendRemoteConfig(
                    legacy_handle,
                    3,
                    reinterpret_cast<char *>(&legacy_record),
                    sizeof(legacy_record));
                if (send_ok != TRUE) {
                    legacy_send_ok = false;
                    emit_json({
                        {"event", "peer_fingerprint_write_legacy_send_failed"},
                        {"targetDeviceId", target.config.hris_device_id},
                        {"employeeNo", job.employee_no},
                        {"cardNo", "[redacted]"},
                        {"lastError", std::to_string(NET_DVR_GetLastError())}
                    });
                    break;
                }
            }
            const bool legacy_wait_ok = legacy_send_ok && wait_for_fingerprint_remote_config(
                legacy_ctx,
                std::chrono::milliseconds(2500),
                std::chrono::milliseconds(350));
            NET_DVR_StopRemoteConfig(legacy_handle);
            legacy_sdk_lock.unlock();
            if (legacy_send_ok && legacy_wait_ok && !legacy_ctx.failed && !legacy_ctx.saw_failure) {
                ok = true;
            }
        } else {
            legacy_sdk_lock.unlock();
            emit_json({
                {"event", "peer_fingerprint_write_legacy_start_failed"},
                {"targetDeviceId", target.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"cardNo", "[redacted]"},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
        }
    }

    emit_json({
        {"event", "peer_fingerprint_write"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"cardNo", job.card_no.empty() ? "" : "[redacted]"},
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

bool clone_fingerprints_between_users(
    DeviceSession &source,
    const std::string &source_employee_no,
    DeviceSession &target,
    const std::string &target_employee_no) {
    ReconcileJob read_job;
    read_job.source_host = source.config.host;
    read_job.source_device_id = source.config.hris_device_id;
    read_job.employee_no = source_employee_no;
    read_job.include_fingerprints = true;
    read_job.event_kind = "manual_fingerprint_clone_read";

    emit_json({
        {"event", "manual_fingerprint_clone_started"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"sourceEmployeeNo", source_employee_no},
        {"targetDeviceId", target.config.hris_device_id},
        {"targetEmployeeNo", target_employee_no},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });

    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> templates =
        read_source_fingerprints(source, read_job);
    if (templates.empty()) {
        emit_json({
            {"event", "manual_fingerprint_clone_completed"},
            {"ok", "false"},
            {"reason", "no_source_templates"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"sourceEmployeeNo", source_employee_no},
            {"targetDeviceId", target.config.hris_device_id},
            {"targetEmployeeNo", target_employee_no}
        });
        return false;
    }

    ReconcileJob write_job = read_job;
    write_job.employee_no = target_employee_no;
    write_job.event_kind = "manual_fingerprint_clone_write";
    const bool ok = write_peer_fingerprints(target, write_job, templates);
    emit_json({
        {"event", "manual_fingerprint_clone_completed"},
        {"ok", ok ? "true" : "false"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"sourceEmployeeNo", source_employee_no},
        {"targetDeviceId", target.config.hris_device_id},
        {"targetEmployeeNo", target_employee_no},
        {"templateCount", std::to_string(templates.size())}
    });
    return ok;
}

bool capture_and_sync_fingerprint_for_employee(
    DeviceSession &source,
    const std::string &employee_no,
    BYTE finger_no,
    BYTE finger_type) {
    ReconcileJob source_user_job;
    source_user_job.source_host = source.config.host;
    source_user_job.source_device_id = source.config.hris_device_id;
    source_user_job.employee_no = employee_no;
    std::string source_user_json;
    read_source_user(source, source_user_job, &source_user_json);
    std::string source_card_json;
    read_source_card(source, source_user_job, &source_card_json);
    std::string card_no = extract_string_field_from_json(source_card_json, "cardNo");
    if (card_no.empty()) {
        card_no = extract_string_field_from_json(source_user_json, "cardNo");
    }

    NET_DVR_CAPTURE_FINGERPRINT_CFG capture{};
    emit_json({
        {"event", "manual_fingerprint_capture_sync_started"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"fingerNo", std::to_string(finger_no)},
        {"fingerType", std::to_string(finger_type)},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });

    if (!capture_fingerprint_template(source, finger_no, &capture, std::chrono::milliseconds(30000))) {
        emit_json({
            {"event", "manual_fingerprint_capture_sync_completed"},
            {"ok", "false"},
            {"reason", "capture_failed"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", employee_no}
        });
        return false;
    }

    const NET_DVR_FINGER_PRINT_CFG_V50 record = build_fingerprint_record(capture, employee_no, card_no, finger_type);
    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> records{record};
    bool ok = true;
    int target_writes = 0;

    ReconcileJob job;
    job.source_host = source.config.host;
    job.source_device_id = source.config.hris_device_id;
    job.employee_no = employee_no;
    job.card_no = card_no;
    job.include_fingerprints = true;
    job.event_kind = "manual_fingerprint_capture_sync";

    for (auto &target : sessions) {
        if (target.config.hris_device_id == source.config.hris_device_id) {
            continue;
        }
        const bool wrote = retry_peer_operation("fingerprint", target, employee_no, [&]() {
            const bool isapi_wrote = execute_mode && write_fingerprint_via_isapi(target, job, record);
            return isapi_wrote || write_peer_fingerprints(target, job, records);
        });
        if (wrote) {
            target_writes += 1;
        }
        ok = wrote && ok;
    }

    emit_json({
        {"event", "manual_fingerprint_capture_sync_completed"},
        {"ok", ok ? "true" : "false"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"fingerNo", std::to_string(finger_no)},
        {"targetWrites", std::to_string(target_writes)}
    });
    return ok;
}

bool capture_and_sync_face_for_employee(
    DeviceSession &source,
    const std::string &employee_no) {
    ReconcileJob job;
    job.source_host = source.config.host;
    job.source_device_id = source.config.hris_device_id;
    job.employee_no = employee_no;
    std::string user_json;
    std::string card_json;
    read_source_user(source, job, &user_json);
    read_source_card(source, job, &card_json);
    std::string card_no = extract_string_field_from_json(card_json, "cardNo");
    if (card_no.empty()) card_no = extract_string_field_from_json(user_json, "cardNo");

    emit_json({
        {"event", "manual_face_capture_sync_started"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });
    if (card_no.empty()) {
        emit_json({
            {"event", "manual_face_capture_sync_completed"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"reason", "card_required_by_face_sdk"}
        });
        return false;
    }

    std::vector<char> face_template;
    std::vector<char> face_picture;
    if (!capture_face_template(source, &face_template, &face_picture)) {
        emit_json({
            {"event", "manual_face_capture_sync_completed"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"reason", "capture_failed"}
        });
        return false;
    }

    bool ok = true;
    int target_writes = 0;
    for (auto &target : sessions) {
        if (target.config.hris_device_id == source.config.hris_device_id) continue;
        const bool wrote = retry_peer_operation("face", target, employee_no, [&]() {
            return write_face_and_template(target, employee_no, card_no, face_template, face_picture);
        });
        if (wrote) target_writes += 1;
        ok = wrote && ok;
    }
    emit_json({
        {"event", "manual_face_capture_sync_completed"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"ok", ok ? "true" : "false"},
        {"targetWrites", std::to_string(target_writes)},
        {"templateSize", std::to_string(face_template.size())},
        {"pictureSize", std::to_string(face_picture.size())}
    });
    return ok;
}

bool mirror_face_for_employee(
    DeviceSession &source,
    const std::string &employee_no) {
    ReconcileJob job;
    job.source_host = source.config.host;
    job.source_device_id = source.config.hris_device_id;
    job.employee_no = employee_no;
    std::string user_json;
    std::string card_json;
    read_source_user(source, job, &user_json);
    read_source_card(source, job, &card_json);
    std::string card_no = extract_string_field_from_json(card_json, "cardNo");
    if (card_no.empty()) card_no = extract_string_field_from_json(user_json, "cardNo");

    emit_json({
        {"event", "manual_face_mirror_started"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });
    if (card_no.empty()) {
        emit_json({
            {"event", "manual_face_mirror_completed"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"reason", "card_required_by_face_sdk"}
        });
        return false;
    }
    if (!execute_mode) return true;

    std::vector<char> face_template;
    std::vector<char> face_picture;
    if (!read_face_and_template(source, employee_no, card_no, &face_template, &face_picture)) {
        emit_json({
            {"event", "manual_face_mirror_completed"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"reason", "source_face_not_read"}
        });
        return false;
    }

    bool ok = true;
    int target_writes = 0;
    for (auto &target : sessions) {
        if (target.config.hris_device_id == source.config.hris_device_id) continue;
        const bool wrote = retry_peer_operation("face", target, employee_no, [&]() {
            return write_face_and_template(target, employee_no, card_no, face_template, face_picture);
        });
        if (wrote) target_writes += 1;
        ok = wrote && ok;
    }
    emit_json({
        {"event", "manual_face_mirror_completed"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", employee_no},
        {"ok", ok ? "true" : "false"},
        {"targetWrites", std::to_string(target_writes)},
        {"templateSize", std::to_string(face_template.size())},
        {"pictureSize", std::to_string(face_picture.size())}
    });
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
    std::unique_lock<std::mutex> sdk_lock(sdk_request_mutex);
    const LONG handle = NET_DVR_StartRemoteConfig(
        target.user_id,
        NET_DVR_DEL_FINGERPRINT_CFG_V50,
        &cond,
        sizeof(cond),
        fingerprint_callback,
        &ctx);

    bool ok = handle >= 0;
    if (handle >= 0) {
        const bool wait_ok = wait_for_fingerprint_remote_config(
            ctx,
            std::chrono::milliseconds(2500),
            std::chrono::milliseconds(350));
        NET_DVR_StopRemoteConfig(handle);
        sdk_lock.unlock();
        ok = wait_ok && !ctx.failed;
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

long long unix_time_ms() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}

std::string sanitize_filename_token(const std::string &value) {
    std::string token;
    token.reserve(value.size());
    for (const char c : value) {
        if ((c >= 'a' && c <= 'z') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9')) {
            token.push_back(c);
        } else {
            token.push_back('_');
        }
    }
    while (token.find("__") != std::string::npos) {
        token = std::regex_replace(token, std::regex("__"), "_");
    }
    if (token.empty()) {
        return "unknown";
    }
    return token;
}

bool ensure_reconcile_spool_dir() {
    std::lock_guard<std::mutex> lock(reconcile_spool_mutex);
    if (::mkdir(reconcile_spool_dir.c_str(), 0755) == 0) {
        return true;
    }
    if (errno == EEXIST) {
        return true;
    }
    emit_json({
        {"event", "hris_contract_spool_dir_failed"},
        {"path", reconcile_spool_dir},
        {"errno", std::to_string(errno)}
    });
    return false;
}

bool ensure_reconcile_quarantine_dir() {
    if (::mkdir(reconcile_quarantine_dir.c_str(), 0700) == 0) {
        return true;
    }
    if (errno == EEXIST) {
        return true;
    }
    emit_json({
        {"event", "hris_contract_spool_quarantine_dir_failed"},
        {"path", reconcile_quarantine_dir},
        {"errno", std::to_string(errno)}
    });
    return false;
}

bool ensure_callback_spool_dir() {
    if (::mkdir(callback_spool_dir.c_str(), 0755) == 0 || errno == EEXIST) {
        return true;
    }
    emit_json({
        {"event", "hikvision_callback_spool_dir_failed"},
        {"path", callback_spool_dir},
        {"errno", std::to_string(errno)}
    });
    return false;
}

std::string build_reconcile_spool_path(const ReconcileJob &job, const std::string &status) {
    std::ostringstream path;
    path << reconcile_spool_dir
         << "/"
         << unix_time_ms()
         << "_"
         << sanitize_filename_token(job.source_device_id)
         << "_"
         << sanitize_filename_token(job.employee_no.empty() ? "all" : job.employee_no)
         << "_"
         << sanitize_filename_token(status)
         << ".json";
    return path.str();
}

std::string build_reconcile_spool_path_from_key(const std::string &spool_key) {
    std::ostringstream path;
    path << reconcile_spool_dir
         << "/"
         << unix_time_ms()
         << "_"
         << sanitize_filename_token(spool_key)
         << ".json";
    return path.str();
}

std::string build_callback_spool_path(const ReconcileJob &job) {
    std::ostringstream path;
    path << callback_spool_dir
         << "/"
         << unix_time_ms()
         << "_"
         << (callback_spool_token.fetch_add(1) + 1)
         << "_"
         << sanitize_filename_token(job.source_device_id)
         << "_"
         << sanitize_filename_token(job.serial_no)
         << ".json";
    return path.str();
}

bool write_text_file(const std::string &path, const std::string &body) {
    std::ofstream stream(path, std::ios::binary | std::ios::trunc);
    if (!stream) {
        return false;
    }
    stream << body;
    return stream.good();
}

bool read_text_file(const std::string &path, std::string *body) {
    std::ifstream stream(path, std::ios::binary);
    if (!stream) {
        return false;
    }
    std::ostringstream buffer;
    buffer << stream.rdbuf();
    *body = buffer.str();
    return true;
}

std::vector<std::string> list_reconcile_spool_files() {
    std::vector<std::string> paths;
    DIR *dir = opendir(reconcile_spool_dir.c_str());
    if (dir == nullptr) {
        return paths;
    }
    struct dirent *entry = nullptr;
    while ((entry = readdir(dir)) != nullptr) {
        const std::string name = entry->d_name;
        if (name == "." || name == "..") {
            continue;
        }
        paths.push_back(reconcile_spool_dir + "/" + name);
    }
    closedir(dir);
    std::sort(paths.begin(), paths.end());
    return paths;
}

std::vector<std::string> list_callback_spool_files() {
    std::vector<std::string> paths;
    DIR *dir = opendir(callback_spool_dir.c_str());
    if (dir == nullptr) {
        return paths;
    }
    struct dirent *entry = nullptr;
    while ((entry = readdir(dir)) != nullptr) {
        const std::string name = entry->d_name;
        if (name.size() < 5 || name.substr(name.size() - 5) != ".json") {
            continue;
        }
        paths.push_back(callback_spool_dir + "/" + name);
    }
    closedir(dir);
    std::sort(paths.begin(), paths.end());
    return paths;
}

bool post_json_with_retries(
    const std::string &url,
    const std::string &body,
    const std::string &event_name,
    int attempts,
    int retry_sleep_ms,
    int max_time_seconds = 5) {
    for (int attempt = 1; attempt <= attempts; ++attempt) {
        const bool ok = curl_post_json(url, body, event_name, max_time_seconds);
        emit_json({
            {"event", event_name + "_attempt"},
            {"attempt", std::to_string(attempt)},
            {"maxAttempts", std::to_string(attempts)},
            {"ok", ok ? "true" : "false"}
        });
        if (ok) {
            return true;
        }
        if (attempt < attempts) {
            std::this_thread::sleep_for(std::chrono::milliseconds(retry_sleep_ms));
        }
    }
    return false;
}

void replay_pending_hris_contract_posts() {
    if (!execute_mode || hris_api_base.empty()) {
        return;
    }
    if (!ensure_reconcile_spool_dir()) {
        return;
    }
    const std::vector<std::string> paths = list_reconcile_spool_files();
    if (paths.empty()) {
        return;
    }
    const std::string url = hris_api_base + "/api/device/biometric-sync/reconcile";
    for (const auto &path : paths) {
        std::string body;
        if (!read_text_file(path, &body)) {
            emit_json({
                {"event", "hris_contract_spool_read_failed"},
                {"path", path}
            });
            continue;
        }
        std::smatch source_device_match;
        const std::regex source_device_pattern(
            R"reconcile("sourceDeviceId"\s*:\s*"([^"]+)")reconcile");
        if (!std::regex_search(body, source_device_match, source_device_pattern)) {
            const size_t separator = path.find_last_of('/');
            const std::string filename =
                path.substr(separator == std::string::npos ? 0 : separator + 1);
            const std::string quarantine_path =
                reconcile_quarantine_dir + "/" + filename;
            const bool preserved =
                ensure_reconcile_quarantine_dir() &&
                std::rename(path.c_str(), quarantine_path.c_str()) == 0;
            emit_json({
                {"event", "hris_contract_spool_quarantined"},
                {"path", path},
                {"quarantinePath", preserved ? quarantine_path : ""},
                {"reason", "missing_source_device_id"},
                {"preserved", preserved ? "true" : "false"}
            });
            continue;
        }
        const bool ok = post_json_with_retries(url, body, "hris_contract_spool_replay", 3, 1500);
        emit_json({
            {"event", "hris_contract_spool_replay_result"},
            {"path", path},
            {"ok", ok ? "true" : "false"}
        });
        if (ok) {
            std::remove(path.c_str());
        }
    }
}

void replay_pending_hikvision_callbacks() {
    if (!execute_mode || hris_api_base.empty()) {
        return;
    }
    const std::string url = hris_api_base + "/api/hikvision/callback";
    std::vector<std::string> paths;
    {
        std::lock_guard<std::mutex> lock(callback_spool_mutex);
        if (!ensure_callback_spool_dir()) {
            return;
        }
        paths = list_callback_spool_files();
    }
    for (const auto &path : paths) {
        std::string body;
        {
            std::lock_guard<std::mutex> lock(callback_spool_mutex);
            if (callback_posts_in_flight.find(path) != callback_posts_in_flight.end()) {
                continue;
            }
            callback_posts_in_flight.insert(path);
            if (!read_text_file(path, &body)) {
                callback_posts_in_flight.erase(path);
                emit_json({{"event", "hikvision_callback_spool_read_failed"}, {"path", path}});
                continue;
            }
        }
        if (body.empty()) {
            std::lock_guard<std::mutex> lock(callback_spool_mutex);
            callback_posts_in_flight.erase(path);
            emit_json({{"event", "hikvision_callback_spool_read_failed"}, {"path", path}});
            continue;
        }
        const bool ok = post_json_with_retries(
            url,
            body,
            "hikvision_callback_spool_replay",
            3,
            1500,
            30);
        emit_json({
            {"event", "hikvision_callback_spool_replay_result"},
            {"path", path},
            {"ok", ok ? "true" : "false"}
        });
        {
            std::lock_guard<std::mutex> lock(callback_spool_mutex);
            if (ok) {
                std::remove(path.c_str());
            }
            callback_posts_in_flight.erase(path);
        }
    }
}

void callback_spool_replay_loop() {
    while (keep_running) {
        replay_pending_hikvision_callbacks();
        for (int i = 0; i < inventory_poll_interval.count() * 10 && keep_running; ++i) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }
}

bool post_hris_contract_payload(
    const std::string &contract,
    const std::string &spool_key,
    const std::map<std::string, std::string> &spool_meta) {
    std::string spool_path;
    if (execute_mode && ensure_reconcile_spool_dir()) {
        spool_path = build_reconcile_spool_path_from_key(spool_key);
        if (!write_text_file(spool_path, contract)) {
            emit_json({
                {"event", "hris_contract_spool_write_failed"},
                {"path", spool_path}
            });
            spool_path.clear();
        } else {
            std::map<std::string, std::string> fields = {
                {"event", "hris_contract_spool_written"},
                {"path", spool_path},
                {"spoolKey", spool_key}
            };
            fields.insert(spool_meta.begin(), spool_meta.end());
            emit_json(fields);
        }
    }
    if (hris_api_base.empty()) {
        emit_json({
            {"event", "hris_contract_post_skipped"},
            {"reason", "missing_hris_api_base"},
            {"spoolKey", spool_key}
        });
        return false;
    }
    if (!execute_mode) {
        emit_json({
            {"event", "hris_contract_preview"},
            {"apiBase", hris_api_base},
            {"contractPath", "/api/device/biometric-sync/reconcile"},
            {"body", contract}
        });
        return true;
    }

    const std::string url = hris_api_base + "/api/device/biometric-sync/reconcile";
    const bool ok = post_json_with_retries(url, contract, "hris_contract_post", 3, 1500);
    emit_json({
        {"event", "hris_contract_post"},
        {"apiBase", hris_api_base},
        {"spoolKey", spool_key},
        {"ok", ok ? "true" : "false"}
    });
    if (ok && !spool_path.empty()) {
        std::remove(spool_path.c_str());
        emit_json({
            {"event", "hris_contract_spool_cleared"},
            {"path", spool_path}
        });
    }
    return ok;
}

bool curl_post_json(
    const std::string &url,
    const std::string &body,
    const std::string &event_name,
    int max_time_seconds) {
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
    std::fprintf(config_file, "connect-timeout = 3\n");
    std::fprintf(config_file, "max-time = %d\n", std::max(1, max_time_seconds));
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

// Pick highest pure-numeric plain id (panel typed person nos like "15").
std::string pick_newest_plain_employee_no(const std::vector<std::string> &candidates) {
    if (candidates.empty()) {
        return "";
    }
    if (candidates.size() == 1) {
        return candidates[0];
    }
    std::string best;
    long long best_num = -1;
    for (const auto &raw : candidates) {
        if (raw.empty()) {
            continue;
        }
        bool pure = true;
        for (char c : raw) {
            if (c < '0' || c > '9') {
                pure = false;
                break;
            }
        }
        if (pure) {
            long long n = 0;
            try {
                n = std::stoll(raw);
            } catch (...) {
                n = -1;
            }
            if (n > best_num) {
                best_num = n;
                best = raw;
            }
        } else if (best.empty()) {
            best = raw;
        }
    }
    return best.empty() ? candidates.back() : best;
}

// Seed baseline at arm-time so the first empty ACS after create does not
// "swallow" the new person into baseline (would never appear as a delta).
void seed_inventory_baseline_for_session(DeviceSession &device) {
    bool complete = false;
    const std::vector<std::string> current = read_device_employee_numbers(device, &complete);
    if (!complete) {
        emit_json({
            {"event", "inventory_baseline_seed_failed"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host},
            {"reason", "incomplete_inventory"}
        });
        return;
    }
    std::lock_guard<std::mutex> baseline_lock(inventory_baseline_mutex);
    auto &observed = observed_employee_numbers_by_host[device.config.host];
    observed.clear();
    observed.insert(current.begin(), current.end());
    inventory_baseline_ready_hosts.insert(device.config.host);
    emit_json({
        {"event", "inventory_baseline_seeded"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"sourceHost", device.config.host},
        {"employeeCount", std::to_string(observed.size())}
    });
    // Also seed UserInfo field fingerprints so modify (name/numOfFP) can resolve empty ACS person.
    seed_userinfo_touch_baseline_for_session(device);
}

// When ACS dwEmployeeNo is empty (common major=3 panel create/FP enroll), resolve plain
// person id from device UserInfo inventory delta vs baseline. Does not invent ids.
std::string resolve_plain_employee_no_from_inventory(DeviceSession &device) {
    bool complete = false;
    const std::vector<std::string> current = read_device_employee_numbers(device, &complete);
    if (!complete) {
        emit_json({
            {"event", "callback_identity_inventory_incomplete"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host}
        });
        return "";
    }
    std::lock_guard<std::mutex> baseline_lock(inventory_baseline_mutex);
    auto &observed = observed_employee_numbers_by_host[device.config.host];
    if (inventory_baseline_ready_hosts.find(device.config.host) == inventory_baseline_ready_hosts.end()) {
        // Prefer arm-time seed; late seed only if arm seed failed.
        observed.insert(current.begin(), current.end());
        inventory_baseline_ready_hosts.insert(device.config.host);
        emit_json({
            {"event", "callback_identity_inventory_baseline"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host},
            {"employeeCount", std::to_string(observed.size())},
            {"note", "late_baseline_prefer_arm_seed"}
        });
        return "";
    }

    std::vector<std::string> news;
    for (const auto &employee_no : current) {
        if (!employee_no.empty() && observed.find(employee_no) == observed.end()) {
            news.push_back(employee_no);
        }
    }
    // Always advance baseline so we do not re-report the same new plain forever.
    observed.insert(current.begin(), current.end());

    if (news.empty()) {
        emit_json({
            {"event", "callback_identity_inventory_no_new_plain"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host},
            {"employeeCount", std::to_string(current.size())}
        });
        return "";
    }

    const std::string plain = pick_newest_plain_employee_no(news);
    emit_json({
        {"event", "callback_identity_inventory_delta"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"sourceHost", device.config.host},
        {"newPlainCount", std::to_string(news.size())},
        {"employeeNo", plain}
    });
    return plain;
}

bool needs_callback_identity_enrich(const ReconcileJob &job) {
    if (!job.employee_no.empty()) {
        return false;
    }
    if (job.major == MAJOR_OPERATION) {
        return true;
    }
    // Some devices surface ops under major 3 with observed minors only.
    if (job.major == 3 || is_observed_operation_sync_minor(job.minor) ||
        is_user_management_minor(job.minor) || is_fingerprint_management_minor(job.minor) ||
        is_card_management_minor(job.minor)) {
        return true;
    }
    return job.event_kind.find("biometric_") == 0 ||
           job.event_kind.find("poll_") == 0;
}

bool should_defer_empty_callback_identity_to_backend(const ReconcileJob &job) {
    if (!job.employee_no.empty()) {
        return false;
    }
    // Explicit management events may use the bounded inventory-delta fallback
    // below. Generic major=3/observed operation signals are far more frequent
    // and already have a durable API-side operation-log resolver. Scanning all
    // 865 users here blocks the same panel transport needed by plans/writes.
    if (is_user_management_minor(job.minor) ||
        is_fingerprint_management_minor(job.minor) ||
        is_card_management_minor(job.minor)) {
        return false;
    }
    return job.major == 3 ||
           is_observed_operation_sync_minor(job.minor) ||
           job.event_kind == "biometric_operation_sync";
}

bool needs_callback_template_enrich(const ReconcileJob &job) {
    if (job.employee_no.empty()) {
        return false;
    }
    // Pure attendance punches must post immediately — never wait on FP/face template reads.
    if (job.event_kind.find("attendance_") == 0 || job.major == 5) {
        return false;
    }
    if (is_fingerprint_management_minor(job.minor) || job.include_fingerprints) {
        return true;
    }
    // User create/update: often followed by FP/face enroll; try templates when id known.
    if (is_user_management_minor(job.minor) ||
        job.event_kind == "biometric_user_management" ||
        job.event_kind == "poll_inventory_user_created") {
        return true;
    }
    // Panel create/enroll often arrives as major=3 / operation-sync with empty ACS person.
    // After inventory_delta (or delayed identity_repost) fills plain id, still attempt FP read.
    // Without this gate, enrich exits early with fingerprintCount=0 even when the person has templates.
    if (job.major == MAJOR_OPERATION || job.major == 3 ||
        is_observed_operation_sync_minor(job.minor) ||
        job.event_kind.find("identity_repost") != std::string::npos) {
        return true;
    }
    return job.include_face_recognition &&
           (job.event_kind.find("face") != std::string::npos ||
            job.event_kind == "biometric_user_management");
}

// Schedule a delayed re-queue of the HRIS callback job so empty-ACS create/enroll
// can get plain id after UserInfo catches up (second POST, not inventing ids).
void schedule_delayed_hris_identity_repost(const ReconcileJob &job, int delay_ms, int attempt) {
    if (attempt > 3) {
        return;
    }
    ReconcileJob copy = job;
    // Force identity re-resolution on the delayed pass.
    copy.employee_no.clear();
    copy.identity_source.clear();
    copy.fingerprints_json.clear();
    copy.fingerprint_count = 0;
    copy.face_template_b64.clear();
    copy.face_picture_b64.clear();
    copy.event_kind = job.event_kind.empty()
                          ? "identity_repost"
                          : (job.event_kind + "_identity_repost");
    std::thread([copy, delay_ms, attempt]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
        if (!keep_running) {
            return;
        }
        emit_json({
            {"event", "callback_identity_repost_queued"},
            {"sourceDeviceId", copy.source_device_id},
            {"sourceHost", copy.source_host},
            {"attempt", std::to_string(attempt)},
            {"delayMs", std::to_string(delay_ms)},
            {"serialNo", copy.serial_no}
        });
        queue_hris_device_event(copy);
    }).detach();
}

// Panel FP/face enroll often lags ACS by seconds: plain id may resolve first while
// templates are still empty. Keep employeeNo and re-POST after delay so the
// callback carries fingerprints[] / facePicture when device catches up.
// Does not invent identity — only retries template attach for a known plain id.
void schedule_delayed_template_repost(const ReconcileJob &job, int delay_ms, int attempt) {
    if (attempt > 3 || job.employee_no.empty()) {
        return;
    }
    // Avoid infinite template_repost chains.
    if (job.event_kind.find("template_repost") != std::string::npos && attempt > 3) {
        return;
    }
    ReconcileJob copy = job;
    copy.fingerprints_json.clear();
    copy.fingerprint_count = 0;
    copy.face_template_b64.clear();
    copy.face_picture_b64.clear();
    // Keep employee_no + identity_source so enrich skips empty-id multipass and goes to templates.
    copy.include_fingerprints = true;
    copy.include_face_recognition = true;
    copy.event_kind = job.event_kind.empty()
                          ? "template_repost"
                          : (job.event_kind.find("template_repost") != std::string::npos
                                 ? job.event_kind
                                 : (job.event_kind + "_template_repost"));
    std::thread([copy, delay_ms, attempt]() {
        std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
        if (!keep_running) {
            return;
        }
        emit_json({
            {"event", "callback_template_repost_queued"},
            {"sourceDeviceId", copy.source_device_id},
            {"sourceHost", copy.source_host},
            {"employeeNo", copy.employee_no},
            {"attempt", std::to_string(attempt)},
            {"delayMs", std::to_string(delay_ms)},
            {"serialNo", copy.serial_no}
        });
        queue_hris_device_event(copy);
    }).detach();
}

// ISAPI FingerPrintUpload read (raw base64) as fallback when SDK fingerprint read is empty.
bool read_fingerprints_via_isapi(
    DeviceSession &session,
    const std::string &employee_no,
    std::string *fingerprints_json,
    int *fingerprint_count) {
    if (employee_no.empty() || fingerprints_json == nullptr || fingerprint_count == nullptr) {
        return false;
    }
    std::ostringstream body;
    body << "{\"FingerPrintCond\":{"
         << "\"searchID\":\"pt-fp-" << json_escape(employee_no) << "\","
         << "\"searchResultPosition\":0,"
         << "\"maxResults\":32,"
         << "\"employeeNo\":\"" << json_escape(employee_no) << "\""
         << "}}";
    std::string response;
    const bool ok = stdxml_json_request(
        session,
        "POST /ISAPI/AccessControl/FingerPrintUpload?format=json",
        body.str(),
        &response);
    if (!ok || response.empty()) {
        emit_json({
            {"event", "isapi_fingerprint_read"},
            {"sourceDeviceId", session.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"}
        });
        return false;
    }
    // Extract fingerData base64 fields.
    static const std::regex finger_data_regex("\"fingerData\"\\s*:\\s*\"([^\"]+)\"");
    static const std::regex finger_id_regex("\"fingerPrintID\"\\s*:\\s*([0-9]+)");
    std::vector<std::string> datas;
    for (std::sregex_iterator it(response.begin(), response.end(), finger_data_regex), end;
         it != end;
         ++it) {
        const std::string data = (*it)[1].str();
        if (data.size() >= 8) {
            datas.push_back(data);
        }
    }
    if (datas.empty()) {
        emit_json({
            {"event", "isapi_fingerprint_read"},
            {"sourceDeviceId", session.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "true"},
            {"fingerprintCount", "0"}
        });
        return false;
    }
    std::ostringstream fp_json;
    fp_json << "[";
    for (size_t i = 0; i < datas.size(); ++i) {
        if (i > 0) {
            fp_json << ",";
        }
        fp_json << "{\"fingerPrintId\":" << (i + 1)
                << ",\"fingerType\":0"
                << ",\"length\":" << datas[i].size()
                << ",\"data\":\"" << datas[i] << "\"}";
    }
    fp_json << "]";
    *fingerprints_json = fp_json.str();
    *fingerprint_count = static_cast<int>(datas.size());
    emit_json({
        {"event", "isapi_fingerprint_read"},
        {"sourceDeviceId", session.config.hris_device_id},
        {"employeeNo", employee_no},
        {"ok", "true"},
        {"fingerprintCount", std::to_string(*fingerprint_count)}
    });
    return true;
}

// Face picture via UserInfo faceURL (device truth). Used when SDK face read needs card
// but person has face enrolled without card. Binary response base64-encoded for callback.
bool read_face_picture_via_isapi_userinfo(
    DeviceSession &session,
    const std::string &employee_no,
    std::string *face_picture_b64) {
    if (employee_no.empty() || face_picture_b64 == nullptr) {
        return false;
    }
    face_picture_b64->clear();
    std::ostringstream body;
    body << "{\"UserInfoSearchCond\":{"
         << "\"searchID\":\"pt-face-" << json_escape(employee_no) << "\","
         << "\"searchResultPosition\":0,"
         << "\"maxResults\":1,"
         << "\"EmployeeNoList\":[{\"employeeNo\":\"" << json_escape(employee_no) << "\"}]"
         << "}}";
    std::string response;
    const bool ok = stdxml_json_request(
        session,
        "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
        body.str(),
        &response);
    if (!ok || response.empty()) {
        emit_json({
            {"event", "isapi_face_userinfo_read"},
            {"sourceDeviceId", session.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"reason", "userinfo_search_failed"}
        });
        return false;
    }
    const std::string face_url = extract_string_field_from_json(response, "faceURL");
    // numOfFace may be number in JSON — soft check via string field or presence of faceURL.
    if (face_url.empty()) {
        emit_json({
            {"event", "isapi_face_userinfo_read"},
            {"sourceDeviceId", session.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "true"},
            {"facePictureChars", "0"},
            {"reason", "no_faceURL"}
        });
        return false;
    }
    // faceURL is typically a device-relative path like /ISAPI/.../picture?type=...
    std::string path = face_url;
    if (path.rfind("http://", 0) == 0 || path.rfind("https://", 0) == 0) {
        // Keep path+query only for stdxml.
        const auto scheme_end = path.find("://");
        if (scheme_end != std::string::npos) {
            const auto path_start = path.find('/', scheme_end + 3);
            if (path_start != std::string::npos) {
                path = path.substr(path_start);
            }
        }
    }
    if (path.empty() || path[0] != '/') {
        path = "/" + path;
    }
    std::string picture;
    const bool pic_ok = stdxml_json_request(
        session,
        "GET " + path,
        "",
        &picture);
    if (!pic_ok || picture.size() < 32) {
        emit_json({
            {"event", "isapi_face_userinfo_read"},
            {"sourceDeviceId", session.config.hris_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"reason", "faceURL_download_failed"},
            {"faceURL", face_url}
        });
        return false;
    }
    *face_picture_b64 = base64_encode(
        reinterpret_cast<const BYTE *>(picture.data()),
        picture.size());
    emit_json({
        {"event", "isapi_face_userinfo_read"},
        {"sourceDeviceId", session.config.hris_device_id},
        {"employeeNo", employee_no},
        {"ok", "true"},
        {"facePictureChars", std::to_string(face_picture_b64->size())},
        {"faceURL", face_url}
    });
    return !face_picture_b64->empty();
}

// Before POST: fill plain employeeNo when ACS left it empty; attach raw FP/face when possible.
// This is the correct place to harden "socket always has plain id" for enroll — not inventing in UI.
void enrich_hris_job_before_post(ReconcileJob &job) {
    DeviceSession *session = find_session_by_host(job.source_host);
    if (session == nullptr) {
        if (job.employee_no.empty()) {
            job.identity_source = "empty";
        } else if (job.identity_source.empty()) {
            job.identity_source = "acs_dwEmployeeNo";
        }
        emit_json({
            {"event", "callback_enrich_skipped"},
            {"reason", "session_not_found"},
            {"sourceHost", job.source_host},
            {"employeeNo", job.employee_no}
        });
        return;
    }

    const bool is_repost = job.event_kind.find("identity_repost") != std::string::npos;

    if (should_defer_empty_callback_identity_to_backend(job)) {
        job.identity_source = "empty";
        emit_json({
            {"event", "callback_identity_enrich_deferred"},
            {"sourceDeviceId", job.source_device_id},
            {"sourceHost", job.source_host},
            {"major", std::to_string(job.major)},
            {"minor", std::to_string(job.minor)},
            {"reason", "backend_operation_log_resolution"}
        });
    } else if (job.employee_no.empty() && needs_callback_identity_enrich(job)) {
        // Panel UserInfo may lag ACS major=3 — multipass inventory with longer delays on repost.
        const bool identity_scan_claimed =
            claim_callback_identity_scan(job.source_host);
        if (!identity_scan_claimed) {
            emit_json({
                {"event", "callback_identity_enrich_throttled"},
                {"sourceDeviceId", job.source_device_id},
                {"sourceHost", job.source_host},
                {"isRepost", is_repost ? "true" : "false"},
                {"cooldownMs", "60000"},
                {"reason", "full_inventory_single_flight"}
            });
        } else if (!is_repost) {
            // One initial inventory delta detects a genuinely new identity.
            const std::string plain =
                resolve_plain_employee_no_from_inventory(*session);
            if (!plain.empty()) {
                job.employee_no = plain;
                job.identity_source = "inventory_delta";
                mark_recent_employee_candidate(job.source_host, plain);
            }
        } else {
            // One delayed touch pass covers lagged creates and changes to an
            // existing person's name or biometric counts.
            const std::string plain =
                resolve_plain_employee_no_from_userinfo_touch(*session);
            if (!plain.empty()) {
                job.employee_no = plain;
                job.identity_source = "userinfo_touch";
                mark_recent_employee_candidate(job.source_host, plain);
            }
        }
        emit_json({
            {"event", "callback_identity_resolved"},
            {"sourceDeviceId", job.source_device_id},
            {"sourceHost", job.source_host},
            {"employeeNo", job.employee_no},
            {"identitySource",
             job.employee_no.empty() ? "empty" : job.identity_source},
            {"isRepost", is_repost ? "true" : "false"}
        });
        if (job.employee_no.empty()) {
            job.identity_source = "empty";
            // One delayed pass covers UserInfo lag without amplifying empty
            // callbacks into thousands of full-inventory page reads.
            if (!is_repost && identity_scan_claimed) {
                schedule_delayed_hris_identity_repost(job, 5000, 1);
            }
        }
    } else if (!job.employee_no.empty() && job.identity_source.empty()) {
        job.identity_source =
            job.event_kind.find("poll_") == 0 ? "poll_inventory" : "acs_dwEmployeeNo";
        emit_json({
            {"event", "callback_identity_resolved"},
            {"sourceDeviceId", job.source_device_id},
            {"sourceHost", job.source_host},
            {"employeeNo", job.employee_no},
            {"identitySource", job.identity_source},
            {"isRepost", is_repost ? "true" : "false"}
        });
    }

    if (!needs_callback_template_enrich(job)) {
        emit_json({
            {"event", "callback_enrich_done"},
            {"sourceDeviceId", job.source_device_id},
            {"employeeNo", job.employee_no},
            {"identitySource", job.identity_source},
            {"fingerprintCount", "0"},
            {"templatesAttached", "false"},
            {"isRepost", is_repost ? "true" : "false"}
        });
        return;
    }

    // Fingerprint templates (raw base64) when needs_callback_template_enrich passed.
    // Always attempt SDK then ISAPI with short retries (do not re-gate on minor here —
    // op-sync + inventory_delta plain id must reach this path).
    {
        static const int fp_delays_ms[] = {0, 600, 1500, 3000};
        for (int delay_ms : fp_delays_ms) {
            if (delay_ms > 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
            }
            const auto templates = read_source_fingerprints(*session, job);
            if (!templates.empty()) {
                std::ostringstream fp_json;
                fp_json << "[";
                for (size_t i = 0; i < templates.size(); ++i) {
                    const auto &record = templates[i];
                    if (i > 0) {
                        fp_json << ",";
                    }
                    const std::string data =
                        base64_encode(record.byFingerData, record.dwFingerPrintLen);
                    fp_json << "{\"fingerPrintId\":" << static_cast<int>(record.byFingerPrintID)
                            << ",\"fingerType\":" << static_cast<int>(record.byFingerType)
                            << ",\"length\":" << record.dwFingerPrintLen
                            << ",\"data\":\"" << data << "\"}";
                }
                fp_json << "]";
                job.fingerprints_json = fp_json.str();
                job.fingerprint_count = static_cast<int>(templates.size());
                break;
            }
            std::string isapi_json;
            int isapi_count = 0;
            if (read_fingerprints_via_isapi(*session, job.employee_no, &isapi_json, &isapi_count) &&
                isapi_count > 0) {
                job.fingerprints_json = isapi_json;
                job.fingerprint_count = isapi_count;
                break;
            }
        }
    }

    // Face template/picture whenever we already decided templates are needed for this
    // callback (create/enroll/op-sync with plain id). SDK face is card-keyed; ISAPI
    // faceURL is the no-card fallback (panel face enroll without card).
    if (job.include_face_recognition || is_user_management_minor(job.minor) ||
        is_fingerprint_management_minor(job.minor) || job.major == 3 ||
        job.major == MAJOR_OPERATION ||
        job.event_kind.find("identity_repost") != std::string::npos ||
        job.event_kind.find("template_repost") != std::string::npos) {
        std::string user_json;
        std::string card_json;
        read_source_user(*session, job, &user_json);
        read_source_card(*session, job, &card_json);
        std::string card_no = extract_string_field_from_json(card_json, "cardNo");
        if (card_no.empty()) {
            card_no = extract_string_field_from_json(user_json, "cardNo");
        }
        if (job.card_no.empty() && !card_no.empty()) {
            job.card_no = card_no;
        }
        if (!card_no.empty()) {
            std::vector<char> face_template;
            std::vector<char> face_picture;
            if (read_face_and_template(
                    *session, job.employee_no, card_no, &face_template, &face_picture)) {
                if (!face_template.empty()) {
                    job.face_template_b64 = base64_encode(
                        reinterpret_cast<const BYTE *>(face_template.data()),
                        face_template.size());
                }
                if (!face_picture.empty()) {
                    job.face_picture_b64 = base64_encode(
                        reinterpret_cast<const BYTE *>(face_picture.data()),
                        face_picture.size());
                }
            }
        }
        // No card or SDK empty: still try UserInfo faceURL picture (raw image bytes).
        if (job.face_picture_b64.empty()) {
            std::string pic_b64;
            if (read_face_picture_via_isapi_userinfo(*session, job.employee_no, &pic_b64)) {
                job.face_picture_b64 = pic_b64;
            }
        }
    }

    emit_json({
        {"event", "callback_enrich_done"},
        {"sourceDeviceId", job.source_device_id},
        {"employeeNo", job.employee_no},
        {"identitySource", job.identity_source},
        {"fingerprintCount", std::to_string(job.fingerprint_count)},
        {"faceTemplateChars", std::to_string(job.face_template_b64.size())},
        {"facePictureChars", std::to_string(job.face_picture_b64.size())},
        {"templatesAttached",
         (job.fingerprint_count > 0 || !job.face_template_b64.empty() ||
          !job.face_picture_b64.empty())
             ? "true"
             : "false"}
    });

    // Enroll lag: plain id known but device FP/face not readable yet → keep id and retry.
    // Caps at 3 template_repost attempts via schedule_delayed_template_repost.
    const bool is_template_repost =
        job.event_kind.find("template_repost") != std::string::npos;
    const bool templates_empty =
        job.fingerprint_count <= 0 && job.face_template_b64.empty() &&
        job.face_picture_b64.empty();
    if (!job.employee_no.empty() && templates_empty && !is_template_repost) {
        // Only for ops that can carry templates (create/enroll/modify/op-sync).
        if (needs_callback_template_enrich(job) || is_fingerprint_management_minor(job.minor) ||
            job.include_fingerprints || job.include_face_recognition) {
            schedule_delayed_template_repost(job, 2500, 1);
            schedule_delayed_template_repost(job, 6000, 2);
            schedule_delayed_template_repost(job, 12000, 3);
        }
    }
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

    std::string spool_path;
    {
        std::lock_guard<std::mutex> lock(callback_spool_mutex);
        if (ensure_callback_spool_dir()) {
            spool_path = build_callback_spool_path(job);
            const std::string temporary_path = spool_path + ".tmp";
            if (!write_text_file(temporary_path, body) || std::rename(temporary_path.c_str(), spool_path.c_str()) != 0) {
                std::remove(temporary_path.c_str());
                emit_json({{"event", "hikvision_callback_spool_write_failed"}, {"path", spool_path}});
                spool_path.clear();
            } else {
                callback_posts_in_flight.insert(spool_path);
                emit_json({{"event", "hikvision_callback_spool_written"}, {"path", spool_path}});
            }
        }
    }

    const std::string url = hris_api_base + "/api/hikvision/callback";
    // Raw biometric custody can require DeviceUser + DeviceEvent writes before the API
    // acknowledges. Attendance uses one short live attempt; its durable spool is the
    // retry mechanism. This prevents one unhealthy API request from head-of-line
    // blocking later taps. Enrichment callbacks retain the longer retry budget.
    const bool immediate = is_immediate_hris_job(job);
    const bool ok = post_json_with_retries(
        url,
        body,
        "hikvision_callback_post",
        immediate ? 1 : 3,
        immediate ? 0 : 1500,
        immediate ? 5 : 30);
    emit_json({
        {"event", "hikvision_callback_post_result"},
        {"sourceDeviceId", job.source_device_id},
        {"sourceHost", job.source_host},
        {"employeeNo", job.employee_no},
        {"serialNo", job.serial_no},
        {"ok", ok ? "true" : "false"}
    });
    if (!spool_path.empty()) {
        std::lock_guard<std::mutex> lock(callback_spool_mutex);
        if (ok) {
            std::remove(spool_path.c_str());
            emit_json({{"event", "hikvision_callback_spool_cleared"}, {"path", spool_path}});
        }
        callback_posts_in_flight.erase(spool_path);
    }
    return ok;
}

bool post_hris_contract(const ReconcileJob &job, const std::string &status) {
    const std::string contract = build_status_contract_json(job, status);
    if (hris_api_base.empty() || !execute_mode) {
        post_hris_contract_preview(job, status);
        if (hris_api_base.empty()) {
            emit_json({
                {"event", "hris_contract_post_skipped"},
                {"reason", "missing_hris_api_base"}
            });
            return false;
        }
        return true;
    }
    return post_hris_contract_payload(
        contract,
        sanitize_filename_token(job.source_device_id + "_" + (job.employee_no.empty() ? "all" : job.employee_no) + "_" + status),
        {
            {"sourceDeviceId", job.source_device_id},
            {"employeeNo", job.employee_no},
            {"status", status}
        });
}

bool process_fast_user_delta_reconcile(DeviceSession &source, const ReconcileJob &job) {
    const std::vector<std::string> source_employee_numbers = read_device_employee_numbers(source);
    if (source_employee_numbers.empty()) {
        emit_json({
            {"event", "reconcile_fast_path_fallback"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"reason", "empty_source_inventory"}
        });
        return false;
    }

    int peer_count = 0;
    int peer_write_count = 0;
    int missing_total = 0;

    for (auto &target : sessions) {
        if (target.config.hris_device_id == source.config.hris_device_id) {
            continue;
        }

        peer_count += 1;
        const std::vector<std::string> target_employee_numbers = read_device_employee_numbers(target);
        const std::vector<std::string> missing_employee_numbers =
            find_missing_employee_numbers(source_employee_numbers, target_employee_numbers);
        missing_total += static_cast<int>(missing_employee_numbers.size());

        emit_json({
            {"event", "reconcile_fast_path_inventory_delta"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"targetDeviceId", target.config.hris_device_id},
            {"sourceEmployees", std::to_string(source_employee_numbers.size())},
            {"targetEmployees", std::to_string(target_employee_numbers.size())},
            {"missingEmployees", std::to_string(missing_employee_numbers.size())}
        });

        for (const auto &employee_no : missing_employee_numbers) {
            ReconcileJob mirror_job = job;
            mirror_job.employee_no = employee_no;
            mirror_job.include_fingerprints = false;

            std::string mirror_user_json;
            if (!read_source_user(source, mirror_job, &mirror_user_json)) {
                continue;
            }
            if (retry_peer_operation("user", target, mirror_job.employee_no, [&]() {
                    return write_peer_user(target, mirror_job, mirror_user_json);
                })) {
                peer_write_count += 1;
            }
        }
    }

    post_hris_contract(job, missing_total > 0 ? "mirrored_fast" : "fast_checked");
    emit_json({
        {"event", "reconcile_fast_path_completed"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"peerDevices", std::to_string(peer_count)},
        {"peerUserWrites", std::to_string(peer_write_count)},
        {"missingEmployees", std::to_string(missing_total)},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });
    return true;
}

void maybe_queue_polled_reconcile(const ReconcileJob &job, const std::string &reason) {
    if (job.source_host.empty() || job.employee_no.empty()) {
        return;
    }
    const std::string key =
        job.source_host + "|" + job.employee_no + "|" + (job.include_fingerprints ? "fp" : "user");
    if (!should_queue_poll_reconcile_now(key)) {
        return;
    }
    emit_json({
        {"event", "poll_reconcile_queued"},
        {"reason", reason},
        {"sourceDeviceId", job.source_device_id},
        {"sourceHost", job.source_host},
        {"employeeNo", job.employee_no},
        {"includeFingerprints", job.include_fingerprints ? "true" : "false"}
    });
    queue_reconcile(job);
}

void polling_loop() {
    while (keep_running) {
        for (int i = 0; i < inventory_poll_interval.count() * 10 && keep_running; ++i) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        if (!keep_running || !execute_mode || sessions.size() < 2) {
            continue;
        }

        for (auto &source : sessions) {
            const std::vector<std::string> source_employee_numbers = read_device_employee_numbers(source);
            if (source_employee_numbers.empty()) {
                continue;
            }

            const std::set<std::string> current_employee_numbers(
                source_employee_numbers.begin(), source_employee_numbers.end());
            auto observed = observed_employee_numbers_by_host.find(source.config.host);
            if (observed == observed_employee_numbers_by_host.end()) {
                observed_employee_numbers_by_host[source.config.host] = current_employee_numbers;
                emit_json({
                    {"event", "poll_user_inventory_baseline"},
                    {"sourceDeviceId", source.config.hris_device_id},
                    {"sourceHost", source.config.host},
                    {"employeeCount", std::to_string(current_employee_numbers.size())}
                });
            } else {
                for (const auto &employee_no : current_employee_numbers) {
                    if (observed->second.find(employee_no) != observed->second.end()) {
                        continue;
                    }

                    ReconcileJob lifecycle_job;
                    lifecycle_job.source_host = source.config.host;
                    lifecycle_job.source_device_id = source.config.hris_device_id;
                    lifecycle_job.employee_no = employee_no;
                    lifecycle_job.major = MAJOR_OPERATION;
                    lifecycle_job.minor = MINOR_ADD_USER_INFO;
                    lifecycle_job.event_kind = "poll_inventory_user_created";
                    lifecycle_job.sdk_time = now_utc();
                    queue_hris_device_event(lifecycle_job);
                    observed->second.insert(employee_no);
                    emit_json({
                        {"event", "poll_user_created_detected"},
                        {"sourceDeviceId", source.config.hris_device_id},
                        {"sourceHost", source.config.host},
                        {"employeeNo", employee_no},
                        {"observedAt", lifecycle_job.sdk_time}
                    });
                }
            }

            for (auto &target : sessions) {
                if (target.config.hris_device_id == source.config.hris_device_id) {
                    continue;
                }

                const std::vector<std::string> target_employee_numbers = read_device_employee_numbers(target);
                const std::vector<std::string> missing_employee_numbers =
                    find_missing_employee_numbers(source_employee_numbers, target_employee_numbers);
                for (const auto &employee_no : missing_employee_numbers) {
                    ReconcileJob job;
                    job.source_host = source.config.host;
                    job.source_device_id = source.config.hris_device_id;
                    job.employee_no = employee_no;
                    job.major = MAJOR_OPERATION;
                    job.minor = MINOR_ADD_USER_INFO;
                    job.event_kind = "poll_missing_user";
                    job.include_fingerprints = true;
                    maybe_queue_polled_reconcile(job, "missing_user");
                }
            }

            // Poll the full small device inventory so face enrollment is found even
            // when this firmware rejects the SDK alarm channel with 1924.
            const std::vector<std::string> recent_employees = source_employee_numbers;
            for (const auto &employee_no : recent_employees) {
                ReconcileJob fingerprint_job;
                fingerprint_job.source_host = source.config.host;
                fingerprint_job.source_device_id = source.config.hris_device_id;
                fingerprint_job.employee_no = employee_no;
                fingerprint_job.major = MAJOR_OPERATION;
                fingerprint_job.minor = MINOR_ADD_FINGER_BY_EMPLOYEE_NO;
                fingerprint_job.event_kind = "poll_recent_fingerprint";
                fingerprint_job.include_fingerprints = true;

                const int source_template_count =
                    static_cast<int>(read_source_fingerprints(source, fingerprint_job).size());
                if (source_template_count <= 0) {
                    continue;
                }

                for (auto &target : sessions) {
                    if (target.config.hris_device_id == source.config.hris_device_id) {
                        continue;
                    }
                    const int target_template_count =
                        static_cast<int>(read_source_fingerprints(target, fingerprint_job).size());
                    if (target_template_count < source_template_count) {
                        maybe_queue_polled_reconcile(fingerprint_job, "fingerprint_delta");
                    }
                }

                ReconcileJob face_job = fingerprint_job;
                std::string source_card_json;
                read_source_card(source, face_job, &source_card_json);
                const std::string source_card_no = extract_string_field_from_json(source_card_json, "cardNo");
                if (!source_card_no.empty()) {
                    std::vector<char> source_face_template;
                    std::vector<char> source_face_picture;
                    const bool source_has_face = read_face_and_template(
                        source, employee_no, source_card_no,
                        &source_face_template, &source_face_picture);
                    if (source_has_face) {
                        for (auto &target : sessions) {
                            if (target.config.hris_device_id == source.config.hris_device_id) {
                                continue;
                            }
                            std::vector<char> target_face_template;
                            std::vector<char> target_face_picture;
                            const bool target_has_face = read_face_and_template(
                                target, employee_no, source_card_no,
                                &target_face_template, &target_face_picture);
                            if (!target_has_face) {
                                maybe_queue_polled_reconcile(face_job, "face_delta");
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}

template <typename Operation>
bool retry_peer_operation(
    const std::string &operation,
    DeviceSession &target,
    const std::string &employee_no,
    Operation operation_fn) {
    constexpr int max_attempts = 3;
    for (int attempt = 1; attempt <= max_attempts; ++attempt) {
        const bool ok = operation_fn();
        emit_json({
            {"event", "peer_sync_attempt"},
            {"operation", operation},
            {"targetDeviceId", target.config.hris_device_id},
            {"targetHost", target.config.host},
            {"employeeNo", employee_no},
            {"attempt", std::to_string(attempt)},
            {"maxAttempts", std::to_string(max_attempts)},
            {"ok", ok ? "true" : "false"}
        });
        if (ok) {
            return true;
        }
        if (attempt < max_attempts) {
            std::this_thread::sleep_for(std::chrono::milliseconds(350 * attempt));
        }
    }
    emit_json({
        {"event", "peer_sync_failed_after_retries"},
        {"operation", operation},
        {"targetDeviceId", target.config.hris_device_id},
        {"targetHost", target.config.host},
        {"employeeNo", employee_no},
        {"attempts", std::to_string(max_attempts)}
    });
    return false;
}

void process_reconcile_job(const ReconcileJob &job) {
    const bool full_mirror = should_full_mirror_reconcile(job);
    struct FullMirrorGuard {
        bool enabled;
        std::string host;
        ~FullMirrorGuard() {
            if (!enabled || host.empty()) {
                return;
            }
            std::lock_guard<std::mutex> lock(full_mirror_guard_mutex);
            pending_full_mirror_hosts.erase(host);
        }
    } full_mirror_guard{full_mirror, job.source_host};

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
    if (should_attempt_fast_user_delta_reconcile(job)) {
        if (process_fast_user_delta_reconcile(*source, job)) {
            return;
        }
    }
    if (should_full_mirror_reconcile(job)) {
        const std::vector<std::string> employee_numbers = read_device_employee_numbers(*source);
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
            std::vector<char> mirror_face_template;
            std::vector<char> mirror_face_picture;
            std::string mirror_card_json;
            read_source_card(*source, mirror_job, &mirror_card_json);
            const std::string mirror_card_no = extract_string_field_from_json(mirror_card_json, "cardNo");
            const bool mirror_face_available = !mirror_card_no.empty() &&
                read_face_and_template(*source, employee_no, mirror_card_no,
                    &mirror_face_template, &mirror_face_picture);

            for (auto &target : sessions) {
                if (target.config.host == source->config.host) {
                    continue;
                }
                peer_count += 1;
                if (write_peer_user(target, mirror_job, mirror_user_json)) {
                    peer_write_count += 1;
                }
                retry_peer_operation("fingerprint", target, mirror_job.employee_no, [&]() {
                    return write_peer_fingerprints(target, mirror_job, mirror_fingerprints);
                });
                if (mirror_face_available && mirror_job.include_face_recognition) {
                    retry_peer_operation("face", target, employee_no, [&]() {
                        return write_face_and_template(target, employee_no, mirror_card_no,
                            mirror_face_template, mirror_face_picture);
                    });
                }
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
        if (job.event_kind.find("manual_") == 0) {
            keep_running = 0;
            queue_cv.notify_all();
        }
        return;
    }

    std::string user_json;
    const bool user_ok = user_delete ? true : read_source_user(*source, job, &user_json);
    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> fingerprints =
        job.include_fingerprints && !fingerprint_delete
            ? read_source_fingerprints(*source, job)
            : std::vector<NET_DVR_FINGER_PRINT_CFG_V50>{};
    std::vector<char> face_template;
    std::vector<char> face_picture;
    std::string card_json;
    std::string card_no;
    const bool card_available =
        (job.include_card || job.include_face_recognition) &&
        !user_delete && user_ok &&
        read_source_card(*source, job, &card_json) &&
        !(card_no = extract_string_field_from_json(card_json, "cardNo")).empty();
    const bool face_available = job.include_face_recognition && card_available &&
        read_face_and_template(*source, job.employee_no, card_no, &face_template, &face_picture);

    const bool new_user_sync = job.event_kind == "poll_missing_user" ||
        job.event_kind == "biometric_user_management";
    if (!user_delete && user_ok && card_no.empty() && new_user_sync) {
        card_no = build_sync_card_no(job.employee_no);
        if (add_sync_card(*source, job.employee_no, card_no)) {
            emit_json({
                {"event", "source_sync_card_created"},
                {"sourceDeviceId", source->config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"cardNo", "[redacted]"}
            });
        } else {
            card_no.clear();
        }
    }

    for (auto &target : sessions) {
        if (target.config.hris_device_id == source->config.hris_device_id) {
            continue;
        }
        peer_count += 1;
        if (!job.credential_only) {
            if (retry_peer_operation("user", target, job.employee_no, [&]() {
                    return user_delete ? delete_peer_user(target, job) : (user_ok && write_peer_user(target, job, user_json));
                })) {
                peer_write_count += 1;
            }
        } else {
            emit_json({
                {"event", "peer_user_write_skipped"},
                {"targetDeviceId", target.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"reason", "credential_only"}
            });
        }
        if (!user_delete && card_available && (!job.credential_only || job.include_card)) {
            if (!execute_mode) {
                bool already_owned = false;
                const bool owner_ok =
                    target_card_allows_owner(target, job.employee_no, card_no, &already_owned);
                emit_json({
                    {"event", "peer_card_write_preview"},
                    {"targetDeviceId", target.config.hris_device_id},
                    {"employeeNo", job.employee_no},
                    {"ok", owner_ok ? "true" : "false"},
                    {"alreadyOwned", already_owned ? "true" : "false"}
                });
            } else {
                retry_peer_operation("card", target, job.employee_no, [&]() {
                    return add_sync_card_if_unowned(
                        target, job.employee_no, card_no);
                });
            }
        }
        if (fingerprint_delete || job.include_fingerprints) {
            retry_peer_operation("fingerprint", target, job.employee_no, [&]() {
                return fingerprint_delete ? delete_peer_fingerprints(target, job) : write_peer_fingerprints(target, job, fingerprints);
            });
        }
        if (face_available && job.include_face_recognition) {
            retry_peer_operation("face", target, job.employee_no, [&]() {
                return write_face_and_template(target, job.employee_no, card_no, face_template, face_picture);
            });
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
        {"sourceFaceAvailable", face_available ? "true" : "false"},
        {"sourceFaceTemplateSize", std::to_string(face_template.size())},
        {"sourceFacePictureSize", std::to_string(face_picture.size())},
        {"credentialOnly", job.credential_only ? "true" : "false"},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });
    if (job.event_kind.find("manual_") == 0) {
        keep_running = 0;
        queue_cv.notify_all();
    }
}

void prepare_immediate_hris_job_for_post(ReconcileJob &job) {
    if (job.identity_source.empty()) {
        job.identity_source = job.employee_no.empty() ? "empty" : "acs_dwEmployeeNo";
    }
    emit_json({
        {"event", "callback_immediate_ready"},
        {"sourceDeviceId", job.source_device_id},
        {"employeeNo", job.employee_no},
        {"identitySource", job.identity_source},
        {"serialNo", job.serial_no},
        {"sdkReads", "0"}
    });
}

// Dedicated auth/attendance lane. It never calls enrich_hris_job_before_post,
// therefore it cannot wait on inventory, fingerprint, face, or reconciliation SDK work.
void hris_immediate_post_loop() {
    while (keep_running) {
        ReconcileJob hris_job;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            queue_cv.wait_for(lock, std::chrono::milliseconds(50), [] {
                return !hris_immediate_event_queue.empty() || !keep_running;
            });
            if (!keep_running || hris_immediate_event_queue.empty()) {
                continue;
            }
            hris_job = hris_immediate_event_queue.front();
            hris_immediate_event_queue.pop_front();
        }
        prepare_immediate_hris_job_for_post(hris_job);
        post_hikvision_callback(hris_job);
    }
}

// Lifecycle/operation lane. SDK identity and biometric enrichment can be slow,
// but it is isolated from authentication delivery.
void hris_enrichment_post_loop() {
    while (keep_running) {
        ReconcileJob hris_job;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            queue_cv.wait_for(lock, std::chrono::milliseconds(200), [] {
                return !hris_enrichment_event_queue.empty() || !keep_running;
            });
            if (!keep_running || hris_enrichment_event_queue.empty()) {
                continue;
            }
            hris_job = hris_enrichment_event_queue.front();
            hris_enrichment_event_queue.pop_front();
        }
        enrich_hris_job_before_post(hris_job);
        post_hikvision_callback(hris_job);
    }
}

void reconcile_worker_loop() {
    while (keep_running) {
        ReconcileJob reconcile_job;
        bool has_reconcile_job = false;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            queue_cv.wait_for(lock, std::chrono::milliseconds(200), [] {
                return !reconcile_queue.empty() || !keep_running;
            });
            if (!reconcile_queue.empty()) {
                reconcile_job = reconcile_queue.front();
                reconcile_queue.pop_front();
                has_reconcile_job = true;
            }
        }
        if (has_reconcile_job) {
            process_reconcile_job(reconcile_job);
        }
    }
}

// Back-compat name used by older call sites if any.
void worker_loop() {
    hris_enrichment_post_loop();
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
    session.last_login_error = session.user_id >= 0 ? 0 : NET_DVR_GetLastError();
    emit_json({
        {"event", "sdk_login"},
        {"deviceId", session.config.hris_device_id},
        {"deviceName", session.config.name},
        {"host", session.config.host},
        {"sdkPort", std::to_string(session.config.sdk_port)},
        {"ok", session.user_id >= 0 ? "true" : "false"},
        {"lastError", session.user_id >= 0 ? "0" : std::to_string(session.last_login_error)}
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
        << "[--min-sdk-time YYYY-MM-DDTHH:MM:SS] [--execute|--dry-run] [--seconds n] "
        << "[--replay-spool-only] [--post-contract-file path] "
        << "[--manual-full-mirror-source-device-id id] "
        << "[--manual-employee-no employeeNo] [--manual-include-fingerprints] "
        << "[--manual-exclude-face] [--manual-include-card] [--manual-credential-only] "
        << "[--manual-source-employee-no employeeNo] [--manual-target-device-id id] "
        << "[--manual-target-employee-no employeeNo] "
        << "[--capture-fingerprint-employee-no employeeNo] [--capture-fingerprint-source-device-id id] "
        << "[--finger-no n] [--finger-type n] "
        << "[--capture-face-employee-no employeeNo] [--capture-face-source-device-id id] "
        << "[--mirror-face-employee-no employeeNo] [--mirror-face-source-device-id id] "
        << "[--export-biometric-employee-no employeeNo] [--export-biometric-source-device-id id] "
        << "[--export-biometric-no-fingerprints] [--export-biometric-no-face] "
        << "[--delete-face-device-id id] [--delete-face-employee-no employeeNo] "
        << "[--stored-face-payload-file mode-0600-json]\n";
}

}  // namespace

int main(int argc, char **argv) {
    int seconds = 0;
    std::vector<DeviceConfig> configs;
    bool replay_spool_only = false;
    std::string post_contract_file;
    std::string manual_full_mirror_source_device_id;
    std::string manual_employee_no;
    bool manual_include_fingerprints = false;
    bool manual_include_face_recognition = true;
    bool manual_include_card = false;
    bool manual_credential_only = false;
    std::string manual_source_employee_no;
    std::string manual_target_device_id;
    std::string manual_target_employee_no;
    std::string capture_fingerprint_employee_no;
    std::string capture_fingerprint_source_device_id;
    int capture_finger_no = 1;
    int capture_finger_type = 0;
    std::string capture_face_employee_no;
    std::string capture_face_source_device_id;
    std::string mirror_face_employee_no;
    std::string mirror_face_source_device_id;
    std::string export_biometric_employee_no;
    std::string export_biometric_source_device_id;
    bool export_biometric_include_fingerprints = true;
    bool export_biometric_include_face = true;
    std::string delete_face_device_id;
    std::string delete_face_employee_no;
    std::string stored_face_payload_file;

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
        } else if (arg == "--post-contract-file") {
            if (!next(&post_contract_file)) return 2;
        } else if (arg == "--manual-full-mirror-source-device-id") {
            if (!next(&manual_full_mirror_source_device_id)) return 2;
        } else if (arg == "--manual-employee-no") {
            if (!next(&manual_employee_no)) return 2;
        } else if (arg == "--manual-include-fingerprints") {
            manual_include_fingerprints = true;
        } else if (arg == "--manual-exclude-face") {
            manual_include_face_recognition = false;
        } else if (arg == "--manual-include-card") {
            manual_include_card = true;
        } else if (arg == "--manual-credential-only") {
            manual_credential_only = true;
        } else if (arg == "--manual-source-employee-no") {
            if (!next(&manual_source_employee_no)) return 2;
        } else if (arg == "--manual-target-device-id") {
            if (!next(&manual_target_device_id)) return 2;
        } else if (arg == "--manual-target-employee-no") {
            if (!next(&manual_target_employee_no)) return 2;
        } else if (arg == "--capture-fingerprint-employee-no") {
            if (!next(&capture_fingerprint_employee_no)) return 2;
        } else if (arg == "--capture-fingerprint-source-device-id") {
            if (!next(&capture_fingerprint_source_device_id)) return 2;
        } else if (arg == "--finger-no") {
            std::string value;
            if (!next(&value)) return 2;
            capture_finger_no = std::max(1, std::min(10, std::stoi(value)));
        } else if (arg == "--finger-type") {
            std::string value;
            if (!next(&value)) return 2;
            capture_finger_type = std::max(0, std::min(4, std::stoi(value)));
        } else if (arg == "--capture-face-employee-no") {
            if (!next(&capture_face_employee_no)) return 2;
        } else if (arg == "--capture-face-source-device-id") {
            if (!next(&capture_face_source_device_id)) return 2;
        } else if (arg == "--mirror-face-employee-no") {
            if (!next(&mirror_face_employee_no)) return 2;
        } else if (arg == "--mirror-face-source-device-id") {
            if (!next(&mirror_face_source_device_id)) return 2;
        } else if (arg == "--export-biometric-employee-no") {
            if (!next(&export_biometric_employee_no)) return 2;
        } else if (arg == "--export-biometric-source-device-id") {
            if (!next(&export_biometric_source_device_id)) return 2;
        } else if (arg == "--export-biometric-no-fingerprints") {
            export_biometric_include_fingerprints = false;
        } else if (arg == "--export-biometric-no-face") {
            export_biometric_include_face = false;
        } else if (arg == "--delete-face-device-id") {
            if (!next(&delete_face_device_id)) return 2;
        } else if (arg == "--delete-face-employee-no") {
            if (!next(&delete_face_employee_no)) return 2;
        } else if (arg == "--stored-face-payload-file") {
            if (!next(&stored_face_payload_file)) return 2;
        } else if (arg == "--min-sdk-time") {
            if (!next(&min_sdk_time)) return 2;
        } else if (arg == "--execute") {
            execute_mode = true;
        } else if (arg == "--dry-run") {
            execute_mode = false;
        } else if (arg == "--replay-spool-only") {
            replay_spool_only = true;
        } else if (arg == "--seconds") {
            std::string value;
            if (!next(&value)) return 2;
            seconds = std::stoi(value);
        } else {
            usage(argv[0]);
            return 2;
        }
    }

    const char *env_token = std::getenv("HIKVISION_HRIS_API_TOKEN");
    if (hris_api_token.empty() && env_token != nullptr) {
        hris_api_token = env_token;
    }
    const char *automatic_reconcile_env =
        std::getenv("HIKVISION_AUTOMATIC_PEER_RECONCILE");
    if (automatic_reconcile_env != nullptr) {
        std::string value = automatic_reconcile_env;
        std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });
        automatic_peer_reconcile_enabled =
            value != "0" && value != "false" && value != "off" && value != "no";
    }

    if (replay_spool_only) {
        replay_pending_hris_contract_posts();
        replay_pending_hikvision_callbacks();
        return 0;
    }

    if (!post_contract_file.empty()) {
        std::string contract;
        if (!read_text_file(post_contract_file, &contract)) {
            std::cerr << "Unable to read --post-contract-file: " << post_contract_file << "\n";
            return 2;
        }
        post_hris_contract_payload(
            contract,
            "manual_contract",
            {
                {"source", "manual_contract_file"},
                {"path", post_contract_file}
            });
        return 0;
    }

    const bool manual_fingerprint_clone_mode =
        !manual_full_mirror_source_device_id.empty() &&
        !manual_source_employee_no.empty() &&
        !manual_target_employee_no.empty() &&
        manual_include_fingerprints;
    const bool manual_fingerprint_capture_mode =
        !capture_fingerprint_employee_no.empty() && !capture_fingerprint_source_device_id.empty();
    const bool manual_face_capture_mode =
        !capture_face_employee_no.empty() && !capture_face_source_device_id.empty();
    const bool manual_face_mirror_mode =
        !mirror_face_employee_no.empty() && !mirror_face_source_device_id.empty();
    const bool manual_biometric_export_mode =
        !export_biometric_employee_no.empty() && !export_biometric_source_device_id.empty();
    const bool delete_face_device_arg_present = !delete_face_device_id.empty();
    const bool delete_face_employee_arg_present = !delete_face_employee_no.empty();
    const bool delete_face_mode =
        delete_face_device_arg_present && delete_face_employee_arg_present;
    const bool stored_face_write_mode = !stored_face_payload_file.empty();
    const bool manual_reconcile_queue_mode =
        !manual_full_mirror_source_device_id.empty() && !manual_fingerprint_clone_mode;
    const bool manual_reconcile_mode =
        manual_reconcile_queue_mode || !manual_employee_no.empty() || manual_fingerprint_clone_mode ||
        manual_fingerprint_capture_mode || manual_face_capture_mode || manual_face_mirror_mode ||
        manual_biometric_export_mode || delete_face_mode || stored_face_write_mode;

    if (configs.empty()) {
        usage(argv[0]);
        return 2;
    }
    if (delete_face_device_arg_present != delete_face_employee_arg_present) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", delete_face_device_id},
            {"employeeNo", delete_face_employee_no},
            {"reason", "paired_delete_face_device_and_employee_required"}
        });
        return 2;
    }
    const bool another_manual_action_requested =
        stored_face_write_mode ||
        !manual_full_mirror_source_device_id.empty() ||
        !manual_employee_no.empty() ||
        manual_include_fingerprints ||
        manual_include_card ||
        manual_credential_only ||
        !manual_source_employee_no.empty() ||
        !manual_target_device_id.empty() ||
        !manual_target_employee_no.empty() ||
        !capture_fingerprint_employee_no.empty() ||
        !capture_fingerprint_source_device_id.empty() ||
        !capture_face_employee_no.empty() ||
        !capture_face_source_device_id.empty() ||
        !mirror_face_employee_no.empty() ||
        !mirror_face_source_device_id.empty() ||
        !export_biometric_employee_no.empty() ||
        !export_biometric_source_device_id.empty();
    if (delete_face_mode &&
        (configs.size() != 1 ||
         configs.front().hris_device_id != delete_face_device_id)) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", delete_face_device_id},
            {"employeeNo", delete_face_employee_no},
            {"configuredDeviceCount", std::to_string(configs.size())},
            {"reason", "delete_face_requires_single_exact_target_config"}
        });
        return 2;
    }
    if (delete_face_mode && another_manual_action_requested) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", delete_face_device_id},
            {"employeeNo", delete_face_employee_no},
            {"reason", "delete_face_requires_exclusive_manual_mode"}
        });
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
    // Arm reverse-tunnel / local hosts first (127.0.0.1 TEST A) so live path is ready
    // before wasting time on unreachable LAN peers.
    std::vector<DeviceConfig> arm_order = configs;
    std::stable_sort(arm_order.begin(), arm_order.end(), [](const DeviceConfig &a, const DeviceConfig &b) {
        const auto score = [](const DeviceConfig &c) {
            if (c.host == "127.0.0.1" || c.host == "localhost" || c.host == "::1") return 0;
            if (c.host.rfind("192.168.254.", 0) == 0) return 1;
            return 2;
        };
        return score(a) < score(b);
    });
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        sessions.reserve(arm_order.size());
    }

    for (const auto &config : arm_order) {
        emit_json({
            {"event", "device_config_loaded"},
            {"deviceId", config.hris_device_id},
            {"name", config.name},
            {"host", config.host},
            {"sdkPort", std::to_string(config.sdk_port)},
            {"peerFlag", config.biometric_peer ? "true" : "false"},
            {"peerPolicy", "all_armed_devices"}
        });

        bool armed = false;
        int attempts_performed = 0;
        bool backed_off = false;
        // Off-LAN peers fail with code 7; one retry is enough for them so TEST A
        // path is not blocked for ~70s on every listener restart.
        const bool is_local_path =
            config.host == "127.0.0.1" || config.host == "localhost" || config.host == "::1" ||
            config.host.rfind("192.168.254.", 0) == 0;
        const int max_login_attempts = is_local_path ? 3 : 1;
        for (int attempt = 1; attempt <= max_login_attempts && !armed; ++attempt) {
            attempts_performed = attempt;
            DeviceSession session;
            session.config = config;
            if (login_device(session) && (manual_reconcile_mode || arm_alarm(session))) {
                {
                    std::lock_guard<std::mutex> lock(sessions_mutex);
                    sessions.push_back(session);
                }
                armed = true;
                emit_json({
                    {"event", "device_armed"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"attempt", std::to_string(attempt)},
                    {"peerEnabled", "true"}
                });
                // Baseline scans read every user and can take tens of seconds per panel.
                // They are required for callback identity deltas in listener mode, but a
                // bounded manual copy already names the employee and must not scan every
                // selected device before doing that one write.
                if (!manual_reconcile_mode) {
                    try {
                        DeviceSession *seed_session = find_session_by_host(config.host);
                        if (seed_session != nullptr) {
                            seed_inventory_baseline_for_session(*seed_session);
                        }
                    } catch (...) {
                        emit_json({
                            {"event", "inventory_baseline_seed_failed"},
                            {"deviceId", config.hris_device_id},
                            {"host", config.host}
                        });
                    }
                }
            } else if (session.user_id >= 0) {
                NET_DVR_Logout_V30(session.user_id);
            }
            if (!armed && session.last_login_error == NET_DVR_USER_LOCKED) {
                emit_json({
                    {"event", "device_login_locked_backoff"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"lastError", std::to_string(session.last_login_error)},
                    {"attempt", std::to_string(attempt)},
                    {"attemptsRemaining", "0"},
                    {"attemptsSkipped", std::to_string(max_login_attempts - attempt)},
                    {"attemptCounterSource", "hris_backoff_guard"}
                });
                backed_off = true;
                break;
            }
            if (!armed && session.last_login_error == NET_DVR_PASSWORD_ERROR) {
                emit_json({
                    {"event", "device_login_auth_failed_backoff"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"lastError", std::to_string(session.last_login_error)},
                    {"attempt", std::to_string(attempt)},
                    {"attemptsRemaining", "0"},
                    {"attemptsSkipped", std::to_string(max_login_attempts - attempt)},
                    {"attemptCounterSource", "hris_backoff_guard"}
                });
                backed_off = true;
                break;
            }
            // Network unreachable (code 7): do not burn retries on this restart.
            if (!armed && session.last_login_error == 7) {
                emit_json({
                    {"event", "device_login_network_fail_skip_retries"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"lastError", "7"},
                    {"attempt", std::to_string(attempt)}
                });
                break;
            }
            if (!armed && attempt < max_login_attempts) {
                std::this_thread::sleep_for(std::chrono::milliseconds(500 * attempt));
            }
        }
        if (!armed) {
            emit_json({
                {"event", "device_arming_failed_after_retries"},
                {"deviceId", config.hris_device_id},
                {"host", config.host},
                {"attempts", std::to_string(attempts_performed)},
                {"maxAttempts", std::to_string(max_login_attempts)},
                {"backedOff", backed_off ? "true" : "false"},
                {"attemptsSkipped", backed_off ? std::to_string(max_login_attempts - attempts_performed) : "0"},
                {"attemptCounterSource", "hris_backoff_guard"}
            });
        }
    }

    bool has_sessions = false;
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        has_sessions = !sessions.empty();
    }
    if (!has_sessions) {
        keep_running = 0;
        queue_cv.notify_all();
        emit_json({{"event", "service_start_failed"}, {"reason", "no_armed_devices"}});
        NET_DVR_Cleanup();
        return 1;
    }

    if (stored_face_write_mode) {
        StoredFaceWritePayload payload;
        std::string reason;
        bool ok = load_stored_face_write_payload(stored_face_payload_file, &payload, &reason);
        DeviceSession *target = nullptr;
        if (ok) {
            for (auto &session : sessions) {
                if (session.config.hris_device_id == payload.target_device_id) {
                    target = &session;
                    break;
                }
            }
            if (target == nullptr) {
                ok = false;
                reason = "target_device_not_armed";
            }
        }
        if (!ok) {
            emit_json({
                {"event", "stored_face_write_blocked"},
                {"targetDeviceId", payload.target_device_id},
                {"employeeNo", payload.employee_no},
                {"reason", reason}
            });
        } else {
            ok = write_stored_face_with_reread(*target, payload);
        }
        close_sessions();
        NET_DVR_Cleanup();
        emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
        return ok ? 0 : 1;
    }

    if (delete_face_mode) {
        DeviceSession *target = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == delete_face_device_id) {
                target = &session;
                break;
            }
        }
        const bool ok =
            target != nullptr && delete_face_for_exact_owner(*target, delete_face_employee_no);
        if (target == nullptr) {
            emit_json({
                {"event", "face_delete_blocked"},
                {"targetDeviceId", delete_face_device_id},
                {"employeeNo", delete_face_employee_no},
                {"reason", "target_device_not_armed"}
            });
        }
        close_sessions();
        NET_DVR_Cleanup();
        emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
        return ok ? 0 : 1;
    }

    // Start worker threads after the initial session list is stable. SDK callbacks
    // can arrive during arming; they queue jobs, then workers process them once
    // all reachable devices are added, avoiding arm-time session-vector races.
    std::vector<std::thread> hris_immediate_posters;
    hris_immediate_posters.reserve(HRIS_IMMEDIATE_WORKER_COUNT);
    for (size_t i = 0; i < HRIS_IMMEDIATE_WORKER_COUNT; ++i) {
        hris_immediate_posters.emplace_back(hris_immediate_post_loop);
    }
    std::thread hris_enrichment_poster(hris_enrichment_post_loop);
    std::thread reconcile_worker(reconcile_worker_loop);
    std::thread callback_spool_replayer(callback_spool_replay_loop);
    // Historical reconcile/callback spools can contain thousands of durable
    // rows. Replaying them before SDK login made a healthy service look active
    // while no panel was armed for minutes or hours. Arm first; replay remains
    // durable background work and is safe to resume after a process restart.
    if (std::getenv("HIKVISION_SKIP_SPOOL_REPLAY") == nullptr) {
        std::thread(replay_pending_hris_contract_posts).detach();
    }

    std::thread poller;
    if (!manual_reconcile_mode && automatic_peer_reconcile_enabled) {
        poller = std::thread(polling_loop);
    }
    if (manual_fingerprint_clone_mode) {
        DeviceSession *manual_source = nullptr;
        DeviceSession *manual_target = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == manual_full_mirror_source_device_id) {
                manual_source = &session;
            }
            if (!manual_target_device_id.empty() && session.config.hris_device_id == manual_target_device_id) {
                manual_target = &session;
            }
        }
        if (manual_source == nullptr) {
            emit_json({
                {"event", "manual_fingerprint_clone_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", manual_full_mirror_source_device_id}
            });
        } else {
            if (manual_target == nullptr) {
                manual_target = manual_target_device_id.empty() ? manual_source : nullptr;
            }
            if (manual_target == nullptr) {
                emit_json({
                    {"event", "manual_fingerprint_clone_failed"},
                    {"reason", "target_device_not_armed"},
                    {"targetDeviceId", manual_target_device_id}
                });
            } else {
                clone_fingerprints_between_users(
                    *manual_source,
                    manual_source_employee_no,
                    *manual_target,
                    manual_target_employee_no);
            }
        }
    }
    if (manual_fingerprint_capture_mode) {
        DeviceSession *capture_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == capture_fingerprint_source_device_id) {
                capture_source = &session;
                break;
            }
        }
        if (capture_source == nullptr) {
            emit_json({
                {"event", "manual_fingerprint_capture_sync_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", capture_fingerprint_source_device_id}
            });
        } else {
            capture_and_sync_fingerprint_for_employee(
                *capture_source,
                capture_fingerprint_employee_no,
                static_cast<BYTE>(capture_finger_no),
                static_cast<BYTE>(capture_finger_type));
        }
    }
    if (manual_face_capture_mode) {
        DeviceSession *capture_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == capture_face_source_device_id) {
                capture_source = &session;
                break;
            }
        }
        if (capture_source == nullptr) {
            emit_json({
                {"event", "manual_face_capture_sync_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", capture_face_source_device_id}
            });
        } else {
            capture_and_sync_face_for_employee(*capture_source, capture_face_employee_no);
        }
    }
    if (manual_face_mirror_mode) {
        DeviceSession *mirror_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == mirror_face_source_device_id) {
                mirror_source = &session;
                break;
            }
        }
        if (mirror_source == nullptr) {
            emit_json({
                {"event", "manual_face_mirror_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", mirror_face_source_device_id}
            });
        } else {
            mirror_face_for_employee(*mirror_source, mirror_face_employee_no);
        }
    }
    if (manual_biometric_export_mode) {
        DeviceSession *export_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == export_biometric_source_device_id) {
                export_source = &session;
                break;
            }
        }
        if (export_source == nullptr) {
            emit_json({
                {"event", "manual_biometric_export_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", export_biometric_source_device_id},
                {"employeeNo", export_biometric_employee_no}
            });
        } else {
            export_biometric_templates_for_employee(
                *export_source,
                export_biometric_employee_no,
                export_biometric_include_fingerprints,
                export_biometric_include_face);
        }
    }
    if (manual_reconcile_queue_mode) {
        DeviceSession *manual_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == manual_full_mirror_source_device_id) {
                manual_source = &session;
                break;
            }
        }
        if (manual_source == nullptr) {
            emit_json({
                {"event", "manual_reconcile_queue_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", manual_full_mirror_source_device_id}
            });
        } else {
            ReconcileJob manual_job;
            manual_job.source_host = manual_source->config.host;
            manual_job.source_device_id = manual_source->config.hris_device_id;
            manual_job.employee_no = manual_employee_no;
            manual_job.major = MAJOR_OPERATION;
            manual_job.minor = manual_employee_no.empty() ? 112 : MINOR_ADD_USER_INFO;
            manual_job.event_kind = manual_employee_no.empty()
                ? "manual_full_mirror"
                : "manual_single_user_reconcile";
            manual_job.include_fingerprints = manual_include_fingerprints || manual_employee_no.empty();
            manual_job.include_face_recognition = manual_include_face_recognition;
            manual_job.include_card = manual_include_card;
            manual_job.credential_only = manual_credential_only;
            if (!execute_mode && manual_job.credential_only) {
                // A credential-only dry run must read the exact source templates
                // and emit target preview events, but may not enqueue a worker
                // that is intentionally disabled in global dry-run mode.
                process_reconcile_job(manual_job);
            } else {
                queue_reconcile(manual_job);
            }
            emit_json({
                {"event", "manual_reconcile_queued"},
                {"sourceDeviceId", manual_job.source_device_id},
                {"sourceHost", manual_job.source_host},
                {"employeeNo", manual_job.employee_no},
                {"includeFingerprints", manual_job.include_fingerprints ? "true" : "false"},
                {"includeFaceRecognition", manual_job.include_face_recognition ? "true" : "false"},
                {"includeCard", manual_job.include_card ? "true" : "false"},
                {"credentialOnly", manual_job.credential_only ? "true" : "false"},
                {"mode", execute_mode ? "execute" : "dry-run"}
            });
        }
    }
    emit_json({
        {"event", "service_started"},
        {"armedDevices", std::to_string(sessions.size())},
        {"mode", execute_mode ? "execute" : "dry-run"},
        {"automaticPeerReconcile", automatic_peer_reconcile_enabled ? "true" : "false"},
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

    for (auto &poster : hris_immediate_posters) {
        if (poster.joinable()) {
            poster.join();
        }
    }
    if (hris_enrichment_poster.joinable()) {
        hris_enrichment_poster.join();
    }
    if (reconcile_worker.joinable()) {
        reconcile_worker.join();
    }
    if (poller.joinable()) {
        poller.join();
    }
    if (callback_spool_replayer.joinable()) {
        callback_spool_replayer.join();
    }
    close_sessions();
    NET_DVR_Cleanup();
    emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
    return 0;
}
