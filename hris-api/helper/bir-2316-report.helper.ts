import { PrismaClient } from "../generated/prisma";
import { generateBIRForm2316 } from "./bir-2316.generator";
import { convertEmployeeToBIR2316Input } from "./employee-to-bir2316";
import {
	wrapTextToWidth,
	mapFieldNameToData,
	formatFieldValue,
	resetFieldOccurrenceTracker,
	extractFieldNumber,
	getBoxMappingForField,
	type PDFField,
} from "./bir-2316-pdf.helper";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as fs from "fs";
import * as path from "path";

interface GenerateBir2316PdfParams {
	employeeId: string;
	year: number;
	organizationId?: string;
}

interface GenerateBir2316PdfResult {
	buffer: Buffer;
	filename: string;
}

const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};

const sanitizeFilePart = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return "Employee";
	return trimmed.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");
};

const getFieldMappingPath = () => path.join(__dirname, "../assets/pdf-field-mapping.json");
const getTemplatePath = () =>
	path.join(__dirname, "../assets/forms/2316 Sep 2021 ENCS_Final_corrected.pdf");

const loadPdfFields = (): PDFField[] => {
	const fieldMappingPath = getFieldMappingPath();
	if (!fs.existsSync(fieldMappingPath)) {
		throw new Error(
			`PDF field mapping file not found at: ${fieldMappingPath}. Please ensure the file exists.`,
		);
	}

	const fieldMappingData = fs.readFileSync(fieldMappingPath, "utf-8");
	let pdfFields: PDFField[];
	try {
		pdfFields = JSON.parse(fieldMappingData);
	} catch (parseError) {
		throw new Error(`Failed to parse PDF field mapping JSON: ${parseError}`);
	}

	if (!Array.isArray(pdfFields) || pdfFields.length === 0) {
		throw new Error("PDF field mapping is empty or invalid format");
	}

	return pdfFields;
};

const loadTemplateBytes = (): Buffer => {
	const pdfTemplatePath = getTemplatePath();
	if (!fs.existsSync(pdfTemplatePath)) {
		throw new Error(
			`BIR 2316 PDF template not found at: ${pdfTemplatePath}. Please ensure the file exists.`,
		);
	}

	return fs.readFileSync(pdfTemplatePath);
};

export const generateBir2316PdfForEmployee = async (
	prisma: PrismaClient,
	params: GenerateBir2316PdfParams,
): Promise<GenerateBir2316PdfResult> => {
	const { employeeId, year, organizationId } = params;

	const pdfFields = loadPdfFields();
	const existingPdfBytes = loadTemplateBytes();

	const employeeData = await prisma.employee.findFirst({
		where: {
			id: employeeId,
			isDeleted: false,
			...(organizationId ? { organizationId } : {}),
		},
		include: {
			person: {
				select: {
					personalInfo: true,
					contactInfo: true,
				},
			},
			employeePayrolls: true,
			documents: {
				where: { isDeleted: false },
			},
		},
	});

	if (!employeeData) {
		throw new Error("Employee not found for BIR 2316 generation");
	}

	const bir2316Input = convertEmployeeToBIR2316Input(employeeData as any, year);
	const bir2316Data = generateBIRForm2316(bir2316Input);

	resetFieldOccurrenceTracker();
	const fieldsWithValues = pdfFields.map((field) => {
		const mappedValue = mapFieldNameToData(field.name, bir2316Data);
		const fieldNumber = extractFieldNumber(field.name);
		const boxMapping = fieldNumber ? getBoxMappingForField(fieldNumber) : null;
		const formattedValue =
			mappedValue !== undefined ? formatFieldValue(mappedValue, boxMapping?.boxNumber) : "";

		return {
			...field,
			value: formattedValue,
		};
	});

	const pdfDoc = await PDFDocument.load(existingPdfBytes);
	const pages = pdfDoc.getPages();
	const firstPage = pages[0];

	if (!firstPage) {
		throw new Error("Page not found in PDF template");
	}

	const { height: pdfHeight } = firstPage.getSize();
	const scale = 1.5;
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

	for (const field of fieldsWithValues) {
		if (!field.value) continue;

		const pdfFieldX = field.coordinates.x / scale;
		const pdfFieldY = pdfHeight - field.coordinates.y / scale;
		const pdfFieldWidth = field.dimensions.width / scale;
		const pdfFieldHeight = field.dimensions.height / scale;
		const pdfFontSize = field.fontSize / scale;
		const letterSpacingPdf = field.letterSpacing !== undefined ? field.letterSpacing / scale : 0;
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
					pdfFieldY -
					pdfFieldHeight +
					pdfFontSize * 0.8 +
					totalTextHeight -
					lineHeight;
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
				if (i < line.length - 1) lineWidth += letterSpacingPdf;
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
					font,
				});
				const charWidth = font.widthOfTextAtSize(char, pdfFontSize);
				currentX += charWidth + letterSpacingPdf;
			}
		}
	}

	const pdfBytes = await pdfDoc.save();
	const firstName = getJsonString((employeeData as any).person?.personalInfo, "firstName");
	const lastName = getJsonString((employeeData as any).person?.personalInfo, "lastName");
	const fullName = `${firstName}-${lastName}`;
	const sanitizedName = sanitizeFilePart(fullName);

	return {
		buffer: Buffer.from(pdfBytes),
		filename: `BIR-2316-${sanitizedName}-${year}.pdf`,
	};
};
