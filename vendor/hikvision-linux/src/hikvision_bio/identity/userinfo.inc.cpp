bool read_source_user(DeviceSession &source, const ReconcileJob &job, std::string *user_json) {
    if (job.employee_no.empty()) {
        emit_json({
            {"event", "source_user_read_skipped"},
            {"reason", "missing_employee_no"},
            {"sourceDeviceId", source.config.hris_device_id}
        });
        return false;
    }

    std::ostringstream body;
    body << "{\"UserInfoSearchCond\":{\"searchID\":\"pt-biometric-"
         << json_escape(job.employee_no)
         << "\",\"searchResultPosition\":0,\"maxResults\":1,\"EmployeeNoList\":[{\"employeeNo\":\""
         << json_escape(job.employee_no)
         << "\"}]}}";

    std::string response;
    const bool ok = stdxml_json_request(
        source,
        "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
        body.str(),
        &response);

    const std::set<std::string> returned_employees =
        extract_employee_numbers_from_search_response(response);
    const bool exact_owner =
        ok && returned_employees.size() == 1 &&
        returned_employees.count(job.employee_no) == 1;
    emit_json({
        {"event", "source_user_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"ok", exact_owner ? "true" : "false"},
        {"responseAccepted", ok ? "true" : "false"},
        {"returnedEmployeeCount", std::to_string(returned_employees.size())},
        {"exactEmployeePresent",
         returned_employees.count(job.employee_no) == 1 ? "true" : "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });

    if (exact_owner && user_json != nullptr) {
        *user_json = response;
    }
    return exact_owner;
}

std::string extract_enclosing_json_object(const std::string &json, size_t pos_inside);
std::string extract_string_field_from_json(
    const std::string &json,
    const std::string &field_name);
int extract_int_field_from_json(const std::string &json, const std::string &field_name);

std::string extract_card_object_for_employee(
    const std::string &response,
    const std::string &employee_no) {
    if (response.empty() || employee_no.empty()) {
        return "";
    }
    static const std::regex employee_regex("\"employeeNo\"\\s*:\\s*\"([^\"]+)\"");
    for (std::sregex_iterator it(response.begin(), response.end(), employee_regex), end;
         it != end;
         ++it) {
        if ((*it)[1].str() != employee_no) {
            continue;
        }
        const size_t pos = static_cast<size_t>((*it).position(0));
        const std::string object = extract_enclosing_json_object(response, pos);
        if (!object.empty() && !extract_string_field_from_json(object, "cardNo").empty()) {
            return object;
        }
    }
    // Some HCNetSDK STDXML responses wrap the single CardInfo record such that
    // object-bound extraction is not stable. A one-row response is still safe
    // when its complete employee set contains only the requested exact owner.
    const std::set<std::string> employees =
        extract_employee_numbers_from_search_response(response);
    const std::string sole_card_no = extract_string_field_from_json(response, "cardNo");
    if (employees.size() == 1 &&
        employees.count(employee_no) == 1 &&
        !sole_card_no.empty()) {
        return std::string("{\"employeeNo\":\"") + json_escape(employee_no) +
            "\",\"cardNo\":\"" + json_escape(sole_card_no) + "\"}";
    }
    return "";
}

bool read_source_card(DeviceSession &source, const ReconcileJob &job, std::string *card_json) {
    if (job.employee_no.empty()) {
        emit_json({
            {"event", "source_card_read_skipped"},
            {"reason", "missing_employee_no"},
            {"sourceDeviceId", source.config.hris_device_id}
        });
        return false;
    }

    std::ostringstream body;
    body << "{\"CardInfoSearchCond\":{\"searchID\":\"pt-card-"
         << json_escape(job.employee_no)
         << "\",\"searchResultPosition\":0,\"maxResults\":10,\"EmployeeNoList\":[{\"employeeNo\":\""
         << json_escape(job.employee_no)
         << "\"}]}}";

    std::string response;
    const bool filtered_ok = stdxml_json_request(
        source,
        "POST /ISAPI/AccessControl/CardInfo/Search?format=json",
        body.str(),
        &response);
    std::string exact_card = filtered_ok
        ? extract_card_object_for_employee(response, job.employee_no)
        : "";
    const std::set<std::string> filtered_employees =
        extract_employee_numbers_from_search_response(response);

    emit_json({
        {"event", "source_card_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"strategy", "filtered_exact_owner"},
        {"ok", !exact_card.empty() ? "true" : "false"},
        {"responseAccepted", filtered_ok ? "true" : "false"},
        {"returnedEmployeeCount", std::to_string(filtered_employees.size())},
        {"exactEmployeePresent",
         filtered_employees.count(job.employee_no) == 1 ? "true" : "false"},
        {"lastError", filtered_ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });

    if (!exact_card.empty()) {
        if (card_json != nullptr) {
            *card_json = std::string("{\"CardInfo\":") + exact_card + "}";
        }
        return true;
    }

    // Some deployed panels return an empty or failed response for EmployeeNoList
    // CardInfo searches even though the exact owned card is present. Fall back to a
    // complete, stable-search-ID inventory scan and accept only an exact employee owner.
    constexpr int request_page_size = 200;
    constexpr int max_pages = 100;
    const std::string search_id = "pt-card-full-" + job.employee_no;
    int position = 0;
    int total_matches = -1;
    int scanned_rows = 0;
    bool read_failed = false;
    for (int page = 0; page < max_pages; ++page) {
        std::ostringstream full_body;
        full_body << "{\"CardInfoSearchCond\":{\"searchID\":\""
                  << json_escape(search_id)
                  << "\",\"searchResultPosition\":" << position
                  << ",\"maxResults\":" << request_page_size << "}}";

        std::string full_response;
        const bool page_ok = stdxml_json_request(
            source,
            "POST /ISAPI/AccessControl/CardInfo/Search?format=json",
            full_body.str(),
            &full_response);
        if (!page_ok) {
            read_failed = true;
            emit_json({
                {"event", "source_card_inventory_page"},
                {"sourceDeviceId", source.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"ok", "false"},
                {"offset", std::to_string(position)},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
            break;
        }

        const int page_matches = extract_int_field_from_json(full_response, "numOfMatches");
        const int response_total = extract_int_field_from_json(full_response, "totalMatches");
        if (response_total >= 0) {
            total_matches = response_total;
        }
        exact_card = extract_card_object_for_employee(full_response, job.employee_no);
        const int advance = page_matches > 0
            ? page_matches
            : static_cast<int>(
                extract_employee_numbers_from_search_response(full_response).size());
        scanned_rows += std::max(advance, 0);

        emit_json({
            {"event", "source_card_inventory_page"},
            {"sourceDeviceId", source.config.hris_device_id},
            {"employeeNo", job.employee_no},
            {"ok", "true"},
            {"offset", std::to_string(position)},
            {"pageRows", std::to_string(std::max(advance, 0))},
            {"scannedRows", std::to_string(scanned_rows)},
            {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""},
            {"exactOwnerFound", !exact_card.empty() ? "true" : "false"}
        });

        if (!exact_card.empty()) {
            if (card_json != nullptr) {
                *card_json = std::string("{\"CardInfo\":") + exact_card + "}";
            }
            emit_json({
                {"event", "source_card_read"},
                {"sourceDeviceId", source.config.hris_device_id},
                {"employeeNo", job.employee_no},
                {"strategy", "full_inventory_exact_owner"},
                {"ok", "true"},
                {"scannedRows", std::to_string(scanned_rows)}
            });
            return true;
        }
        if (advance <= 0) {
            break;
        }
        position += advance;
        if ((total_matches >= 0 && position >= total_matches) ||
            (page_matches >= 0 && page_matches < request_page_size &&
             full_response.find("\"MORE\"") == std::string::npos &&
             full_response.find("\"More\"") == std::string::npos)) {
            break;
        }
    }

    emit_json({
        {"event", "source_card_read"},
        {"sourceDeviceId", source.config.hris_device_id},
        {"employeeNo", job.employee_no},
        {"strategy", "full_inventory_exact_owner"},
        {"ok", "false"},
        {"complete", !read_failed && total_matches >= 0 && position >= total_matches ? "true" : "false"},
        {"scannedRows", std::to_string(scanned_rows)},
        {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""}
    });
    return false;
}

std::string build_sync_card_no(const std::string &employee_no) {
    std::string digits;
    for (const char c : employee_no) {
        if (c >= '0' && c <= '9') digits.push_back(c);
    }
    if (digits.empty()) digits = "1";
    if (digits.size() > 10) digits = digits.substr(digits.size() - 10);
    return "98" + digits;
}

bool add_sync_card(DeviceSession &target, const std::string &employee_no, const std::string &card_no) {
    std::ostringstream body;
    body << "{\"CardInfo\":{\"employeeNo\":\"" << json_escape(employee_no)
         << "\",\"cardNo\":\"" << json_escape(card_no)
         << "\",\"cardType\":\"normalCard\",\"checkCardNo\":true}}";
    std::string response;
    const bool ok = stdxml_json_request(
        target,
        "POST /ISAPI/AccessControl/CardInfo/Record?format=json",
        body.str(),
        &response);
    emit_json({
        {"event", "peer_sync_card"},
        {"targetDeviceId", target.config.hris_device_id},
        {"employeeNo", employee_no},
        {"cardPresent", "true"},
        {"ok", ok ? "true" : "false"},
        {"lastError", ok ? "0" : std::to_string(NET_DVR_GetLastError())}
    });
    return ok;
}

std::string extract_first_object_for_key(const std::string &json, const std::string &key) {
    const size_t key_pos = json.find(key);
    if (key_pos == std::string::npos) {
        return "";
    }

    const size_t object_start = json.find('{', key_pos + key.size());
    if (object_start == std::string::npos) {
        return "";
    }

    int depth = 0;
    bool in_string = false;
    bool escaped = false;
    for (size_t index = object_start; index < json.size(); ++index) {
        const char c = json[index];
        if (in_string) {
            if (escaped) {
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                in_string = false;
            }
            continue;
        }
        if (c == '"') {
            in_string = true;
            continue;
        }
        if (c == '{') {
            depth += 1;
        } else if (c == '}') {
            depth -= 1;
            if (depth == 0) {
                return json.substr(object_start, index - object_start + 1);
            }
        }
    }
    return "";
}

std::string build_user_setup_payload_from_search_response(const std::string &response) {
    const std::string user_object = extract_first_object_for_key(response, "\"UserInfo\"");
    if (user_object.empty()) {
        return "";
    }
    return std::string("{\"UserInfo\":") + user_object + "}";
}

std::set<std::string> extract_employee_numbers_from_search_response(const std::string &response) {
    std::set<std::string> employee_numbers;
    static const std::regex employee_regex("\"employeeNo\"\\s*:\\s*\"([^\"]+)\"");
    for (std::sregex_iterator it(response.begin(), response.end(), employee_regex), end; it != end; ++it) {
        const std::string employee_no = (*it)[1].str();
        if (!employee_no.empty()) {
            employee_numbers.insert(employee_no);
        }
    }
    return employee_numbers;
}

std::string extract_string_field_from_json(const std::string &json, const std::string &field_name) {
    const std::regex field_regex("\"" + field_name + "\"\\s*:\\s*\"([^\"]*)\"");
    std::smatch match;
    if (std::regex_search(json, match, field_regex) && match.size() > 1) {
        return match[1].str();
    }
    return "";
}

int extract_int_field_from_json(const std::string &json, const std::string &field_name) {
    const std::regex field_regex("\"" + field_name + "\"\\s*:\\s*([0-9]+)");
    std::smatch match;
    if (std::regex_search(json, match, field_regex) && match.size() > 1) {
        try {
            return std::stoi(match[1].str());
        } catch (...) {
            return -1;
        }
    }
    return -1;
}

// Expand from a position inside a JSON object to the full {...} object bounds.
std::string extract_enclosing_json_object(const std::string &json, size_t pos_inside) {
    if (json.empty() || pos_inside >= json.size()) {
        return "";
    }
    // Walk left to the matching '{' for this object.
    int depth = 0;
    bool in_string = false;
    bool escaped = false;
    size_t start = pos_inside;
    for (size_t i = pos_inside + 1; i-- > 0;) {
        const char c = json[i];
        if (in_string) {
            if (escaped) {
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                in_string = false;
            }
            continue;
        }
        if (c == '"') {
            in_string = true;
            continue;
        }
        if (c == '}') {
            depth += 1;
        } else if (c == '{') {
            if (depth == 0) {
                start = i;
                break;
            }
            depth -= 1;
        }
        if (i == 0) {
            break;
        }
    }
    // Walk right from start to matching '}'.
    depth = 0;
    in_string = false;
    escaped = false;
    for (size_t index = start; index < json.size(); ++index) {
        const char c = json[index];
        if (in_string) {
            if (escaped) {
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                in_string = false;
            }
            continue;
        }
        if (c == '"') {
            in_string = true;
            continue;
        }
        if (c == '{') {
            depth += 1;
        } else if (c == '}') {
            depth -= 1;
            if (depth == 0) {
                return json.substr(start, index - start + 1);
            }
        }
    }
    return "";
}

// Parse per-user name/numOfFP/numOfFace from a UserInfo/Search page.
// Uses enclosing JSON object so name fields that appear BEFORE employeeNo are captured.
void extract_userinfo_touch_from_response(
    const std::string &response,
    std::map<std::string, UserInfoTouchSnapshot> *out) {
    if (out == nullptr || response.empty()) {
        return;
    }
    static const std::regex employee_regex("\"employeeNo\"\\s*:\\s*\"([^\"]+)\"");
    for (std::sregex_iterator it(response.begin(), response.end(), employee_regex), end;
         it != end;
         ++it) {
        const std::string employee_no = (*it)[1].str();
        if (employee_no.empty()) {
            continue;
        }
        const size_t pos = static_cast<size_t>((*it).position(0));
        std::string window = extract_enclosing_json_object(response, pos);
        if (window.empty()) {
            // Fallback: look both before and after employeeNo (name often precedes it).
            const size_t left = pos > 250 ? pos - 250 : 0;
            const size_t right = std::min(response.size(), pos + 500);
            window = response.substr(left, right - left);
        }
        UserInfoTouchSnapshot snap;
        snap.name = extract_string_field_from_json(window, "name");
        snap.num_of_fp = extract_int_field_from_json(window, "numOfFP");
        if (snap.num_of_fp < 0) {
            snap.num_of_fp = extract_int_field_from_json(window, "numOfFingerPrint");
        }
        snap.num_of_face = extract_int_field_from_json(window, "numOfFace");
        (*out)[employee_no] = snap;
    }
}

// Full UserInfo touch map (employeeNo -> name|numOfFP|numOfFace). Shares inventory_read_mutex.
std::map<std::string, UserInfoTouchSnapshot> read_device_userinfo_touch_map(
    DeviceSession &device,
    bool *complete_out = nullptr) {
    std::lock_guard<std::mutex> inventory_lock(inventory_read_mutex);
    if (complete_out != nullptr) {
        *complete_out = false;
    }
    constexpr int request_page_size = 30;
    std::map<std::string, UserInfoTouchSnapshot> touches;
    int position = 0;
    int total_matches = -1;
    bool read_failed = false;
    const std::string search_id =
        "pt-touch-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count());

    for (int page = 0; page < 80 && position < 4000; ++page) {
        std::ostringstream body;
        body << "{\"UserInfoSearchCond\":{\"searchID\":\"" << search_id
             << "\",\"searchResultPosition\":" << position
             << ",\"maxResults\":" << request_page_size << "}}";

        std::string response;
        const bool ok = stdxml_json_request(
            device,
            "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
            body.str(),
            &response);
        if (!ok) {
            read_failed = true;
            emit_json({
                {"event", "source_userinfo_touch_read"},
                {"sourceDeviceId", device.config.hris_device_id},
                {"ok", "false"},
                {"offset", std::to_string(position)},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
            break;
        }
        {
            static const std::regex total_regex("\"totalMatches\"\\s*:\\s*([0-9]+)");
            std::smatch m;
            if (std::regex_search(response, m, total_regex) && m.size() > 1) {
                try {
                    total_matches = std::stoi(m[1].str());
                } catch (...) {
                }
            }
        }
        const bool more =
            response.find("\"responseStatusStrg\"") != std::string::npos &&
            (response.find("\"MORE\"") != std::string::npos ||
             response.find("\"More\"") != std::string::npos ||
             response.find(":\"MORE\"") != std::string::npos);

        const size_t before = touches.size();
        extract_userinfo_touch_from_response(response, &touches);
        const int page_count = static_cast<int>(touches.size() - before);
        // Prefer page employee count from employeeNo extraction when windowing misses some.
        const int employee_page_count =
            static_cast<int>(extract_employee_numbers_from_search_response(response).size());
        const int advance = employee_page_count > 0 ? employee_page_count : page_count;

        emit_json({
            {"event", "source_userinfo_touch_read"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"ok", "true"},
            {"offset", std::to_string(position)},
            {"pageEmployees", std::to_string(advance)},
            {"totalSoFar", std::to_string(touches.size())},
            {"more", more ? "true" : "false"}
        });

        if (advance <= 0) {
            break;
        }
        position += advance;
        if (total_matches >= 0 && static_cast<int>(touches.size()) >= total_matches) {
            break;
        }
        if (!more && advance < request_page_size) {
            break;
        }
    }

    const bool complete =
        !read_failed &&
        (total_matches < 0 || static_cast<int>(touches.size()) >= total_matches);
    if (complete_out != nullptr) {
        *complete_out = complete;
    }
    if (!complete) {
        emit_json({
            {"event", "source_userinfo_touch_incomplete"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"employeeCount", std::to_string(touches.size())}
        });
        return {};
    }
    return touches;
}

void seed_userinfo_touch_baseline_for_session(DeviceSession &device) {
    bool complete = false;
    const auto current = read_device_userinfo_touch_map(device, &complete);
    if (!complete || current.empty()) {
        emit_json({
            {"event", "userinfo_touch_baseline_seed_failed"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host}
        });
        return;
    }
    std::lock_guard<std::mutex> lock(userinfo_touch_mutex);
    userinfo_touch_baseline_by_host[device.config.host] = current;
    userinfo_touch_baseline_ready_hosts.insert(device.config.host);
    emit_json({
        {"event", "userinfo_touch_baseline_seeded"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"sourceHost", device.config.host},
        {"employeeCount", std::to_string(current.size())}
    });
}

// When ACS person empty and inventory_delta has no NEW plain (modify of existing person),
// resolve plain id from UserInfo field changes (name / numOfFP / numOfFace). Device truth only.
std::string resolve_plain_employee_no_from_userinfo_touch(DeviceSession &device) {
    bool complete = false;
    const auto current = read_device_userinfo_touch_map(device, &complete);
    if (!complete || current.empty()) {
        emit_json({
            {"event", "callback_identity_userinfo_touch_incomplete"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host}
        });
        return "";
    }

    std::lock_guard<std::mutex> lock(userinfo_touch_mutex);
    auto &baseline = userinfo_touch_baseline_by_host[device.config.host];
    if (userinfo_touch_baseline_ready_hosts.find(device.config.host) ==
        userinfo_touch_baseline_ready_hosts.end()) {
        baseline = current;
        userinfo_touch_baseline_ready_hosts.insert(device.config.host);
        emit_json({
            {"event", "callback_identity_userinfo_touch_baseline"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host},
            {"employeeCount", std::to_string(current.size())},
            {"note", "late_baseline"}
        });
        return "";
    }

    std::vector<std::string> changed;
    for (const auto &entry : current) {
        const auto found = baseline.find(entry.first);
        if (found == baseline.end() ||
            found->second.fingerprint() != entry.second.fingerprint()) {
            changed.push_back(entry.first);
        }
    }
    // Always advance baseline so the same edit is not re-reported forever.
    baseline = current;

    if (changed.empty()) {
        emit_json({
            {"event", "callback_identity_userinfo_touch_no_change"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"sourceHost", device.config.host},
            {"employeeCount", std::to_string(current.size())}
        });
        return "";
    }

    std::string plain;
    if (changed.size() == 1) {
        plain = changed.front();
    } else {
        // Multiple field changes are ambiguous. Resolve only when exactly one changed
        // person is also present in the recent device-evidence candidate set.
        const auto recent = get_recent_employee_candidates_for_host(device.config.host);
        std::set<std::string> changed_set(changed.begin(), changed.end());
        std::vector<std::string> intersections;
        for (const auto &candidate : recent) {
            if (changed_set.find(candidate) != changed_set.end()) {
                intersections.push_back(candidate);
            }
        }
        std::sort(intersections.begin(), intersections.end());
        intersections.erase(std::unique(intersections.begin(), intersections.end()), intersections.end());
        if (intersections.size() == 1) {
            plain = intersections.front();
        }
    }

    emit_json({
        {"event", "callback_identity_userinfo_touch"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"sourceHost", device.config.host},
        {"changedCount", std::to_string(changed.size())},
        {"employeeNo", plain}
    });
    return plain;
}

// Full UserInfo inventory. Critical: many Hikvision firmwares return at most ~30
// rows even when maxResults is larger. Never advance by requested page_size alone
// and never stop just because page_count < requested maxResults when MORE remains.
std::vector<std::string> read_device_employee_numbers(DeviceSession &device, bool *complete_out = nullptr) {
    std::lock_guard<std::mutex> inventory_lock(inventory_read_mutex);
    if (complete_out != nullptr) {
        *complete_out = false;
    }
    constexpr int request_page_size = 30;
    std::set<std::string> employee_numbers;
    int position = 0;
    int total_matches = -1;
    bool read_failed = false;
    const std::string search_id =
        "pt-inv-" + std::to_string(
            std::chrono::steady_clock::now().time_since_epoch().count());

    for (int page = 0; page < 80 && position < 4000; ++page) {
        std::ostringstream body;
        body << "{\"UserInfoSearchCond\":{\"searchID\":\"" << search_id
             << "\",\"searchResultPosition\":" << position
             << ",\"maxResults\":" << request_page_size << "}}";

        std::string response;
        const bool ok = stdxml_json_request(
            device,
            "POST /ISAPI/AccessControl/UserInfo/Search?format=json",
            body.str(),
            &response);

        if (!ok) {
            read_failed = true;
            emit_json({
                {"event", "source_user_inventory_read"},
                {"sourceDeviceId", device.config.hris_device_id},
                {"ok", "false"},
                {"offset", std::to_string(position)},
                {"lastError", std::to_string(NET_DVR_GetLastError())}
            });
            break;
        }

        // Parse totals / MORE flag from this page.
        {
            static const std::regex total_regex("\"totalMatches\"\\s*:\\s*([0-9]+)");
            static const std::regex num_regex("\"numOfMatches\"\\s*:\\s*([0-9]+)");
            std::smatch m;
            if (std::regex_search(response, m, total_regex) && m.size() > 1) {
                try {
                    total_matches = std::stoi(m[1].str());
                } catch (...) {
                }
            }
            (void)num_regex;
        }
        const bool more =
            response.find("\"responseStatusStrg\"") != std::string::npos &&
            (response.find("\"MORE\"") != std::string::npos ||
             response.find("\"More\"") != std::string::npos ||
             response.find(":\"MORE\"") != std::string::npos);

        const std::set<std::string> page_employee_numbers =
            extract_employee_numbers_from_search_response(response);
        const size_t before = employee_numbers.size();
        employee_numbers.insert(page_employee_numbers.begin(), page_employee_numbers.end());
        const int page_count = static_cast<int>(page_employee_numbers.size());
        const int added = static_cast<int>(employee_numbers.size() - before);

        emit_json({
            {"event", "source_user_inventory_read"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"ok", "true"},
            {"offset", std::to_string(position)},
            {"pageEmployees", std::to_string(page_count)},
            {"added", std::to_string(added)},
            {"totalSoFar", std::to_string(employee_numbers.size())},
            {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""},
            {"more", more ? "true" : "false"}
        });

        if (page_count <= 0) {
            break;
        }

        // Advance by actual returned row count (device page size), not request_page_size.
        position += page_count;

        if (total_matches >= 0 && static_cast<int>(employee_numbers.size()) >= total_matches) {
            break;
        }
        if (!more && page_count < request_page_size && added == 0) {
            break;
        }
        // If device returns a full native page, keep going even when page_count < 64.
        if (!more && page_count < request_page_size) {
            // Last short page without MORE → done.
            break;
        }
        // Guard against infinite loops if position does not advance uniquely.
        if (added == 0 && !more) {
            break;
        }
    }

    emit_json({
        {"event", "source_user_inventory_complete"},
        {"sourceDeviceId", device.config.hris_device_id},
        {"employeeCount", std::to_string(employee_numbers.size())},
        {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""},
        {"complete", (!read_failed && (total_matches < 0 || static_cast<int>(employee_numbers.size()) >= total_matches)) ? "true" : "false"}
    });

    const bool complete =
        !read_failed &&
        (total_matches < 0 || static_cast<int>(employee_numbers.size()) >= total_matches);
    if (!complete) {
        emit_json({
            {"event", "source_user_inventory_incomplete_discarded"},
            {"sourceDeviceId", device.config.hris_device_id},
            {"employeeCount", std::to_string(employee_numbers.size())},
            {"totalMatches", total_matches >= 0 ? std::to_string(total_matches) : ""}
        });
        return {};
    }
    if (complete_out != nullptr) {
        *complete_out = true;
    }

    return std::vector<std::string>(employee_numbers.begin(), employee_numbers.end());
}

std::vector<std::string> find_missing_employee_numbers(
    const std::vector<std::string> &source_employee_numbers,
    const std::vector<std::string> &target_employee_numbers) {
    std::set<std::string> target_set(target_employee_numbers.begin(), target_employee_numbers.end());
    std::vector<std::string> missing;
    for (const auto &employee_no : source_employee_numbers) {
        if (!employee_no.empty() && target_set.find(employee_no) == target_set.end()) {
            missing.push_back(employee_no);
        }
    }
    return missing;
}
