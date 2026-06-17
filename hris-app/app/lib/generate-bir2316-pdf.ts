/**
 * Utility to generate BIR Form 2316 PDF
 * Reusable across different flows (HR Reports, Document Requests, etc.)
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { convertEmployeeToBIR2316 } from "./employee-to-bir2316";
import {
	mapFieldNameToData,
	formatFieldValue,
	resetFieldOccurrenceTracker,
} from "./bir-2316-mock-data";
import { wrapTextToWidth } from "./pdf-text-layout";
import { getBoxMappingForField, extractFieldNumber } from "./box-field-mapper";
import type { BIRForm2316 } from "~/types/bir-2316";
import pdf2316 from "~/assets/forms/2316 Sep 2021 ENCS_Final_corrected.pdf";

interface Field {
	name: string;
	coordinates: { x: number; y: number };
	dimensions: { width: number; height: number };
	fontSize: number;
	value?: string;
	letterSpacing?: number;
	textAlign?: "left" | "center" | "right";
	verticalAlign?: "top" | "middle" | "bottom";
}

interface BIR2316GenerationOptions {
	employeeData: any; // Full employee data from API
	year: number;
	employeeName?: string; // Optional, for filename
}

/**
 * Generate BIR Form 2316 PDF and return as Blob
 */
export async function generateBIR2316PDF(
	options: BIR2316GenerationOptions,
): Promise<{ blob: Blob; filename: string }> {
	const { employeeData, year, employeeName } = options;

	// Get saved field mappings from localStorage
	const savedMapping = localStorage.getItem("pdf-field-mapping");
	if (!savedMapping) {
		throw new Error(
			"No saved field mappings found. Please map fields first using the PDF Mapper.",
		);
	}

	const pdfFields: Field[] = JSON.parse(savedMapping);
	if (pdfFields.length === 0) {
		throw new Error("No fields found in saved mapping.");
	}

	// Convert employee data to BIR 2316 format
	const bir2316Data = convertEmployeeToBIR2316(employeeData, year);

	// Ensure year is set
	bir2316Data.year = year;
	const completeEmployeeData = bir2316Data as BIRForm2316;

	// Reset occurrence tracker for sequential mapping
	resetFieldOccurrenceTracker();

	// Map field values from employee data
	const fieldsWithValues = pdfFields.map((field) => {
		const mappedValue = mapFieldNameToData(field.name, completeEmployeeData);

		// Determine BIR box number for proper monetary formatting
		const fieldNumber = extractFieldNumber(field.name);
		const boxMapping = fieldNumber ? getBoxMappingForField(fieldNumber) : null;

		const formattedValue =
			mappedValue !== undefined ? formatFieldValue(mappedValue, boxMapping?.boxNumber) : "";

		return {
			...field,
			value: formattedValue,
		};
	});

	// Fetch the original PDF
	const existingPdfBytes = await fetch(pdf2316).then((res) => res.arrayBuffer());

	// Load the PDF with pdf-lib
	const pdfDoc = await PDFDocument.load(existingPdfBytes);
	const pages = pdfDoc.getPages();
	const firstPage = pages[0];

	if (!firstPage) {
		throw new Error("Page not found in PDF template");
	}

	const { height: pdfHeight } = firstPage.getSize();
	const scale = 1.5; // Default scale used in PDF mapper

	// Embed font once for all fields
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

	// Draw each field's text onto the PDF with line wrapping
	for (const field of fieldsWithValues) {
		if (!field.value) continue;

		// Convert coordinates from scaled canvas to PDF
		const pdfFieldX = field.coordinates.x / scale;
		const pdfFieldY = pdfHeight - field.coordinates.y / scale;
		const pdfFieldWidth = field.dimensions.width / scale;
		const pdfFieldHeight = field.dimensions.height / scale;

		// Font size and letter spacing - also divide by scale
		const pdfFontSize = field.fontSize / scale;
		const letterSpacingPdf =
			field.letterSpacing !== undefined ? field.letterSpacing / scale : 0;

		const textAlign = field.textAlign || "center";
		const verticalAlign = field.verticalAlign || "middle";

		const value = field.value.toString();
		const processedLines = wrapTextToWidth(
			value,
			pdfFieldWidth,
			font,
			pdfFontSize,
			letterSpacingPdf,
		);
		if (processedLines.length === 0) continue;

		const lineHeight = pdfFontSize * 1.2;
		const totalTextHeight = processedLines.length * lineHeight;

		let startY: number;
		switch (verticalAlign) {
			case "top":
				startY = pdfFieldY - pdfFontSize * 0.8;
				break;
			case "bottom":
				startY =
					pdfFieldY - pdfFieldHeight + pdfFontSize * 0.8 + totalTextHeight - lineHeight;
				break;
			default:
				startY =
					pdfFieldY -
					pdfFieldHeight / 2 -
					pdfFontSize / 3 +
					(totalTextHeight - lineHeight) / 2;
				break;
		}

		for (let lineIndex = 0; lineIndex < processedLines.length; lineIndex++) {
			const line = processedLines[lineIndex];

			let lineWidth = 0;
			for (let i = 0; i < line.length; i++) {
				const charWidth = font.widthOfTextAtSize(line[i], pdfFontSize);
				lineWidth += charWidth;
				if (i < line.length - 1) {
					lineWidth += letterSpacingPdf;
				}
			}

			let lineX: number;
			switch (textAlign) {
				case "left":
					lineX = pdfFieldX;
					break;
				case "right":
					lineX = pdfFieldX + pdfFieldWidth - lineWidth;
					break;
				default:
					lineX = pdfFieldX + (pdfFieldWidth - lineWidth) / 2;
					break;
			}

			const lineY = startY - lineIndex * lineHeight;

			let currentX = lineX;
			for (let i = 0; i < line.length; i++) {
				const char = line[i];

				firstPage.drawText(char, {
					x: currentX,
					y: lineY,
					size: pdfFontSize,
					color: rgb(0, 0, 0),
					font: font,
				});

				const charWidth = font.widthOfTextAtSize(char, pdfFontSize);
				currentX += charWidth + letterSpacingPdf;
			}
		}
	}

	// Serialize the PDFDocument to bytes
	const pdfBytes = await pdfDoc.save();

	// Create blob
	const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });

	// Generate filename
	const sanitizedName = employeeName
		? employeeName.split(" (")[0].replace(/\s+/g, "-")
		: "Employee";
	const filename = `BIR-2316-${sanitizedName}-${year}.pdf`;

	return { blob, filename };
}

/**
 * Download BIR Form 2316 PDF directly
 */
export async function downloadBIR2316PDF(options: BIR2316GenerationOptions): Promise<void> {
	const { blob, filename } = await generateBIR2316PDF(options);

	// Create download link
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Open BIR Form 2316 PDF in new tab
 */
export async function previewBIR2316PDF(options: BIR2316GenerationOptions): Promise<void> {
	const { blob } = await generateBIR2316PDF(options);

	// Open in new tab
	const url = URL.createObjectURL(blob);
	window.open(url, "_blank");
}
