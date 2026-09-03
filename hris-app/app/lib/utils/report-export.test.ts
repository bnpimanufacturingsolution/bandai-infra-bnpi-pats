import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import {
	buildReportFilterSummary,
	exportReport,
	type ReportExportColumn,
} from "./report-export";

type ExportSampleRow = {
	label: string;
	female?: number;
	male?: number;
	total?: number;
};

const columns: ReportExportColumn<ExportSampleRow>[] = [
	{ header: "Label", accessor: "label" },
	{ header: "Female", accessor: "female", align: "right", valueType: "number" },
	{ header: "Male", accessor: "male", align: "right", valueType: "number" },
	{ header: "Total", accessor: "total", align: "right", valueType: "number" },
];

describe("report export metadata", () => {
	it("removes placeholder period scope lines while keeping real payroll context", () => {
		expect(
			buildReportFilterSummary([
				{ label: "Payroll Period", value: "Period 2 - Apr 2026" },
				{ label: "Period Range", value: "Filtered periods" },
				{ label: "Department", value: "Administration" },
			]),
		).toEqual([
			{ label: "Payroll Period", value: "Period 2 - Apr 2026" },
			{ label: "Department", value: "Administration" },
		]);
	});
});

describe("report XLSX export", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("creates a styled multi-sheet manpower workbook", async () => {
		let downloadedBlob: Blob | undefined;
		let downloadedFileName = "";
		const link = {
			click: vi.fn(),
			remove: vi.fn(),
			set href(value: string) {
				expect(value).toBe("blob:report");
			},
			set download(value: string) {
				downloadedFileName = value;
			},
		};

		vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
			downloadedBlob = blob as Blob;
			return "blob:report";
		});
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
		vi.stubGlobal("document", {
			createElement: vi.fn(() => link),
			body: {
				appendChild: vi.fn(),
				removeChild: vi.fn(),
			},
		});

		await exportReport({
			format: "xlsx",
			config: {
				reportKey: "workforce-manpower-distribution",
				title: "Monthly Manpower Distribution",
				fileBaseName: "workforce-manpower-distribution-2026-04.csv",
				rows: [],
				columns,
				filtersSummary: [
					{ label: "Context", value: "Source: Active HRIS employee master data" },
				],
				xlsxSheets: [
					{
						name: "Gender Summary",
						title: "Gender Summary",
						rows: [{ label: "Administration", female: 28, male: 4, total: 32 }],
						columns,
					},
					{
						name: "Agency Summary",
						title: "Agency Summary",
						rows: [{ label: "Agency A", female: 10, male: 12, total: 22 }],
						columns,
					},
					{
						name: "Agency Direct Headcount",
						title: "Agency Direct Headcount",
						rows: [{ label: "Production / Assembly", total: 105 }],
						columns,
					},
					{
						name: "Total Manpower",
						title: "Total Manpower",
						rows: [{ label: "Total", total: 159 }],
						columns,
					},
				],
			},
		});

		expect(downloadedFileName).toBe("workforce-manpower-distribution-2026-04.xlsx");
		expect(downloadedBlob?.type).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);

		const workbookText = new TextDecoder().decode(
			new Uint8Array(await downloadedBlob!.arrayBuffer()),
		);
		const worksheetXmlParts = workbookText.match(/<worksheet[\s\S]*?<\/worksheet>/g) || [];
		expect(workbookText).toContain('<sheet name="Gender Summary"');
		expect(workbookText).toContain('<sheet name="Agency Summary"');
		expect(workbookText).toContain('<sheet name="Agency Direct Headcount"');
		expect(workbookText).toContain('<sheet name="Total Manpower"');
		expect(workbookText).toContain("styles.xml");
		expect(workbookText).toContain('tabColor rgb="FFC0000B"');
		expect(workbookText).not.toContain("Filters Applied");
		expect(workbookText).not.toContain("Context");
		expect(workbookText).not.toContain("Generated On");
		expect(worksheetXmlParts).toHaveLength(4);
		worksheetXmlParts.forEach((worksheetXml) => {
			expect(worksheetXml).toContain("<autoFilter ");
			expect(worksheetXml).toContain("<mergeCells ");
			expect(worksheetXml.indexOf("<autoFilter ")).toBeLessThan(
				worksheetXml.indexOf("<mergeCells "),
			);
			expect(worksheetXml).not.toMatch(/<mergeCell ref="([A-Z]+\d+):\1"\/>/);
		});
		expect(link.click).toHaveBeenCalledOnce();
	});

	it("exports multi-sheet reports as clean sectioned CSV and PDF files", async () => {
		const downloaded: Array<{ blob: Blob; fileName: string }> = [];
		const link = {
			click: vi.fn(),
			remove: vi.fn(),
			set href(value: string) {
				expect(value).toBe("blob:report");
			},
			set download(value: string) {
				downloaded[downloaded.length - 1].fileName = value;
			},
		};
		const genderColumns: ReportExportColumn<ExportSampleRow>[] = [
			{ header: "Dept / Division", accessor: "label" },
			{ header: "Female", accessor: "female", align: "right", valueType: "number" },
			{ header: "Male", accessor: "male", align: "right", valueType: "number" },
			{ header: "Grand Total", accessor: "total", align: "right", valueType: "number" },
		];

		vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
			downloaded.push({ blob: blob as Blob, fileName: "" });
			return "blob:report";
		});
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
		vi.stubGlobal("document", {
			createElement: vi.fn(() => link),
			body: {
				appendChild: vi.fn(),
				removeChild: vi.fn(),
			},
		});

		const config = {
			reportKey: "workforce-manpower-distribution",
			title: "Monthly Manpower Distribution",
			fileBaseName: "workforce-manpower-distribution-2026-04.csv",
			rows: [],
			columns,
			filtersSummary: [
				{ label: "Context", value: "Source: Active HRIS employee master data" },
			],
			xlsxSheets: [
				{
					name: "Gender Summary",
					title: "Gender Summary",
					rows: [{ label: "Administration", female: 28, male: 4, total: 32 }],
					columns: genderColumns,
				},
				{
					name: "Agency Direct Headcount",
					title: "Agency Direct Headcount",
					rows: [{ label: "Production / Assembly", total: 105 }],
					columns,
				},
			],
		};

		await exportReport({ format: "csv", config });
		await exportReport({ format: "pdf", config });

		expect(downloaded[0].fileName).toBe("workforce-manpower-distribution-2026-04.csv");
		expect(downloaded[0].blob.type).toBe("text/csv;charset=utf-8;");
		const csvText = await downloaded[0].blob.text();
		expect(csvText).toContain("Gender Summary\nDept / Division,Female,Male,Grand Total");
		expect(csvText).not.toContain("Gender Summary\nDept / Division,Female,Male,Direct,Agency");
		expect(csvText).toContain("Agency Direct Headcount\nLabel,Female,Male,Total");

		expect(downloaded[1].fileName).toBe("workforce-manpower-distribution-2026-04.pdf");
		expect(downloaded[1].blob.type).toBe("application/pdf");
		expect(downloaded[1].blob.size).toBeGreaterThan(1000);
		expect(link.click).toHaveBeenCalledTimes(2);
	});

	it("exports payroll registers as vertical PDF sections and detailed spreadsheet columns", async () => {
		type PayrollRegisterRow = {
			rowNo: number;
			employeeCode: string;
			employeeName: string;
			department: string;
			division: string;
			position: string;
			[key: string]: string | number;
		};

		const payrollColumns: ReportExportColumn<PayrollRegisterRow>[] = [
			{ header: "No.", accessor: "rowNo", widthWeight: 0.5 },
			{ header: "Emp. No.", accessor: "employeeCode", widthWeight: 0.8 },
			{ header: "Employee Name", accessor: "employeeName", widthWeight: 2.35 },
			{ header: "Department", accessor: "department", widthWeight: 1.35 },
			{ header: "Division", accessor: "division", widthWeight: 1.35 },
			{ header: "Position", accessor: "position", widthWeight: 1.45 },
			...Array.from({ length: 36 }, (_, index) => ({
				header: `Payroll Amount ${index + 1}`,
				accessor: (row: PayrollRegisterRow) => row[`amount${index + 1}`],
				align: "right" as const,
				widthWeight: 1,
			})),
		];
		const payrollRows: PayrollRegisterRow[] = Array.from({ length: 4 }, (_, rowIndex) => {
			const row: PayrollRegisterRow = {
				rowNo: rowIndex + 1,
				employeeCode: `10${rowIndex}`,
				employeeName: `Employee ${rowIndex + 1}`,
				department: "Administration",
				division: "GA/HR",
				position: "Analyst",
			};
			for (let amountIndex = 1; amountIndex <= 36; amountIndex += 1) {
				row[`amount${amountIndex}`] = 1000 + rowIndex + amountIndex;
			}
			return row;
		});
		const downloaded: Array<{ blob: Blob; fileName: string }> = [];
		const link = {
			click: vi.fn(),
			remove: vi.fn(),
			set href(value: string) {
				expect(value).toBe("blob:report");
			},
			set download(value: string) {
				downloaded[downloaded.length - 1].fileName = value;
			},
		};

		vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
			downloaded.push({ blob: blob as Blob, fileName: "" });
			return "blob:report";
		});
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
		const fetchLogo = vi.fn(() => Promise.reject(new Error("logo unavailable")));
		vi.stubGlobal("fetch", fetchLogo);
		vi.stubGlobal("document", {
			createElement: vi.fn(() => link),
			body: {
				appendChild: vi.fn(),
				removeChild: vi.fn(),
			},
		});

		const config = {
			reportKey: "payroll-register",
			title: "Payroll Register Per Department/Employee",
			fileBaseName: "payroll-register.csv",
			rows: payrollRows,
			columns: payrollColumns,
			filtersSummary: [{ label: "Section", value: "GA/HR" }],
			grouping: [
				{
					id: "section",
					label: "Section",
					getValue: (row: PayrollRegisterRow) => row.division,
				},
			],
			pdfLayout: "payroll-register" as const,
			orientation: "landscape" as const,
		};

		await exportReport({
			format: "pdf",
			config,
			options: { groupBy: "section" },
		});
		await exportReport({
			format: "xlsx",
			config,
			options: { groupBy: "section" },
		});
		await exportReport({
			format: "csv",
			config,
			options: { groupBy: "section" },
		});

		const generatedPdf = await PDFDocument.load(await downloaded[0].blob.arrayBuffer());
		const [firstPage] = generatedPdf.getPages();
		const { width, height } = firstPage.getSize();

		expect(downloaded[0].fileName).toBe("payroll-register.pdf");
		expect(width).toBe(595);
		expect(height).toBe(842);
		expect(generatedPdf.getPageCount()).toBeGreaterThan(1);
		expect(fetchLogo).not.toHaveBeenCalled();
		expect(downloaded[1].fileName).toBe("payroll-register.xlsx");
		expect(downloaded[1].blob.type).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		const xlsxText = new TextDecoder().decode(
			new Uint8Array(await downloaded[1].blob.arrayBuffer()),
		);
		expect(xlsxText).toContain("Payroll Amount 36");
		expect(xlsxText).toContain('<pane ySplit="2" topLeftCell="A3"');
		expect(xlsxText).toContain('<c r="C3" s="6" t="inlineStr"><is><t>Employee 1</t></is></c>');
		const csvText = await downloaded[2].blob.text();
		expect(csvText).toContain("No.,Emp. No.,Employee Name,Department,Division,Position");
		expect(csvText).toContain("Payroll Amount 36");
		expect(link.click).toHaveBeenCalledTimes(3);
	});

	it("keeps payroll register PDF employee header metadata in separate measured columns", async () => {
		type PayrollRegisterRow = {
			rowNo: number;
			employeeCode: string;
			employeeName: string;
			department: string;
			division: string;
			position: string;
			netPay: number;
		};
		const drawTextCalls: Array<{
			text: string;
			x: number;
			y: number;
			size: number;
			font: { widthOfTextAtSize: (text: string, size: number) => number };
		}> = [];
		const originalDrawText = PDFPage.prototype.drawText;

		vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (
			this: PDFPage,
			text,
			options,
		) {
			if (options?.font && typeof options.x === "number" && typeof options.y === "number") {
				drawTextCalls.push({
					text,
					x: options.x,
					y: options.y,
					size: options.size || 0,
					font: options.font,
				});
			}
			return originalDrawText.call(this, text, options);
		});
		const downloaded: Array<{ blob: Blob; fileName: string }> = [];
		const link = {
			click: vi.fn(),
			remove: vi.fn(),
			set href(value: string) {
				expect(value).toBe("blob:report");
			},
			set download(value: string) {
				downloaded[downloaded.length - 1].fileName = value;
			},
		};

		vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
			downloaded.push({ blob: blob as Blob, fileName: "" });
			return "blob:report";
		});
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
		vi.stubGlobal("document", {
			createElement: vi.fn(() => link),
			body: {
				appendChild: vi.fn(),
				removeChild: vi.fn(),
			},
		});

		await exportReport({
			format: "pdf",
			config: {
				reportKey: "payroll-register",
				title: "Payroll Register Per Department/Employee",
				fileBaseName: "payroll-register.csv",
				rows: [
					{
						rowNo: 1,
						employeeCode: "010941-EXTREMELY-LONG-CODE",
						employeeName:
							"Herlene Joyce Perez Quiazon With A Very Long Payroll Register Name",
						department: "Administration",
						division: "GA/HR",
						position: "Junior Supervisor",
						netPay: 9999999.99,
					},
				],
				columns: [
					{ header: "No.", accessor: "rowNo" },
					{ header: "Emp. No.", accessor: "employeeCode", valueType: "text" },
					{ header: "Employee Name", accessor: "employeeName", valueType: "text" },
					{ header: "Department", accessor: "department", valueType: "text" },
					{ header: "Division", accessor: "division", valueType: "text" },
					{ header: "Position", accessor: "position", valueType: "text" },
					{ header: "Net Pay", accessor: "netPay", align: "right" },
				],
				filtersSummary: [{ label: "Section", value: "GA/HR" }],
				grouping: [
					{
						id: "section",
						label: "Section",
						getValue: (row: PayrollRegisterRow) => row.division,
					},
				],
				pdfLayout: "payroll-register",
				orientation: "landscape",
			},
			options: { groupBy: "section" },
		});

		const codeCall = drawTextCalls.find((call) => call.text.startsWith("010941"));
		const netPayCall = drawTextCalls.find((call) => call.text === "NetPay" && call.x > 350);
		const amountCall = drawTextCalls.find(
			(call) =>
				netPayCall &&
				/\d/.test(call.text) &&
				call.x > netPayCall.x &&
				Math.abs(call.y - netPayCall.y) < 1,
		);
		const nameCall = drawTextCalls.find((call) => call.text.startsWith("Herlene Joyce"));

		expect(codeCall).toBeTruthy();
		expect(netPayCall).toBeTruthy();
		expect(amountCall).toBeTruthy();
		expect(nameCall).toBeTruthy();

		const nameRight =
			nameCall!.x + nameCall!.font.widthOfTextAtSize(nameCall!.text, nameCall!.size);
		const codeRight =
			codeCall!.x + codeCall!.font.widthOfTextAtSize(codeCall!.text, codeCall!.size);
		const netPayRight =
			netPayCall!.x + netPayCall!.font.widthOfTextAtSize(netPayCall!.text, netPayCall!.size);

		expect(nameRight).toBeLessThanOrEqual(codeCall!.x - 8);
		expect(codeRight).toBeLessThanOrEqual(netPayCall!.x - 8);
		expect(netPayRight).toBeLessThanOrEqual(amountCall!.x - 4);
	});

	it("keeps employee identity columns as text when payroll export values are missing", async () => {
		type PayrollRegisterRow = {
			rowNo: number;
			employeeCode?: string;
			employeeName?: string;
			department?: string;
			netPay?: number;
		};
		const downloaded: Array<{ blob: Blob; fileName: string }> = [];
		const link = {
			click: vi.fn(),
			remove: vi.fn(),
			set href(value: string) {
				expect(value).toBe("blob:report");
			},
			set download(value: string) {
				downloaded[downloaded.length - 1].fileName = value;
			},
		};

		vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
			downloaded.push({ blob: blob as Blob, fileName: "" });
			return "blob:report";
		});
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
		vi.stubGlobal("document", {
			createElement: vi.fn(() => link),
			body: {
				appendChild: vi.fn(),
				removeChild: vi.fn(),
			},
		});
		const rows: PayrollRegisterRow[] = [{ rowNo: 1, netPay: 12500 }];

		await exportReport({
			format: "xlsx",
			config: {
				reportKey: "payroll-register",
				title: "Payroll Register Per Department/Employee",
				fileBaseName: "payroll-register.csv",
				rows,
				columns: [
					{ header: "No.", accessor: "rowNo" },
					{ header: "Emp. No.", accessor: "employeeCode" },
					{ header: "Employee Name", accessor: "employeeName" },
					{ header: "Department", accessor: "department" },
					{ header: "NetPay", accessor: "netPay", align: "right" },
				],
				pdfLayout: "payroll-register",
				orientation: "landscape",
			},
		});

		const xlsxText = new TextDecoder().decode(
			new Uint8Array(await downloaded[0].blob.arrayBuffer()),
		);

		expect(xlsxText).toContain('<c r="C3" s="6" t="inlineStr"');
		expect(xlsxText).not.toContain('<c r="C3" s="7"><v>0</v></c>');
		expect(xlsxText).toContain('<c r="E3" s="7"><v>12500</v></c>');
	});
});
