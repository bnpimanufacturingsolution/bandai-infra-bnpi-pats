#pragma once

#include <string>

#include "HCNetSDK.h"

namespace hikvision_bio {

struct DeviceConfig {
    std::string hris_device_id;
    std::string organization_id;
    std::string name;
    std::string host;
    int sdk_port = 8000;
    std::string username;
    std::string password;
    bool biometric_peer = true;
};

struct DeviceSession {
    DeviceConfig config;
    LONG user_id = -1;
    LONG alarm_handle = -1;
    DWORD last_login_error = 0;
};

struct ReconcileJob {
    std::string source_host;
    std::string source_device_id;
    std::string employee_no;
    std::string card_no;
    std::string door_no;
    std::string verify_mode;
    std::string serial_no;
    DWORD major = 0;
    DWORD minor = 0;
    std::string event_kind;
    std::string sdk_time;
    bool include_fingerprints = false;
    bool include_face_recognition = true;
    bool include_card = false;
    bool credential_only = false;
    std::string identity_source;
    std::string fingerprints_json;
    std::string face_template_b64;
    std::string face_picture_b64;
    int fingerprint_count = 0;
    std::string attendance_status;
    std::string attendance_label;
    int attendance_status_value = 0;
    bool attendance_status_present = false;
};

}  // namespace hikvision_bio
