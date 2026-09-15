#include "hikvision_bio/prelude.hpp"
#include "hikvision_bio/face.hpp"

namespace hikvision_bio {

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
        DWORD status = 0;
        std::memcpy(&status, buffer, sizeof(status));
        ctx->saw_status = true;
        ctx->callback_status = status;
        // Prefer DATA byRecvStatus when present; STATUS alone is a fallback.
        if (status == NET_SDK_CALLBACK_STATUS_FAILED ||
            status == NET_SDK_CALLBACK_STATUS_EXCEPTION) {
            ctx->ok = false;
            ctx->done = true;
            if (buffer_length >= sizeof(DWORD) * 2) {
                std::memcpy(
                    &ctx->sdk_error,
                    reinterpret_cast<const char *>(buffer) + sizeof(DWORD),
                    sizeof(DWORD));
            }
        } else if (status == NET_SDK_CALLBACK_STATUS_SUCCESS ||
                   status == NET_SDK_REMOTE_CONFIG_STATUS_SUCCESS) {
            if (!ctx->saw_data) {
                ctx->ok = true;
            }
            ctx->done = true;
        }
    } else if (type == NET_SDK_CALLBACK_TYPE_DATA && buffer != nullptr &&
               buffer_length >= sizeof(NET_DVR_FACE_AND_TEMPLATE_STATUS)) {
        auto *status = reinterpret_cast<NET_DVR_FACE_AND_TEMPLATE_STATUS *>(buffer);
        ctx->saw_data = true;
        ctx->recv_status = status->byRecvStatus;
        // HCNetSDK: 0-failed, 1-success, 2-full
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
            {"sourceDeviceId", source.config.bnpi_pats_device_id},
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
        {"sourceDeviceId", source.config.bnpi_pats_device_id},
        {"ok", ok ? "true" : "false"},
        {"progress", std::to_string(ctx.progress)},
        {"templateSize", std::to_string(ctx.face_template.size())},
        {"pictureSize", std::to_string(ctx.face_picture.size())},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    return ok;
}

std::string face_write_fail_reason(const FaceWriteContext &ctx, BOOL send_ok) {
    if (send_ok != TRUE) {
        return "send_remote_config_failed";
    }
    if (!ctx.done) {
        return "callback_timeout";
    }
    if (ctx.saw_data) {
        // HCNetSDK FACE_AND_TEMPLATE_STATUS.byRecvStatus
        if (ctx.recv_status == 0) return "device_recv_status_failed";
        if (ctx.recv_status == 1) return "none";
        if (ctx.recv_status == 2) return "device_face_template_full";
        return "device_recv_status_" + std::to_string(static_cast<unsigned>(ctx.recv_status));
    }
    if (ctx.saw_status) {
        if (ctx.callback_status == NET_SDK_CALLBACK_STATUS_SUCCESS ||
            ctx.callback_status == NET_SDK_REMOTE_CONFIG_STATUS_SUCCESS) {
            return "status_success_without_data_ack";
        }
        return "callback_status_failed_" + std::to_string(ctx.callback_status);
    }
    return "write_not_accepted";
}

bool write_face_and_template(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no,
    const std::vector<char> &face_template,
    const std::vector<char> &face_picture,
    bool redact_card_no) {
    const auto operation_started_at = std::chrono::steady_clock::now();
    const auto elapsed_ms = [&]() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - operation_started_at).count();
    };
    if (!execute_mode) {
        emit_json({
            {"event", "peer_face_write_preview"},
            {"targetDeviceId", target.config.bnpi_pats_device_id},
            {"employeeNo", employee_no},
            {"cardNo", card_no.empty() ? "" : "[redacted]"},
            {"templateSize", std::to_string(face_template.size())},
            {"pictureSize", std::to_string(face_picture.size())},
            {"wouldCall", "NET_DVR_SET_FACE_AND_TEMPLATE"}
        });
        return !face_template.empty() && !face_picture.empty();
    }
    if (card_no.empty()) {
        emit_json({
            {"event", "peer_face_write"},
            {"targetDeviceId", target.config.bnpi_pats_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"failReason", "card_no_required_for_face_and_template"},
            {"recvStatus", ""},
            {"callbackCompleted", "false"},
            {"durationMs", std::to_string(elapsed_ms())},
            {"lastError", "0"}
        });
        return false;
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
        const DWORD start_error = NET_DVR_GetLastError();
        emit_json({
            {"event", "peer_face_write"},
            {"targetDeviceId", target.config.bnpi_pats_device_id},
            {"employeeNo", employee_no},
            {"ok", "false"},
            {"failReason", "start_remote_config_failed"},
            {"recvStatus", ""},
            {"sendOk", "false"},
            {"startRemoteConfigMs", std::to_string(start_remote_config_ms)},
            {"durationMs", std::to_string(elapsed_ms())},
            {"lastError", std::to_string(start_error)}
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
    const std::string fail_reason = ok ? "none" : face_write_fail_reason(ctx, send_ok);
    const DWORD last_error = ok
        ? 0
        : (ctx.sdk_error != 0 ? ctx.sdk_error : NET_DVR_GetLastError());
    emit_json({
        {"event", "peer_face_write"},
        {"targetDeviceId", target.config.bnpi_pats_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"ok", ok ? "true" : "false"},
        {"failReason", fail_reason},
        {"sendOk", send_ok == TRUE ? "true" : "false"},
        {"sawStatusCallback", ctx.saw_status ? "true" : "false"},
        {"sawDataCallback", ctx.saw_data ? "true" : "false"},
        {"callbackStatus", std::to_string(ctx.callback_status)},
        // Empty string when DATA packet never arrived (recv_status sentinel 255).
        {"recvStatus", ctx.recv_status == 255 ? "" : std::to_string(static_cast<unsigned>(ctx.recv_status))},
        {"templateSize", std::to_string(face_template.size())},
        {"pictureSize", std::to_string(face_picture.size())},
        {"startRemoteConfigMs", std::to_string(start_remote_config_ms)},
        {"sendAndCallbackMs", std::to_string(send_and_callback_ms)},
        {"callbackCompleted", ctx.done ? "true" : "false"},
        {"durationMs", std::to_string(elapsed_ms())},
        {"lastError", std::to_string(last_error)}
    });
    return ok;
}

bool read_face_and_template(
    DeviceSession &source,
    const std::string &employee_no,
    const std::string &card_no,
    std::vector<char> *face_template,
    std::vector<char> *face_picture,
    bool redact_card_no) {
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
            {"sourceDeviceId", source.config.bnpi_pats_device_id},
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
        {"sourceDeviceId", source.config.bnpi_pats_device_id},
        {"employeeNo", employee_no},
        {"cardNo", card_no.empty() ? "" : "[redacted]"},
        {"ok", ok ? "true" : "false"},
        {"templateSize", std::to_string(ctx.face_template.size())},
        {"pictureSize", std::to_string(ctx.face_picture.size())},
        {"lastError", ok ? "0" : std::to_string(ctx.sdk_error ? ctx.sdk_error : NET_DVR_GetLastError())}
    });
    return ok;
}

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
        // Mirror peer reconcile: face is card-keyed; preview whether the ACS
        // card key would be usable before claiming a dry-run write.
        bool already_owned = false;
        const bool card_owner_ok = target_card_allows_owner(
            target, payload.employee_no, payload.card_no, &already_owned);
        emit_json({
            {"event", "stored_face_card_ensure_preview"},
            {"targetDeviceId", payload.target_device_id},
            {"employeeNo", payload.employee_no},
            {"ok", card_owner_ok ? "true" : "false"},
            {"alreadyOwned", already_owned ? "true" : "false"},
            {"wouldEnsureCard", already_owned ? "false" : "true"}
        });
        const bool preview = card_owner_ok && write_face_and_template(
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
            {"cardOwnerOk", card_owner_ok ? "true" : "false"},
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
    // CODE DEFECT (fixed): stored-face path wrote NET_DVR_SET_FACE_AND_TEMPLATE
    // without ensuring the ACS card key exists. Peer reconcile always called
    // add_sync_card_if_unowned first. Live 2026-07-25 cardless vendor-id fallback
    // produced peer_face_write callbackCompleted=true ok=false lastError=0
    // writeOk=false with zero reread. Card ensure is mandatory for this writer.
    const auto card_started_at = std::chrono::steady_clock::now();
    const bool card_ready =
        add_sync_card_if_unowned(target, payload.employee_no, payload.card_no);
    const auto card_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - card_started_at).count();
    emit_json({
        {"event", "stored_face_card_ensure"},
        {"targetDeviceId", payload.target_device_id},
        {"employeeNo", payload.employee_no},
        {"ok", card_ready ? "true" : "false"},
        {"durationMs", std::to_string(card_ms)},
        {"reason", card_ready ? "card_bound_or_already_owned" : "card_bind_failed"}
    });
    if (!card_ready) {
        emit_json({
            {"event", "stored_face_write_reread_completed"},
            {"targetDeviceId", payload.target_device_id},
            {"employeeNo", payload.employee_no},
            {"ok", "false"},
            {"writeOk", "false"},
            {"rereadOk", "false"},
            {"templateMatch", "false"},
            {"pictureMatch", "false"},
            {"failReason", "stored_face_card_ensure_failed"},
            {"templateSize", std::to_string(payload.face_template.size())},
            {"pictureSize", std::to_string(payload.face_picture.size())},
            {"rereadTemplateSize", "0"},
            {"rereadPictureSize", "0"},
            {"writeMs", "0"},
            {"stabilizationWaitMs", "0"},
            {"rereadMs", "0"},
            {"durationMs", std::to_string(
                std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::steady_clock::now() - operation_started_at).count())}
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
        {"failReason", verified ? "none" : (wrote ? "reread_or_match_failed" : "peer_face_write_failed")},
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

bool export_biometric_templates_for_employee(
    DeviceSession &source,
    const std::string &employee_no,
    bool include_fingerprints,
    bool include_face) {
    ReconcileJob job;
    job.source_host = source.config.host;
    job.source_device_id = source.config.bnpi_pats_device_id;
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
        {"sourceDeviceId", source.config.bnpi_pats_device_id},
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
        authorized_target != target.config.bnpi_pats_device_id ||
        employee_no.empty()) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", target.config.bnpi_pats_device_id},
            {"employeeNo", employee_no},
            {"reason", "authorized_exact_canary_target_required"}
        });
        return false;
    }

    ReconcileJob job;
    job.source_device_id = target.config.bnpi_pats_device_id;
    job.source_host = target.config.host;
    job.employee_no = employee_no;
    std::string pre_user_json;
    if (!read_source_user(target, job, &pre_user_json)) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", target.config.bnpi_pats_device_id},
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
            {"targetDeviceId", target.config.bnpi_pats_device_id},
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
            {"targetDeviceId", target.config.bnpi_pats_device_id},
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
            {"targetDeviceId", target.config.bnpi_pats_device_id},
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
        {"targetDeviceId", target.config.bnpi_pats_device_id},
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

}  // namespace hikvision_bio
