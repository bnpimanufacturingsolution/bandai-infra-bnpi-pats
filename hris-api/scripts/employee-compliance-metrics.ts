/**
 * Employee Compliance Metrics Script
 *
 * This script analyzes employee document compliance and displays comprehensive metrics.
 * It checks for required government documents: Gov't ID, TIN, SSS, PhilHealth, and Pag-IBIG.
 *
 * Usage:
 * npm run metrics:compliance
 * npm run metrics:compliance -- --detailed (for detailed employee breakdown)
 * npm run metrics:compliance -- --export (to export to JSON file)
 */

import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

// Document Types to check
const DOCUMENT_TYPES = {
	GOVT_ID: ["Government ID", "Gov't ID", "Government Issued ID", "Valid ID", "govt id"],
	TIN: ["TIN", "Tax Identification Number", "TIN ID", "tin"],
	SSS: ["SSS", "Social Security System", "SSS ID", "sss"],
	PHILHEALTH: ["PhilHealth", "Philhealth", "PhilHealth ID", "philhealth"],
	PAGIBIG: ["Pag-IBIG", "HDMF", "Pag-ibig", "Pag-IBIG ID", "pagibig", "pag-ibig"],
};

interface EmployeeDocument {
	name: string;
	type: string;
	number?: string | null;
	issueDate?: Date | null;
	expiryDate?: Date | null;
	fileUrl?: string | null;
	ext?: string | null;
}

interface ComplianceStats {
	totalEmployees: number;
	compliantEmployees: number;
	compliancePercentage: number;
	totalDocuments: number;
	verifiedDocuments: number;
	verificationPercentage: number;
	documentBreakdown: {
		govtId: { count: number; percentage: number; employees: string[] };
		tin: { count: number; percentage: number; employees: string[] };
		sss: { count: number; percentage: number; employees: string[] };
		philhealth: { count: number; percentage: number; employees: string[] };
		pagibig: { count: number; percentage: number; employees: string[] };
	};
	nonCompliantEmployees: Array<{
		id: string;
		employeeId: string;
		name: string;
		department: string;
		position: string;
		missingDocs: string[];
	}>;
}

// Helper: Check if employee has a specific document type
function hasDocument(
	documents: EmployeeDocument[],
	docTypes: string[],
	personIdentification?: any,
): boolean {
	// Special case: Check person identification for Government ID
	if (
		docTypes === DOCUMENT_TYPES.GOVT_ID &&
		personIdentification &&
		personIdentification.number
	) {
		return true;
	}

	if (!documents || documents.length === 0) return false;

	return documents.some((doc) =>
		docTypes.some(
			(type) =>
				doc.type && doc.type.toLowerCase().includes(type.toLowerCase()),
		),
	);
}

// Helper: Get all missing document types for an employee
function getMissingDocuments(
	documents: EmployeeDocument[],
	personIdentification?: any,
): string[] {
	const missing: string[] = [];

	if (!hasDocument(documents, DOCUMENT_TYPES.GOVT_ID, personIdentification))
		missing.push("Gov't ID");
	if (!hasDocument(documents, DOCUMENT_TYPES.TIN, personIdentification))
		missing.push("TIN");
	if (!hasDocument(documents, DOCUMENT_TYPES.SSS, personIdentification))
		missing.push("SSS");
	if (!hasDocument(documents, DOCUMENT_TYPES.PHILHEALTH, personIdentification))
		missing.push("PhilHealth");
	if (!hasDocument(documents, DOCUMENT_TYPES.PAGIBIG, personIdentification))
		missing.push("Pag-IBIG");

	return missing;
}

// Helper: Check if employee is fully compliant (has all required docs)
function isCompliant(
	documents: EmployeeDocument[],
	personIdentification?: any,
): boolean {
	return (
		hasDocument(documents, DOCUMENT_TYPES.GOVT_ID, personIdentification) &&
		hasDocument(documents, DOCUMENT_TYPES.TIN, personIdentification) &&
		hasDocument(documents, DOCUMENT_TYPES.SSS, personIdentification) &&
		hasDocument(documents, DOCUMENT_TYPES.PHILHEALTH, personIdentification) &&
		hasDocument(documents, DOCUMENT_TYPES.PAGIBIG, personIdentification)
	);
}

// Fetch all employees with documents
async function fetchEmployees() {
	try {
		console.log("ðŸ” Fetching employees from database...\n");

		const employees = await prisma.employee.findMany({
			where: {
				isDeleted: false,
				employmentStatus: {
					in: ["ACTIVE", "ONBOARDING"],
				},
			},
			select: {
				id: true,
				employeeId: true,
				employmentStatus: true,
				documents: {
					where: { isDeleted: false },
				},
				person: {
					select: {
						personalInfo: true,
						identification: true,
					},
				},
				department: {
					select: {
						id: true,
						name: true,
					},
				},
				position: {
					select: {
						id: true,
						title: true,
					},
				},
			},
		});

		console.log(`âœ… Found ${employees.length} active employees\n`);
		return employees;
	} catch (error: any) {
		console.error("âŒ Failed to fetch employees:", error.message);
		process.exit(1);
	}
}

// Calculate compliance statistics
function calculateCompliance(employees: any[]): ComplianceStats {
	const totalEmployees = employees.length;
	let compliantCount = 0;
	let totalDocuments = 0;
	let verifiedDocuments = 0;

	const govtIdEmployees: string[] = [];
	const tinEmployees: string[] = [];
	const sssEmployees: string[] = [];
	const philhealthEmployees: string[] = [];
	const pagibigEmployees: string[] = [];

	const nonCompliant: ComplianceStats["nonCompliantEmployees"] = [];

	employees.forEach((employee) => {
		const employeeName =
			employee.person?.personalInfo?.firstName &&
			employee.person?.personalInfo?.lastName
				? `${employee.person.personalInfo.firstName} ${employee.person.personalInfo.lastName}`
				: employee.employeeId;

		const departmentName = employee.department?.name || "N/A";
		const positionName = employee.position?.title || "N/A";

		const docs = (employee.documents || []) as EmployeeDocument[];
		const personId = employee.person?.identification;

		// Check each document type
		if (hasDocument(docs, DOCUMENT_TYPES.GOVT_ID, personId)) {
			govtIdEmployees.push(employee.id);
			verifiedDocuments++;
		}
		if (hasDocument(docs, DOCUMENT_TYPES.TIN, personId)) {
			tinEmployees.push(employee.id);
			verifiedDocuments++;
		}
		if (hasDocument(docs, DOCUMENT_TYPES.SSS, personId)) {
			sssEmployees.push(employee.id);
			verifiedDocuments++;
		}
		if (hasDocument(docs, DOCUMENT_TYPES.PHILHEALTH, personId)) {
			philhealthEmployees.push(employee.id);
			verifiedDocuments++;
		}
		if (hasDocument(docs, DOCUMENT_TYPES.PAGIBIG, personId)) {
			pagibigEmployees.push(employee.id);
			verifiedDocuments++;
		}

		// Check compliance
		if (isCompliant(docs, personId)) {
			compliantCount++;
		} else {
			const missingDocs = getMissingDocuments(docs, personId);
			nonCompliant.push({
				id: employee.id,
				employeeId: employee.employeeId,
				name: employeeName,
				department: departmentName,
				position: positionName,
				missingDocs,
			});
		}
	});

	totalDocuments = totalEmployees * 5; // 5 required document types per employee

	return {
		totalEmployees,
		compliantEmployees: compliantCount,
		compliancePercentage:
			totalEmployees > 0 ? (compliantCount / totalEmployees) * 100 : 0,
		totalDocuments,
		verifiedDocuments,
		verificationPercentage:
			totalDocuments > 0 ? (verifiedDocuments / totalDocuments) * 100 : 0,
		documentBreakdown: {
			govtId: {
				count: govtIdEmployees.length,
				percentage:
					totalEmployees > 0
						? (govtIdEmployees.length / totalEmployees) * 100
						: 0,
				employees: govtIdEmployees,
			},
			tin: {
				count: tinEmployees.length,
				percentage:
					totalEmployees > 0 ? (tinEmployees.length / totalEmployees) * 100 : 0,
				employees: tinEmployees,
			},
			sss: {
				count: sssEmployees.length,
				percentage:
					totalEmployees > 0 ? (sssEmployees.length / totalEmployees) * 100 : 0,
				employees: sssEmployees,
			},
			philhealth: {
				count: philhealthEmployees.length,
				percentage:
					totalEmployees > 0
						? (philhealthEmployees.length / totalEmployees) * 100
						: 0,
				employees: philhealthEmployees,
			},
			pagibig: {
				count: pagibigEmployees.length,
				percentage:
					totalEmployees > 0
						? (pagibigEmployees.length / totalEmployees) * 100
						: 0,
				employees: pagibigEmployees,
			},
		},
		nonCompliantEmployees: nonCompliant,
	};
}

// Display progress bar
function progressBar(percentage: number, width: number = 30): string {
	const filled = Math.round((percentage / 100) * width);
	const empty = width - filled;
	return `[${"â–ˆ".repeat(filled)}${"â–‘".repeat(empty)}]`;
}

// Get color based on percentage
function getColorCode(percentage: number): string {
	if (percentage >= 90) return "\x1b[32m"; // Green
	if (percentage >= 75) return "\x1b[33m"; // Yellow
	if (percentage >= 60) return "\x1b[36m"; // Cyan
	return "\x1b[31m"; // Red
}

// Reset color
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// Display metrics in a beautiful format
function displayMetrics(
	stats: ComplianceStats,
	detailed: boolean = false,
): void {
	console.clear();

	// Header
	console.log("\n");
	console.log(
		BOLD +
			"â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" +
			RESET,
	);
	console.log(
		BOLD +
			"â•‘                  ðŸ“Š EMPLOYEE COMPLIANCE METRICS ðŸ“Š                    â•‘" +
			RESET,
	);
	console.log(
		BOLD +
			"â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" +
			RESET,
	);
	console.log("\n");

	// Overall Compliance
	const compColor = getColorCode(stats.compliancePercentage);
	console.log(BOLD + "â”Œâ”€ ðŸ“‹ OVERALL COMPLIANCE" + RESET);
	console.log("â”‚");
	console.log(
		`â”‚  ${compColor}${BOLD}${Math.round(stats.compliancePercentage)}%${RESET} ${progressBar(stats.compliancePercentage, 40)}`,
	);
	console.log(
		`â”‚  ${BOLD}${stats.compliantEmployees}${RESET} of ${BOLD}${stats.totalEmployees}${RESET} employees compliant`,
	);
	console.log("â”‚");
	console.log(
		`â”‚  ${DIM}${stats.totalEmployees - stats.compliantEmployees} employees need attention${RESET}`,
	);
	console.log("â””" + "â”€".repeat(70));
	console.log("\n");

	// Document Verification
	const verColor = getColorCode(stats.verificationPercentage);
	console.log(BOLD + "â”Œâ”€ âœ… DOCUMENT VERIFICATION" + RESET);
	console.log("â”‚");
	console.log(
		`â”‚  ${verColor}${BOLD}${Math.round(stats.verificationPercentage)}%${RESET} ${progressBar(stats.verificationPercentage, 40)}`,
	);
	console.log(
		`â”‚  ${BOLD}${stats.verifiedDocuments}${RESET} of ${BOLD}${stats.totalDocuments}${RESET} documents verified`,
	);
	console.log(
		`â”‚  ${DIM}${stats.totalDocuments - stats.verifiedDocuments} documents missing${RESET}`,
	);
	console.log("â””" + "â”€".repeat(70));
	console.log("\n");

	// Document Type Breakdown
	console.log(BOLD + "â”Œâ”€ ðŸ“‘ DOCUMENT TYPE BREAKDOWN" + RESET);
	console.log("â”‚");

	const docTypes = [
		{ name: "Gov't ID", icon: "ðŸªª", data: stats.documentBreakdown.govtId },
		{ name: "TIN", icon: "ðŸ¦", data: stats.documentBreakdown.tin },
		{ name: "SSS", icon: "ðŸ‘¥", data: stats.documentBreakdown.sss },
		{
			name: "PhilHealth",
			icon: "ðŸ¥",
			data: stats.documentBreakdown.philhealth,
		},
		{ name: "Pag-IBIG", icon: "ðŸ ", data: stats.documentBreakdown.pagibig },
	];

	docTypes.forEach((docType, index) => {
		const color = getColorCode(docType.data.percentage);
		const percentage = Math.round(docType.data.percentage);
		console.log(
			`â”‚  ${docType.icon}  ${docType.name.padEnd(12)} ${color}${BOLD}${percentage}%${RESET} ${progressBar(docType.data.percentage, 30)} ${DIM}(${docType.data.count}/${stats.totalEmployees})${RESET}`,
		);
		if (index < docTypes.length - 1) console.log("â”‚");
	});

	console.log("â””" + "â”€".repeat(70));
	console.log("\n");

	// Statistics Summary
	console.log(BOLD + "â”Œâ”€ ðŸ“Š STATISTICS SUMMARY" + RESET);
	console.log("â”‚");
	console.log(
		`â”‚  Total Active Employees:      ${BOLD}${stats.totalEmployees.toString().padStart(6)}${RESET}`,
	);
	console.log(
		`â”‚  Fully Compliant:             ${BOLD}${getColorCode(stats.compliancePercentage)}${stats.compliantEmployees.toString().padStart(6)}${RESET}`,
	);
	console.log(
		`â”‚  Non-Compliant:               ${BOLD}\x1b[31m${stats.nonCompliantEmployees.length.toString().padStart(6)}${RESET}`,
	);
	console.log("â”‚");
	console.log(
		`â”‚  Total Expected Documents:    ${BOLD}${stats.totalDocuments.toString().padStart(6)}${RESET}`,
	);
	console.log(
		`â”‚  Documents Verified:          ${BOLD}${getColorCode(stats.verificationPercentage)}${stats.verifiedDocuments.toString().padStart(6)}${RESET}`,
	);
	console.log(
		`â”‚  Documents Missing:           ${BOLD}\x1b[31m${(stats.totalDocuments - stats.verifiedDocuments).toString().padStart(6)}${RESET}`,
	);
	console.log("â””" + "â”€".repeat(70));
	console.log("\n");

	// Show detailed breakdown if requested
	if (detailed && stats.nonCompliantEmployees.length > 0) {
		console.log(BOLD + "â”Œâ”€ âš ï¸  NON-COMPLIANT EMPLOYEES (Detailed)" + RESET);
		console.log("â”‚");

		stats.nonCompliantEmployees.forEach((emp, index) => {
			console.log(
				`â”‚  ${(index + 1).toString().padStart(3)}. ${BOLD}${emp.name}${RESET} ${DIM}(${emp.employeeId})${RESET}`,
			);
			console.log(
				`â”‚       ${DIM}Department: ${emp.department} | Position: ${emp.position}${RESET}`,
			);
			console.log(
				`â”‚       ${BOLD}\x1b[31mMissing:${RESET} ${emp.missingDocs.join(", ")}`,
			);
			if (index < stats.nonCompliantEmployees.length - 1) console.log("â”‚");
		});

		console.log("â””" + "â”€".repeat(70));
		console.log("\n");
	} else if (stats.nonCompliantEmployees.length > 0) {
		console.log(
			`${DIM}ðŸ’¡ Run with --detailed flag to see non-compliant employee breakdown${RESET}`,
		);
		console.log("\n");
	}

	// Footer
	const timestamp = new Date().toLocaleString();
	console.log(`${DIM}Generated at: ${timestamp}${RESET}`);
	console.log(
		`${DIM}Run: npm run metrics:compliance -- --detailed for more info${RESET}`,
	);
	console.log("\n");
}


// Main execution
async function main() {
	const args = process.argv.slice(2);
	const isDetailed = args.includes("--detailed");

	try {
		// Fetch employees
		const employees = await fetchEmployees();

		if (!employees) {
			console.error("âŒ No employees found");
			await prisma.$disconnect();
			process.exit(1);
		}

		// Calculate compliance
		const stats = calculateCompliance(employees);

		// Display metrics
		displayMetrics(stats, isDetailed);

		// Exit with appropriate code
		if (stats.compliantEmployees === stats.totalEmployees) {
			console.log(
				`${BOLD}\x1b[32mðŸŽ‰ All employees are compliant!${RESET}\n`,
			);
		}

		await prisma.$disconnect();
		process.exit(0);
	} catch (error: any) {
		console.error("\nâŒ Error:", error.message);
		await prisma.$disconnect();
		process.exit(1);
	}
}

// Run the script
main();
