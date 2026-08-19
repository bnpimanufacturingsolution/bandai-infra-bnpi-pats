# Hikvision C++ real units + rollback (2026-08-19)

Status: `IMPLEMENTED_SOURCE` + `PROVEN_STALE_DEPLOY`. Scratch VM `g++` of the 10 units **passed** 2026-08-19 04:58 UTC. The **running** listener was **not** replaced (still 2026-08-13 monolith). GitOps pull is 403 (GitHub account suspended).

Operator goal: easy to maintain, same product, **easy to roll back** if the new units fail to compile or the listener misbehaves.

Canonical paths: `vendor/hikvision-linux/include/hikvision_bio/` + `vendor/hikvision-linux/src/hikvision_bio/`.
Binary name unchanged: `hikvision-biometric-service`.

## What changed

| SHA | Date (Manila) | What |
|---|---|---|
| `6b670a4` | 2026-08-19 09:55 | **Last known foldered unity layout.** `main.cpp` `#include`s `.inc.cpp`. Build compiles `common.cpp` + `time/device_time.cpp` + `main.cpp`. |
| `66868a2` | 2026-08-19 10:40 | Real TUs: `acs.cpp` `identity.cpp` `fingerprint.cpp` `face.cpp` `copy.cpp` `spool.cpp` `runtime.cpp` `time.cpp` + matching headers. Deletes `.inc.cpp` dumps. |
| `301ebb5` | 2026-08-19 10:44 | Header signatures match real multi-arg functions (`alarm_callback`, face write/read, `write_peer_fingerprints`, `fingerprint_callback`). |

Current `develop` tip for this pack is `301ebb5` (or later if only docs/wrapper follow).

| Topic | Open this |
|---|---|
| ACS callback / JSON | `src/hikvision_bio/acs.cpp` |
| UserInfo / person | `identity.cpp` |
| Fingerprint | `fingerprint.cpp` |
| Face / stored-face | `face.cpp` |
| Peer copy | `copy.cpp` |
| HRIS POST / spool | `spool.cpp` |
| Time GET/SET | `time.cpp` + `include/hikvision_bio/time.hpp` |
| Shared state | `include/hikvision_bio/runtime.hpp` |
| CLI | `main.cpp` |

CLI/JSONL intended unchanged: `--get-time` / `--set-time`, `device_time_read` / `device_time_write`, `CST-8:00:00`, `execute=false` default, no NTP.

## Proven vs not

| Claim | Status | Evidence |
|---|---|---|
| Layout / no leftover `.inc.cpp` | Proven | `vendor/hikvision-linux/src/hikvision_bio/` is 10 `.cpp` files |
| Mocha time-sync + biometric | Proven | 37 passing |
| Python `test_probe.py` | Proven | 17/17 |
| Header vs other-TU call sites | Static match | audit 2026-08-19; defaults only on `runtime.hpp` |
| Linux `g++` + HCNetSDK link | **Passed** (scratch dir) | `/tmp/hikvision-units-proof/build/hikvision-biometric-service` 2026-08-19 04:58 UTC |
| VM listener serving this SHA | **No** | ELF + wrapper still **2026-08-13**; `/opt` still monolith |
| GitOps updating `/opt` | **No** | `ansible-pull` 403 `Your account is suspended` |
| Live panel time / callback | Still the **Aug 13** binary | process `ActiveEnterTimestamp=2026-08-13 06:59 UTC` |

## Soft fail (listener)

`scripts/project-truth-hikvision-hot-reload-listener.sh` is `set -e`. A failed rebuild used to abort the whole wrapper (no listener). After the companion wrapper change, a failed `g++` **keeps the last executable** at:

```text
/home/infra/project-truth-hikvision-biometric-service/build/hikvision-biometric-service
```

and logs `hikvision rebuild failed; keeping existing binary`. If there is no previous ELF, start still fails.

That is **not** a source rollback. It only keeps devices armed on the previous binary until you revert git or fix compile.

## Hard rollback (restore last unity layout)

Last good **source** before real TUs: **`6b670a4`**.

On the Windows repo (`develop`):

```powershell
git revert --no-edit 301ebb5
git revert --no-edit 66868a2
git push origin develop
```

If later commits sit on top of `301ebb5`, revert those first (newest → oldest), or only restore the vendor tree:

```powershell
git checkout 6b670a4 -- vendor/hikvision-linux
```

Then also restore tests/docs that assert the new paths, or mocha will fail. Prefer the two `git revert` commits.

After push, on the VM the hot-reload wrapper copies `include/` + `src/` and rebuilds. Confirm:

```text
g++ ... -o .../hikvision-biometric-service
# wrapper log: no "rebuild failed"
# binary still named hikvision-biometric-service
```

Do **not** roll back to `ad98250` (monolith) unless `6b670a4` itself is broken. `ad98250` is the last single-file `hikvision_biometric_service.cpp`.

## How to see a compile failure

On the VM (when LAN SSH works):

```text
ssh -i %USERPROFILE%\.ssh\node-health-appliance_ed25519 infra@10.184.37.19
# then:
HIKVISION_LINUX_SDK_ROOT=/home/infra/project-truth-hcnetsdk/EN-HCNetSDKV6.1.9.48_build20230410_linux64 \
  bash /opt/project-truth/vendor/hikvision-linux/scripts/build-hikvision-biometric-service.sh
```

`SOURCE_ROOT` default is `/opt/project-truth/vendor/hikvision-linux`.

## Do not do

| Action | Why |
|---|---|
| Enable NTP as part of rollback | Out of scope; rec `REC-20260819-HIKVISION-DEVICE-NTP-FLEET` stays Proposed |
| Invent that live time-sync already works | VM rebuild not proven |
| Leave `.inc.cpp` and real `.cpp` both on disk | Confusing; pick one layout |

## Related

- Vendor README layout + rollback: `vendor/hikvision-linux/README.md`
- Runtime owner: `docs/HIKVISION_RUNTIME_TRUTH.md`
- Time button: `.wwg/reports/hikvision-biometric-time-manila-20260819.md`
