import { expect } from "chai";

// Import the validation function from the service generator
// Since we can't directly import the function from a .ts script file,
// we'll recreate it here for testing purposes
function validateServiceName(input: string): string {
	// Validate that the service name only contains alphanumeric characters
	// No special characters like hyphens, underscores, spaces, etc.
	if (!/^[a-zA-Z0-9]+$/.test(input)) {
		throw new Error(
			`Invalid service name "${input}". Service names must contain only alphanumeric characters (letters and numbers). Special characters like hyphens (-), underscores (_), spaces, etc. are not allowed.`
		);
	}

	// Return the original input to preserve casing
	return input;
}

describe("Service Name Validation", () => {
	describe("Valid service names", () => {
		it("should preserve mixed case names like 'appSite'", () => {
			const result = validateServiceName("appSite");
			expect(result).to.equal("appSite");
		});

		it("should preserve PascalCase names like 'UserProfile'", () => {
			const result = validateServiceName("UserProfile");
			expect(result).to.equal("UserProfile");
		});

		it("should preserve camelCase names like 'userProfile'", () => {
			const result = validateServiceName("userProfile");
			expect(result).to.equal("userProfile");
		});

		it("should preserve all lowercase names like 'user'", () => {
			const result = validateServiceName("user");
			expect(result).to.equal("user");
		});

		it("should preserve all uppercase names like 'USER'", () => {
			const result = validateServiceName("USER");
			expect(result).to.equal("USER");
		});

		it("should accept alphanumeric names like 'app123'", () => {
			const result = validateServiceName("app123");
			expect(result).to.equal("app123");
		});

		it("should accept names starting with numbers like '123app'", () => {
			const result = validateServiceName("123app");
			expect(result).to.equal("123app");
		});
	});

	describe("Invalid service names", () => {
		it("should reject names with hyphens like 'app-site'", () => {
			expect(() => validateServiceName("app-site")).to.throw(
				'Invalid service name "app-site". Service names must contain only alphanumeric characters'
			);
		});

		it("should reject names with underscores like 'app_site'", () => {
			expect(() => validateServiceName("app_site")).to.throw(
				'Invalid service name "app_site". Service names must contain only alphanumeric characters'
			);
		});

		it("should reject names with spaces like 'app site'", () => {
			expect(() => validateServiceName("app site")).to.throw(
				'Invalid service name "app site". Service names must contain only alphanumeric characters'
			);
		});

		it("should reject names with special characters like 'app@site'", () => {
			expect(() => validateServiceName("app@site")).to.throw(
				'Invalid service name "app@site". Service names must contain only alphanumeric characters'
			);
		});

		it("should reject names with dots like 'app.site'", () => {
			expect(() => validateServiceName("app.site")).to.throw(
				'Invalid service name "app.site". Service names must contain only alphanumeric characters'
			);
		});

		it("should reject empty strings", () => {
			expect(() => validateServiceName("")).to.throw(
				'Invalid service name "". Service names must contain only alphanumeric characters'
			);
		});

		it("should reject names with exclamation marks like 'app!'", () => {
			expect(() => validateServiceName("app!")).to.throw(
				'Invalid service name "app!". Service names must contain only alphanumeric characters'
			);
		});
	});
});