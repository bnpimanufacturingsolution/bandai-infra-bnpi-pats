#include "hikvision_bio/prelude.hpp"
#include "hikvision_bio/acs.hpp"

namespace hikvision_bio {

static const char *attendance_status_from_sdk_byte(unsigned byte_value) {
    switch (byte_value) {
        case 1:
            return "checkIn";
        case 2:
            return "checkOut";
        case 3:
            return "breakOut";
        case 4:
            return "breakIn";
        case 5:
            return "overtimeIn";
        case 6:
            return "overtimeOut";
        default:
            return "undefined";
    }
}

static const char *attendance_label_from_status(const std::string &status) {
    if (status == "checkIn") return "Check In";
    if (status == "checkOut") return "Check Out";
    if (status == "breakOut") return "Break Out";
    if (status == "breakIn") return "Break In";
    if (status == "overtimeIn") return "Overtime In";
    if (status == "overtimeOut") return "Overtime Out";
    if (status == "undefined") return "Unset";
    return "";
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
    // Fingerprint pass/fail live on MAJOR_EVENT (5). Major 2 + minor 38 is an
    // ACS exception the armed B/D/E panels emit every ~301s with empty person.
    if (major == 5 &&
        (minor == MINOR_FINGERPRINT_COMPARE_PASS ||
         minor == MINOR_CARD_FINGERPRINT_VERIFY_PASS)) {
        return "attendance_fingerprint_success";
    }
    if (major == 5 &&
        (minor == MINOR_FINGERPRINT_COMPARE_FAIL ||
         minor == MINOR_CARD_FINGERPRINT_VERIFY_FAIL ||
         minor == MINOR_FINGERPRINT_INEXISTENCE)) {
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
    std::string attendance_status;
    std::string attendance_label;
    int attendance_status_value = 0;
    bool attendance_status_present = false;
    if (acs->byAcsEventInfoExtend == 1 && acs->pAcsEventInfoExtend != nullptr) {
        auto *ext =
            reinterpret_cast<NET_DVR_ACS_EVENT_INFO_EXTEND *>(acs->pAcsEventInfoExtend);
        employee_no_ext =
            fixed_bytes_to_string(ext->byEmployeeNo, NET_SDK_EMPLOYEE_NO_LEN);
        attendance_status_present = true;
        attendance_status_value = static_cast<int>(ext->byAttendanceStatus);
        attendance_status = attendance_status_from_sdk_byte(ext->byAttendanceStatus);
        attendance_label = attendance_label_from_status(attendance_status);
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
        {"sdkTime", sdk_time_to_string(acs->struTime)},
        {"attendanceStatus", attendance_status},
        {"attendanceLabel", attendance_label},
        {"attendanceStatusValue", std::to_string(attendance_status_value)},
        {"attendanceStatusPresent", attendance_status_present ? "true" : "false"}
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
    job.attendance_status = attendance_status;
    job.attendance_label = attendance_label;
    job.attendance_status_value = attendance_status_value;
    job.attendance_status_present = attendance_status_present;

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
         << "\"attendanceStatus\":\"" << json_escape(job.attendance_status) << "\","
         << "\"label\":\"" << json_escape(job.attendance_label) << "\","
         << "\"statusValue\":" << job.attendance_status_value << ","
         << "\"attendanceStatusPresent\":" << (job.attendance_status_present ? "true" : "false") << ","
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

}  // namespace hikvision_bio
