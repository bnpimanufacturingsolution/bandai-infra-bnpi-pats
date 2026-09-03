import { describe, expect, it } from "vitest";
import { APIService } from "./api-service";

class ExposedAPIService extends APIService {
	queryString() {
		return this.getQueryString();
	}
}

describe("APIService query builder", () => {
	it("applies document and pagination defaults", () => {
		const service = new ExposedAPIService();

		expect(service.queryString()).toBe("?document=true&pagination=true&count=false");
	});

	it("normalizes selected fields from strings and arrays", () => {
		const service = new ExposedAPIService();

		expect(service.select("id, name employeeId").queryString()).toBe(
			"?fields=id%2Cname%2CemployeeId&document=true&pagination=true&count=false",
		);
		expect(service.select(["id", "status"]).queryString()).toBe(
			"?fields=id%2Cstatus&document=true&pagination=true&count=false",
		);
	});

	it("builds pagination, search, and sort query params", () => {
		const service = new ExposedAPIService();

		expect(
			service.paginate(3, 25).search("payroll").sort("createdAt", "asc").queryString(),
		).toBe(
			"?page=3&limit=25&query=payroll&sort=createdAt&order=asc&document=true&pagination=true&count=false",
		);
	});

	it("serializes object filters with colon syntax", () => {
		const service = new ExposedAPIService();

		expect(
			service
				.filter([{ status: "APPROVED" }, { payrollPeriodId: "period-1" }])
				.queryString(),
		).toBe(
			"?filter=status%3AAPPROVED%2CpayrollPeriodId%3Aperiod-1&document=true&pagination=true&count=false",
		);
	});

	it("clears query params after building a query string", () => {
		const service = new ExposedAPIService();

		expect(service.paginate(1, 10).queryString()).toContain("page=1");
		expect(service.queryString()).not.toContain("page=1");
	});
});
