ZKTeco Standalone - Project Truth Bridge
========================================

REQUIREMENTS:
-------------
- .NET 6.0 SDK or higher
- Windows (x86/x64)
- ZKTeco device on network
- ZKTeco SDK installed (for zkemkeeper.dll COM component)

IMPORTANT RUNTIME TRUTH:
------------------------
This bridge uses .NET Framework 4.8, x86, Interop.zkemkeeper.dll, and the
ZKTeco zkemkeeper.dll COM component. It is a Windows SDK bridge. It cannot run
as a normal Linux Docker container inside the Ubuntu Project Truth VM. Use this
supported topology:

1. Windows container/Windows host sidecar:
   - Build with Dockerfile.windows or docker-compose.windows.yml.
   - Expose port 4371 for /health and /status.
   - Set ZKTECO_WEBHOOK_URL to the VM API, for example:
     http://10.184.38.61:3101/api/zkteco/events
   - Set HRIS API ZKTECO_BRIDGE_STATUS_URL to the sidecar status URL.

SETUP:
------
1. Install ZKTeco SDK from TheSDK.zip (if not already installed)
2. Configure the environment variables below for your devices
3. Ensure device is powered on and connected to network

CONFIGURATION:
--------------
The bridge is configurable without code edits:

    ZKTECO_DEVICE_IPS=10.184.38.10,10.184.38.234,10.184.38.235,10.184.38.9
    ZKTECO_DEVICE_PORT=4370
    ZKTECO_WEBHOOK_URL=http://localhost:3001/api/zkteco/events
    ZKTECO_CONNECT_PASSWORD=0
    ZKTECO_MACHINE_NUMBER=1
    ZKTECO_STATUS_PORT=4371
    ZKTECO_SYNC_FINGERPRINT_TEMPLATES=false
    ZKTECO_BACKFILL_ATTENDANCE_LOGS=true
    ZKTECO_BACKFILL_MAX_EVENTS=100000
    ZKTECO_DRY_RUN_WEBHOOKS=false
    ZKTECO_EXPORT_DEVICE_EVENTS_FILE=

Defaults are Project Truth local defaults. Set ZKTECO_WEBHOOK_URL to
http://host.docker.internal:3001/api/zkteco/events when the bridge runs in a
Windows container and HRIS API runs on the host.

BUILD & RUN:
-----------
STEP 1: Extract SDK and setup DLL
   .\setup.ps1

STEP 2: Build the project
   dotnet build

STEP 3: Run the project
   dotnet run

CHANGE DEVICE IP:
----------------
Set ZKTECO_DEVICE_IPS to a comma-separated list:

    $env:ZKTECO_DEVICE_IPS="10.184.38.10,10.184.38.234"

TROUBLESHOOTING:
---------------
- If connection fails, check:
  * Device IP address is correct
  * Device is on same network
  * Firewall allows port 4370
  * ZKTeco SDK is installed

- If COM reference error:
  * Install ZKTeco SDK
  * Register zkemkeeper.dll manually:
    regsvr32 "C:\Program Files\ZKTeco\ZKEMKEEPER.dll"

WHAT IT DOES:
------------
1. Connects to each configured ZKTeco device over TCP, usually port 4370
2. Registers SDK realtime events with RegEvent
3. Handles OnAttTransactionEx attendance callbacks
4. Pulls stored attendance logs with ReadGeneralLogData/SSR_GetGeneralLogData on startup when backfill is enabled
5. Posts Project Truth JSON to /api/zkteco/events
6. Serves /health and /status on ZKTECO_STATUS_PORT for the HRIS device health contract
7. Logs webhook success/failure and keeps reconnecting boundedly

Set ZKTECO_DRY_RUN_WEBHOOKS=true to read/reconcile devices and count realtime or
backfilled attendance rows without posting anything to HRIS.

Set ZKTECO_EXPORT_DEVICE_EVENTS_FILE to a .jsonl path to write real SDK
attendance transactions as raw Project Truth device-event payloads instead of
posting HTTP. Import that file into HRIS with:

    cd hris-api
    $env:DATABASE_URL="postgresql://postgres:postgres@<VM_LAN_IP>:15433/hris"
    npm run import:zkteco-device-events -- --file <path-to-jsonl> --apply

NEXT STEPS:
----------
- Add HRIS Device rows for each configured IP/port
- Set employees.deviceEmpId to the ZKTeco enroll number
- Verify saved rows in /admin/devices/events?view=saved&source=ZKTECO_EVENT
