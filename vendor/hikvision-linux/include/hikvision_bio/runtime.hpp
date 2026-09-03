#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <deque>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

#include "HCNetSDK.h"
#include "hikvision_bio/common.hpp"
#include "hikvision_bio/types.hpp"

namespace hikvision_bio {

struct UserInfoTouchSnapshot {
    std::string name;
    int num_of_fp = -1;
    int num_of_face = -1;
    std::string fingerprint() const {
        return name + "|" + std::to_string(num_of_fp) + "|" + std::to_string(num_of_face);
    }
};

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
    bool saw_status = false;
    bool saw_data = false;
    DWORD callback_status = 0;
    BYTE recv_status = 255;
    DWORD sdk_error = 0;
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

struct StoredFaceWritePayload {
    std::string target_device_id;
    std::string employee_no;
    std::string card_no;
    std::vector<char> face_template;
    std::vector<char> face_picture;
};

inline constexpr size_t HRIS_IMMEDIATE_WORKER_COUNT = 2;
inline constexpr auto recent_employee_candidate_ttl = std::chrono::seconds(180);
inline constexpr auto poll_reconcile_min_interval = std::chrono::seconds(3);
inline constexpr auto inventory_poll_interval = std::chrono::seconds(2);
inline constexpr auto callback_identity_scan_min_interval = std::chrono::minutes(1);

extern volatile std::sig_atomic_t keep_running;
extern std::mutex queue_mutex;
extern std::condition_variable queue_cv;
extern std::deque<ReconcileJob> hris_immediate_event_queue;
extern std::deque<ReconcileJob> hris_enrichment_event_queue;
extern std::deque<ReconcileJob> reconcile_queue;
extern std::vector<DeviceSession> sessions;
extern std::mutex sessions_mutex;
extern std::mutex peer_apply_guard_mutex;
extern std::mutex delayed_reconcile_guard_mutex;
extern std::mutex full_mirror_guard_mutex;
extern std::mutex reconcile_spool_mutex;
extern std::mutex callback_spool_mutex;
extern std::set<std::string> callback_posts_in_flight;
extern std::mutex recent_employee_candidate_mutex;
extern std::mutex poll_reconcile_guard_mutex;
extern std::mutex inventory_read_mutex;
extern std::mutex inventory_baseline_mutex;
extern std::map<std::string, std::chrono::steady_clock::time_point> recent_peer_apply_by_host;
extern std::map<std::string, unsigned long long> delayed_reconcile_by_host;
extern std::map<std::string, std::chrono::steady_clock::time_point> recent_employee_candidates;
extern std::map<std::string, std::chrono::steady_clock::time_point> recent_poll_reconcile_by_key;
extern std::mutex callback_identity_scan_mutex;
extern std::map<std::string, std::chrono::steady_clock::time_point>
    recent_callback_identity_scan_by_host;
extern std::map<std::string, std::set<std::string>> observed_employee_numbers_by_host;
extern std::set<std::string> inventory_baseline_ready_hosts;
extern std::mutex userinfo_touch_mutex;
extern std::map<std::string, std::map<std::string, UserInfoTouchSnapshot>>
    userinfo_touch_baseline_by_host;
extern std::set<std::string> userinfo_touch_baseline_ready_hosts;
extern std::set<std::string> pending_full_mirror_hosts;
extern std::atomic<unsigned long long> delayed_reconcile_token;
extern std::atomic<unsigned long long> callback_spool_token;
extern bool execute_mode;
extern bool automatic_peer_reconcile_enabled;
extern std::string hris_api_base;
extern std::string hris_api_token;
extern std::string min_sdk_time;
extern std::string reconcile_spool_dir;
extern std::string reconcile_quarantine_dir;
extern std::string callback_spool_dir;

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

void handle_signal(int);
std::string minor_name(DWORD minor);
bool is_fingerprint_management_minor(DWORD minor);
bool is_user_management_minor(DWORD minor);
bool is_observed_operation_sync_minor(DWORD minor);
bool is_card_management_minor(DWORD minor);
bool is_user_delete_minor(DWORD minor);
bool is_fingerprint_delete_minor(DWORD minor);
std::string classify_event(DWORD major, DWORD minor);
bool should_queue_reconcile(DWORD major, DWORD minor);
bool should_full_mirror_reconcile(const ReconcileJob &job);
bool should_attempt_fast_user_delta_reconcile(const ReconcileJob &job);
void mark_recent_peer_apply(const std::string &host);
bool should_suppress_recent_peer_apply(const std::string &host, DWORD major, DWORD minor);
void schedule_delayed_reconcile(const ReconcileJob &job, std::chrono::seconds delay);
void enable_default_card_reader(BYTE *readers, size_t count);
std::string base64_encode(const BYTE *data, size_t length);
bool base64_decode(const std::string &input, std::vector<char> *output);
std::string find_session_device_id_by_host(const std::string &host);
DeviceSession *find_session_by_host(const std::string &host);
std::string recent_employee_candidate_key(const std::string &host, const std::string &employee_no);
void mark_recent_employee_candidate(const std::string &host, const std::string &employee_no);
std::vector<std::string> get_recent_employee_candidates_for_host(const std::string &host);
bool should_queue_poll_reconcile_now(const std::string &key);
bool claim_callback_identity_scan(const std::string &host);
void queue_reconcile(const ReconcileJob &job);
bool is_immediate_hris_job(const ReconcileJob &job);
void queue_hris_device_event(const ReconcileJob &job);
void CALLBACK alarm_callback(
    LONG command,
    NET_DVR_ALARMER *alarmer,
    char *alarm_info,
    DWORD buffer_length,
    void *user);
std::string build_status_contract_json(const ReconcileJob &job, const std::string &status);
std::string build_hikvision_callback_json(const ReconcileJob &job);
std::string sdk_time_to_string(const NET_DVR_TIME &value);
std::string fixed_bytes_to_string(const BYTE *value, size_t max_len);
std::set<std::string> extract_employee_numbers_from_search_response(const std::string &response);

bool read_source_user(DeviceSession &source, const ReconcileJob &job, std::string *user_json);
bool read_source_card(DeviceSession &source, const ReconcileJob &job, std::string *card_json);
std::string build_sync_card_no(const std::string &employee_no);
bool add_sync_card(DeviceSession &target, const std::string &employee_no, const std::string &card_no);
std::string build_user_setup_payload_from_search_response(const std::string &response);
void extract_userinfo_touch_from_response(
    const std::string &response,
    std::map<std::string, UserInfoTouchSnapshot> *out);
void seed_userinfo_touch_baseline_for_session(DeviceSession &device);
std::string resolve_plain_employee_no_from_userinfo_touch(DeviceSession &device);
std::string pick_newest_plain_employee_no(const std::vector<std::string> &candidates);
void seed_inventory_baseline_for_session(DeviceSession &device);
std::string resolve_plain_employee_no_from_inventory(DeviceSession &device);
std::vector<std::string> read_device_employee_numbers(
    DeviceSession &device,
    bool *complete_out = nullptr);
std::vector<std::string> find_missing_employee_numbers(
    const std::vector<std::string> &source_employee_numbers,
    const std::vector<std::string> &target_employee_numbers);

void CALLBACK fingerprint_callback(DWORD type, void *buffer, DWORD buffer_length, void *user_data);
bool wait_for_fingerprint_remote_config(
    FingerprintReadContext &ctx,
    std::chrono::milliseconds total_timeout,
    std::chrono::milliseconds settle_timeout);
NET_DVR_FINGER_PRINT_CFG_V50 build_fingerprint_record(
    const NET_DVR_CAPTURE_FINGERPRINT_CFG &capture,
    const std::string &employee_no,
    const std::string &card_no,
    BYTE finger_type);
std::vector<NET_DVR_FINGER_PRINT_CFG_V50> read_source_fingerprints(
    DeviceSession &source,
    const ReconcileJob &job);
bool capture_fingerprint_template(
    DeviceSession &source,
    BYTE finger_no,
    NET_DVR_CAPTURE_FINGERPRINT_CFG *capture,
    std::chrono::milliseconds total_timeout);
bool write_peer_fingerprints(
    DeviceSession &target,
    const ReconcileJob &job,
    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> &templates);
bool clone_fingerprints_between_users(
    DeviceSession &source,
    const std::string &source_employee_no,
    DeviceSession &target,
    const std::string &target_employee_no);
bool capture_and_sync_fingerprint_for_employee(
    DeviceSession &source,
    const std::string &employee_no,
    BYTE finger_no,
    BYTE finger_type);
bool export_biometric_templates_for_employee(
    DeviceSession &source,
    const std::string &employee_no,
    bool include_fingerprints,
    bool include_face);

bool capture_face_template(
    DeviceSession &source,
    std::vector<char> *face_template,
    std::vector<char> *face_picture);
bool write_face_and_template(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no,
    const std::vector<char> &face_template,
    const std::vector<char> &face_picture,
    bool redact_card_no = false);
bool read_face_and_template(
    DeviceSession &source,
    const std::string &employee_no,
    const std::string &card_no,
    std::vector<char> *face_template,
    std::vector<char> *face_picture,
    bool redact_card_no = false);
bool capture_and_sync_face_for_employee(DeviceSession &source, const std::string &employee_no);
bool mirror_face_for_employee(DeviceSession &source, const std::string &employee_no);
bool delete_face_for_exact_owner(DeviceSession &target, const std::string &employee_no);
bool load_stored_face_write_payload(
    const std::string &payload_path,
    StoredFaceWritePayload *payload,
    std::string *reason);
bool write_stored_face_with_reread(
    DeviceSession &target,
    const StoredFaceWritePayload &payload);

bool write_peer_user(DeviceSession &target, const ReconcileJob &job, const std::string &user_json);
bool delete_peer_user(DeviceSession &target, const ReconcileJob &job);
bool delete_peer_fingerprints(DeviceSession &target, const ReconcileJob &job);
bool target_card_allows_owner(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no,
    bool *already_owned_by_employee);
bool add_sync_card_if_unowned(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no);

bool read_text_file(const std::string &path, std::string *body);
bool curl_post_json(
    const std::string &url,
    const std::string &body,
    const std::string &event_name,
    int max_time_seconds);
void replay_pending_hris_contract_posts();
void replay_pending_hikvision_callbacks();
void callback_spool_replay_loop();
bool post_hris_contract_payload(
    const std::string &body,
    const std::string &event_name,
    const std::map<std::string, std::string> &fields);
bool post_hikvision_callback(const ReconcileJob &job);
bool post_hris_contract(const ReconcileJob &job, const std::string &status);
void enrich_hris_job_before_post(ReconcileJob &job);
void process_reconcile_job(const ReconcileJob &job);
void prepare_immediate_hris_job_for_post(ReconcileJob &job);
void hris_immediate_post_loop();
void hris_enrichment_post_loop();
void reconcile_worker_loop();
void worker_loop();
void polling_loop();
bool process_fast_user_delta_reconcile(DeviceSession &source, const ReconcileJob &job);
void maybe_queue_polled_reconcile(const ReconcileJob &job, const std::string &reason);
bool needs_callback_identity_enrich(const ReconcileJob &job);
bool should_defer_empty_callback_identity_to_backend(const ReconcileJob &job);
bool needs_callback_template_enrich(const ReconcileJob &job);

bool parse_device_spec(const std::string &spec, DeviceConfig *config);
bool login_device(DeviceSession &session);
bool arm_alarm(DeviceSession &session);
void close_sessions();
void usage(const char *program);

}  // namespace hikvision_bio
