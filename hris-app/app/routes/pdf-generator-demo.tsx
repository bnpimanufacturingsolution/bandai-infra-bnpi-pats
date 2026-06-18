import { useState } from "react";
import PdfGeneratorDemo from "~/components/PdfGeneratorDemo";
import type { FieldMapping } from "~/lib/pdfGenerator";

export default function PdfGeneratorDemoRoute() {
	// Example field mappings - these would normally be loaded from a JSON file
	// that was exported from the PDF Field Mapper tool
	const [fieldMappings] = useState<FieldMapping[]>([
		{
			name: "For the Year",
			coordinates: { x: 120, y: 145 },
			dimensions: { width: 100, height: 20 },
			fontSize: 10,
		},
		{
			name: "TIN",
			coordinates: { x: 120, y: 175 },
			dimensions: { width: 150, height: 20 },
			fontSize: 10,
		},
		{
			name: "Employee's Name",
			coordinates: { x: 120, y: 205 },
			dimensions: { width: 300, height: 20 },
			fontSize: 10,
		},
		{
			name: "RDO Code",
			coordinates: { x: 550, y: 205 },
			dimensions: { width: 80, height: 20 },
			fontSize: 10,
		},
		{
			name: "Basic Salary",
			coordinates: { x: 700, y: 235 },
			dimensions: { width: 120, height: 20 },
			fontSize: 9,
		},
	]);

	const templatePdfUrl = "/assets/forms/2316 Sep 2021 ENCS_Final_corrected.pdf";

	return (
		<div>
			<PdfGeneratorDemo templatePdfUrl={templatePdfUrl} fieldMappings={fieldMappings} />

			<div
				style={{
					padding: "2rem",
					maxWidth: "800px",
					margin: "0 auto",
					borderTop: "1px solid #ddd",
				}}>
				<h3 style={{ marginBottom: "1rem" }}>Field Mappings</h3>
				<details>
					<summary style={{ cursor: "pointer", fontWeight: "500", marginBottom: "1rem" }}>
						View Current Field Mappings (Click to expand)
					</summary>
					<pre
						style={{
							backgroundColor: "#f5f5f5",
							padding: "1rem",
							borderRadius: "4px",
							overflow: "auto",
							fontSize: "12px",
						}}>
						{JSON.stringify(fieldMappings, null, 2)}
					</pre>
				</details>

				<div
					style={{
						marginTop: "1.5rem",
						padding: "1rem",
						backgroundColor: "#e7f3ff",
						borderRadius: "4px",
					}}>
					<h4 style={{ marginBottom: "0.5rem" }}>
						How to create your own field mappings:
					</h4>
					<ol style={{ paddingLeft: "1.5rem", fontSize: "14px", lineHeight: "1.8" }}>
						<li>
							Go to the{" "}
							<a href="/pdf-mapper" style={{ color: "#007bff" }}>
								PDF Field Mapper
							</a>{" "}
							page
						</li>
						<li>Click &quot;Add Field&quot; to create new fillable fields</li>
						<li>Drag and resize the fields to match the PDF form layout</li>
						<li>
							Click &quot;Export Mapping&quot; to download the field configuration as
							JSON
						</li>
						<li>Use the exported JSON in this generator or import it later</li>
					</ol>
				</div>
			</div>
		</div>
	);
}
