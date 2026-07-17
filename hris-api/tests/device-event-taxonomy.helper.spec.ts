import { expect } from "chai";
import {
	buildPersistedDeviceEventTaxonomy,
	classifyDeviceEvent,
} from "../helper/device-event-taxonomy.helper";

describe("Device event taxonomy helper", () => {
	it("maps proven Hikvision fingerprint compare pass rows to persisted attendance tap fields", () => {
		const taxonomy = classifyDeviceEvent({
			source: "EN_HCNETSDK_ALARM",
			status: "ATTENDANCE_UPDATED",
			major: "5",
			minor: "38",
			payload: {
				eventKind: "attendance_fingerprint_success",
				actionCode: "MINOR_FINGERPRINT_COMPARE_PASS",
			},
		});

		expect(taxonomy).to.deep.include({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			eventLabel: "Fingerprint attendance punch",
			eventConfidence: "PROVEN",
			processingLabel: "Attendance updated",
			transportLabel: "Hikvision SDK listener",
			capabilityConfidence: "proven",
		});
	});

	it("maps proven ZKTeco bridge attendance transactions to persisted attendance tap fields", () => {
		const taxonomy = classifyDeviceEvent({
			source: "ZKTECO_EVENT",
			status: "MATCHED",
			eventType: "AttendanceTransaction",
			payload: {
				attendance: { enrollNumber: "1321" },
				bridge: { runtime: "project-truth-zkteco-linux-pyzk-bridge" },
			},
		});

		expect(taxonomy).to.deep.include({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			eventLabel: "Attendance punch",
			eventConfidence: "PROVEN",
			processingLabel: "Matched to employee",
			transportLabel: "ZKTeco Linux bridge",
			capabilityConfidence: "proven",
		});
	});

	it("keeps supported but unproven enrollment and user actions separate from attendance", () => {
		expect(
			classifyDeviceEvent({
				source: "EN_HCNETSDK_ALARM",
				status: "IGNORED",
				payload: { actionCode: "MINOR_ADD_FINGER_BY_EMPLOYEE_NO" },
			}),
		).to.deep.include({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_ENROLLED",
			eventLabel: "Fingerprint enrolled",
			eventConfidence: "SUPPORTED",
			capabilityConfidence: "supported",
		});

		expect(
			classifyDeviceEvent({
				source: "EN_HCNETSDK_ALARM",
				status: "IGNORED",
				payload: { actionCode: "MINOR_ADD_CARD" },
			}),
		).to.deep.include({
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_ENROLLED",
			eventLabel: "Card enrolled",
			eventConfidence: "SUPPORTED",
			capabilityConfidence: "supported",
		});

		expect(
			classifyDeviceEvent({
				source: "EN_HCNETSDK_ALARM",
				status: "IGNORED",
				payload: { actionCode: "MINOR_CLR_USER_INFO" },
			}),
		).to.deep.include({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_DELETED",
			eventLabel: "Device user deleted",
			eventConfidence: "SUPPORTED",
			capabilityConfidence: "supported",
		});

		expect(
			classifyDeviceEvent({
				source: "EN_HCNETSDK_ALARM",
				status: "IGNORED",
				payload: { actionCode: "MINOR_CLR_FINGER_BY_CARD" },
			}),
		).to.deep.include({
			eventCategory: "ENROLLMENT",
			eventAction: "FINGERPRINT_DELETED",
			eventLabel: "Fingerprint deleted",
			eventConfidence: "SUPPORTED",
			capabilityConfidence: "supported",
		});

		expect(
			classifyDeviceEvent({
				source: "EN_HCNETSDK_ALARM",
				status: "IGNORED",
				payload: { actionCode: "MINOR_CLR_CARD" },
			}),
		).to.deep.include({
			eventCategory: "ENROLLMENT",
			eventAction: "CARD_DELETED",
			eventLabel: "Card deleted",
			eventConfidence: "SUPPORTED",
			capabilityConfidence: "supported",
		});
	});

	it("returns an unknown access-controller event instead of inventing an action", () => {
		const taxonomy = classifyDeviceEvent({
			source: "EN_HCNETSDK_ALARM",
			status: "IGNORED",
			major: "5",
			minor: "21",
			payload: { eventKind: "acs_event", actionCode: "UNKNOWN_MINOR" },
			errorMessage: "non_attendance_device_event",
		});

		expect(taxonomy).to.deep.include({
			eventCategory: "UNKNOWN_VENDOR",
			eventAction: "UNKNOWN",
			eventLabel: "Access controller event needs review",
			eventConfidence: "UNKNOWN",
			capabilityConfidence: "unknown",
		});
	});

	it("surfaces observed Hikvision operation minors as enrollment-sync signals instead of generic access-control rows", () => {
		const taxonomy = classifyDeviceEvent({
			source: "EN_HCNETSDK_ALARM",
			status: "IGNORED",
			major: "3",
			minor: "80",
			payload: {
				eventKind: "biometric_operation_sync",
				actionCode: "OBSERVED_OPERATION_MINOR_80",
			},
		});

		expect(taxonomy).to.deep.include({
			eventCategory: "RUNTIME",
			eventAction: "SYNC_SIGNAL",
			eventLabel: "Device operation signal (resolving person/enroll details)",
			eventConfidence: "SUPPORTED",
			capabilityConfidence: "supported",
		});
	});

	it("classifies direct and inventory-detected user creates before the generic operation signal", () => {
		expect(
			classifyDeviceEvent({
				source: "EN_HCNETSDK_ALARM",
				status: "IGNORED",
				major: "3",
				payload: {
					eventKind: "biometric_user_management",
					actionCode: "MINOR_ADD_USER_INFO",
				},
			}),
		).to.deep.include({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence: "SUPPORTED",
			capabilityConfidence: "supported",
		});

		expect(
			classifyDeviceEvent({
				source: "EN_HCNETSDK_ALARM",
				status: "IGNORED",
				major: "3",
				payload: {
					eventKind: "poll_inventory_user_created",
					actionCode: "MINOR_ADD_USER_INFO",
				},
			}),
		).to.deep.include({
			eventCategory: "USER_MANAGEMENT",
			eventAction: "USER_CREATED",
			eventLabel: "Device user created",
			eventConfidence: "INFERRED",
			capabilityConfidence: "inferred",
		});
	});

	it("returns only persisted fields from the write-time taxonomy helper", () => {
		const persisted = buildPersistedDeviceEventTaxonomy({
			source: "ZKTECO_EVENT",
			eventType: "AttendanceTransaction",
			status: "RECEIVED",
		});

		expect(persisted).to.deep.equal({
			eventCategory: "ATTENDANCE",
			eventAction: "TAP",
			eventLabel: "Attendance punch",
			eventConfidence: "PROVEN",
		});
	});
});
