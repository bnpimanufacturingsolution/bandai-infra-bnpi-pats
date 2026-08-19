const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcRoot = path.join(root, "src", "hikvision_bio");
const runtimePath = path.join(srcRoot, "runtime_service.cpp");
const lines = fs.readFileSync(runtimePath, "utf8").split(/\n/);

const slice = (from, to) => lines.slice(from - 1, to).join("\n").replace(/\s+$/, "") + "\n";

const files = {
	"runtime/state.inc.cpp": slice(43, 163),
	"acs/status.inc.cpp": slice(47, 75),
	"acs/events.inc.cpp": slice(165, 600),
	"acs/listener.inc.cpp": slice(602, 829),
	"identity/userinfo.inc.cpp": slice(831, 1637),
	"biometric/templates.inc.cpp": slice(1639, 2893),
	"copy/peer.inc.cpp": slice(2895, 3647),
	"spool/hris.inc.cpp": slice(3649, 5400),
	"runtime/session.inc.cpp": slice(5402, 5502),
};

// state currently includes attendance helpers (47-75). Rebuild state without that overlap.
files["runtime/state.inc.cpp"] = [slice(43, 45), slice(77, 163)].join("\n");

const mainBody = slice(5508, lines.length);

for (const [rel, body] of Object.entries(files)) {
	const dest = path.join(srcRoot, rel);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, body);
	console.log("wrote", rel, body.split(/\n/).length, "lines");
}

const mainCpp = `// Hikvision biometric service entry.
// Folder modules below are included into one translation unit so HCNetSDK
// keeps a single login/callback/session list. CLI and JSONL are unchanged.

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

#include "runtime/state.inc.cpp"
#include "acs/status.inc.cpp"
#include "acs/events.inc.cpp"
#include "acs/listener.inc.cpp"
#include "identity/userinfo.inc.cpp"
#include "biometric/templates.inc.cpp"
#include "copy/peer.inc.cpp"
#include "spool/hris.inc.cpp"
#include "runtime/session.inc.cpp"

}  // namespace hikvision_bio

using namespace hikvision_bio;

${mainBody}
`;

fs.writeFileSync(path.join(srcRoot, "main.cpp"), mainCpp);
console.log("wrote main.cpp");
