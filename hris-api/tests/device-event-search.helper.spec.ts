import { expect } from "chai";
import fs from "fs";
import path from "path";
import {
	buildDeviceEventSearchTerms,
	escapePostgresLikeLiteral,
} from "../helper/device-event-search.helper";

describe("device event smart search", () => {
	it("builds numeric identity variants for device user searches", () => {
		expect(buildDeviceEventSearchTerms("17")).to.deep.equal({
			raw: "17",
			literalContains: "%17%",
			literalPrefix: "17%",
			exactCandidates: ["17", "00017"],
		});
		expect(buildDeviceEventSearchTerms("00017").exactCandidates).to.deep.equal([
			"00017",
			"17",
		]);
	});

	it("keeps names and event actions as case-insensitive literal text", () => {
		expect(buildDeviceEventSearchTerms("  User_Created  ")).to.deep.equal({
			raw: "User_Created",
			literalContains: "%User\\_Created%",
			literalPrefix: "User\\_Created%",
			exactCandidates: ["User_Created"],
		});
	});

	it("escapes PostgreSQL wildcard syntax instead of widening the result set", () => {
		expect(escapePostgresLikeLiteral("50%_done\\later")).to.equal(
			"50\\%\\_done\\\\later",
		);
	});

	it("ranks who/what/where/why fields with tagged raw SQL", () => {
		const controllerSource = fs.readFileSync(
			path.join(process.cwd(), "app/device/device.controller.ts"),
			"utf8",
		);
		const getEventsSource = controllerSource.slice(
			controllerSource.indexOf("const getEvents = async"),
			controllerSource.indexOf("const getAll = async"),
		);

		expect(getEventsSource).to.include("LEFT JOIN LATERAL");
		expect(getEventsSource).to.include("search_match.rank ASC");
		expect(getEventsSource).to.include("'deviceUser.vendorUserId', 'Device user ID'");
		expect(getEventsSource).to.include("'event.eventAction', 'Event action'");
		expect(getEventsSource).to.include("'device.name', 'Device name'");
		expect(getEventsSource).to.include("'event.evidenceSource', 'Evidence classification'");
		expect(getEventsSource).to.include("'event.payload.serialNo', 'Event serial'");
		expect(getEventsSource).to.include("'event.payload.parameter', 'Vendor event parameter'");
		expect(getEventsSource).to.not.include("'event.payload', 'Raw event evidence'");
		expect(getEventsSource).to.include("Prisma.join(searchTerms.exactCandidates");
		expect(getEventsSource).to.not.include("$queryRawUnsafe");
	});
});
