#pragma once

#include "hikvision_bio/runtime.hpp"

// Implemented in src/hikvision_bio/acs.cpp
namespace hikvision_bio {

void CALLBACK alarm_callback(
    LONG command,
    NET_DVR_ALARMER *alarmer,
    char *alarm_info,
    DWORD buffer_length,
    void *user);
std::string build_hikvision_callback_json(const ReconcileJob &job);
std::string classify_event(DWORD major, DWORD minor);

}  // namespace hikvision_bio
