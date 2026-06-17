import { useState } from "react";
import {
	generateFilledPdf,
	downloadPdf,
	openPdfInNewTab,
	type FieldMapping,
	type FormData,
} from "~/lib/pdfGenerator";

interface PdfGeneratorDemoProps {
	templatePdfUrl: string;
	fieldMappings: FieldMapping[];
}

export default function PdfGeneratorDemo({ templatePdfUrl, fieldMappings }: PdfGeneratorDemoProps) {
	const [formData, setFormData] = useState<FormData>({});
	const [isGenerating, setIsGenerating] = useState(false);

	const handleInputChange = (fieldName: string, value: string) => {
		setFormData((prev) => ({
			...prev,
			[fieldName]: value,
		}));
	};

	const handleGenerate = async (action: "download" | "preview") => {
		try {
			setIsGenerating(true);

			const pdfBytes = await generateFilledPdf(templatePdfUrl, fieldMappings, formData);

			if (action === "download") {
				downloadPdf(pdfBytes, "BIR-Form-2316.pdf");
			} else {
				openPdfInNewTab(pdfBytes);
			}
		} catch (error) {
			console.error("Error generating PDF:", error);
			alert("Failed to generate PDF. Please try again.");
		} finally {
			setIsGenerating(false);
		}
	};

	const handleLoadSampleData = () => {
		const sampleData: FormData = {
			"For the Year": "2024",
			TIN: "123-456-789-000",
			"Employee's Name": "DELA CRUZ, JUAN PABLO",
			"RDO Code": "039",
			"Registered Address": "123 SAMPLE STREET, QUEZON CITY",
			"ZIP Code": "1100",
			"Date of Birth": "01/15/1990",
			"Contact Number": "09171234567",
			"Basic Salary": "300,000.00",
			"Employer's Name": "SAMPLE CORPORATION",
			"Employer Address": "456 BUSINESS AVE, MAKATI CITY",
			"Employer ZIP": "1200",
			"13th Month Pay": "25,000.00",
			"SSS Contributions": "3,600.00",
			"PHIC Contributions": "1,800.00",
			"PAG-IBIG Contributions": "2,400.00",
			"Taxable Compensation": "300,000.00",
			"Tax Withheld": "15,000.00",
		};

		setFormData(sampleData);
	};

	return (
		<div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
			<h1 style={{ marginBottom: "1.5rem", fontSize: "24px", fontWeight: "bold" }}>
				BIR Form 2316 Generator
			</h1>

			<div style={{ marginBottom: "2rem" }}>
				<button
					onClick={handleLoadSampleData}
					style={{ ...buttonStyle, backgroundColor: "#28a745" }}>
					Load Sample Data
				</button>
			</div>

			<div style={{ marginBottom: "2rem" }}>
				<h2 style={{ marginBottom: "1rem", fontSize: "18px", fontWeight: "600" }}>
					Form Fields
				</h2>

				<div style={{ display: "grid", gap: "1rem" }}>
					{fieldMappings.map((mapping) => (
						<div key={mapping.name}>
							<label
								style={{
									display: "block",
									marginBottom: "0.25rem",
									fontSize: "14px",
									fontWeight: "500",
								}}>
								{mapping.name}
							</label>
							<input
								type="text"
								value={formData[mapping.name] || ""}
								onChange={(e) => handleInputChange(mapping.name, e.target.value)}
								style={inputStyle}
								placeholder={`Enter ${mapping.name}`}
							/>
						</div>
					))}
				</div>
			</div>

			<div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
				<button
					onClick={() => handleGenerate("preview")}
					disabled={isGenerating}
					style={{
						...buttonStyle,
						backgroundColor: isGenerating ? "#ccc" : "#007bff",
						cursor: isGenerating ? "not-allowed" : "pointer",
					}}>
					{isGenerating ? "Generating..." : "Preview PDF"}
				</button>

				<button
					onClick={() => handleGenerate("download")}
					disabled={isGenerating}
					style={{
						...buttonStyle,
						backgroundColor: isGenerating ? "#ccc" : "#28a745",
						cursor: isGenerating ? "not-allowed" : "pointer",
					}}>
					{isGenerating ? "Generating..." : "Download PDF"}
				</button>
			</div>

			<div
				style={{
					marginTop: "2rem",
					padding: "1rem",
					backgroundColor: "#f8f9fa",
					borderRadius: "4px",
				}}>
				<h3 style={{ marginBottom: "0.5rem", fontSize: "16px", fontWeight: "600" }}>
					How to Use:
				</h3>
				<ol style={{ paddingLeft: "1.5rem", fontSize: "14px", lineHeight: "1.8" }}>
					<li>Fill in the form fields above with the employee information</li>
					<li>Click &quot;Load Sample Data&quot; to see example data</li>
					<li>Click &quot;Preview PDF&quot; to view the generated form in a new tab</li>
					<li>Click &quot;Download PDF&quot; to save the filled form to your computer</li>
				</ol>
			</div>

			<div
				style={{
					marginTop: "1rem",
					padding: "1rem",
					backgroundColor: "#fff3cd",
					borderRadius: "4px",
				}}>
				<p style={{ fontSize: "14px", margin: 0 }}>
					<strong>Note:</strong> Make sure you have created field mappings using the PDF
					Field Mapper tool first. The mappings should be imported or created to define
					where each field appears on the PDF.
				</p>
			</div>
		</div>
	);
}

const buttonStyle: React.CSSProperties = {
	padding: "10px 20px",
	backgroundColor: "#007bff",
	color: "white",
	border: "none",
	borderRadius: "4px",
	cursor: "pointer",
	fontSize: "14px",
	fontWeight: "500",
};

const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "8px 12px",
	border: "1px solid #ddd",
	borderRadius: "4px",
	fontSize: "14px",
};
