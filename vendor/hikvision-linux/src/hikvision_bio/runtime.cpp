#include "hikvision_bio/prelude.hpp"
#include "hikvision_bio/runtime.hpp"

namespace hikvision_bio {

volatile std::sig_atomic_t keep_running = 1;

std::mutex queue_mutex;
std::condition_variable queue_cv;
std::deque<ReconcileJob> hris_immediate_event_queue;
std::deque<ReconcileJob> hris_enrichment_event_queue;
std::deque<ReconcileJob> reconcile_queue;
std::vector<DeviceSession> sessions;
std::mutex sessions_mutex;
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
std::mutex userinfo_touch_mutex;
std::map<std::string, std::map<std::string, UserInfoTouchSnapshot>> userinfo_touch_baseline_by_host;
std::set<std::string> userinfo_touch_baseline_ready_hosts;
std::set<std::string> pending_full_mirror_hosts;
std::atomic<unsigned long long> delayed_reconcile_token{0};
std::atomic<unsigned long long> callback_spool_token{0};
bool execute_mode = true;
bool automatic_peer_reconcile_enabled = true;
std::string hris_api_base;
std::string hris_api_token;
std::string min_sdk_time;
std::string reconcile_spool_dir = "/tmp/project-truth-hikvision-reconcile-spool";
std::string reconcile_quarantine_dir =
    "/tmp/project-truth-hikvision-reconcile-quarantine";
std::string callback_spool_dir = "/tmp/project-truth-hikvision-callback-spool";

void handle_signal(int) {
    keep_running = 0;
    queue_cv.notify_all();
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
        << "[--stored-face-payload-file mode-0600-json] "
        << "[--get-time] [--set-time] [--time-device-id id] [--local-time ISO] [--time-zone CST-8:00:00]\n";
}

}  // namespace hikvision_bio
