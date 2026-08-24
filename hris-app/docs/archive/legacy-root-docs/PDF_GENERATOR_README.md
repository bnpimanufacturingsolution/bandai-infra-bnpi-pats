# PDF Field Mapper & Generator

A comprehensive solution for mapping and filling PDF forms (specifically BIR Form 2316) with precise coordinate-based field placement.

## Features

### 1. PDF Field Mapper (`/pdf-mapper`)
An interactive tool to visually map fillable fields on PDF documents.

**Features:**
- 📄 Load and display PDF documents with zoom controls
- ➕ Add draggable and resizable input fields
- 🎯 Real-time coordinate tracking with mouse position display
- ✏️ Edit field properties (name, position, size, font size)
- 💾 Export field mappings as JSON
- 📥 Import existing field mappings
- 👁️ Preview fields with sample data
- 🎨 Visual feedback for selected fields

**How to Use:**
1. Navigate to `/pdf-mapper` route
2. Click "Add Field" to create new fillable input boxes
3. Drag fields to position them over the PDF
4. Use the resize handle (bottom-right corner) to adjust size
5. Edit field properties in the right panel
6. Enter sample values to preview how text will appear
7. Click "Export Mapping" to save your configuration

### 2. PDF Generator (`/pdf-generator-demo`)
Generate filled PDF forms using the mapped field coordinates.

**Features:**
- 📝 Dynamic form fields based on field mappings
- 🔄 Load sample data for testing
- 👁️ Preview generated PDF in new tab
- 💾 Download filled PDF
- 📋 View current field mappings

**How to Use:**
1. Create field mappings using the PDF Field Mapper (or import existing ones)
2. Navigate to `/pdf-generator-demo` route
3. Fill in the form fields with your data
4. Click "Preview PDF" to see the result
5. Click "Download PDF" to save the filled form

## File Structure

```
app/
├── components/
│   ├── PdfFieldMapper.tsx       # Interactive PDF field mapping tool
│   └── PdfGeneratorDemo.tsx     # PDF generation demo component
├── lib/
│   └── pdfGenerator.ts          # PDF generation utilities
└── routes/
    ├── pdf-mapper.tsx           # Field mapper route
    └── pdf-generator-demo.tsx   # Generator demo route
```

## Technical Details

### Dependencies
- `react-pdf` - PDF rendering in React
- `pdfjs-dist` - PDF.js library for PDF manipulation
- `pdf-lib` - PDF generation and modification

### Field Mapping Format

```json
[
  {
    "name": "Field Name",
    "coordinates": { "x": 100, "y": 200 },
    "dimensions": { "width": 150, "height": 25 },
    "fontSize": 12
  }
]
```

### Coordinate System
- **Canvas coordinates**: Top-left origin (used in the mapper)
- **PDF coordinates**: Bottom-left origin (automatically converted in generator)

## API Reference

### `generateFilledPdf()`
```typescript
async function generateFilledPdf(
  templatePdfUrl: string,
  fieldMappings: FieldMapping[],
  formData: FormData
): Promise<Uint8Array>
```

Generates a filled PDF based on template and field mappings.

**Parameters:**
- `templatePdfUrl` - Path to the template PDF file
- `fieldMappings` - Array of field mappings with coordinates
- `formData` - Object containing field values

**Returns:** Promise resolving to PDF bytes

### `downloadPdf()`
```typescript
function downloadPdf(pdfBytes: Uint8Array, filename?: string): void
```

Downloads the generated PDF to the user's computer.

### `openPdfInNewTab()`
```typescript
function openPdfInNewTab(pdfBytes: Uint8Array): void
```

Opens the generated PDF in a new browser tab.

## Workflow Example

### Step 1: Map Fields
1. Open `/pdf-mapper`
2. Add a field named "Employee Name"
3. Position it at the correct location on the PDF
4. Adjust size and font as needed
5. Repeat for all fields
6. Export mapping as `form-2316-mapping.json`

### Step 2: Generate PDFs
1. Import the mapping JSON into your generator
2. Create form data object:
```typescript
const formData = {
  'Employee Name': 'DELA CRUZ, JUAN',
  'TIN': '123-456-789-000',
  // ... other fields
};
```
3. Generate PDF:
```typescript
const pdfBytes = await generateFilledPdf(
  '/assets/forms/2316.pdf',
  fieldMappings,
  formData
);
downloadPdf(pdfBytes, 'filled-form.pdf');
```

## Tips & Best Practices

1. **Accurate Positioning**: Use the zoom feature to position fields precisely
2. **Font Sizing**: Test different font sizes to ensure text fits properly
3. **Sample Values**: Always test with sample data before production use
4. **Save Mappings**: Keep your field mapping JSON files in version control
5. **Coordinate Verification**: Use the mouse position tracker to verify coordinates
6. **Multi-page PDFs**: Current implementation supports first page; extend for multiple pages

## Troubleshooting

### PDF not loading
- Ensure the PDF path is correct and accessible
- Check browser console for CORS errors
- Verify PDF.js worker is properly configured

### Fields not appearing in correct position
- Remember coordinates are scaled with zoom
- Exported mappings use base coordinates (scale 1.0)
- PDF coordinates origin is bottom-left (auto-converted)

### Text overflow
- Increase field width
- Decrease font size
- Truncate long text values

## Future Enhancements

- [ ] Multi-page PDF support
- [ ] Field validation rules
- [ ] Custom fonts support
- [ ] Checkbox and radio button fields
- [ ] Image field support
- [ ] Template library
- [ ] Batch PDF generation
- [ ] Field grouping and sections

## Support

For issues or questions, please refer to the component documentation or contact the development team.
