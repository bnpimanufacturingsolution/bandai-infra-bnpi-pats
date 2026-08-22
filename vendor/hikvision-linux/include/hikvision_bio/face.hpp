#pragma once

#include "hikvision_bio/runtime.hpp"

// Implemented in src/hikvision_bio/face.cpp
namespace hikvision_bio {

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
    bool redact_card_no);
bool read_face_and_template(
    DeviceSession &source,
    const std::string &employee_no,
    const std::string &card_no,
    std::vector<char> *face_template,
    std::vector<char> *face_picture,
    bool redact_card_no);
bool load_stored_face_write_payload(
    const std::string &payload_path,
    StoredFaceWritePayload *payload,
    std::string *reason);
bool write_stored_face_with_reread(
    DeviceSession &target,
    const StoredFaceWritePayload &payload);
bool export_biometric_templates_for_employee(
    DeviceSession &source,
    const std::string &employee_no,
    bool include_fingerprints,
    bool include_face);
bool delete_face_for_exact_owner(DeviceSession &target, const std::string &employee_no);

}  // namespace hikvision_bio
