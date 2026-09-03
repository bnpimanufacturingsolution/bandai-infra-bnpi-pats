import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface FieldMapping {
  name: string;
  coordinates: { x: number; y: number };
  dimensions: { width: number; height: number };
  fontSize: number;
}

export interface FormData {
  [fieldName: string]: string | number;
}

/**
 * Generates a filled PDF based on a template and field mappings
 * @param templatePdfUrl - URL to the template PDF file
 * @param fieldMappings - Array of field mappings with coordinates and dimensions
 * @param formData - Object containing the data to fill in the fields
 * @returns Promise<Uint8Array> - The generated PDF as a byte array
 */
export async function generateFilledPdf(
  templatePdfUrl: string,
  fieldMappings: FieldMapping[],
  formData: FormData
): Promise<Uint8Array> {
  // Fetch the template PDF
  const existingPdfBytes = await fetch(templatePdfUrl).then((res) => res.arrayBuffer());

  // Load the PDF
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  // Get the first page (can be extended for multi-page forms)
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { height } = firstPage.getSize();

  // Embed the font
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Fill in each field
  for (const mapping of fieldMappings) {
    const value = formData[mapping.name];

    if (value !== undefined && value !== null && value !== '') {
      const text = String(value);

      // PDF coordinates start from bottom-left, so we need to convert
      // Canvas coordinates (top-left) to PDF coordinates (bottom-left)
      const pdfY = height - mapping.coordinates.y - mapping.fontSize;

      firstPage.drawText(text, {
        x: mapping.coordinates.x,
        y: pdfY,
        size: mapping.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
  }

  // Serialize the PDFDocument to bytes
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Downloads a PDF file
 * @param pdfBytes - The PDF as a byte array
 * @param filename - The desired filename
 */
export function downloadPdf(pdfBytes: Uint8Array, filename: string = 'filled-form.pdf') {
  const safeBytes = new Uint8Array(pdfBytes);
  const blob = new Blob([safeBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Opens a PDF in a new tab
 * @param pdfBytes - The PDF as a byte array
 */
export function openPdfInNewTab(pdfBytes: Uint8Array) {
  const safeBytes = new Uint8Array(pdfBytes);
  const blob = new Blob([safeBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
