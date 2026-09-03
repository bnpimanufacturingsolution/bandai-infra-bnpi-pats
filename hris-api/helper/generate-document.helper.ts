import { PrismaClient } from "../generated/prisma";
import PDFDocument from "pdfkit";
import { getLogger } from "./logger.helper";

const logger = getLogger();
const documentLogger = logger.child({ module: "document-generator" });

interface EmployeeData {
	id: string;
	employeeId: string;
	person: {
		personalInfo: {
			firstName: string;
			lastName: string;
			middleName?: string;
		};
	};
	position?: {
		title: string;
	};
	department?: {
		name: string;
	};
	employmentHireDate?: Date | string;
	employmentStatus?: string;
}

/**
 * Generate a Certificate of Employment PDF
 * @param employeeData - Employee data from the database
 * @returns PDF buffer
 */
export const generateCertificateOfEmployment = async (
	employeeData: EmployeeData,
): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({
				size: "A4",
				margins: {
					top: 72,
					bottom: 72,
					left: 72,
					right: 72,
				},
			});

			const buffers: Buffer[] = [];
			doc.on("data", buffers.push.bind(buffers));
			doc.on("end", () => {
				const pdfBuffer = Buffer.concat(buffers);
				resolve(pdfBuffer);
			});
			doc.on("error", reject);

			// Get current date
			const currentDate = new Date();
			const formattedDate = currentDate.toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
			});

			// Extract employee information
			const firstName = employeeData.person.personalInfo.firstName || "";
			const middleName = employeeData.person.personalInfo.middleName || "";
			const lastName = employeeData.person.personalInfo.lastName || "";
			const fullName = `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, " ").trim();
			const position = employeeData.position?.title || "Employee";
			const department = employeeData.department?.name || "N/A";
			const hireDate = employeeData.employmentHireDate
				? new Date(employeeData.employmentHireDate).toLocaleDateString("en-US", {
						year: "numeric",
						month: "long",
						day: "numeric",
					})
				: "N/A";

			// Company Header
			doc.fontSize(20)
				.font("Helvetica-Bold")
				.text("BANDAI COMPANY", { align: "center" })
				.moveDown(0.5);

			doc.fontSize(10)
				.font("Helvetica")
				.text("Human Resources Department", { align: "center" })
				.text("123 Business Street, City, Country", { align: "center" })
				.text("Phone: +1 234 567 8900 | Email: hr@bandai.com", { align: "center" })
				.moveDown(2);

			// Document Title
			doc.fontSize(16)
				.font("Helvetica-Bold")
				.text("CERTIFICATE OF EMPLOYMENT", { align: "center", underline: true })
				.moveDown(2);

			// Date
			doc.fontSize(11)
				.font("Helvetica")
				.text(`Date: ${formattedDate}`, { align: "right" })
				.moveDown(2);

			// Salutation
			doc.fontSize(11)
				.font("Helvetica")
				.text("To Whom It May Concern:", { align: "left" })
				.moveDown(1);

			// Body
			const bodyText = `This is to certify that ${fullName.toUpperCase()} has been employed with Bandai Company as ${position} in the ${department} department since ${hireDate}.`;

			doc.fontSize(11).font("Helvetica").text(bodyText, {
				align: "justify",
				lineGap: 5,
			});

			doc.moveDown(1);

			const statusText =
				employeeData.employmentStatus === "ACTIVE"
					? `${fullName.toUpperCase()} is currently an active employee in good standing with the company.`
					: `${fullName.toUpperCase()} was employed with the company.`;

			doc.fontSize(11).font("Helvetica").text(statusText, {
				align: "justify",
				lineGap: 5,
			});

			doc.moveDown(1);

			doc.fontSize(11)
				.font("Helvetica")
				.text(
					"This certificate is being issued upon the request of the above-named employee for whatever legal purpose it may serve.",
					{
						align: "justify",
						lineGap: 5,
					},
				)
				.moveDown(3);

			// Signature Section
			doc.fontSize(11).font("Helvetica").text("Issued by:", { align: "left" }).moveDown(2);

			doc.fontSize(11)
				.font("Helvetica-Bold")
				.text("_______________________________", { align: "left" })
				.moveDown(0.3);

			doc.fontSize(10).font("Helvetica").text("HR Manager", { align: "left" }).moveDown(0.3);

			doc.fontSize(10)
				.font("Helvetica")
				.text("Bandai Company", { align: "left" })
				.moveDown(3);

			// Footer
			doc.fontSize(8)
				.font("Helvetica-Oblique")
				.text(
					"This is a computer-generated document and does not require a physical signature.",
					{
						align: "center",
					},
				)
				.moveDown(0.5);

			doc.fontSize(8)
				.font("Helvetica")
				.text(
					`Document Reference: COE-${employeeData.employeeId}-${currentDate.getFullYear()}`,
					{
						align: "center",
					},
				);

			// Finalize PDF
			doc.end();

			documentLogger.info(`Generated Certificate of Employment for employee: ${fullName}`);
		} catch (error) {
			documentLogger.error(`Error generating Certificate of Employment: ${error}`);
			reject(error);
		}
	});
};

/**
 * Generate Payslip PDF
 * @param data - Payroll breakdown data
 * @returns PDF buffer
 */
export const generatePayslip = async (data: any): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({
				size: "A4",
				margins: {
					top: 50,
					bottom: 50,
					left: 50,
					right: 50,
				},
			});

			const buffers: Buffer[] = [];
			doc.on("data", buffers.push.bind(buffers));
			doc.on("end", () => {
				const pdfBuffer = Buffer.concat(buffers);
				resolve(pdfBuffer);
			});
			doc.on("error", reject);

			const PRIMARY_COLOR = "#D32F2F"; // Red branding
			const ACCENT_COLOR = "#FFEBEE";
			const TEXT_COLOR = "#333333";

			// --- Header Section ---
			// Background shape for header
			doc.rect(0, 0, doc.page.width, 140).fill(PRIMARY_COLOR);

			// Company Name
			doc.fillColor("white").fontSize(24).font("Helvetica-Bold").text("Bandai HRIS", 50, 45);

			doc.fontSize(10).font("Helvetica").text("Fulfilling Your Needs", 50, 75);

			// PAYSLIP Title
			doc.fontSize(36)
				.font("Helvetica-Bold")
				.text("PAYSLIP", 0, 50, { align: "right", width: doc.page.width - 50 });

			// White container for content
			const contentTop = 160;

			// --- Employee Information ---
			doc.fillColor(TEXT_COLOR);

			doc.fontSize(14).font("Helvetica-Bold").text("EMPLOYEE INFORMATION:", 50, contentTop);

			const infoStartY = contentTop + 30;
			const col1X = 50;
			const col2X = 300;

			doc.fontSize(10).font("Helvetica-Bold").text("Employee Name:", col1X, infoStartY);
			doc.font("Helvetica").text(data.employeeInfo.name, col1X + 90, infoStartY);

			doc.font("Helvetica-Bold").text("Position:", col1X, infoStartY + 15);
			doc.font("Helvetica").text(data.employeeInfo.position, col1X + 90, infoStartY + 15);

			doc.font("Helvetica-Bold").text("Employee ID:", col2X, infoStartY);
			doc.font("Helvetica").text(data.employeeInfo.employeeId, col2X + 80, infoStartY);

			doc.font("Helvetica-Bold").text("Department:", col2X, infoStartY + 15);
			doc.font("Helvetica").text(data.employeeInfo.department, col2X + 80, infoStartY + 15);

			doc.font("Helvetica-Bold").text("Pay Period:", col2X, infoStartY + 30);
			const startDate = new Date(data.payrollPeriod.startDate).toLocaleDateString();
			const endDate = new Date(data.payrollPeriod.endDate).toLocaleDateString();
			doc.font("Helvetica").text(`${startDate} - ${endDate}`, col2X + 80, infoStartY + 30);

			// --- Earnings & Deductions Tables ---
			const tableTop = infoStartY + 60;

			// Table Headers
			// Left side: Earnings
			doc.rect(50, tableTop, 250, 30).fill(TEXT_COLOR); // Black header for description
			doc.fillColor("white")
				.fontSize(10)
				.font("Helvetica-Bold")
				.text("EARNINGS", 60, tableTop + 10);

			doc.rect(300, tableTop, 250, 30).fill(PRIMARY_COLOR); // Red header for amount
			doc.fillColor("white").text("AMOUNT", 310, tableTop + 10, {
				align: "right",
				width: 230,
			});

			let currentY = tableTop + 40;
			doc.fillColor(TEXT_COLOR);

			const formatCurrency = (val: number) =>
				"P" +
				val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

			const addRow = (label: string, value: number, isTotal = false) => {
				if (currentY > 750) {
					doc.addPage();
					currentY = 50;
				}

				if (isTotal) {
					doc.font("Helvetica-Bold");
				} else {
					doc.font("Helvetica");
				}

				// Alternating row background (optional, simple white for now)
				// doc.rect(50, currentY - 5, 500, 20).fill(index % 2 === 0 ? "white" : "#F5F5F5");
				// doc.fillColor(TEXT_COLOR);

				doc.text(label, 60, currentY);
				doc.text(formatCurrency(value), 310, currentY, { align: "right", width: 230 });
				currentY += 20;
			};

			// Earnings
			addRow("Basic Salary", data.payroll.basicPay);
			if (data.payroll.allowances > 0) addRow("Allowances", data.payroll.allowances);
			if (data.payroll.overtimePay > 0) addRow("Overtime", data.payroll.overtimePay);
			if (data.payroll.bonuses > 0) addRow("Bonuses", data.payroll.bonuses);
			if (data.payroll.holidayPay > 0) addRow("Holiday Pay", data.payroll.holidayPay);
			if (data.payroll.nightDiffPay > 0)
				addRow("Night Differential", data.payroll.nightDiffPay);

			// Draw line
			doc.moveTo(50, currentY).lineTo(550, currentY).strokeColor("#E0E0E0").stroke();
			currentY += 10;
			addRow("Total Earnings", data.payroll.grossPay, true);

			currentY += 20;

			// Deductions Header
			doc.rect(50, currentY, 500, 30).fill("#FFEBEE"); // Light red bg
			doc.fillColor(PRIMARY_COLOR)
				.fontSize(10)
				.font("Helvetica-Bold")
				.text("DEDUCTIONS", 60, currentY + 10);
			currentY += 40;
			doc.fillColor(TEXT_COLOR);

			// Deductions
			addRow("Withholding Tax", data.payroll.withholdingTax);
			addRow("SSS Contribution", data.payroll.contributions.sss);
			addRow("PhilHealth Contribution", data.payroll.contributions.philHealth);
			addRow("Pag-IBIG Contribution", data.payroll.contributions.pagIbig);
			if (data.payroll.deductions.loans > 0)
				addRow("Loan Deductions", data.payroll.deductions.loans);
			if (data.payroll.deductions.other > 0)
				addRow("Other Deductions", data.payroll.deductions.other);

			// Draw line
			doc.moveTo(50, currentY).lineTo(550, currentY).strokeColor("#E0E0E0").stroke();
			currentY += 10;

			doc.fillColor(PRIMARY_COLOR);
			addRow("Total Deductions", data.payroll.deductions.total, true);

			currentY += 30;

			// Net Pay
			doc.rect(50, currentY, 500, 50).fill("#E8F5E9"); // Light green bg
			doc.fillColor("#2E7D32")
				.fontSize(14)
				.font("Helvetica-Bold")
				.text("NET PAY", 70, currentY + 18);

			doc.fontSize(18).text(formatCurrency(data.payroll.netPay), 310, currentY + 15, {
				align: "right",
				width: 220,
			});

			currentY += 80;

			// Footer / Signatures
			if (currentY > 700) doc.addPage();

			const datePaid = data.payroll.paidAt
				? new Date(data.payroll.paidAt).toLocaleDateString()
				: "Pending";

			doc.fillColor(TEXT_COLOR)
				.fontSize(10)
				.font("Helvetica")
				.text(`Paid on: ${datePaid}`, 60, currentY);

			doc.text("Prepared by:", 350, currentY);
			currentY += 40;

			doc.font("Helvetica-Bold").text("HR Manager", 350, currentY);
			doc.font("Helvetica").text("Bandai HRIS", 350, currentY + 15);

			// Bottom footer
			const bottomY = doc.page.height - 50;
			doc.fontSize(8)
				.fillColor("#999999")
				.text("This is a system generated document.", 50, bottomY, {
					align: "center",
					width: 500,
				});

			doc.end();

			documentLogger.info(`Generated Payslip for employee: ${data.employeeInfo.name}`);
		} catch (error) {
			documentLogger.error(`Error generating Payslip: ${error}`);
			reject(error);
		}
	});
};

/**
 * Generate document based on type
 * @param documentType - Type of document to generate
 * @param employeeData - Employee data
 * @returns PDF buffer
 */
export const generateDocument = async (
	documentType: string,
	employeeData: EmployeeData,
): Promise<Buffer> => {
	switch (documentType) {
		case "CERTIFICATE_OF_EMPLOYMENT":
			return generateCertificateOfEmployment(employeeData);
		case "PAYSLIP":
			return generatePayslip(employeeData);
		default:
			throw new Error(`Unsupported document type: ${documentType}`);
	}
};
