#pragma once

#include "hikvision_bio/runtime.hpp"

// Implemented in src/hikvision_bio/identity.cpp
namespace hikvision_bio {

bool read_source_user(DeviceSession &source, const ReconcileJob &job, std::string *user_json);
bool read_source_card(DeviceSession &source, const ReconcileJob &job, std::string *card_json);
std::set<std::string> extract_employee_numbers_from_search_response(const std::string &response);
std::vector<std::string> read_device_employee_numbers(
    DeviceSession &device,
    bool *complete_out);
std::vector<std::string> find_missing_employee_numbers(
    const std::vector<std::string> &source_employee_numbers,
    const std::vector<std::string> &target_employee_numbers);
std::string resolve_plain_employee_no_from_userinfo_touch(DeviceSession &device);

}  // namespace hikvision_bio
