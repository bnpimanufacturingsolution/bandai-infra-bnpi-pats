#include "hikvision_bio/prelude.hpp"
#include "hikvision_bio/spool.hpp"

namespace hikvision_bio {

void post_bnpi_pats_contract_preview(const ReconcileJob &job, const std::string &status) {
    const std::string contract = build_status_contract_json(job, status);
    emit_json({
        {"event", "bnpi_pats_contract_preview"},
        {"apiBase", bnpi_pats_api_base},
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
        {"event", "bnpi_pats_contract_spool_dir_failed"},
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
        {"event", "bnpi_pats_contract_spool_quarantine_dir_failed"},
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

void replay_pending_bnpi_pats_contract_posts() {
    if (!execute_mode || bnpi_pats_api_base.empty()) {
        return;
    }
    if (!ensure_reconcile_spool_dir()) {
        return;
    }
    const std::vector<std::string> paths = list_reconcile_spool_files();
    if (paths.empty()) {
        return;
    }
    const std::string url = bnpi_pats_api_base + "/api/device/biometric-sync/reconcile";
    for (const auto &path : paths) {
        std::string body;
        if (!read_text_file(path, &body)) {
            emit_json({
                {"event", "bnpi_pats_contract_spool_read_failed"},
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
                {"event", "bnpi_pats_contract_spool_quarantined"},
                {"path", path},
                {"quarantinePath", preserved ? quarantine_path : ""},
                {"reason", "missing_source_device_id"},
                {"preserved", preserved ? "true" : "false"}
            });
            continue;
        }
        const bool ok = post_json_with_retries(url, body, "bnpi_pats_contract_spool_replay", 3, 1500);
        emit_json({
            {"event", "bnpi_pats_contract_spool_replay_result"},
            {"path", path},
            {"ok", ok ? "true" : "false"}
        });
        if (ok) {
            std::remove(path.c_str());
        }
    }
}

void replay_pending_hikvision_callbacks() {
    if (!execute_mode || bnpi_pats_api_base.empty()) {
        return;
    }
    const std::string url = bnpi_pats_api_base + "/api/hikvision/callback";
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

bool post_bnpi_pats_contract_payload(
    const std::string &contract,
    const std::string &spool_key,
    const std::map<std::string, std::string> &spool_meta) {
    std::string spool_path;
    if (execute_mode && ensure_reconcile_spool_dir()) {
        spool_path = build_reconcile_spool_path_from_key(spool_key);
        if (!write_text_file(spool_path, contract)) {
            emit_json({
                {"event", "bnpi_pats_contract_spool_write_failed"},
                {"path", spool_path}
            });
            spool_path.clear();
        } else {
            std::map<std::string, std::string> fields = {
                {"event", "bnpi_pats_contract_spool_written"},
                {"path", spool_path},
                {"spoolKey", spool_key}
            };
            fields.insert(spool_meta.begin(), spool_meta.end());
            emit_json(fields);
        }
    }
    if (bnpi_pats_api_base.empty()) {
        emit_json({
            {"event", "bnpi_pats_contract_post_skipped"},
            {"reason", "missing_bnpi_pats_api_base"},
            {"spoolKey", spool_key}
        });
        return false;
    }
    if (!execute_mode) {
        emit_json({
            {"event", "bnpi_pats_contract_preview"},
            {"apiBase", bnpi_pats_api_base},
            {"contractPath", "/api/device/biometric-sync/reconcile"},
            {"body", contract}
        });
        return true;
    }

    const std::string url = bnpi_pats_api_base + "/api/device/biometric-sync/reconcile";
    const bool ok = post_json_with_retries(url, contract, "bnpi_pats_contract_post", 3, 1500);
    emit_json({
        {"event", "bnpi_pats_contract_post"},
        {"apiBase", bnpi_pats_api_base},
        {"spoolKey", spool_key},
        {"ok", ok ? "true" : "false"}
    });
    if (ok && !spool_path.empty()) {
        std::remove(spool_path.c_str());
        emit_json({
            {"event", "bnpi_pats_contract_spool_cleared"},
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
    if (!bnpi_pats_api_token.empty()) {
        std::fprintf(config_file, "header = \"Authorization: Bearer %s\"\n", bnpi_pats_api_token.c_str());
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
            {"sourceDeviceId", device.config.bnpi_pats_device_id},
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
        {"sourceDeviceId", device.config.bnpi_pats_device_id},
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
            {"sourceDeviceId", device.config.bnpi_pats_device_id},
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
            {"sourceDeviceId", device.config.bnpi_pats_device_id},
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
            {"sourceDeviceId", device.config.bnpi_pats_device_id},
            {"sourceHost", device.config.host},
            {"employeeCount", std::to_string(current.size())}
        });
        return "";
    }

    const std::string plain = pick_newest_plain_employee_no(news);
    emit_json({
        {"event", "callback_identity_inventory_delta"},
        {"sourceDeviceId", device.config.bnpi_pats_device_id},
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

// Schedule a delayed re-queue of the BNPI PATS callback job so empty-ACS create/enroll
// can get plain id after UserInfo catches up (second POST, not inventing ids).
void schedule_delayed_bnpi_pats_identity_repost(const ReconcileJob &job, int delay_ms, int attempt) {
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
        queue_bnpi_pats_device_event(copy);
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
        queue_bnpi_pats_device_event(copy);
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
            {"sourceDeviceId", session.config.bnpi_pats_device_id},
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
            {"sourceDeviceId", session.config.bnpi_pats_device_id},
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
        {"sourceDeviceId", session.config.bnpi_pats_device_id},
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
            {"sourceDeviceId", session.config.bnpi_pats_device_id},
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
            {"sourceDeviceId", session.config.bnpi_pats_device_id},
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
            {"sourceDeviceId", session.config.bnpi_pats_device_id},
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
        {"sourceDeviceId", session.config.bnpi_pats_device_id},
        {"employeeNo", employee_no},
        {"ok", "true"},
        {"facePictureChars", std::to_string(face_picture_b64->size())},
        {"faceURL", face_url}
    });
    return !face_picture_b64->empty();
}

// Before POST: fill plain employeeNo when ACS left it empty; attach raw FP/face when possible.
// This is the correct place to harden "socket always has plain id" for enroll — not inventing in UI.
void enrich_bnpi_pats_job_before_post(ReconcileJob &job) {
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
                schedule_delayed_bnpi_pats_identity_repost(job, 5000, 1);
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
    if (bnpi_pats_api_base.empty()) {
        emit_json({
            {"event", "hikvision_callback_post_skipped"},
            {"reason", "missing_bnpi_pats_api_base"},
            {"body", body}
        });
        return false;
    }
    if (!execute_mode) {
        emit_json({
            {"event", "hikvision_callback_preview"},
            {"apiBase", bnpi_pats_api_base},
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

    const std::string url = bnpi_pats_api_base + "/api/hikvision/callback";
    // Raw biometric custody can require DeviceUser + DeviceEvent writes before the API
    // acknowledges. Attendance uses one short live attempt; its durable spool is the
    // retry mechanism. This prevents one unhealthy API request from head-of-line
    // blocking later taps. Enrichment callbacks retain the longer retry budget.
    const bool immediate = is_immediate_bnpi_pats_job(job);
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

bool post_bnpi_pats_contract(const ReconcileJob &job, const std::string &status) {
    const std::string contract = build_status_contract_json(job, status);
    if (bnpi_pats_api_base.empty() || !execute_mode) {
        post_bnpi_pats_contract_preview(job, status);
        if (bnpi_pats_api_base.empty()) {
            emit_json({
                {"event", "bnpi_pats_contract_post_skipped"},
                {"reason", "missing_bnpi_pats_api_base"}
            });
            return false;
        }
        return true;
    }
    return post_bnpi_pats_contract_payload(
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
            {"sourceDeviceId", source.config.bnpi_pats_device_id},
            {"reason", "empty_source_inventory"}
        });
        return false;
    }

    int peer_count = 0;
    int peer_write_count = 0;
    int missing_total = 0;

    for (auto &target : sessions) {
        if (target.config.bnpi_pats_device_id == source.config.bnpi_pats_device_id) {
            continue;
        }

        peer_count += 1;
        const std::vector<std::string> target_employee_numbers = read_device_employee_numbers(target);
        const std::vector<std::string> missing_employee_numbers =
            find_missing_employee_numbers(source_employee_numbers, target_employee_numbers);
        missing_total += static_cast<int>(missing_employee_numbers.size());

        emit_json({
            {"event", "reconcile_fast_path_inventory_delta"},
            {"sourceDeviceId", source.config.bnpi_pats_device_id},
            {"targetDeviceId", target.config.bnpi_pats_device_id},
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

    post_bnpi_pats_contract(job, missing_total > 0 ? "mirrored_fast" : "fast_checked");
    emit_json({
        {"event", "reconcile_fast_path_completed"},
        {"sourceDeviceId", source.config.bnpi_pats_device_id},
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
                    {"sourceDeviceId", source.config.bnpi_pats_device_id},
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
                    lifecycle_job.source_device_id = source.config.bnpi_pats_device_id;
                    lifecycle_job.employee_no = employee_no;
                    lifecycle_job.major = MAJOR_OPERATION;
                    lifecycle_job.minor = MINOR_ADD_USER_INFO;
                    lifecycle_job.event_kind = "poll_inventory_user_created";
                    lifecycle_job.sdk_time = now_utc();
                    queue_bnpi_pats_device_event(lifecycle_job);
                    observed->second.insert(employee_no);
                    emit_json({
                        {"event", "poll_user_created_detected"},
                        {"sourceDeviceId", source.config.bnpi_pats_device_id},
                        {"sourceHost", source.config.host},
                        {"employeeNo", employee_no},
                        {"observedAt", lifecycle_job.sdk_time}
                    });
                }
            }

            for (auto &target : sessions) {
                if (target.config.bnpi_pats_device_id == source.config.bnpi_pats_device_id) {
                    continue;
                }

                const std::vector<std::string> target_employee_numbers = read_device_employee_numbers(target);
                const std::vector<std::string> missing_employee_numbers =
                    find_missing_employee_numbers(source_employee_numbers, target_employee_numbers);
                for (const auto &employee_no : missing_employee_numbers) {
                    ReconcileJob job;
                    job.source_host = source.config.host;
                    job.source_device_id = source.config.bnpi_pats_device_id;
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
                fingerprint_job.source_device_id = source.config.bnpi_pats_device_id;
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
                    if (target.config.bnpi_pats_device_id == source.config.bnpi_pats_device_id) {
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
                            if (target.config.bnpi_pats_device_id == source.config.bnpi_pats_device_id) {
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
            if (session.config.bnpi_pats_device_id == job.source_device_id) {
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

        post_bnpi_pats_contract(job, "mirrored");
        emit_json({
            {"event", "reconcile_full_mirror_completed"},
            {"sourceDeviceId", source->config.bnpi_pats_device_id},
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
                {"sourceDeviceId", source->config.bnpi_pats_device_id},
                {"employeeNo", job.employee_no},
                {"cardNo", "[redacted]"}
            });
        } else {
            card_no.clear();
        }
    }

    for (auto &target : sessions) {
        if (target.config.bnpi_pats_device_id == source->config.bnpi_pats_device_id) {
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
                {"targetDeviceId", target.config.bnpi_pats_device_id},
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
                    {"targetDeviceId", target.config.bnpi_pats_device_id},
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

    post_bnpi_pats_contract(job, user_delete ? "deleted" : user_ok ? "reviewed" : "source-user-read-failed");
    emit_json({
        {"event", "reconcile_completed"},
        {"sourceDeviceId", source->config.bnpi_pats_device_id},
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

void prepare_immediate_bnpi_pats_job_for_post(ReconcileJob &job) {
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

// Dedicated auth/attendance lane. It never calls enrich_bnpi_pats_job_before_post,
// therefore it cannot wait on inventory, fingerprint, face, or reconciliation SDK work.
void bnpi_pats_immediate_post_loop() {
    while (keep_running) {
        ReconcileJob bnpi_pats_job;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            queue_cv.wait_for(lock, std::chrono::milliseconds(50), [] {
                return !bnpi_pats_immediate_event_queue.empty() || !keep_running;
            });
            if (!keep_running || bnpi_pats_immediate_event_queue.empty()) {
                continue;
            }
            bnpi_pats_job = bnpi_pats_immediate_event_queue.front();
            bnpi_pats_immediate_event_queue.pop_front();
        }
        prepare_immediate_bnpi_pats_job_for_post(bnpi_pats_job);
        post_hikvision_callback(bnpi_pats_job);
    }
}

// Lifecycle/operation lane. SDK identity and biometric enrichment can be slow,
// but it is isolated from authentication delivery.
void bnpi_pats_enrichment_post_loop() {
    while (keep_running) {
        ReconcileJob bnpi_pats_job;
        {
            std::unique_lock<std::mutex> lock(queue_mutex);
            queue_cv.wait_for(lock, std::chrono::milliseconds(200), [] {
                return !bnpi_pats_enrichment_event_queue.empty() || !keep_running;
            });
            if (!keep_running || bnpi_pats_enrichment_event_queue.empty()) {
                continue;
            }
            bnpi_pats_job = bnpi_pats_enrichment_event_queue.front();
            bnpi_pats_enrichment_event_queue.pop_front();
        }
        enrich_bnpi_pats_job_before_post(bnpi_pats_job);
        post_hikvision_callback(bnpi_pats_job);
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
    bnpi_pats_enrichment_post_loop();
}

}  // namespace hikvision_bio
