const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "hikvision_biometric_service.cpp");
const destPath = path.join(root, "src", "hikvision_bio", "runtime_service.cpp");

const raw = fs.readFileSync(sourcePath, "utf8");
const lines = raw.split(/\n/);

const drop = (n) =>
	(n >= 38 && n <= 89) ||
	n === 135 ||
	n === 136 ||
	n === 137 ||
	(n >= 211 && n <= 298) ||
	(n >= 914 && n <= 1100);

const kept = [];
for (let i = 0; i < lines.length; i += 1) {
	const n = i + 1;
	if (n <= 34) continue;
	if (drop(n)) continue;
	kept.push(lines[i]);
}

const header = `// Runtime service: ACS listener, identity, FP/face, peer copy, CLI, main.
// Shared SDK helpers live in hikvision_bio/common.cpp.
// Device time GET/SET lives in hikvision_bio/device_time.cpp.

#include <chrono>
#include <cctype>
#include <condition_variable>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <deque>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <regex>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <algorithm>
#include <atomic>
#include <cerrno>
#include <functional>

#include <dirent.h>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>

#include "HCNetSDK.h"
#include "hikvision_bio/types.hpp"
#include "hikvision_bio/common.hpp"
#include "hikvision_bio/device_time.hpp"

namespace hikvision_bio {
`;

const bodyFixed = kept
	.join("\n")
	.replace(/^namespace \{[\r\n]*/, "")
	.replace(/^}  \/\/ namespace$/m, "}  // namespace hikvision_bio\n\nusing namespace hikvision_bio;");

fs.mkdirSync(path.dirname(destPath), { recursive: true });
fs.writeFileSync(destPath, `${header}\n${bodyFixed}\n`);
console.log(`wrote ${destPath} (${bodyFixed.split(/\n/).length} body lines)`);
