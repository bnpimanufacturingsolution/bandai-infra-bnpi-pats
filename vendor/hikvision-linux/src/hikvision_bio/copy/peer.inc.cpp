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
