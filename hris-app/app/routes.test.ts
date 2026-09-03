import { describe, expect, it } from "vitest";
import routes from "./routes";

type RouteNode = {
	file?: string;
	path?: string;
	id?: string;
	index?: boolean;
	children?: RouteNode[];
};

const routeList = routes as RouteNode[];

const findLayout = (file: string) => routeList.find((route) => route.file === file);

const flatten = (nodes: RouteNode[], basePath = ""): RouteNode[] =>
	nodes.flatMap((node) => {
		const fullPath = [basePath, node.path].filter(Boolean).join("/");
		const current = { ...node, path: fullPath || node.path };
		const children = node.children ? flatten(node.children, fullPath) : [];
		return [current, ...children];
	});

describe("route configuration contract", () => {
	it("keeps auth, legal, admin, and unified workspaces behind their expected layouts", () => {
		const authLayout = findLayout("./layouts/auth-layout.tsx");
		const adminLayout = findLayout("./layouts/admin-layout.tsx");
		const unifiedLayout = findLayout("./layouts/unified-layout.tsx");

		expect(authLayout?.children?.map((route) => route.path)).toEqual(
			expect.arrayContaining(["auth/login", "terms", "privacy"]),
		);
		expect(adminLayout?.children?.map((route) => route.path)).toEqual(
			expect.arrayContaining(["admin/dashboard", "admin/configuration/migration"]),
		);
		expect(unifiedLayout?.children?.map((route) => route.path)).toEqual(
			expect.arrayContaining(["employee/requests", "hr/employees", "hr/payroll"]),
		);
	});

	it("orders static employee routes before dynamic employee id routes", () => {
		const unifiedLayout = findLayout("./layouts/unified-layout.tsx");
		const children = unifiedLayout?.children || [];
		const staticTeamIndex = children.findIndex(
			(route) => route.path === "employee/team/schedule-calendar",
		);
		const dynamicEmployeeIndex = children.findIndex((route) => route.path === "employee/:id");

		expect(staticTeamIndex).toBeGreaterThanOrEqual(0);
		expect(dynamicEmployeeIndex).toBeGreaterThanOrEqual(0);
		expect(staticTeamIndex).toBeLessThan(dynamicEmployeeIndex);
	});

	it("assigns explicit ids to duplicate route modules that are mounted in multiple workspaces", () => {
		const allRoutes = flatten(routeList);

		expect(
			allRoutes.find((route) => route.path === "admin/configuration/employees/new"),
		).toMatchObject({
			file: "routes/hr/employees.new.tsx",
			id: "admin-configuration-employees-new",
		});
		expect(
			allRoutes.find((route) => route.path === "admin/configuration/employees/:id"),
		).toMatchObject({
			file: "routes/employee/employee.$id.tsx",
			id: "admin-configuration-employees-profile",
		});
		expect(allRoutes.find((route) => route.path === "hr/approvals/requests")).toMatchObject({
			file: "routes/employee/approvals.tsx",
			id: "hr-approvals-requests",
		});
		expect(allRoutes.find((route) => route.path === "employee/workflows")).toMatchObject({
			file: "routes/hr/workflows-2.tsx",
			id: "employee-workflows",
		});
	});

	it("keeps admin employee profile under the admin layout workspace", () => {
		const adminLayout = findLayout("./layouts/admin-layout.tsx");
		const unifiedLayout = findLayout("./layouts/unified-layout.tsx");
		const adminChildren = flatten(adminLayout?.children || []);
		const unifiedChildren = flatten(unifiedLayout?.children || []);

		expect(
			adminChildren.find((route) => route.path === "admin/configuration/employees/:id"),
		).toBeTruthy();
		expect(
			unifiedChildren.find((route) => route.path === "admin/configuration/employees/:id"),
		).toBeUndefined();
	});

	it("keeps public applicant entry points outside authenticated layouts", () => {
		const topLevelRoutes = flatten(routeList);

		expect(topLevelRoutes.find((route) => route.path === "jobs/:jobId/apply")).toMatchObject({
			file: "routes/hr-public/apply.tsx",
		});
		expect(topLevelRoutes.find((route) => route.path === "guide")).toMatchObject({
			file: "routes/hr-public/public-guide-page.tsx",
		});
	});
});
