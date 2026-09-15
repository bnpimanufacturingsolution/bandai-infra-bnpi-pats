#include "hikvision_bio/time.hpp"

#include "hikvision_bio/common.hpp"

#include <sstream>

#include "HCNetSDK.h"

namespace hikvision_bio {

bool run_device_time_command(
    DeviceSession &session,
    bool set_time,
    bool execute,
    const std::string &local_time,
    const std::string &time_zone) {
    std::string before_xml;
    bool read_ok = stdxml_json_request(session, "GET /ISAPI/System/time?format=json", "", &before_xml);
    std::string before_local;
    std::string before_mode;
    std::string before_zone;
    parse_time_payload(before_xml, &before_local, &before_mode, &before_zone);
    if (!read_ok || before_local.empty()) {
        read_ok = stdxml_json_request(session, "GET /ISAPI/System/time", "", &before_xml) || read_ok;
        parse_time_payload(before_xml, &before_local, &before_mode, &before_zone);
    }
    emit_json({
        {"event", "device_time_read"},
        {"ok", read_ok && !before_local.empty() ? "true" : "false"},
        {"deviceId", session.config.bnpi_pats_device_id},
        {"host", session.config.host},
        {"sdkPort", std::to_string(session.config.sdk_port)},
        {"localTime", before_local},
        {"timeMode", before_mode},
        {"timeZone", before_zone},
        {"transport", "sdk_stdxml"},
        {"sdkLastError", std::to_string(NET_DVR_GetLastError())}
    });
    if (!set_time || !execute) {
        emit_json({
            {"event", "device_time_preview"},
            {"ok", read_ok ? "true" : "false"},
            {"deviceId", session.config.bnpi_pats_device_id},
            {"plannedLocalTime", local_time},
            {"plannedTimeZone", time_zone.empty() ? "CST-8:00:00" : time_zone},
            {"plannedTimeMode", "manual"},
            {"transport", "sdk_stdxml"}
        });
        return read_ok && !before_local.empty();
    }
    if (local_time.empty()) {
        emit_json({
            {"event", "device_time_write"},
            {"ok", "false"},
            {"deviceId", session.config.bnpi_pats_device_id},
            {"reason", "local_time_required"}
        });
        return false;
    }
    const std::string zone = time_zone.empty() ? "CST-8:00:00" : time_zone;
    std::ostringstream json_body;
    json_body << "{\"Time\":{"
              << "\"timeMode\":\"manual\","
              << "\"localTime\":\"" << local_time << "\","
              << "\"timeZone\":\"" << zone << "\"}}";
    std::ostringstream xml_body;
    xml_body << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
             << "<Time version=\"2.0\" xmlns=\"http://www.isapi.org/ver20/XMLSchema\">"
             << "<timeMode>manual</timeMode>"
             << "<localTime>" << local_time << "</localTime>"
             << "<timeZone>" << zone << "</timeZone>"
             << "</Time>";
    std::string put_xml;
    bool put_ok = stdxml_json_request(
        session,
        "PUT /ISAPI/System/time?format=json",
        json_body.str(),
        &put_xml);
    if (!put_ok) {
        put_ok = stdxml_json_request(
            session,
            "PUT /ISAPI/System/time",
            xml_body.str(),
            &put_xml);
    }
    std::string after_xml;
    bool after_ok = stdxml_json_request(session, "GET /ISAPI/System/time?format=json", "", &after_xml);
    std::string after_local;
    std::string after_mode;
    std::string after_zone;
    parse_time_payload(after_xml, &after_local, &after_mode, &after_zone);
    if (!after_ok || after_local.empty()) {
        after_ok = stdxml_json_request(session, "GET /ISAPI/System/time", "", &after_xml) || after_ok;
        parse_time_payload(after_xml, &after_local, &after_mode, &after_zone);
    }
    const bool wrote = put_ok && after_ok && !after_local.empty();
    emit_json({
        {"event", "device_time_write"},
        {"ok", wrote ? "true" : "false"},
        {"deviceId", session.config.bnpi_pats_device_id},
        {"host", session.config.host},
        {"localTime", after_local},
        {"timeMode", after_mode},
        {"timeZone", after_zone},
        {"plannedLocalTime", local_time},
        {"transport", "sdk_stdxml"},
        {"putOk", put_ok ? "true" : "false"},
        {"sdkLastError", std::to_string(NET_DVR_GetLastError())}
    });
    return wrote;
}

}  // namespace hikvision_bio
