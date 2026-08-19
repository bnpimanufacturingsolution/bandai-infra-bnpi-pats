#include "hikvision_bio/prelude.hpp"
#include "hikvision_bio/fingerprint.hpp"

namespace hikvision_bio {

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
        {"rawFingerprintTemplateStored", have_templates ? "true" : "false"}
    });

    return ctx.templates;
}

}  // namespace hikvision_bio
