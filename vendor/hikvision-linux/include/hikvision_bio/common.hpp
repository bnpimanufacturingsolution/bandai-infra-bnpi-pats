#pragma once

#include <cstddef>
#include <map>
#include <mutex>
#include <fstream>
#include <string>

#include "HCNetSDK.h"
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

std::string extract_string_field_from_json(const std::string &json, const std::string &field_name);
int extract_int_field_from_json(const std::string &json, const std::string &field_name);
std::string extract_enclosing_json_object(const std::string &json, size_t pos_inside);
std::string sdk_time_to_string(const NET_DVR_TIME &value);
std::string fixed_bytes_to_string(const BYTE *value, size_t max_len);

}  // namespace hikvision_bio
