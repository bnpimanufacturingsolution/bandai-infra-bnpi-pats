import { describe, expect, it } from "vitest";
import { parseLeaveCreditsCsv } from "./leave-credits-upload";

describe("parseLeaveCreditsCsv", () => {
	it("parses a standard csv with header", () => {
		const result = parseLeaveCreditsCsv(
			"employeeId,leaveType,totalEntitled\ncmsp1,VACATION_LEAVE,10\ncmsp2,PERSONAL,5",
		);
		expect(result.errors).to.deep.equal([]);
		expect(result.rows).to.have.lengthOf(2);
		expect(result.rows[0]).to.deep.equal({
			employeeId: "cmsp1",
			leaveType: "VACATION_LEAVE",
			totalEntitled: 10,
		});
	});

	it("accepts case-insensitive headers and uppercases leave type", () => {
		const result = parseLeaveCreditsCsv(
			"Employee Id,Leave Type,Entitled\ncmsp1,sick_leave,3.5",
		);
		expect(result.rows[0].leaveType).to.equal("SICK_LEAVE");
		expect(result.rows[0].totalEntitled).to.equal(3.5);
	});

	it("collects per-line errors without aborting good rows", () => {
		const result = parseLeaveCreditsCsv(
			"employeeId,leaveType,totalEntitled\ncmsp1,PERSONAL,5\n,PERSONAL,2\ncmsp2,PERSONAL,-1",
		);
		expect(result.rows).to.have.lengthOf(1);
		expect(result.errors).to.have.lengthOf(2);
	});
});
