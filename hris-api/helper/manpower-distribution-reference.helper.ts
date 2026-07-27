import fs from "fs";
import path from "path";
import XLSX from "xlsx";

interface ManpowerDistributionReferenceOptions {
	month?: string;
}

interface WorkbookGenderSummary {
	female: number;
	male: number;
	total: number;
}

interface WorkbookDirectAgencySnapshot {
	date: string;
	direct: number;
	agency: number;
	total: number;
}

interface WorkbookAverageManpower {
	month: string;
	directAverage: number;
	agencyAverage: number;
	totalAverage: number;
}

const WORKBOOK_RELATIVE_PATH = path.join(
	"docs",
	"Copy of 2026_04_April_HR Monthly Manpower Distribution.xlsx",
);

const buildEmptyManpowerDistributionWorkbookReference = (
	month = "2026-04",
) => ({
	sourceWorkbook: WORKBOOK_RELATIVE_PATH.replace(/\\/g, "/"),
	month,
	genderSummary: {
		female: 0,
		male: 0,
		total: 0,
	},
	bnpiGenderSummary: {
		female: 0,
		male: 0,
		total: 0,
	},
	agencyGenderSummary: {
		female: 0,
		male: 0,
		total: 0,
	},
	directAgencySnapshot: null,
	averageManpower: null,
});

const toNumber = (value: unknown): number => {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoDate = (value: unknown): string => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString().slice(0, 10);
	}

	return String(value || "").trim();
};

const getRows = (workbook: XLSX.WorkBook, sheetName: string) => {
	const sheet = workbook.Sheets[sheetName];
	if (!sheet) {
		return [];
	}

	return XLSX.utils.sheet_to_json(sheet, {
		header: 1,
		blankrows: false,
		defval: null,
		raw: true,
	}) as unknown[][];
};

const readGrandTotal = (workbook: XLSX.WorkBook, sheetName: string): WorkbookGenderSummary => {
	const grandTotalRow = getRows(workbook, sheetName).find((row) =>
		String(row[0] || "")
			.trim()
			.toUpperCase()
			.includes("GRAND TOTAL"),
	);

	return {
		female: toNumber(grandTotalRow?.[1]),
		male: toNumber(grandTotalRow?.[2]),
		total: toNumber(grandTotalRow?.[3]),
	};
};

const readLatestDirectAgencySnapshot = (
	workbook: XLSX.WorkBook,
): WorkbookDirectAgencySnapshot | null => {
	const rows = getRows(workbook, "AgencyDirect Headcount (New)");
	const dateHeaderRow = rows[0] || [];
	const typeHeaderRow = rows[1] || [];
	let latestColumn = -1;

	for (let column = 2; column < dateHeaderRow.length; column += 2) {
		if (dateHeaderRow[column] && typeHeaderRow[column] === "Direct") {
			latestColumn = column;
		}
	}

	if (latestColumn < 0) {
		return null;
	}

	const totalsRow = rows.find((row, index) => {
		const nextRow = rows[index + 1];
		return (
			String(nextRow?.[0] || "").trim() === "Grand Total" &&
			toNumber(row[latestColumn]) + toNumber(row[latestColumn + 1]) ===
				toNumber(nextRow?.[latestColumn])
		);
	});
	const direct = toNumber(totalsRow?.[latestColumn]);
	const agency = toNumber(totalsRow?.[latestColumn + 1]);

	return {
		date: toIsoDate(dateHeaderRow[latestColumn]),
		direct,
		agency,
		total: direct + agency,
	};
};

const readAverageManpower = (
	workbook: XLSX.WorkBook,
	monthLabel: string,
): WorkbookAverageManpower | null => {
	const rows = getRows(workbook, "Average of Total Manpower");
	const monthRow = rows
		.slice()
		.reverse()
		.find(
			(row, index) =>
				index < rows.length - 1 &&
				String(row[0] || "")
					.trim()
					.toLowerCase() === monthLabel.toLowerCase(),
		);

	if (!monthRow) {
		return null;
	}

	return {
		month: String(monthRow[0] || "").trim(),
		directAverage: toNumber(monthRow[1]),
		agencyAverage: toNumber(monthRow[2]),
		totalAverage: toNumber(monthRow[3]),
	};
};

export const getManpowerDistributionWorkbookReference = (
	options: ManpowerDistributionReferenceOptions = {},
) => {
	const month = options.month || "2026-04";
	const workbookPath = path.resolve(process.cwd(), "..", WORKBOOK_RELATIVE_PATH);
	const fallbackPath = path.resolve(process.cwd(), WORKBOOK_RELATIVE_PATH);
	const sourcePath = fs.existsSync(workbookPath) ? workbookPath : fallbackPath;

	if (!fs.existsSync(sourcePath)) {
		return buildEmptyManpowerDistributionWorkbookReference(month);
	}

	const workbook = XLSX.readFile(sourcePath, {
		cellDates: true,
		cellNF: false,
		cellStyles: false,
	});
	const monthLabel = options.month?.slice(5, 7) === "04" ? "Apr" : "Apr";
	const directAgencySnapshot = readLatestDirectAgencySnapshot(workbook);
	const averageManpower = readAverageManpower(workbook, monthLabel);

	return {
		sourceWorkbook: WORKBOOK_RELATIVE_PATH.replace(/\\/g, "/"),
		month,
		genderSummary: readGrandTotal(workbook, "Gender Summary"),
		bnpiGenderSummary: readGrandTotal(workbook, "BNPI Gender"),
		agencyGenderSummary: readGrandTotal(workbook, "Agency Gender"),
		directAgencySnapshot,
		averageManpower,
	};
};
