import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { PrismaClient } from "../generated/prisma";

type ReportRow = {
	no: number;
	employeeId: string;
	employee: string;
	section: string;
	position: string;
	deviceUserId: string;
	status: "Enrolled" | "Not enrolled";
	matchSource: string;
};

type Summary = {
	generatedAt: string;
	generatedAtIso: string;
	deviceScope: string;
	statusDefinition: string;
	totalDirectEmployees: number;
	enrolled: number;
	notEnrolled: number;
	liveUniqueDeviceUsers: number;
	deviceIdRecords: number;
	matchedToDirectEmployees: number;
	unmatchedLiveDeviceIds: number;
	missingHrisLinks: number;
	staleSavedHrisOnlyUniqueIds: number;
};

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const planFileArg = process.argv.find((arg) => arg.startsWith("--plan-file="));
const planFilePath = planFileArg ? path.resolve(planFileArg.slice("--plan-file=".length)) : "";
const outputRoot = path.resolve(__dirname, "..", "..", ".runtime");
const selectedDeviceAddresses = [
	"10.184.37.20",
	"10.184.37.21",
	"10.184.37.22",
	"10.184.37.23",
	"192.168.254.109",
	"192.168.254.110",
];
const excludedDevEmployeeIds = new Set(["EMP001", "EMP002", "EMP003", "EMP004", "EMP005"]);
const apiBaseUrl = process.env.HRIS_REPORT_API_BASE_URL || "http://localhost:3001";
const adminEmail = process.env.HRIS_REPORT_ADMIN_EMAIL || "admin@bandai.local";
const adminPassword = process.env.HRIS_REPORT_ADMIN_PASSWORD || "password123";
const appCode = process.env.HRIS_REPORT_APP_CODE || "hris";
const bandaiLogoPath = path.resolve(__dirname, "..", "..", "hris-app", "app", "assets", "bandai_logo.png");
const regularFontPath = "C:\\Windows\\Fonts\\arial.ttf";
const boldFontPath = "C:\\Windows\\Fonts\\arialbd.ttf";

const text = (value: unknown) => String(value ?? "").trim();
const unpadNumeric = (value: string) => {
	const clean = text(value);
	if (!/^\d+$/.test(clean)) return clean;
	return clean.replace(/^0+/, "") || "0";
};
const sortDeviceUserIds = (a: string, b: string) =>
	a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const stamp = () => {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const formatGeneratedAt = (date: Date) => {
	const formatted = new Intl.DateTimeFormat("en-PH", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(date);
	return `${formatted} PHT`;
};

const employeeName = (employee: any) => {
	const info = employee?.person?.personalInfo && typeof employee.person.personalInfo === "object" ? employee.person.personalInfo : {};
	return [info.firstName, info.middleName, info.lastName, info.suffix]
		.map(text)
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim() || text(employee?.employeeId);
};

const postJson = async (url: string, body: unknown, token?: string) => {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
	}
	return data;
};

const fetchMergePlan = async (deviceIds: string[]) => {
	if (planFilePath) {
		const raw = fs.readFileSync(planFilePath, "utf8").replace(/^\uFEFF/, "");
		const parsed = JSON.parse(raw);
		const plan = parsed?.data?.plan || parsed?.data || parsed;
		if (!Array.isArray(plan?.users)) throw new Error("Plan file did not contain users");
		return plan;
	}
	const login = await postJson(`${apiBaseUrl}/api/auth/login`, {
		email: adminEmail,
		password: adminPassword,
		appCode,
	});
	const token = login?.data?.token;
	if (!token) throw new Error("Admin login did not return a token");
	const result = await postJson(
		`${apiBaseUrl}/api/device/hikvision/sdk-users/merge/plan`,
		{ execute: false, dryRun: true, deviceIds },
		token,
	);
	const plan = result?.data?.plan || result?.data;
	if (!Array.isArray(plan?.users)) throw new Error("Merge plan did not return users");
	return plan;
};

const buildRows = async (): Promise<{ rows: ReportRow[]; summary: Summary; devices: any[]; planCounts: any }> => {
	const now = new Date();
	const devices = await prisma.device.findMany({
		where: { isDeleted: false, address: { in: selectedDeviceAddresses } },
		select: { id: true, name: true, address: true },
		orderBy: [{ name: "asc" }],
	});
	if (devices.length !== selectedDeviceAddresses.length) {
		throw new Error(`Expected ${selectedDeviceAddresses.length} selected devices, found ${devices.length}`);
	}

	const directEmployees = await prisma.employee.findMany({
		where: {
			isDeleted: false,
			workforceSource: "DIRECT",
			agencyId: null,
			employeeId: { notIn: [...excludedDevEmployeeIds] },
		},
		select: {
			id: true,
			employeeId: true,
			deviceEmpId: true,
			person: { select: { personalInfo: true } },
			section: { select: { name: true } },
			position: { select: { title: true } },
		},
		orderBy: [{ employeeId: "asc" }],
	});
	const directById = new Map(directEmployees.map((employee: any) => [employee.id, employee]));
	const candidateOwners = new Map<string, Set<string>>();
	for (const employee of directEmployees as any[]) {
		const candidates = new Set<string>();
		if (text(employee.deviceEmpId)) candidates.add(text(employee.deviceEmpId));
		if (text(employee.employeeId)) {
			candidates.add(text(employee.employeeId));
			candidates.add(unpadNumeric(employee.employeeId));
		}
		for (const candidate of candidates) {
			if (!candidate) continue;
			const owners = candidateOwners.get(candidate) || new Set<string>();
			owners.add(employee.id);
			candidateOwners.set(candidate, owners);
		}
	}
	const unambiguousCandidateToEmployeeId = new Map<string, string>();
	for (const [candidate, owners] of candidateOwners.entries()) {
		if (owners.size === 1) unambiguousCandidateToEmployeeId.set(candidate, [...owners][0]);
	}

	const plan = await fetchMergePlan(devices.map((device) => device.id));
	const liveDeviceUserIds = new Set<string>();
	const liveByEmployeeId = new Map<string, { ids: Set<string>; matchSource: string }>();
	for (const user of plan.users || []) {
		const vendorIds = (user.vendorUserIds || [])
			.map(text)
			.filter(Boolean)
			.sort(sortDeviceUserIds);
		const fallbackId = text(user.key).replace(/^vendor:/, "");
		if (!vendorIds.length && fallbackId) vendorIds.push(fallbackId);
		for (const vendorId of vendorIds) liveDeviceUserIds.add(vendorId);

		const linkedEmployeeId = text(user.employeeId);
		let employeeId = directById.has(linkedEmployeeId) ? linkedEmployeeId : "";
		let matchSource = employeeId ? "merge-plan employee link" : "";
		if (!employeeId) {
			const candidateMatches = new Set(
				vendorIds
					.map((vendorId) => unambiguousCandidateToEmployeeId.get(vendorId) || unambiguousCandidateToEmployeeId.get(unpadNumeric(vendorId)) || "")
					.filter(Boolean),
			);
			if (candidateMatches.size === 1) {
				employeeId = [...candidateMatches][0];
				matchSource = "live ID matched Employee.deviceEmpId/employeeId";
			}
		}
		if (!employeeId) continue;
		const current = liveByEmployeeId.get(employeeId) || { ids: new Set<string>(), matchSource };
		for (const vendorId of vendorIds) current.ids.add(vendorId);
		if (current.matchSource !== "merge-plan employee link" && matchSource === "merge-plan employee link") {
			current.matchSource = matchSource;
		}
		liveByEmployeeId.set(employeeId, current);
	}

	const rows = (directEmployees as any[]).map((employee, index): ReportRow => {
		const live = liveByEmployeeId.get(employee.id);
		return {
			no: index + 1,
			employeeId: text(employee.employeeId),
			employee: employeeName(employee),
			section: text(employee.section?.name),
			position: text(employee.position?.title),
			deviceUserId: live ? [...live.ids].sort(sortDeviceUserIds).join(", ") : "",
			status: live ? "Enrolled" : "Not enrolled",
			matchSource: live?.matchSource || "",
		};
	});

	const savedRows = await prisma.deviceUser.findMany({
		where: { deviceId: { in: devices.map((device) => device.id) } },
		select: { vendorUserId: true },
	});
	const savedUnique = new Set(savedRows.map((row) => text(row.vendorUserId)).filter(Boolean));
	const staleSavedHrisOnlyUniqueIds = [...savedUnique].filter((id) => !liveDeviceUserIds.has(id)).length;
	const enrolled = rows.filter((row) => row.status === "Enrolled").length;
	const matchedLiveIds = new Set<string>();
	for (const row of rows) {
		if (row.status !== "Enrolled") continue;
		for (const id of row.deviceUserId.split(",").map(text).filter(Boolean)) matchedLiveIds.add(id);
	}

	const summary: Summary = {
		generatedAt: formatGeneratedAt(now),
		generatedAtIso: now.toISOString(),
		deviceScope: devices.map((device) => `${device.name} (${device.address})`).join("; "),
		statusDefinition: "Enrolled = direct employee has a live unique device user ID on at least one selected available device. This is not a claim that every device is fully merged or biometrics are complete on all devices.",
		totalDirectEmployees: rows.length,
		enrolled,
		notEnrolled: rows.length - enrolled,
		liveUniqueDeviceUsers: plan.users.length,
		deviceIdRecords: Number(plan.counts?.dedupedDeviceRecords || plan.counts?.sourceRows || 0),
		matchedToDirectEmployees: enrolled,
		unmatchedLiveDeviceIds: Math.max(0, liveDeviceUserIds.size - matchedLiveIds.size),
		missingHrisLinks: Number(plan.counts?.missingHrisLinks || plan.counts?.notLinkedInHris || 0),
		staleSavedHrisOnlyUniqueIds,
	};
	return { rows, summary, devices, planCounts: plan.counts || {} };
};

const writeCsv = (filePath: string, rows: ReportRow[]) => {
	const headers = ["#", "EMPLOYEE ID", "FULL NAME", "SECTION", "POSITION", "DEVICE USER ID", "STATUS"];
	const escape = (value: unknown) => {
		const raw = text(value);
		return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
	};
	const lines = [
		headers.join(","),
		...rows.map((row) => [
			row.no,
			row.employeeId,
			row.employee,
			row.section,
			row.position,
			row.deviceUserId,
			row.status,
		].map(escape).join(",")),
	];
	fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
};

const writeExcel = async (
	filePath: string,
	rows: ReportRow[],
	summary: Summary,
	title = "BNPI Live Device ID Enrollment Report",
	subtitle = "Selected available devices. Status is based on live unique device IDs before merge completion.",
) => {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Bandai HRIS";
	const sheet = workbook.addWorksheet("Employees", { views: [{ state: "frozen", ySplit: 7 }] });
	sheet.mergeCells("B1:E1");
	sheet.getCell("B1").value = title;
	sheet.getCell("B1").font = { bold: true, size: 15 };
	sheet.getCell("B2").value = subtitle;
	sheet.getCell("B2").font = { size: 10, color: { argb: "FF374151" } };
	sheet.getCell("B3").value = `Generated: ${summary.generatedAt}`;
	sheet.getCell("B4").value = `Total direct employees: ${summary.totalDirectEmployees}   Enrolled: ${summary.enrolled}   Not enrolled: ${summary.notEnrolled}`;
	sheet.getCell("B4").font = { bold: true, size: 10 };
	sheet.getCell("B5").value = `Live unique device IDs: ${summary.liveUniqueDeviceUsers}   Device ID records: ${summary.deviceIdRecords}   Unmatched/non-direct live IDs: ${summary.unmatchedLiveDeviceIds}`;
	sheet.getCell("B5").font = { size: 10, color: { argb: "FF92400E" } };
	sheet.getCell("B6").value = summary.statusDefinition;
	sheet.getCell("B6").font = { italic: true, size: 9, color: { argb: "FF374151" } };
	sheet.columns = [
		{ key: "no", width: 8 },
		{ key: "employeeId", width: 16 },
		{ key: "employee", width: 34 },
		{ key: "section", width: 24 },
		{ key: "position", width: 30 },
		{ key: "deviceUserId", width: 18 },
		{ key: "status", width: 18 },
	];
	sheet.spliceRows(8, 0, ["#", "EMPLOYEE ID", "FULL NAME", "SECTION", "POSITION", "DEVICE USER ID", "STATUS"]);
	sheet.getRow(8).font = { bold: true, color: { argb: "FF111827" } };
	sheet.getRow(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
	sheet.getRow(8).height = 22;
	for (const row of rows) {
		sheet.addRow({
			no: row.no,
			employeeId: row.employeeId,
			employee: row.employee,
			section: row.section,
			position: row.position,
			deviceUserId: row.deviceUserId,
			status: row.status,
		});
	}
	sheet.eachRow((row) => {
		row.eachCell((cell) => {
			cell.border = {
				top: { style: "thin", color: { argb: "FFE5E7EB" } },
				bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
			};
			cell.alignment = { vertical: "middle" };
		});
	});
	sheet.autoFilter = { from: "A8", to: `G${rows.length + 8}` };
	await workbook.xlsx.writeFile(filePath);
};

const writePdf = async (
	filePath: string,
	rows: ReportRow[],
	summary: Summary,
	title = "BNPI Live Device ID Enrollment Report",
	subtitle = "Selected available devices. Status is live unique device ID presence before merge completion.",
) => {
	const doc = new PDFDocument({ size: "LEGAL", layout: "landscape", margin: 28 });
	await new Promise<void>((resolve, reject) => {
		const stream = fs.createWriteStream(filePath);
		stream.on("finish", resolve);
		stream.on("error", reject);
		doc.on("error", reject);
		doc.pipe(stream);
		if (fs.existsSync(regularFontPath)) doc.registerFont("Report-Regular", regularFontPath);
		if (fs.existsSync(boldFontPath)) doc.registerFont("Report-Bold", boldFontPath);
		const regularFont = fs.existsSync(regularFontPath) ? "Report-Regular" : "Helvetica";
		const boldFont = fs.existsSync(boldFontPath) ? "Report-Bold" : "Helvetica-Bold";
		const cols = [
			{ key: "no", label: "#", x: 28, w: 34, align: "right" },
			{ key: "employeeId", label: "EMPLOYEE ID", x: 62, w: 70, align: "left" },
			{ key: "employee", label: "FULL NAME", x: 132, w: 220, align: "left" },
			{ key: "section", label: "SECTION", x: 352, w: 130, align: "left" },
			{ key: "position", label: "POSITION", x: 482, w: 150, align: "left" },
			{ key: "deviceUserId", label: "DEVICE USER ID", x: 632, w: 88, align: "left" },
			{ key: "status", label: "STATUS", x: 720, w: 98, align: "left" },
		];
		const rowHeight = 20;
		const pageBottom = () => doc.page.height - doc.page.margins.bottom;
		const drawCell = (value: unknown, x: number, y: number, w: number, h: number, opts: any = {}) => {
			const restoreY = doc.y;
			if (opts.fill) doc.rect(x, y, w, h).fill(opts.fill);
			doc.rect(x, y, w, h).strokeColor("#D1D5DB").lineWidth(0.4).stroke();
			doc.font(opts.bold ? boldFont : regularFont).fontSize(opts.size || 7).fillColor(opts.color || "#111827").text(text(value) || "-", x + 4, y + 5, {
				width: w - 8,
				height: h - 7,
				align: opts.align || "left",
				ellipsis: true,
			});
			doc.y = restoreY;
		};
		const header = () => {
			for (const col of cols) drawCell(col.label, col.x, doc.y, col.w, 22, { fill: "#FEE2E2", bold: true, align: col.align });
			doc.y += 22;
		};
		const brandY = doc.y;
		if (fs.existsSync(bandaiLogoPath)) doc.image(bandaiLogoPath, 28, brandY, { width: 148 });
		doc.font(boldFont).fontSize(15).fillColor("#111827").text(title, 194, brandY + 2);
		doc.font(regularFont).fontSize(8.5).fillColor("#374151").text(subtitle, 194, brandY + 21);
		doc.y = brandY + 52;
		doc.font(regularFont).fontSize(8.5).fillColor("#111827").text(`Generated ${summary.generatedAt}`, 28, doc.y);
		doc.font(boldFont).fontSize(9).text(`Total direct employees: ${summary.totalDirectEmployees}   Enrolled: ${summary.enrolled}   Not enrolled: ${summary.notEnrolled}`, 28, doc.y + 4);
		doc.font(regularFont).fontSize(8).fillColor("#92400E").text(`Live unique device IDs: ${summary.liveUniqueDeviceUsers}   Device ID records: ${summary.deviceIdRecords}   Unmatched/non-direct live IDs: ${summary.unmatchedLiveDeviceIds}`, 28, doc.y + 18);
		doc.font(regularFont).fontSize(7.2).fillColor("#374151").text(summary.statusDefinition, 28, doc.y + 32, { width: 790, height: 18, ellipsis: true });
		doc.moveDown(2.4);
		header();
		for (const row of rows) {
			if (doc.y + rowHeight > pageBottom()) {
				doc.addPage();
				header();
			}
			for (const col of cols) {
				drawCell((row as any)[col.key], col.x, doc.y, col.w, rowHeight, {
					align: col.align,
					color: row.status === "Enrolled" ? "#065F46" : "#92400E",
				});
			}
			doc.y += rowHeight;
		}
		doc.end();
	});
};

async function main() {
	const { rows, summary, devices, planCounts } = await buildRows();
	if (dryRun) {
		console.log(JSON.stringify({ mode: "dry-run", summary, devices, planCounts, sample: rows.slice(0, 10) }, null, 2));
		return;
	}
	const outDir = path.join(outputRoot, `live-unique-device-enrollment-${stamp()}`);
	fs.mkdirSync(outDir, { recursive: true });
	const jsonPath = path.join(outDir, "live-unique-device-enrollment.json");
	const csvPath = path.join(outDir, "live-unique-device-enrollment.csv");
	const xlsxPath = path.join(outDir, "live-unique-device-enrollment.xlsx");
	const pdfPath = path.join(outDir, "live-unique-device-enrollment.pdf");
	const notEnrolledRows = rows
		.filter((row) => row.status === "Not enrolled")
		.map((row, index) => ({ ...row, no: index + 1 }));
	const notEnrolledJsonPath = path.join(outDir, "live-unique-device-not-enrolled.json");
	const notEnrolledCsvPath = path.join(outDir, "live-unique-device-not-enrolled.csv");
	const notEnrolledXlsxPath = path.join(outDir, "live-unique-device-not-enrolled.xlsx");
	const notEnrolledPdfPath = path.join(outDir, "live-unique-device-not-enrolled.pdf");
	fs.writeFileSync(jsonPath, `${JSON.stringify({ summary, devices, planCounts, rows }, null, 2)}\n`, "utf8");
	fs.writeFileSync(notEnrolledJsonPath, `${JSON.stringify({ summary, devices, planCounts, rows: notEnrolledRows }, null, 2)}\n`, "utf8");
	writeCsv(csvPath, rows);
	writeCsv(notEnrolledCsvPath, notEnrolledRows);
	await writeExcel(xlsxPath, rows, summary);
	await writePdf(pdfPath, rows, summary);
	await writeExcel(
		notEnrolledXlsxPath,
		notEnrolledRows,
		summary,
		"BNPI Not Enrolled Live Device ID Report",
		"Direct employees not found on the selected available devices by live unique device ID.",
	);
	await writePdf(
		notEnrolledPdfPath,
		notEnrolledRows,
		summary,
		"BNPI Not Enrolled Live Device ID Report",
		"Direct employees not found on the selected available devices by live unique device ID.",
	);
	console.log(JSON.stringify({
		mode: "generated",
		summary,
		artifacts: {
			jsonPath,
			csvPath,
			xlsxPath,
			pdfPath,
			notEnrolledJsonPath,
			notEnrolledCsvPath,
			notEnrolledXlsxPath,
			notEnrolledPdfPath,
		},
	}, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());
