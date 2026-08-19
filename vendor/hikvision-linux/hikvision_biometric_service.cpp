// Compatibility marker only. Do not add Hikvision runtime code here.
//
// Layout:
//   include/hikvision_bio/   public headers (types, stdxml, device time)
//   src/hikvision_bio/       common.cpp, device_time.cpp, runtime_service.cpp
//
// Build: scripts/build-hikvision-biometric-service.sh
// Binary: build/hikvision-biometric-service
// CLI/JSONL contract is unchanged.

#error "Build hikvision-biometric-service from src/hikvision_bio via scripts/build-hikvision-biometric-service.sh"
