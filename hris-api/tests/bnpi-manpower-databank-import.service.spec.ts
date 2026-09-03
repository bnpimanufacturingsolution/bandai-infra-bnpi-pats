import { expect } from "chai";
import * as XLSX from "xlsx";
import {
	getManpowerDatabankJobProgress,
	importManpowerDatabankUpload,
	startManpowerDatabankImport,
} from "../app/migration/bnpi-manpower-databank-import.service";

function buildDatabankBuffer(): Buffer {
	const rows = [
		["BNPI-F-GHS-008-1"],
		[
			"ID No.",
			"Company",
			"Employment Status",
			"Date Hired",
			"Nationality",
			"Employee Name",
			"Department",
			"Section",
			"Position",
			"Status",
			"Gender",
		],
		[
			"1466",
			"BNPI",
			"Direct Hired",
			"2020-01-15",
			"Filipino",
			"Leyesa, Ma. Angelica N.",
			"Administration",
			"HR",
			"HR Associate",
			"Active",
			"F",
		],
		[
			"9999",
			"BNPI",
			"Direct Hired",
			"2024-06-01",
			"Filipino",
			"New, Hire T.",
			"Administration",
			"HR",
			"HR Associate",
			"Active",
			"M",
		],
	];
	const sheet = XLSX.utils.aoa_to_sheet(rows);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, sheet, "07-24");
	XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["old"]]), "07-01");
	return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("BNPI manpower databank import service", () => {
	it("updates existing employees without clearing basicSalary and creates missing IDs", async () => {
		const existingPerson = {
			id: "person-1",
			personalInfo: {
				firstName: "Angelica",
				lastName: "Leyesa",
				gender: "female",
			},
			contactInfo: {
				email: "angelica@bandai.com.ph",
				phones: [],
				address: [],
			},
		};
		const existingEmployee = {
			id: "emp-db-1",
			employeeId: "01466",
			personId: "person-1",
			person: existingPerson,
			basicSalary: 9500,
			metadata: { keep: true },
			departmentId: "dept-1",
			positionId: "pos-1",
			sectionId: "sec-1",
		};

		const personUpdates: any[] = [];
		const employeeUpdates: any[] = [];
		const employeeCreates: any[] = [];
		const personCreates: any[] = [];

		const prisma: any = {
			department: {
				findMany: async () => [
					{ id: "dept-1", code: "ADM", name: "Administration", isHr: true, scheduleTemplates: [] },
				],
			},
			section: {
				findMany: async () => [
					{
						id: "sec-1",
						name: "HR",
						code: "HR",
						isHr: true,
						departmentId: "dept-1",
						department: { id: "dept-1", name: "Administration", code: "ADM" },
					},
				],
			},
			position: {
				findMany: async () => [{ id: "pos-1", title: "HR Associate" }],
			},
			level: { findMany: async () => [] },
			employee: {
				findMany: async () => [{ id: "emp-db-1", employeeId: "01466" }],
				findUnique: async ({ where }: any) => {
					if (where?.organizationId_employeeId?.employeeId === "01466") {
						return existingEmployee;
					}
					return null;
				},
				update: async ({ where, data }: any) => {
					employeeUpdates.push({ where, data });
					return { id: where.id, ...data };
				},
				create: async ({ data }: any) => {
					employeeCreates.push(data);
					return { id: "emp-db-new", ...data };
				},
			},
			scheduleTemplate: { findMany: async () => [] },
			agency: { findMany: async () => [] },
			person: {
				update: async ({ where, data }: any) => {
					personUpdates.push({ where, data });
					return { id: where.id, ...data };
				},
				create: async ({ data }: any) => {
					personCreates.push(data);
					return { id: "person-new", ...data };
				},
			},
		};

		const summary = await importManpowerDatabankUpload({
			prisma,
			organizationId: "org-1",
			buffer: buildDatabankBuffer(),
			sourceFileName: "July Manpower Databank.xlsx",
		});

		expect(summary.sheetName).to.equal("07-24");
		expect(summary.sheetSelectionReason).to.equal("latest_day_sheet");
		expect(summary.updated).to.equal(1);
		expect(summary.created).to.equal(1);
		expect(summary.failed).to.equal(0);

		expect(employeeUpdates).to.have.length(1);
		expect(employeeUpdates[0].data.basicSalary).to.equal(undefined);
		expect(employeeUpdates[0].data.departmentId).to.equal("dept-1");
		expect(employeeUpdates[0].data.positionId).to.equal("pos-1");

		expect(personUpdates[0].data.contactInfo.email).to.equal("angelica@bandai.com.ph");

		expect(employeeCreates).to.have.length(1);
		expect(employeeCreates[0].employeeId).to.equal("09999");
		expect(employeeCreates[0].basicSalary).to.equal(0);
		expect(personCreates[0].contactInfo.email).to.equal(null);
	});

	it("starts an async job and reports live progress until completed", async () => {
		const prisma: any = {
			department: {
				findMany: async () => [
					{ id: "dept-1", code: "ADM", name: "Administration", isHr: true, scheduleTemplates: [] },
				],
			},
			section: {
				findMany: async () => [
					{
						id: "sec-1",
						name: "HR",
						code: "HR",
						isHr: true,
						departmentId: "dept-1",
						department: { id: "dept-1", name: "Administration", code: "ADM" },
					},
				],
			},
			position: {
				findMany: async () => [{ id: "pos-1", title: "HR Associate" }],
			},
			level: { findMany: async () => [] },
			employee: {
				findMany: async () => [],
				findUnique: async () => null,
				update: async () => ({}),
				create: async ({ data }: any) => ({ id: `emp-${data.employeeId}`, ...data }),
			},
			scheduleTemplate: { findMany: async () => [] },
			agency: { findMany: async () => [] },
			person: {
				update: async ({ data }: any) => data,
				create: async ({ data }: any) => ({ id: "person-async", ...data }),
			},
		};

		const { jobId } = startManpowerDatabankImport({
			prisma,
			organizationId: "org-1",
			buffer: buildDatabankBuffer(),
			sourceFileName: "July Manpower Databank.xlsx",
		});
		expect(jobId).to.be.a("string").and.not.empty;

		let terminal: ReturnType<typeof getManpowerDatabankJobProgress> = null;
		for (let i = 0; i < 100; i++) {
			const progress = getManpowerDatabankJobProgress(jobId);
			expect(progress).to.not.equal(null);
			if (progress?.status === "completed" || progress?.status === "failed") {
				terminal = progress;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 20));
		}

		expect(terminal?.status).to.equal("completed");
		expect(terminal?.sheetName).to.equal("07-24");
		expect(terminal?.created).to.equal(2);
		expect(terminal?.processed).to.equal(2);
		expect((terminal?.recentLog || []).length).to.be.greaterThan(0);
	});
});
