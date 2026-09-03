import fs from "fs";
import path from "path";

type EmployeeSeed = {
	employeeId: string;
	dateHired: string;
	section: string;
	lastName: string;
	firstName: string;
	middleName: string;
	address: string;
	zipCode: string;
	birthday: string;
	tin: string;
	civilStatus: string;
	dependents: string;
	previousEmployer: string;
	position: string;
	employmentStatus: "Active" | "Inactive";
	dateOfResignation: string;
	remarks: string;
	email: string;
	phone: string;
	sss?: string;
};

type PositionPoolEntry = {
	section: string;
	position: string;
};

const CSV_DIR = path.resolve(process.cwd(), "docs", "csv");
const TARGET_EMPLOYEE_COUNT = 100;

const EMPLOYEE_HEADER = [
	"Employee No.",
	"Date Hired",
	"Section",
	"Last Name",
	"First Name",
	"Middle Name",
	"Registered Address",
	"Zip Code",
	"Birthday",
	"TIN",
	"Civil Status",
	"No. of Dependents",
	"Previous Employer",
	"Position",
	"Employment Status",
	"Date of Resignation",
	"Remarks",
];

const PERSON_HEADER = [
	"sourcePersonKey",
	"employeeId",
	"personalInfo",
	"contactInfo",
	"identification",
	"metadata",
];

const REPORTING_LINE_HEADER = ["employeeId", "reportToEmployeeId"];
const DEPARTMENT_MANAGER_HEADER = ["departmentCode", "managerEmployeeId"];
const SCHEDULE_OVERRIDE_HEADER = [
	"employeeId",
	"date",
	"shiftTypeCode",
	"reason",
	"createdByEmployeeId",
];
const SCHEDULE_HISTORY_HEADER = [
	"employeeId",
	"action",
	"effectiveAt",
	"actorEmployeeId",
	"reason",
	"beforeSchedule",
	"afterSchedule",
	"metadata",
];
const DOCUMENT_FOLDER_HEADER = ["employeeId", "name"];
const DOCUMENT_HEADER = [
	"employeeId",
	"name",
	"type",
	"number",
	"issueDate",
	"expiryDate",
	"fileUrl",
	"ext",
	"documentTypeCode",
	"fieldValues",
	"metadata",
];
const LEAVE_BALANCE_HEADER = ["employeeId", "leaveType", "balance", "asOfDate", "carryover", "metadata"];
const EMPLOYEE_BENEFIT_HEADER = [
	"sourceBenefitKey",
	"employeeId",
	"benefitTypeName",
	"name",
	"description",
	"totalAmount",
	"currency",
	"totalInstallments",
	"installmentAmount",
	"remainingBalance",
	"amount",
	"startDate",
	"endDate",
	"startPayrollCutOff",
	"endPayrollCutOff",
	"agreedToTerms",
	"agreedAt",
	"agreedByIp",
	"status",
	"isActive",
	"approvedByEmployeeId",
	"approvedAt",
	"notes",
	"remarks",
];
const BENEFIT_INSTALLMENT_HEADER = [
	"sourceBenefitKey",
	"employeeId",
	"benefitTypeName",
	"installmentNumber",
	"amount",
	"scheduledDate",
	"processedDate",
	"payrollCutOffId",
	"payrollRunId",
	"status",
	"failureReason",
];
const EMPLOYEE_LOAN_HEADER = [
	"sourceLoanKey",
	"employeeId",
	"loanTypeName",
	"principalAmount",
	"interestRate",
	"totalAmount",
	"termMonths",
	"monthlyPayment",
	"startDate",
	"endDate",
	"amountPaid",
	"balance",
	"status",
	"approvedByEmployeeId",
	"approvedAt",
	"notes",
];
const ATTENDANCE_HEADER = [
	"employeeId",
	"date",
	"timeIn",
	"timeBreak",
	"timeOut",
	"status",
	"notes",
	"deviceEmpId",
	"metadata",
	"scheduleSnapshot",
];
const TIMESHEET_HEADER = [
	"employeeId",
	"payrollPeriodCode",
	"code",
	"status",
	"submittedAt",
	"submittedBy",
	"approvedBy",
	"approvalDate",
	"rejectionReason",
	"notes",
	"metadata",
];
const TIMESHEET_LINE_HEADER = [
	"employeeId",
	"payrollPeriodCode",
	"timesheetCode",
	"date",
	"revisionNo",
	"attendanceDate",
	"status",
	"timeIn",
	"timeBreak",
	"timeOut",
	"behaviorFlags",
	"scheduleSnapshot",
	"hoursWorked",
	"regularHours",
	"overtimeHours",
	"undertimeHours",
	"lateHours",
	"earlyOutHours",
	"breakMinutes",
	"notes",
	"metadata",
];
const PAYROLL_HEADER = [
	"employeeId",
	"payrollPeriodCode",
	"timesheetCode",
	"basicPay",
	"overtimePay",
	"nightDiffPay",
	"holidayPay",
	"allowances",
	"bonuses",
	"taxAmount",
	"sssContribution",
	"philHealthContribution",
	"pagibigContribution",
	"loanDeductions",
	"absentDeduction",
	"lateDeduction",
	"earlyOutDeduction",
	"otherDeductions",
	"grossPay",
	"totalDeductions",
	"netPay",
	"regularHours",
	"overtimeHours",
	"isPaid",
	"paidAt",
	"paymentMethod",
	"referenceNumber",
	"notes",
	"metadata",
];
const WORKFLOW_INSTANCE_HEADER = [
	"sourceWorkflowKey",
	"domain",
	"domainRecordId",
	"requestType",
	"code",
	"name",
	"description",
	"steps",
	"states",
	"currentStateKey",
	"stateHistory",
];
const REQUEST_HEADER = [
	"sourceRequestKey",
	"code",
	"type",
	"currentWorkflowStateKey",
	"startDate",
	"endDate",
	"description",
	"attachments",
	"requesterEmployeeId",
	"targetEmployeeId",
	"workflowCode",
	"currentStepNumber",
	"lastCompletedStepNumber",
	"notes",
	"metadata",
];
const WORKFLOW_STEP_HEADER = [
	"workflowCode",
	"workflowSourceKey",
	"requestCode",
	"requestSourceKey",
	"stepNumber",
	"stepName",
	"stepType",
	"assigneeType",
	"assigneeRole",
	"assigneeEmployeeId",
	"status",
	"completedAt",
	"comments",
	"metadata",
	"isRequired",
];
const REQUEST_TRANSACTION_HEADER = [
	"requestCode",
	"requestSourceKey",
	"workflowCode",
	"stepNumber",
	"actorEmployeeId",
	"sequenceNumber",
	"eventCategory",
	"eventKey",
	"eventSource",
	"actorType",
	"actorRole",
	"actorDisplayName",
	"title",
	"description",
	"comments",
	"fromStateKey",
	"toStateKey",
	"fieldChanges",
	"metadata",
	"visibility",
	"isSystemGenerated",
	"occurredAt",
];

const anchoredEmployees: EmployeeSeed[] = [
	{
		employeeId: "BNEI-001",
		dateHired: "4-Apr-13",
		section: "Production/Administration",
		lastName: "Salud",
		firstName: "Arvin",
		middleName: "Madeja",
		address: "972 Int. Inocencio St., San Roque, Cavite City",
		zipCode: "4100",
		birthday: "20-Oct-75",
		tin: "908718301",
		civilStatus: "Married",
		dependents: "",
		previousEmployer: "",
		position: "Deputy General Manager",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE | WPE | With Previous Employer",
		email: "alice.tan@example.com",
		phone: "09170000001",
		sss: "10-0000001-1",
	},
	{
		employeeId: "BNEI-002",
		dateHired: "22-Apr-13",
		section: "Project Engineering",
		lastName: "Libuit",
		firstName: "Augusto",
		middleName: "Llanes",
		address: "No. 382 Tinurik, Tanauan, Batangas",
		zipCode: "4232",
		birthday: "2-Aug-79",
		tin: "230407406",
		civilStatus: "Married",
		dependents: "",
		previousEmployer: "",
		position: "Senior Engineer",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "ben.reyes@example.com",
		phone: "09170000002",
		sss: "10-0000002-2",
	},
	{
		employeeId: "BNEI-003",
		dateHired: "17-May-13",
		section: "Production Planning",
		lastName: "Llarena",
		firstName: "Ivy Sheena",
		middleName: "Torres",
		address: "347 Brgy Cale, Tanauan City, Batangas",
		zipCode: "4232",
		birthday: "2-Apr-89",
		tin: "405577397",
		civilStatus: "Single",
		dependents: "",
		previousEmployer: "Device Dynamic Asia Philippines",
		position: "Senior Supervisor",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "cara.delacruz@example.com",
		phone: "09170000003",
		sss: "10-0000003-3",
	},
	{
		employeeId: "00050",
		dateHired: "1-Jul-13",
		section: "Product Assurance",
		lastName: "Almero",
		firstName: "Lesley",
		middleName: "Masarap",
		address: "1594 Brgy. Marawouy, Lipa City, Batangas",
		zipCode: "4217",
		birthday: "4-Mar-91",
		tin: "312720111",
		civilStatus: "Married",
		dependents: "",
		previousEmployer: "Epson Precision Philippines",
		position: "Senior Manager",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "lesley.almero@example.com",
		phone: "09170000050",
	},
	{
		employeeId: "00062",
		dateHired: "27-Aug-13",
		section: "Assembly",
		lastName: "Ebreo",
		firstName: "Danica",
		middleName: "Pabelonia",
		address: "No. 531 Plaridel, Lipa City, Batangas",
		zipCode: "4217",
		birthday: "17-Nov-91",
		tin: "440464421",
		civilStatus: "Married",
		dependents: "",
		previousEmployer: "",
		position: "Assistant Manager",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "danica.ebreo@example.com",
		phone: "09170000062",
	},
	{
		employeeId: "00065",
		dateHired: "27-Aug-13",
		section: "Decoration",
		lastName: "Belen",
		firstName: "Ma. Angelina",
		middleName: "Lejero",
		address: "Blk. 1, Lot 5 St. Mary's Subd. Inosluban, Lipa City",
		zipCode: "4217",
		birthday: "20-Nov-90",
		tin: "272772906",
		civilStatus: "Single",
		dependents: "",
		previousEmployer: "",
		position: "Assistant Manager",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "angelina.belen@example.com",
		phone: "09170000065",
	},
	{
		employeeId: "00073",
		dateHired: "21-Oct-13",
		section: "Process Engineering",
		lastName: "Andal",
		firstName: "Marilou",
		middleName: "Sarmiento",
		address: "Bago, Ibaan, Batangas",
		zipCode: "4230",
		birthday: "26-Feb-82",
		tin: "234742003",
		civilStatus: "Married",
		dependents: "",
		previousEmployer: "",
		position: "Manager",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "marilou.andal@example.com",
		phone: "09170000073",
	},
	{
		employeeId: "00083",
		dateHired: "1-Apr-14",
		section: "Injection and Mold Maintenance",
		lastName: "Redondo",
		firstName: "Maria Sarah Jane",
		middleName: "Liwanag",
		address: "Malabanan, Balete, Batangas",
		zipCode: "4219",
		birthday: "23-Aug-89",
		tin: "261704340",
		civilStatus: "Married",
		dependents: "",
		previousEmployer: "",
		position: "Senior Supervisor",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "sarahjane.redondo@example.com",
		phone: "09170000083",
	},
	{
		employeeId: "00088",
		dateHired: "1-Apr-14",
		section: "Decoration",
		lastName: "Domingo",
		firstName: "Melroshelle",
		middleName: "Araracap",
		address: "Ph 1, Blk 2, Lot 32, Southbrooke Village, Bulacnin, Lipa City, Batangas",
		zipCode: "4217",
		birthday: "16-May-87",
		tin: "274968784",
		civilStatus: "Single",
		dependents: "",
		previousEmployer: "",
		position: "Supervisor",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "melroshelle.domingo@example.com",
		phone: "09170000088",
	},
	{
		employeeId: "00104",
		dateHired: "5-May-14",
		section: "Accounting",
		lastName: "Atienza",
		firstName: "Maria Cristina",
		middleName: "Hidalgo",
		address: "Blk 10 Lot 2 Citta Maria Subdivision Brgy Darasa, Tanauan City, Batangas",
		zipCode: "4232",
		birthday: "25-Dec-76",
		tin: "167473108",
		civilStatus: "Married",
		dependents: "",
		previousEmployer: "V Roque Corporation",
		position: "Manager",
		employmentStatus: "Active",
		dateOfResignation: "",
		remarks: "NPE",
		email: "maria.atienza@example.com",
		phone: "09170000104",
	},
	{
		employeeId: "01364",
		dateHired: "8-Aug-23",
		section: "GA/HR",
		lastName: "Garcia",
		firstName: "Dianne",
		middleName: "Dimaano",
		address: "Brgy. Lodlod, Lipa City",
		zipCode: "4217",
		birthday: "19-Feb-97",
		tin: "712-704-563",
		civilStatus: "Single",
		dependents: "",
		previousEmployer: "Calcomp Precision Phil Inc.",
		position: "Staff",
		employmentStatus: "Inactive",
		dateOfResignation: "4-Jul-25",
		remarks: "NPE",
		email: "dianne.garcia@example.com",
		phone: "09170001364",
	},
	{
		employeeId: "01414",
		dateHired: "1-Mar-24",
		section: "Quality Control /ISO",
		lastName: "Santos",
		firstName: "Jennelene",
		middleName: "Masarap",
		address: "Brgy. 2, Lipa City Batangas",
		zipCode: "4217",
		birthday: "11-Aug-94",
		tin: "340-403-289",
		civilStatus: "Single",
		dependents: "",
		previousEmployer: "Avance Pilipinas Inc.",
		position: "Operator",
		employmentStatus: "Inactive",
		dateOfResignation: "11-Jul-25",
		remarks: "MWE",
		email: "jennelene.santos@example.com",
		phone: "09170001414",
	},
	{
		employeeId: "01623",
		dateHired: "14-May-25",
		section: "Injection and Mold Maintenance",
		lastName: "Macaraig",
		firstName: "Diovelyn",
		middleName: "",
		address: "Brgy. Santiago, Malvar, Batangas",
		zipCode: "4233",
		birthday: "7-Mar-97",
		tin: "342-429-550",
		civilStatus: "Single",
		dependents: "",
		previousEmployer: "Cepol",
		position: "Operator",
		employmentStatus: "Inactive",
		dateOfResignation: "11-Jul-25",
		remarks: "MWE",
		email: "diovelyn.macaraig@example.com",
		phone: "09170001623",
	},
];

const sectionsByDepartmentCode: Record<string, string> = {
	HR: "Human Resources",
	ENG: "Engineering",
	"PROD-ADMIN": "Production/Administration",
	"PROJ-ENG": "Project Engineering",
	"PROD-PLAN": "Production Planning",
	"PROD-ASSUR": "Product Assurance",
	ASM: "Assembly",
	DECOR: "Decoration",
	"PROC-ENG": "Process Engineering",
	"INJ-MOLD": "Injection and Mold Maintenance",
	QC: "Quality Control",
	ACCT: "Accounting",
	"PA-PE-PUR": "Product Assurance/Product Engineering/Purchasing",
	PUR: "Purchasing",
	"PP-PUR": "Production Planning/Purchasing",
	QA: "Quality Assurance",
	"WH-FAC": "Warehouse/Facilities",
	"STRAT-PLAN": "Strategic Planning",
	WH: "Warehouse",
	SALES: "Sales",
	FAC: "Facilities",
	QCU: "Quality & Compliance Unit",
	"GA-HR": "GA/HR",
	"IMP-EXP": "Import/Export",
};

const positionPool: PositionPoolEntry[] = [
	{ section: "Human Resources", position: "HR Manager" },
	{ section: "Engineering", position: "Engineering Manager" },
	{ section: "Engineering", position: "Software Engineer" },
	{ section: "Strategic Planning", position: "President" },
	{ section: "Strategic Planning", position: "General Manager" },
	{ section: "Strategic Planning", position: "Deputy General Manager" },
	{ section: "Project Engineering", position: "Senior Engineer" },
	{ section: "Project Engineering", position: "Engineer" },
	{ section: "Project Engineering", position: "Staff Engineer" },
	{ section: "Project Engineering", position: "Junior Engineer" },
	{ section: "Production/Administration", position: "Senior Manager" },
	{ section: "Production/Administration", position: "Assistant Manager" },
	{ section: "Production/Administration", position: "Manager" },
	{ section: "Production/Administration", position: "Supervisor" },
	{ section: "Production/Administration", position: "Senior Supervisor" },
	{ section: "Production/Administration", position: "Senior Staff" },
	{ section: "Production/Administration", position: "Staff" },
	{ section: "Production/Administration", position: "Junior Supervisor" },
	{ section: "Production/Administration", position: "Specialist" },
	{ section: "Production/Administration", position: "Junior Specialist" },
	{ section: "Production/Administration", position: "Technician" },
	{ section: "Production/Administration", position: "Management Trainee" },
	{ section: "Production/Administration", position: "Factory Manager" },
	{ section: "Assembly", position: "Operator" },
	{ section: "Assembly", position: "Senior Operator" },
	{ section: "Accounting", position: "Manager" },
	{ section: "GA/HR", position: "Staff" },
	{ section: "Decoration", position: "Assistant Manager" },
	{ section: "Decoration", position: "Supervisor" },
	{ section: "Process Engineering", position: "Manager" },
	{ section: "Injection and Mold Maintenance", position: "Senior Supervisor" },
	{ section: "Injection and Mold Maintenance", position: "Operator" },
	{ section: "Product Assurance", position: "Senior Manager" },
	{ section: "Production Planning", position: "Senior Supervisor" },
	{ section: "Sales", position: "Staff" },
	{ section: "Warehouse", position: "Operator" },
	{ section: "Facilities", position: "Technician" },
	{ section: "Import/Export", position: "Staff" },
	{ section: "Purchasing", position: "Specialist" },
	{ section: "Quality Assurance", position: "Junior Specialist" },
	{ section: "Quality Control", position: "Operator" },
];

const firstNames = [
	"Liam",
	"Noah",
	"Ethan",
	"Lucas",
	"Aiden",
	"Mia",
	"Emma",
	"Sophia",
	"Olivia",
	"Ava",
	"Isla",
	"Leah",
	"Nico",
	"Marco",
	"Elena",
	"Hannah",
	"Gabriel",
	"Carla",
	"Rafael",
	"Bianca",
];

const middleNames = [
	"Santos",
	"Reyes",
	"Cruz",
	"Garcia",
	"Lopez",
	"Torres",
	"Flores",
	"Ramos",
	"Diaz",
	"Mendoza",
];

const lastNames = [
	"Navarro",
	"Morales",
	"Villanueva",
	"Pascual",
	"Valdez",
	"Soriano",
	"Dominguez",
	"Mercado",
	"Castillo",
	"Aquino",
	"Cabrera",
	"Fuentes",
	"Rosales",
	"Delos Reyes",
	"Manalo",
	"De Leon",
	"Padilla",
	"Villareal",
	"Samonte",
	"Yambao",
];

const addresses = [
	"Brgy. Banay-Banay, Lipa City, Batangas",
	"Brgy. Tambo, Lipa City, Batangas",
	"Brgy. Marawoy, Lipa City, Batangas",
	"Brgy. Bagbag, Tanauan City, Batangas",
	"Brgy. Poblacion, Malvar, Batangas",
	"Brgy. Tibig, Batangas City, Batangas",
];

const zipCodes = ["4217", "4232", "4233", "4200", "4230", "4219"];
const previousEmployers = [
	"",
	"Yazaki Torres Manufacturing",
	"First Sumiden Circuits",
	"Brother Industries Philippines",
	"Epson Precision Philippines",
	"Nestle Philippines",
];
const remarksPool = ["NPE", "MWE", "NPE | WPE", "Internal transfer"];
const civilStatusPool = ["Single", "Married"];
const dependentPool = ["", "", "1", "2"];

const csvEscape = (value: unknown) => {
	const stringValue = String(value ?? "");
	if (/[",\n]/.test(stringValue)) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}
	return stringValue;
};

const writeCsv = (fileName: string, header: string[], rows: Array<Array<unknown>>) => {
	const content = [header.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
	fs.writeFileSync(path.join(CSV_DIR, fileName), `${content}\n`, "utf-8");
};

const slug = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const pad = (value: number) => String(value).padStart(2, "0");

const makeHireDate = (index: number) => {
	const year = 2015 + (index % 10);
	const month = (index % 12) + 1;
	const day = ((index * 3) % 27) + 1;
	const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${day}-${monthNames[month - 1]}-${String(year).slice(2)}`;
};

const makeBirthDate = (index: number) => {
	const year = 1981 + (index % 18);
	const month = (index % 12) + 1;
	const day = ((index * 5) % 27) + 1;
	const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${day}-${monthNames[month - 1]}-${String(year).slice(2)}`;
};

const makeIsoDate = (year: number, month: number, day: number, hour = 0, minute = 0) =>
	`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00.000Z`;

const toPersonalBirthDate = (value: string) => {
	const [dayRaw, monthRaw, yearRaw] = value.split("-");
	const monthMap: Record<string, string> = {
		Jan: "01",
		Feb: "02",
		Mar: "03",
		Apr: "04",
		May: "05",
		Jun: "06",
		Jul: "07",
		Aug: "08",
		Sep: "09",
		Oct: "10",
		Nov: "11",
		Dec: "12",
	};
	const year = Number(yearRaw) >= 50 ? `19${yearRaw}` : `20${yearRaw}`;
	return `${year}-${monthMap[monthRaw]}-${pad(Number(dayRaw))}`;
};

const buildGeneratedEmployees = (): EmployeeSeed[] => {
	const generated: EmployeeSeed[] = [];
	const startIndex = anchoredEmployees.length;
	for (let index = startIndex; index < TARGET_EMPLOYEE_COUNT; index += 1) {
		const poolEntry = positionPool[index % positionPool.length];
		const firstName = firstNames[index % firstNames.length];
		const lastName = lastNames[index % lastNames.length];
		const middleName = middleNames[index % middleNames.length];
		const numericId = 20000 + index;
		const employeeId = String(numericId).padStart(5, "0");
		const birthDate = makeBirthDate(index);
		const tin = `${800 + (index % 100)}-${400 + (index % 100)}-${100 + (index % 100)}`;
		generated.push({
			employeeId,
			dateHired: makeHireDate(index),
			section: poolEntry.section,
			lastName,
			firstName,
			middleName,
			address: addresses[index % addresses.length],
			zipCode: zipCodes[index % zipCodes.length],
			birthday: birthDate,
			tin,
			civilStatus: civilStatusPool[index % civilStatusPool.length],
			dependents: dependentPool[index % dependentPool.length],
			previousEmployer: previousEmployers[index % previousEmployers.length],
			position: poolEntry.position,
			employmentStatus: index % 9 === 0 ? "Inactive" : "Active",
			dateOfResignation: index % 9 === 0 ? "11-Jul-25" : "",
			remarks: remarksPool[index % remarksPool.length],
			email: `${slug(firstName)}.${slug(lastName)}.${index + 1}@example.com`,
			phone: `0917${String(5000000 + index).padStart(7, "0")}`,
			sss: `10-${String(2000000 + index).padStart(7, "0")}-${(index % 9) + 1}`,
		});
	}
	return generated;
};

const allEmployees = [...anchoredEmployees, ...buildGeneratedEmployees()];

const activeEmployees = allEmployees.filter((employee) => employee.employmentStatus === "Active");
const activeManagerIds = activeEmployees.slice(0, 18).map((employee) => employee.employeeId);

const reportingManagerFor = (index: number) => {
	if (index === 0) return "";
	if (index === 1) return allEmployees[0].employeeId;
	if (index === 2) return allEmployees[1].employeeId;
	const tier = Math.floor(index / 6);
	return activeManagerIds[tier % activeManagerIds.length];
};

const reportingLines = allEmployees
	.map((employee, index) => ({
		employeeId: employee.employeeId,
		reportToEmployeeId: reportingManagerFor(index),
	}))
	.filter((row) => row.reportToEmployeeId);

const departmentManagers = [
	["STRAT-PLAN", "BNEI-001"],
	["PROJ-ENG", "BNEI-002"],
	["PROD-PLAN", "BNEI-003"],
	["PROD-ASSUR", "00050"],
	["ASM", "00062"],
	["DECOR", "00065"],
	["PROC-ENG", "00073"],
	["INJ-MOLD", "00083"],
	["ACCT", "00104"],
	["GA-HR", "01364"],
	["QUALITY-CONTROL-ISO", "01414"],
];

const overrideEmployees = allEmployees.slice(0, 8);
const benefitEmployees = allEmployees.slice(0, 8);
const ledgerEmployees = allEmployees.slice(0, 10);
const requestEmployees = allEmployees.slice(0, 5);

const makePersonJson = (employee: EmployeeSeed) =>
	JSON.stringify({
		firstName: employee.firstName,
		lastName: employee.lastName,
		...(employee.middleName ? { middleName: employee.middleName } : {}),
		birthDate: toPersonalBirthDate(employee.birthday),
	});

const makeContactJson = (employee: EmployeeSeed) =>
	JSON.stringify({
		email: employee.email,
		phone: employee.phone,
	});

const makeIdentificationJson = (employee: EmployeeSeed) =>
	JSON.stringify({
		tin: employee.tin,
		...(employee.sss ? { sss: employee.sss } : {}),
	});

const sourceMetadataJson = JSON.stringify({ source: "sample-pack" });
const scheduleSnapshotJson = JSON.stringify({ shiftTypeCode: "DAY-STD" });
const beforeScheduleJson = JSON.stringify({ templateCode: null });
const afterScheduleJson = JSON.stringify({ templateCode: "STD-5D" });
const nationalIdFieldValuesJson = JSON.stringify({ idType: "National ID" });
const requestAttachmentsJson = JSON.stringify([]);
const workflowStatesJson = JSON.stringify([
	{ key: "OPEN", label: "Open", order: 0, isTerminal: false },
	{ key: "SUBMITTED", label: "Submitted", order: 1, isTerminal: false },
	{ key: "APPROVED", label: "Approved", order: 2, isTerminal: true },
	{ key: "REJECTED", label: "Rejected", order: 3, isTerminal: true },
]);

const workflowStepsJson = JSON.stringify([
	{
		step_number: 1,
		step_name: "Request Submission",
		step_type: "SUBMISSION",
		assignee_type: "REQUESTER",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
	},
	{
		step_number: 2,
		step_name: "Manager Approval",
		step_type: "APPROVAL",
		assignee_type: "SUPERVISOR",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "APPROVED",
		state_on_reject: "REJECTED",
	},
]);

const writeSamplePack = () => {
	writeCsv(
		"sample-employees.csv",
		EMPLOYEE_HEADER,
		allEmployees.map((employee) => [
			employee.employeeId,
			employee.dateHired,
			employee.section,
			employee.lastName,
			employee.firstName,
			employee.middleName,
			employee.address,
			employee.zipCode,
			employee.birthday,
			employee.tin,
			employee.civilStatus,
			employee.dependents,
			employee.previousEmployer,
			employee.position,
			employee.employmentStatus,
			employee.dateOfResignation,
			employee.remarks,
		]),
	);

	writeCsv(
		"sample-persons.csv",
		PERSON_HEADER,
		allEmployees.map((employee, index) => [
			`PERSON-${String(index + 1).padStart(3, "0")}`,
			employee.employeeId,
			makePersonJson(employee),
			makeContactJson(employee),
			makeIdentificationJson(employee),
			sourceMetadataJson,
		]),
	);

	writeCsv(
		"sample-reporting_lines.csv",
		REPORTING_LINE_HEADER,
		reportingLines.map((row) => [row.employeeId, row.reportToEmployeeId]),
	);

	writeCsv("sample-department_managers.csv", DEPARTMENT_MANAGER_HEADER, departmentManagers);

	writeCsv(
		"sample-schedule_overrides.csv",
		SCHEDULE_OVERRIDE_HEADER,
		overrideEmployees.map((employee, index) => [
			employee.employeeId,
			makeIsoDate(2026, 4, 2 + index),
			"DAY-STD",
			`Temporary override for ${employee.employeeId}`,
			reportingManagerFor(index + 1) || "BNEI-001",
		]),
	);

	writeCsv(
		"sample-employee_schedule_histories.csv",
		SCHEDULE_HISTORY_HEADER,
		overrideEmployees.map((employee, index) => [
			employee.employeeId,
			"ASSIGNED_TEMPLATE",
			makeIsoDate(2026, 4, 1 + index),
			reportingManagerFor(index + 1) || "BNEI-001",
			"Assigned standard schedule",
			beforeScheduleJson,
			afterScheduleJson,
			sourceMetadataJson,
		]),
	);

	writeCsv(
		"sample-document_folders.csv",
		DOCUMENT_FOLDER_HEADER,
		overrideEmployees.slice(0, 6).map((employee) => [employee.employeeId, "201 Files"]),
	);

	writeCsv(
		"sample-documents.csv",
		DOCUMENT_HEADER,
		overrideEmployees.slice(0, 6).map((employee, index) => [
			employee.employeeId,
			`Government ID ${index + 1}`,
			"GOVERNMENT_ID",
			`ID-${String(index + 1).padStart(4, "0")}`,
			makeIsoDate(2024, 1, 15 + index),
			makeIsoDate(2034, 1, 15 + index),
			`https://example.com/documents/${employee.employeeId.toLowerCase()}-id.pdf`,
			"pdf",
			"GOV_ID",
			nationalIdFieldValuesJson,
			sourceMetadataJson,
		]),
	);

	writeCsv(
		"sample-leave_balances.csv",
		LEAVE_BALANCE_HEADER,
		overrideEmployees.slice(0, 8).map((employee, index) => [
			employee.employeeId,
			index % 2 === 0 ? "VACATION" : "SICK",
			5 + (index % 4),
			makeIsoDate(2026, 4, 15),
			index % 3,
			sourceMetadataJson,
		]),
	);

	const benefitRows = benefitEmployees.map((employee, index) => {
		const sourceBenefitKey = `BEN-${String(index + 1).padStart(3, "0")}`;
		return {
			sourceBenefitKey,
			row: [
				sourceBenefitKey,
				employee.employeeId,
				"HMO",
				`Primary HMO Plan ${index + 1}`,
				"Sample active employee benefit",
				12000 + index * 500,
				"PHP",
				12,
				1000 + index * 25,
				6000 - index * 100,
				1000 + index * 25,
				makeIsoDate(2026, 1, 1),
				makeIsoDate(2026, 12, 31),
				makeIsoDate(2026, 1, 15),
				makeIsoDate(2026, 12, 15),
				"true",
				makeIsoDate(2026, 1, 1),
				"127.0.0.1",
				"ACTIVE",
				"true",
				"BNEI-001",
				makeIsoDate(2026, 1, 1),
				"Approved sample benefit",
				"Sample remarks",
			],
		};
	});

	writeCsv(
		"sample-employee_benefits.csv",
		EMPLOYEE_BENEFIT_HEADER,
		benefitRows.map((entry) => entry.row),
	);

	writeCsv(
		"sample-employee_benefit_installments.csv",
		BENEFIT_INSTALLMENT_HEADER,
		benefitRows.map((entry, index) => [
			entry.sourceBenefitKey,
			benefitEmployees[index].employeeId,
			"HMO",
			1,
			1000 + index * 25,
			makeIsoDate(2026, 1, 31),
			"",
			"",
			"",
			"SCHEDULED",
			"",
		]),
	);

	writeCsv(
		"sample-employee_loans.csv",
		EMPLOYEE_LOAN_HEADER,
		benefitEmployees.slice(0, 5).map((employee, index) => [
			`LOAN-${String(index + 1).padStart(3, "0")}`,
			employee.employeeId,
			"SALARY_ADVANCE",
			10000 + index * 1000,
			0,
			10000 + index * 1000,
			10,
			1000 + index * 100,
			makeIsoDate(2026, 2, 1),
			makeIsoDate(2026, 11, 1),
			2000 + index * 200,
			8000 + index * 800,
			"APPROVED",
			"BNEI-001",
			makeIsoDate(2026, 2, 1),
			"Sample approved salary advance",
		]),
	);

	writeCsv(
		"sample-attendances.csv",
		ATTENDANCE_HEADER,
		ledgerEmployees.map((employee, index) => [
			employee.employeeId,
			makeIsoDate(2099, 1, 2 + index),
			makeIsoDate(2099, 1, 2 + index, 9, 0),
			makeIsoDate(2099, 1, 2 + index, 12, 0),
			makeIsoDate(2099, 1, 2 + index, 18, 0),
			"PRESENT",
			"Sample attendance row",
			`DEV-${String(index + 1).padStart(3, "0")}`,
			sourceMetadataJson,
			scheduleSnapshotJson,
		]),
	);

	writeCsv(
		"sample-timesheets.csv",
		TIMESHEET_HEADER,
		ledgerEmployees.map((employee, index) => [
			employee.employeeId,
			"PAY-2099-01A",
			`TS-2099-01A-${String(index + 1).padStart(4, "0")}`,
			"APPROVED",
			makeIsoDate(2099, 1, 15, 9, 0),
			employee.employeeId,
			reportingManagerFor(index + 1) || "BNEI-001",
			makeIsoDate(2099, 1, 16, 9, 0),
			"",
			"Sample approved timesheet",
			sourceMetadataJson,
		]),
	);

	writeCsv(
		"sample-timesheet_lines.csv",
		TIMESHEET_LINE_HEADER,
		ledgerEmployees.map((employee, index) => [
			employee.employeeId,
			"PAY-2099-01A",
			`TS-2099-01A-${String(index + 1).padStart(4, "0")}`,
			makeIsoDate(2099, 1, 2 + index),
			1,
			makeIsoDate(2099, 1, 2 + index),
			"PRESENT",
			makeIsoDate(2099, 1, 2 + index, 9, 0),
			makeIsoDate(2099, 1, 2 + index, 12, 0),
			makeIsoDate(2099, 1, 2 + index, 18, 0),
			JSON.stringify(["ON_TIME"]),
			scheduleSnapshotJson,
			"08:00",
			"08:00",
			"00:00",
			"00:00",
			"00:00",
			"00:00",
			60,
			"Sample timesheet line",
			sourceMetadataJson,
		]),
	);

	writeCsv(
		"sample-employee_payrolls.csv",
		PAYROLL_HEADER,
		ledgerEmployees.map((employee, index) => [
			employee.employeeId,
			"PAY-2099-01A",
			`TS-2099-01A-${String(index + 1).padStart(4, "0")}`,
			2000 + index * 50,
			0,
			0,
			0,
			500,
			0,
			200,
			100,
			50,
			50,
			0,
			0,
			0,
			0,
			0,
			2500 + index * 50,
			400,
			2100 + index * 50,
			8,
			0,
			"true",
			makeIsoDate(2099, 1, 20),
			"BANK_TRANSFER",
			`PAYREF-${String(index + 1).padStart(4, "0")}`,
			"Sample payroll history row",
			sourceMetadataJson,
		]),
	);

	const workflowInstances = requestEmployees.map((employee, index) => {
		const workflowSourceKey = `WF-RUN-${String(index + 1).padStart(4, "0")}`;
		const workflowCode = `WF-REQ-2026-${String(index + 1).padStart(4, "0")}`;
		const requestSourceKey = `REQ-SRC-${String(index + 1).padStart(4, "0")}`;
		const requestCode = `REQ-2026-${String(index + 1).padStart(4, "0")}`;
		const managerId = reportingLines.find((row) => row.employeeId === employee.employeeId)?.reportToEmployeeId || "BNEI-001";
		return {
			workflowSourceKey,
			workflowCode,
			requestSourceKey,
			requestCode,
			employeeId: employee.employeeId,
			managerId,
			stepHistory: JSON.stringify([
				{ from: null, to: "OPEN", at: makeIsoDate(2026, 4, 5 + index, 9, 0) },
				{ from: "OPEN", to: "SUBMITTED", at: makeIsoDate(2026, 4, 5 + index, 9, 5) },
			]),
		};
	});

	writeCsv(
		"sample-workflow_instances.csv",
		WORKFLOW_INSTANCE_HEADER,
		workflowInstances.map((instance) => [
			instance.workflowSourceKey,
			"REQUEST",
			"",
			"LEAVE",
			instance.workflowCode,
			"Leave Request Workflow",
			"In-flight workflow instance for sample request",
			workflowStepsJson,
			workflowStatesJson,
			"SUBMITTED",
			instance.stepHistory,
		]),
	);

	writeCsv(
		"sample-requests.csv",
		REQUEST_HEADER,
		workflowInstances.map((instance, index) => [
			instance.requestSourceKey,
			instance.requestCode,
			index % 2 === 0 ? "LEAVE" : "OTHER",
			"SUBMITTED",
			makeIsoDate(2026, 4, 10 + index),
			makeIsoDate(2026, 4, 10 + index),
			index % 2 === 0 ? "Vacation leave for one day" : "Overtime request for production support",
			requestAttachmentsJson,
			instance.employeeId,
			"",
			instance.workflowCode,
			2,
			1,
			"Sample in-flight request",
			JSON.stringify({
				source: "sample-pack",
				...(index % 2 === 0
					? { leaveType: "VACATION", totalDays: 1 }
					: { subType: "OVERTIME", hours: 2 }),
			}),
		]),
	);

	writeCsv(
		"sample-workflow_step_executions.csv",
		WORKFLOW_STEP_HEADER,
		workflowInstances.flatMap((instance, index) => [
			[
				instance.workflowCode,
				instance.workflowSourceKey,
				instance.requestCode,
				instance.requestSourceKey,
				1,
				"Request Submission",
				"SUBMISSION",
				"REQUESTER",
				"Requester",
				instance.employeeId,
				"COMPLETED",
				makeIsoDate(2026, 4, 5 + index, 9, 0),
				"Submitted by employee",
				sourceMetadataJson,
				"true",
			],
			[
				instance.workflowCode,
				instance.workflowSourceKey,
				instance.requestCode,
				instance.requestSourceKey,
				2,
				"Manager Approval",
				"APPROVAL",
				"SUPERVISOR",
				"Manager",
				instance.managerId,
				"PENDING",
				"",
				"Awaiting manager review",
				sourceMetadataJson,
				"true",
			],
		]),
	);

	writeCsv(
		"sample-request_transactions.csv",
		REQUEST_TRANSACTION_HEADER,
		workflowInstances.flatMap((instance, index) => {
			const displayName = `${requestEmployees[index].firstName} ${requestEmployees[index].lastName}`;
			return [
				[
					instance.requestCode,
					instance.requestSourceKey,
					instance.workflowCode,
					1,
					instance.employeeId,
					1,
					"LIFECYCLE",
					"REQUEST_CREATED",
					"migration-sample",
					"EMPLOYEE",
					"Requester",
					displayName,
					"Request created",
					"Request created from sample pack",
					"",
					"OPEN",
					"SUBMITTED",
					"",
					sourceMetadataJson,
					"SHARED",
					"false",
					makeIsoDate(2026, 4, 5 + index, 9, 0),
				],
				[
					instance.requestCode,
					instance.requestSourceKey,
					instance.workflowCode,
					2,
					"",
					2,
					"WORKFLOW",
					"STEP_ASSIGNED",
					"migration-sample",
					"SYSTEM",
					"",
					"System",
					"Manager approval assigned",
					"Manager approval step is pending",
					"",
					"SUBMITTED",
					"SUBMITTED",
					"",
					sourceMetadataJson,
					"SHARED",
					"true",
					makeIsoDate(2026, 4, 5 + index, 9, 5),
				],
			];
		}),
	);
};

writeSamplePack();
console.log(`Generated enterprise sample pack with ${allEmployees.length} employees in ${CSV_DIR}`);
