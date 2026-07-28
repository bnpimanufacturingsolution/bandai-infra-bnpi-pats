import { expect } from "chai";

import { isPublicUnauthenticatedApiPath } from "../middleware/isPublicApiRoute";

describe("public API route authorization boundary", () => {
	it("allows the employee login kiosk feeds without a token", () => {
		expect(isPublicUnauthenticatedApiPath("/calendar-item/public/kiosk")).to.equal(true);
		expect(isPublicUnauthenticatedApiPath("/celebrations/public/birthdays")).to.equal(true);
	});

	it("keeps neighboring calendar and celebration routes protected", () => {
		expect(isPublicUnauthenticatedApiPath("/calendar-item")).to.equal(false);
		expect(isPublicUnauthenticatedApiPath("/calendar-item/private")).to.equal(false);
		expect(isPublicUnauthenticatedApiPath("/celebrations/birthdays")).to.equal(false);
		expect(isPublicUnauthenticatedApiPath("/celebrations/public/birthdays/export")).to.equal(
			false,
		);
	});
});
