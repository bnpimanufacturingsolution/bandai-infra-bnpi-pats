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

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const outputRoot = path.resolve(__dirname, "..", "..", ".runtime");
const currentDeviceAddresses = ["10.184.37.20", "10.184.37.21", "10.184.37.22", "10.184.37.23"];
const bandaiLogoPath = path.resolve(__dirname, "..", "..", "hris-app", "app", "assets", "bandai_logo.png");
const regularFontPath = "C:\\Windows\\Fonts\\arial.ttf";
const boldFontPath = "C:\\Windows\\Fonts\\arialbd.ttf";

const text = (value: unknown) => String(value ?? "").trim();

const stamp = () => {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const employeeName = (employee: any) => {
	const info = employee?.person?.personalInfo && typeof employee.person.personalInfo === "object" ? employee.person.personalInfo : {};
	return [info.firstName, info.middleName, info.lastName, info.suffix]
		.map(text)
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim() || text(employee.employeeId) || "Employee";
};

const buildRows = async (): Promise<Row[]> => {
	const employees = await prisma.employee.findMany({
		where: {
			isDeleted: false,
			workforceSource: "DIRECT",
			agencyId: null,
		},
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
			deviceUsers: {
				where: {
					device: {
						isDeleted: false,
						address: { in: currentDeviceAddresses },
					},
				},
				select: {
					deviceId: true,
					vendorUserId: true,
				},
			},
		},
		orderBy: [{ employeeId: "asc" }],
	});

	return employees.map((employee: any, index: number) => {
		const deviceIds = new Set((employee.deviceUsers || []).map((row: any) => text(row.deviceId)).filter(Boolean));
		const deviceUserIds: string[] = Array.from(
			new Set((employee.deviceUsers || []).map((row: any) => text(row.vendorUserId)).filter(Boolean)),
		).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
		const count = deviceIds.size;
		return {
			no: index + 1,
			employeeId: text(employee.employeeId),
			employee: employeeName(employee),
			deviceUserId: deviceUserIds.join(", "),
			status: count > 0 ? "Enrolled" : "Not enrolled",
			countOfDeviceEnrolled: count,
		};
	});
};

const writeExcel = async (filePath: string, rows: Row[]) => {
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Bandai HRIS";
	const sheet = workbook.addWorksheet("Employees", { views: [{ state: "frozen", ySplit: 1 }] });
	if (fs.existsSync(bandaiLogoPath)) {
		const logoId = workbook.addImage({ filename: bandaiLogoPath, extension: "png" });
		sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 156, height: 36 } });
	}
	sheet.mergeCells("B1:D1");
	sheet.getCell("B1").value = "BNPI List of Employees Enrolled in Device";
	sheet.getCell("B1").font = { bold: true, size: 15 };
	sheet.getCell("B2").value = "Main Entrance Devices A-D only. Direct employees only, no agency.";
	sheet.getCell("B2").font = { size: 10, color: { argb: "FF374151" } };
	sheet.getCell("B3").value = `Total: ${rows.length}   Enrolled: ${rows.filter((row) => row.status === "Enrolled").length}   Not enrolled: ${rows.filter((row) => row.status !== "Enrolled").length}`;
	sheet.getCell("B3").font = { bold: true, size: 10 };
	sheet.getRow(1).height = 22;
	sheet.getRow(2).height = 18;
	sheet.getRow(3).height = 18;
	sheet.getRow(4).height = 8;
	sheet.columns = [
		{ key: "no", width: 8 },
		{ key: "employeeId", width: 16 },
		{ key: "employee", width: 34 },
		{ key: "deviceUserId", width: 18 },
		{ key: "status", width: 16 },
		{ key: "countOfDeviceEnrolled", width: 24 },
	];
	sheet.spliceRows(5, 0, ["#", "EMPLOYEE ID", "FULL NAME", "DEVICE USER ID", "STATUS", "Count of Device enrolled"]);
	sheet.getRow(5).font = { bold: true, color: { argb: "FF111827" } };
	sheet.getRow(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
	sheet.getRow(5).height = 22;
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
	sheet.autoFilter = { from: "A5", to: `F${rows.length + 5}` };
	await workbook.xlsx.writeFile(filePath);
};

const writePdf = async (filePath: string, rows: Row[], summary: Record<string, number | string>) => {
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
			{ key: "no", label: "#", x: 28, w: 42, align: "right" },
			{ key: "employeeId", label: "EMPLOYEE ID", x: 70, w: 92, align: "left" },
			{ key: "employee", label: "FULL NAME", x: 162, w: 286, align: "left" },
			{ key: "deviceUserId", label: "DEVICE USER ID", x: 448, w: 120, align: "left" },
			{ key: "status", label: "STATUS", x: 568, w: 116, align: "left" },
			{ key: "countOfDeviceEnrolled", label: "Count of Device enrolled", x: 684, w: 96, align: "right" },
		];
		const rowHeight = 20;
		const pageBottom = () => doc.page.height - doc.page.margins.bottom;
		const drawCell = (value: unknown, x: number, y: number, w: number, h: number, opts: any = {}) => {
			const restoreY = doc.y;
			if (opts.fill) doc.rect(x, y, w, h).fill(opts.fill);
			doc.rect(x, y, w, h).strokeColor("#D1D5DB").lineWidth(0.4).stroke();
			doc.font(opts.bold ? boldFont : regularFont).fontSize(opts.size || 7.5).fillColor(opts.color || "#111827").text(text(value) || "-", x + 4, y + 5, {
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
		doc.font(regularFont).fontSize(8.5).fillColor("#374151").text("Main Entrance Devices A-D only", 194, brandY + 21);
		doc.y = brandY + 52;
		doc.moveDown(0.2);
		doc.font(regularFont).fontSize(8.5).fillColor("#111827").text(`Direct employees only, no agency. Generated ${summary.generatedAt}`, 28, doc.y);
		doc.font(boldFont).fontSize(9).text(`Total: ${summary.total}   Enrolled: ${summary.enrolled}   Not enrolled: ${summary.notEnrolled}`, 28, doc.y + 4);
		doc.moveDown(1.1);
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
	const rows = await buildRows();
	const enrolled = rows.filter((row) => row.status === "Enrolled").length;
	const summary = {
		generatedAt: new Date().toISOString(),
		deviceScope: currentDeviceAddresses.join(", "),
		total: rows.length,
		enrolled,
		notEnrolled: rows.length - enrolled,
	};

	if (dryRun) {
		console.log(JSON.stringify({ mode: "dry-run", summary, sample: rows.slice(0, 10) }, null, 2));
		return;
	}

	const outDir = path.join(outputRoot, `direct-employee-enrollment-simple-${stamp()}`);
	fs.mkdirSync(outDir, { recursive: true });
	const jsonPath = path.join(outDir, "direct-employee-enrollment-simple.json");
	const xlsxPath = path.join(outDir, "direct-employee-enrollment-simple.xlsx");
	const pdfPath = path.join(outDir, "direct-employee-enrollment-simple.pdf");
	fs.writeFileSync(jsonPath, `${JSON.stringify({ summary, rows }, null, 2)}\n`, "utf8");
	await writeExcel(xlsxPath, rows);
	await writePdf(pdfPath, rows, summary);
	console.log(JSON.stringify({ mode: "generated", summary, artifacts: { jsonPath, xlsxPath, pdfPath } }, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());
