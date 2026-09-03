#pragma once

#include "hikvision_bio/runtime.hpp"

// Implemented in src/hikvision_bio/fingerprint.cpp
namespace hikvision_bio {

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

}  // namespace hikvision_bio
