# SDK callback / socket wire truth (always on)

Auto-loaded from `.grok/rules/`. Complements `evidence-over-assumption` and root `AGENTS.md`.

## Hard ban: inventing callback person id

Do **not** claim that create/enroll ACS callbacks “always” carry plain person id (`15`).

### Proven wire path (must re-read code when changing this)

1. C++ `alarm_callback` sets person id **only** from:
   `acs->struAcsEventInfo.dwEmployeeNo > 0 ? to_string(dwEmployeeNo) : ""`
2. `build_hikvision_callback_json` copies that into **both** `employeeNo` and `employeeNoString`.
3. First `device-event:saved` socket shows **exactly** what was saved on that POST.
4. Live evidence: major=`3` enroll often has **empty** `employeeNo`; major=`5` taps often have plain id; logSearch leaves often carry **opaque** tokens, not plain `15`.

If you did not open those files / evidence in this session, label claims `NEEDS_CONFIRMATION`.

## How to find truth (required before “always plain on socket”)

1. Open `vendor/hikvision-linux/src/hikvision_bio/acs.cpp` — `alarm_callback`, `build_hikvision_callback_json`. Time GET/SET is `src/hikvision_bio/time.cpp`.
2. Open recent `.runtime/*` SDK/listener logs or saved DeviceEvent payload samples.
3. Quote: major/minor, `employeeNo` empty vs plain vs opaque.
4. Only then plan C++ enrich, HRIS multipass, or UI copy.

## Correct product expectation

| Event family | First ACS packet | Plain id on first socket | Templates |
|---|---|---|---|
| Attendance tap (major 5) | Often has `dwEmployeeNo` | Yes when SDK fills it | N/A |
| Panel create / FP enroll (often major 3) | Often `dwEmployeeNo=0` | Only after C++ inventory enrich or HRIS multipass | Must be read after plain id known |
| logSearch `addUserInfo` / `addFp…` | Opaque token common | After opaque→plain map | Separate read/export |

## Agent behavior when user wants “always plain on socket”

- Prefer **C++ enrich before POST** (inventory delta → set `employeeNo` → optional FP/face template read → POST).
- Do not pretend React socket invented identity the SDK never sent.
- Do not store opaque tokens as `DeviceEvent.employeeNo`.
- Prove with live JSON/logs after change.

## Related

- Principle: `.wwg/wiki/principles/evidence-over-assumption.md`
- Spec: `docs/HIKVISION_ENROLLMENT_IDENTITY_FLOW.md`
