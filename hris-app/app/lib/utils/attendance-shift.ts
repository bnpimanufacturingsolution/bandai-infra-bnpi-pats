export type ShiftInfo = {
	shiftKey: string;
	shiftName: string;
	shiftCode: string;
	windowLabel: string; // e.g. "6:00 PM - 6:00 AM" or "6:00 AM - 6:00 PM"
	fullLabel: string; // e.g. "Night Shift (6:00 PM - 6:00 AM)"
	isNightShift: boolean;
};

export type ShiftGroupSummary = ShiftInfo & {
	total: number;
	present: number;
	late: number;
	undertime: number;
	absent: number;
	records: any[];
};

export function formatTimeSlotTime(t?: string | null): string {
	if (!t) return "";
	const clean = String(t).slice(0, 5);
	const [hhStr, mmStr] = clean.split(":");
	const hh = Number(hhStr);
	const mm = Number(mmStr);
	if (Number.isNaN(hh)) return clean;
	const meridiem = hh >= 12 ? "PM" : "AM";
	const h12 = hh % 12 || 12;
	return `${h12}:${String(mm ?? 0).padStart(2, "0")} ${meridiem}`;
}

export function checkIsNightShift(
	shiftName: string,
	windowLabel: string,
	start?: string | null,
	end?: string | null,
): boolean {
	const lowerName = String(shiftName || "").toLowerCase();
	if (lowerName.includes("night") || lowerName.includes("graveyard")) return true;
	if (lowerName.includes("day") || lowerName.includes("morning")) return false;

	if (start && end) {
		const [sH] = String(start).split(":").map(Number);
		const [eH] = String(end).split(":").map(Number);
		if (!Number.isNaN(sH) && !Number.isNaN(eH)) {
			// Starts in evening (>= 17:00) or crosses midnight (sH > eH)
			if (sH >= 17 || sH < 4 || (sH > eH && eH <= 12)) return true;
		}
	}

	// Starts in PM and ends in AM (e.g. "6:00 PM - 6:00 AM")
	if (/\d+:\d+\s*PM\s*-\s*\d+:\d+\s*AM/i.test(windowLabel)) return true;

	return false;
}

export function getRecordShiftInfo(row: any): ShiftInfo {
	const snapshot = row?.scheduleSnapshot || row?.metadata?.scheduleSnapshot || {};
	const name =
		snapshot.shiftTypeName ||
		snapshot.name ||
		snapshot.scheduleTemplateName ||
		snapshot.templateName ||
		"";
	const code =
		snapshot.shiftTypeCode ||
		snapshot.code ||
		snapshot.scheduleTemplateCode ||
		snapshot.templateCode ||
		"";

	let start = snapshot.shiftStartTime || snapshot.startTime;
	let end = snapshot.shiftEndTime || snapshot.endTime;

	if ((!start || !end) && Array.isArray(snapshot.timeSlots) && snapshot.timeSlots.length > 0) {
		start = snapshot.timeSlots[0].startTime;
		end = snapshot.timeSlots[snapshot.timeSlots.length - 1].endTime;
	}

	let windowLabel = "";
	if (start && end) {
		windowLabel = `${formatTimeSlotTime(start)} - ${formatTimeSlotTime(end)}`;
	} else if (name || code) {
		windowLabel = "Standard Schedule";
	} else {
		// Fallback: If no schedule snapshot, infer from clock in / clock out time
		if (row?.timeIn) {
			const inDate = new Date(row.timeIn);
			if (!Number.isNaN(inDate.getTime())) {
				// Manila time offset is UTC+8
				const manilaHour = (inDate.getUTCHours() + 8) % 24;
				if (manilaHour >= 17 || manilaHour < 5) {
					windowLabel = "6:00 PM - 6:00 AM";
				} else {
					windowLabel = "6:00 AM - 6:00 PM";
				}
			} else {
				windowLabel = "Unassigned";
			}
		} else {
			windowLabel = "Unassigned";
		}
	}

	const shiftName =
		name ||
		(code ? `Shift ${code}` : windowLabel !== "Unassigned" ? windowLabel : "Regular Shift");

	const isNight = checkIsNightShift(shiftName, windowLabel, start, end);

	const fullLabel =
		windowLabel &&
		windowLabel !== "Unassigned" &&
		!shiftName.includes(windowLabel) &&
		!windowLabel.includes(shiftName)
			? `${shiftName} (${windowLabel})`
			: shiftName;

	const shiftKey =
		code || (start && end ? `${start}-${end}` : shiftName.toLowerCase().replace(/\s+/g, "-"));

	return {
		shiftKey,
		shiftName,
		shiftCode: code,
		windowLabel,
		fullLabel,
		isNightShift: isNight,
	};
}

export function buildShiftGroupings(
	shiftTypeList: any[],
	detailedRecords: any[],
): ShiftGroupSummary[] {
	const map = new Map<string, ShiftGroupSummary>();

	// 1. Seed with all configured shift types from the organization
	if (Array.isArray(shiftTypeList)) {
		shiftTypeList.forEach((st: any) => {
			if (!st || st.isOff || st.isDeleted) return;
			const name = st.name || (st.code ? `Shift ${st.code}` : "Shift");
			const code = st.code || "";

			let start = st.startTime || st.shiftStartTime;
			let end = st.endTime || st.shiftEndTime;

			if ((!start || !end) && Array.isArray(st.timeSlots) && st.timeSlots.length > 0) {
				start = st.timeSlots[0].startTime;
				end = st.timeSlots[st.timeSlots.length - 1].endTime;
			}

			let windowLabel = "";
			if (start && end) {
				windowLabel = `${formatTimeSlotTime(start)} - ${formatTimeSlotTime(end)}`;
			} else {
				windowLabel = "Standard Schedule";
			}

			const isNight =
				Boolean(st.isOvernight) || checkIsNightShift(name, windowLabel, start, end);
			const fullLabel =
				windowLabel && windowLabel !== "Standard Schedule" && !name.includes(windowLabel)
					? `${name} (${windowLabel})`
					: name;
			const shiftKey = code || (start && end ? `${start}-${end}` : fullLabel);

			map.set(fullLabel, {
				shiftKey,
				shiftName: name,
				shiftCode: code,
				windowLabel,
				fullLabel,
				isNightShift: isNight,
				total: 0,
				present: 0,
				late: 0,
				undertime: 0,
				absent: 0,
				records: [],
			});
		});
	}

	// 2. Aggregate records into shift buckets
	detailedRecords.forEach((row: any) => {
		const shiftInfo = getRecordShiftInfo(row);
		let targetKey = shiftInfo.fullLabel || "Unassigned";

		// Match by shiftCode, windowLabel, or name if already seeded
		if (!map.has(targetKey)) {
			let foundMatchKey: string | null = null;
			for (const [key, group] of map.entries()) {
				if (shiftInfo.shiftCode && group.shiftCode === shiftInfo.shiftCode) {
					foundMatchKey = key;
					break;
				}
				if (
					shiftInfo.windowLabel &&
					shiftInfo.windowLabel !== "Unassigned" &&
					group.windowLabel === shiftInfo.windowLabel
				) {
					foundMatchKey = key;
					break;
				}
				if (shiftInfo.shiftName && group.shiftName === shiftInfo.shiftName) {
					foundMatchKey = key;
					break;
				}
			}
			if (foundMatchKey) {
				targetKey = foundMatchKey;
			} else {
				map.set(targetKey, {
					...shiftInfo,
					total: 0,
					present: 0,
					late: 0,
					undertime: 0,
					absent: 0,
					records: [],
				});
			}
		}

		const group = map.get(targetKey)!;
		group.total += 1;
		group.records.push(row);

		const status = String(row.status || "").toUpperCase();
		if (status === "PRESENT" || row.timeIn) {
			group.present += 1;
		}
		if (status === "LATE" || (row.lateHours && row.lateHours !== "0:00")) {
			group.late += 1;
		}
		if (status === "EARLY_OUT" || (row.undertimeHours && row.undertimeHours !== "0:00")) {
			group.undertime += 1;
		}
		if (status === "ABSENT" || status === "NOT_CLOCKED_IN") {
			group.absent += 1;
		}
	});

	return Array.from(map.values()).sort((a, b) => {
		if (b.total !== a.total) return b.total - a.total;
		return a.shiftName.localeCompare(b.shiftName);
	});
}
