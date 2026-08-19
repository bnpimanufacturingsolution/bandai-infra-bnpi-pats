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

std::set<std::string> extract_employee_numbers_from_search_response(
    const std::string &response);
