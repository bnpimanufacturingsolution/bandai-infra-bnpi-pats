export type CsvCell = string | number | boolean | null | undefined;

function escapeCsvCell(value: CsvCell): string {
	const stringValue = value == null ? "" : String(value);
	if (/[",\n]/.test(stringValue)) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}
	return stringValue;
}

export function downloadCsvFile(
	filename: string,
	headers: string[],
	rows: CsvCell[][],
): void {
	const lines = [
		headers.map(escapeCsvCell).join(","),
		...rows.map((row) => row.map(escapeCsvCell).join(",")),
	];

	const encoder = new TextEncoder();
	const utf8Bytes = encoder.encode(lines.join("\n"));
	const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
	const csvBytes = new Uint8Array(bom.length + utf8Bytes.length);
	csvBytes.set(bom, 0);
	csvBytes.set(utf8Bytes, bom.length);

	const blob = new Blob([csvBytes], { type: "text/csv;charset=utf-8" });
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	window.URL.revokeObjectURL(url);
}

export function buildDatedCsvFilename(baseName: string, date = new Date()): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	return `${baseName}-${yyyy}-${mm}-${dd}.csv`;
}
