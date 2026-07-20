import { describe, expect, it } from "vitest";
import {
	ALL_LEVELS_LABEL,
	buildRecruitmentCoverageRows,
	UNASSIGNED_SECTION_LABEL,
} from "./workforce-recruitment-coverage";
import type { WorkforceRecruitmentSettings } from "~/services/workforce-recruitment-settings.service";

const baseSettings = (
	policies: WorkforceRecruitmentSettings["policies"] = [],
): WorkforceRecruitmentSettings => ({
	isEnabled: true,
	enforceDepartmentManagerScope: true,
	defaultWorkflowCode: "JOB-REQ",
	requestSubtype: "DEPARTMENT_JOB_REQUISITION",
	autoCreateJobOnApproval: true,
	policies,
});

const manufacturingDepartment = { id: "department-manufacturing", name: "Manufacturing" };
const assemblySection = {
	id: "section-assembly",
	name: "Assembly",
	departmentId: "department-manufacturing",
	department: manufacturingDepartment,
};

describe("buildRecruitmentCoverageRows", () => {
	it("groups an employee missing section data under the section from its position", () => {
		const rows = buildRecruitmentCoverageRows({
			settings: baseSettings(),
			departments: [manufacturingDepartment],
			positions: [
				{
					id: "position-operator",
					title: "Production Operator",
					sectionId: "section-assembly",
					section: assemblySection,
					levels: [],
				},
			],
			employees: [
				{
					id: "employee-1",
					departmentId: "department-manufacturing",
					positionId: "position-operator",
					levelId: "level-junior",
					level: { id: "level-junior", name: "Junior" },
				},
			] as any[],
		});

		const employeeLevelRow = rows.find((row) => row.levelId === "level-junior");
		expect(employeeLevelRow).toMatchObject({
			departmentId: "department-manufacturing",
			departmentName: "Manufacturing",
			sectionId: "section-assembly",
			sectionName: "Assembly",
			positionTitle: "Production Operator",
			levelName: "Junior",
		});
	});

	it("keeps positions without an assigned section visible under Unassigned section", () => {
		const rows = buildRecruitmentCoverageRows({
			settings: baseSettings(),
			departments: [manufacturingDepartment],
			positions: [
				{
					id: "position-floating",
					title: "Floating Technician",
					levels: [{ id: "level-mid", name: "Mid", rank: 2 }],
				},
			],
			employees: [],
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			positionTitle: "Floating Technician",
			sectionId: null,
			sectionName: UNASSIGNED_SECTION_LABEL,
			levelName: "Mid",
		});
	});

	it("hydrates relation-only position levels from the global level catalog", () => {
		const rows = buildRecruitmentCoverageRows({
			settings: baseSettings(),
			departments: [manufacturingDepartment],
			positions: [
				{
					id: "position-operator",
					title: "Production Operator",
					sectionId: "section-assembly",
					section: assemblySection,
					levels: [{ id: "position-level-relation-1", levelId: "level-junior" }],
				},
			],
			employees: [],
			levels: [{ id: "level-junior", name: "Junior", rank: 1 }],
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			positionId: "position-operator",
			levelId: "level-junior",
			levelName: "Junior",
		});
		expect(rows[0].levelId).not.toBe("position-level-relation-1");
	});

	it("creates one admin coverage row for every linked hydrated position level", () => {
		const rows = buildRecruitmentCoverageRows({
			settings: baseSettings(),
			departments: [manufacturingDepartment],
			positions: [
				{
					id: "position-operator",
					title: "Production Operator",
					sectionId: "section-assembly",
					section: assemblySection,
					levels: [
						{ id: "relation-3", levelId: "level-senior" },
						{ id: "relation-1", levelId: "level-junior" },
						{ id: "relation-4", levelId: "level-lead" },
						{ id: "relation-2", levelId: "level-mid" },
					],
				},
			],
			employees: [],
			levels: [
				{ id: "level-junior", name: "Junior", rank: 1 },
				{ id: "level-mid", name: "Mid", rank: 2 },
				{ id: "level-senior", name: "Senior", rank: 3 },
				{ id: "level-lead", name: "Lead", rank: 4 },
			],
		});

		expect(rows).toHaveLength(4);
		expect(rows.map((row) => row.levelId)).toEqual([
			"level-junior",
			"level-mid",
			"level-senior",
			"level-lead",
		]);
		expect(rows.map((row) => row.levelName)).toEqual([
			"Junior",
			"Mid",
			"Senior",
			"Lead",
		]);
	});

	it("creates coverage rows for every position from the position catalog", () => {
		const rows = buildRecruitmentCoverageRows({
			settings: baseSettings(),
			departments: [manufacturingDepartment],
			positions: [
				{
					id: "position-operator",
					title: "Production Operator",
					sectionId: "section-assembly",
					section: assemblySection,
					levels: [{ id: "level-junior", name: "Junior", rank: 1 }],
				},
				{
					id: "position-supervisor",
					title: "Line Supervisor",
					sectionId: "section-assembly",
					section: assemblySection,
					levels: [],
				},
			],
			employees: [],
		});

		expect(rows.map((row) => `${row.positionTitle}:${row.levelName}`)).toEqual([
			"Production Operator:Junior",
			`Line Supervisor:${ALL_LEVELS_LABEL}`,
		]);
	});

	it("attaches legacy policies without section data to the matching position and level row", () => {
		const rows = buildRecruitmentCoverageRows({
			settings: baseSettings([
				{
					id: "policy-legacy",
					departmentId: "department-manufacturing",
					sectionId: null,
					positionId: "position-operator",
					levelId: "level-junior",
					targetHeadcount: 7,
					limitBehavior: "WARN",
					autoCreateJobOnApproval: true,
					isActive: true,
				},
			]),
			departments: [manufacturingDepartment],
			positions: [
				{
					id: "position-operator",
					title: "Production Operator",
					sectionId: "section-assembly",
					section: assemblySection,
					levels: [{ id: "position-level-relation-1", levelId: "level-junior" }],
				},
			],
			employees: [],
			levels: [{ id: "level-junior", name: "Junior", rank: 1 }],
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: "policy-legacy",
			isPersisted: true,
			sectionId: "section-assembly",
			sectionName: "Assembly",
			positionId: "position-operator",
			levelId: "level-junior",
			targetHeadcount: 7,
			limitBehavior: "WARN",
		});
	});
});
