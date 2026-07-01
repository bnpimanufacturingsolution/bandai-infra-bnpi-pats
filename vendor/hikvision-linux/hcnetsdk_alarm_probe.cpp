#include <chrono>
#include <csignal>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>

#include "HCNetSDK.h"

namespace {
volatile std::sig_atomic_t keep_running = 1;

void handle_signal(int) {
    keep_running = 0;
}

std::string time_to_string(const NET_DVR_TIME &value) {
    char buffer[32] = {0};
    std::snprintf(
        buffer,
        sizeof(buffer),
        "%04u-%02u-%02uT%02u:%02u:%02u",
        value.dwYear,
        value.dwMonth,
        value.dwDay,
        value.dwHour,
        value.dwMinute,
        value.dwSecond);
    return buffer;
}

void print_json_string(const char *key, const std::string &value, bool comma = true) {
    std::cout << "\"" << key << "\":\"";
    for (const char c : value) {
        if (c == '"' || c == '\\') {
            std::cout << '\\';
        }
        std::cout << c;
    }
    std::cout << "\"";
    if (comma) {
        std::cout << ",";
    }
}

void CALLBACK message_callback(
    LONG command,
    NET_DVR_ALARMER *alarmer,
    char *alarm_info,
    DWORD buffer_length,
    void *) {
    std::cout << "{\"event\":\"alarm_callback\",";
    std::cout << "\"command\":" << command << ",";
    std::cout << "\"bufferLength\":" << buffer_length;

    if (alarmer != nullptr) {
        std::cout << ",\"deviceIp\":\"" << alarmer->sDeviceIP << "\"";
    }

    if (command == COMM_ALARM_ACS && alarm_info != nullptr && buffer_length >= sizeof(NET_DVR_ACS_ALARM_INFO)) {
        auto *acs = reinterpret_cast<NET_DVR_ACS_ALARM_INFO *>(alarm_info);
        std::cout << ",\"major\":" << acs->dwMajor;
        std::cout << ",\"minor\":" << acs->dwMinor;
        std::cout << ",\"time\":\"" << time_to_string(acs->struTime) << "\"";
        std::cout << ",\"doorNo\":" << acs->struAcsEventInfo.dwDoorNo;
        std::cout << ",\"employeeNo\":" << acs->struAcsEventInfo.dwEmployeeNo;
        std::cout << ",\"serialNo\":" << acs->struAcsEventInfo.dwSerialNo;
        std::cout << ",\"cardNo\":\"" << reinterpret_cast<const char *>(acs->struAcsEventInfo.byCardNo) << "\"";
    }

    std::cout << "}" << std::endl;
}

void usage(const char *program) {
    std::cerr << "Usage: " << program
              << " --host <ip> --port <sdk-port> --username <user> --password <password> [--seconds 60]"
              << std::endl;
}

}  // namespace

int main(int argc, char **argv) {
    std::string host;
    std::string username;
    std::string password;
    int port = 8000;
    int seconds = 60;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        auto require_value = [&](std::string *target) -> bool {
            if (i + 1 >= argc) {
                usage(argv[0]);
                return false;
            }
            *target = argv[++i];
            return true;
        };
        if (arg == "--host") {
            if (!require_value(&host)) return 2;
        } else if (arg == "--username") {
            if (!require_value(&username)) return 2;
        } else if (arg == "--password") {
            if (!require_value(&password)) return 2;
        } else if (arg == "--port") {
            std::string value;
            if (!require_value(&value)) return 2;
            port = std::stoi(value);
        } else if (arg == "--seconds") {
            std::string value;
            if (!require_value(&value)) return 2;
            seconds = std::stoi(value);
        } else {
            usage(argv[0]);
            return 2;
        }
    }

    if (host.empty() || username.empty() || password.empty()) {
        usage(argv[0]);
        return 2;
    }

    std::signal(SIGINT, handle_signal);
    std::signal(SIGTERM, handle_signal);

    if (!NET_DVR_Init()) {
        std::cout << "{\"event\":\"sdk_init\",\"ok\":false,\"lastError\":" << NET_DVR_GetLastError() << "}" << std::endl;
        return 1;
    }

    std::cout << "{\"event\":\"sdk_init\",\"ok\":true,\"sdkVersion\":" << NET_DVR_GetSDKVersion()
              << ",\"sdkBuildVersion\":" << NET_DVR_GetSDKBuildVersion() << "}" << std::endl;

    NET_DVR_USER_LOGIN_INFO login_info = {0};
    NET_DVR_DEVICEINFO_V40 device_info = {0};
    login_info.bUseAsynLogin = false;
    login_info.wPort = static_cast<WORD>(port);
    std::strncpy(login_info.sDeviceAddress, host.c_str(), NET_DVR_DEV_ADDRESS_MAX_LEN - 1);
    std::strncpy(login_info.sUserName, username.c_str(), NAME_LEN - 1);
    std::strncpy(login_info.sPassword, password.c_str(), NAME_LEN - 1);

    const LONG user_id = NET_DVR_Login_V40(&login_info, &device_info);
    if (user_id < 0) {
        std::cout << "{\"event\":\"sdk_login\",\"ok\":false,\"lastError\":" << NET_DVR_GetLastError() << "}" << std::endl;
        NET_DVR_Cleanup();
        return 1;
    }

    std::cout << "{\"event\":\"sdk_login\",\"ok\":true,\"userId\":" << user_id
              << ",\"startChannel\":" << static_cast<int>(device_info.struDeviceV30.byStartChan)
              << ",\"channelCount\":" << static_cast<int>(device_info.struDeviceV30.byChanNum)
              << "}" << std::endl;

    if (!NET_DVR_SetDVRMessageCallBack_V51(0, message_callback, nullptr)) {
        std::cout << "{\"event\":\"sdk_callback_register\",\"ok\":false,\"lastError\":" << NET_DVR_GetLastError() << "}" << std::endl;
        NET_DVR_Logout_V30(user_id);
        NET_DVR_Cleanup();
        return 1;
    }

    std::cout << "{\"event\":\"sdk_callback_register\",\"ok\":true}" << std::endl;

    NET_DVR_SETUPALARM_PARAM_V50 alarm_param = {0};
    alarm_param.dwSize = sizeof(alarm_param);
    alarm_param.byRetAlarmTypeV40 = TRUE;
    alarm_param.byRetDevInfoVersion = TRUE;
    alarm_param.byAlarmInfoType = 1;
    alarm_param.bySupport = 4;

    const LONG alarm_handle = NET_DVR_SetupAlarmChan_V50(user_id, &alarm_param, nullptr, 0);
    if (alarm_handle < 0) {
        std::cout << "{\"event\":\"sdk_alarm_arm\",\"ok\":false,\"lastError\":" << NET_DVR_GetLastError() << "}" << std::endl;
        NET_DVR_Logout_V30(user_id);
        NET_DVR_Cleanup();
        return 1;
    }

    std::cout << "{\"event\":\"sdk_alarm_arm\",\"ok\":true,\"alarmHandle\":" << alarm_handle
              << ",\"watchSeconds\":" << seconds << "}" << std::endl;

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(seconds);
    while (keep_running && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
    }

    if (!NET_DVR_CloseAlarmChan_V30(alarm_handle)) {
        std::cout << "{\"event\":\"sdk_alarm_close\",\"ok\":false,\"lastError\":" << NET_DVR_GetLastError() << "}" << std::endl;
    } else {
        std::cout << "{\"event\":\"sdk_alarm_close\",\"ok\":true}" << std::endl;
    }

    NET_DVR_Logout_V30(user_id);
    NET_DVR_Cleanup();
    std::cout << "{\"event\":\"sdk_cleanup\",\"ok\":true}" << std::endl;
    return 0;
}
