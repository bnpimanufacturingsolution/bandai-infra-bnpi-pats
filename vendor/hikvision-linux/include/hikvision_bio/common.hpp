#pragma once

#include <map>
#include <mutex>
#include <fstream>
#include <string>

#include "hikvision_bio/types.hpp"

namespace hikvision_bio {

extern std::mutex sdk_request_mutex;
extern std::mutex evidence_mutex;
extern std::ofstream evidence_stream;

std::string json_escape(const std::string &value);
std::string now_utc();
void emit_json(const std::map<std::string, std::string> &fields);
void emit_sensitive_json_stdout_only(const std::map<std::string, std::string> &fields);

bool stdxml_json_request(
    DeviceSession &session,
    const std::string &method_and_path,
    const std::string &body,
    std::string *response);

std::string xml_inner_tag(const std::string &xml, const char *tag);
std::string json_string_field(const std::string &json, const char *key);
void parse_time_payload(
    const std::string &payload,
    std::string *local_time,
    std::string *time_mode,
    std::string *time_zone);

}  // namespace hikvision_bio
