#pragma once

#include "hikvision_bio/runtime.hpp"

// Implemented in src/hikvision_bio/copy.cpp
namespace hikvision_bio {

bool write_peer_user(DeviceSession &target, const ReconcileJob &job, const std::string &user_json);
bool write_peer_fingerprints(
    DeviceSession &target,
    const ReconcileJob &job,
    const std::vector<NET_DVR_FINGER_PRINT_CFG_V50> &templates);
bool clone_fingerprints_between_users(
    DeviceSession &source,
    const std::string &source_employee_no,
    DeviceSession &target,
    const std::string &target_employee_no);
bool capture_and_sync_fingerprint_for_employee(
    DeviceSession &source,
    const std::string &employee_no,
    BYTE finger_no,
    BYTE finger_type);
bool capture_and_sync_face_for_employee(DeviceSession &source, const std::string &employee_no);
bool mirror_face_for_employee(DeviceSession &source, const std::string &employee_no);
bool delete_peer_user(DeviceSession &target, const ReconcileJob &job);
bool delete_peer_fingerprints(DeviceSession &target, const ReconcileJob &job);
bool target_card_allows_owner(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no,
    bool *already_owned_by_employee);
bool add_sync_card_if_unowned(
    DeviceSession &target,
    const std::string &employee_no,
    const std::string &card_no);

}  // namespace hikvision_bio
