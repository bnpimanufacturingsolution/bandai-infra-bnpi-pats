const { io } = require("socket.io-client");
const token = process.env.TOKEN;
const orgId = process.env.ORG_ID;
const started = Date.now();
const hits = [];
const socket = io("http://127.0.0.1:3001", { transports: ["websocket"], auth: { token } });
socket.on("connect", () => {
  // FE protocol (hris-api index.ts)
  socket.emit("join:device-events", { organizationId: orgId });
  process.stderr.write("connected " + socket.id + " joined org " + orgId + "\n");
});
socket.on("device-event:saved", (payload) => {
  const event = payload && payload.event ? payload.event : payload;
  const action = event && event.eventAction;
  const emp = event && event.employeeNo;
  if (["USER_CREATED","USER_DELETED","FINGERPRINT_ENROLLED","SYNC_SIGNAL","TAP"].includes(String(action || ""))) {
    hits.push({ action, employeeNo: emp, id: event && event.id, t: Date.now() - started });
    process.stderr.write("hit " + action + " emp=" + (emp || "") + " t=" + (Date.now() - started) + "\n");
  }
});
socket.on("connect_error", (e) => process.stderr.write("connect_error " + e.message + "\n"));
setTimeout(() => {
  const ok = hits.some((h) => h.action === "USER_CREATED" || h.action === "USER_DELETED");
  process.stdout.write(JSON.stringify({ ok, hits, elapsedMs: Date.now() - started, connected: socket.connected }) + "\n");
  try { socket.close(); } catch (_) {}
  process.exit(ok ? 0 : 2);
}, 20000);