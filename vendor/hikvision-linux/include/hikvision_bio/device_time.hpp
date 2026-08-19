#pragma once

#include <string>

#include "hikvision_bio/types.hpp"

namespace hikvision_bio {

bool run_device_time_command(
    DeviceSession &session,
    bool set_time,
    bool execute,
    const std::string &local_time,
    const std::string &time_zone);

}  // namespace hikvision_bio
