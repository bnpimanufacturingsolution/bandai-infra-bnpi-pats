import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { PrismaClient } from "../generated/prisma";

type Row = {
	no: number;
	employeeId: string;
	employee: string;
	deviceUserId: string;
	status: "Enrolled" | "Not enrolled";
	countOfDeviceEnrolled: number;
};

type Summary = {
	generatedAt: string;
	generatedAtIso: string;
	deviceScope: string;
	totalDirectEmployees: number;
	enrolled: number;
	notEnrolled: number;
	totalUniqueDeviceUsers: number;
	linkedToDirectEmployee: number;
	linkedToOtherEmployee: number;
	notLinkedInHris: number;
	deviceIdRecords: number;
	mergeSourceRows: number;
	staleSavedHrisOnlyUniqueIds: number;
};

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const outputRoot = path.resolve(__dirname, "..", "..", ".runtime");
const currentDeviceAddresses = ["10.184.37.20", "10.184.37.21", "10.184.37.22", "10.184.37.23"];
const apiBaseUrl = process.env.HRIS_REPORT_API_BASE_URL || "http://localhost:3001";
const adminEmail = process.env.HRIS_REPORT_ADMIN_EMAIL || "admin@bandai.local";
const adminPassword = process.env.HRIS_REPORT_ADMIN_PASSWORD || "password123";
const appCode = process.env.HRIS_REPORT_APP_CODE || "hris";
const bandaiLogoPath = path.resolve(__dirname, "..", "..", "hris-app", "app", "assets", "bandai_logo.png");
const regularFontPath = "C:\\Windows\\Fonts\\arial.ttf";
const boldFontPath = "C:\\Windows\\Fonts\\arialbd.ttf";

const text = (value: unknown) => String(value ?? "").trim();

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

const sortDeviceUserIds = (a: string, b: string) =>
	a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

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

const buildRows = async (): Promise<{ rows: Row[]; summary: Summary; devices: any[] }> => {
	const now = new Date();
	const devices = await prisma.device.findMany({
		where: {
			isDeleted: false,
			address: { in: currentDeviceAddresses },
		},
		select: { id: true, name: true, address: true },
		orderBy: { address: "asc" },
	});
	if (devices.length !== currentDeviceAddresses.length) {
		throw new Error(`Expected ${currentDeviceAddresses.length} current devices, found ${devices.length}`);
	}

	const plan = await fetchMergePlan(devices.map((device) => device.id));
	const employeeIds = [
		...new Set((plan.users || []).map((user: any) => text(user.employeeId)).filter(Boolean)),
	];
	const employees = employeeIds.length
		? await prisma.employee.findMany({
				where: { id: { in: employeeIds }, isDeleted: false },
				select: {
					id: true,
					employeeId: true,
					deviceEmpId: true,
					workforceSource: true,
					agencyId: true,
					person: { select: { personalInfo: true } },
				},
			})
		: [];
	const employeeById = new Map(employees.map((employee: any) => [employee.id, employee]));

	const liveDeviceUserIds = new Set<string>();
	const liveByEmployeeId = new Map<string, { deviceUserIds: Set<string>; deviceRecords: number }>();
	for (const user of plan.users || []) {
		const vendorIds = (user.vendorUserIds || []).map(text).filter(Boolean).sort(sortDeviceUserIds);
		const deviceUserId = vendorIds.join(", ") || text(user.key).replace(/^vendor:/, "");
		if (deviceUserId) liveDeviceUserIds.add(deviceUserId);
		const employee = employeeById.get(text(user.employeeId));
		const hasDirectEmployee = Boolean(
			employee && employee.workforceSource === "DIRECT" && !employee.agencyId,
		);
		if (!hasDirectEmployee) continue;
		const current = liveByEmployeeId.get(employee.id) || {
			deviceUserIds: new Set<string>(),
			deviceRecords: 0,
		};
		for (const vendorId of vendorIds) current.deviceUserIds.add(vendorId);
		current.deviceRecords += Array.isArray(user.records) ? user.records.length : 0;
		liveByEmployeeId.set(employee.id, current);
	}

	const directEmployees = await prisma.employee.findMany({
		where: {
			isDeleted: false,
			workforceSource: "DIRECT",
			agencyId: null,
		},
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
		},
		orderBy: [{ employeeId: "asc" }],
	});

	const rows = directEmployees.map((employee: any, index: number) => {
		const live = liveByEmployeeId.get(employee.id);
		const deviceUserIds = live ? [...live.deviceUserIds].sort(sortDeviceUserIds) : [];
		return {
			no: index + 1,
			employeeId: text(employee.employeeId),
			employee: employeeName(employee),
			deviceUserId: deviceUserIds.join(", "),
			status: live ? "Enrolled" : "Not enrolled",
			countOfDeviceEnrolled: live?.deviceRecords || 0,
		};
	});

	const savedRows = await prisma.deviceUser.findMany({
		where: { deviceId: { in: devices.map((device) => device.id) } },
		select: { vendorUserId: true },
	});
	const savedUnique = new Set(savedRows.map((row) => text(row.vendorUserId)).filter(Boolean));
	const staleSavedHrisOnlyUniqueIds = [...savedUnique].filter((id) => !liveDeviceUserIds.has(id)).length;

	const summary: Summary = {
		generatedAt: formatGeneratedAt(now),
		generatedAtIso: now.toISOString(),
		deviceScope: devices.map((device) => `${device.name} (${device.address})`).join("; "),
		totalDirectEmployees: rows.length,
		enrolled: rows.filter((row) => row.status === "Enrolled").length,
		notEnrolled: rows.filter((row) => row.status === "Not enrolled").length,
		totalUniqueDeviceUsers: plan.users.length,
		linkedToDirectEmployee: liveByEmployeeId.size,
		linkedToOtherEmployee: Math.max(0, employeeIds.length - liveByEmployeeId.size),
		notLinkedInHris: Math.max(0, plan.users.length - employeeIds.length),
		deviceIdRecords: Number(plan.counts?.dedupedDeviceRecords || plan.counts?.sourceRows || 0),
		mergeSourceRows: Number(plan.counts?.sourceRows || 0),
		staleSavedHrisOnlyUniqueIds,
	};
	return { rows, summary, devices };
};

const writeExcel = async (filePath: string, rows: Row[], summary: Summary) => {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Bandai HRIS";
	const sheet = workbook.addWorksheet("Employees", { views: [{ state: "frozen", ySplit: 1 }] });
	if (fs.existsSync(bandaiLogoPath)) {
		const logoId = workbook.addImage({ filename: bandaiLogoPath, extension: "png" });
		sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 156, height: 36 } });
	}
	sheet.mergeCells("B1:E1");
	sheet.getCell("B1").value = "BNPI List of Employees Enrolled in Device";
	sheet.getCell("B1").font = { bold: true, size: 15 };
	sheet.getCell("B2").value = "Main Entrance Devices A-D only. Direct employees only, no agency.";
	sheet.getCell("B2").font = { size: 10, color: { argb: "FF374151" } };
	sheet.getCell("B3").value = `Generated: ${summary.generatedAt}`;
	sheet.getCell("B3").font = { size: 10 };
	sheet.getCell("B4").value = `Total direct employees: ${summary.totalDirectEmployees}   Enrolled: ${summary.enrolled}   Not enrolled: ${summary.notEnrolled}`;
	sheet.getCell("B4").font = { bold: true, size: 10 };
	sheet.getCell("B5").value = `Live device users: ${summary.totalUniqueDeviceUsers}   Linked to direct employees: ${summary.linkedToDirectEmployee}   Not linked in HRIS: ${summary.notLinkedInHris}   Saved HRIS-only IDs excluded: ${summary.staleSavedHrisOnlyUniqueIds}`;
	sheet.getCell("B5").font = { size: 10, color: { argb: "FF92400E" } };
	sheet.getRow(6).height = 8;
	sheet.columns = [
		{ key: "no", width: 8 },
		{ key: "employeeId", width: 16 },
		{ key: "employee", width: 34 },
		{ key: "deviceUserId", width: 18 },
		{ key: "status", width: 16 },
		{ key: "countOfDeviceEnrolled", width: 24 },
	];
	sheet.spliceRows(7, 0, ["#", "EMPLOYEE ID", "FULL NAME", "DEVICE USER ID", "STATUS", "Count of Device enrolled"]);
	sheet.getRow(7).font = { bold: true, color: { argb: "FF111827" } };
	sheet.getRow(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
	sheet.getRow(7).height = 22;
	for (const row of rows) sheet.addRow(row);
	sheet.eachRow((row) => {
		row.eachCell((cell) => {
			cell.border = {
				top: { style: "thin", color: { argb: "FFE5E7EB" } },
				bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
			};
			cell.alignment = { vertical: "middle" };
		});
	});
	sheet.autoFilter = { from: "A7", to: `F${rows.length + 7}` };
	await workbook.xlsx.writeFile(filePath);
};

const writePdf = async (filePath: string, rows: Row[], summary: Summary) => {
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
			{ key: "no", label: "#", x: 28, w: 36, align: "right" },
			{ key: "employeeId", label: "EMPLOYEE ID", x: 64, w: 92, align: "left" },
			{ key: "employee", label: "FULL NAME", x: 156, w: 292, align: "left" },
			{ key: "deviceUserId", label: "DEVICE USER ID", x: 448, w: 120, align: "left" },
			{ key: "status", label: "STATUS", x: 568, w: 116, align: "left" },
			{ key: "countOfDeviceEnrolled", label: "Count of Device enrolled", x: 684, w: 134, align: "right" },
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
		if (fs.existsSync(bandaiLogoPath)) {
			doc.image(bandaiLogoPath, 28, brandY, { width: 148 });
		}
		doc.font(boldFont).fontSize(15).fillColor("#111827").text("BNPI List of Employees Enrolled in Device", 194, brandY + 2);
		doc.font(regularFont).fontSize(8.5).fillColor("#374151").text("Main Entrance Devices A-D only. Direct employees only, no agency.", 194, brandY + 21);
		doc.y = brandY + 52;
		doc.moveDown(0.2);
		doc.font(regularFont).fontSize(8.5).fillColor("#111827").text(`Generated ${summary.generatedAt}`, 28, doc.y);
		doc.font(boldFont).fontSize(9).text(`Total direct employees: ${summary.totalDirectEmployees}   Enrolled: ${summary.enrolled}   Not enrolled: ${summary.notEnrolled}`, 28, doc.y + 4);
		doc.font(regularFont).fontSize(8).fillColor("#92400E").text(`Live device users: ${summary.totalUniqueDeviceUsers}   Linked to direct employees: ${summary.linkedToDirectEmployee}   Not linked in HRIS: ${summary.notLinkedInHris}   Saved HRIS-only IDs excluded: ${summary.staleSavedHrisOnlyUniqueIds}`, 28, doc.y + 18);
		doc.moveDown(1.7);
		header();

		for (const row of rows) {
			if (doc.y + rowHeight > pageBottom()) {
				doc.addPage();
				header();
			}
			for (const col of cols) {
				drawCell((row as any)[col.key], col.x, doc.y, col.w, rowHeight, {
					align: col.align,
					color:
						row.status === "Enrolled"
							? "#065F46"
							: "#92400E",
				});
			}
			doc.y += rowHeight;
		}

		doc.end();
	});
};

async function main() {
	const { rows, summary, devices } = await buildRows();

	if (dryRun) {
		console.log(JSON.stringify({ mode: "dry-run", summary, devices, sample: rows.slice(0, 10) }, null, 2));
		return;
	}

	const outDir = path.join(outputRoot, `direct-employee-enrollment-simple-${stamp()}`);
	fs.mkdirSync(outDir, { recursive: true });
	const jsonPath = path.join(outDir, "direct-employee-enrollment-simple.json");
	const xlsxPath = path.join(outDir, "direct-employee-enrollment-simple.xlsx");
	const pdfPath = path.join(outDir, "direct-employee-enrollment-simple.pdf");
	fs.writeFileSync(jsonPath, `${JSON.stringify({ summary, devices, rows }, null, 2)}\n`, "utf8");
	await writeExcel(xlsxPath, rows, summary);
	await writePdf(pdfPath, rows, summary);
	console.log(JSON.stringify({ mode: "generated", summary, artifacts: { jsonPath, xlsxPath, pdfPath } }, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());
