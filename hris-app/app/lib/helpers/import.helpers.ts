import Papa from "papaparse";
import { REQUIRED_FIELDS, SYSTEM_FIELDS, OPTIONAL_FIELDS } from "~/constants/import-fields";

/**
 * Generate a work email based on employee name and organization
 */
export const generateWorkEmail = (fullName: string, orgName: string): string => {
	if (!fullName) return "";
	const cleanName = fullName.trim();
	if (!cleanName) return "";

	const cleanOrg = orgName.toLowerCase().includes("bandai")
		? "bandai"
		: orgName
				.split(" ")[0]
				.toLowerCase()
				.replace(/[^a-z0-9]/g, "");

	let firstNamePart = "";
	let lastNamePart = "";

	if (cleanName.includes(",")) {
		const parts = cleanName.split(",");
		lastNamePart = parts[0].trim();
		firstNamePart = parts[1] ? parts[1].trim() : "";
	} else {
		const parts = cleanName.split(/\s+/);
		if (parts.length === 1) {
			firstNamePart = parts[0];
			lastNamePart = parts[0];
		} else {
			lastNamePart = parts[parts.length - 1];
			firstNamePart = parts.slice(0, parts.length - 1).join(" ");
		}
	}

	// Use first character of first name
	const firstInitial = firstNamePart.trim().charAt(0);
	const cleanLast = lastNamePart.replace(/[^a-zA-Z0-9]/g, "");

	return `${firstInitial.toLowerCase()}.${cleanLast.toLowerCase()}@${cleanOrg}.com`;
};

/**
 * Parse CSV line handling quotes properly
 */
export const parseCSVLine = (str: string): string[] => {
	const arr: string[] = [];
	let quote = false;
	let cell = "";
	for (let i = 0; i < str.length; i++) {
		const c = str[i];
		if (c === '"') {
			// Handle doubled quotes typical in CSV
			if (i + 1 < str.length && str[i + 1] === '"') {
				cell += '"';
				i++;
			} else {
				quote = !quote;
			}
		} else if (c === "," && !quote) {
			arr.push(cell);
			cell = "";
		} else {
			cell += c;
		}
	}
	arr.push(cell);
	return arr.map((val) => val.trim());
};

/**
 * Auto-map CSV headers to system fields
 */
export const autoMapHeaders = (
	headers: string[],
	systemFields: Array<{ key: string; label: string; aliases?: string[] }>,
): Record<string, string> => {
	const mapping: Record<string, string> = {};

	systemFields.forEach((field) => {
		// Try exact match first
		const exactMatch = headers.find((h) => h === field.key || h === `"${field.key}"`);
		if (exactMatch) {
			mapping[field.key] = exactMatch;
			return;
		}

		// Try case-insensitive match
		const looseMatch = headers.find(
			(h) =>
				h.toLowerCase() === field.key.toLowerCase() ||
				h.toLowerCase().replace(/['"]+/g, "") === field.key.toLowerCase(),
		);
		if (looseMatch) {
			mapping[field.key] = looseMatch;
			return;
		}

		// Try label match
		const labelMatch = headers.find(
			(h) =>
				h.toLowerCase() === field.label.toLowerCase() ||
				h.toLowerCase().replace(/['"]+/g, "") === field.label.toLowerCase(),
		);
		if (labelMatch) {
			mapping[field.key] = labelMatch;
			return;
		}

		// Try aliases match
		if (field.aliases && field.aliases.length > 0) {
			for (const alias of field.aliases) {
				const aliasMatch = headers.find(
					(h) =>
						h.toLowerCase() === alias.toLowerCase() ||
						h.toLowerCase().replace(/['"]+/g, "") === alias.toLowerCase(),
				);
				if (aliasMatch) {
					mapping[field.key] = aliasMatch;
					return;
				}
			}
		}
	});

	return mapping;
};

/**
 * Read file with proper UTF-8 encoding detection
 */
/**
 * Read file with proper encoding detection (UTF-8 with fallback to Windows-1252)
 */
/**
 * Parse CSV file and return headers and preview data
 * @param file File to parse
 * @param limit Optional limit on number of rows to return (default 10). Set to -1 for all rows.
 */
export const parseCSVFile = (
	file: File,
	limit: number = 10,
	onProgress?: (progress: { rows: number; percent: number }) => void,
): Promise<{ headers: string[]; previewData: string[][] }> => {
	return new Promise((resolve, reject) => {
		const allRows: string[][] = [];
		let lastProgressAt = 0;

		Papa.parse(file, {
			chunk: (results) => {
				const chunkRows = (results.data || []) as string[][];
				if (chunkRows.length > 0) {
					allRows.push(...chunkRows);
				}

				const now = Date.now();
				if (onProgress && now - lastProgressAt > 120) {
					lastProgressAt = now;
					const cursor = Number(results.meta?.cursor || 0);
					const percent =
						file.size > 0
							? Math.min(99, Math.round((cursor / file.size) * 100))
							: 0;
					onProgress({ rows: Math.max(0, allRows.length - 1), percent });
				}
			},
			complete: () => {
				if (!allRows || allRows.length === 0) {
					reject(new Error("File is empty"));
					return;
				}

				// Filter out empty rows
				const validRows = allRows.filter(
					(row) =>
						row && row.length > 0 && row.some((cell) => cell && cell.trim() !== ""),
				);

				if (validRows.length === 0) {
					reject(new Error("No valid data found in file"));
					return;
				}

				const headers = validRows[0].map((h) => (h || "").trim());
				const dataRows = validRows.slice(1);
				const previewData = limit === -1 ? dataRows : dataRows.slice(0, limit);

				onProgress?.({ rows: dataRows.length, percent: 100 });
				resolve({ headers, previewData });
			},
			error: (error) => {
				reject(new Error(`Failed to parse CSV: ${error.message}`));
			},
			worker: file.size > 1024 * 1024,
			skipEmptyLines: true,
			transformHeader: (header) => {
				// Remove leading single quotes that Excel adds for text formatting
				return header.replace(/^['"]/, "").trim();
			},
			transform: (value) => {
				// Remove leading single quotes that Excel adds for text formatting
				return value.replace(/^['"]/, "").trim();
			},
		});
	});
};

/**
 * Generate mapped CSV content from original file
 */
export const generateMappedCSV = (
	file: File,
	columnMapping: Record<string, string>,
	defaultValues: Record<string, string>,
	generateEmail?: (name: string) => string,
	autoGenerateFields?: (context: {
		mappedRow: Record<string, string>;
		rawRow: Record<string, any>;
		rowIndex: number;
	}) => Record<string, string | undefined>,
	autoGeneratedFieldKeys: string[] = [],
): Promise<File> => {
	return new Promise((resolve, reject) => {
		Papa.parse(file, {
			header: true,
			skipEmptyLines: true,
			transformHeader: (header) => {
				// Remove leading single quotes that Excel adds for text formatting
				return header.replace(/^['"]/, "").trim();
			},
			transform: (value) => {
				// Remove leading single quotes that Excel adds for text formatting
				return value.replace(/^['"]/, "").trim();
			},
			error: (error) => {
				console.error("Error in generateMappedCSV:", error);
				reject(error);
			},
			complete: (results) => {
				try {
					const rows = results.data as any[];

					if (results.errors && results.errors.length > 0) {
						console.warn("CSV Parse warnings:", results.errors);
					}

					// Build name-to-ID lookup map for supervisor transformation
					const nameToIdMap = new Map<string, string>();
					const nameColumn = columnMapping["NAME"];
					const empIdColumn = columnMapping["EMP_ID"];

					if (nameColumn && empIdColumn) {
						rows.forEach((row) => {
							const name = row[nameColumn]?.trim();
							const empId = row[empIdColumn]?.trim();
							if (name && empId) {
								// Normalize name for lookup (uppercase, no extra spaces)
								const normalizedName = name.toUpperCase().replace(/\s+/g, " ");
								nameToIdMap.set(normalizedName, empId);
							}
						});
					}

					// Combine keys from both mappings and defaults
					const allKeys = new Set([
						...Object.keys(columnMapping),
						...Object.keys(defaultValues),
					]);

					// Only include EMAIL when the source/default mapping provides it or a caller
					// explicitly opts into generated email values.
					if (allKeys.has("NAME") && generateEmail) {
						allKeys.add("EMAIL");
					}
					autoGeneratedFieldKeys.forEach((key) => allKeys.add(key));

					const orderedFields = [
						...REQUIRED_FIELDS,
						...SYSTEM_FIELDS,
						...OPTIONAL_FIELDS,
					].map((f) => f.key);

					const systemKeys = Array.from(allKeys).sort((a, b) => {
						const idxA = orderedFields.indexOf(a);
						const idxB = orderedFields.indexOf(b);

						if (idxA === -1 && idxB === -1) return a.localeCompare(b);
						if (idxA === -1) return 1; // Put unknown fields at the end
						if (idxB === -1) return -1;

						return idxA - idxB;
					});

					const assignedEmails = new Set<string>();
					const makeUniqueGeneratedEmail = (email: string) => {
						const cleanEmail = String(email || "").trim().toLowerCase();
						if (!cleanEmail) return "";
						if (!assignedEmails.has(cleanEmail)) {
							assignedEmails.add(cleanEmail);
							return cleanEmail;
						}

						const atIndex = cleanEmail.indexOf("@");
						if (atIndex <= 0) return cleanEmail;
						const localPart = cleanEmail.slice(0, atIndex);
						const domain = cleanEmail.slice(atIndex);
						let suffix = 2;
						let nextEmail = `${localPart}${suffix}${domain}`;
						while (assignedEmails.has(nextEmail)) {
							suffix += 1;
							nextEmail = `${localPart}${suffix}${domain}`;
						}
						assignedEmails.add(nextEmail);
						return nextEmail;
					};

					// Map rows using Papa Parse
					const mappedRows = rows.map((row, index) => {
						const newRow: Record<string, string> = {};

						// First pass: map existing fields
						systemKeys.forEach((key: string) => {
							let val = "";
							if (columnMapping[key]) {
								const originalHeader = columnMapping[key];

								// Handle case where originalHeader might be mapped but row doesn't have it
								if (
									Object.prototype.hasOwnProperty.call(row, originalHeader) ||
									row[originalHeader] !== undefined
								) {
									const cellValue = row[originalHeader];
									val =
										cellValue !== undefined && cellValue !== null
											? String(cellValue).trim()
											: "";
								} else {
									// Log only for the first row to avoid console spam
									if (index === 0) {
										console.warn(
											`[generateMappedCSV] Row 0 missing mapped header: "${originalHeader}" for key "${key}". Available headers:`,
											Object.keys(row),
										);
									}
								}
							} else if (defaultValues[key]) {
								val = defaultValues[key];
							}
							newRow[key] = val;
						});

						// Second pass: Auto-generate email if the caller explicitly supplied a generator.
						if (generateEmail && !newRow["EMAIL"] && newRow["NAME"]) {
							newRow["EMAIL"] = makeUniqueGeneratedEmail(generateEmail(newRow["NAME"]));
						} else if (newRow["EMAIL"]) {
							assignedEmails.add(newRow["EMAIL"].trim().toLowerCase());
						}

						// Third pass: Apply additional row-level auto-generated fields
						if (autoGenerateFields) {
							const generatedValues = autoGenerateFields({
								mappedRow: newRow,
								rawRow: row,
								rowIndex: index,
							});
							Object.entries(generatedValues || {}).forEach(([key, value]) => {
								const cleanValue = value?.trim();
								if (!newRow[key] && cleanValue) {
									newRow[key] = cleanValue;
								}
							});
						}

						// Fourth pass: Transform supervisor name to employee ID
						if (newRow["REPORT_TO_EMP_ID"]) {
							const supervisorValue = newRow["REPORT_TO_EMP_ID"].trim();
							// Check if it looks like a name (contains comma or spaces) rather than an ID
							if (
								supervisorValue &&
								(supervisorValue.includes(",") || /\s/.test(supervisorValue))
							) {
								const normalizedName = supervisorValue
									.toUpperCase()
									.replace(/\s+/g, " ");
								const supervisorId = nameToIdMap.get(normalizedName);
								if (supervisorId) {
									newRow["REPORT_TO_EMP_ID"] = supervisorId;
								} else {
									console.warn(
										`[SUPERVISOR_TRANSFORM] No match found for supervisor name: "${supervisorValue}"`,
									);
									// Leave as-is, backend will handle the error
								}
							}
						}

						return newRow;
					});

					// Generate CSV using Papa.unparse
					const csvContent = Papa.unparse(mappedRows, {
						quotes: false,
						quoteChar: '"',
						escapeChar: '"',
						delimiter: ",",
						header: true,
						newline: "\r\n",
						columns: systemKeys, // Enforce strict column order defined by systemKeys
					});

					// Properly encode as UTF-8 with BOM for Excel compatibility
					const encoder = new TextEncoder();
					const utf8Bytes = encoder.encode(csvContent);
					// Prepend UTF-8 BOM (EF BB BF)
					const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
					const csvBytes = new Uint8Array(BOM.length + utf8Bytes.length);
					csvBytes.set(BOM, 0);
					csvBytes.set(utf8Bytes, BOM.length);

					const blob = new Blob([csvBytes], { type: "text/csv;charset=utf-8" });
					const mappedFile = new File([blob], "mapped_import.csv", {
						type: "text/csv;charset=utf-8",
					});

					resolve(mappedFile);
				} catch (error) {
					console.error("Error processing rows in generateMappedCSV:", error);
					reject(error);
				}
			},
		});
	});
};

/**
 * Generate CSV template with sample data
 */
export const generateCSVTemplate = (
	fields: Array<{ key: string; label: string }>,
	sampleData: Record<string, string> | Record<string, string>[],
): void => {
	const headers = fields.map((f) => f.key);

	const dataArray = Array.isArray(sampleData) ? sampleData : [sampleData];

	// Build CSV using Papa.unparse
	const csvContent = Papa.unparse(dataArray, {
		quotes: false,
		header: true,
		columns: headers,
	});

	// Properly encode as UTF-8 with BOM for Excel compatibility
	const encoder = new TextEncoder();
	const utf8Bytes = encoder.encode(csvContent);
	// Prepend UTF-8 BOM (EF BB BF)
	const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
	const csvBytes = new Uint8Array(BOM.length + utf8Bytes.length);
	csvBytes.set(BOM, 0);
	csvBytes.set(utf8Bytes, BOM.length);

	const blob = new Blob([csvBytes], { type: "text/csv;charset=utf-8" });
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "employee-import-template.csv";
	a.click();
	window.URL.revokeObjectURL(url);
};

/**
 * Generate File from headers and data
 */
export const generateFileFromData = (
	headers: string[],
	data: string[][],
	fileName: string,
): File => {
	const csvContent = Papa.unparse({
		fields: headers,
		data: data,
	});

	// Properly encode as UTF-8 with BOM for Excel compatibility
	const encoder = new TextEncoder();
	const utf8Bytes = encoder.encode(csvContent);
	// Prepend UTF-8 BOM (EF BB BF)
	const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
	const csvBytes = new Uint8Array(BOM.length + utf8Bytes.length);
	csvBytes.set(BOM, 0);
	csvBytes.set(utf8Bytes, BOM.length);

	const blob = new Blob([csvBytes], { type: "text/csv;charset=utf-8" });
	return new File([blob], fileName, { type: "text/csv;charset=utf-8" });
};
