import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readAppFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * Contract test: line-leader "Team Timesheets" tab on My Team.
 * Pins the wiring chain: tab registration + sidebar entry + leader-scoped
 * read-only API (GET /api/section/led-timesheets) + honest no-timesheet rows.
 */
describe("team timesheets tab contract", () => {
	it("registers the Team Timesheets tab for managers on My Team", () => {
		const team = readAppFile("app/routes/employee/team.tsx");
		expect(team).toContain('id: "timesheets"');
		expect(team).toContain('label: "Team Timesheets"');
		expect(team).toContain("TeamTimesheetsTab");
		expect(team).toContain('activeTab === "timesheets" && isManager');
	});

	it("exposes the sidebar entry under My Team for manager-class roles", () => {
		const sidebar = readAppFile("app/components/organisms/Sidebar.tsx");
		expect(sidebar).toContain('id: "general-my-team-timesheets"');
		expect(sidebar).toContain('label: "Team Timesheets"');
		expect(sidebar).toContain('path: "/employee/team?tab=timesheets"');
	});

	it("pins My Team as collapsible parent at the top of Working Space (operator 2026-09-10 back to sub-parent)", () => {
		const sidebar = readAppFile("app/components/organisms/Sidebar.tsx");

		// My Team is a single expandable parent with submenu, rendered at the
		// top of Working Space (not flat always-visible entries).
		expect(sidebar).toContain("const myTeamParent");
		expect(sidebar).toContain("const myTeamChildren");
		expect(sidebar).toContain("submenu: myTeamChildren");
		expect(sidebar).toContain("myTeamParent && <NavItemComponent item={myTeamParent} />");

		// The General section no longer hosts the My Team group (still).
		const generalStart = sidebar.indexOf("const generalItems: NavItem[] = [");
		const personalStart = sidebar.indexOf("// Personal items (common to all)");
		expect(generalStart).toBeGreaterThan(-1);
		expect(personalStart).toBeGreaterThan(generalStart);
		expect(sidebar.slice(generalStart, personalStart)).not.toContain("general-my-team");
	});

	it("uses the leader-scoped led-timesheets endpoint (never the org-wide list)", () => {
		const tab = readAppFile("app/routes/employee/team/TeamTimesheetsTab.tsx");
		const service = readAppFile("app/services/sections.service.ts");
		const router = readFileSync(
			join(process.cwd(), "../hris-api/app/section/section.router.ts"),
			"utf8",
		);
		const controller = readFileSync(
			join(process.cwd(), "../hris-api/app/section/section.controller.ts"),
			"utf8",
		);

		expect(tab).toContain('sectionsService.getLedTimesheets(');
		expect(tab).toContain("No timesheet yet");
		expect(tab).toContain("Current period");
		expect(service).toContain("/api/section/led-timesheets");
		expect(router).toContain('routes.get("/led-timesheets", controller.getLedTimesheets)');
		expect(controller).toContain("const getLedTimesheets");
		// Scope guard: endpoint resolves members from the actor's led sections.
		expect(controller).toContain("getSectionIdsLedByEmployee");
		expect(controller).toContain("getSectionEmployeeIds");
	});

	it("keeps the endpoint read-only (no mutation verbs on the route)", () => {
		const router = readFileSync(
			join(process.cwd(), "../hris-api/app/section/section.router.ts"),
			"utf8",
		);
		expect(router).not.toMatch(/routes\.post\("\/led-timesheets"/);
		expect(router).not.toMatch(/routes\.patch\("\/led-timesheets"/);
		expect(router).not.toMatch(/routes\.delete\("\/led-timesheets"/);
	});
});
