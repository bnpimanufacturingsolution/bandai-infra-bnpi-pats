require("dotenv").config();

const path = require("path");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("../generated/prisma");

const prisma = new PrismaClient();

const repoRoot = path.resolve(__dirname, "..", "..");
const masterlistPath = path.join(repoRoot, "docs", "BNPI_MASTERLIST.xlsx");
const sourceSheet = "Manpower Databank";
const orgCode = "bnei";

const normalizeText = (value) =>
	String(value ?? "")
		.normalize("NFKC")
		.replace(/\u3000/g, " ")
		.replace(/\s+/g, " ")
		.trim();

const normalizeKey = (value) => normalizeText(value).toLowerCase();

const normalizeBandaiEmail = (value) => {
	const email = normalizeText(value).toLowerCase();
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "";
	if (email.endsWith("@bandai.com.ph") || email.endsWith("@bandai.com")) return email;
	return "";
};

const normalizeEmployeeId = (value) => {
	const text = normalizeText(value);
	if (!text) return "";
	const numeric = text.replace(/\.0$/, "");
	return /^\d+$/.test(numeric) ? numeric.padStart(5, "0") : numeric;
};

const getCellText = (row, headerMap, headerName) => {
	const index = headerMap.get(normalizeKey(headerName));
	if (!index) return "";
	return normalizeText(row.getCell(index).value?.text ?? row.getCell(index).value);
};

const readOfficialEmails = async () => {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(masterlistPath);
	const sheet = workbook.getWorksheet(sourceSheet);
	if (!sheet) throw new Error(`Worksheet "${sourceSheet}" was not found in ${masterlistPath}`);

	const headerRow = sheet.getRow(3);
	const headerMap = new Map();
	headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
		headerMap.set(normalizeKey(cell.value?.text ?? cell.value), colNumber);
	});

	const employeeNoIndex = headerMap.get("no.");
	const officialEmailIndex = headerMap.get("official email address");
	if (!employeeNoIndex || !officialEmailIndex) {
		throw new Error("Required Manpower Databank headers No. / Official Email Address were not found.");
	}

	const byEmployeeId = new Map();
	const exceptions = [];
	let blankEmployeeIdRun = 0;
	for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber++) {
		const row = sheet.getRow(rowNumber);
		const employeeId = normalizeEmployeeId(row.getCell(employeeNoIndex).text || row.getCell(employeeNoIndex).value);
		if (!employeeId) {
			blankEmployeeIdRun += 1;
			if (blankEmployeeIdRun > 200) break;
			continue;
		}
		blankEmployeeIdRun = 0;
		if (/^grand total$/i.test(employeeId)) continue;

		const status = getCellText(row, headerMap, "Status");
		if (status && normalizeKey(status) !== "active") continue;

		const rawOfficialEmail = row.getCell(officialEmailIndex).value?.text ?? row.getCell(officialEmailIndex).value;
		const email = normalizeBandaiEmail(rawOfficialEmail);
		if (normalizeText(rawOfficialEmail) && !email) {
			exceptions.push({
				sourceRow: rowNumber,
				employeeId,
				reason: `Official Email Address "${normalizeText(rawOfficialEmail)}" is not a verified Bandai email.`,
			});
		}
		byEmployeeId.set(employeeId, {
			sourceRow: rowNumber,
			email,
			rawOfficialEmail: normalizeText(rawOfficialEmail),
		});
	}

	return { byEmployeeId, exceptions };
};

const main = async () => {
	const dryRun = process.argv.includes("--dry-run");
	const organization = await prisma.organization.findFirst({
		where: { OR: [{ code: orgCode }, { id: orgCode }] },
		select: { id: true, code: true, name: true },
	});
	if (!organization) throw new Error(`Organization "${orgCode}" was not found.`);

	const source = await readOfficialEmails();
	const employees = await prisma.employee.findMany({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			employmentStatus: "ACTIVE",
			workforceSource: "DIRECT",
		},
		select: {
			id: true,
			employeeId: true,
			basicSalary: true,
			userId: true,
			person: { select: { id: true, userId: true, contactInfo: true } },
		},
		orderBy: { employeeId: "asc" },
	});

	const linkedUserIds = Array.from(
		new Set(employees.flatMap((employee) => [employee.userId, employee.person?.userId]).filter(Boolean)),
	);
	const users = linkedUserIds.length
		? await prisma.user.findMany({
				where: { id: { in: linkedUserIds } },
				select: { id: true, email: true, userName: true },
			})
		: [];
	const userById = new Map(users.map((user) => [user.id, user]));

	const report = {
		dryRun,
		organization: organization.code || organization.id,
		sourceWorkbook: "docs/BNPI_MASTERLIST.xlsx",
		sourceSheet,
		activeDirectEmployees: employees.length,
		sourceRows: source.byEmployeeId.size,
		sourceEmailsPresent: 0,
		personEmailsUpdated: 0,
		personEmailsCleared: 0,
		userEmailsUpdated: 0,
		basicSalaryPositive: 0,
		missingSourceEmployees: [],
		sourceEmployeesMissingInDb: [],
		missingBasicSalary: [],
		unverifiedLinkedUsers: [],
		sourceEmailExceptions: source.exceptions,
	};
	const seenEmployeeIds = new Set();

	for (const employee of employees) {
		seenEmployeeIds.add(employee.employeeId);
		const sourceRow = source.byEmployeeId.get(employee.employeeId);
		if (!sourceRow) {
			report.missingSourceEmployees.push({
				employeeId: employee.employeeId,
				reason: "Active/direct employee not found in Manpower Databank active source rows.",
			});
			continue;
		}

		if (employee.basicSalary > 0) report.basicSalaryPositive += 1;
		else {
			report.missingBasicSalary.push({
				employeeId: employee.employeeId,
				sourceRow: sourceRow.sourceRow,
				reason: "Employee.basicSalary is not positive after Sheet2 Basic Salary backfill.",
			});
		}
		if (sourceRow.email) report.sourceEmailsPresent += 1;

		const currentContactInfo =
			employee.person?.contactInfo && typeof employee.person.contactInfo === "object"
				? employee.person.contactInfo
				: {};
		const currentPersonEmail = normalizeText(currentContactInfo.email).toLowerCase();
		const nextPersonEmail = sourceRow.email;
		const personNeedsUpdate = currentPersonEmail !== nextPersonEmail;

		if (personNeedsUpdate && employee.person?.id) {
			if (!dryRun) {
				await prisma.person.update({
					where: { id: employee.person.id },
					data: {
						contactInfo: {
							...currentContactInfo,
							email: nextPersonEmail,
						},
					},
				});
			}
			if (nextPersonEmail) report.personEmailsUpdated += 1;
			else report.personEmailsCleared += 1;
		}

		const userId = employee.userId || employee.person?.userId || "";
		const linkedUser = userId ? userById.get(userId) : null;
		if (linkedUser && sourceRow.email && linkedUser.email.toLowerCase() !== sourceRow.email) {
			if (!dryRun) {
				await prisma.user.update({
					where: { id: linkedUser.id },
					data: { email: sourceRow.email },
				});
			}
			report.userEmailsUpdated += 1;
		} else if (linkedUser && !sourceRow.email) {
			report.unverifiedLinkedUsers.push({
				employeeId: employee.employeeId,
				sourceRow: sourceRow.sourceRow,
				userId: linkedUser.id,
				userEmail: linkedUser.email,
				reason: "Source Official Email Address is blank/unverified; User.email is required, so linked credential was not overwritten.",
			});
		}
	}

	for (const [employeeId, sourceRow] of source.byEmployeeId.entries()) {
		if (!seenEmployeeIds.has(employeeId)) {
			report.sourceEmployeesMissingInDb.push({
				employeeId,
				sourceRow: sourceRow.sourceRow,
				reason: "Active Manpower Databank source row is not an active/direct Employee in the database.",
			});
		}
	}

	console.log(JSON.stringify(report, null, 2));
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
