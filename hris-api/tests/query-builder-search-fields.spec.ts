import { expect } from "chai";
import {
	buildSearchConditions,
	normalizeAndValidateFieldSelection,
} from "../helper/query-builder.helper";

describe("query-builder search field validation", () => {
	it("accepts backend-aligned position search fields", () => {
		const conditions = buildSearchConditions("Position", "eng", [
			"title",
			"code",
			"description",
		]);

		expect(conditions).to.have.length(3);
	});

	it("accepts backend-aligned calendar item search fields", () => {
		const conditions = buildSearchConditions("CalendarItem", "holiday", [
			"title",
			"description",
			"type",
			"status",
		]);

		expect(conditions).to.deep.equal([
			{ title: { contains: "holiday", mode: "insensitive" } },
			{ description: { contains: "holiday", mode: "insensitive" } },
			{ type: "HOLIDAY" },
		]);
	});

	it("skips enum search fields when the query does not match enum values", () => {
		const conditions = buildSearchConditions("CalendarItem", "adh", [
			"title",
			"description",
			"type",
			"status",
		]);

		expect(conditions).to.deep.equal([
			{ title: { contains: "adh", mode: "insensitive" } },
			{ description: { contains: "adh", mode: "insensitive" } },
		]);
	});

	it("accepts timesheet employee name search through JSON personalInfo", () => {
		const conditions = buildSearchConditions("Timesheet", "Michelle", [
			"code",
			"notes",
			"employee.employeeId",
			"employee.person.personalInfo.firstName",
			"employee.person.personalInfo.lastName",
			"payrollPeriod.name",
			"payrollPeriod.code",
		]);

		expect(conditions).to.deep.include({
			employee: {
				person: {
					personalInfo: {
						path: ["firstName"],
						string_contains: "Michelle",
						mode: "insensitive",
					},
				},
			},
		});
		expect(conditions).to.deep.include({
			employee: {
				person: {
					personalInfo: {
						path: ["lastName"],
						string_contains: "Michelle",
						mode: "insensitive",
					},
				},
			},
		});
	});

	it("rejects list fields for calendar item search", () => {
		expect(() => buildSearchConditions("CalendarItem", "holiday", ["tags"])).to.throw(
			'Invalid fields found for model "CalendarItem": tags',
		);
	});

	it("rejects unknown position search fields", () => {
		expect(() => buildSearchConditions("Position", "eng", ["name"])).to.throw(
			'Invalid fields found for model "Position": name',
		);
	});

	it("accepts Employee activeSchedule as a derived field alias", () => {
		const result = normalizeAndValidateFieldSelection(
			"Employee",
			"id,activeSchedule",
			{ activeSchedule: "embeddedSchedule" },
			{ derivedRoots: ["activeSchedule"] },
		);

		expect(result.errors).to.deep.equal([]);
		expect(result.normalizedFields).to.equal("id,embeddedSchedule");
	});

	it("rejects nested selection under Employee activeSchedule", () => {
		const result = normalizeAndValidateFieldSelection(
			"Employee",
			"activeSchedule.scheduleName",
			{ activeSchedule: "embeddedSchedule" },
			{ derivedRoots: ["activeSchedule"] },
		);

		expect(result.errors).to.deep.equal([
			'Invalid field "activeSchedule.scheduleName". "activeSchedule" is a derived field and does not support nested selection.',
		]);
	});
});
