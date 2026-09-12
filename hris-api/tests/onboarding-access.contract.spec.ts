import { expect } from "chai";
import {
	evaluateOnboardingSignPermission,
	buildOnboardingVisibleView,
	attachOnboardingChildren,
	type OnboardingActor,
} from "../app/onboarding/onboardingAccess.helper";

const baseActor = (overrides: Partial<OnboardingActor>): OnboardingActor => ({
	userId: "user-1",
	role: "hris-employee",
	organizationId: "org-1",
	employeeId: "emp-1",
	employeeNumber: "E001",
	departmentId: "dept-it",
	departmentName: "IT",
	employmentStatus: "ACTIVE",
	fullName: "Ivan Test",
	isAdmin: false,
	isHr: false,
	...overrides,
});

const NEW_HIRE_ID = "emp-newhire";

describe("onboarding sign permission matrix", () => {
	it("denies the onboarded employee signing their own checklist (even dept-matched items)", () => {
		const selfActor = baseActor({
			employeeId: NEW_HIRE_ID,
			departmentId: "dept-hr",
			role: "hris-employee",
		});
		const decision = evaluateOnboardingSignPermission(
			selfActor,
			{ responsibleDepartmentId: "dept-hr" },
			NEW_HIRE_ID,
		);
		expect(decision.allowed).to.be.false;
		expect(decision.status).to.equal(403);
		expect(decision.reason).to.match(/own checklist/i);
	});

	it("allows the responsible department to sign its items", () => {
		const itActor = baseActor({ departmentId: "dept-it" });
		const decision = evaluateOnboardingSignPermission(
			itActor,
			{ responsibleDepartmentId: "dept-it" },
			NEW_HIRE_ID,
		);
		expect(decision.allowed).to.be.true;
	});

	it("denies a different department and keeps 403", () => {
		const gaActor = baseActor({ departmentId: "dept-ga" });
		const decision = evaluateOnboardingSignPermission(
			gaActor,
			{ responsibleDepartmentId: "dept-it" },
			NEW_HIRE_ID,
		);
		expect(decision.allowed).to.be.false;
		expect(decision.status).to.equal(403);
		expect(decision.reason).to.match(/responsible department/i);
	});

	it("treats no-department items as admin/HR only (context for dept users)", () => {
		const deptActor = baseActor({ departmentId: "dept-it" });
		const decision = evaluateOnboardingSignPermission(
			deptActor,
			{ responsibleDepartmentId: null },
			NEW_HIRE_ID,
		);
		expect(decision.allowed).to.be.false;
		expect(decision.reason).to.match(/HR or Admin/i);
	});

	it("allows HR and admin to sign any item, including no-department items", () => {
		const hrActor = baseActor({ role: "hris-hr-manager", isHr: true, departmentId: "dept-hr" });
		const adminActor = baseActor({ role: "hris-admin", isAdmin: true, departmentId: null });
		expect(
			evaluateOnboardingSignPermission(hrActor, { responsibleDepartmentId: "dept-it" }, NEW_HIRE_ID)
				.allowed,
		).to.be.true;
		expect(
			evaluateOnboardingSignPermission(adminActor, { responsibleDepartmentId: null }, NEW_HIRE_ID)
				.allowed,
		).to.be.true;
	});

	it("denies actors without an employee profile", () => {
		const noProfile = baseActor({ employeeId: null });
		const decision = evaluateOnboardingSignPermission(
			noProfile,
			{ responsibleDepartmentId: "dept-it" },
			NEW_HIRE_ID,
		);
		expect(decision.allowed).to.be.false;
		expect(decision.reason).to.match(/employee profile/i);
	});
});

describe("onboarding visible-checklist view builder", () => {
	const checklist = {
		employeeId: NEW_HIRE_ID,
		sections: [
			{
				id: "sec-1",
				title: "Section 1",
				items: [
					{
						id: "item-device",
						parentId: null,
						number: "1",
						order: 1,
						title: "Device",
						status: "PENDING",
						responsibleDepartmentId: null,
					},
					{
						id: "item-laptop",
						parentId: "item-device",
						number: "1.1",
						order: 1,
						title: "Laptop",
						status: "PENDING",
						responsibleDepartmentId: "dept-it",
					},
					{
						id: "item-uniform",
						parentId: null,
						number: "2",
						order: 2,
						title: "Uniform",
						status: "PENDING",
						responsibleDepartmentId: "dept-ga",
					},
				],
			},
			{
				id: "sec-empty",
				title: "Empty for GA",
				items: [
					{
						id: "item-teams",
						parentId: null,
						number: "1",
						order: 1,
						title: "MS Teams account",
						status: "COMPLETED",
						responsibleDepartmentId: "dept-it",
					},
				],
			},
		],
	};

	it("dept employee sees own-dept items + no-dept context rows, hidden other-dept items", () => {
		const itActor = baseActor({ departmentId: "dept-it" });
		const { view, sections } = buildOnboardingVisibleView(checklist, itActor);
		expect(view).to.equal("department");
		const sectionIds = sections.map((s: any) => s.id);
		expect(sectionIds).to.deep.equal(["sec-1", "sec-empty"]);
		const titles = sections[0].items.map((i: any) => i.title);
		expect(titles).to.deep.equal(["Device"]);
		const device = sections[0].items[0];
		expect(device.children.map((c: any) => c.title)).to.deep.equal(["Laptop"]);
		expect(device.canSign).to.be.false;
		expect(device.isContextOnly).to.be.true;
		expect(device.children[0].canSign).to.be.true;
		expect(device.children[0].isContextOnly).to.be.false;
		const walk = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...walk(n.children)]);
		const allVisible = sections.flatMap((s: any) => walk(s.items)).map((i: any) => i.title);
		expect(allVisible).to.not.include("Uniform");
	});

	it("GA employee sees the GA item and the context parent, not IT items", () => {
		const gaActor = baseActor({ departmentId: "dept-ga", departmentName: "GA" });
		const { sections } = buildOnboardingVisibleView(checklist, gaActor);
		const section1 = sections.find((s: any) => s.id === "sec-1");
		const titles = section1.items.map((i: any) => i.title);
		expect(titles).to.deep.equal(["Device", "Uniform"]);
		expect(section1.items.find((i: any) => i.title === "Uniform").canSign).to.be.true;
	});

	it("HR sees everything and can sign every pending item", () => {
		const hrActor = baseActor({ role: "hris-hr-user", isHr: true, departmentId: "dept-hr" });
		const { view, sections } = buildOnboardingVisibleView(checklist, hrActor);
		expect(view).to.equal("full");
		expect(sections).to.have.lengthOf(2);
		const walk = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...walk(n.children)]);
		const allItems = sections.flatMap((s: any) => walk(s.items));
		const titles = allItems.map((i: any) => i.title);
		expect(titles).to.include("Device");
		expect(titles).to.include("Uniform");
		expect(titles).to.include("Laptop");
		const pending = allItems.find((i: any) => i.title === "Device");
		expect(pending.canSign).to.be.true;
	});

	it("onboarded employee sees full own checklist but canSign is always false", () => {
		const selfActor = baseActor({
			employeeId: NEW_HIRE_ID,
			departmentId: "dept-it",
			employmentStatus: "ONBOARDING",
		});
		const { view, sections } = buildOnboardingVisibleView(checklist, selfActor);
		expect(view).to.equal("self");
		const walk = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...walk(n.children)]);
		const all = walk(sections.flatMap((s: any) => s.items));
		expect(all.length).to.be.greaterThan(0);
		all.forEach((item) => expect(item.canSign).to.be.false);
	});

	it("completed items are never signable", () => {
		const hrActor = baseActor({ role: "hris-hr-manager", isHr: true });
		const { sections } = buildOnboardingVisibleView(checklist, hrActor);
		const done = sections
			.flatMap((s: any) => s.items)
			.find((i: any) => i.status === "COMPLETED");
		expect(done.canSign).to.be.false;
	});
});

describe("attachOnboardingChildren", () => {
	it("nests children under parents and sorts by order", () => {
		const roots = attachOnboardingChildren([
			{ id: "b", parentId: "a", order: 2, number: "1.2" },
			{ id: "c", parentId: "a", order: 1, number: "1.1" },
			{ id: "a", parentId: null, order: 1, number: "1" },
		] as any);
		expect(roots.map((r: any) => r.id)).to.deep.equal(["a"]);
		expect(roots[0].children.map((c: any) => c.id)).to.deep.equal(["c", "b"]);
	});

	it("promotes orphans (parent missing from set) to roots", () => {
		const roots = attachOnboardingChildren([
			{ id: "x", parentId: "hidden", order: 1 },
			{ id: "y", parentId: null, order: 2 },
		] as any);
		expect(roots.map((r: any) => r.id)).to.deep.equal(["x", "y"]);
	});
});
