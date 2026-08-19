
volatile std::sig_atomic_t keep_running = 1;

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
