import { expect } from "chai";
import type { PrismaClient } from "../generated/prisma";
import { getEmployeeDocumentPriorityData } from "../helper/employee-document-priority.helper";

describe("employee-document-priority.helper", () => {
	const organizationId = "org-1";
	const employeeId = "emp-1";

	const buildPrisma = (params?: {
		documentTypes?: any[];
		documents?: any[];
		employeeContext?: Record<string, unknown> | null;
	}) =>
		({
			documentType: {
				findMany: async () => params?.documentTypes || [],
			},
			document: {
				findMany: async () => params?.documents || [],
			},
			employee: {
				findUnique: async () => params?.employeeContext || {},
			},
		}) as unknown as PrismaClient;

	it("emits optional actionable items for missing employee-uploadable optional documents", async () => {
		const prisma = buildPrisma({
			documentTypes: [
				{
					id: "doc-optional",
					code: "medical_certificate",
					name: "Medical Certificate",
					uploadBy: "EMPLOYEE",
					isRequired: false,
					isEmployeeVisible: true,
					displayOrder: 1,
					fields: [],
					metadata: null,
				},
			],
		});

		const result = await getEmployeeDocumentPriorityData({
			prisma,
			employeeId,
			organizationId,
		});

		expect(result.items).to.have.length(1);
		expect(result.items[0]).to.include({
			documentTypeId: "doc-optional",
			type: "medical_certificate",
			priorityState: "optional",
			actionLabel: "Upload",
			actionDescription: "Add this when applicable",
			isActionable: true,
			isVirtual: true,
			isMandated: false,
		});
		expect(result.summary).to.deep.equal({
			totalActionable: 1,
			missingRequired: 0,
			rejected: 0,
			expired: 0,
			needsUpdate: 0,
			ready: 0,
			optional: 1,
		});
		expect(result.categories).to.have.length(1);
	});

	it("uses custom required field values to keep incomplete optional documents in warning state", async () => {
		const prisma = buildPrisma({
			documentTypes: [
				{
					id: "doc-optional",
					code: "medical_certificate",
					name: "Medical Certificate",
					uploadBy: "EMPLOYEE",
					isRequired: false,
					isEmployeeVisible: true,
					displayOrder: 1,
					fields: [
						{
							key: "licenseNumber",
							type: "text",
							required: true,
						},
					],
					metadata: null,
				},
			],
			documents: [
				{
					id: "employee-doc-1",
					documentTypeId: "doc-optional",
					type: "medical_certificate",
					name: "Medical Certificate",
					number: "MC-001",
					issueDate: null,
					expiryDate: null,
					fileUrl: "https://example.com/medical.pdf",
					ext: "pdf",
					fieldValues: {},
				},
			],
		});

		const result = await getEmployeeDocumentPriorityData({
			prisma,
			employeeId,
			organizationId,
		});

		expect(result.items).to.have.length(1);
		expect(result.items[0]).to.include({
			key: "employee-doc-1",
			priorityState: "optional",
			actionLabel: "Fill up",
			actionDescription: "Add this when applicable",
			isActionable: true,
			isVirtual: false,
			isMandated: false,
		});
		expect(result.summary.optional).to.equal(1);
		expect(result.summary.rejected).to.equal(0);
		expect(result.summary.expired).to.equal(0);
	});

	it("keeps complete optional documents in ready state", async () => {
		const prisma = buildPrisma({
			documentTypes: [
				{
					id: "doc-optional",
					code: "medical_certificate",
					name: "Medical Certificate",
					uploadBy: "EMPLOYEE",
					isRequired: false,
					isEmployeeVisible: true,
					displayOrder: 1,
					fields: [
						{
							key: "licenseNumber",
							type: "text",
							required: true,
						},
					],
					metadata: null,
				},
			],
			documents: [
				{
					id: "employee-doc-1",
					documentTypeId: "doc-optional",
					type: "medical_certificate",
					name: "Medical Certificate",
					number: "MC-001",
					issueDate: null,
					expiryDate: null,
					fileUrl: "https://example.com/medical.pdf",
					ext: "pdf",
					fieldValues: {
						licenseNumber: "MED-42",
					},
				},
			],
		});

		const result = await getEmployeeDocumentPriorityData({
			prisma,
			employeeId,
			organizationId,
		});

		expect(result.items).to.have.length(1);
		expect(result.items[0]).to.include({
			key: "employee-doc-1",
			priorityState: "ready",
			isActionable: false,
			isVirtual: false,
			isMandated: false,
		});
		expect(result.summary).to.deep.equal({
			totalActionable: 0,
			missingRequired: 0,
			rejected: 0,
			expired: 0,
			needsUpdate: 0,
			ready: 1,
			optional: 0,
		});
	});

	it("matches Philippine compliance document aliases before emitting missing actions", async () => {
		const prisma = buildPrisma({
			documentTypes: [
				{
					id: "doc-philhealth",
					code: "PHILHEALTH",
					name: "PhilHealth",
					category: "COMPLIANCE",
					uploadBy: "EMPLOYEE",
					isRequired: true,
					isEmployeeVisible: true,
					displayOrder: 1,
					fields: [],
					metadata: null,
				},
				{
					id: "doc-pagibig",
					code: "PAG_IBIG_FUND",
					name: "Pag-IBIG Fund",
					category: "COMPLIANCE",
					uploadBy: "EMPLOYEE",
					isRequired: true,
					isEmployeeVisible: true,
					displayOrder: 2,
					fields: [],
					metadata: null,
				},
				{
					id: "doc-valid-id",
					code: "GOVERNMENT_ID",
					name: "Valid ID",
					category: "COMPLIANCE",
					uploadBy: "EMPLOYEE",
					isRequired: true,
					isEmployeeVisible: true,
					displayOrder: 3,
					fields: [],
					metadata: null,
				},
			],
			documents: [
				{
					id: "employee-doc-philhealth",
					documentTypeId: null,
					type: "philhealth_id",
					name: "Philhealth Id",
					number: "PH-001",
					issueDate: new Date("2026-01-01T00:00:00.000Z"),
					expiryDate: null,
					fileUrl: "https://example.com/philhealth.pdf",
					ext: "pdf",
					fieldValues: {},
				},
				{
					id: "employee-doc-pagibig",
					documentTypeId: null,
					type: "pagibig_id",
					name: "Pagibig Id",
					number: "HDMF-001",
					issueDate: new Date("2026-01-01T00:00:00.000Z"),
					expiryDate: null,
					fileUrl: "https://example.com/pagibig.pdf",
					ext: "pdf",
					fieldValues: {},
				},
				{
					id: "employee-doc-valid-id",
					documentTypeId: null,
					type: "valid_id",
					name: "Valid Id",
					number: "ID-001",
					issueDate: new Date("2026-01-01T00:00:00.000Z"),
					expiryDate: null,
					fileUrl: "https://example.com/valid-id.pdf",
					ext: "pdf",
					fieldValues: {},
				},
			],
		});

		const result = await getEmployeeDocumentPriorityData({
			prisma,
			employeeId,
			organizationId,
		});

		expect(result.items).to.have.length(3);
		expect(result.items.every((item) => !item.isVirtual)).to.equal(true);
		expect(result.summary.missingRequired).to.equal(0);
		expect(result.summary.totalActionable).to.equal(0);
	});

	it("marks rejected and expired documents as actionable follow-ups", async () => {
		const prisma = buildPrisma({
			documentTypes: [
				{
					id: "doc-required",
					code: "tin_id",
					name: "TIN ID",
					category: "COMPLIANCE",
					uploadBy: "EMPLOYEE",
					isRequired: true,
					isEmployeeVisible: true,
					displayOrder: 1,
					fields: [],
					metadata: null,
				},
				{
					id: "doc-expired",
					code: "passport",
					name: "Passport",
					category: "COMPLIANCE",
					uploadBy: "EMPLOYEE",
					isRequired: true,
					isEmployeeVisible: true,
					displayOrder: 2,
					fields: [],
					metadata: null,
				},
			],
			documents: [
				{
					id: "employee-doc-rejected",
					documentTypeId: "doc-required",
					type: "tin_id",
					name: "TIN ID",
					number: "TIN-001",
					issueDate: new Date("2026-01-01T00:00:00.000Z"),
					expiryDate: null,
					fileUrl: "https://example.com/tin.pdf",
					ext: "pdf",
					fieldValues: {},
					metadata: {
						reviewStatus: "REJECTED",
					},
				},
				{
					id: "employee-doc-expired",
					documentTypeId: "doc-expired",
					type: "passport",
					name: "Passport",
					number: "PASS-001",
					issueDate: new Date("2020-01-01T00:00:00.000Z"),
					expiryDate: new Date("2021-01-01T00:00:00.000Z"),
					fileUrl: "https://example.com/passport.pdf",
					ext: "pdf",
					fieldValues: {},
					metadata: {},
				},
			],
		});

		const result = await getEmployeeDocumentPriorityData({
			prisma,
			employeeId,
			organizationId,
		});

		expect(result.items.map((item) => item.priorityState)).to.include.members([
			"rejected",
			"expired",
		]);
		expect(result.summary.rejected).to.equal(1);
		expect(result.summary.expired).to.equal(1);
	});
});
