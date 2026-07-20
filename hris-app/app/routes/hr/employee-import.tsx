import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import {
	Upload,
	Download,
	FileSpreadsheet,
	CheckCircle,
	XCircle,
	AlertCircle,
	ArrowLeft,
} from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import { useAuth } from "~/lib/hooks/use-auth";
type ImportResult = {
	success: boolean;
	employeeId: string;
	employeeDbId?: string;
	userId?: string;
	email?: string;
	error?: string;
};

export default function EmployeeImport() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [file, setFile] = useState<File | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
	const [summary, setSummary] = useState<{
		total: number;
		success: number;
		failed: number;
	} | null>(null);
	const [parseError, setParseError] = useState<string | null>(null);

	// Payload minimized: backend handles defaults, no extra payload

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0];
		if (selectedFile) {
			setFile(selectedFile);
			setParseError(null);
			setImportResults(null);
			setSummary(null);
		} else {
			setFile(null);
		}
	};

	const handleImport = async () => {
		if (!file) {
			setParseError("No file to import");
			return;
		}

		setIsProcessing(true);
		setImportResults(null);
		setSummary(null);

		const formData = new FormData();
		formData.append("file", file);
		// no extra fields; backend defaults will be used

		try {
			const response = await fetch("/api/employee/import", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${user?.token ?? ""}`,
				},
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Import failed");
			}

			setImportResults(data.data.results);
			setSummary(data.data.summary);
		} catch (error) {
			setParseError(error instanceof Error ? error.message : "Import failed");
		} finally {
			setIsProcessing(false);
		}
	};

	const handleDownloadTemplate = () => {
		const template = `EMP_ID,NAME,POSITION,LEVEL,DEPARTMENT,TIN,SSS,PHILHEALTH,PAGIBIG,HIRE_DATE,BASIC_SALARY,ROLE,EMAIL,PHONE,BIRTHDAY,GENDER
EMP-001,Juan Dela Cruz,Software Engineer,Mid,Information Technology,123-456-789-001,12-3456789-1,12-345678901-3,1234-5678-9013,2025-01-15,50000,hris-employee,juan.delacruz@company.com,09171234567,1990-05-10,male`;

		const blob = new Blob([template], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "employee-import-template.csv";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	};

	const handleBackToList = () => {
		navigate("/hr/employees");
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button
						variant="outline"
						size="sm"
						onClick={handleBackToList}
						className="flex items-center gap-2">
						<ArrowLeft className="w-4 h-4" />
						Back to Employee Records
					</Button>
				</div>
			</div>

			{/* Instructions Card */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FileSpreadsheet className="w-5 h-5" />
						Import Employees
					</CardTitle>
					<CardDescription>
						Upload a CSV or Excel file to bulk import employee data
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
						<h4 className="font-medium text-blue-900 flex items-center gap-2">
							<AlertCircle className="w-4 h-4" />
							Instructions
						</h4>
						<ul className="text-sm text-blue-800 space-y-1 ml-6 list-disc">
							<li>Download the template CSV file to see the required format</li>
							<li>
								Required columns: EMP_ID, NAME, POSITION, LEVEL, DEPARTMENT, TIN,
								SSS, PHILHEALTH, PAGIBIG, HIRE_DATE, BASIC_SALARY
							</li>
							<li>Optional columns: ROLE, EMAIL, PHONE, BIRTHDAY, GENDER</li>
							<li>
								ROLE values: hris-employee, hris-employee-manager, hris-hr-user,
								hris-hr-manager, hris-timekeeper (defaults to hris-employee)
							</li>
							<li>NAME will be auto-parsed to first/middle/last names</li>
							<li>Position, Level, and Department must exist in the system</li>
							<li>
								All government IDs (TIN, SSS, PhilHealth, Pag-IBIG) are required
							</li>
							<li>Default password will be the Employee ID (EMP_ID)</li>
						</ul>
					</div>

					<Button
						variant="outline"
						onClick={handleDownloadTemplate}
						className="flex items-center gap-2">
						<Download className="w-4 h-4" />
						Download Template
					</Button>
				</CardContent>
			</Card>

			{/* Upload Card */}
			<Card>
				<CardHeader>
					<CardTitle>Upload File</CardTitle>
					<CardDescription>
						Select a CSV or Excel file containing employee data
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-4">
						<input
							type="file"
							accept=".csv, .xlsx, .xls"
							onChange={handleFileChange}
							className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
						/>
					</div>

					{parseError && (
						<div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
							<XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
							<div>
								<p className="font-medium text-red-900">Error</p>
								<p className="text-sm text-red-700">{parseError}</p>
							</div>
						</div>
					)}

					{file && !importResults && (
						<div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
							<div className="flex items-center gap-2">
								<CheckCircle className="w-5 h-5 text-green-600" />
								<p className="font-medium text-green-900">
									File selected: {file.name}
								</p>
							</div>
							<p className="text-sm text-green-700">
								Ready to import. Click the button below to start.
							</p>
						</div>
					)}

					{file && !importResults && (
						<Button
							onClick={handleImport}
							disabled={isProcessing}
							className="flex items-center gap-2">
							<Upload className="w-4 h-4" />
							{isProcessing ? "Importing..." : "Import Employees"}
						</Button>
					)}
				</CardContent>
			</Card>

			{/* Results Card */}
			{summary && importResults && (
				<Card>
					<CardHeader>
						<CardTitle>Import Results</CardTitle>
						<CardDescription>Summary of the import operation</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Summary */}
						<div className="grid grid-cols-3 gap-4">
							<div className="bg-gray-50 p-4 rounded-lg">
								<p className="text-sm text-gray-600">Total</p>
								<p className="text-2xl font-bold">{summary.total}</p>
							</div>
							<div className="bg-green-50 p-4 rounded-lg">
								<p className="text-sm text-green-600">Success</p>
								<p className="text-2xl font-bold text-green-700">
									{summary.success}
								</p>
							</div>
							<div className="bg-red-50 p-4 rounded-lg">
								<p className="text-sm text-red-600">Failed</p>
								<p className="text-2xl font-bold text-red-700">{summary.failed}</p>
							</div>
						</div>

						{/* Results Table */}
						<div className="border rounded-lg overflow-hidden">
							<div className="max-h-96 overflow-y-auto">
								<table className="w-full text-sm">
									<thead className="bg-gray-50 sticky top-0">
										<tr>
											<th className="px-4 py-2 text-left font-medium text-gray-700">
												Employee ID
											</th>
											<th className="px-4 py-2 text-left font-medium text-gray-700">
												Email
											</th>
											<th className="px-4 py-2 text-left font-medium text-gray-700">
												Status
											</th>
											<th className="px-4 py-2 text-left font-medium text-gray-700">
												Details
											</th>
										</tr>
									</thead>
									<tbody className="divide-y">
										{importResults.map((result, index) => (
											<tr key={index} className="hover:bg-gray-50">
												<td className="px-4 py-3 font-mono text-xs">
													{result.employeeId}
												</td>
												<td className="px-4 py-3">
													{result.email || "N/A"}
												</td>
												<td className="px-4 py-3">
													{result.success ? (
														<Badge variant="default">Success</Badge>
													) : (
														<Badge variant="destructive">Failed</Badge>
													)}
												</td>
												<td className="px-4 py-3 text-xs">
													{result.success ? (
														<span className="text-green-600">
															Created (User ID:{" "}
															{result.userId || "Pending"})
														</span>
													) : (
														<span className="text-red-600">
															{result.error}
														</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>

						{summary.success > 0 && (
							<Button onClick={handleBackToList} className="w-full">
								View Employees
							</Button>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
