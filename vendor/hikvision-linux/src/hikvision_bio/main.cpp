// Hikvision biometric service entry. Real compilation units; one binary.

#include "hikvision_bio/prelude.hpp"
#include "hikvision_bio/acs.hpp"
#include "hikvision_bio/copy.hpp"
#include "hikvision_bio/face.hpp"
#include "hikvision_bio/fingerprint.hpp"
#include "hikvision_bio/identity.hpp"
#include "hikvision_bio/spool.hpp"
#include "hikvision_bio/time.hpp"

using namespace hikvision_bio;

int main(int argc, char **argv) {
    int seconds = 0;
    std::vector<DeviceConfig> configs;
    bool replay_spool_only = false;
    std::string post_contract_file;
    std::string manual_full_mirror_source_device_id;
    std::string manual_employee_no;
    bool manual_include_fingerprints = false;
    bool manual_include_face_recognition = true;
    bool manual_include_card = false;
    bool manual_credential_only = false;
    std::string manual_source_employee_no;
    std::string manual_target_device_id;
    std::string manual_target_employee_no;
    std::string capture_fingerprint_employee_no;
    std::string capture_fingerprint_source_device_id;
    int capture_finger_no = 1;
    int capture_finger_type = 0;
    std::string capture_face_employee_no;
    std::string capture_face_source_device_id;
    std::string mirror_face_employee_no;
    std::string mirror_face_source_device_id;
    std::string export_biometric_employee_no;
    std::string export_biometric_source_device_id;
    bool export_biometric_include_fingerprints = true;
    bool export_biometric_include_face = true;
    std::string delete_face_device_id;
    std::string delete_face_employee_no;
    std::string stored_face_payload_file;
    bool get_time_mode = false;
    bool set_time_mode = false;
    std::string time_device_id;
    std::string set_local_time;
    std::string set_time_zone;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        auto next = [&](std::string *value) -> bool {
            if (i + 1 >= argc) {
                usage(argv[0]);
                return false;
            }
            *value = argv[++i];
            return true;
        };

        if (arg == "--device") {
            std::string value;
            if (!next(&value)) return 2;
            DeviceConfig config;
            if (!parse_device_spec(value, &config)) {
                std::cerr << "Invalid --device spec. Expected id|org|name|host|sdkPort|username|password[|peer]\n";
                return 2;
            }
            configs.push_back(config);
        } else if (arg == "--device-file") {
            std::string value;
            if (!next(&value)) return 2;
            std::ifstream device_file(value);
            if (!device_file) {
                std::cerr << "Unable to open --device-file: " << value << "\n";
                return 2;
            }
            std::string line;
            while (std::getline(device_file, line)) {
                const auto first = line.find_first_not_of(" \t\r\n");
                if (first == std::string::npos || line[first] == '#') continue;
                const auto last = line.find_last_not_of(" \t\r\n");
                const std::string spec = line.substr(first, last - first + 1);
                DeviceConfig config;
                if (!parse_device_spec(spec, &config)) {
                    std::cerr << "Invalid --device-file entry. Expected id|org|name|host|sdkPort|username|password[|peer]\n";
                    return 2;
                }
                configs.push_back(config);
            }
        } else if (arg == "--evidence-jsonl") {
            std::string value;
            if (!next(&value)) return 2;
            evidence_stream.open(value, std::ios::app);
        } else if (arg == "--hris-api-base") {
            if (!next(&hris_api_base)) return 2;
        } else if (arg == "--hris-api-token") {
            if (!next(&hris_api_token)) return 2;
        } else if (arg == "--post-contract-file") {
            if (!next(&post_contract_file)) return 2;
        } else if (arg == "--manual-full-mirror-source-device-id") {
            if (!next(&manual_full_mirror_source_device_id)) return 2;
        } else if (arg == "--manual-employee-no") {
            if (!next(&manual_employee_no)) return 2;
        } else if (arg == "--manual-include-fingerprints") {
            manual_include_fingerprints = true;
        } else if (arg == "--manual-exclude-face") {
            manual_include_face_recognition = false;
        } else if (arg == "--manual-include-card") {
            manual_include_card = true;
        } else if (arg == "--manual-credential-only") {
            manual_credential_only = true;
        } else if (arg == "--manual-source-employee-no") {
            if (!next(&manual_source_employee_no)) return 2;
        } else if (arg == "--manual-target-device-id") {
            if (!next(&manual_target_device_id)) return 2;
        } else if (arg == "--manual-target-employee-no") {
            if (!next(&manual_target_employee_no)) return 2;
        } else if (arg == "--capture-fingerprint-employee-no") {
            if (!next(&capture_fingerprint_employee_no)) return 2;
        } else if (arg == "--capture-fingerprint-source-device-id") {
            if (!next(&capture_fingerprint_source_device_id)) return 2;
        } else if (arg == "--finger-no") {
            std::string value;
            if (!next(&value)) return 2;
            capture_finger_no = std::max(1, std::min(10, std::stoi(value)));
        } else if (arg == "--finger-type") {
            std::string value;
            if (!next(&value)) return 2;
            capture_finger_type = std::max(0, std::min(4, std::stoi(value)));
        } else if (arg == "--capture-face-employee-no") {
            if (!next(&capture_face_employee_no)) return 2;
        } else if (arg == "--capture-face-source-device-id") {
            if (!next(&capture_face_source_device_id)) return 2;
        } else if (arg == "--mirror-face-employee-no") {
            if (!next(&mirror_face_employee_no)) return 2;
        } else if (arg == "--mirror-face-source-device-id") {
            if (!next(&mirror_face_source_device_id)) return 2;
        } else if (arg == "--export-biometric-employee-no") {
            if (!next(&export_biometric_employee_no)) return 2;
        } else if (arg == "--export-biometric-source-device-id") {
            if (!next(&export_biometric_source_device_id)) return 2;
        } else if (arg == "--export-biometric-no-fingerprints") {
            export_biometric_include_fingerprints = false;
        } else if (arg == "--export-biometric-no-face") {
            export_biometric_include_face = false;
        } else if (arg == "--delete-face-device-id") {
            if (!next(&delete_face_device_id)) return 2;
        } else if (arg == "--delete-face-employee-no") {
            if (!next(&delete_face_employee_no)) return 2;
        } else if (arg == "--stored-face-payload-file") {
            if (!next(&stored_face_payload_file)) return 2;
        } else if (arg == "--get-time") {
            get_time_mode = true;
        } else if (arg == "--set-time") {
            set_time_mode = true;
        } else if (arg == "--time-device-id") {
            if (!next(&time_device_id)) return 2;
        } else if (arg == "--local-time") {
            if (!next(&set_local_time)) return 2;
        } else if (arg == "--time-zone") {
            if (!next(&set_time_zone)) return 2;
        } else if (arg == "--min-sdk-time") {
            if (!next(&min_sdk_time)) return 2;
        } else if (arg == "--execute") {
            execute_mode = true;
        } else if (arg == "--dry-run") {
            execute_mode = false;
        } else if (arg == "--replay-spool-only") {
            replay_spool_only = true;
        } else if (arg == "--seconds") {
            std::string value;
            if (!next(&value)) return 2;
            seconds = std::stoi(value);
        } else {
            usage(argv[0]);
            return 2;
        }
    }

    const char *env_token = std::getenv("HIKVISION_HRIS_API_TOKEN");
    if (hris_api_token.empty() && env_token != nullptr) {
        hris_api_token = env_token;
    }
    const char *automatic_reconcile_env =
        std::getenv("HIKVISION_AUTOMATIC_PEER_RECONCILE");
    if (automatic_reconcile_env != nullptr) {
        std::string value = automatic_reconcile_env;
        std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
            return static_cast<char>(std::tolower(c));
        });
        automatic_peer_reconcile_enabled =
            value != "0" && value != "false" && value != "off" && value != "no";
    }

    if (replay_spool_only) {
        replay_pending_hris_contract_posts();
        replay_pending_hikvision_callbacks();
        return 0;
    }

    if (!post_contract_file.empty()) {
        std::string contract;
        if (!read_text_file(post_contract_file, &contract)) {
            std::cerr << "Unable to read --post-contract-file: " << post_contract_file << "\n";
            return 2;
        }
        post_hris_contract_payload(
            contract,
            "manual_contract",
            {
                {"source", "manual_contract_file"},
                {"path", post_contract_file}
            });
        return 0;
    }

    const bool manual_fingerprint_clone_mode =
        !manual_full_mirror_source_device_id.empty() &&
        !manual_source_employee_no.empty() &&
        !manual_target_employee_no.empty() &&
        manual_include_fingerprints;
    const bool manual_fingerprint_capture_mode =
        !capture_fingerprint_employee_no.empty() && !capture_fingerprint_source_device_id.empty();
    const bool manual_face_capture_mode =
        !capture_face_employee_no.empty() && !capture_face_source_device_id.empty();
    const bool manual_face_mirror_mode =
        !mirror_face_employee_no.empty() && !mirror_face_source_device_id.empty();
    const bool manual_biometric_export_mode =
        !export_biometric_employee_no.empty() && !export_biometric_source_device_id.empty();
    const bool delete_face_device_arg_present = !delete_face_device_id.empty();
    const bool delete_face_employee_arg_present = !delete_face_employee_no.empty();
    const bool delete_face_mode =
        delete_face_device_arg_present && delete_face_employee_arg_present;
    const bool stored_face_write_mode = !stored_face_payload_file.empty();
    const bool device_time_mode = get_time_mode || set_time_mode;
    const bool manual_reconcile_queue_mode =
        !manual_full_mirror_source_device_id.empty() && !manual_fingerprint_clone_mode;
    const bool manual_reconcile_mode =
        manual_reconcile_queue_mode || !manual_employee_no.empty() || manual_fingerprint_clone_mode ||
        manual_fingerprint_capture_mode || manual_face_capture_mode || manual_face_mirror_mode ||
        manual_biometric_export_mode || delete_face_mode || stored_face_write_mode ||
        device_time_mode;

    if (configs.empty()) {
        usage(argv[0]);
        return 2;
    }
    if (delete_face_device_arg_present != delete_face_employee_arg_present) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", delete_face_device_id},
            {"employeeNo", delete_face_employee_no},
            {"reason", "paired_delete_face_device_and_employee_required"}
        });
        return 2;
    }
    const bool another_manual_action_requested =
        stored_face_write_mode ||
        !manual_full_mirror_source_device_id.empty() ||
        !manual_employee_no.empty() ||
        manual_include_fingerprints ||
        manual_include_card ||
        manual_credential_only ||
        !manual_source_employee_no.empty() ||
        !manual_target_device_id.empty() ||
        !manual_target_employee_no.empty() ||
        !capture_fingerprint_employee_no.empty() ||
        !capture_fingerprint_source_device_id.empty() ||
        !capture_face_employee_no.empty() ||
        !capture_face_source_device_id.empty() ||
        !mirror_face_employee_no.empty() ||
        !mirror_face_source_device_id.empty() ||
        !export_biometric_employee_no.empty() ||
        !export_biometric_source_device_id.empty() ||
        get_time_mode ||
        set_time_mode ||
        !time_device_id.empty() ||
        !set_local_time.empty();
    if (delete_face_mode &&
        (configs.size() != 1 ||
         configs.front().hris_device_id != delete_face_device_id)) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", delete_face_device_id},
            {"employeeNo", delete_face_employee_no},
            {"configuredDeviceCount", std::to_string(configs.size())},
            {"reason", "delete_face_requires_single_exact_target_config"}
        });
        return 2;
    }
    if (delete_face_mode && another_manual_action_requested) {
        emit_json({
            {"event", "face_delete_blocked"},
            {"targetDeviceId", delete_face_device_id},
            {"employeeNo", delete_face_employee_no},
            {"reason", "delete_face_requires_exclusive_manual_mode"}
        });
        return 2;
    }

    std::signal(SIGINT, handle_signal);
    std::signal(SIGTERM, handle_signal);

    if (!NET_DVR_Init()) {
        emit_json({{"event", "sdk_init"}, {"ok", "false"}, {"lastError", std::to_string(NET_DVR_GetLastError())}});
        return 1;
    }
    emit_json({
        {"event", "sdk_init"},
        {"ok", "true"},
        {"sdkVersion", std::to_string(NET_DVR_GetSDKVersion())},
        {"sdkBuildVersion", std::to_string(NET_DVR_GetSDKBuildVersion())},
        {"mode", execute_mode ? "execute" : "dry-run"}
    });

    if (!NET_DVR_SetDVRMessageCallBack_V51(0, alarm_callback, nullptr)) {
        emit_json({
            {"event", "sdk_callback_register"},
            {"ok", "false"},
            {"lastError", std::to_string(NET_DVR_GetLastError())}
        });
        NET_DVR_Cleanup();
        return 1;
    }
    emit_json({{"event", "sdk_callback_register"}, {"ok", "true"}});
    // Arm reverse-tunnel / local hosts first (127.0.0.1 TEST A) so live path is ready
    // before wasting time on unreachable LAN peers.
    std::vector<DeviceConfig> arm_order = configs;
    std::stable_sort(arm_order.begin(), arm_order.end(), [](const DeviceConfig &a, const DeviceConfig &b) {
        const auto score = [](const DeviceConfig &c) {
            if (c.host == "127.0.0.1" || c.host == "localhost" || c.host == "::1") return 0;
            if (c.host.rfind("192.168.254.", 0) == 0) return 1;
            return 2;
        };
        return score(a) < score(b);
    });
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        sessions.reserve(arm_order.size());
    }

    for (const auto &config : arm_order) {
        emit_json({
            {"event", "device_config_loaded"},
            {"deviceId", config.hris_device_id},
            {"name", config.name},
            {"host", config.host},
            {"sdkPort", std::to_string(config.sdk_port)},
            {"peerFlag", config.biometric_peer ? "true" : "false"},
            {"peerPolicy", "all_armed_devices"}
        });

        bool armed = false;
        int attempts_performed = 0;
        bool backed_off = false;
        // Off-LAN peers fail with code 7; one retry is enough for them so TEST A
        // path is not blocked for ~70s on every listener restart.
        const bool is_local_path =
            config.host == "127.0.0.1" || config.host == "localhost" || config.host == "::1" ||
            config.host.rfind("192.168.254.", 0) == 0;
        const int max_login_attempts = is_local_path ? 3 : 1;
        for (int attempt = 1; attempt <= max_login_attempts && !armed; ++attempt) {
            attempts_performed = attempt;
            DeviceSession session;
            session.config = config;
            if (login_device(session) && (manual_reconcile_mode || arm_alarm(session))) {
                {
                    std::lock_guard<std::mutex> lock(sessions_mutex);
                    sessions.push_back(session);
                }
                armed = true;
                emit_json({
                    {"event", "device_armed"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"attempt", std::to_string(attempt)},
                    {"peerEnabled", "true"}
                });
                // Baseline scans read every user and can take tens of seconds per panel.
                // They are required for callback identity deltas in listener mode, but a
                // bounded manual copy already names the employee and must not scan every
                // selected device before doing that one write.
                if (!manual_reconcile_mode) {
                    try {
                        DeviceSession *seed_session = find_session_by_host(config.host);
                        if (seed_session != nullptr) {
                            seed_inventory_baseline_for_session(*seed_session);
                        }
                    } catch (...) {
                        emit_json({
                            {"event", "inventory_baseline_seed_failed"},
                            {"deviceId", config.hris_device_id},
                            {"host", config.host}
                        });
                    }
                }
            } else if (session.user_id >= 0) {
                NET_DVR_Logout_V30(session.user_id);
            }
            if (!armed && session.last_login_error == NET_DVR_USER_LOCKED) {
                emit_json({
                    {"event", "device_login_locked_backoff"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"lastError", std::to_string(session.last_login_error)},
                    {"attempt", std::to_string(attempt)},
                    {"attemptsRemaining", "0"},
                    {"attemptsSkipped", std::to_string(max_login_attempts - attempt)},
                    {"attemptCounterSource", "hris_backoff_guard"}
                });
                backed_off = true;
                break;
            }
            if (!armed && session.last_login_error == NET_DVR_PASSWORD_ERROR) {
                emit_json({
                    {"event", "device_login_auth_failed_backoff"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"lastError", std::to_string(session.last_login_error)},
                    {"attempt", std::to_string(attempt)},
                    {"attemptsRemaining", "0"},
                    {"attemptsSkipped", std::to_string(max_login_attempts - attempt)},
                    {"attemptCounterSource", "hris_backoff_guard"}
                });
                backed_off = true;
                break;
            }
            // Network unreachable (code 7): do not burn retries on this restart.
            if (!armed && session.last_login_error == 7) {
                emit_json({
                    {"event", "device_login_network_fail_skip_retries"},
                    {"deviceId", config.hris_device_id},
                    {"host", config.host},
                    {"lastError", "7"},
                    {"attempt", std::to_string(attempt)}
                });
                break;
            }
            if (!armed && attempt < max_login_attempts) {
                std::this_thread::sleep_for(std::chrono::milliseconds(500 * attempt));
            }
        }
        if (!armed) {
            emit_json({
                {"event", "device_arming_failed_after_retries"},
                {"deviceId", config.hris_device_id},
                {"host", config.host},
                {"attempts", std::to_string(attempts_performed)},
                {"maxAttempts", std::to_string(max_login_attempts)},
                {"backedOff", backed_off ? "true" : "false"},
                {"attemptsSkipped", backed_off ? std::to_string(max_login_attempts - attempts_performed) : "0"},
                {"attemptCounterSource", "hris_backoff_guard"}
            });
        }
    }

    bool has_sessions = false;
    {
        std::lock_guard<std::mutex> lock(sessions_mutex);
        has_sessions = !sessions.empty();
    }
    if (!has_sessions) {
        keep_running = 0;
        queue_cv.notify_all();
        emit_json({{"event", "service_start_failed"}, {"reason", "no_armed_devices"}});
        NET_DVR_Cleanup();
        return 1;
    }

    if (stored_face_write_mode) {
        StoredFaceWritePayload payload;
        std::string reason;
        bool ok = load_stored_face_write_payload(stored_face_payload_file, &payload, &reason);
        DeviceSession *target = nullptr;
        if (ok) {
            for (auto &session : sessions) {
                if (session.config.hris_device_id == payload.target_device_id) {
                    target = &session;
                    break;
                }
            }
            if (target == nullptr) {
                ok = false;
                reason = "target_device_not_armed";
            }
        }
        if (!ok) {
            emit_json({
                {"event", "stored_face_write_blocked"},
                {"targetDeviceId", payload.target_device_id},
                {"employeeNo", payload.employee_no},
                {"reason", reason}
            });
        } else {
            ok = write_stored_face_with_reread(*target, payload);
        }
        close_sessions();
        NET_DVR_Cleanup();
        emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
        return ok ? 0 : 1;
    }

    if (delete_face_mode) {
        DeviceSession *target = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == delete_face_device_id) {
                target = &session;
                break;
            }
        }
        const bool ok =
            target != nullptr && delete_face_for_exact_owner(*target, delete_face_employee_no);
        if (target == nullptr) {
            emit_json({
                {"event", "face_delete_blocked"},
                {"targetDeviceId", delete_face_device_id},
                {"employeeNo", delete_face_employee_no},
                {"reason", "target_device_not_armed"}
            });
        }
        close_sessions();
        NET_DVR_Cleanup();
        emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
        return ok ? 0 : 1;
    }

    if (device_time_mode) {
        DeviceSession *time_session = nullptr;
        for (auto &session : sessions) {
            if (time_device_id.empty() || session.config.hris_device_id == time_device_id) {
                time_session = &session;
                if (!time_device_id.empty()) {
                    break;
                }
            }
        }
        int time_rc = 1;
        if (time_session == nullptr) {
            emit_json({
                {"event", "device_time_failed"},
                {"ok", "false"},
                {"reason", "device_not_armed"},
                {"deviceId", time_device_id},
                {"transport", "sdk_stdxml"}
            });
        } else {
            time_rc = run_device_time_command(
                *time_session,
                set_time_mode,
                execute_mode,
                set_local_time,
                set_time_zone)
                ? 0
                : 1;
        }
        close_sessions();
        NET_DVR_Cleanup();
        emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
        return time_rc;
    }

    // Start worker threads after the initial session list is stable. SDK callbacks
    // can arrive during arming; they queue jobs, then workers process them once
    // all reachable devices are added, avoiding arm-time session-vector races.
    std::vector<std::thread> hris_immediate_posters;
    hris_immediate_posters.reserve(HRIS_IMMEDIATE_WORKER_COUNT);
    for (size_t i = 0; i < HRIS_IMMEDIATE_WORKER_COUNT; ++i) {
        hris_immediate_posters.emplace_back(hris_immediate_post_loop);
    }
    std::thread hris_enrichment_poster(hris_enrichment_post_loop);
    std::thread reconcile_worker(reconcile_worker_loop);
    std::thread callback_spool_replayer(callback_spool_replay_loop);
    // Historical reconcile/callback spools can contain thousands of durable
    // rows. Replaying them before SDK login made a healthy service look active
    // while no panel was armed for minutes or hours. Arm first; replay remains
    // durable background work and is safe to resume after a process restart.
    if (std::getenv("HIKVISION_SKIP_SPOOL_REPLAY") == nullptr) {
        std::thread(replay_pending_hris_contract_posts).detach();
    }

    std::thread poller;
    if (!manual_reconcile_mode && automatic_peer_reconcile_enabled) {
        poller = std::thread(polling_loop);
    }
    if (manual_fingerprint_clone_mode) {
        DeviceSession *manual_source = nullptr;
        DeviceSession *manual_target = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == manual_full_mirror_source_device_id) {
                manual_source = &session;
            }
            if (!manual_target_device_id.empty() && session.config.hris_device_id == manual_target_device_id) {
                manual_target = &session;
            }
        }
        if (manual_source == nullptr) {
            emit_json({
                {"event", "manual_fingerprint_clone_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", manual_full_mirror_source_device_id}
            });
        } else {
            if (manual_target == nullptr) {
                manual_target = manual_target_device_id.empty() ? manual_source : nullptr;
            }
            if (manual_target == nullptr) {
                emit_json({
                    {"event", "manual_fingerprint_clone_failed"},
                    {"reason", "target_device_not_armed"},
                    {"targetDeviceId", manual_target_device_id}
                });
            } else {
                clone_fingerprints_between_users(
                    *manual_source,
                    manual_source_employee_no,
                    *manual_target,
                    manual_target_employee_no);
            }
        }
    }
    if (manual_fingerprint_capture_mode) {
        DeviceSession *capture_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == capture_fingerprint_source_device_id) {
                capture_source = &session;
                break;
            }
        }
        if (capture_source == nullptr) {
            emit_json({
                {"event", "manual_fingerprint_capture_sync_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", capture_fingerprint_source_device_id}
            });
        } else {
            capture_and_sync_fingerprint_for_employee(
                *capture_source,
                capture_fingerprint_employee_no,
                static_cast<BYTE>(capture_finger_no),
                static_cast<BYTE>(capture_finger_type));
        }
    }
    if (manual_face_capture_mode) {
        DeviceSession *capture_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == capture_face_source_device_id) {
                capture_source = &session;
                break;
            }
        }
        if (capture_source == nullptr) {
            emit_json({
                {"event", "manual_face_capture_sync_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", capture_face_source_device_id}
            });
        } else {
            capture_and_sync_face_for_employee(*capture_source, capture_face_employee_no);
        }
    }
    if (manual_face_mirror_mode) {
        DeviceSession *mirror_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == mirror_face_source_device_id) {
                mirror_source = &session;
                break;
            }
        }
        if (mirror_source == nullptr) {
            emit_json({
                {"event", "manual_face_mirror_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", mirror_face_source_device_id}
            });
        } else {
            mirror_face_for_employee(*mirror_source, mirror_face_employee_no);
        }
    }
    if (manual_biometric_export_mode) {
        DeviceSession *export_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == export_biometric_source_device_id) {
                export_source = &session;
                break;
            }
        }
        if (export_source == nullptr) {
            emit_json({
                {"event", "manual_biometric_export_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", export_biometric_source_device_id},
                {"employeeNo", export_biometric_employee_no}
            });
        } else {
            export_biometric_templates_for_employee(
                *export_source,
                export_biometric_employee_no,
                export_biometric_include_fingerprints,
                export_biometric_include_face);
        }
    }
    if (manual_reconcile_queue_mode) {
        DeviceSession *manual_source = nullptr;
        for (auto &session : sessions) {
            if (session.config.hris_device_id == manual_full_mirror_source_device_id) {
                manual_source = &session;
                break;
            }
        }
        if (manual_source == nullptr) {
            emit_json({
                {"event", "manual_reconcile_queue_failed"},
                {"reason", "source_device_not_armed"},
                {"sourceDeviceId", manual_full_mirror_source_device_id}
            });
        } else {
            ReconcileJob manual_job;
            manual_job.source_host = manual_source->config.host;
            manual_job.source_device_id = manual_source->config.hris_device_id;
            manual_job.employee_no = manual_employee_no;
            manual_job.major = MAJOR_OPERATION;
            manual_job.minor = manual_employee_no.empty() ? 112 : MINOR_ADD_USER_INFO;
            manual_job.event_kind = manual_employee_no.empty()
                ? "manual_full_mirror"
                : "manual_single_user_reconcile";
            manual_job.include_fingerprints = manual_include_fingerprints || manual_employee_no.empty();
            manual_job.include_face_recognition = manual_include_face_recognition;
            manual_job.include_card = manual_include_card;
            manual_job.credential_only = manual_credential_only;
            if (!execute_mode && manual_job.credential_only) {
                // A credential-only dry run must read the exact source templates
                // and emit target preview events, but may not enqueue a worker
                // that is intentionally disabled in global dry-run mode.
                process_reconcile_job(manual_job);
            } else {
                queue_reconcile(manual_job);
            }
            emit_json({
                {"event", "manual_reconcile_queued"},
                {"sourceDeviceId", manual_job.source_device_id},
                {"sourceHost", manual_job.source_host},
                {"employeeNo", manual_job.employee_no},
                {"includeFingerprints", manual_job.include_fingerprints ? "true" : "false"},
                {"includeFaceRecognition", manual_job.include_face_recognition ? "true" : "false"},
                {"includeCard", manual_job.include_card ? "true" : "false"},
                {"credentialOnly", manual_job.credential_only ? "true" : "false"},
                {"mode", execute_mode ? "execute" : "dry-run"}
            });
        }
    }
    emit_json({
        {"event", "service_started"},
        {"armedDevices", std::to_string(sessions.size())},
        {"mode", execute_mode ? "execute" : "dry-run"},
        {"automaticPeerReconcile", automatic_peer_reconcile_enabled ? "true" : "false"},
        {"hrisApiBase", hris_api_base}
    });

    const auto start = std::chrono::steady_clock::now();
    while (keep_running) {
        if (seconds > 0 && std::chrono::steady_clock::now() - start >= std::chrono::seconds(seconds)) {
            keep_running = 0;
            queue_cv.notify_all();
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(250));
    }

    for (auto &poster : hris_immediate_posters) {
        if (poster.joinable()) {
            poster.join();
        }
    }
    if (hris_enrichment_poster.joinable()) {
        hris_enrichment_poster.join();
    }
    if (reconcile_worker.joinable()) {
        reconcile_worker.join();
    }
    if (poller.joinable()) {
        poller.join();
    }
    if (callback_spool_replayer.joinable()) {
        callback_spool_replayer.join();
    }
    close_sessions();
    NET_DVR_Cleanup();
    emit_json({{"event", "sdk_cleanup"}, {"ok", "true"}});
    return 0;
}

