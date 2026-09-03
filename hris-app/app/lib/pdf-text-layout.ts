import type { PDFPage, PDFFont, RGB } from "pdf-lib";

export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

/**
 * Wrap text into multiple lines so that each line fits within maxWidth.
 * Uses pdf-lib font metrics (so it matches actual PDF rendering).
 */
export const wrapTextToWidth = (
	text: string,
	maxWidth: number,
	font: PDFFont,
	fontSize: number,
	letterSpacing: number,
): string[] => {
	if (!text) return [];

	const paragraphs = text.split("\n");
	const lines: string[] = [];

	for (const paragraph of paragraphs) {
		const words = paragraph.split(" ");
		let currentLine = "";

		for (const word of words) {
			// If the word itself is longer than the box, hard-break it by characters
			const testWordWidth =
				font.widthOfTextAtSize(word, fontSize) +
				Math.max(0, word.length - 1) * letterSpacing;
			if (testWordWidth > maxWidth) {
				if (currentLine.trim()) {
					lines.push(currentLine.trimEnd());
					currentLine = "";
				}

				let chunk = "";
				for (const ch of word) {
					const testChunk = chunk + ch;
					const chunkWidth =
						font.widthOfTextAtSize(testChunk, fontSize) +
						Math.max(0, testChunk.length - 1) * letterSpacing;
					if (chunk && chunkWidth > maxWidth) {
						lines.push(chunk);
						chunk = ch;
					} else {
						chunk = testChunk;
					}
				}
				if (chunk) {
					currentLine = chunk + " ";
				}
				continue;
			}

			const testLine = currentLine ? `${currentLine}${word} ` : `${word} `;
			const textWidth =
				font.widthOfTextAtSize(testLine.trimEnd(), fontSize) +
				Math.max(0, testLine.trimEnd().length - 1) * letterSpacing;

			if (textWidth <= maxWidth) {
				currentLine = testLine;
			} else {
				if (currentLine.trim()) {
					lines.push(currentLine.trimEnd());
				}
				currentLine = `${word} `;
			}
		}

		if (currentLine.trim()) {
			lines.push(currentLine.trimEnd());
		}

		// Preserve explicit paragraph break
		if (paragraph.trim() === "" && paragraphs.length > 1) {
			lines.push("");
		}
	}

	return lines;
};

/**
 * Draw a block of (possibly multi-line) text inside a box on a PDF page
 * with horizontal and vertical alignment and letter-spacing.
 */
export const drawTextInBox = ({
	page,
	font,
	text,
	boxX,
	boxY,
	boxWidth,
	boxHeight,
	fontSize,
	letterSpacing,
	textAlign = "center",
	verticalAlign = "middle",
	color,
}: {
	page: PDFPage;
	font: PDFFont;
	text: string;
	boxX: number;
	boxY: number;
	boxWidth: number;
	boxHeight: number;
	fontSize: number;
	letterSpacing: number;
	textAlign?: HorizontalAlign;
	verticalAlign?: VerticalAlign;
	color: RGB;
}) => {
	const processedLines = wrapTextToWidth(
		text.toString(),
		boxWidth,
		font,
		fontSize,
		letterSpacing,
	);
	if (processedLines.length === 0) return;

	const lineHeight = fontSize * 1.2;
	const totalTextHeight = processedLines.length * lineHeight;

	let startY: number;
	switch (verticalAlign) {
		case "top":
			startY = boxY - fontSize * 0.8;
			break;
		case "bottom":
			startY = boxY - boxHeight + fontSize * 0.8 + totalTextHeight - lineHeight;
			break;
		default:
			startY = boxY - boxHeight / 2 - fontSize / 3 + (totalTextHeight - lineHeight) / 2;
			break;
	}

	for (let lineIndex = 0; lineIndex < processedLines.length; lineIndex++) {
		const line = processedLines[lineIndex];

		// Calculate line width with letter spacing
		let lineWidth = 0;
		for (let i = 0; i < line.length; i++) {
			const charWidth = font.widthOfTextAtSize(line[i], fontSize);
			lineWidth += charWidth;
			if (i < line.length - 1) {
				lineWidth += letterSpacing;
			}
		}

		let lineX: number;
		switch (textAlign) {
			case "left":
				lineX = boxX;
				break;
			case "right":
				lineX = boxX + boxWidth - lineWidth;
				break;
			default:
				lineX = boxX + (boxWidth - lineWidth) / 2;
				break;
		}

		const lineY = startY - lineIndex * lineHeight;

		let currentX = lineX;
		for (let i = 0; i < line.length; i++) {
			const char = line[i];

			page.drawText(char, {
				x: currentX,
				y: lineY,
				size: fontSize,
				color: color,
				font: font,
			});

			const charWidth = font.widthOfTextAtSize(char, fontSize);
			currentX += charWidth + letterSpacing;
		}
	}
};

/**
 * Format numeric values to default two decimal places.
 * Leaves non-numeric values as-is.
 */
export const formatToTwoDecimals = (value: any): string => {
	if (value === null || value === undefined || value === "") return "";

	const num = Number(value);
	if (Number.isNaN(num)) {
		return String(value);
	}

	return num.toFixed(2);
};
