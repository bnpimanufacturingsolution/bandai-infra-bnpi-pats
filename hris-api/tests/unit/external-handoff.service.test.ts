import { strict as assert } from "assert";
import {
	mapHrisRoleToExternal,
	base64UrlEncode,
	signPayload,
	buildExternalProfile,
	buildExternalAccessFields,
	buildLmsLaunchUrl,
	buildEpmrLaunchUrl,
	resolveLmsPersonaFromHrisRole,
	callLmsExternalHandoff,
} from "../../lib/external-handoff.service";

describe("external-handoff.service", () => {
	// -------------------------------------------------------------------------
	// Launch URL builders — existing LMS/EPMR bridge contracts
	// -------------------------------------------------------------------------
	describe("launch URL builders (bridge contracts)", () => {
		const LMS_JWT = "<LMS_JWT>"; // placeholder — never use a real token in tests
		const ORG = "bnei";

		const decodeTokenParam = (url: URL): string => {
			const raw = url.searchParams.get("token") || "";
			return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
		};

		it("builds the LMS bridge URL on the existing /lms/auth/bridge route with app=lms", () => {
			const url = new URL(buildLmsLaunchUrl(LMS_JWT, ORG));
			assert.equal(url.origin, "http://localhost:5173");
			assert.equal(url.pathname, "/lms/auth/bridge", "must target the existing LMS bridge route");
			assert.equal(url.searchParams.get("app"), "lms", "app param is required by the LMS bridge");
			assert.equal(url.searchParams.get("orgCode"), ORG);
		});

		it("encodes the LMS JWT as Base64URL in the token param (never raw JWT)", () => {
			const url = new URL(buildLmsLaunchUrl(LMS_JWT, ORG));
			assert.equal(decodeTokenParam(url), LMS_JWT, "token must round-trip to the LMS JWT");
			assert.notEqual(url.searchParams.get("token"), LMS_JWT);
		});

		it("does NOT set source=external on the LMS bridge (JWT bootstrap path, no re-handoff)", () => {
			const url = new URL(buildLmsLaunchUrl(LMS_JWT, ORG));
			assert.notEqual(url.searchParams.get("source"), "external");
		});

		it("builds the EPMR bridge URL on the existing /performance/auth/bridge route", () => {
			const url = new URL(buildEpmrLaunchUrl(LMS_JWT, ORG, "admin"));
			assert.equal(url.origin, "http://localhost:5181");
			assert.equal(
				url.pathname,
				"/performance/auth/bridge",
				"must target the existing EPMR bridge route",
			);
			assert.equal(url.searchParams.get("source"), "lms");
			assert.equal(url.searchParams.get("orgCode"), ORG);
			assert.equal(url.searchParams.get("role"), "admin");
		});

		it("encodes the EPMR bridge token as Base64URL of the LMS JWT (not the profile token)", () => {
			const url = new URL(buildEpmrLaunchUrl(LMS_JWT, ORG, "employee"));
			assert.equal(decodeTokenParam(url), LMS_JWT);
		});

		it("includes an LMS-hosted returnTo mirroring LMS's own performanceRedirect format", () => {
			const url = new URL(buildEpmrLaunchUrl(LMS_JWT, ORG, "employee"));
			const returnTo = url.searchParams.get("returnTo") || "";
			assert.ok(returnTo.startsWith("http://localhost:5173/lms/"), "returnTo must be an LMS URL");
			assert.ok(returnTo.includes("/bnei/student/dashboard"), "employee persona maps to student segment");
		});

		it("does not double-append the app route prefixes when the base URL already includes them", () => {
			const lmsUrl = new URL(
				buildLmsLaunchUrl(LMS_JWT, ORG, "http://localhost:5173/lms"),
			);
			assert.ok(!lmsUrl.pathname.includes("/lms/lms"), "must not double the /lms prefix");

			const epmrUrl = new URL(
				buildEpmrLaunchUrl(
					LMS_JWT,
					ORG,
					"admin",
					"http://localhost:5181/performance",
					"http://localhost:5173/lms",
				),
			);
			assert.ok(
				!epmrUrl.pathname.includes("/performance/performance"),
				"must not double the /performance prefix",
			);
			assert.ok(
				(epmrUrl.searchParams.get("returnTo") || "").startsWith("http://localhost:5173/lms/"),
			);
		});

		it("resolveLmsPersonaFromHrisRole returns LMS personas (never epmr_* subroles)", () => {
			assert.equal(resolveLmsPersonaFromHrisRole("hris-admin"), "admin");
			assert.equal(resolveLmsPersonaFromHrisRole("super_admin"), "admin");
			assert.equal(resolveLmsPersonaFromHrisRole("hris-hr-manager"), "employee");
			assert.equal(resolveLmsPersonaFromHrisRole("hris-employee"), "employee");
			assert.equal(resolveLmsPersonaFromHrisRole("hris-hr-user"), "user");
			assert.equal(resolveLmsPersonaFromHrisRole("hris-employee-manager"), "employee");
			assert.equal(resolveLmsPersonaFromHrisRole("unknown-role"), "");
			for (const persona of [
				resolveLmsPersonaFromHrisRole("hris-admin"),
				resolveLmsPersonaFromHrisRole("hris-employee"),
			]) {
				assert.ok(!persona.startsWith("epmr_"), "persona must never be an EPMR subrole");
			}
		});

		it("keeps the existing role mapping intact alongside the persona derivation", () => {
			const adminFields = buildExternalAccessFields("hris-admin");
			assert.deepEqual(adminFields.epmrSubRole, ["epmr_admin"]);
			assert.equal(adminFields.lmsAccess, "ADMIN");
			const employeeFields = buildExternalAccessFields("hris-employee");
			assert.deepEqual(employeeFields.epmrSubRole, ["epmr_ratee"]);
			assert.equal(employeeFields.lmsAccess, "EMPLOYEE");
		});
	});

	// -------------------------------------------------------------------------
	// buildExternalAccessFields — role-based access mapping for the launcher
	// -------------------------------------------------------------------------
	describe("buildExternalAccessFields", () => {
		it("maps admin roles to lmsAccess ADMIN + epmr_admin", () => {
			for (const role of ["hris-admin", "admin", "super_admin"]) {
				const fields = buildExternalAccessFields(role);
				assert.equal(fields.lmsAccess, "ADMIN", `${role} lmsAccess must be ADMIN`);
				assert.deepEqual(fields.epmrSubRole, ["epmr_admin"], `${role} must get epmr_admin`);
			}
		});

		it("maps hris-hr-manager to epmr_rater", () => {
			const fields = buildExternalAccessFields("hris-hr-manager");
			assert.equal(fields.lmsAccess, "EMPLOYEE");
			assert.deepEqual(fields.epmrSubRole, ["epmr_rater"]);
		});

		it("maps hris-employee to epmr_ratee", () => {
			const fields = buildExternalAccessFields("hris-employee");
			assert.equal(fields.lmsAccess, "EMPLOYEE");
			assert.deepEqual(fields.epmrSubRole, ["epmr_ratee"]);
		});

		it("grants hris-hr-user LMS access but NO EPMR subrole (HR operator, no defined EPMR mapping)", () => {
			const fields = buildExternalAccessFields("hris-hr-user");
			assert.equal(fields.lmsAccess, "USER");
			assert.equal(fields.epmrSubRole, undefined, "hris-hr-user must not receive an EPMR subrole");
		});

		it("grants hris-employee-manager NO EPMR subrole (existing mapping hint 'user' preserved)", () => {
			const fields = buildExternalAccessFields("hris-employee-manager");
			assert.equal(fields.lmsAccess, "EMPLOYEE");
			assert.equal(fields.epmrSubRole, undefined);
		});

		it("returns no fields for unauthorized roles", () => {
			for (const role of ["unknown-role", ""]) {
				const fields = buildExternalAccessFields(role);
				assert.equal(fields.lmsAccess, undefined);
				assert.equal(fields.epmrSubRole, undefined);
				assert.deepEqual(fields, {});
			}
		});

		it("never grants epmr_admin or epmr_qa to ordinary employees (privilege escalation guard)", () => {
			for (const role of ["hris-employee", "hris-hr-user", "hris-employee-manager", "hris-hr-manager"]) {
				const fields = buildExternalAccessFields(role);
				const subroles = fields.epmrSubRole || [];
				assert.ok(!subroles.includes("epmr_admin"), `${role} must not receive epmr_admin`);
				assert.ok(!subroles.includes("epmr_qa"), `${role} must not receive epmr_qa`);
			}
		});

		it("never grants epmr_qa (no QA-designated HRIS role exists)", () => {
			for (const role of ["hris-admin", "admin", "super_admin", "hris-hr-manager", "hris-hr-user", "hris-employee-manager", "hris-employee"]) {
				const fields = buildExternalAccessFields(role);
				const subroles = fields.epmrSubRole || [];
				assert.ok(!subroles.includes("epmr_qa"), `${role} must not receive epmr_qa`);
			}
		});

		it("uses canonical epmr_* values, not bare hints", () => {
			assert.deepEqual(buildExternalAccessFields("hris-admin").epmrSubRole, ["epmr_admin"]);
			assert.deepEqual(buildExternalAccessFields("hris-hr-manager").epmrSubRole, ["epmr_rater"]);
			assert.deepEqual(buildExternalAccessFields("hris-employee").epmrSubRole, ["epmr_ratee"]);
		});
	});

	// -------------------------------------------------------------------------
	// mapHrisRoleToExternal
	// -------------------------------------------------------------------------
	describe("mapHrisRoleToExternal", () => {
		it("maps admin roles to admin sub-roles", () => {
			for (const role of ["hris-admin", "admin", "super_admin"]) {
				const result = mapHrisRoleToExternal(role);
				assert.equal(result.lmsAccess, true, `${role} should have lmsAccess`);
				assert.equal(result.lmsSubRole, "admin", `${role} should map lmsSubRole to admin`);
				assert.equal(result.epmrSubRole, "admin", `${role} should map epmrSubRole to admin`);
			}
		});

		it("maps hris-hr-manager to manager", () => {
			const result = mapHrisRoleToExternal("hris-hr-manager");
			assert.equal(result.lmsAccess, true);
			assert.equal(result.lmsSubRole, "manager");
			assert.equal(result.epmrSubRole, "manager");
		});

		it("maps hris-hr-user to user", () => {
			const result = mapHrisRoleToExternal("hris-hr-user");
			assert.equal(result.lmsAccess, true);
			assert.equal(result.lmsSubRole, "user");
			assert.equal(result.epmrSubRole, "user");
		});

		it("maps hris-employee-manager to manager/user", () => {
			const result = mapHrisRoleToExternal("hris-employee-manager");
			assert.equal(result.lmsAccess, true);
			assert.equal(result.lmsSubRole, "manager");
			assert.equal(result.epmrSubRole, "user");
		});

		it("maps hris-employee to employee", () => {
			const result = mapHrisRoleToExternal("hris-employee");
			assert.equal(result.lmsAccess, true);
			assert.equal(result.lmsSubRole, "employee");
			assert.equal(result.epmrSubRole, "employee");
		});

		it("denies access for unknown roles", () => {
			const result = mapHrisRoleToExternal("unknown-role");
			assert.equal(result.lmsAccess, false);
			assert.equal(result.lmsSubRole, null);
			assert.equal(result.epmrSubRole, null);
		});

		it("denies access for empty role", () => {
			const result = mapHrisRoleToExternal("");
			assert.equal(result.lmsAccess, false);
		});
	});

	// -------------------------------------------------------------------------
	// base64UrlEncode
	// -------------------------------------------------------------------------
	describe("base64UrlEncode", () => {
		it("encodes simple ASCII to base64url", () => {
			const encoded = base64UrlEncode("hello world");
			assert.equal(encoded, "aGVsbG8gd29ybGQ");
		});

		it("replaces + with - and / with _", () => {
			const encoded = base64UrlEncode("\xff\xfb");
			assert.ok(!encoded.includes("+"), "should not contain +");
			assert.ok(!encoded.includes("/"), "should not contain /");
			assert.ok(!encoded.includes("="), "should not contain =");
		});

		it("strips trailing padding =", () => {
			const encoded = base64UrlEncode("a");
			assert.ok(!encoded.includes("="), "should not contain =");
			assert.equal(encoded, "YQ");
		});

		it("handles unicode characters", () => {
			const encoded = base64UrlEncode("caf\u00e9");
			assert.equal(typeof encoded, "string");
			assert.ok(encoded.length > 0);
		});

		it("encodes and decodes JSON objects", () => {
			const obj = JSON.stringify({ name: "test", value: 123 });
			const encoded = base64UrlEncode(obj);
			assert.equal(typeof encoded, "string");
			const decoded = Buffer.from(
				encoded.replace(/-/g, "+").replace(/_/g, "/"),
				"base64",
			).toString("utf-8");
			assert.equal(decoded, obj);
		});
	});

	// -------------------------------------------------------------------------
	// signPayload
	// -------------------------------------------------------------------------
	describe("signPayload", () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = { ...originalEnv };
			process.env.LMS_EXTERNAL_HANDOFF_SECRET = "test-secret-key";
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		it("produces a consistent HMAC-SHA256 signature", () => {
			const timestamp = "1700000000000";
			const profile = "dGVzdA";
			const orgCode = "BANDAI";

			const sig1 = signPayload(timestamp, profile, orgCode);
			const sig2 = signPayload(timestamp, profile, orgCode);

			assert.equal(sig1, sig2, "same inputs should produce same signature");
			assert.ok(/^[a-f0-9]{64}$/.test(sig1), "should be hex-encoded SHA-256");
		});

		it("produces different signatures for different inputs", () => {
			const sig1 = signPayload("1000", "aaa", "ORG1");
			const sig2 = signPayload("2000", "bbb", "ORG2");

			assert.notEqual(sig1, sig2);
		});

		it("throws when LMS_EXTERNAL_HANDOFF_SECRET is missing", () => {
			delete process.env.LMS_EXTERNAL_HANDOFF_SECRET;
			assert.throws(() => signPayload("1000", "test", "ORG"), /secret not configured/i);
		});
	});

	// -------------------------------------------------------------------------
	// buildExternalProfile
	// -------------------------------------------------------------------------
	describe("buildExternalProfile", () => {
		it("extracts profile from nested person.personalInfo and person.contactInfo", () => {
			const employee = {
				userId: "user-123",
				employeeId: "EMP-001",
				role: "hris-employee",
				isManager: true,
				isHrManager: false,
				person: {
					personalInfo: { firstName: "John", lastName: "Doe" },
					contactInfo: { email: "john@example.com" },
				},
				department: { name: "Engineering" },
				position: { title: "Senior Developer" },
				user: { metadata: { avatar: "https://example.com/avatar.png" } },
			};

			const profile = buildExternalProfile(employee);

			assert.equal(profile.userId, "user-123");
			assert.equal(profile.employeeId, "EMP-001");
			assert.equal(profile.firstName, "John");
			assert.equal(profile.lastName, "Doe");
			assert.equal(profile.email, "john@example.com");
			assert.equal(profile.departmentName, "Engineering");
			assert.equal(profile.positionTitle, "Senior Developer");
			assert.equal(profile.role, "hris-employee");
			assert.equal(profile.isManager, true);
			assert.equal(profile.isHrManager, false);
			assert.equal(profile.avatar, "https://example.com/avatar.png");
		});

		it("falls back to flat employee fields", () => {
			const employee = {
				userId: "user-456",
				employeeId: "EMP-002",
				firstName: "Jane",
				lastName: "Smith",
				email: "jane@example.com",
				departmentName: "HR",
				positionTitle: "Manager",
				role: "hris-hr-manager",
				isManager: false,
				isHrManager: true,
			};

			const profile = buildExternalProfile(employee);

			assert.equal(profile.firstName, "Jane");
			assert.equal(profile.lastName, "Smith");
			assert.equal(profile.email, "jane@example.com");
			assert.equal(profile.departmentName, "HR");
			assert.equal(profile.positionTitle, "Manager");
			assert.equal(profile.isHrManager, true);
		});

		it("defaults missing fields to empty strings", () => {
			const employee = { userId: "u1", employeeId: "e1" };
			const profile = buildExternalProfile(employee);

			assert.equal(profile.firstName, "");
			assert.equal(profile.lastName, "");
			assert.equal(profile.email, "");
			assert.equal(profile.departmentName, "");
			assert.equal(profile.positionTitle, "");
			assert.equal(profile.avatar, null);
		});

		it("reads avatar from employee.metadata.employee.avatar fallback", () => {
			const employee = {
				userId: "u1",
				employeeId: "e1",
				metadata: { employee: { avatar: "https://fallback.png" } },
			};

			const profile = buildExternalProfile(employee);
			assert.equal(profile.avatar, "https://fallback.png");
		});
	});

	// -------------------------------------------------------------------------
	// callLmsExternalHandoff — contract verification
	// -------------------------------------------------------------------------
	describe("callLmsExternalHandoff", () => {
		const originalEnv = process.env;
		const originalFetch = global.fetch;

		beforeEach(() => {
			process.env = { ...originalEnv };
			process.env.LMS_API_URL = "http://localhost:5000";
			process.env.LMS_EXTERNAL_HANDOFF_SECRET = "test-secret-key";
		});

		afterEach(() => {
			process.env = originalEnv;
			global.fetch = originalFetch;
		});

		it("calls the correct LMS endpoint path /api/auth/external-handoff", async () => {
			let capturedUrl = "";
			global.fetch = async (url: any, _init?: any) => {
				capturedUrl = String(url);
				return {
					ok: true,
					json: async () => ({
						success: true,
						token: "fake-jwt",
						user: { id: "u1", email: "test@test.com" },
					}),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			assert.ok(
				capturedUrl.endsWith("/api/auth/external-handoff"),
				`Expected URL to end with /api/auth/external-handoff, got: ${capturedUrl}`,
			);
			assert.ok(
				!capturedUrl.includes("/api/external-handoff"),
				`URL should NOT contain /api/external-handoff (old wrong path), got: ${capturedUrl}`,
			);
		});

		it("sends 'token' field (not 'profile') in request body", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({
						success: true,
						token: "fake-jwt",
					}),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			assert.ok(capturedBody.token, "Body must contain 'token' field");
			assert.equal(
				capturedBody.profile,
				undefined,
				"Body must NOT contain 'profile' field (LMS expects 'token')",
			);
		});

		it("sends required 'app' field with value 'lms'", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({
						success: true,
						token: "fake-jwt",
					}),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			assert.equal(capturedBody.app, "lms", "Body must contain app: 'lms'");
			assert.ok(capturedBody.orgCode, "Body must contain orgCode");
			assert.ok(typeof capturedBody.timestamp === "string", "Body timestamp must be a string");
			assert.ok(typeof capturedBody.signature === "string", "Body must contain signature");
		});

		it("returns the LMS JWT token on success", async () => {
			global.fetch = async () =>
				({
					ok: true,
					json: async () => ({
						success: true,
						token: "lms-jwt-token-abc",
						user: { id: "u1", email: "john@test.com" },
					}),
				}) as Response;

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			const result = await callLmsExternalHandoff(profile, "BANDAI");

			assert.equal(result.token, "lms-jwt-token-abc");
		});

		it("throws on LMS HTTP error", async () => {
			global.fetch = async () =>
				({
					ok: false,
					status: 401,
					text: async () => '{"message":"User is not authorized"}',
					statusText: "Unauthorized",
				}) as Response;

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			try {
				await callLmsExternalHandoff(profile, "BANDAI");
				assert.fail("Should have thrown");
			} catch (error: any) {
				assert.ok(error.message.includes("401"), "Error should include status code");
			}
		});

		it("throws when LMS returns no token", async () => {
			global.fetch = async () =>
				({
					ok: true,
					json: async () => ({
						success: true,
						// no token field
					}),
				}) as Response;

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			try {
				await callLmsExternalHandoff(profile, "BANDAI");
				assert.fail("Should have thrown");
			} catch (error: any) {
				assert.ok(
					error.message.includes("no token"),
					"Error should mention missing token",
				);
			}
		});

		it("sends timestamp as a string", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			assert.equal(typeof capturedBody.timestamp, "string", "timestamp must be a string");
			assert.ok(/^\d+$/.test(capturedBody.timestamp), "timestamp must be numeric content");
		});

		it("sends Unix seconds (not milliseconds)", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			const before = Math.floor(Date.now() / 1000);
			await callLmsExternalHandoff(profile, "BANDAI");
			const after = Math.floor(Date.now() / 1000);

			const tsNum = Number(capturedBody.timestamp);
			assert.ok(tsNum >= before - 1 && tsNum <= after + 1, "timestamp must be within 1s of current Unix seconds, got: " + capturedBody.timestamp);
			assert.ok(capturedBody.timestamp.length <= 10, "Unix seconds string must be 10 digits or fewer, got " + capturedBody.timestamp.length + " digits");
		});

		it("uses the exact same timestamp string for HMAC signature and request body", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			// Verify the signature was generated from the same timestamp sent in the body
			const expectedSignature = signPayload(
				capturedBody.timestamp,
				capturedBody.token,
				capturedBody.orgCode,
			);
			assert.equal(
				capturedBody.signature,
				expectedSignature,
				"Signature must be computed from the exact same timestamp sent in the body",
			);
		});

		it("encodes lmsAccess + epmrSubRole into the token sent to LMS (admin)", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-admin",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			const decoded = JSON.parse(
				Buffer.from(
					capturedBody.token.replace(/-/g, "+").replace(/_/g, "/"),
					"base64",
				).toString("utf-8"),
			);
			assert.equal(decoded.lmsAccess, "ADMIN");
			assert.deepEqual(decoded.epmrSubRole, ["epmr_admin"]);
		});

		it("encodes lmsAccess + epmrSubRole into the token sent to LMS (manager)", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-hr-manager",
				isManager: true,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			const decoded = JSON.parse(
				Buffer.from(
					capturedBody.token.replace(/-/g, "+").replace(/_/g, "/"),
					"base64",
				).toString("utf-8"),
			);
			assert.equal(decoded.lmsAccess, "EMPLOYEE");
			assert.deepEqual(decoded.epmrSubRole, ["epmr_rater"]);
		});

		it("encodes lmsAccess + epmrSubRole into the token sent to LMS (employee)", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			const decoded = JSON.parse(
				Buffer.from(
					capturedBody.token.replace(/-/g, "+").replace(/_/g, "/"),
					"base64",
				).toString("utf-8"),
			);
			assert.equal(decoded.lmsAccess, "EMPLOYEE");
			assert.deepEqual(decoded.epmrSubRole, ["epmr_ratee"]);
		});

		it("does not add lmsSubRole to the encoded profile", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			const decoded = JSON.parse(
				Buffer.from(
					capturedBody.token.replace(/-/g, "+").replace(/_/g, "/"),
					"base64",
				).toString("utf-8"),
			);
			assert.equal(decoded.lmsSubRole, undefined, "lmsSubRole must be omitted");
			assert.equal(decoded.role, "hris-employee", "profile.role stays the HRIS role (not used for access)");
		});

		it("drops caller-supplied lmsAccess/epmrSubRole and re-derives from the HRIS role (override guard)", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile: any = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "hris-employee",
				isManager: false,
				isHrManager: false,
				avatar: null,
				lmsAccess: "ADMIN",
				epmrSubRole: ["epmr_admin", "epmr_qa"],
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			const decoded = JSON.parse(
				Buffer.from(
					capturedBody.token.replace(/-/g, "+").replace(/_/g, "/"),
					"base64",
				).toString("utf-8"),
			);
			assert.equal(decoded.lmsAccess, "EMPLOYEE", "forged lmsAccess must be replaced");
			assert.deepEqual(decoded.epmrSubRole, ["epmr_ratee"], "forged epmrSubRole must be replaced");
		});

		it("omits access fields entirely for unauthorized roles", async () => {
			let capturedBody: any = null;
			global.fetch = async (_url: any, init?: any) => {
				capturedBody = JSON.parse(String(init?.body || "{}"));
				return {
					ok: true,
					json: async () => ({ success: true, token: "fake-jwt" }),
				} as Response;
			};

			const profile = {
				userId: "u1",
				employeeId: "EMP-001",
				firstName: "John",
				lastName: "Doe",
				email: "john@test.com",
				departmentName: "IT",
				positionTitle: "Dev",
				role: "unknown-role",
				isManager: false,
				isHrManager: false,
				avatar: null,
			};

			await callLmsExternalHandoff(profile, "BANDAI");

			const decoded = JSON.parse(
				Buffer.from(
					capturedBody.token.replace(/-/g, "+").replace(/_/g, "/"),
					"base64",
				).toString("utf-8"),
			);
			assert.equal(decoded.lmsAccess, undefined);
			assert.equal(decoded.epmrSubRole, undefined);
		});
	});
});
