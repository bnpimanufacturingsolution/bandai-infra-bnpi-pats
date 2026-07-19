import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";
import {
	applyFastEnrollmentIdentityOnSdkCallback,
	buildEmployeeDisplayName,
	buildEnrollmentSnapshot,
	correlateOpaqueToPlainByInventoryDelta,
	extractFingerIdFromLogEvidence,
	extractOpaqueEmployeeNoFromLogEvidence,
	extractPlainEmployeeNoFromUserInfoBody,
	extractPlainUserFromUserInfoRecord,
	formatHikvisionPlus08,
	isHikvisionEnrollmentLifecycleCallback,
	isHikvisionSdkOperationSignal,
} from "../helper/device-person-token.helper";
import {
	classifyHikvisionLogSearchRow,
	isOpaqueHikvisionPersonToken,
} from "../helper/hikvision-event-contract.helper";

describe("device-person-token helper", () => {
	it("extracts plain employeeNo from UserInfo record body", () => {
		expect(
			extractPlainEmployeeNoFromUserInfoBody({
				UserInfo: { employeeNo: "ptmap001", name: "Probe" },
			}),
		).to.equal("ptmap001");
		expect(
			extractPlainEmployeeNoFromUserInfoBody({
				UserInfo: { employeeNo: "ckC6ilTx9CdZvFg/hOy23Q==" },
			}),
		).to.equal(null);
	});

	it("formats +08:00 timestamps for logSearch windows", () => {
		const formatted = formatHikvisionPlus08(Date.UTC(2026, 6, 17, 3, 53, 6));
		expect(formatted).to.match(/^2026-07-17T11:53:06\+08:00$/);
	});

	it("classifies opaque log tokens the same way as contract helper", () => {
		expect(isOpaqueHikvisionPersonToken("ckC6ilTx9CdZvFg/hOy23Q==")).to.equal(true);
		expect(isOpaqueHikvisionPersonToken("1")).to.equal(false);
		expect(isOpaqueHikvisionPersonToken("ptmap001")).to.equal(false);
	});

	it("builds employee display name from personalInfo for linked device persons", () => {
		expect(
			buildEmployeeDisplayName({
				person: { personalInfo: { firstName: "Juan", middleName: "D", lastName: "Cruz" } },
			}),
		).to.equal("Juan D Cruz");
		expect(buildEmployeeDisplayName({ person: { personalInfo: {} } })).to.equal(null);
		expect(buildEmployeeDisplayName(null)).to.equal(null);
	});

	it("parses opaque from proven logSearch LogAddInfo shape (panel enroll)", () => {
		// Real TEST A panel create/FP 2026-07-17: plain typed "14" → opaque in log only.
		const opaque = "EmfPTja5gq/kmy/CI1wDHA==";
		expect(
			extractOpaqueEmployeeNoFromLogEvidence({
				employeeNo: opaque,
				information: JSON.stringify({
					LogAddInfo: { EmployeeNo: opaque, ErrorMsg: "OK" },
				}),
			}),
		).to.equal(opaque);
		expect(
			extractOpaqueEmployeeNoFromLogEvidence({
				information: `{\n\t"LogAddInfo":\t{\n\t\t"EmployeeNo":\t"${opaque}",\n\t\t"FingerId":\t1,\n\t\t"ErrorMsg":\t"OK"\n\t}\n}`,
			}),
		).to.equal(opaque);
		expect(extractOpaqueEmployeeNoFromLogEvidence({ employeeNo: "14" })).to.equal(null);
	});

	it("parses plain UserInfo/Search person shape", () => {
		expect(
			extractPlainUserFromUserInfoRecord({
				employeeNo: "14",
				name: "Panel User",
				numOfFP: 1,
				userType: "normal",
			}),
		).to.deep.equal({ employeeNo: "14", displayName: "Panel User", numOfFP: 1 });
		expect(
			extractPlainUserFromUserInfoRecord({
				employeeNo: "EmfPTja5gq/kmy/CI1wDHA==",
				name: "x",
			}),
		).to.equal(null);
	});

	it("correlates single new plain device user to single unmapped opaque (panel 14 case)", () => {
		const hit = correlateOpaqueToPlainByInventoryDelta({
			devicePlains: [
				{ employeeNo: "1", displayName: "ernest" },
				{ employeeNo: "14", displayName: "Panel User" },
			],
			knownPlains: ["1", "01515"],
			unmappedOpaques: ["EmfPTja5gq/kmy/CI1wDHA=="],
		});
		expect(hit).to.deep.equal({
			opaqueToken: "EmfPTja5gq/kmy/CI1wDHA==",
			employeeNo: "14",
			displayName: "Panel User",
		});
		// One opaque + multiple new plains (panel create race): pick highest pure-numeric id.
		expect(
			correlateOpaqueToPlainByInventoryDelta({
				devicePlains: [
					{ employeeNo: "14", displayName: "A" },
					{ employeeNo: "15", displayName: "B", numOfFP: 1 },
				],
				knownPlains: [],
				unmappedOpaques: ["QVEwgvx/WIX5uNj9psBnjw=="],
			}),
		).to.deep.equal({
			opaqueToken: "QVEwgvx/WIX5uNj9psBnjw==",
			employeeNo: "15",
			displayName: "B",
		});
		// Known "00015" must suppress plain "15" as already-known (5-digit pad rule).
		expect(
			correlateOpaqueToPlainByInventoryDelta({
				devicePlains: [{ employeeNo: "15", displayName: "B" }],
				knownPlains: ["00015"],
				unmappedOpaques: ["QVEwgvx/WIX5uNj9psBnjw=="],
			}),
		).to.equal(null);
	});

	it("extracts FingerId from LogAddInfo (panel fingerprint enroll)", () => {
		const opaque = "yPFUNQTscAXEP8dc9bpbBw==";
		expect(
			extractFingerIdFromLogEvidence({
				information: JSON.stringify({
					LogAddInfo: { EmployeeNo: opaque, FingerId: 1, ErrorMsg: "OK" },
				}),
			}),
		).to.equal(1);
		expect(extractFingerIdFromLogEvidence({ information: "{}" })).to.equal(null);
	});

	it("builds enrollment snapshot with identity goal fields and no raw template on event", () => {
		const snap = buildEnrollmentSnapshot({
			eventAction: "FINGERPRINT_ENROLLED",
			plainEmployeeNo: "14",
			displayName: "Panel User",
			opaqueToken: "EmfPTja5gq/kmy/CI1wDHA==",
			userInfo: { employeeNo: "14", name: "Panel User", numOfFP: 1, numOfFace: 0, numOfCard: 0 },
			fingerIdFromLog: 1,
			deviceUserId: "du1",
		});
		expect(snap.schema).to.equal("project-truth.enrollment-snapshot.v1");
		expect(snap.plainEmployeeNo).to.equal("14");
		expect(snap.displayName).to.equal("Panel User");
		expect(snap.opaquePersonToken).to.equal("EmfPTja5gq/kmy/CI1wDHA==");
		expect((snap.credentialSummary as any)?.fingerprintCount).to.equal(1);
		expect((snap.biometricCustody as any)?.templateStorage).to.equal(
			"raw_base64_on_device_user",
		);
		expect((snap.biometricCustody as any)?.location).to.include("rawFingerprints");
		expect((snap.completeness as any)?.identityReady).to.equal(true);
		// Snapshot itself must not embed raw fingerData; blobs live on DeviceUser.
		expect(JSON.stringify(snap)).to.not.include("fingerData");
	});

	it("operation-log resolve source uses proven device metaIds (clearUserInfo, not deleteUserInfo)", () => {
		// Live TEST A 2026-07-17: deleteUserInfo is ISAPI-invalid; clearUserInfo is the delete leaf.
		const source = readFileSync(
			join(__dirname, "../helper/device-person-token.helper.ts"),
			"utf8",
		);
		expect(source).to.include("log.hikvision.com/Information/clearUserInfo");
		expect(source).to.include("enrichEnrollmentLifecycleEvent");
		expect(source).to.include("enrollmentSnapshot");
		expect(source).to.include("log.hikvision.com/Information/addUserInfo");
		expect(source).to.include("log.hikvision.com/Information/addFpByEmployeeNo");
		expect(source).to.include("applyFastEnrollmentIdentityOnSdkCallback");
		expect(source).to.include("scheduleRawFingerprintCaptureForEnrollment");
		expect(source).to.include("raw_base64_on_device_user");
		expect(source).to.not.match(/Information\/deleteUserInfo/);
		expect(source).to.not.match(/Information\/addFaceByEmployeeNo/);
		expect(source).to.not.match(/Information\/addCardInfo/);
		expect(classifyHikvisionLogSearchRow({ metaId: "log.hikvision.com/Information/clearUserInfo" }))
			.to.include({ eventAction: "USER_DELETED" });
		expect(classifyHikvisionLogSearchRow({ metaId: "log.hikvision.com/Information/addUserInfo" }))
			.to.include({ eventAction: "USER_CREATED" });
		expect(
			classifyHikvisionLogSearchRow({
				metaId: "log.hikvision.com/Information/addFpByEmployeeNo",
			}),
		).to.include({ eventAction: "FINGERPRINT_ENROLLED" });
	});

	it("classifies user create/update as enrollment lifecycle and major=3 as operation signal", () => {
		expect(
			isHikvisionEnrollmentLifecycleCallback({
				eventKind: "biometric_user_management",
				actionCode: "MINOR_ADD_USER_INFO",
			}),
		).to.equal(true);
		expect(
			isHikvisionEnrollmentLifecycleCallback({
				eventAction: "USER_UPDATED",
			}),
		).to.equal(true);
		expect(
			isHikvisionEnrollmentLifecycleCallback({
				major: "3",
				actionCode: "OBSERVED_OPERATION_MINOR_112",
			}),
		).to.equal(false);
		expect(
			isHikvisionSdkOperationSignal({
				major: "3",
				actionCode: "OBSERVED_OPERATION_MINOR_112",
			}),
		).to.equal(true);
	});

	it("fast enrollment identity applies plain employeeNo to DeviceEvent + DeviceUser and sockets", async () => {
		const emitted: any[] = [];
		const createdUsers: any[] = [];
		const updatedEvents: any[] = [];
		const eventRow = {
			id: "evt-enroll-1",
			payload: { source: "EN_HCNETSDK_ALARM", major: 3 },
			status: "RECEIVED",
			employeeNo: null,
		};
		const prisma = {
			deviceUser: {
				findFirst: async () => null,
				create: async (input: any) => {
					const row = { id: "du-14", ...input.data };
					createdUsers.push(row);
					return row;
				},
				update: async (input: any) => ({ id: input.where.id, ...input.data }),
			},
			devicePersonToken: {
				findFirst: async () => null,
			},
			employee: {
				findFirst: async (input: any) => {
					const or = input?.where?.OR || [];
					const hit = or.some((clause: any) => {
						const deviceEmp =
							clause.deviceEmpId?.in ||
							(clause.deviceEmpId ? [clause.deviceEmpId] : []);
						const empId =
							clause.employeeId?.in ||
							(clause.employeeId ? [clause.employeeId] : []);
						return (
							deviceEmp.includes("14") ||
							deviceEmp.includes("00014") ||
							empId.includes("14") ||
							empId.includes("00014") ||
							empId.includes("BNPI-014")
						);
					});
					if (!hit) return null;
					return {
						id: "emp-hris-14",
						employeeId: "BNPI-014",
						deviceEmpId: "14",
						person: { personalInfo: { firstName: "Panel", lastName: "User" } },
					};
				},
				findUnique: async (input: any) => {
					if (input.where.id !== "emp-hris-14") return null;
					return {
						id: "emp-hris-14",
						employeeId: "BNPI-014",
						deviceEmpId: "14",
						person: { personalInfo: { firstName: "Panel", lastName: "User" } },
					};
				},
			},
			deviceEvent: {
				findUnique: async () => eventRow,
				update: async (input: any) => {
					updatedEvents.push(input);
					const row = {
						...eventRow,
						...input.data,
						device: { id: "dev-1", name: "TEST A", address: "192.168.254.102" },
						deviceUser: createdUsers[0] || null,
					};
					Object.assign(eventRow, input.data);
					emitted.push({ kind: "event-update", row });
					return row;
				},
			},
		};
		const req = {
			io: {
				to: () => ({
					emit: (event: string, payload: any) => {
						emitted.push({ event, payload });
					},
				}),
				emit: (event: string, payload: any) => {
					emitted.push({ event, payload });
				},
			},
		};

		const result = await applyFastEnrollmentIdentityOnSdkCallback({
			prisma: prisma as any,
			req,
			organizationId: "org-1",
			deviceId: "dev-1",
			eventId: "evt-enroll-1",
			eventAction: "USER_CREATED",
			employeeNo: "14",
			displayName: "Panel User",
			// Keep unit test free of live device UserInfo fetch.
			enrichUserInfo: false,
		});

		expect(result.ok).to.equal(true);
		expect(result.path).to.equal("plain_immediate");
		expect(result.plainEmployeeNo).to.equal("14");
		expect(result.linkedEmployeeId).to.equal("emp-hris-14");
		expect(result.deviceUserId).to.equal("du-14");
		expect(createdUsers[0]).to.include({
			organizationId: "org-1",
			deviceId: "dev-1",
			vendorUserId: "14",
			employeeNo: "14",
			employeeId: "emp-hris-14",
		});
		expect(updatedEvents[0].data).to.include({
			employeeNo: "14",
			employeeId: "emp-hris-14",
			deviceUserId: "du-14",
			status: "MATCHED",
		});
		expect(updatedEvents[0].data.payload.resolvedEmployeeNo).to.equal("14");
		expect(updatedEvents[0].data.payload.fastEnrollmentIdentityPath).to.equal(
			"plain_immediate",
		);
		const socketPayloads = emitted.filter((item) => item.event === "device-event:saved");
		expect(socketPayloads.length).to.be.greaterThan(0);
		expect(socketPayloads[0].payload.event.employeeNo).to.equal("14");
		expect(socketPayloads[0].payload.event.employeeId).to.equal("emp-hris-14");
		expect(socketPayloads[0].payload.event.employee.employeeId).to.equal("BNPI-014");
	});

	it("fast enrollment identity maps opaque token to plain when DevicePersonToken exists", async () => {
		const opaque = "EmfPTja5gq/kmy/CI1wDHA==";
		const eventRow = {
			id: "evt-enroll-2",
			payload: {},
			status: "RECEIVED",
			employeeNo: null,
		};
		const prisma = {
			deviceUser: {
				findFirst: async () => null,
				create: async (input: any) => ({ id: "du-14", ...input.data }),
			},
			devicePersonToken: {
				findFirst: async () => ({
					employeeNo: "14",
					displayName: "Panel User",
					opaqueToken: opaque,
				}),
			},
			employee: {
				findFirst: async () => null,
				findUnique: async () => null,
			},
			deviceEvent: {
				findUnique: async () => eventRow,
				update: async (input: any) => ({
					...eventRow,
					...input.data,
					device: { id: "dev-1" },
					deviceUser: { id: "du-14", vendorUserId: "14" },
				}),
			},
		};

		const result = await applyFastEnrollmentIdentityOnSdkCallback({
			prisma: prisma as any,
			req: { io: null },
			organizationId: "org-1",
			deviceId: "dev-1",
			eventId: "evt-enroll-2",
			eventAction: "USER_CREATED",
			employeeNo: opaque,
			enrichUserInfo: false,
		});

		expect(result.ok).to.equal(true);
		expect(result.path).to.equal("opaque_mapped");
		expect(result.plainEmployeeNo).to.equal("14");
		expect(result.opaqueToken).to.equal(opaque);
	});

	it("fast enrollment identity stays pending when callback has no plain person id", async () => {
		const result = await applyFastEnrollmentIdentityOnSdkCallback({
			prisma: {} as any,
			req: { io: null },
			organizationId: "org-1",
			deviceId: "dev-1",
			eventId: "evt-enroll-3",
			eventAction: "SYNC_SIGNAL",
			employeeNo: null,
			enrichUserInfo: false,
		});
		expect(result.ok).to.equal(false);
		expect(result.path).to.equal("pending_log_resolve");
		expect(result.reason).to.equal("plain_employee_no_not_on_callback");
	});
});
