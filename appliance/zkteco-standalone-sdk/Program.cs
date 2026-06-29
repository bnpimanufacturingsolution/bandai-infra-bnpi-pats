using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Interop.zkemkeeper;

namespace ZKTecoStandalone
{
    internal class Program
    {
        internal static readonly int MachineNumber = GetIntEnv("ZKTECO_MACHINE_NUMBER", 1);
        internal static readonly int Port = GetIntEnv("ZKTECO_DEVICE_PORT", 4370);
        internal static readonly int ConnectPassword = GetIntEnv("ZKTECO_CONNECT_PASSWORD", 0);
        internal const int AllEventsMask = 65535;
        internal static readonly bool SyncFingerprintTemplates = GetBoolEnv("ZKTECO_SYNC_FINGERPRINT_TEMPLATES", false);
        internal static readonly bool BackfillAttendanceLogs = GetBoolEnv("ZKTECO_BACKFILL_ATTENDANCE_LOGS", true);
        internal static readonly int BackfillMaxEvents = GetIntEnv("ZKTECO_BACKFILL_MAX_EVENTS", 100000);
        internal static readonly bool DryRunWebhooks = GetBoolEnv("ZKTECO_DRY_RUN_WEBHOOKS", false);
        internal static readonly int StatusPort = GetIntEnv("ZKTECO_STATUS_PORT", 4371);
        private static readonly string ExportDeviceEventsFile = GetStringEnv("ZKTECO_EXPORT_DEVICE_EVENTS_FILE", "");
        private static readonly string WebhookUrl = GetStringEnv("ZKTECO_WEBHOOK_URL", "http://localhost:3001/api/zkteco/events");
        private static readonly DateTime StartedAt = DateTime.UtcNow;
        private static readonly string[] DeviceIps = GetCsvEnv("ZKTECO_DEVICE_IPS", new[]
        {
            "10.184.38.10",
            "10.184.38.234",
            "10.184.38.235",
            "10.184.38.9"
        });

        private static readonly HttpClient HttpClient = new HttpClient();
        internal static readonly ConcurrentDictionary<string, string> UserNames = new ConcurrentDictionary<string, string>();
        private static readonly List<DeviceConnection> Devices = new List<DeviceConnection>();
        private static readonly ConcurrentQueue<EnrollmentRequest> EnrollmentQueue = new ConcurrentQueue<EnrollmentRequest>();
        private static readonly Dictionary<string, DateTime> RecentEnrollmentRequests = new Dictionary<string, DateTime>();
        private static readonly object LogLock = new object();
        private static readonly string LogFilePath = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "logs",
            "zkteco-monitor-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + "-" + Process.GetCurrentProcess().Id + ".log");

        private static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Directory.CreateDirectory(Path.GetDirectoryName(LogFilePath));

            if (args.Length > 0)
            {
                RunCommand(args);
                return;
            }

            Log("ZKTeco Multi-Device Sync");
            Log("========================\n");
            Log($"Log file: {LogFilePath}\n");
            Log($"Fingerprint template sync: {(SyncFingerprintTemplates ? "enabled" : "disabled - SDK template reads crashed on this firmware")}\n");
            Log($"Webhook URL: {WebhookUrl}");
            Log($"Machine number: {MachineNumber}");
            Log($"Connect password: {(ConnectPassword == 0 ? "not set" : "configured")}");
            Log($"Attendance log backfill: {(BackfillAttendanceLogs ? $"enabled, max {BackfillMaxEvents}" : "disabled")}");
            Log($"Webhook dry run: {(DryRunWebhooks ? "enabled - SDK reads only, no HRIS POST" : "disabled")}");
            Log($"Device event export: {(string.IsNullOrWhiteSpace(ExportDeviceEventsFile) ? "disabled" : ExportDeviceEventsFile)}");
            Log($"Status endpoint: http://0.0.0.0:{StatusPort}/status");
            Log($"Reconnect polling interval: 3 seconds");
            Log("Devices:");
            foreach (string ip in DeviceIps)
            {
                Log($"  - {ip}:{Port}");
            }

            Log("\nConnecting and registering real-time events...\n");

            foreach (string ip in DeviceIps)
            {
                var device = new DeviceConnection(ip, Port);
                Devices.Add(device);
                device.AttendanceReceived += OnAttendanceReceived;
                device.UserEnrollmentChanged += OnUserEnrollmentChanged;
                device.ConnectAndRegister();
            }

            StartStatusServer();

            ReconcileExistingUsers();
            BackfillRealAttendanceLogs();

            Log("\n==========================================");
            Log("Monitoring attendance + enrollment events");
            Log("Press Q to quit. Disconnected devices will keep retrying.");
            Log("==========================================\n");

            while (true)
            {
                foreach (DeviceConnection device in Devices)
                {
                    device.EnsureConnected();
                }

                ProcessEnrollmentQueue();

                if (!Console.IsInputRedirected && Console.KeyAvailable && Console.ReadKey(true).Key == ConsoleKey.Q)
                {
                    break;
                }

                Thread.Sleep(3000);
            }

            Log("\nStopping event monitoring...");
            foreach (DeviceConnection device in Devices)
            {
                device.Disconnect();
            }

            Log("Disconnected from devices.");
        }

        private static void OnAttendanceReceived(DeviceConnection source, AttendanceEvent attendance)
        {
            source.MarkAttendanceSeen(attendance.Timestamp);
            string userName = UserNames.ContainsKey(attendance.EnrollNumber)
                ? UserNames[attendance.EnrollNumber]
                : "Unknown";

            Log("+----------------------------------------+");
            Log("|       NEW ATTENDANCE TRANSACTION       |");
            Log("+----------------------------------------+");
            Log($"  Device:         {source.Ip}:{source.Port}");
            Log($"  User ID:        {attendance.EnrollNumber}");
            Log($"  User Name:      {userName}");
            Log($"  Timestamp:      {attendance.Timestamp:yyyy-MM-dd HH:mm:ss}");
            Log($"  Verify Method:  {GetVerifyMethod(attendance.VerifyMethod)}");
            Log($"  Att State:      {GetAttState(attendance.AttState)}");
            Log($"  Valid:          {(attendance.IsInvalid == 0 ? "Yes" : "No")}");
            Log($"  Work Code:      {attendance.WorkCode}");
            Log("------------------------------------------\n");

            SendAttendanceWebhook(source, attendance, userName);
        }

        private static void OnUserEnrollmentChanged(DeviceConnection source, string enrollNumber, int fingerIndex, int actionResult, int templateLength, string eventName)
        {
            Log($"[Enrollment] {eventName} from {source.Ip}: user={enrollNumber}, finger={fingerIndex}, result={actionResult}, templateLength={templateLength}");

            if (actionResult != 0)
            {
                Log($"[Enrollment] Ignoring unsuccessful enrollment event for user {enrollNumber}.");
                return;
            }

            if (eventName == "OnEnrollFinger")
            {
                Log($"[Enrollment] {eventName} logged only. This firmware also sends OnEnrollFingerEx, which has the correct string user ID on this device.");
                return;
            }

            EnrollmentQueue.Enqueue(new EnrollmentRequest
            {
                Source = source,
                EnrollNumber = enrollNumber,
                FingerIndex = fingerIndex,
                EventName = eventName
            });
        }

        private static void ProcessEnrollmentQueue()
        {
            while (EnrollmentQueue.TryDequeue(out EnrollmentRequest request))
            {
                string key = request.Source.Ip + "|" + request.EnrollNumber + "|" + request.FingerIndex;
                lock (RecentEnrollmentRequests)
                {
                    DateTime recentAt;
                    if (RecentEnrollmentRequests.TryGetValue(key, out recentAt) &&
                        DateTime.Now.Subtract(recentAt).TotalSeconds < 15)
                    {
                        Log($"[Sync] Duplicate enrollment request skipped: {request.EventName} from {request.Source.Ip}, user={request.EnrollNumber}, finger={request.FingerIndex}");
                        continue;
                    }

                    RecentEnrollmentRequests[key] = DateTime.Now;
                }

                try
                {
                    SyncUserFromSource(request.Source, request.EnrollNumber);
                }
                catch (Exception ex)
                {
                    Log($"[Sync] Error while syncing user {request.EnrollNumber} from {request.Source.Ip}: {ex.Message}");
                }
            }
        }

        private static void RunCommand(string[] args)
        {
            if (args.Any(arg => string.Equals(arg, "--sync", StringComparison.OrdinalIgnoreCase)))
            {
                RunSyncCommand(args);
                return;
            }

            if (args.Any(arg => string.Equals(arg, "--summary", StringComparison.OrdinalIgnoreCase)))
            {
                RunSummaryCommand();
                return;
            }

            if (args.Any(arg => string.Equals(arg, "--copy-fingerprint-user", StringComparison.OrdinalIgnoreCase)))
            {
                Environment.ExitCode = RunFingerprintCopyWorker(args) ? 0 : 2;
                return;
            }

            Log("Unknown command.");
            Log("Usage:");
            Log("  ZKTecoStandalone.exe --summary");
            Log("  ZKTecoStandalone.exe --sync --source=10.184.38.235 --target=all");
            Log("  ZKTecoStandalone.exe --sync --source=10.184.38.235 --target=10.184.38.10 --user=1");
            Log("  ZKTecoStandalone.exe --copy-fingerprint-user --source=10.184.38.235 --target=10.184.38.10 --user=1");
        }

        private static void RunSummaryCommand()
        {
            Log("ZKTeco device truth summary");
            Log("===========================");
            Log($"Machine number: {MachineNumber}");
            Log($"Device port: {Port}");
            Log($"Connect password: {(ConnectPassword == 0 ? "not set" : "configured")}");
            Log("");
            Log("ip,connected,user_count,event_count,unique_event_users,first_event,last_event");

            foreach (string ip in DeviceIps)
            {
                var device = new DeviceConnection(ip, Port);
                try
                {
                    for (int attempt = 1; attempt <= 3 && !device.IsConnected; attempt++)
                    {
                        if (attempt > 1)
                        {
                            Log($"[{ip}] Summary connect retry {attempt}/3 after SDK connection failure.");
                            Thread.Sleep(3000);
                        }

                        device.ConnectAndRegister();
                    }

                    if (!device.IsConnected)
                    {
                        Log($"{ip},false,0,0,0,,");
                        continue;
                    }

                    List<UserRecord> users = device.ReadUsers();
                    List<AttendanceEvent> events = device.ReadAttendanceLogs(BackfillMaxEvents);
                    int uniqueEventUsers = events
                        .Select(item => item.EnrollNumber)
                        .Where(item => !string.IsNullOrWhiteSpace(item))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .Count();
                    string firstEvent = events.Count == 0
                        ? ""
                        : events.Min(item => item.Timestamp).ToString("yyyy-MM-dd HH:mm:ss");
                    string lastEvent = events.Count == 0
                        ? ""
                        : events.Max(item => item.Timestamp).ToString("yyyy-MM-dd HH:mm:ss");

                    Log($"{ip},true,{users.Count},{events.Count},{uniqueEventUsers},{firstEvent},{lastEvent}");
                }
                finally
                {
                    device.Disconnect();
                }
            }
        }

        private static void RunSyncCommand(string[] args)
        {
            string sourceIp = GetArgValue(args, "--source");
            string targetValue = GetArgValue(args, "--target") ?? "all";
            string userFilter = GetArgValue(args, "--user");
            bool withFingerprints = args.Any(arg => string.Equals(arg, "--with-fingerprints", StringComparison.OrdinalIgnoreCase));

            Log("ZKTeco manual sync");
            Log("==================");
            Log($"Source: {sourceIp}");
            Log($"Target: {targetValue}");
            Log($"User filter: {(string.IsNullOrWhiteSpace(userFilter) ? "all" : userFilter)}");
            Log($"Fingerprint template sync requested: {withFingerprints}");

            if (string.IsNullOrWhiteSpace(sourceIp))
            {
                Log("[Manual Sync] Missing --source=<ip>.");
                return;
            }

            var source = new DeviceConnection(sourceIp, Port);
            source.ConnectAndRegister();
            if (!source.IsConnected)
            {
                Log($"[Manual Sync] Source {sourceIp} is not connected.");
                return;
            }

            List<string> targetIps = targetValue.Equals("all", StringComparison.OrdinalIgnoreCase)
                ? DeviceIps.Where(ip => !string.Equals(ip, sourceIp, StringComparison.OrdinalIgnoreCase)).ToList()
                : targetValue.Split(',').Select(ip => ip.Trim()).Where(ip => ip.Length > 0).ToList();

            var targets = new List<DeviceConnection>();
            foreach (string targetIp in targetIps)
            {
                var target = new DeviceConnection(targetIp, Port);
                target.ConnectAndRegister();
                if (target.IsConnected)
                {
                    targets.Add(target);
                }
                else
                {
                    Log($"[Manual Sync] Target {targetIp} is not connected; skipped.");
                }
            }

            List<string> usersToSync = string.IsNullOrWhiteSpace(userFilter)
                ? source.ReadUsers().Select(user => user.EnrollNumber).ToList()
                : new List<string> { userFilter };

            int copied = 0;
            int failed = 0;
            foreach (string enrollNumber in usersToSync)
            {
                UserSnapshot snapshot = source.ReadUserSnapshot(enrollNumber);
                if (snapshot == null)
                {
                    failed++;
                    Log($"[Manual Sync] Could not read user {enrollNumber} from {sourceIp}; skipped.");
                    continue;
                }

                foreach (DeviceConnection target in targets)
                {
                    if (target.WriteUserSnapshot(snapshot))
                    {
                        copied++;
                        Log($"[Manual Sync] User {enrollNumber} copied from {sourceIp} to {target.Ip}.");
                        if (withFingerprints)
                        {
                            bool fingerprintCopied = RunFingerprintCopyProcess(sourceIp, target.Ip, enrollNumber);
                            Log(fingerprintCopied
                                ? $"[Manual Sync] Fingerprint data copied for user {enrollNumber} from {sourceIp} to {target.Ip}."
                                : $"[Manual Sync] Fingerprint data copy failed or no templates found for user {enrollNumber} from {sourceIp} to {target.Ip}.");
                        }
                    }
                    else
                    {
                        failed++;
                        Log($"[Manual Sync] Failed copying user {enrollNumber} from {sourceIp} to {target.Ip}.");
                    }
                }
            }

            source.Disconnect();
            foreach (DeviceConnection target in targets)
            {
                target.Disconnect();
            }

            Log($"[Manual Sync] Complete. Copies={copied}, failures={failed}.");
        }

        private static bool RunFingerprintCopyProcess(string sourceIp, string targetIp, string enrollNumber)
        {
            string exePath = Process.GetCurrentProcess().MainModule.FileName;
            string[] methods = { "tablev10", "ssr15", "ssr0-9", "enroll0-9" };

            foreach (string method in methods)
            {
                Log($"[Fingerprint] Trying method {method} for user {enrollNumber}: {sourceIp} -> {targetIp}");
                if (RunFingerprintCopyProcessAttempt(exePath, sourceIp, targetIp, enrollNumber, method))
                {
                    return true;
                }
            }

            return false;
        }

        private static bool RunFingerprintCopyProcessAttempt(string exePath, string sourceIp, string targetIp, string enrollNumber, string method)
        {
            string arguments = $"--copy-fingerprint-user --source={sourceIp} --target={targetIp} --user={enrollNumber} --method={method}";

            var startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = arguments,
                WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using (Process process = Process.Start(startInfo))
            {
                bool exited = process.WaitForExit(15000);
                if (!process.HasExited)
                {
                    try
                    {
                        process.Kill();
                    }
                    catch
                    {
                    }

                    Log($"[Fingerprint Worker] Method {method} timed out for user {enrollNumber}: {sourceIp} -> {targetIp}");
                    return false;
                }

                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();

                foreach (string line in SplitLines(output))
                {
                    Log("[Fingerprint Worker:" + method + "] " + line);
                }

                foreach (string line in SplitLines(error))
                {
                    Log("[Fingerprint Worker:" + method + ":ERR] " + line);
                }

                return process.ExitCode == 0;
            }
        }

        private static bool RunFingerprintCopyWorker(string[] args)
        {
            string sourceIp = GetArgValue(args, "--source");
            string targetIp = GetArgValue(args, "--target");
            string enrollNumber = GetArgValue(args, "--user");
            string method = GetArgValue(args, "--method") ?? "ssr15";

            Log("ZKTeco fingerprint worker");
            Log("=========================");
            Log($"Source: {sourceIp}");
            Log($"Target: {targetIp}");
            Log($"User: {enrollNumber}");
            Log($"Method: {method}");

            if (string.IsNullOrWhiteSpace(sourceIp) ||
                string.IsNullOrWhiteSpace(targetIp) ||
                string.IsNullOrWhiteSpace(enrollNumber))
            {
                Log("[Fingerprint Worker] Missing --source, --target, or --user.");
                return false;
            }

            var source = new DeviceConnection(sourceIp, Port);
            var target = new DeviceConnection(targetIp, Port);

            source.ConnectAndRegister();
            target.ConnectAndRegister();

            if (!source.IsConnected || !target.IsConnected)
            {
                Log("[Fingerprint Worker] Source or target failed to connect.");
                return false;
            }

            bool copied = source.CopyFingerprintTo(target, enrollNumber, method);

            source.Disconnect();
            target.Disconnect();

            return copied;
        }

        private static IEnumerable<string> SplitLines(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                yield break;
            }

            using (var reader = new StringReader(text))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    if (!string.IsNullOrWhiteSpace(line))
                    {
                        yield return line;
                    }
                }
            }
        }

        private static string GetArgValue(string[] args, string name)
        {
            string prefix = name + "=";
            string match = args.FirstOrDefault(arg => arg.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            return match == null ? null : match.Substring(prefix.Length);
        }

        private static void SyncUserFromSource(DeviceConnection source, string enrollNumber)
        {
            UserSnapshot snapshot = null;

            for (int attempt = 1; attempt <= 10; attempt++)
            {
                snapshot = source.ReadUserSnapshot(enrollNumber);
                if (snapshot != null)
                {
                    break;
                }

                Log($"[Sync] Waiting for user {enrollNumber} data on {source.Ip} (attempt {attempt}/10)...");
                Thread.Sleep(1000);
            }

            if (snapshot == null)
            {
                Log($"[Sync] Could not read user {enrollNumber} from {source.Ip}. Nothing was copied.");
                return;
            }

            UserNames[snapshot.EnrollNumber] = snapshot.Name;

            foreach (DeviceConnection target in Devices)
            {
                if (ReferenceEquals(target, source))
                {
                    continue;
                }

                if (!target.IsConnected)
                {
                    Log($"[Sync] Skipping {target.Ip}; device is not connected right now.");
                    continue;
                }

                bool synced = target.WriteUserSnapshot(snapshot);
                Log(synced
                    ? $"[Sync] User {snapshot.EnrollNumber} copied from {source.Ip} to {target.Ip}."
                    : $"[Sync] Failed to copy user {snapshot.EnrollNumber} from {source.Ip} to {target.Ip}.");
            }
        }

        private static void ReconcileExistingUsers()
        {
            Log("\n==========================================");
            Log("Startup user reconciliation");
            Log("==========================================");

            var usersByDevice = new Dictionary<DeviceConnection, HashSet<string>>();
            foreach (DeviceConnection device in Devices)
            {
                List<UserRecord> users = device.ReadUsers();
                HashSet<string> ids = new HashSet<string>(users.Select(user => user.EnrollNumber));
                usersByDevice[device] = ids;
                Log($"[Reconcile] {device.Ip}: connected={device.IsConnected}, users={ids.Count}");
                LogEnrolledUsers(device, users);
            }

            var allUserIds = new HashSet<string>(usersByDevice.Values.SelectMany(ids => ids));
            int missingTotal = 0;
            int copiedTotal = 0;

            foreach (DeviceConnection target in Devices)
            {
                if (!target.IsConnected)
                {
                    continue;
                }

                foreach (string enrollNumber in allUserIds)
                {
                    if (usersByDevice[target].Contains(enrollNumber))
                    {
                        continue;
                    }

                    missingTotal++;
                    DeviceConnection source = Devices.FirstOrDefault(d =>
                        !ReferenceEquals(d, target) &&
                        d.IsConnected &&
                        usersByDevice.ContainsKey(d) &&
                        usersByDevice[d].Contains(enrollNumber));

                    if (source == null)
                    {
                        Log($"[Reconcile] User {enrollNumber} missing on {target.Ip}, but no connected source has it.");
                        continue;
                    }

                    Log($"[Reconcile] User {enrollNumber} exists on {source.Ip} but is missing on {target.Ip}. Copying...");
                    UserSnapshot snapshot = source.ReadUserSnapshot(enrollNumber);
                    if (snapshot != null && target.WriteUserSnapshot(snapshot))
                    {
                        usersByDevice[target].Add(enrollNumber);
                        copiedTotal++;
                        Log($"[Reconcile] User {enrollNumber} copied to {target.Ip}.");
                    }
                    else
                    {
                        Log($"[Reconcile] Failed to copy user {enrollNumber} to {target.Ip}.");
                    }
                }
            }

            Log(missingTotal == 0
                ? "[Reconcile] All connected devices have the same user IDs at startup."
                : $"[Reconcile] Missing user slots found={missingTotal}, copied={copiedTotal}.");
        }

        private static void LogEnrolledUsers(DeviceConnection device, List<UserRecord> users)
        {
            Log("");
            Log($"[Users] Fetching enrolled users from {device.Ip}:");
            Log("==========================================");
            int count = 0;
            foreach (UserRecord user in users.OrderBy(user => ToSortableUserId(user.EnrollNumber)))
            {
                count++;
                Log($"{count}. User ID: {user.EnrollNumber}");
                Log($"   Device: {device.Ip}");
                Log($"   Name: {user.Name}");
                Log($"   Privilege: {user.Privilege} (0=User, 14=Admin)");
                Log($"   Enabled: {user.Enabled}");
                Log("");
            }

            if (count == 0)
            {
                Log($"No users found on {device.Ip}.");
            }
            else
            {
                Log($"Total users fetched from {device.Ip}: {count}");
            }
        }

        private static void BackfillRealAttendanceLogs()
        {
            if (!BackfillAttendanceLogs)
            {
                Log("[Backfill] Attendance log backfill disabled.");
                return;
            }

            Log("\n==========================================");
            Log("Startup attendance log backfill");
            Log("==========================================");

            foreach (DeviceConnection device in Devices)
            {
                if (!device.IsConnected)
                {
                    Log($"[Backfill] {device.Ip}: skipped, not connected.");
                    continue;
                }

                int posted = 0;
                int failed = 0;
                foreach (AttendanceEvent attendance in device.ReadAttendanceLogs(BackfillMaxEvents))
                {
                    string userName = UserNames.ContainsKey(attendance.EnrollNumber)
                        ? UserNames[attendance.EnrollNumber]
                        : "Unknown";
                    if (SendAttendanceWebhook(device, attendance, userName))
                    {
                        posted++;
                    }
                    else
                    {
                        failed++;
                    }
                }

                Log(DryRunWebhooks
                    ? $"[Backfill] {device.Ip}: dry-run counted {posted} stored attendance transaction(s); no HRIS POST."
                    : $"[Backfill] {device.Ip}: webhook success={posted}, failure={failed} for stored attendance transaction(s).");
            }
        }

        private static int ToSortableUserId(string enrollNumber)
        {
            int value;
            return int.TryParse(enrollNumber, out value) ? value : int.MaxValue;
        }

        private static bool SendAttendanceWebhook(DeviceConnection source, AttendanceEvent attendance, string userName)
        {
            try
            {
                var eventData = new
                {
                    device = new
                    {
                        type = "ZKTeco",
                        ip = source.Ip,
                        port = source.Port
                    },
                    attendance = new
                    {
                        enrollNumber = attendance.EnrollNumber,
                        userName = userName,
                        timestamp = attendance.Timestamp.ToString("yyyy-MM-ddTHH:mm:ss"),
                        verifyMethod = attendance.VerifyMethod,
                        verifyMethodName = GetVerifyMethod(attendance.VerifyMethod),
                        attState = attendance.AttState,
                        attStateName = GetAttState(attendance.AttState),
                        isValid = attendance.IsInvalid == 0,
                        workCode = attendance.WorkCode,
                        serialNo = attendance.SerialNo
                    },
                    eventType = "AttendanceTransaction"
                };

                string jsonPayload = JsonSerializer.Serialize(eventData);
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                if (!string.IsNullOrWhiteSpace(ExportDeviceEventsFile))
                {
                    WriteExportedDeviceEvent(jsonPayload);
                    source.MarkWebhookSuccess();
                    return true;
                }

                if (DryRunWebhooks)
                {
                    source.MarkWebhookSuccess();
                    return true;
                }

                Log($"[Webhook] Sending {attendance.EnrollNumber} from {source.Ip} to {WebhookUrl}...");

                var response = HttpClient.PostAsync(WebhookUrl, content).GetAwaiter().GetResult();
                if (response.IsSuccessStatusCode)
                {
                    Log("[Webhook] Sent successfully");
                    source.MarkWebhookSuccess();
                    return true;
                }

                Log($"[Webhook] Failed: HTTP {(int)response.StatusCode} {response.ReasonPhrase}");
                source.MarkWebhookFailure($"HTTP {(int)response.StatusCode} {response.ReasonPhrase}");
                return false;
            }
            catch (Exception ex)
            {
                Log($"[Webhook] Error: {ex.Message}");
                source.MarkWebhookFailure(ex.Message);
                return false;
            }
        }

        private static void StartStatusServer()
        {
            Task.Run(() =>
            {
                try
                {
                    var listener = new TcpListener(IPAddress.Any, StatusPort);
                    listener.Start();
                    Log($"[Status] Listening on port {StatusPort}.");

                    while (true)
                    {
                        using (TcpClient client = listener.AcceptTcpClient())
                        using (NetworkStream stream = client.GetStream())
                        {
                            string requestLine = ReadRequestLine(stream);
                            string path = ParsePath(requestLine);
                            string body;
                            int statusCode;

                            if (path == "/health")
                            {
                                statusCode = 200;
                                body = "{\"ok\":true}";
                            }
                            else if (path == "/status")
                            {
                                statusCode = 200;
                                body = JsonSerializer.Serialize(BuildStatus());
                            }
                            else
                            {
                                statusCode = 404;
                                body = "{\"error\":\"not_found\"}";
                            }

                            byte[] bodyBytes = Encoding.UTF8.GetBytes(body);
                            string header =
                                $"HTTP/1.1 {statusCode} {(statusCode == 200 ? "OK" : "Not Found")}\r\n" +
                                "Content-Type: application/json\r\n" +
                                $"Content-Length: {bodyBytes.Length}\r\n" +
                                "Connection: close\r\n\r\n";
                            byte[] headerBytes = Encoding.ASCII.GetBytes(header);
                            stream.Write(headerBytes, 0, headerBytes.Length);
                            stream.Write(bodyBytes, 0, bodyBytes.Length);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Log($"[Status] Listener failed: {ex.Message}");
                }
            });
        }

        private static string ReadRequestLine(NetworkStream stream)
        {
            var buffer = new byte[2048];
            int count = stream.Read(buffer, 0, buffer.Length);
            if (count <= 0)
            {
                return "";
            }

            string request = Encoding.ASCII.GetString(buffer, 0, count);
            int newline = request.IndexOf("\r\n", StringComparison.Ordinal);
            return newline >= 0 ? request.Substring(0, newline) : request;
        }

        private static string ParsePath(string requestLine)
        {
            string[] parts = (requestLine ?? "").Split(' ');
            return parts.Length >= 2 ? parts[1] : "/";
        }

        private static object BuildStatus()
        {
            DeviceConnection[] snapshot = Devices.ToArray();
            int connected = snapshot.Count(device => device.IsConnected);
            DateTime? lastEventAt = snapshot
                .Where(device => device.LastEventAtUtc.HasValue)
                .Select(device => device.LastEventAtUtc.Value)
                .OrderBy(value => value)
                .Cast<DateTime?>()
                .LastOrDefault();

            return new
            {
                service = "project-truth-zkteco-standalone-sdk-bridge",
                runtime = ".NET Framework 4.8 + zkemkeeper COM",
                status = connected > 0 ? "online" : "degraded",
                startedAt = StartedAt.ToString("o"),
                uptimeSeconds = (int)Math.Max(0, DateTime.UtcNow.Subtract(StartedAt).TotalSeconds),
                webhookUrl = WebhookUrl,
                devicePort = Port,
                configuredDevices = snapshot.Length,
                connectedDevices = connected,
                lastEventAt = lastEventAt.HasValue ? lastEventAt.Value.ToString("o") : null,
                devices = snapshot.Select(device => device.ToStatus()).ToArray()
            };
        }

        private static void WriteExportedDeviceEvent(string jsonPayload)
        {
            lock (LogLock)
            {
                string directory = Path.GetDirectoryName(ExportDeviceEventsFile);
                if (!string.IsNullOrWhiteSpace(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                File.AppendAllText(ExportDeviceEventsFile, jsonPayload + Environment.NewLine, Encoding.UTF8);
            }
        }

        internal static void Log(string message)
        {
            lock (LogLock)
            {
                Console.WriteLine(message);
                File.AppendAllText(LogFilePath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
            }
        }

        private static string GetVerifyMethod(int method)
        {
            switch (method)
            {
                case 0: return "Password";
                case 1: return "Fingerprint";
                case 2: return "Card";
                case 3: return "Fingerprint or Password";
                case 4: return "Fingerprint or Card";
                case 5: return "Fingerprint + Password";
                case 6: return "Fingerprint + Card";
                default: return $"Unknown ({method})";
            }
        }

        private static string GetAttState(int state)
        {
            switch (state)
            {
                case 0: return "Check In";
                case 1: return "Check Out";
                case 2: return "Break Out";
                case 3: return "Break In";
                case 4: return "Overtime In";
                case 5: return "Overtime Out";
                default: return $"Unknown ({state})";
            }
        }

        private static string GetStringEnv(string name, string defaultValue)
        {
            string value = Environment.GetEnvironmentVariable(name);
            return string.IsNullOrWhiteSpace(value) ? defaultValue : value.Trim();
        }

        private static int GetIntEnv(string name, int defaultValue)
        {
            string value = Environment.GetEnvironmentVariable(name);
            int parsed;
            return int.TryParse(value, out parsed) ? parsed : defaultValue;
        }

        private static bool GetBoolEnv(string name, bool defaultValue)
        {
            string value = Environment.GetEnvironmentVariable(name);
            bool parsed;
            if (bool.TryParse(value, out parsed))
            {
                return parsed;
            }

            int numeric;
            if (int.TryParse(value, out numeric))
            {
                return numeric != 0;
            }

            return defaultValue;
        }

        private static string[] GetCsvEnv(string name, string[] defaultValue)
        {
            string value = Environment.GetEnvironmentVariable(name);
            if (string.IsNullOrWhiteSpace(value))
            {
                return defaultValue;
            }

            string[] values = value
                .Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(item => item.Trim())
                .Where(item => item.Length > 0)
                .ToArray();

            return values.Length == 0 ? defaultValue : values;
        }
    }

    internal sealed class DeviceConnection
    {
        private readonly object syncRoot = new object();
        private readonly CZKEMClass zk = new CZKEMClass();
        private DateTime nextReconnectAt = DateTime.MinValue;

        public DeviceConnection(string ip, int port)
        {
            Ip = ip;
            Port = port;
        }

        public event Action<DeviceConnection, AttendanceEvent> AttendanceReceived;
        public event Action<DeviceConnection, string, int, int, int, string> UserEnrollmentChanged;

        public string Ip { get; }
        public int Port { get; }
        public bool IsConnected { get; private set; }
        public DateTime? LastConnectedAtUtc { get; private set; }
        public DateTime? LastDisconnectedAtUtc { get; private set; }
        public DateTime? LastEventAtUtc { get; private set; }
        public DateTime? LastPostedAtUtc { get; private set; }
        public int EventsSeen { get; private set; }
        public int EventsPosted { get; private set; }
        public int WebhookFailed { get; private set; }
        public string LastError { get; private set; }

        public void ConnectAndRegister()
        {
            lock (syncRoot)
            {
                if (IsConnected)
                {
                    return;
                }

                Program.Log($"[{Ip}] Connecting...");
                zk.SetCommuTimeOut(3000);
                if (Program.ConnectPassword > 0)
                {
                    zk.SetCommPassword(Program.ConnectPassword);
                }
                IsConnected = zk.Connect_Net(Ip, Port);
                if (!IsConnected)
                {
                    PrintLastError("Connection failed");
                    nextReconnectAt = DateTime.Now.AddSeconds(10);
                    return;
                }

                RegisterHandlers();
                bool registered = zk.RegEvent(Program.MachineNumber, Program.AllEventsMask);
                LastConnectedAtUtc = DateTime.UtcNow;
                LastError = null;
                Program.Log(registered
                    ? $"[{Ip}] Connected and registered events."
                    : $"[{Ip}] Connected, but RegEvent failed.");

                LoadUserNames();
            }
        }

        public void EnsureConnected()
        {
            if (IsConnected || DateTime.Now < nextReconnectAt)
            {
                return;
            }

            ConnectAndRegister();
        }

        public void Disconnect()
        {
            lock (syncRoot)
            {
                if (!IsConnected)
                {
                    return;
                }

                zk.Disconnect();
                IsConnected = false;
                LastDisconnectedAtUtc = DateTime.UtcNow;
            }
        }

        public void MarkAttendanceSeen(DateTime eventTime)
        {
            EventsSeen++;
            LastEventAtUtc = eventTime.Kind == DateTimeKind.Utc
                ? eventTime
                : DateTime.SpecifyKind(eventTime, DateTimeKind.Local).ToUniversalTime();
        }

        public void MarkWebhookSuccess()
        {
            EventsPosted++;
            LastPostedAtUtc = DateTime.UtcNow;
            LastError = null;
        }

        public void MarkWebhookFailure(string error)
        {
            WebhookFailed++;
            LastError = error;
        }

        public object ToStatus()
        {
            return new
            {
                ip = Ip,
                port = Port,
                connected = IsConnected,
                streaming = IsConnected,
                eventsSeen = EventsSeen,
                eventsPosted = EventsPosted,
                webhookFailed = WebhookFailed,
                lastConnectedAt = LastConnectedAtUtc.HasValue ? LastConnectedAtUtc.Value.ToString("o") : null,
                lastDisconnectedAt = LastDisconnectedAtUtc.HasValue ? LastDisconnectedAtUtc.Value.ToString("o") : null,
                lastEventAt = LastEventAtUtc.HasValue ? LastEventAtUtc.Value.ToString("o") : null,
                lastPostedAt = LastPostedAtUtc.HasValue ? LastPostedAtUtc.Value.ToString("o") : null,
                lastError = LastError
            };
        }

        public HashSet<string> ReadUserIds()
        {
            return new HashSet<string>(ReadUsers().Select(user => user.EnrollNumber));
        }

        public List<UserRecord> ReadUsers()
        {
            lock (syncRoot)
            {
                var users = new List<UserRecord>();
                if (!IsConnected)
                {
                    return users;
                }

                string enrollNumber = "";
                string name = "";
                string password = "";
                int privilege = 0;
                bool enabled = true;

                zk.EnableDevice(Program.MachineNumber, false);
                try
                {
                    if (!zk.ReadAllUserID(Program.MachineNumber))
                    {
                        PrintLastError("ReadAllUserID failed");
                        return users;
                    }

                    while (zk.SSR_GetAllUserInfo(Program.MachineNumber, out enrollNumber, out name, out password, out privilege, out enabled))
                    {
                        Program.UserNames[enrollNumber] = name;
                        users.Add(new UserRecord
                        {
                            EnrollNumber = enrollNumber,
                            Name = name,
                            Privilege = privilege,
                            Enabled = enabled
                        });
                    }
                }
                finally
                {
                    zk.EnableDevice(Program.MachineNumber, true);
                }

                return users;
            }
        }

        public List<AttendanceEvent> ReadAttendanceLogs(int maxEvents)
        {
            lock (syncRoot)
            {
                var rows = new List<AttendanceEvent>();
                if (!IsConnected)
                {
                    return rows;
                }

                string enrollNumber = "";
                int verifyMode = 0;
                int inOutMode = 0;
                int year = 0;
                int month = 0;
                int day = 0;
                int hour = 0;
                int minute = 0;
                int second = 0;
                int workCode = 0;

                zk.EnableDevice(Program.MachineNumber, false);
                try
                {
                    if (!zk.ReadGeneralLogData(Program.MachineNumber))
                    {
                        PrintLastError("ReadGeneralLogData failed");
                        return rows;
                    }

                    while (rows.Count < maxEvents && zk.SSR_GetGeneralLogData(
                        Program.MachineNumber,
                        out enrollNumber,
                        out verifyMode,
                        out inOutMode,
                        out year,
                        out month,
                        out day,
                        out hour,
                        out minute,
                        out second,
                        ref workCode))
                    {
                        DateTime timestamp;
                        try
                        {
                            timestamp = new DateTime(year, month, day, hour, minute, second);
                        }
                        catch
                        {
                            Program.Log($"[{Ip}] Skipped invalid attendance log timestamp for user {enrollNumber}: {year}-{month}-{day} {hour}:{minute}:{second}");
                            continue;
                        }

                        rows.Add(new AttendanceEvent
                        {
                            EnrollNumber = enrollNumber,
                            IsInvalid = 0,
                            AttState = inOutMode,
                            VerifyMethod = verifyMode,
                            Timestamp = timestamp,
                            WorkCode = workCode
                        });
                    }
                }
                finally
                {
                    zk.EnableDevice(Program.MachineNumber, true);
                }

                Program.Log($"[{Ip}] Read {rows.Count} stored attendance log row(s).");
                return rows;
            }
        }

        public UserSnapshot ReadUserSnapshot(string enrollNumber)
        {
            lock (syncRoot)
            {
                if (!IsConnected)
                {
                    return null;
                }

                string name = "";
                string password = "";
                int privilege = 0;
                bool enabled = true;

                zk.ReadAllUserID(Program.MachineNumber);
                if (!zk.SSR_GetUserInfo(Program.MachineNumber, enrollNumber, out name, out password, out privilege, out enabled))
                {
                    PrintLastError($"Could not read user {enrollNumber}");
                    return null;
                }

                string cardNumber = "";
                zk.GetStrCardNumber(out cardNumber);

                var snapshot = new UserSnapshot
                {
                    EnrollNumber = enrollNumber,
                    Name = name,
                    Password = password,
                    Privilege = privilege,
                    Enabled = enabled,
                    CardNumber = cardNumber
                };

                if (!Program.SyncFingerprintTemplates)
                {
                    Program.Log($"[Sync] Fingerprint template read skipped for user {enrollNumber}; SDK template APIs are disabled to prevent AccessViolation crashes.");
                    return snapshot;
                }

                zk.ReadUserAllTemplate(Program.MachineNumber, enrollNumber);
                for (int fingerIndex = 0; fingerIndex < 10; fingerIndex++)
                {
                    Program.Log($"[Sync] Template read for user {enrollNumber}, finger {fingerIndex} is disabled in this build.");
                }

                return snapshot;
            }
        }

        public bool WriteUserSnapshot(UserSnapshot snapshot)
        {
            lock (syncRoot)
            {
                if (!IsConnected)
                {
                    return false;
                }

                bool ok = true;
                try
                {
                    zk.EnableDevice(Program.MachineNumber, false);

                    if (!string.IsNullOrWhiteSpace(snapshot.CardNumber))
                    {
                        zk.SetStrCardNumber(snapshot.CardNumber);
                    }

                    ok = zk.SSR_SetUserInfo(
                        Program.MachineNumber,
                        snapshot.EnrollNumber,
                        snapshot.Name ?? "",
                        snapshot.Password ?? "",
                        snapshot.Privilege,
                        snapshot.Enabled);

                    foreach (FingerprintTemplate template in snapshot.Fingerprints)
                    {
                        bool templateOk = zk.SSR_SetUserTmpStr(
                            Program.MachineNumber,
                            snapshot.EnrollNumber,
                            template.FingerIndex,
                            template.TemplateData);
                        if (!templateOk)
                        {
                            templateOk = zk.SetUserTmpExStr(
                                Program.MachineNumber,
                                snapshot.EnrollNumber,
                                template.FingerIndex,
                                template.Flag,
                                template.TemplateData);
                        }

                        ok = ok && templateOk;
                    }

                    zk.RefreshData(Program.MachineNumber);
                }
                catch (Exception ex)
                {
                    ok = false;
                    Program.Log($"[{Ip}] Sync exception: {ex.Message}");
                }
                finally
                {
                    zk.EnableDevice(Program.MachineNumber, true);
                }

                if (!ok)
                {
                    PrintLastError($"Write user {snapshot.EnrollNumber} failed");
                }

                return ok;
            }
        }

        public bool CopyFingerprintTo(DeviceConnection target, string enrollNumber, string method)
        {
            if (string.Equals(method, "ssr15", StringComparison.OrdinalIgnoreCase))
            {
                return CopyFingerprintSsrStringTo(target, enrollNumber, new[] { 15 });
            }

            if (string.Equals(method, "tablev10", StringComparison.OrdinalIgnoreCase))
            {
                return CopyFingerprintTableV10To(target, enrollNumber);
            }

            if (string.Equals(method, "ssr0-9", StringComparison.OrdinalIgnoreCase))
            {
                return CopyFingerprintSsrStringTo(target, enrollNumber, Enumerable.Range(0, 10));
            }

            if (string.Equals(method, "enroll0-9", StringComparison.OrdinalIgnoreCase))
            {
                return CopyFingerprintEnrollDataTo(target, enrollNumber);
            }

            Program.Log($"[Fingerprint] Unknown method {method}.");
            return false;
        }

        private bool CopyFingerprintTableV10To(DeviceConnection target, string enrollNumber)
        {
            lock (syncRoot)
            {
                if (!IsConnected || !target.IsConnected)
                {
                    return false;
                }

                bool copied = false;
                try
                {
                    zk.EnableDevice(Program.MachineNumber, false);
                    target.zk.EnableDevice(Program.MachineNumber, false);
                    zk.BASE64 = 1;
                    zk.ReadMark = true;
                    target.zk.BASE64 = 1;
                    target.zk.ReadMark = true;

                    string buffer = "";
                    int bufferSize = 10 * 1024 * 1024;
                    bool got = zk.SSR_GetDeviceData(
                        Program.MachineNumber,
                        out buffer,
                        bufferSize,
                        "templatev10",
                        "*",
                        "Pin=" + enrollNumber,
                        "");

                    if (!got || string.IsNullOrWhiteSpace(buffer))
                    {
                        Program.Log($"[Fingerprint] templatev10 returned no data for user {enrollNumber} from {Ip}.");
                        return false;
                    }

                    Program.Log($"[Fingerprint] templatev10 raw length={buffer.Length}, preview={Preview(buffer, 240)}");
                    string data = NormalizeDeviceDataRows(buffer);
                    if (string.IsNullOrWhiteSpace(data))
                    {
                        Program.Log($"[Fingerprint] templatev10 data for user {enrollNumber} was empty after normalization.");
                        return false;
                    }

                    copied = target.zk.SSR_SetDeviceData(
                        Program.MachineNumber,
                        "templatev10",
                        data,
                        "");

                    Program.Log(copied
                        ? $"[Fingerprint] Copied templatev10 data for user {enrollNumber}, bytes={data.Length}, target={target.Ip}"
                        : $"[Fingerprint] Failed setting templatev10 data for user {enrollNumber}, target={target.Ip}");

                    target.zk.RefreshData(Program.MachineNumber);
                }
                finally
                {
                    target.zk.EnableDevice(Program.MachineNumber, true);
                    zk.EnableDevice(Program.MachineNumber, true);
                }

                return copied;
            }
        }

        private static string NormalizeDeviceDataRows(string buffer)
        {
            string[] lines = buffer
                .Replace("\r\n", "\n")
                .Replace('\r', '\n')
                .Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim())
                .Where(line => line.Length > 0)
                .ToArray();

            var rows = new List<string>();
            foreach (string line in lines)
            {
                if (line.IndexOf("Template=", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    line.IndexOf("Pin=", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    rows.Add(line);
                }
            }

            if (rows.Count == 0 && lines.Length >= 2 && lines[0].Contains(","))
            {
                string[] headers = lines[0].Split(',').Select(header => header.Trim()).ToArray();
                for (int i = 1; i < lines.Length; i++)
                {
                    string[] values = SplitCsvLine(lines[i]).ToArray();
                    if (values.Length == 0)
                    {
                        continue;
                    }

                    var parts = new List<string>();
                    for (int j = 0; j < headers.Length && j < values.Length; j++)
                    {
                        if (headers[j].Length == 0)
                        {
                            continue;
                        }

                        parts.Add(headers[j] + "=" + values[j]);
                    }

                    string row = string.Join("\t", parts);
                    if (row.IndexOf("Template=", StringComparison.OrdinalIgnoreCase) >= 0 &&
                        row.IndexOf("Pin=", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        rows.Add(row);
                    }
                }
            }

            return rows.Count == 0 ? "" : string.Join("\r\n", rows) + "\r\n";
        }

        private static IEnumerable<string> SplitCsvLine(string line)
        {
            var current = new StringBuilder();
            bool inQuotes = false;
            for (int i = 0; i < line.Length; i++)
            {
                char ch = line[i];
                if (ch == '"')
                {
                    inQuotes = !inQuotes;
                    continue;
                }

                if (ch == ',' && !inQuotes)
                {
                    yield return current.ToString().Trim();
                    current.Length = 0;
                    continue;
                }

                current.Append(ch);
            }

            yield return current.ToString().Trim();
        }

        private static string Preview(string value, int maxLength)
        {
            string clean = value.Replace("\r", "\\r").Replace("\n", "\\n");
            return clean.Length <= maxLength ? clean : clean.Substring(0, maxLength) + "...";
        }

        private bool CopyFingerprintSsrStringTo(DeviceConnection target, string enrollNumber, IEnumerable<int> fingerIndexes)
        {
            lock (syncRoot)
            {
                if (!IsConnected || !target.IsConnected)
                {
                    return false;
                }

                bool anyCopied = false;
                try
                {
                    zk.EnableDevice(Program.MachineNumber, false);
                    target.zk.EnableDevice(Program.MachineNumber, false);
                    zk.ReadUserAllTemplate(Program.MachineNumber, enrollNumber);

                    foreach (int fingerIndex in fingerIndexes)
                    {
                        int templateLength = 0;
                        string templateData = "";

                        bool got = zk.SSR_GetUserTmpStr(
                            Program.MachineNumber,
                            enrollNumber,
                            fingerIndex,
                            out templateData,
                            out templateLength);

                        if (!got || string.IsNullOrWhiteSpace(templateData))
                        {
                            Program.Log($"[Fingerprint] No SSR template for user {enrollNumber}, finger {fingerIndex} from {Ip}.");
                            continue;
                        }

                        bool set = target.zk.SetUserTmpExStr(
                            Program.MachineNumber,
                            enrollNumber,
                            fingerIndex,
                            1,
                            templateData);

                        if (!set)
                        {
                            set = target.zk.SSR_SetUserTmpStr(
                                Program.MachineNumber,
                                enrollNumber,
                                fingerIndex,
                                templateData);
                        }

                        Program.Log(set
                            ? $"[Fingerprint] Copied SSR template user {enrollNumber}, finger {fingerIndex}, length={templateLength}, target={target.Ip}"
                            : $"[Fingerprint] Failed SSR template set user {enrollNumber}, finger {fingerIndex}, target={target.Ip}");

                        anyCopied = anyCopied || set;
                    }

                    target.zk.RefreshData(Program.MachineNumber);
                }
                finally
                {
                    target.zk.EnableDevice(Program.MachineNumber, true);
                    zk.EnableDevice(Program.MachineNumber, true);
                }

                return anyCopied;
            }
        }

        private bool CopyFingerprintEnrollDataTo(DeviceConnection target, string enrollNumber)
        {
            lock (syncRoot)
            {
                if (!IsConnected || !target.IsConnected)
                {
                    return false;
                }

                int numericEnrollNumber;
                if (!int.TryParse(enrollNumber, out numericEnrollNumber))
                {
                    Program.Log($"[Fingerprint] User {enrollNumber} is not numeric; GetEnrollDataStr requires numeric user IDs.");
                    return false;
                }

                bool anyCopied = false;
                try
                {
                    zk.EnableDevice(Program.MachineNumber, false);
                    target.zk.EnableDevice(Program.MachineNumber, false);
                    zk.BASE64 = 1;
                    target.zk.BASE64 = 1;

                    for (int backupNumber = 0; backupNumber <= 9; backupNumber++)
                    {
                        int privilege = 0;
                        int password = 0;
                        string enrollData = "";

                        bool got = zk.GetEnrollDataStr(
                            Program.MachineNumber,
                            numericEnrollNumber,
                            Program.MachineNumber,
                            backupNumber,
                            ref privilege,
                            ref enrollData,
                            ref password);

                        if (!got || string.IsNullOrWhiteSpace(enrollData))
                        {
                            continue;
                        }

                        bool set = target.zk.SetEnrollDataStr(
                            Program.MachineNumber,
                            numericEnrollNumber,
                            Program.MachineNumber,
                            backupNumber,
                            privilege,
                            enrollData,
                            password);

                        Program.Log(set
                            ? $"[Fingerprint] Copied user {enrollNumber}, finger {backupNumber}, templateLength={enrollData.Length}, target={target.Ip}"
                            : $"[Fingerprint] Failed setting user {enrollNumber}, finger {backupNumber}, target={target.Ip}");

                        anyCopied = anyCopied || set;
                    }

                    target.zk.RefreshData(Program.MachineNumber);
                }
                finally
                {
                    target.zk.EnableDevice(Program.MachineNumber, true);
                    zk.EnableDevice(Program.MachineNumber, true);
                }

                if (!anyCopied)
                {
                    Program.Log($"[Fingerprint] No fingerprint enroll data copied for user {enrollNumber} from {Ip} to {target.Ip}.");
                }

                return anyCopied;
            }
        }

        private void RegisterHandlers()
        {
            zk.OnAttTransactionEx += OnAttTransactionEx;
            zk.OnEnrollFingerEx += OnEnrollFingerEx;
            zk.OnEnrollFinger += OnEnrollFinger;
            zk.OnNewUser += OnNewUser;
            zk.OnDeleteTemplate += OnDeleteTemplate;
            zk.OnDisConnected += OnDisconnected;
        }

        private void LoadUserNames()
        {
            string enrollNumber = "";
            string name = "";
            string password = "";
            int privilege = 0;
            bool enabled = true;
            int count = 0;

            zk.EnableDevice(Program.MachineNumber, false);
            try
            {
                if (!zk.ReadAllUserID(Program.MachineNumber))
                {
                    PrintLastError("ReadAllUserID failed");
                    return;
                }

                while (zk.SSR_GetAllUserInfo(Program.MachineNumber, out enrollNumber, out name, out password, out privilege, out enabled))
                {
                    Program.UserNames[enrollNumber] = name;
                    count++;
                }
            }
            finally
            {
                zk.EnableDevice(Program.MachineNumber, true);
            }

            Program.Log($"[{Ip}] Loaded {count} users.");
        }

        private void OnAttTransactionEx(string enrollNumber, int isInValid, int attState, int verifyMethod, int year, int month, int day, int hour, int minute, int second, int workCode)
        {
            var attendance = new AttendanceEvent
            {
                EnrollNumber = enrollNumber,
                IsInvalid = isInValid,
                AttState = attState,
                VerifyMethod = verifyMethod,
                Timestamp = new DateTime(year, month, day, hour, minute, second),
                WorkCode = workCode
            };

            AttendanceReceived?.Invoke(this, attendance);
        }

        private void OnEnrollFingerEx(string enrollNumber, int fingerIndex, int actionResult, int templateLength)
        {
            UserEnrollmentChanged?.Invoke(this, enrollNumber, fingerIndex, actionResult, templateLength, "OnEnrollFingerEx");
        }

        private void OnEnrollFinger(int enrollNumber, int fingerIndex, int actionResult, int templateLength)
        {
            UserEnrollmentChanged?.Invoke(this, enrollNumber.ToString(), fingerIndex, actionResult, templateLength, "OnEnrollFinger");
        }

        private void OnNewUser(int enrollNumber)
        {
            UserEnrollmentChanged?.Invoke(this, enrollNumber.ToString(), -1, 0, 0, "OnNewUser");
        }

        private void OnDeleteTemplate(int enrollNumber, int fingerIndex)
        {
            Program.Log($"[Template] Delete from {Ip}: user={enrollNumber}, finger={fingerIndex}");
        }

        private void OnDisconnected()
        {
            Program.Log($"[{Ip}] Device disconnected. Will retry.");
            IsConnected = false;
            LastDisconnectedAtUtc = DateTime.UtcNow;
            nextReconnectAt = DateTime.Now.AddSeconds(5);
        }

        private void PrintLastError(string message)
        {
            int errorCode = 0;
            zk.GetLastError(ref errorCode);
            LastError = $"{message}. SDK error code: {errorCode}";
            Program.Log($"[{Ip}] {LastError}");
        }

    }

    internal sealed class AttendanceEvent
    {
        public string EnrollNumber { get; set; }
        public int IsInvalid { get; set; }
        public int AttState { get; set; }
        public int VerifyMethod { get; set; }
        public DateTime Timestamp { get; set; }
        public int WorkCode { get; set; }
        public string SerialNo
        {
            get
            {
                return string.Join(
                    "-",
                    "zkteco",
                    EnrollNumber,
                    Timestamp.ToString("yyyyMMddHHmmss"),
                    VerifyMethod,
                    AttState,
                    WorkCode);
            }
        }
    }

    internal sealed class UserSnapshot
    {
        public string EnrollNumber { get; set; }
        public string Name { get; set; }
        public string Password { get; set; }
        public int Privilege { get; set; }
        public bool Enabled { get; set; }
        public string CardNumber { get; set; }
        public List<FingerprintTemplate> Fingerprints { get; } = new List<FingerprintTemplate>();
        public bool HasAnyCredential => !string.IsNullOrWhiteSpace(Password) || !string.IsNullOrWhiteSpace(CardNumber) || Fingerprints.Count > 0;
    }

    internal sealed class UserRecord
    {
        public string EnrollNumber { get; set; }
        public string Name { get; set; }
        public int Privilege { get; set; }
        public bool Enabled { get; set; }
    }

    internal sealed class EnrollmentRequest
    {
        public DeviceConnection Source { get; set; }
        public string EnrollNumber { get; set; }
        public int FingerIndex { get; set; }
        public string EventName { get; set; }
    }

    internal sealed class FingerprintTemplate
    {
        public int FingerIndex { get; set; }
        public int Flag { get; set; }
        public string TemplateData { get; set; }
        public int TemplateLength { get; set; }
    }
}
