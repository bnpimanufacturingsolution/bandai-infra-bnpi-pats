import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { User } from "~/types/auth";

export type ReportExportFormat = "csv" | "pdf" | "xlsx";

export interface ReportExportColumn<T> {
	key?: string;
	header: string;
	accessor: keyof T | ((row: T) => unknown);
	align?: "left" | "center" | "right";
	widthWeight?: number;
	valueType?: "text" | "number";
}

export interface ReportExportSummaryItem {
	label: string;
	value: string | number;
}

export interface ReportExportFilterItem {
	label: string;
	value: unknown;
}

export interface ReportExportGroupingOption<T> {
	id: string;
	label: string;
	getValue: (row: T) => unknown;
	sortOrder?: string[];
}

export interface ReportExportWorksheetConfig<T = any> {
	name: string;
	title?: string;
	rows: T[];
	columns: ReportExportColumn<T>[];
	summaryRows?: ReportExportSummaryItem[];
	filtersSummary?: ReportExportFilterItem[];
	emptyStateMessage?: string;
}

export interface ReportExportConfig<T> {
	reportKey: string;
	title: string;
	fileBaseName: string;
	rows: T[];
	columns: ReportExportColumn<T>[];
	filtersSummary?: ReportExportFilterItem[];
	summaryRows?: ReportExportSummaryItem[];
	compactSummaryLine?: string;
	grouping?: ReportExportGroupingOption<T>[];
	logoSrc?: string;
	orientation?: "portrait" | "landscape";
	pdfLayout?: "standard" | "payroll-register";
	organizationName?: string;
	generatedAt?: Date;
	generatedBy?: string;
	emptyStateMessage?: string;
	xlsxSheets?: ReportExportWorksheetConfig[];
	includeXlsxMetadata?: boolean;
}

export interface ReportExportDialogState {
	includeFiltersSummary: boolean;
	groupBy?: string;
	reportMode?: string;
}

export interface ReportExportRequest<T> {
	format: ReportExportFormat;
	config: ReportExportConfig<T>;
	options?: Partial<ReportExportDialogState>;
}

interface NormalizedExportRow<T> {
	raw: T;
	cells: string[];
	groupLabel?: string;
}

interface LegacyCsvExportOptions<T> {
	columns: ReportExportColumn<T>[];
	rows: T[];
	fileBaseName: string;
}

interface LegacyPdfExportOptions<T> extends LegacyCsvExportOptions<T> {
	reportTitle: string;
	metadataLines?: string[];
	logoSrc?: string;
	orientation?: "portrait" | "landscape";
}

const DEFAULT_EXPORT_STATE: ReportExportDialogState = {
	includeFiltersSummary: true,
	groupBy: undefined,
	reportMode: undefined,
};

const CSV_BOM = "\uFEFF";
const REPORT_EMPTY_TEXT = "—";
const REPORT_EMPTY_NUMBER = "0";
const DEFAULT_ORGANIZATION_NAME = "BANDAI NAMCO PHILIPPINES INC.";
const REPORT_HEADER_REPLACEMENTS: Array<[RegExp, string]> = [
	[/\bavg\b/gi, "Average"],
	[/\bmax\b/gi, "Maximum"],
	[/\bmin\b/gi, "Minimum"],
	[/\bdept\b/gi, "Department"],
];

function normalizeFileBaseName(fileBaseName: string) {
	return fileBaseName.replace(/\.(csv|pdf|xlsx)$/i, "");
}

function sanitizeFileSegment(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function resolveColumnValue<T>(column: ReportExportColumn<T>, row: T) {
	return typeof column.accessor === "function" ? column.accessor(row) : row[column.accessor];
}

function inferValueTypeFromHeader(header: string): "text" | "number" {
	if (/\b(name|employee|emp\.?\s*no|code|id|department|division|section|position|status)\b/i.test(header)) {
		return "text";
	}

	return /\b(count|total|average|maximum|minimum|rate|days?|hours?|minutes?|employees?|used|pending|available|entitled|balance|pay|salary|deductions?|allowances?|benefits?|tax|loans?|sss|philhealth|pag-ibig|headcount|age|female|male)\b/i.test(
		header,
	)
		? "number"
		: "text";
}

function inferColumnValueType<T>(
	column: ReportExportColumn<T>,
	rows: T[],
): "text" | "number" {
	if (column.valueType) {
		return column.valueType;
	}

	const firstValue = rows
		.map((row) => resolveColumnValue(column, row))
		.find((value) => value !== null && value !== undefined && value !== "");

	if (typeof firstValue === "number") {
		return "number";
	}

	if (column.align === "right") {
		return "number";
	}

	return inferValueTypeFromHeader(column.header);
}

export function normalizeReportHeaderLabel(header: string): string {
	const trimmedHeader = header.trim().replace(/\s+/g, " ");
	if (/^dept\s*\/\s*division$/i.test(trimmedHeader)) {
		return "Dept / Division";
	}

	return REPORT_HEADER_REPLACEMENTS.reduce(
		(current, [pattern, replacement]) => current.replace(pattern, replacement),
		trimmedHeader,
	);
}

export function formatReportDisplayValue(
	value: unknown,
	options: { valueType?: "text" | "number"; emptyText?: string } = {},
): string {
	const valueType = options.valueType || "text";
	const emptyText = options.emptyText || REPORT_EMPTY_TEXT;

	if (value === null || value === undefined || value === "") {
		return valueType === "number" ? REPORT_EMPTY_NUMBER : emptyText;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed || trimmed === "-") {
			return valueType === "number" ? REPORT_EMPTY_NUMBER : emptyText;
		}
		return trimmed;
	}

	if (typeof value === "number") {
		return Number.isFinite(value) ? String(value) : REPORT_EMPTY_NUMBER;
	}

	return String(value);
}

function normalizeCsvValue(value: unknown) {
	if (value === null || value === undefined) {
		return "";
	}

	return String(value);
}

function escapeCsvValue(value: unknown) {
	const stringValue = normalizeCsvValue(value);

	if (/[",\n\r]/.test(stringValue)) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}

	return stringValue;
}

function wrapTextToWidth(
	text: string,
	maxWidth: number,
	font: PDFFont,
	fontSize: number,
) {
	const normalized = text.trim();
	if (!normalized) {
		return [""];
	}

	const words = normalized.split(/\s+/);
	const lines: string[] = [];
	let current = "";

	const fits = (value: string) => font.widthOfTextAtSize(value, fontSize) <= maxWidth;

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (fits(candidate)) {
			current = candidate;
			continue;
		}

		if (current) {
			lines.push(current);
			current = "";
		}

		if (fits(word)) {
			current = word;
			continue;
		}

		let segment = "";
		for (const character of word) {
			const nextSegment = `${segment}${character}`;
			if (segment && !fits(nextSegment)) {
				lines.push(segment);
				segment = character;
				continue;
			}

			segment = nextSegment;
		}

		current = segment;
	}

	if (current) {
		lines.push(current);
	}

	return lines.length ? lines : [normalized];
}

function fitTextToWidth(text: string, maxWidth: number, font: PDFFont, fontSize: number) {
	const normalized = text.trim();
	if (!normalized || font.widthOfTextAtSize(normalized, fontSize) <= maxWidth) {
		return normalized;
	}

	const ellipsis = "...";
	const ellipsisWidth = font.widthOfTextAtSize(ellipsis, fontSize);
	if (ellipsisWidth > maxWidth) {
		return "";
	}

	let fitted = "";
	for (const character of normalized) {
		const candidate = `${fitted}${character}`;
		if (font.widthOfTextAtSize(candidate, fontSize) + ellipsisWidth > maxWidth) {
			break;
		}
		fitted = candidate;
	}

	return `${fitted.trimEnd()}${ellipsis}`;
}

function toArrayBuffer(bytes: Uint8Array) {
	const copy = new Uint8Array(bytes);
	return copy.buffer;
}

function encodeUtf8(value: string) {
	return new TextEncoder().encode(value);
}

function escapeXml(value: unknown) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function escapeXmlAttribute(value: unknown) {
	return escapeXml(value).replace(/\n/g, " ");
}

function normalizeSheetName(value: string, fallback: string) {
	const normalized = value
		.replace(/[\\/?*\[\]:]/g, " ")
		.trim()
		.replace(/\s+/g, " ")
		.slice(0, 31);

	return normalized || fallback;
}

function getCrc32(bytes: Uint8Array) {
	let crc = 0xffffffff;

	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) {
			crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
		}
	}

	return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: number[], value: number) {
	target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(target: number[], value: number) {
	target.push(
		value & 0xff,
		(value >>> 8) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 24) & 0xff,
	);
}

function createZip(files: Array<{ name: string; content: string }>) {
	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;

	files.forEach((file) => {
		const nameBytes = encodeUtf8(file.name);
		const contentBytes = encodeUtf8(file.content);
		const crc = getCrc32(contentBytes);
		const localHeader: number[] = [];
		const centralHeader: number[] = [];

		writeUint32(localHeader, 0x04034b50);
		writeUint16(localHeader, 20);
		writeUint16(localHeader, 0);
		writeUint16(localHeader, 0);
		writeUint16(localHeader, 0);
		writeUint16(localHeader, 0);
		writeUint32(localHeader, crc);
		writeUint32(localHeader, contentBytes.length);
		writeUint32(localHeader, contentBytes.length);
		writeUint16(localHeader, nameBytes.length);
		writeUint16(localHeader, 0);

		const localPart = new Uint8Array(localHeader.length + nameBytes.length + contentBytes.length);
		localPart.set(localHeader, 0);
		localPart.set(nameBytes, localHeader.length);
		localPart.set(contentBytes, localHeader.length + nameBytes.length);
		localParts.push(localPart);

		writeUint32(centralHeader, 0x02014b50);
		writeUint16(centralHeader, 20);
		writeUint16(centralHeader, 20);
		writeUint16(centralHeader, 0);
		writeUint16(centralHeader, 0);
		writeUint16(centralHeader, 0);
		writeUint16(centralHeader, 0);
		writeUint32(centralHeader, crc);
		writeUint32(centralHeader, contentBytes.length);
		writeUint32(centralHeader, contentBytes.length);
		writeUint16(centralHeader, nameBytes.length);
		writeUint16(centralHeader, 0);
		writeUint16(centralHeader, 0);
		writeUint16(centralHeader, 0);
		writeUint16(centralHeader, 0);
		writeUint32(centralHeader, 0);
		writeUint32(centralHeader, offset);

		const centralPart = new Uint8Array(centralHeader.length + nameBytes.length);
		centralPart.set(centralHeader, 0);
		centralPart.set(nameBytes, centralHeader.length);
		centralParts.push(centralPart);

		offset += localPart.length;
	});

	const centralOffset = offset;
	const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
	const endHeader: number[] = [];
	writeUint32(endHeader, 0x06054b50);
	writeUint16(endHeader, 0);
	writeUint16(endHeader, 0);
	writeUint16(endHeader, files.length);
	writeUint16(endHeader, files.length);
	writeUint32(endHeader, centralSize);
	writeUint32(endHeader, centralOffset);
	writeUint16(endHeader, 0);

	const totalLength =
		localParts.reduce((sum, part) => sum + part.length, 0) +
		centralSize +
		endHeader.length;
	const output = new Uint8Array(totalLength);
	let cursor = 0;

	[...localParts, ...centralParts, new Uint8Array(endHeader)].forEach((part) => {
		output.set(part, cursor);
		cursor += part.length;
	});

	return output;
}

function getExcelColumnName(index: number) {
	let value = index + 1;
	let label = "";

	while (value > 0) {
		const remainder = (value - 1) % 26;
		label = String.fromCharCode(65 + remainder) + label;
		value = Math.floor((value - 1) / 26);
	}

	return label;
}

interface XlsxCell {
	value: unknown;
	style?: number;
	type?: "text" | "number";
}

interface XlsxSheetBuild {
	name: string;
	xml: string;
}

const XLSX_STYLE = {
	default: 0,
	title: 1,
	metaLabel: 2,
	metaValue: 3,
	sectionLabel: 4,
	header: 5,
	text: 6,
	number: 7,
	zebraText: 8,
	zebraNumber: 9,
	totalText: 10,
	totalNumber: 11,
	empty: 12,
};

function buildXlsxStylesXml() {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
	<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
	<fonts count="5">
		<font><sz val="11"/><color rgb="FF171717"/><name val="Calibri"/></font>
		<font><b/><sz val="16"/><color rgb="FF171717"/><name val="Calibri"/></font>
		<font><b/><sz val="10"/><color rgb="FF5F5F63"/><name val="Calibri"/></font>
		<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
		<font><b/><sz val="11"/><color rgb="FFC0000B"/><name val="Calibri"/></font>
	</fonts>
	<fills count="7">
		<fill><patternFill patternType="none"/></fill>
		<fill><patternFill patternType="gray125"/></fill>
		<fill><patternFill patternType="solid"><fgColor rgb="FFFFF0F1"/><bgColor indexed="64"/></patternFill></fill>
		<fill><patternFill patternType="solid"><fgColor rgb="FFC0000B"/><bgColor indexed="64"/></patternFill></fill>
		<fill><patternFill patternType="solid"><fgColor rgb="FFFBF8F5"/><bgColor indexed="64"/></patternFill></fill>
		<fill><patternFill patternType="solid"><fgColor rgb="FFF6F2ED"/><bgColor indexed="64"/></patternFill></fill>
		<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E8"/><bgColor indexed="64"/></patternFill></fill>
	</fills>
	<borders count="3">
		<border><left/><right/><top/><bottom/><diagonal/></border>
		<border><left style="thin"><color rgb="FFE8DEDE"/></left><right style="thin"><color rgb="FFE8DEDE"/></right><top style="thin"><color rgb="FFE8DEDE"/></top><bottom style="thin"><color rgb="FFE8DEDE"/></bottom><diagonal/></border>
		<border><left style="thin"><color rgb="FFD8CCCC"/></left><right style="thin"><color rgb="FFD8CCCC"/></right><top style="thin"><color rgb="FFD8CCCC"/></top><bottom style="thin"><color rgb="FFD8CCCC"/></bottom><diagonal/></border>
	</borders>
	<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
	<cellXfs count="13">
		<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
		<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
		<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
		<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
		<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
		<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
		<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
		<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
		<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
		<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
		<xf numFmtId="0" fontId="2" fillId="6" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
		<xf numFmtId="164" fontId="2" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
		<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
	</cellXfs>
	<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
	<dxfs count="0"/>
	<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function buildDefaultXlsxSheet<T>(
	config: ReportExportConfig<T>,
	options: ReportExportDialogState,
): ReportExportWorksheetConfig<T> {
	const filterLines = options.includeFiltersSummary ? buildFilterLines(config.filtersSummary) : [];
	const summaryLines = buildSummaryLines(config.summaryRows);
	const normalizedRows = normalizeRows(config, options);

	return {
		name: "Report",
		title: config.title,
		rows: normalizedRows.map((row) => row.raw),
		columns: config.columns,
		filtersSummary: filterLines,
		summaryRows: summaryLines,
		emptyStateMessage: config.emptyStateMessage,
	};
}

function getNumericCellValue<T>(column: ReportExportColumn<T>, row: T) {
	const value = resolveColumnValue(column, row);
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (value === null || value === undefined || value === "") {
		return 0;
	}

	const numericValue = Number(String(value).replace(/,/g, ""));
	return Number.isFinite(numericValue) ? numericValue : 0;
}

function isLikelyTotalRow(cells: string[]) {
	return cells.some((cell) => /\b(total|grand total)\b/i.test(cell));
}

function estimateXlsxColumnWidth(header: string, values: string[]) {
	const maxLength = values.reduce((max, value) => Math.max(max, value.length), header.length);
	return Math.min(Math.max(maxLength + 3, 10), 34);
}

function buildXlsxCellXml(cell: XlsxCell, rowIndex: number, columnIndex: number) {
	const reference = `${getExcelColumnName(columnIndex)}${rowIndex}`;
	const style = cell.style ? ` s="${cell.style}"` : "";

	if (cell.type === "number" && typeof cell.value === "number" && Number.isFinite(cell.value)) {
		return `<c r="${reference}"${style}><v>${cell.value}</v></c>`;
	}

	return `<c r="${reference}"${style} t="inlineStr"><is><t>${escapeXml(cell.value)}</t></is></c>`;
}

function buildStyledWorksheetXml<T>(
	sheet: ReportExportWorksheetConfig<T>,
	config: ReportExportConfig<any>,
	options: ReportExportDialogState,
) {
	const includeMetadata = config.includeXlsxMetadata === true;
	const generatedAt = config.generatedAt || new Date();
	const generatedBy = config.generatedBy || "System";
	const filters = includeMetadata && options.includeFiltersSummary
		? buildFilterLines(sheet.filtersSummary || config.filtersSummary)
		: [];
	const summary = includeMetadata ? buildSummaryLines(sheet.summaryRows || []) : [];
	const columnValueTypes = sheet.columns.map((column) => inferColumnValueType(column, sheet.rows));
	const normalizedRows = sheet.rows.map((row) =>
		sheet.columns.map((column, index) =>
			formatReportDisplayValue(resolveColumnValue(column, row), {
				valueType: columnValueTypes[index],
			}),
		),
	);
	const columnCount = Math.max(sheet.columns.length, 1);
	const lastColumn = getExcelColumnName(columnCount - 1);
	const rows: XlsxCell[][] = [];
	const sectionRows: number[] = [];

	rows.push([{ value: sheet.title || config.title, style: XLSX_STYLE.title }]);

	if (includeMetadata) {
		rows.push([
			{ value: "Generated On", style: XLSX_STYLE.metaLabel },
			{
				value: `${formatReportDate(generatedAt)} ${formatReportTime(generatedAt)}`,
				style: XLSX_STYLE.metaValue,
			},
			{ value: "Generated By", style: XLSX_STYLE.metaLabel },
			{ value: generatedBy, style: XLSX_STYLE.metaValue },
		]);
	}

	if (filters.length) {
		sectionRows.push(rows.length + 2);
		rows.push([]);
		rows.push([{ value: "Filters Applied", style: XLSX_STYLE.sectionLabel }]);
		filters.forEach((line) =>
			rows.push([
				{ value: line.label, style: XLSX_STYLE.metaLabel },
				{ value: line.value, style: XLSX_STYLE.metaValue },
			]),
		);
	}

	if (summary.length) {
		sectionRows.push(rows.length + 2);
		rows.push([]);
		rows.push([{ value: "Summary", style: XLSX_STYLE.sectionLabel }]);
		summary.forEach((line) =>
			rows.push([
				{ value: line.label, style: XLSX_STYLE.metaLabel },
				{ value: line.value, style: XLSX_STYLE.metaValue },
			]),
		);
	}

	if (includeMetadata) {
		rows.push([]);
	}
	const headerRowIndex = rows.length + 1;
	rows.push(
		sheet.columns.map((column) => ({
			value: normalizeReportHeaderLabel(column.header),
			style: XLSX_STYLE.header,
		})),
	);

	if (!sheet.rows.length) {
		rows.push([{ value: sheet.emptyStateMessage || "No records found", style: XLSX_STYLE.empty }]);
	} else {
		sheet.rows.forEach((row, rowIndex) => {
			const cells = normalizedRows[rowIndex];
			const isTotal = isLikelyTotalRow(cells);
			rows.push(
				sheet.columns.map((column, columnIndex) => {
					const isNumber = columnValueTypes[columnIndex] === "number";
					const zebra = rowIndex % 2 === 1;
					const style = isTotal
						? isNumber
							? XLSX_STYLE.totalNumber
							: XLSX_STYLE.totalText
						: isNumber
							? zebra
								? XLSX_STYLE.zebraNumber
								: XLSX_STYLE.number
							: zebra
								? XLSX_STYLE.zebraText
								: XLSX_STYLE.text;

					return {
						value: isNumber ? getNumericCellValue(column, row) : cells[columnIndex],
						style,
						type: isNumber ? ("number" as const) : ("text" as const),
					};
				}),
			);
		});
	}

	const columnWidths = sheet.columns.map((column, index) =>
		columnValueTypes[index] === "number"
			? Math.max(11, normalizeReportHeaderLabel(column.header).length + 2)
			: estimateXlsxColumnWidth(
					normalizeReportHeaderLabel(column.header),
					normalizedRows.map((row) => row[index] || ""),
				),
	);
	const colsXml = columnWidths
		.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
		.join("");
	const sheetRowsXml = rows
		.map((row, rowIndex) => {
			const cells = row
				.map((cell, columnIndex) => buildXlsxCellXml(cell, rowIndex + 1, columnIndex))
				.join("");
			const height =
				rowIndex === 0
					? ' ht="24" customHeight="1"'
					: rowIndex === headerRowIndex - 1
						? ' ht="21" customHeight="1"'
						: ' ht="18" customHeight="1"';
			return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
		})
		.join("");
	const mergeRefs =
		columnCount > 1
			? [
					`<mergeCell ref="A1:${lastColumn}1"/>`,
					...sectionRows.map(
						(rowIndex) => `<mergeCell ref="A${rowIndex}:${lastColumn}${rowIndex}"/>`,
					),
				]
			: [];
	if (!sheet.rows.length && columnCount > 1) {
		mergeRefs.push(`<mergeCell ref="A${headerRowIndex + 1}:${lastColumn}${headerRowIndex + 1}"/>`);
	}
	const mergeCellsXml = mergeRefs.length
		? `<mergeCells count="${mergeRefs.length}">${mergeRefs.join("")}</mergeCells>`
		: "";

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
	<sheetPr><tabColor rgb="FFC0000B"/></sheetPr>
	<dimension ref="A1:${lastColumn}${rows.length}"/>
	<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRowIndex}" topLeftCell="A${headerRowIndex + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
	<sheetFormatPr defaultRowHeight="18"/>
	<cols>${colsXml}</cols>
	<sheetData>${sheetRowsXml}</sheetData>
	<autoFilter ref="A${headerRowIndex}:${lastColumn}${Math.max(headerRowIndex + sheet.rows.length, headerRowIndex)}"/>
	${mergeCellsXml}
	<pageMargins left="0.45" right="0.45" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
	<pageSetup orientation="${config.orientation || "landscape"}"/>
</worksheet>`;
}

function buildStyledXlsxWorkbook<T>(
	config: ReportExportConfig<T>,
	options: ReportExportDialogState,
) {
	const sourceSheets =
		config.xlsxSheets?.length
			? config.xlsxSheets
			: [buildDefaultXlsxSheet(config, options)];
	const sheets: XlsxSheetBuild[] = sourceSheets.map((sheet, index) => ({
		name: normalizeSheetName(sheet.name, `Sheet ${index + 1}`),
		xml: buildStyledWorksheetXml(sheet, config, options),
	}));
	const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
	<bookViews><workbookView activeTab="0"/></bookViews>
	<sheets>${sheets
		.map(
			(sheet, index) =>
				`<sheet name="${escapeXmlAttribute(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
		)
		.join("")}</sheets>
</workbook>`;
	const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
	${sheets
		.map(
			(_, index) =>
				`<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
		)
		.join("")}
	<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
	const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
	const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
	<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
	<Default Extension="xml" ContentType="application/xml"/>
	<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
	<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
	${sheets
		.map(
			(_, index) =>
				`<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
		)
		.join("")}
</Types>`;

	return createZip([
		{ name: "[Content_Types].xml", content: contentTypesXml },
		{ name: "_rels/.rels", content: rootRelsXml },
		{ name: "xl/workbook.xml", content: workbookXml },
		{ name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
		{ name: "xl/styles.xml", content: buildXlsxStylesXml() },
		...sheets.map((sheet, index) => ({
			name: `xl/worksheets/sheet${index + 1}.xml`,
			content: sheet.xml,
		})),
	]);
}

function estimateColumnWeight(header: string, values: string[], explicitWeight?: number) {
	if (explicitWeight && explicitWeight > 0) {
		return explicitWeight;
	}

	const sampleLength = values.reduce((max, value) => Math.max(max, value.length), header.length);

	if (sampleLength >= 30) {
		return 2.4;
	}

	if (sampleLength >= 22) {
		return 1.9;
	}

	if (sampleLength >= 14) {
		return 1.4;
	}

	if (sampleLength <= 8) {
		return 0.95;
	}

	return 1.15;
}

function maybeDownloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

async function embedLogo(pdf: PDFDocument, logoSrc?: string) {
	if (!logoSrc) {
		return null;
	}

	try {
		const response = await fetch(logoSrc);
		const buffer = await response.arrayBuffer();
		const bytes = new Uint8Array(buffer);
		const normalizedSrc = logoSrc.toLowerCase();

		if (normalizedSrc.endsWith(".jpg") || normalizedSrc.endsWith(".jpeg")) {
			return pdf.embedJpg(bytes);
		}

		return pdf.embedPng(bytes);
	} catch {
		return null;
	}
}

function drawWrappedText(
	page: PDFPage,
	text: string,
	x: number,
	y: number,
	width: number,
	font: PDFFont,
	fontSize: number,
	color = rgb(0.2, 0.2, 0.2),
	align: "left" | "center" | "right" = "left",
) {
	const lines = wrapTextToWidth(text, width, font, fontSize);

	lines.forEach((line, index) => {
		const textWidth = font.widthOfTextAtSize(line, fontSize);
		let drawX = x;

		if (align === "center") {
			drawX = x + Math.max((width - textWidth) / 2, 0);
		} else if (align === "right") {
			drawX = x + Math.max(width - textWidth, 0);
		}

		page.drawText(line, {
			x: drawX,
			y: y - index * (fontSize + 2),
			size: fontSize,
			font,
			color,
		});
	});

	return lines.length;
}

function normalizeDialogState(options?: Partial<ReportExportDialogState>): ReportExportDialogState {
	return {
		includeFiltersSummary:
			options?.includeFiltersSummary ?? DEFAULT_EXPORT_STATE.includeFiltersSummary,
		groupBy: options?.groupBy,
		reportMode: options?.reportMode,
	};
}

function normalizeFilterValue(value: unknown): string {
	if (value === null || value === undefined || value === "" || value === "all") {
		return "All";
	}

	if (Array.isArray(value)) {
		const printable: string = value
			.map((item) => normalizeFilterValue(item))
			.filter(Boolean)
			.join(", ");
		return printable || "All";
	}

	return humanizeReportValue(value);
}

function isMisleadingReportFilterValue(label: string, value: string) {
	const normalizedLabel = label.trim().toLowerCase();
	const normalizedValue = value.trim().toLowerCase();

	if (!normalizedValue || normalizedValue === "all") {
		return true;
	}

	if (
		/(period|date range)/.test(normalizedLabel) &&
		/^(filtered|selected|custom)\s+periods?$/.test(normalizedValue)
	) {
		return true;
	}

	return false;
}

function normalizePrintableValue(value: unknown): string {
	if (value === null || value === undefined || value === "") {
		return REPORT_EMPTY_TEXT;
	}

	return humanizeReportValue(value);
}

function buildFilterLines(
	items: ReportExportFilterItem[] = [],
): Array<{ label: string; value: string }> {
	return items
		.map((item) => ({
			label: item.label,
			value: normalizeFilterValue(item.value),
		}))
		.filter((item) => !isMisleadingReportFilterValue(item.label, item.value));
}

function getGrouping<T>(
	configGrouping: ReportExportGroupingOption<T>[] | undefined,
	groupBy?: string,
) {
	if (!groupBy || !configGrouping?.length) {
		return null;
	}

	return configGrouping.find((option) => option.id === groupBy) || null;
}

function normalizeRows<T>(
	config: ReportExportConfig<T>,
	options: ReportExportDialogState,
): NormalizedExportRow<T>[] {
	const activeGrouping = getGrouping(config.grouping, options.groupBy);
	const columnValueTypes = config.columns.map((column) => inferColumnValueType(column, config.rows));

	const rows = config.rows.map((row) => ({
		raw: row,
		cells: config.columns.map((column, index) =>
			formatReportDisplayValue(resolveColumnValue(column, row), {
				valueType: columnValueTypes[index],
			}),
		),
		groupLabel: activeGrouping
			? formatReportDisplayValue(activeGrouping.getValue(row))
			: undefined,
	}));

	if (!activeGrouping) {
		return rows;
	}

	return rows.sort((left, right) => {
		const leftGroup = left.groupLabel || "";
		const rightGroup = right.groupLabel || "";
		if (leftGroup !== rightGroup) {
			if (activeGrouping.sortOrder?.length) {
				const leftGroupIndex = activeGrouping.sortOrder.indexOf(leftGroup);
				const rightGroupIndex = activeGrouping.sortOrder.indexOf(rightGroup);
				const normalizedLeftIndex =
					leftGroupIndex === -1 ? activeGrouping.sortOrder.length : leftGroupIndex;
				const normalizedRightIndex =
					rightGroupIndex === -1 ? activeGrouping.sortOrder.length : rightGroupIndex;

				if (normalizedLeftIndex !== normalizedRightIndex) {
					return normalizedLeftIndex - normalizedRightIndex;
				}
			}

			return leftGroup.localeCompare(rightGroup);
		}

		return left.cells.join("|").localeCompare(right.cells.join("|"));
	});
}

function buildSummaryLines(
	summaryRows: ReportExportSummaryItem[] = [],
): Array<{ label: string; value: string }> {
	return summaryRows
		.map((item) => ({
			label: item.label,
			value: formatReportDisplayValue(item.value),
		}))
		.filter((item) => item.value !== REPORT_EMPTY_TEXT);
}

export function formatReportDate(
	value?: string | Date | null,
	locale = "en-PH",
): string {
	if (!value) {
		return REPORT_EMPTY_TEXT;
	}

	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return REPORT_EMPTY_TEXT;
	}

	return new Intl.DateTimeFormat(locale, {
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

export function formatReportTime(
	value?: string | Date | null,
	locale = "en-PH",
): string {
	if (!value) {
		return REPORT_EMPTY_TEXT;
	}

	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		const [hours, minutes] = String(value).split(":");
		if (!hours || !minutes) {
			return normalizePrintableValue(value);
		}

		const numericHours = Number(hours);
		const numericMinutes = Number(minutes);
		if (Number.isNaN(numericHours) || Number.isNaN(numericMinutes)) {
			return normalizePrintableValue(value);
		}

		const normalizedDate = new Date();
		normalizedDate.setHours(numericHours, numericMinutes, 0, 0);
		return new Intl.DateTimeFormat(locale, {
			hour: "numeric",
			minute: "2-digit",
		}).format(normalizedDate);
	}

	return new Intl.DateTimeFormat(locale, {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

export function formatReportCurrency(
	value?: number | string | null,
	options: { locale?: string; currency?: string; currencyDisplay?: "symbol" | "code" } = {},
): string {
	const amount = typeof value === "number" ? value : Number(value || 0);

	return new Intl.NumberFormat(options.locale || "en-PH", {
		style: "currency",
		currency: options.currency || "PHP",
		currencyDisplay: options.currencyDisplay || "code",
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	}).format(Number.isFinite(amount) ? amount : 0);
}

function formatCompactReportNumber(value: number) {
	return new Intl.NumberFormat("en-PH", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	}).format(Number.isFinite(value) ? value : 0);
}

export function humanizeEnumValue(value: unknown): string {
	return String(value ?? "")
		.replace(/[_-]+/g, " ")
		.toLowerCase()
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function humanizeReportValue(value: unknown): string {
	if (value === null || value === undefined || value === "") {
		return REPORT_EMPTY_TEXT;
	}

	if (typeof value === "boolean") {
		return value ? "Yes" : "No";
	}

	if (value instanceof Date) {
		return formatReportDate(value);
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return REPORT_EMPTY_TEXT;
		}

		if (/^[A-Z0-9]+(?:[_-][A-Z0-9]+)+$/.test(trimmed)) {
			return humanizeEnumValue(trimmed);
		}

		return trimmed;
	}

	return String(value);
}

export function buildReportFilterSummary(
	items: ReportExportFilterItem[],
): Array<{ label: string; value: string }> {
	return buildFilterLines(items);
}

export function getReportGeneratedByName(user?: User | null) {
	const employeeName = user?.metadata?.employee?.personalInfo;
	if (employeeName?.firstName || employeeName?.lastName) {
		return `${employeeName.firstName || ""} ${employeeName.lastName || ""}`.trim();
	}

	const personName = user?.person?.personalInfo;
	if (personName?.firstName || personName?.lastName) {
		return `${personName.firstName || ""} ${personName.lastName || ""}`.trim();
	}

	if (user?.userName) {
		return user.userName;
	}

	return "System";
}

export function buildReportFileName(fileBaseName: string, ...segments: Array<string | undefined>) {
	const normalizedSegments = [fileBaseName, ...segments]
		.filter(Boolean)
		.map((segment) => sanitizeFileSegment(segment as string))
		.filter(Boolean);

	return `${normalizedSegments.join("-")}.csv`;
}

export function buildReportDownloadFileName(
	fileBaseName: string,
	format: ReportExportFormat = "csv",
) {
	return `${normalizeFileBaseName(fileBaseName)}.${format}`;
}

function buildCsvContent<T>(config: ReportExportConfig<T>, options: ReportExportDialogState) {
	if (config.xlsxSheets?.length) {
		return config.xlsxSheets
			.map((sheet) => {
				const columnValueTypes = sheet.columns.map((column) =>
					inferColumnValueType(column, sheet.rows),
				);
				const title = escapeCsvValue(sheet.title || sheet.name);
				const header = sheet.columns
					.map((column) => escapeCsvValue(normalizeReportHeaderLabel(column.header)))
					.join(",");
				const rows = sheet.rows.length
					? sheet.rows.map((row) =>
							sheet.columns
								.map((column, index) =>
									escapeCsvValue(
										formatReportDisplayValue(resolveColumnValue(column, row), {
											valueType: columnValueTypes[index],
										}),
									),
								)
								.join(","),
						)
					: [escapeCsvValue(sheet.emptyStateMessage || "No records found")];

				return [title, header, ...rows].join("\n");
			})
			.join("\n\n");
	}

	const normalizedRows = normalizeRows(config, options);
	const header = config.columns
		.map((column) => escapeCsvValue(normalizeReportHeaderLabel(column.header)))
		.join(",");
	const csvRows = normalizedRows.map((row) => row.cells.map((cell) => escapeCsvValue(cell)).join(","));

	return [header, ...csvRows].join("\n");
}

async function exportCsv<T>(config: ReportExportConfig<T>, options: ReportExportDialogState) {
	const csv = `${CSV_BOM}${buildCsvContent(config, options)}`;
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	maybeDownloadBlob(blob, buildReportDownloadFileName(config.fileBaseName, "csv"));
}

async function exportXlsx<T>(config: ReportExportConfig<T>, options: ReportExportDialogState) {
	const zipBytes = buildStyledXlsxWorkbook(config, options);
	const blob = new Blob([toArrayBuffer(zipBytes)], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
	maybeDownloadBlob(blob, buildReportDownloadFileName(config.fileBaseName, "xlsx"));
}

type PayrollPdfSectionId = "attendance" | "earnings" | "deductions" | "totals";

interface PayrollPdfLine {
	label: string;
	value: string;
	role: PayrollPdfSectionId;
}

interface PayrollPdfEmployeeBlock {
	identity: PayrollPdfLine[];
	payrollLines: PayrollPdfLine[];
	groupLabel?: string;
}

const PAYROLL_PESO_SYMBOL = "\u20b1";
// Latin-1 and double-encoded peso glyphs from already-broken imported files.
// Detectors only — sanitizePayrollPdfText replaces them with "P"; do not display these strings.
const PAYROLL_PESO_MARKERS = [PAYROLL_PESO_SYMBOL, "â‚±", "Ã¢â€šÂ±"];

function parseReportNumberValue(value: string) {
	const amount = Number(value.replace(/[^0-9.-]/g, ""));
	return Number.isFinite(amount) ? amount : 0;
}

function splitPayrollPdfAmount(value: string) {
	const text = String(value || "");
	const sign = text.startsWith("+") || text.startsWith("-") ? text[0] : "";
	const rest = sign ? text.slice(1) : text;
	const marker = PAYROLL_PESO_MARKERS.find((candidate) => rest.startsWith(candidate));

	if (!marker) {
		return null;
	}

	return {
		sign,
		amount: rest.slice(marker.length).trimStart(),
	};
}

function sanitizePayrollPdfText(value: string) {
	return PAYROLL_PESO_MARKERS.reduce(
		(current, marker) => current.replaceAll(marker, "P"),
		String(value || ""),
	);
}

function formatPayrollPdfMoneyValue(value: string, role: PayrollPdfSectionId, label: string) {
	const amount = parseReportNumberValue(value);
	const isZero = Math.abs(amount) < 0.0001;
	const formatted = new Intl.NumberFormat("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Math.abs(amount));
	const isRollup =
		role === "totals" ||
		/\b(monthly salary|daily salary|gross\s*pay|grosspay|net\s*pay|netpay|total\s*dedn|total\s*deductions?|total\s*receivable|totalreceivable)\b/i.test(
			label,
		);
	const isTotalDeduction = /\b(total\s*dedn|total\s*deductions?)\b/i.test(label);
	const isAttendanceNumber = role === "attendance" && !/\b(pay|salary|amount|amt)\b/i.test(label);

	if (isAttendanceNumber) {
		return new Intl.NumberFormat("en-PH", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
	}

	if (isTotalDeduction) {
		return `-${PAYROLL_PESO_SYMBOL}${formatted}`;
	}

	if (isRollup || isZero) {
		return `${PAYROLL_PESO_SYMBOL}${formatted}`;
	}

	if (role === "deductions") {
		return `-${PAYROLL_PESO_SYMBOL}${formatted}`;
	}

	return `+${PAYROLL_PESO_SYMBOL}${formatted}`;
}

function normalizePayrollPdfLineLabel(header: string) {
	const label = normalizeReportHeaderLabel(header);
	const replacements: Array<[RegExp, string]> = [
		[/^Basic Salary$/i, "Basic Pay"],
		[/^Absent-Amt$/i, "Absent Deduction"],
		[/^UT\/Late-Amt$/i, "Late / Undertime Deduction"],
		[/^Reg OT$/i, "Overtime Pay"],
		[/^SSS Cont$/i, "SSS Contribution"],
		[/^PhilHealth$/i, "PhilHealth Contribution"],
		[/^Pagibig$/i, "Pag-IBIG Contribution"],
		[/^W\/Tax$/i, "Withholding Tax"],
		[/^FBTax$/i, "Fringe Benefit Tax"],
		[/^TOTAL DEDN$/i, "Total Deductions"],
		[/^Net Pay$/i, "NetPay"],
		[/^Gross Pay$/i, "GrossPay"],
		[/^Total Receivable$/i, "TotalReceivable"],
		[/^PHEALTH CONTRI Adjustment$/i, "PhilHealth Contribution Adjustment"],
	];

	return replacements.reduce(
		(current, [pattern, replacement]) => current.replace(pattern, replacement),
		label,
	);
}

function classifyPayrollPdfColumn(header: string): PayrollPdfSectionId {
	if (
		/\b(gross\s*pay|grosspay|net\s*pay|netpay|total\s*dedn|total\s*deductions?|total\s*receivable|totalreceivable)\b/i.test(
			header,
		)
	) {
		return "totals";
	}

	if (/\b(night differential|night diff)\b/i.test(header)) {
		return "earnings";
	}

	if (
		/\b(absent|late|ut|undertime|days?|hrs?|hours?|night differential)\b/i.test(header) &&
		!/\b(amount|pay|salary|allowance|bonus|gift|tax|deduction|loan|contri|contribution)\b/i.test(
			header,
		)
	) {
		return "attendance";
	}

	if (
		/\b(absent|late|undertime|deduction|dedn|tax|sss|philhealth|pag-?ibig|hdmf|loan|usage|calls|insurance|shuttle|uniform|negative|payable|certificate|contribution adjustment|phic)\b/i.test(
			header,
		)
	) {
		return "deductions";
	}

	return "earnings";
}

function shouldAlwaysShowPayrollLine(header: string) {
	return /\b(monthly salary|daily salary|no\.? of days|basic salary|basic pay|gross\s*pay|grosspay|net\s*pay|netpay|total\s*dedn|total\s*deductions?|total\s*receivable|totalreceivable)\b/i.test(
		header,
	);
}

function shouldShowPayrollLine(header: string, value: string) {
	if (shouldAlwaysShowPayrollLine(header)) {
		return true;
	}

	if (!value || value === REPORT_EMPTY_TEXT) {
		return false;
	}

	return Math.abs(parseReportNumberValue(value)) > 0.0001;
}

function usesPayrollRegisterPdf<T>(config: ReportExportConfig<T>) {
	return config.pdfLayout === "payroll-register";
}

function drawPayrollPdfLine(
	page: PDFPage,
	line: PayrollPdfLine,
	x: number,
	y: number,
	width: number,
	labelWidth: number,
	regularFont: PDFFont,
	boldFont: PDFFont,
	fontSize: number,
	color = rgb(0.14, 0.16, 0.2),
) {
	const valueWidth = width - labelWidth - 10;
	drawWrappedText(
		page,
		line.label,
		x,
		y,
		labelWidth,
		regularFont,
		fontSize,
		rgb(0.32, 0.36, 0.43),
	);
	drawPayrollPdfAmount(
		page,
		line.value,
		x + labelWidth + 10,
		y,
		valueWidth,
		boldFont,
		fontSize,
		color,
	);
	return fontSize + 3;
}

function drawPesoMark(
	page: PDFPage,
	x: number,
	y: number,
	font: PDFFont,
	fontSize: number,
	color: ReturnType<typeof rgb>,
) {
	page.drawText("P", { x, y, size: fontSize, font, color });
	const pWidth = font.widthOfTextAtSize("P", fontSize);
	const lineStartX = x - 0.5;
	const lineEndX = x + pWidth * 0.78;
	[fontSize * 0.55, fontSize * 0.37].forEach((offset) => {
		page.drawLine({
			start: { x: lineStartX, y: y + offset },
			end: { x: lineEndX, y: y + offset },
			thickness: Math.max(0.45, fontSize * 0.065),
			color,
		});
	});
	return pWidth;
}

function drawPayrollPdfAmount(
	page: PDFPage,
	value: string,
	x: number,
	y: number,
	width: number,
	font: PDFFont,
	fontSize: number,
	color: ReturnType<typeof rgb>,
) {
	const amountParts = splitPayrollPdfAmount(value);
	if (!amountParts) {
		drawWrappedText(
			page,
			sanitizePayrollPdfText(value),
			x,
			y,
			width,
			font,
			fontSize,
			color,
			"right",
		);
		return;
	}

	const { sign, amount } = amountParts;
	const signWidth = sign ? font.widthOfTextAtSize(sign, fontSize) : 0;
	const amountWidth = font.widthOfTextAtSize(amount, fontSize);
	const pesoWidth = font.widthOfTextAtSize("P", fontSize);
	const gap = 1.5;
	const totalWidth = signWidth + pesoWidth + amountWidth + gap;
	let cursorX = x + width - totalWidth;

	if (sign) {
		page.drawText(sign, { x: cursorX, y, size: fontSize, font, color });
		cursorX += signWidth;
	}
	cursorX += drawPesoMark(page, cursorX, y, font, fontSize, color) + gap;
	page.drawText(amount, { x: cursorX, y, size: fontSize, font, color });
}

function measurePayrollPdfAmount(value: string, font: PDFFont, fontSize: number) {
	const amountParts = splitPayrollPdfAmount(value);
	if (!amountParts) {
		return font.widthOfTextAtSize(sanitizePayrollPdfText(value), fontSize);
	}

	const { sign, amount } = amountParts;
	const signWidth = sign ? font.widthOfTextAtSize(sign, fontSize) : 0;
	const pesoWidth = font.widthOfTextAtSize("P", fontSize);
	const amountWidth = font.widthOfTextAtSize(amount, fontSize);
	const gap = 1.5;
	return signWidth + pesoWidth + amountWidth + gap;
}

async function exportPayrollRegisterPdf<T>(
	config: ReportExportConfig<T>,
	options: ReportExportDialogState,
) {
	const pdf = await PDFDocument.create();
	const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
	const embeddedLogo = await embedLogo(pdf, config.logoSrc);
	const pageWidth = 595;
	const pageHeight = 842;
	const marginX = 34;
	const marginTop = 32;
	const marginBottom = 34;
	const footerHeight = 18;
	const contentBottom = marginBottom + footerHeight;
	const contentWidth = pageWidth - marginX * 2;
	const generatedAt = config.generatedAt || new Date();
	const generatedBy = config.generatedBy || "System";
	const filterLines = options.includeFiltersSummary ? buildFilterLines(config.filtersSummary) : [];
	const summaryLines = buildSummaryLines(config.summaryRows);
	const normalizedRows = normalizeRows(config, options);
	const pageNumbers: Array<{ page: PDFPage; index: number }> = [];
	const lineColor = rgb(0.82, 0.84, 0.87);
	const softFill = rgb(0.985, 0.988, 0.992);
	const redFill = rgb(0.753, 0, 0.043);

	let page = pdf.addPage([pageWidth, pageHeight]);
	let pageIndex = 1;
	let cursorY = pageHeight - marginTop;

	const getFilterValue = (label: string) =>
		filterLines.find((line) => line.label.toLowerCase() === label.toLowerCase())?.value;

	const drawFooter = (targetPage: PDFPage, targetIndex: number, totalPages: number) => {
		const footerY = marginBottom - 4;
		targetPage.drawText(`Employees: ${normalizedRows.length}`, {
			x: marginX,
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
		const generatedByText = `Generated by: ${generatedBy}`;
		targetPage.drawText(generatedByText, {
			x: pageWidth / 2 - regularFont.widthOfTextAtSize(generatedByText, 8) / 2,
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
		const pageLabel = `Page ${targetIndex} of ${totalPages}`;
		targetPage.drawText(pageLabel, {
			x: pageWidth - marginX - regularFont.widthOfTextAtSize(pageLabel, 8),
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
	};

	const drawHeader = () => {
		pageNumbers.push({ page, index: pageIndex });
		let titleX = marginX;
		let titleWidth = contentWidth;
		if (embeddedLogo) {
			const logoDimensions = embeddedLogo.scale(0.18);
			const logoWidth = Math.min(80, logoDimensions.width);
			const logoScale = logoWidth / logoDimensions.width;
			const logoHeight = logoDimensions.height * logoScale;
			page.drawImage(embeddedLogo, {
				x: marginX,
				y: pageHeight - marginTop - logoHeight + 4,
				width: logoWidth,
				height: logoHeight,
			});
			titleX += logoWidth + 14;
			titleWidth -= logoWidth + 14;
		}

		drawWrappedText(
			page,
			config.organizationName || "BANDAI NAMCO PHILIPPINES INC.",
			titleX,
			cursorY,
			titleWidth,
			boldFont,
			10.5,
			rgb(0.05, 0.08, 0.13),
		);
		cursorY -= 15;
		drawWrappedText(
			page,
			config.title,
			titleX,
			cursorY,
			titleWidth,
			boldFont,
			13.5,
			rgb(0.05, 0.08, 0.13),
		);
		cursorY -= 22;

		const metadata = [
			getFilterValue("Payroll Period") ? `Period: ${getFilterValue("Payroll Period")}` : null,
			getFilterValue("Period Range") ? `Range: ${getFilterValue("Period Range")}` : null,
			getFilterValue("Pay Date") ? `Pay Date: ${getFilterValue("Pay Date")}` : null,
		].filter(Boolean) as string[];
		if (metadata.length) {
			drawWrappedText(
				page,
				metadata.join("   |   "),
				marginX,
				cursorY,
				contentWidth,
				regularFont,
				8.5,
				rgb(0.27, 0.31, 0.37),
			);
			cursorY -= 13;
		}

		page.drawText(`Prepared: ${formatReportDate(generatedAt)} ${formatReportTime(generatedAt)}`, {
			x: marginX,
			y: cursorY,
			size: 8.5,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
		cursorY -= 16;

		page.drawLine({
			start: { x: marginX, y: cursorY },
			end: { x: pageWidth - marginX, y: cursorY },
			thickness: 0.9,
			color: lineColor,
		});
		cursorY -= 16;
	};

	const startNewPage = () => {
		page = pdf.addPage([pageWidth, pageHeight]);
		pageIndex += 1;
		cursorY = pageHeight - marginTop;
		drawHeader();
	};

	const ensureSpace = (requiredHeight: number) => {
		if (cursorY - requiredHeight < contentBottom) {
			startNewPage();
		}
	};

	const buildEmployeeBlock = (row: NormalizedExportRow<T>): PayrollPdfEmployeeBlock => {
		const identity: PayrollPdfLine[] = [];
		const payrollLines: PayrollPdfLine[] = [];

		config.columns.forEach((column, index) => {
			const header = normalizePayrollPdfLineLabel(column.header);
			const value = row.cells[index] || REPORT_EMPTY_TEXT;
			if (index < 6) {
				identity.push({ label: header, value, role: "attendance" });
				return;
			}
			if (!shouldShowPayrollLine(header, value)) {
				return;
			}
			const section = classifyPayrollPdfColumn(header);
			payrollLines.push({
				label: header,
				value: formatPayrollPdfMoneyValue(value, section, header),
				role: section,
			});
		});

		return { identity, payrollLines, groupLabel: row.groupLabel };
	};

	const estimateBlockHeight = (block: PayrollPdfEmployeeBlock) =>
		88 + Math.max(block.payrollLines.length, 1) * 11 + 16;

	const drawEmployeeBlock = (block: PayrollPdfEmployeeBlock) => {
		ensureSpace(Math.min(estimateBlockHeight(block), pageHeight - marginTop - contentBottom));
		const blockTop = cursorY;
		const blockX = marginX;
		const blockWidth = contentWidth;
		const employeeName =
			block.identity.find((line) => /employee name/i.test(line.label))?.value ||
			block.identity[2]?.value ||
			"Employee";
		const employeeCode =
			block.identity.find((line) => /emp/i.test(line.label))?.value || block.identity[1]?.value;
		const netPayLine = block.payrollLines.find((line) => /^net\s*pay$/i.test(line.label));
		const headerFontSize = 8.5;
		const headerGap = 10;
		const headerRightX = blockX + blockWidth - 10;
		const netPayLabel = "NetPay";
		const netPayLabelWidth = boldFont.widthOfTextAtSize(netPayLabel, headerFontSize) + 4;
		const amountWidth = netPayLine
			? Math.min(
					150,
					Math.max(
						112,
						measurePayrollPdfAmount(netPayLine.value, boldFont, headerFontSize) + 8,
					),
				)
			: 0;
		const amountX = headerRightX - amountWidth;
		const netPayLabelX = netPayLine ? amountX - headerGap - netPayLabelWidth : headerRightX;
		const employeeCodeWidth = 72;
		const employeeCodeX = netPayLine
			? netPayLabelX - headerGap - employeeCodeWidth
			: headerRightX - employeeCodeWidth;
		const employeeNameX = blockX + 10;
		const employeeNameWidth = Math.max(120, employeeCodeX - employeeNameX - 14);

		page.drawRectangle({
			x: blockX,
			y: cursorY - 28,
			width: blockWidth,
			height: 28,
			color: softFill,
			borderColor: lineColor,
			borderWidth: 0.75,
		});
		page.drawRectangle({
			x: blockX,
			y: cursorY - 28,
			width: 3,
			height: 28,
			color: redFill,
		});
		page.drawText(fitTextToWidth(employeeName, employeeNameWidth, boldFont, 10.5), {
			x: employeeNameX,
			y: cursorY - 10,
			size: 10.5,
			font: boldFont,
			color: rgb(0.05, 0.08, 0.13),
		});
		if (employeeCode) {
			const fittedEmployeeCode = fitTextToWidth(
				employeeCode,
				employeeCodeWidth,
				boldFont,
				headerFontSize,
			);
			page.drawText(fittedEmployeeCode, {
				x:
					employeeCodeX +
					Math.max(
						employeeCodeWidth -
							boldFont.widthOfTextAtSize(fittedEmployeeCode, headerFontSize),
						0,
					),
				y: cursorY - 10,
				size: headerFontSize,
				font: boldFont,
				color: rgb(0.23, 0.27, 0.32),
			});
		}
		if (netPayLine) {
			page.drawText(netPayLabel, {
				x: netPayLabelX,
				y: cursorY - 10,
				size: headerFontSize,
				font: boldFont,
				color: rgb(0.55, 0.04, 0.05),
			});
			drawPayrollPdfAmount(
				page,
				netPayLine.value,
				amountX,
				cursorY - 10,
				amountWidth,
				boldFont,
				headerFontSize,
				rgb(0.55, 0.04, 0.05),
			);
		}
		cursorY -= 40;

		const identityLines = block.identity.filter(
			(line) => !/^(no\.?|emp\.?\s*no\.?|employee name)$/i.test(line.label),
		);
		const identityColumnWidth = (blockWidth - 14) / 3;
		identityLines.slice(0, 4).forEach((line, index) => {
			const column = index % 3;
			const row = Math.floor(index / 3);
			const x = blockX + column * (identityColumnWidth + 7);
			const y = cursorY - row * 21;
			page.drawText(line.label, {
				x,
				y,
				size: 7.2,
				font: regularFont,
				color: rgb(0.38, 0.42, 0.48),
			});
			drawWrappedText(
				page,
				line.value,
				x,
				y - 10,
				identityColumnWidth,
				boldFont,
				8,
				rgb(0.12, 0.14, 0.18),
			);
		});
		cursorY -= identityLines.length > 3 ? 48 : 28;

		const labelWidth = blockWidth * 0.62;
		page.drawText("Payroll Line", {
			x: blockX,
			y: cursorY,
			size: 7.8,
			font: boldFont,
			color: rgb(0.2, 0.24, 0.3),
		});
		page.drawText("Amount", {
			x: blockX + blockWidth - boldFont.widthOfTextAtSize("Amount", 7.8),
			y: cursorY,
			size: 7.8,
			font: boldFont,
			color: rgb(0.2, 0.24, 0.3),
		});
		cursorY -= 9;
		page.drawLine({
			start: { x: blockX, y: cursorY },
			end: { x: blockX + blockWidth, y: cursorY },
			thickness: 0.55,
			color: lineColor,
		});
		cursorY -= 10;

		block.payrollLines.forEach((line) => {
			ensureSpace(14);
			const isNetLine = /^net\s*pay$/i.test(line.label);
			const isRollup = line.role === "totals";
			const valueColor =
				line.role === "deductions"
					? rgb(0.72, 0.03, 0.05)
					: isNetLine
						? rgb(0.03, 0.43, 0.2)
						: rgb(0.12, 0.14, 0.18);
			const usedHeight = drawPayrollPdfLine(
				page,
				line,
				blockX,
				cursorY,
				blockWidth,
				labelWidth,
				isRollup ? boldFont : regularFont,
				isRollup ? boldFont : regularFont,
				7.8,
				valueColor,
			);
			cursorY -= Math.max(usedHeight, 10.5);
		});

		page.drawLine({
			start: { x: blockX, y: cursorY },
			end: { x: blockX + blockWidth, y: cursorY },
			thickness: 0.75,
			color: lineColor,
		});
		cursorY -= 16;

		if (blockTop - cursorY < 92) {
			cursorY -= 10;
		}
	};

	drawHeader();

	if (!normalizedRows.length) {
		page.drawText(config.emptyStateMessage || "No payroll records found", {
			x: marginX,
			y: cursorY,
			size: 11,
			font: regularFont,
			color: rgb(0.45, 0.45, 0.45),
		});
	} else {
		let currentGroupLabel: string | undefined;
		normalizedRows.forEach((row) => {
			if (row.groupLabel && row.groupLabel !== currentGroupLabel) {
				currentGroupLabel = row.groupLabel;
				ensureSpace(28);
				page.drawText(`Section: ${currentGroupLabel}`, {
					x: marginX,
					y: cursorY,
					size: 8.5,
					font: boldFont,
					color: rgb(0.2, 0.24, 0.3),
				});
				cursorY -= 14;
			}
			drawEmployeeBlock(buildEmployeeBlock(row));
		});
	}

	if (summaryLines.length) {
		ensureSpace(28 + summaryLines.length * 12);
		page.drawText("Report Totals", {
			x: marginX,
			y: cursorY,
			size: 9,
			font: boldFont,
			color: rgb(0.12, 0.14, 0.18),
		});
		cursorY -= 14;
		summaryLines.forEach((line) => {
			cursorY -= drawPayrollPdfLine(
				page,
				{ ...line, role: "totals" },
				marginX,
				cursorY,
				contentWidth,
				contentWidth * 0.5,
				regularFont,
				boldFont,
				8.4,
			);
		});
	}

	const totalPages = pageNumbers.length;
	pageNumbers.forEach(({ page: targetPage, index }) => drawFooter(targetPage, index, totalPages));

	const bytes = await pdf.save();
	const blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
	maybeDownloadBlob(blob, buildReportDownloadFileName(config.fileBaseName, "pdf"));
}

async function exportSectionedPdf<T>(
	config: ReportExportConfig<T>,
	options: ReportExportDialogState,
) {
	const pdf = await PDFDocument.create();
	const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
	const embeddedLogo = await embedLogo(pdf, config.logoSrc);
	const isPortrait = config.orientation === "portrait";
	const pageWidth = isPortrait ? 595 : 842;
	const pageHeight = isPortrait ? 842 : 595;
	const marginX = isPortrait ? 28 : 34;
	const marginTop = isPortrait ? 30 : 34;
	const marginBottom = 34;
	const footerHeight = 20;
	const contentBottom = marginBottom + footerHeight;
	const tableWidth = pageWidth - marginX * 2;
	const headerFontSize = isPortrait ? 15 : 16;
	const metaFontSize = 9;
	const cellFontSize = 8;
	const headerCellFontSize = 7.5;
	const rowPaddingX = 5;
	const rowPaddingY = 5;
	const tableLineGap = 2;
	const generatedAt = config.generatedAt || new Date();
	const generatedBy = config.generatedBy || "System";
	const filterLines = options.includeFiltersSummary ? buildFilterLines(config.filtersSummary) : [];
	const sections = config.xlsxSheets || [];
	const totalRowCount = sections.reduce((sum, section) => sum + section.rows.length, 0);
	const pageNumbers: Array<{ page: PDFPage; index: number }> = [];
	const tableBorderColor = rgb(0.82, 0.84, 0.88);
	const headerBackgroundColor = rgb(0.95, 0.96, 0.97);
	const zebraBackgroundColor = rgb(0.985, 0.988, 0.992);

	let page = pdf.addPage([pageWidth, pageHeight]);
	let pageIndex = 1;
	let cursorY = pageHeight - marginTop;

	const drawFooter = (targetPage: PDFPage, targetIndex: number, totalPages: number) => {
		const footerY = marginBottom - 4;

		targetPage.drawText(`Entries: ${totalRowCount}`, {
			x: marginX,
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});

		const generatedByText = `Prepared by: ${generatedBy}`;
		targetPage.drawText(generatedByText, {
			x: pageWidth / 2 - regularFont.widthOfTextAtSize(generatedByText, 8) / 2,
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});

		const pageLabel = `Page ${targetIndex} of ${totalPages}`;
		targetPage.drawText(pageLabel, {
			x: pageWidth - marginX - regularFont.widthOfTextAtSize(pageLabel, 8),
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
	};

	const drawPageHeader = () => {
		pageNumbers.push({ page, index: pageIndex });
		let reservedLogoWidth = 0;
		let reservedLogoHeight = 0;
		let titleX = marginX;

		if (embeddedLogo) {
			const logoDimensions = embeddedLogo.scale(0.2);
			const maxLogoWidth = isPortrait ? 86 : 96;
			const scale =
				logoDimensions.width > maxLogoWidth ? maxLogoWidth / logoDimensions.width : 1;
			const logoWidth = logoDimensions.width * scale;
			const logoHeight = logoDimensions.height * scale;
			reservedLogoWidth = logoWidth + 18;
			reservedLogoHeight = logoHeight + 8;
			titleX = marginX + reservedLogoWidth;

			page.drawImage(embeddedLogo, {
				x: marginX,
				y: pageHeight - marginTop - logoHeight + 3,
				width: logoWidth,
				height: logoHeight,
			});
		}

		const titleLineCount = drawWrappedText(
			page,
			config.title,
			titleX,
			cursorY,
			tableWidth - reservedLogoWidth,
			boldFont,
			headerFontSize,
			rgb(0.1, 0.1, 0.1),
		);
		cursorY -= Math.max(20, reservedLogoHeight, titleLineCount * (headerFontSize + 3));

		page.drawText(`Prepared: ${formatReportDate(generatedAt)} ${formatReportTime(generatedAt)}`, {
			x: marginX,
			y: cursorY,
			size: metaFontSize,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
		cursorY -= 12;

		filterLines.forEach((line) => {
			page.drawText(`${line.label}: ${line.value}`, {
				x: marginX,
				y: cursorY,
				size: metaFontSize,
				font: regularFont,
				color: rgb(0.35, 0.35, 0.35),
			});
			cursorY -= 11;
		});

		page.drawLine({
			start: { x: marginX, y: cursorY - 4 },
			end: { x: pageWidth - marginX, y: cursorY - 4 },
			thickness: 1,
			color: rgb(0.86, 0.86, 0.86),
		});
		cursorY -= 18;
	};

	const startNewPage = () => {
		page = pdf.addPage([pageWidth, pageHeight]);
		pageIndex += 1;
		cursorY = pageHeight - marginTop;
		drawPageHeader();
	};

	const ensureSpace = (requiredHeight: number) => {
		if (cursorY - requiredHeight < contentBottom) {
			startNewPage();
		}
	};

	const drawSectionTitle = (title: string) => {
		ensureSpace(36);
		page.drawText(title, {
			x: marginX,
			y: cursorY,
			size: 10.5,
			font: boldFont,
			color: rgb(0.1, 0.1, 0.1),
		});
		cursorY -= 18;
	};

	const drawTableHeader = <Row,>(
		columns: ReportExportColumn<Row>[],
		columnWidths: number[],
	) => {
		const headerLineCounts = columns.map((column, index) =>
			wrapTextToWidth(
				normalizeReportHeaderLabel(column.header),
				Math.max(columnWidths[index] - rowPaddingX * 2, 12),
				boldFont,
				headerCellFontSize,
			).length,
		);
		const headerHeight =
			Math.max(...headerLineCounts, 1) * (headerCellFontSize + tableLineGap) +
			rowPaddingY * 2;
		ensureSpace(headerHeight + 10);
		const headerTop = cursorY;
		const headerBottom = headerTop - headerHeight;

		page.drawRectangle({
			x: marginX,
			y: headerBottom,
			width: tableWidth,
			height: headerHeight,
			color: headerBackgroundColor,
			borderColor: tableBorderColor,
			borderWidth: 0.75,
		});

		let columnX = marginX;
		columns.forEach((column, index) => {
			drawWrappedText(
				page,
				normalizeReportHeaderLabel(column.header),
				columnX + rowPaddingX,
				headerTop - rowPaddingY - headerCellFontSize + 1,
				columnWidths[index] - rowPaddingX * 2,
				boldFont,
				headerCellFontSize,
				rgb(0.2, 0.2, 0.2),
				column.align || "left",
			);

			if (index > 0) {
				page.drawLine({
					start: { x: columnX, y: headerTop },
					end: { x: columnX, y: headerBottom },
					thickness: 0.75,
					color: tableBorderColor,
				});
			}
			columnX += columnWidths[index];
		});

		cursorY = headerBottom;
	};

	const drawSheet = <Row,>(section: ReportExportWorksheetConfig<Row>, sectionIndex: number) => {
		const rows = section.rows;
		const columns = section.columns;
		const columnValueTypes = columns.map((column) => inferColumnValueType(column, rows));
		const normalizedRows = rows.map((row) =>
			columns.map((column, index) =>
				formatReportDisplayValue(resolveColumnValue(column, row), {
					valueType: columnValueTypes[index],
				}),
			),
		);
		const columnWeights = columns.map((column, index) =>
			estimateColumnWeight(
				normalizeReportHeaderLabel(column.header),
				normalizedRows.map((row) => row[index] || ""),
				column.widthWeight,
			),
		);
		const totalWeight =
			columnWeights.reduce((sum, weight) => sum + weight, 0) || Math.max(columns.length, 1);
		const columnWidths = columnWeights.map((weight) => (tableWidth * weight) / totalWeight);

		if (sectionIndex > 0) {
			cursorY -= 22;
		}
		drawSectionTitle(section.title || section.name);
		drawTableHeader(columns, columnWidths);

		if (!rows.length) {
			ensureSpace(22);
			page.drawText(section.emptyStateMessage || "No records found", {
				x: marginX,
				y: cursorY - 12,
				size: 10,
				font: regularFont,
				color: rgb(0.45, 0.45, 0.45),
			});
			cursorY -= 24;
			return;
		}

		normalizedRows.forEach((cells, rowIndex) => {
			const rowLineCount = Math.max(
				...cells.map((value, index) =>
					wrapTextToWidth(
						value,
						Math.max(columnWidths[index] - rowPaddingX * 2, 12),
						regularFont,
						cellFontSize,
					).length,
				),
				1,
			);
			const rowHeight = rowLineCount * (cellFontSize + tableLineGap) + rowPaddingY * 2;
			ensureSpace(rowHeight);
			const rowTop = cursorY;
			const rowBottom = rowTop - rowHeight;

			page.drawRectangle({
				x: marginX,
				y: rowBottom,
				width: tableWidth,
				height: rowHeight,
				color: rowIndex % 2 === 0 ? rgb(1, 1, 1) : zebraBackgroundColor,
			});
			page.drawLine({
				start: { x: marginX, y: rowBottom },
				end: { x: marginX + tableWidth, y: rowBottom },
				thickness: 0.75,
				color: tableBorderColor,
			});

			let cellX = marginX;
			columns.forEach((column, index) => {
				page.drawLine({
					start: { x: cellX, y: rowTop },
					end: { x: cellX, y: rowBottom },
					thickness: 0.75,
					color: tableBorderColor,
				});
				drawWrappedText(
					page,
					cells[index],
					cellX + rowPaddingX,
					rowTop - rowPaddingY - cellFontSize + 1,
					columnWidths[index] - rowPaddingX * 2,
					regularFont,
					cellFontSize,
					rgb(0.2, 0.2, 0.2),
					column.align || "left",
				);
				cellX += columnWidths[index];
			});
			page.drawLine({
				start: { x: marginX + tableWidth, y: rowTop },
				end: { x: marginX + tableWidth, y: rowBottom },
				thickness: 0.75,
				color: tableBorderColor,
			});
			cursorY = rowBottom;
		});
	};

	drawPageHeader();
	sections.forEach((section, index) => drawSheet(section, index));

	const totalPages = pageNumbers.length;
	pageNumbers.forEach(({ page: targetPage, index }) => drawFooter(targetPage, index, totalPages));

	const bytes = await pdf.save();
	const blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
	maybeDownloadBlob(blob, buildReportDownloadFileName(config.fileBaseName, "pdf"));
}

async function exportPdf<T>(config: ReportExportConfig<T>, options: ReportExportDialogState) {
	if (usesPayrollRegisterPdf(config)) {
		await exportPayrollRegisterPdf(config, options);
		return;
	}

	if (config.xlsxSheets?.length && config.pdfLayout !== "payroll-register") {
		await exportSectionedPdf(config, options);
		return;
	}

	const pdf = await PDFDocument.create();
	const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
	const embeddedLogo = await embedLogo(pdf, config.logoSrc);
	const isPortrait = config.orientation === "portrait";
	const isPayrollRegisterLayout = config.pdfLayout === "payroll-register";
	const pageWidth = isPayrollRegisterLayout ? 1191 : isPortrait ? 595 : 842;
	const pageHeight = isPayrollRegisterLayout ? 842 : isPortrait ? 842 : 595;
	const marginX = isPayrollRegisterLayout ? 24 : isPortrait ? 28 : 34;
	const marginTop = isPayrollRegisterLayout ? 26 : isPortrait ? 30 : 34;
	const marginBottom = isPayrollRegisterLayout ? 30 : 34;
	const footerHeight = 20;
	const contentBottom = marginBottom + footerHeight;
	const tableWidth = pageWidth - marginX * 2;
	const headerFontSize = isPayrollRegisterLayout ? 10.5 : isPortrait ? 15 : 16;
	const metaFontSize = isPayrollRegisterLayout ? 8 : 9;
	const cellFontSize = isPayrollRegisterLayout ? 6.3 : config.columns.length >= 10 ? 7 : 8;
	const headerCellFontSize = isPayrollRegisterLayout
		? 6.4
		: config.columns.length >= 10
			? 6.5
			: 7.5;
	const rowPaddingX = isPayrollRegisterLayout ? 3 : 5;
	const rowPaddingY = isPayrollRegisterLayout ? 3.5 : 5;
	const tableLineGap = isPayrollRegisterLayout ? 1.3 : 2;
	const generatedAt = config.generatedAt || new Date();
	const generatedBy = config.generatedBy || "System";
	const filterLines = options.includeFiltersSummary ? buildFilterLines(config.filtersSummary) : [];
	const summaryLines = buildSummaryLines(config.summaryRows);
	const normalizedRows = normalizeRows(config, options);
	const shouldDrawPayrollGroupedSections =
		isPayrollRegisterLayout && normalizedRows.some((row) => row.groupLabel);
	const shouldDrawGroupedSections = normalizedRows.some((row) => row.groupLabel);
	const emptyStateMessage = config.emptyStateMessage || "No records found";
	const pageNumbers: Array<{ page: PDFPage; index: number }> = [];
	const tableBorderColor = rgb(0.82, 0.84, 0.88);
	const headerBackgroundColor = isPayrollRegisterLayout
		? rgb(0.89, 0.91, 0.94)
		: rgb(0.95, 0.96, 0.97);
	const zebraBackgroundColor = isPayrollRegisterLayout
		? rgb(0.975, 0.98, 0.988)
		: rgb(0.985, 0.988, 0.992);

	const getColumnWeights = (
		columns: ReportExportColumn<T>[],
		rows: NormalizedExportRow<T>[],
	) =>
		columns.map((column, index) =>
			estimateColumnWeight(
				normalizeReportHeaderLabel(column.header),
				rows.map((row) => row.cells[index] || ""),
				column.widthWeight,
			),
		);
	const getColumnWidths = (
		columns: ReportExportColumn<T>[],
		rows: NormalizedExportRow<T>[],
	) => {
		const weights = getColumnWeights(columns, rows);
		const totalWeight =
			weights.reduce((sum, weight) => sum + weight, 0) || Math.max(columns.length, 1);
		return weights.map((weight) => (tableWidth * weight) / totalWeight);
	};

	interface PdfColumnBand {
		label?: string;
		columns: ReportExportColumn<T>[];
		rows: NormalizedExportRow<T>[];
		columnWidths: number[];
	}

	const buildPayrollRegisterBands = (): PdfColumnBand[] => {
		if (!isPayrollRegisterLayout || config.columns.length <= 18) {
			return [
				{
					columns: config.columns,
					rows: normalizedRows,
					columnWidths: getColumnWidths(config.columns, normalizedRows),
				},
			];
		}

		const frozenColumnCount = Math.min(6, config.columns.length);
		const frozenColumns = config.columns.slice(0, frozenColumnCount);
		const detailColumns = config.columns.slice(frozenColumnCount);
		const allWeights = getColumnWeights(config.columns, normalizedRows);
		const frozenWeight = allWeights
			.slice(0, frozenColumnCount)
			.reduce((sum, weight) => sum + weight, 0);
		const maxDetailWeight = Math.max(28 - frozenWeight, 12);
		const detailBands: Array<{ start: number; end: number }> = [];
		let bandStart = 0;
		let bandWeight = 0;

		detailColumns.forEach((_, detailIndex) => {
			const originalIndex = frozenColumnCount + detailIndex;
			const weight = allWeights[originalIndex] || 1;
			if (detailIndex > bandStart && bandWeight + weight > maxDetailWeight) {
				detailBands.push({ start: bandStart, end: detailIndex });
				bandStart = detailIndex;
				bandWeight = 0;
			}
			bandWeight += weight;
		});

		if (bandStart < detailColumns.length) {
			detailBands.push({ start: bandStart, end: detailColumns.length });
		}

		return detailBands.map((band, bandIndex) => {
			const visibleIndexes = [
				...frozenColumns.map((_, index) => index),
				...Array.from(
					{ length: band.end - band.start },
					(_, index) => frozenColumnCount + band.start + index,
				),
			];
			const columns = visibleIndexes.map((index) => config.columns[index]);
			const rows = normalizedRows.map((row) => ({
				...row,
				cells: visibleIndexes.map((index) => row.cells[index] || ""),
			}));
			const firstDetailIndex = visibleIndexes[frozenColumnCount];
			const firstHeader = normalizeReportHeaderLabel(config.columns[firstDetailIndex].header);
			const lastHeader = normalizeReportHeaderLabel(
				config.columns[visibleIndexes[visibleIndexes.length - 1]].header,
			);

			return {
				label: `Column Set ${bandIndex + 1} of ${detailBands.length}: ${firstHeader} to ${lastHeader}`,
				columns,
				rows,
				columnWidths: getColumnWidths(columns, rows),
			};
		});
	};

	const columnBands = buildPayrollRegisterBands();
	let activeColumns = columnBands[0]?.columns || config.columns;
	let activeRows = columnBands[0]?.rows || normalizedRows;
	let columnWidths = columnBands[0]?.columnWidths || getColumnWidths(config.columns, normalizedRows);
	let activeBandLabel = columnBands[0]?.label;

	let page = pdf.addPage([pageWidth, pageHeight]);
	let pageIndex = 1;
	let cursorY = pageHeight - marginTop;
	let currentGroupLabel: string | undefined;

	const drawFooter = (targetPage: PDFPage, targetIndex: number, totalPages: number) => {
		const footerY = marginBottom - 4;

		targetPage.drawText(`Total Rows: ${normalizedRows.length}`, {
			x: marginX,
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});

		const generatedByText = `Generated by: ${generatedBy}`;
		targetPage.drawText(generatedByText, {
			x: pageWidth / 2 - regularFont.widthOfTextAtSize(generatedByText, 8) / 2,
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});

		const pageLabel = `Page ${targetIndex} of ${totalPages}`;
		targetPage.drawText(pageLabel, {
			x: pageWidth - marginX - regularFont.widthOfTextAtSize(pageLabel, 8),
			y: footerY,
			size: 8,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
	};

	const getFilterValue = (label: string) =>
		filterLines.find((line) => line.label.toLowerCase() === label.toLowerCase())?.value;

	const drawCompactHeader = () => {
		pageNumbers.push({ page, index: pageIndex });
		const organizationName = config.organizationName || DEFAULT_ORGANIZATION_NAME;

		page.drawText(organizationName, {
			x: marginX,
			y: cursorY - 2,
			size: 11,
			font: boldFont,
			color: rgb(0.05, 0.08, 0.13),
		});
		cursorY -= 14;

		page.drawText(config.title.toUpperCase(), {
			x: marginX,
			y: cursorY,
			size: 10,
			font: boldFont,
			color: rgb(0.05, 0.08, 0.13),
		});
		cursorY -= 16;

		const period = getFilterValue("Period Range") || getFilterValue("Date Range");
		const payDate = getFilterValue("Pay Date");
		const department = getFilterValue("Department");
		const metadataParts = [
			period ? `Payroll Period: ${period}` : null,
			payDate ? `Pay Date: ${payDate}` : null,
		].filter(Boolean) as string[];

		if (metadataParts.length) {
			page.drawText(metadataParts.join("     "), {
				x: marginX,
				y: cursorY,
				size: metaFontSize,
				font: boldFont,
				color: rgb(0.08, 0.1, 0.14),
			});
			cursorY -= 14;
		}

		const scopeParts = [
			department ? `Department: ${department}` : null,
		].filter(Boolean) as string[];

		if (scopeParts.length) {
			page.drawText(scopeParts.join("     "), {
				x: marginX,
				y: cursorY,
				size: metaFontSize,
				font: regularFont,
				color: rgb(0.1, 0.12, 0.16),
			});
			cursorY -= 18;
		} else {
			cursorY -= 6;
		}

		if (activeBandLabel) {
			page.drawText(activeBandLabel, {
				x: marginX,
				y: cursorY,
				size: 7.5,
				font: boldFont,
				color: rgb(0.22, 0.27, 0.34),
			});
			cursorY -= 13;
		}
	};

	const drawPageHeader = () => {
		if (isPayrollRegisterLayout) {
			drawCompactHeader();
			return;
		}

		pageNumbers.push({ page, index: pageIndex });
		let reservedLogoWidth = 0;

		if (embeddedLogo) {
			const logoDimensions = embeddedLogo.scale(0.2);
			const maxLogoWidth = isPortrait ? 86 : 96;
			const scale =
				logoDimensions.width > maxLogoWidth ? maxLogoWidth / logoDimensions.width : 1;
			const logoWidth = logoDimensions.width * scale;
			const logoHeight = logoDimensions.height * scale;
			reservedLogoWidth = logoWidth + 18;

			page.drawImage(embeddedLogo, {
				x: pageWidth - marginX - logoWidth,
				y: pageHeight - marginTop - logoHeight + 3,
				width: logoWidth,
				height: logoHeight,
			});
		}

		const organizationName = config.organizationName || DEFAULT_ORGANIZATION_NAME;
		const organizationLineCount = drawWrappedText(
			page,
			organizationName,
			marginX,
			cursorY,
			tableWidth - reservedLogoWidth,
			boldFont,
			isPortrait ? 10 : 11,
			rgb(0.05, 0.08, 0.13),
		);
		cursorY -= Math.max(14, organizationLineCount * 13);

		const titleLineCount = drawWrappedText(
			page,
			config.title,
			marginX,
			cursorY,
			tableWidth - reservedLogoWidth,
			boldFont,
			headerFontSize,
			rgb(0.1, 0.1, 0.1),
		);
		cursorY -= Math.max(20, titleLineCount * (headerFontSize + 3));

		page.drawText(`Generated On: ${formatReportDate(generatedAt)} ${formatReportTime(generatedAt)}`, {
			x: marginX,
			y: cursorY,
			size: metaFontSize,
			font: regularFont,
			color: rgb(0.35, 0.35, 0.35),
		});
		cursorY -= 12;

		if (filterLines.length) {
			page.drawText("Filters Applied:", {
				x: marginX,
				y: cursorY,
				size: metaFontSize,
				font: boldFont,
				color: rgb(0.25, 0.25, 0.25),
			});
			cursorY -= 12;

			filterLines.forEach((line) => {
				page.drawText(`${line.label}: ${line.value}`, {
					x: marginX + 4,
					y: cursorY,
					size: metaFontSize,
					font: regularFont,
					color: rgb(0.35, 0.35, 0.35),
				});
				cursorY -= 11;
			});
		}

		if (config.compactSummaryLine) {
			const compactSummaryLines = wrapTextToWidth(
				config.compactSummaryLine,
				tableWidth - reservedLogoWidth,
				regularFont,
				metaFontSize,
			);
			compactSummaryLines.forEach((line) => {
				page.drawText(line, {
					x: marginX,
					y: cursorY,
					size: metaFontSize,
					font: regularFont,
					color: rgb(0.35, 0.35, 0.35),
				});
				cursorY -= 11;
			});
		} else if (summaryLines.length) {
			page.drawText("Summary:", {
				x: marginX,
				y: cursorY,
				size: metaFontSize,
				font: boldFont,
				color: rgb(0.25, 0.25, 0.25),
			});
			cursorY -= 12;

			summaryLines.forEach((line) => {
				page.drawText(`${line.label}: ${line.value}`, {
					x: marginX + 4,
					y: cursorY,
					size: metaFontSize,
					font: regularFont,
					color: rgb(0.35, 0.35, 0.35),
				});
				cursorY -= 11;
			});
		}

		page.drawLine({
			start: { x: marginX, y: cursorY - 4 },
			end: { x: pageWidth - marginX, y: cursorY - 4 },
			thickness: 1,
			color: rgb(0.86, 0.86, 0.86),
		});
		cursorY -= 16;
	};

	const drawTableHeader = () => {
		const headerLineCounts = activeColumns.map((column, index) =>
			wrapTextToWidth(
				normalizeReportHeaderLabel(column.header),
				Math.max(columnWidths[index] - rowPaddingX * 2, 12),
				boldFont,
				headerCellFontSize,
			).length,
		);
		const headerHeight =
			Math.max(...headerLineCounts, 1) * (headerCellFontSize + tableLineGap) +
			rowPaddingY * 2;
		const headerTop = cursorY;
		const headerBottom = headerTop - headerHeight;

		page.drawRectangle({
			x: marginX,
			y: headerBottom,
			width: tableWidth,
			height: headerHeight,
			color: headerBackgroundColor,
			borderColor: tableBorderColor,
			borderWidth: 0.75,
		});

		let columnX = marginX;
		activeColumns.forEach((column, index) => {
			drawWrappedText(
				page,
				normalizeReportHeaderLabel(column.header),
				columnX + rowPaddingX,
				headerTop - rowPaddingY - headerCellFontSize + 1,
				columnWidths[index] - rowPaddingX * 2,
				boldFont,
				headerCellFontSize,
				rgb(0.2, 0.2, 0.2),
				column.align || "left",
			);

			if (index > 0) {
				page.drawLine({
					start: { x: columnX, y: headerTop },
					end: { x: columnX, y: headerBottom },
					thickness: 0.75,
					color: tableBorderColor,
				});
			}
			columnX += columnWidths[index];
		});

		cursorY = headerBottom;
	};

	const drawPayrollSectionHeader = (groupLabel: string) => {
		const height = 14;
		page.drawText(`Section: ${groupLabel}`, {
			x: marginX,
			y: cursorY - 9,
			size: 7.8,
			font: boldFont,
			color: rgb(0.12, 0.16, 0.22),
		});
		cursorY -= height + 4;
	};

	const startNewPage = (drawHeader = true) => {
		page = pdf.addPage([pageWidth, pageHeight]);
		pageIndex += 1;
		cursorY = pageHeight - marginTop;
		drawPageHeader();
		if (isPayrollRegisterLayout && currentGroupLabel) {
			drawPayrollSectionHeader(currentGroupLabel);
		}
		if (drawHeader) {
			drawTableHeader();
		}
	};

	const ensureSpace = (requiredHeight: number) => {
		if (cursorY - requiredHeight < contentBottom) {
			startNewPage();
		}
	};

	const getActiveGroupCount = (groupLabel: string) =>
		activeRows.filter((row) => row.groupLabel === groupLabel).length;

	const drawGroupHeader = (groupLabel: string) => {
		if (isPayrollRegisterLayout) {
			if (cursorY - 42 < contentBottom) {
				startNewPage();
				return true;
			}
			drawPayrollSectionHeader(groupLabel);
			return false;
		}

		const height = 15;
		if (cursorY - (height + 6) < contentBottom) {
			startNewPage(false);
		}
		const count = getActiveGroupCount(groupLabel);
		const countLabel = count === 1 ? "1 timesheet" : `${count} timesheets`;
		page.drawText(`${groupLabel} (${countLabel})`, {
			x: marginX,
			y: cursorY - 9,
			size: 8.5,
			font: boldFont,
			color: rgb(0.12, 0.16, 0.22),
		});
		page.drawLine({
			start: { x: marginX, y: cursorY - height },
			end: { x: marginX + tableWidth, y: cursorY - height },
			thickness: 0.75,
			color: rgb(0.82, 0.84, 0.88),
		});
		cursorY -= height + 4;
		return false;
	};

	const parseCompactNumber = (value: string) => {
		const normalized = value.replace(/[^0-9.-]/g, "");
		const amount = Number(normalized);
		return Number.isFinite(amount) ? amount : 0;
	};

	const shouldTotalColumn = (header: string) =>
		[
			"Monthly",
			"Monthly Salary",
			"Basic",
			"Abs/Late",
			"OT/Hol/ND",
			"Other Earn",
			"GrossPay",
			"TOTAL DEDN",
			"NetPay",
		].includes(header);

	const drawCompactTotalsRow = () => {
		if (!isPayrollRegisterLayout || !activeRows.length) return;

		const totalCells = activeColumns.map((column, index) => {
			const header = normalizeReportHeaderLabel(column.header);
			if (index === 0) return "TOTAL";
			if (!shouldTotalColumn(header)) return "";
			const total = activeRows.reduce(
				(sum, row) => sum + parseCompactNumber(row.cells[index] || ""),
				0,
			);
			return formatCompactReportNumber(total);
		});
		const height = cellFontSize + rowPaddingY * 2 + 2;
		ensureSpace(height + 8);
		const rowTop = cursorY;
		const rowBottom = rowTop - height;

		page.drawRectangle({
			x: marginX,
			y: rowBottom,
			width: tableWidth,
			height,
			color: rgb(0.85, 0.88, 0.91),
			borderColor: rgb(0.45, 0.5, 0.56),
			borderWidth: 0.85,
		});

		let cellX = marginX;
		activeColumns.forEach((column, index) => {
			page.drawLine({
				start: { x: cellX, y: rowTop },
				end: { x: cellX, y: rowBottom },
				thickness: 0.75,
				color: tableBorderColor,
			});

			drawWrappedText(
				page,
				totalCells[index],
				cellX + rowPaddingX,
				rowTop - rowPaddingY - cellFontSize + 1,
				columnWidths[index] - rowPaddingX * 2,
				boldFont,
				cellFontSize,
				rgb(0.05, 0.08, 0.12),
				index === 0 ? "left" : column.align || "left",
			);

			cellX += columnWidths[index];
		});

		cursorY = rowBottom - 14;
	};

	const drawCompactSummaryBoxes = () => {
		if (!isPayrollRegisterLayout || !summaryLines.length) return;
		const visible = summaryLines.slice(0, 5);
		const gap = 8;
		const boxWidth = (tableWidth - gap * (visible.length - 1)) / visible.length;
		const boxHeight = 24;
		ensureSpace(boxHeight + 6);
		let boxX = marginX;

		visible.forEach((line) => {
			page.drawRectangle({
				x: boxX,
				y: cursorY - boxHeight,
				width: boxWidth,
				height: boxHeight,
				color: rgb(0.98, 0.985, 0.99),
				borderColor: tableBorderColor,
				borderWidth: 0.75,
			});
			page.drawText(line.label, {
				x: boxX + 6,
				y: cursorY - 10,
				size: 6.3,
				font: regularFont,
				color: rgb(0.3, 0.36, 0.44),
			});
			page.drawText(line.value, {
				x: boxX + 6,
				y: cursorY - 20,
				size: 7,
				font: boldFont,
				color: rgb(0.08, 0.1, 0.14),
			});
			boxX += boxWidth + gap;
		});

		cursorY -= boxHeight + 8;
	};

	const resetPageForBand = (bandIndex: number) => {
		if (bandIndex > 0) {
			page = pdf.addPage([pageWidth, pageHeight]);
			pageIndex += 1;
		}
		cursorY = pageHeight - marginTop;
		currentGroupLabel = undefined;
		drawPageHeader();
	};

	const drawActiveBand = () => {
		if (shouldDrawGroupedSections) {
			currentGroupLabel = activeRows[0]?.groupLabel;
			if (currentGroupLabel) {
				const tableHeaderWasDrawn = drawGroupHeader(currentGroupLabel);
				if (!tableHeaderWasDrawn) {
					drawTableHeader();
				}
			} else {
				drawTableHeader();
			}
		} else {
			drawTableHeader();
		}

		if (!activeRows.length) {
			page.drawText(emptyStateMessage, {
				x: marginX,
				y: cursorY - 12,
				size: 11,
				font: regularFont,
				color: rgb(0.45, 0.45, 0.45),
			});
			return;
		}

		activeRows.forEach((row, rowIndex) => {
			if (row.groupLabel && row.groupLabel !== currentGroupLabel) {
				currentGroupLabel = row.groupLabel;
				const tableHeaderWasDrawn = drawGroupHeader(currentGroupLabel);
				if (!tableHeaderWasDrawn) {
					drawTableHeader();
				}
			}

			const rowLineCount = Math.max(
				...row.cells.map((value, index) => {
					return wrapTextToWidth(
						value,
						Math.max(columnWidths[index] - rowPaddingX * 2, 12),
						regularFont,
						cellFontSize,
					).length;
				}),
				1,
			);
			const rowHeight = rowLineCount * (cellFontSize + tableLineGap) + rowPaddingY * 2;
			ensureSpace(rowHeight);
			const rowTop = cursorY;
			const rowBottom = rowTop - rowHeight;

			page.drawRectangle({
				x: marginX,
				y: rowBottom,
				width: tableWidth,
				height: rowHeight,
				color: rowIndex % 2 === 0 ? rgb(1, 1, 1) : zebraBackgroundColor,
			});

			page.drawLine({
				start: { x: marginX, y: rowBottom },
				end: { x: marginX + tableWidth, y: rowBottom },
				thickness: 0.75,
				color: tableBorderColor,
			});

			let cellX = marginX;
			activeColumns.forEach((column, index) => {
				page.drawLine({
					start: { x: cellX, y: rowTop },
					end: { x: cellX, y: rowBottom },
					thickness: 0.75,
					color: tableBorderColor,
				});

				drawWrappedText(
					page,
					row.cells[index],
					cellX + rowPaddingX,
					rowTop - rowPaddingY - cellFontSize + 1,
					columnWidths[index] - rowPaddingX * 2,
					regularFont,
					cellFontSize,
					rgb(0.2, 0.2, 0.2),
					column.align || "left",
				);

				cellX += columnWidths[index];
			});

			page.drawLine({
				start: { x: marginX + tableWidth, y: rowTop },
				end: { x: marginX + tableWidth, y: rowBottom },
				thickness: 0.75,
				color: tableBorderColor,
			});

			cursorY = rowBottom;
		});

		drawCompactTotalsRow();
		drawCompactSummaryBoxes();
	};

	columnBands.forEach((band, bandIndex) => {
		activeColumns = band.columns;
		activeRows = band.rows;
		columnWidths = band.columnWidths;
		activeBandLabel = band.label;
		resetPageForBand(bandIndex);
		drawActiveBand();
	});

	const totalPages = pageNumbers.length;
	pageNumbers.forEach(({ page: targetPage, index }) => drawFooter(targetPage, index, totalPages));

	const bytes = await pdf.save();
	const blob = new Blob([toArrayBuffer(bytes)], { type: "application/pdf" });
	maybeDownloadBlob(blob, buildReportDownloadFileName(config.fileBaseName, "pdf"));
}

export async function exportReport<T>({ format, config, options }: ReportExportRequest<T>) {
	const normalizedOptions = normalizeDialogState(options);

	if (format === "csv") {
		await exportCsv(config, normalizedOptions);
		return;
	}

	if (format === "xlsx") {
		await exportXlsx(config, normalizedOptions);
		return;
	}

	await exportPdf(config, normalizedOptions);
}

export function createReportExporter<T>(config: ReportExportConfig<T>) {
	return (request: Omit<ReportExportRequest<T>, "config">) =>
		exportReport({
			...request,
			config,
		});
}

export function exportRowsToCsv<T>({ columns, rows, fileBaseName }: LegacyCsvExportOptions<T>) {
	return exportReport({
		format: "csv",
		config: {
			reportKey: normalizeFileBaseName(fileBaseName),
			title: normalizeFileBaseName(fileBaseName),
			fileBaseName,
			rows,
			columns,
		},
	});
}

export function exportRowsToPdf<T>({
	columns,
	rows,
	fileBaseName,
	reportTitle,
	metadataLines = [],
	logoSrc,
	orientation = "landscape",
}: LegacyPdfExportOptions<T>) {
	return exportReport({
		format: "pdf",
		config: {
			reportKey: normalizeFileBaseName(fileBaseName),
			title: reportTitle,
			fileBaseName,
			rows,
			columns,
			logoSrc,
			orientation,
			filtersSummary: metadataLines.map((line, index) => ({
				label: index === 0 ? "Context" : `Context ${index + 1}`,
				value: line,
			})),
		},
	});
}

export function exportRowsToXlsx<T>({
	columns,
	rows,
	fileBaseName,
	reportTitle,
	metadataLines = [],
}: LegacyPdfExportOptions<T>) {
	return exportReport({
		format: "xlsx",
		config: {
			reportKey: normalizeFileBaseName(fileBaseName),
			title: reportTitle,
			fileBaseName,
			rows,
			columns,
			filtersSummary: metadataLines.map((line, index) => ({
				label: index === 0 ? "Context" : `Context ${index + 1}`,
				value: line,
			})),
		},
	});
}
