// @ts-nocheck
import { PrismaClient } from "../generated/prisma";
import { deriveRoleAndFlags, type DerivedRoleFlags } from "../utils/role-derivation";
import { config } from "../config/config";
import { copyTemplateToEmployeeEmbeddedSchedule } from "./employee-schedule.helper";

export const BNPI_DEFAULT_SCHEDULE_CODE = "BNPI_MON_FRI_DAY_8_5";
export const BNPI_DEFAULT_SCHEDULE_NAME = "BNPI Mon-Fri Day 8-5";

const BNPI_DEFAULT_WORK_SLOTS = [
	{ type: "work", label: "Morning", startTime: "08:00", endTime: "12:00" },
	{ type: "break", label: "Lunch Break", startTime: "12:00", endTime: "13:00" },
	{ type: "work", label: "Afternoon", startTime: "13:00", endTime: "17:00" },
];

const BNPI_DEFAULT_WORK_SHIFT_SNAPSHOT = {
	name: BNPI_DEFAULT_SCHEDULE_NAME,
	code: BNPI_DEFAULT_SCHEDULE_CODE,
	isOvernight: false,
	isOff: false,
	shiftHour: 8,
	timeSlots: BNPI_DEFAULT_WORK_SLOTS,
};

const BNPI_DEFAULT_REST_SHIFT_SNAPSHOT = {
	name: "Rest Day",
	code: "REST",
	isOvernight: false,
	isOff: true,
	shiftHour: 0,
	timeSlots: [],
};

const buildBnpiDefaultSchedulePattern = (shiftTypeId?: string | null) =>
	Array.from({ length: 7 }, (_, index) => {
		const day = index + 1;
		const isWorkday = day <= 5;

		return {
			day,
			shiftTypeId: isWorkday && shiftTypeId ? shiftTypeId : null,
			shiftSnapshot: isWorkday
				? BNPI_DEFAULT_WORK_SHIFT_SNAPSHOT
				: BNPI_DEFAULT_REST_SHIFT_SNAPSHOT,
			shiftHour: isWorkday ? 8 : 0,
		};
	});

export interface EmployeeImportRow {
	// Required
	EMP_ID: string;
	NAME: string; // Full name (will be parsed to first/middle/last)
	POSITION: string;
	LEVEL?: string;
	DEPARTMENT: string;
	SECTION?: string;
	TIN: string;
	SSS: string;
	PHILHEALTH: string;
	PAGIBIG: string;
	BASIC_SALARY: string;
	// Optional - Hire Date (now optional, will default to current date if not provided)
	HIRE_DATE?: string;
	// Optional Person Info
	EMAIL?: string;
	PHONE?: string;
	BIRTHDAY?: string;
	GENDER?: string;
	NATIONALITY?: string;
	PLACE_OF_BIRTH?: string;
	// Optional Device
	DEVICE_ID?: string;
	// Optional Address
	STREET?: string;
	CITY?: string;
	STATE?: string;
	COUNTRY?: string;
	POSTAL_CODE?: string;
	// Optional Employment
	ROLE?: string; // Role name (e.g., "HRIS-EMPLOYEE", "HRIS-EMPLOYEE-MANAGER")
	START_DATE?: string;
	END_DATE?: string;
	WORK_LOCATION?: string;
	REPORT_TO_EMP_ID?: string;
	CURRENCY?: string;
	PAY_FREQUENCY?: string;
	WORKFORCE_SOURCE?: string;
	AGENCY_CODE?: string;
	PREVIOUS_EMPLOYER?: string;
	CIVIL_STATUS?: string;
	NO_OF_DEPENDENTS?: string;
	DATE_OF_RESIGNATION?: string;
	SOURCE_STATUS?: string;
	DM3_IMPORT_WORKBOOK?: string;
	SOURCE_WORKBOOK?: string;
	SOURCE_SHEET?: string;
	SOURCE_ROW?: string;
	// Optional Schedule
	SCHEDULE?: string; // Explicit schedule template name/code only; blank stays unscheduled.
}

export class EmployeeImportHelper {
	private prisma: PrismaClient;
	private organizationId: string;
	private departmentCache = new Map<string, string>();
	private departmentHrCache = new Map<string, boolean>();
	private departmentScheduleCache = new Map<string, any>();
	private positionCache = new Map<string, string>();
	private levelCache = new Map<string, string>();
	private levelManagerCache = new Map<string, boolean>();
	private sectionCache = new Map<string, string>();
	private sectionHrCache = new Map<string, boolean>();
	private ambiguousSectionKeys = new Set<string>();
	private employeeCache = new Map<string, string>();
	private scheduleCache = new Map<string, any>(); // Stores full schedule objects
	private agencyCache = new Map<string, { id: string; name: string; code: string }>();
	private authRoleIdCache = new Map<string, string>();
	private bnpiDefaultScheduleTemplateEnsured = false;

	constructor(prisma: PrismaClient, organizationId: string) {
		this.prisma = prisma;
		this.organizationId = organizationId;
	}

	private buildAuthServiceUrl(endpoint: string): string {
		return `${config.authBaseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
	}

	private extractRoleDocuments(result: any): any[] {
		if (Array.isArray(result?.data?.documents)) return result.data.documents;
		if (Array.isArray(result?.data?.roles)) return result.data.roles;
		if (Array.isArray(result?.data)) return result.data;
		if (Array.isArray(result?.roles)) return result.roles;
		if (Array.isArray(result?.documents)) return result.documents;
		return [];
	}

	private async loadAuthRoleCache(authToken: string): Promise<void> {
		const response = await fetch(this.buildAuthServiceUrl("/api/role?document=true&limit=200"), {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${authToken}`,
			},
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`List auth roles failed: ${response.status} ${text}`);
		}

		const result = await response.json();
		const roles = this.extractRoleDocuments(result);

		this.authRoleIdCache.clear();
		roles.forEach((role: any) => {
			const roleName = typeof role?.name === "string" ? role.name.trim().toLowerCase() : "";
			const roleId =
				typeof role?.id === "string"
					? role.id
					: typeof role?._id === "string"
						? role._id
						: "";
			if (roleName && roleId) {
				this.authRoleIdCache.set(roleName, roleId);
			}
		});
	}

	getRoleId(roleName?: string): string {
		if (!roleName) {
			throw new Error("Derived role is required for auth role resolution");
		}
		const normalized = roleName.toLowerCase().trim();
		const roleId = this.authRoleIdCache.get(normalized);
		if (!roleId) {
			throw new Error(`Auth role "${roleName}" not found in live auth role list`);
		}
		return roleId;
	}

	private isHrDepartment(departmentName?: string): boolean {
		if (!departmentName || typeof departmentName !== "string") return false;
		return (
			this.departmentHrCache.get(departmentName) ||
			this.departmentHrCache.get(departmentName.toLowerCase()) ||
			false
		);
	}

	private isHrSection(sectionNameOrCode?: string, departmentNameOrCode?: string): boolean {
		if (!sectionNameOrCode || typeof sectionNameOrCode !== "string") return false;

		const normalizedSection = sectionNameOrCode.trim().toLowerCase();
		const normalizedDepartment =
			typeof departmentNameOrCode === "string" ? departmentNameOrCode.trim().toLowerCase() : "";

		if (normalizedDepartment) {
			const scoped = this.sectionHrCache.get(`${normalizedDepartment}::${normalizedSection}`);
			if (scoped !== undefined) return scoped;

			const departmentId = this.getDepartmentId(departmentNameOrCode || "");
			if (departmentId) {
				const scopedByDepartmentId = this.sectionHrCache.get(
					`${departmentId.toLowerCase()}::${normalizedSection}`,
				);
				if (scopedByDepartmentId !== undefined) return scopedByDepartmentId;
			}
		}

		return this.sectionHrCache.get(normalizedSection) || false;
	}

	private isManagerLevel(levelName?: string): boolean {
		if (!levelName || typeof levelName !== "string") return false;
		return (
			this.levelManagerCache.get(levelName) ||
			this.levelManagerCache.get(levelName.toLowerCase()) ||
			false
		);
	}

	resolveDerivedRoleFlags(
		departmentName?: string,
		levelName?: string,
		sectionNameOrCode?: string,
	): DerivedRoleFlags {
		return deriveRoleAndFlags({
			department: {
				isHr:
					this.isHrDepartment(departmentName) ||
					this.isHrSection(sectionNameOrCode, departmentName),
				name: departmentName,
			},
			level: {
				isManager: this.isManagerLevel(levelName),
				name: levelName,
			},
		});
	}

	resolveRoleName(
		_roleName?: string,
		departmentName?: string,
		levelName?: string,
		sectionNameOrCode?: string,
	): string {
		return this.resolveDerivedRoleFlags(departmentName, levelName, sectionNameOrCode).role;
	}

	async loadCaches(authToken?: string): Promise<void> {
		const [departments, sections, positions, levels, employees, schedules, agencies] =
			await Promise.all([
			this.prisma.department.findMany({
				where: { organizationId: this.organizationId },
				select: {
					id: true,
					code: true,
					name: true,
					isHr: true,
					scheduleTemplates: {
						where: { isActive: true, isDeleted: false },
						take: 1,
						select: {
							scheduleTemplate: {
								select: {
									id: true,
									name: true,
									code: true,
									cycleDays: true,
									graceLateMinutes: true,
									graceEarlyOutMinutes: true,
									pattern: true,
								},
							},
						},
					},
				},
			}),
			this.prisma.section.findMany({
				where: { organizationId: this.organizationId, isDeleted: false },
				select: {
					id: true,
					name: true,
					code: true,
					isHr: true,
					departmentId: true,
					department: {
						select: {
							id: true,
							name: true,
							code: true,
						},
					},
				},
			}),
			this.prisma.position.findMany({
				select: { id: true, title: true },
			}),
			this.prisma.level.findMany({
				select: { id: true, name: true, isManager: true },
			}),
			this.prisma.employee.findMany({
				where: { organizationId: this.organizationId },
				select: { id: true, employeeId: true },
			}),
			this.prisma.scheduleTemplate.findMany({
				where: { organizationId: this.organizationId, isDeleted: false },
				select: {
					id: true,
					name: true,
					code: true,
					cycleDays: true,
					graceLateMinutes: true,
					graceEarlyOutMinutes: true,
					pattern: true,
				},
			}),
			this.prisma.agency.findMany({
				where: { organizationId: this.organizationId, isDeleted: false },
				select: {
					id: true,
					name: true,
					code: true,
				},
			}),
		]);

		departments.forEach((d) => {
			this.departmentCache.set(d.name, d.id);
			this.departmentCache.set(d.name.toLowerCase(), d.id);
			this.departmentCache.set(d.id, d.id);
			this.departmentHrCache.set(d.name, Boolean(d.isHr));
			this.departmentHrCache.set(d.name.toLowerCase(), Boolean(d.isHr));
			this.departmentHrCache.set(d.id, Boolean(d.isHr));
			const deptTemplate = d.scheduleTemplates?.[0]?.scheduleTemplate;
			if (deptTemplate) {
				this.departmentScheduleCache.set(d.name, deptTemplate);
				this.departmentScheduleCache.set(d.name.toLowerCase(), deptTemplate);
				this.departmentScheduleCache.set(d.id, deptTemplate);
			}
		});
		positions.forEach((p) => {
			// Store by exact title
			this.positionCache.set(p.title, p.id);
			// Store by lowercase title for case-insensitive lookup
			this.positionCache.set(p.title.toLowerCase(), p.id);
			// Store by ID
			this.positionCache.set(p.id, p.id);
		});
		levels.forEach((l) => {
			// Store by exact name
			this.levelCache.set(l.name, l.id);
			// Store by lowercase name for case-insensitive lookup
			this.levelCache.set(l.name.toLowerCase(), l.id);
			// Store by ID
			this.levelCache.set(l.id, l.id);
			this.levelManagerCache.set(l.name, Boolean(l.isManager));
			this.levelManagerCache.set(l.name.toLowerCase(), Boolean(l.isManager));
			this.levelManagerCache.set(l.id, Boolean(l.isManager));
		});
		const sectionNameCounts = new Map<string, number>();
		sections.forEach((section) => {
			const nameKey = section.name?.trim().toLowerCase();
			if (nameKey) {
				sectionNameCounts.set(nameKey, (sectionNameCounts.get(nameKey) || 0) + 1);
			}
		});
		sections.forEach((section) => {
			const name = section.name?.trim();
			const code = section.code?.trim();
			const departmentName = section.department?.name?.trim();
			const departmentCode = section.department?.code?.trim();
			const keys = [
				section.id,
				code,
				name,
				departmentName && name ? `${departmentName}::${name}` : "",
				departmentCode && name ? `${departmentCode}::${name}` : "",
				departmentName && code ? `${departmentName}::${code}` : "",
				departmentCode && code ? `${departmentCode}::${code}` : "",
				section.departmentId && name ? `${section.departmentId}::${name}` : "",
				section.departmentId && code ? `${section.departmentId}::${code}` : "",
			]
				.filter(Boolean)
				.map((key) => String(key).toLowerCase());

			keys.forEach((key) => this.sectionCache.set(key, section.id));
			keys.forEach((key) => this.sectionHrCache.set(key, Boolean(section.isHr)));

			const nameKey = name?.toLowerCase();
			if (nameKey && (sectionNameCounts.get(nameKey) || 0) > 1) {
				this.ambiguousSectionKeys.add(nameKey);
			}
		});
		employees.forEach((e) => {
			this.employeeCache.set(e.employeeId, e.id);
		});
		schedules.forEach((s) => {
			// Store full schedule object by name and code
			this.scheduleCache.set(s.name, s);
			this.scheduleCache.set(s.code, s);
		});
		agencies.forEach((agency) => {
			this.agencyCache.set(agency.id, agency);
			this.agencyCache.set(agency.code, agency);
			this.agencyCache.set(agency.code.toLowerCase(), agency);
			this.agencyCache.set(agency.name, agency);
			this.agencyCache.set(agency.name.toLowerCase(), agency);
		});

		if (config.idpEnabled && authToken) {
			await this.loadAuthRoleCache(authToken);
		}
	}

	async ensureBnpiDefaultScheduleTemplate(): Promise<any> {
		if (this.bnpiDefaultScheduleTemplateEnsured) {
			return (
				this.scheduleCache.get(BNPI_DEFAULT_SCHEDULE_CODE) ||
				this.scheduleCache.get(BNPI_DEFAULT_SCHEDULE_CODE.toLowerCase())
			);
		}

		const shiftType = await this.prisma.shiftType.upsert({
			where: {
				organizationId_code: {
					organizationId: this.organizationId,
					code: BNPI_DEFAULT_SCHEDULE_CODE,
				},
			},
			update: {
				name: BNPI_DEFAULT_SCHEDULE_NAME,
				isOvernight: false,
				isOff: false,
				timeSlots: BNPI_DEFAULT_WORK_SLOTS,
				shiftHour: 8,
				isActive: true,
				isDeleted: false,
			},
			create: {
				organizationId: this.organizationId,
				name: BNPI_DEFAULT_SCHEDULE_NAME,
				code: BNPI_DEFAULT_SCHEDULE_CODE,
				isOvernight: false,
				isOff: false,
				timeSlots: BNPI_DEFAULT_WORK_SLOTS,
				shiftHour: 8,
				isActive: true,
				isDeleted: false,
			},
		});

		const description =
			"Temporary BNPI 2026 migration schedule: Mon-Fri 08:00-17:00 with 12:00-13:00 unpaid break.";
		const scheduleTemplate = await this.prisma.scheduleTemplate.upsert({
			where: {
				organizationId_code: {
					organizationId: this.organizationId,
					code: BNPI_DEFAULT_SCHEDULE_CODE,
				},
			},
			update: {
				name: BNPI_DEFAULT_SCHEDULE_NAME,
				description,
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern: buildBnpiDefaultSchedulePattern(shiftType.id),
				totalHour: 40,
				totalDay: 5,
				isActive: true,
				isDeleted: false,
			},
			create: {
				organizationId: this.organizationId,
				name: BNPI_DEFAULT_SCHEDULE_NAME,
				code: BNPI_DEFAULT_SCHEDULE_CODE,
				description,
				cycleDays: 7,
				graceLateMinutes: 0,
				graceEarlyOutMinutes: 0,
				pattern: buildBnpiDefaultSchedulePattern(shiftType.id),
				totalHour: 40,
				totalDay: 5,
				isActive: true,
				isDeleted: false,
			},
		});

		this.scheduleCache.set(scheduleTemplate.name, scheduleTemplate);
		this.scheduleCache.set(scheduleTemplate.name.toLowerCase(), scheduleTemplate);
		this.scheduleCache.set(scheduleTemplate.code, scheduleTemplate);
		this.scheduleCache.set(scheduleTemplate.code.toLowerCase(), scheduleTemplate);
		this.bnpiDefaultScheduleTemplateEnsured = true;

		return scheduleTemplate;
	}

	async ensureResources(row: EmployeeImportRow): Promise<void> {
		// Department
		if (row.DEPARTMENT && !this.getDepartmentId(row.DEPARTMENT)) {
			try {
				const newDept = await this.prisma.department.create({
					data: {
						name: row.DEPARTMENT,
						organizationId: this.organizationId,
						code: row.DEPARTMENT.toUpperCase()
							.replace(/[^A-Z0-9]/g, "")
							.slice(0, 10),
					},
				});
				this.departmentCache.set(newDept.name, newDept.id);
				this.departmentCache.set(newDept.name.toLowerCase(), newDept.id);
				this.departmentCache.set(newDept.id, newDept.id);
			} catch (e) {
				console.error(`Failed to auto-create department ${row.DEPARTMENT}`, e);
			}
		}

		// Position
		if (row.POSITION && !this.getPositionId(row.POSITION)) {
			try {
				const newPos = await this.prisma.position.create({
					data: {
						title: row.POSITION,
						code: row.POSITION.toUpperCase()
							.replace(/[^A-Z0-9]/g, "")
							.slice(0, 10),
						organizationId: this.organizationId,
					},
				});
				this.positionCache.set(newPos.title, newPos.id);
				this.positionCache.set(newPos.title.toLowerCase(), newPos.id);
				this.positionCache.set(newPos.id, newPos.id);
			} catch (e) {
				console.error(`Failed to auto-create position ${row.POSITION}`, e);
			}
		}

		// Level
		if (row.LEVEL && !this.getLevelId(row.LEVEL)) {
			try {
				const newLevel = await this.prisma.level.create({
					data: {
						name: row.LEVEL,
						organizationId: this.organizationId,
						rank: 1, // Default rank
					},
				});
				this.levelCache.set(newLevel.name, newLevel.id);
				this.levelCache.set(newLevel.name.toLowerCase(), newLevel.id);
				this.levelCache.set(newLevel.id, newLevel.id);
			} catch (e) {
				console.error(`Failed to auto-create level ${row.LEVEL}`, e);
			}
		}

		// Agency records are not auto-created in import flow.
		// Missing agency mappings are handled as fallback-to-DIRECT in mapRowToEmployeeData.
	}

	private parseDate(value?: any): Date | undefined {
		if (!value) return undefined;

		// If already a Date
		if (value instanceof Date) return value;

		// If Excel number (CSV parser does this)
		if (typeof value === "number") {
			return new Date(Math.round((value - 25569) * 86400 * 1000));
		}

		// If string like "1/15/2025"
		if (typeof value === "string") {
			const normalized = value.trim();
			if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
				const parsed = new Date(`${normalized}T00:00:00.000Z`);
				return Number.isNaN(parsed.getTime()) ? undefined : parsed;
			}

			const [m, d, y] = normalized.split("/");
			if (m && d && y) {
				const rawYear = Number(y);
				const fullYear =
					y.length === 2 ? (rawYear <= 30 ? 2000 + rawYear : 1900 + rawYear) : rawYear;
				return new Date(fullYear, Number(m) - 1, Number(d));
			}

			const parsed = new Date(normalized);
			if (!Number.isNaN(parsed.getTime())) return parsed;
		}

		return undefined;
	}

	/**
	 * Normalize gender value to match GenderType enum
	 * Valid values: male, female, other, prefer_not_to_say, unknown, not_applicable
	 */
	private normalizeGender(gender?: string): string | undefined {
		if (!gender || typeof gender !== "string") return undefined;

		const normalized = gender.trim().toLowerCase();

		// Map common variations to valid GenderType values
		const genderMap: Record<string, string> = {
			male: "male",
			m: "male",
			female: "female",
			f: "female",
			other: "other",
			prefer_not_to_say: "prefer_not_to_say",
			"prefer not to say": "prefer_not_to_say",
			unknown: "unknown",
			not_applicable: "not_applicable",
			"n/a": "not_applicable",
			na: "not_applicable",
		};

		return genderMap[normalized] || undefined;
	}

	// Public getters for external use
	public getDepartmentId(name: string): string | undefined {
		if (!name || typeof name !== "string") return undefined;

		// Try exact match first
		let id = this.departmentCache.get(name);
		if (id) return id;

		// Try case-insensitive match
		id = this.departmentCache.get(name.toLowerCase());
		if (id) return id;

		// Try trimmed version
		id = this.departmentCache.get(name.trim());
		if (id) return id;

		// Try trimmed and lowercase
		return this.departmentCache.get(name.trim().toLowerCase());
	}

	public getPositionId(title: string): string | undefined {
		if (!title || typeof title !== "string") return undefined;

		// Try exact match first
		let id = this.positionCache.get(title);
		if (id) return id;

		// Try case-insensitive match
		id = this.positionCache.get(title.toLowerCase());
		if (id) return id;

		// Try trimmed version
		id = this.positionCache.get(title.trim());
		if (id) return id;

		// Try trimmed and lowercase
		return this.positionCache.get(title.trim().toLowerCase());
	}

	public getLevelId(name: string): string | undefined {
		if (!name || typeof name !== "string") return undefined;

		// Try exact match first
		let id = this.levelCache.get(name);
		if (id) return id;

		// Try case-insensitive match
		id = this.levelCache.get(name.toLowerCase());
		if (id) return id;

		// Try trimmed version
		id = this.levelCache.get(name.trim());
		if (id) return id;

		// Try trimmed and lowercase
		return this.levelCache.get(name.trim().toLowerCase());
	}

	public getSectionId(sectionNameOrCode?: string, departmentNameOrCode?: string): string | undefined {
		if (!sectionNameOrCode || typeof sectionNameOrCode !== "string") return undefined;

		const normalizedSection = sectionNameOrCode.trim().toLowerCase();
		const normalizedDepartment =
			typeof departmentNameOrCode === "string" ? departmentNameOrCode.trim().toLowerCase() : "";

		if (normalizedDepartment) {
			const scopedId = this.sectionCache.get(`${normalizedDepartment}::${normalizedSection}`);
			if (scopedId) return scopedId;

			const departmentId = this.getDepartmentId(departmentNameOrCode || "");
			if (departmentId) {
				const scopedByDepartmentId = this.sectionCache.get(
					`${departmentId.toLowerCase()}::${normalizedSection}`,
				);
				if (scopedByDepartmentId) return scopedByDepartmentId;
			}
		}

		if (this.ambiguousSectionKeys.has(normalizedSection)) return undefined;
		return this.sectionCache.get(normalizedSection);
	}

	public getReportToId(empId: string): string | undefined {
		return this.employeeCache.get(empId);
	}

	/**
	 * Add employee to cache after creation (so later rows in same batch can reference it)
	 */
	public addEmployeeToCache(employeeId: string, dbId: string): void {
		this.employeeCache.set(employeeId, dbId);
	}

	public getSchedule(nameOrCode: string): any | undefined {
		return this.scheduleCache.get(nameOrCode);
	}

	public createEmbeddedScheduleFromDepartment(
		departmentNameOrId?: string,
		effectiveStartDate?: Date | null,
	): any | null {
		if (!departmentNameOrId || typeof departmentNameOrId !== "string") return null;
		const template =
			this.departmentScheduleCache.get(departmentNameOrId) ||
			this.departmentScheduleCache.get(departmentNameOrId.toLowerCase());
		if (!template) return null;
		return copyTemplateToEmployeeEmbeddedSchedule({
			template,
			assignedByEmployeeId: null,
			effectiveStartDate: effectiveStartDate || new Date(),
			reason: "employee_import_department_default",
		});
	}

	private resolveAgency(row: EmployeeImportRow):
		| {
				id: string;
				name: string;
				code: string;
		  }
		| undefined {
		const code = String(row.AGENCY_CODE || "")
			.trim()
			.toUpperCase();

		return (
			(code && this.agencyCache.get(code)) ||
			(code && this.agencyCache.get(code.toLowerCase())) ||
			undefined
		);
	}

	public createEmbeddedScheduleFromTemplate(
		scheduleNameOrCode?: string,
		effectiveStartDate?: Date | null,
	): any | null {
		if (!scheduleNameOrCode) return null;

		const scheduleTemplate = this.getSchedule(scheduleNameOrCode);
		if (!scheduleTemplate) {
			console.warn(`Schedule template "${scheduleNameOrCode}" not found; leaving schedule blank`);
			return null;
		}

		return copyTemplateToEmployeeEmbeddedSchedule({
			template: scheduleTemplate,
			assignedByEmployeeId: null,
			effectiveStartDate: effectiveStartDate || new Date(),
			reason: "employee_import",
		});
	}

	private parseName(fullName: string): {
		firstName: string;
		middleName?: string;
		lastName: string;
	} {
		const trimmed = fullName.trim();

		// Check if name contains comma (format: "LASTNAME, FIRSTNAME MIDDLEINITIAL")
		if (trimmed.includes(",")) {
			const [lastNamePart, firstNamePart] = trimmed.split(",").map((s) => s.trim());

			// Parse first name part (may include middle name/initial)
			const firstNameParts = firstNamePart.split(/\s+/);

			if (firstNameParts.length === 1) {
				// Only first name
				return {
					firstName: firstNameParts[0],
					lastName: lastNamePart,
				};
			} else {
				// First name + middle name/initial
				const firstName = firstNameParts[0];
				const middleName = firstNameParts.slice(1).join(" ");
				return {
					firstName,
					middleName: middleName || undefined,
					lastName: lastNamePart,
				};
			}
		}

		// Fallback: No comma, split by whitespace (format: "FIRSTNAME MIDDLENAME LASTNAME")
		const parts = trimmed.split(/\s+/);
		if (parts.length === 1) {
			return { firstName: parts[0], lastName: parts[0] };
		} else if (parts.length === 2) {
			return { firstName: parts[0], lastName: parts[1] };
		} else {
			// 3 or more parts: first, middle(s), last
			const firstName = parts[0];
			const lastName = parts[parts.length - 1];
			const middleName = parts.slice(1, -1).join(" ");
			return { firstName, middleName: middleName || undefined, lastName };
		}
	}

	mapRowToEmployeeData(row: EmployeeImportRow) {
		const departmentId = this.getDepartmentId(row.DEPARTMENT);
		const positionId = this.getPositionId(row.POSITION);
		const hasLevelValue = typeof row.LEVEL === "string" && row.LEVEL.trim().length > 0;
		const levelId = hasLevelValue ? this.getLevelId(row.LEVEL || "") : null;
		const sectionId = this.getSectionId(row.SECTION, row.DEPARTMENT);
		// REPORT_TO_EMP_ID is optional: leave null if missing or if supervisor not found yet (e.g. same CSV, manager row later)
		const reportToIdRaw =
			typeof row.REPORT_TO_EMP_ID === "string"
				? row.REPORT_TO_EMP_ID.trim()
				: row.REPORT_TO_EMP_ID;
		const reportToId =
			reportToIdRaw && String(reportToIdRaw).length > 0
				? (this.getReportToId(String(reportToIdRaw)) ?? null)
				: null;

		if (!departmentId) throw new Error(`Department not found: ${row.DEPARTMENT}`);
		if (!positionId) throw new Error(`Position not found: ${row.POSITION}`);
		if (hasLevelValue && !levelId) throw new Error(`Level not found: ${row.LEVEL}`);

		// Parse hire date - use current date if not provided (now optional)
		const hireDate = this.parseDate(row.HIRE_DATE) || new Date();

		// Parse full name
		const { firstName, middleName, lastName } = this.parseName(row.NAME);

		const scheduleStartDate = this.parseDate(row.START_DATE) || hireDate;
		const dateOfResignation = this.parseDate(row.DATE_OF_RESIGNATION);
		const rawSchedule = typeof row.SCHEDULE === "string" ? row.SCHEDULE.trim() : row.SCHEDULE;
		const importedEmbeddedSchedule = rawSchedule
			? this.createEmbeddedScheduleFromTemplate(rawSchedule, scheduleStartDate)
			: null;
		const sourceWorkbook =
			typeof row.SOURCE_WORKBOOK === "string" && row.SOURCE_WORKBOOK.trim()
				? row.SOURCE_WORKBOOK.trim()
				: "docs/BNPI_MASTERLIST.xlsx";

		const workforceSource = String(row.WORKFORCE_SOURCE || "DIRECT")
			.trim()
			.toUpperCase();
		const resolvedAgency = this.resolveAgency(row);
		const requestedAgency = workforceSource === "AGENCY";
		const normalizedAgencyCode = String(row.AGENCY_CODE || "")
			.trim()
			.toUpperCase();
		const fallbackToDirect = requestedAgency && !resolvedAgency;
		const resolvedWorkforceSource = fallbackToDirect ? "DIRECT" : workforceSource === "AGENCY" ? "AGENCY" : "DIRECT";
		const warnings: string[] = [];
		if (fallbackToDirect) {
			const reference = normalizedAgencyCode || "unknown agency";
			warnings.push(
				`Agency "${reference}" not found. Workforce source was set to DIRECT for this row.`,
			);
		}
		if (row.SECTION && !sectionId) {
			warnings.push(
				`Section "${row.SECTION}" could not be resolved for department "${row.DEPARTMENT}". Section was left blank and source value was kept in metadata.`,
			);
		}

		return {
			employee: {
				organizationId: this.organizationId,
				employeeId: row.EMP_ID,
				employmentHireDate: hireDate,
				employmentStartDate: this.parseDate(row.START_DATE),
				employmentTerminationDate: this.parseDate(row.END_DATE),
				employmentStatus: "ACTIVE" as any,
				employmentType: "PROBATIONARY" as any,
				employmentHistory: [],
				workforceSource: resolvedWorkforceSource as any,
				agencyId: resolvedWorkforceSource === "AGENCY" ? resolvedAgency?.id : undefined,
				employer:
					resolvedWorkforceSource === "AGENCY" && resolvedAgency
						? {
								name: resolvedAgency.name,
								tin: "",
								rdoCode: "",
								branchCode: "",
								address: "",
								isVerified: false,
								metadata: {
									source: "agency",
									agencyId: resolvedAgency.id,
									agencyCode: resolvedAgency.code,
								},
							}
						: undefined,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				embeddedSchedule: importedEmbeddedSchedule || undefined,
				workLocation: (row.WORK_LOCATION || "ONSITE") as any,
				basicSalary: parseFloat(row.BASIC_SALARY),
				currency: row.CURRENCY || "PHP",
				payFrequency: (row.PAY_FREQUENCY || "MONTHLY") as any,
				deviceEmpId: row.DEVICE_ID || undefined,
				metadata: {
					importSource: "employee_import",
					sourceOfTruth: {
						stage: "DM3",
						step: "DM3.1 Employees",
						importWorkbook: row.DM3_IMPORT_WORKBOOK || null,
						employeeMaster: {
							sourceWorkbook,
							sourceSheet: row.SOURCE_SHEET || "Manpower Databank",
							sourceRow: row.SOURCE_ROW || null,
						},
						basicSalary: {
							sourceWorkbook: "docs/HRIS Payroll Computation April 26 - May 10, 2026.xlsx",
							sourceSheet: "Basic Salary",
							sourceField: "Basic Salary",
						},
					},
					scheduleImport: {
						source: rawSchedule
							? "explicit_schedule_column"
							: "dm3_employee_master_empty",
						rawSchedule: rawSchedule || null,
						appliedScheduleCode: importedEmbeddedSchedule?.templateCode || null,
					},
					manpowerDatabank: {
						sourceWorkbook,
						sourceSheet: row.SOURCE_SHEET || "Manpower Databank",
						sourceRow: row.SOURCE_ROW || null,
						sectionResolved: row.SECTION ? Boolean(sectionId) : null,
						previousEmployer: row.PREVIOUS_EMPLOYER || null,
						civilStatus: row.CIVIL_STATUS || null,
						numberOfDependents: row.NO_OF_DEPENDENTS || null,
						sourceStatus: row.SOURCE_STATUS || null,
						dateOfResignation: dateOfResignation?.toISOString() || null,
						tinFormattedWithoutBranchCode: row.TIN ? true : null,
					},
				},
			},
			person: {
				organizationId: this.organizationId,
				personalInfo: {
					firstName,
					middleName,
					lastName,
					dateOfBirth: this.parseDate(row.BIRTHDAY),
					placeOfBirth: row.PLACE_OF_BIRTH,
					nationality: row.NATIONALITY,
					gender: this.normalizeGender(row.GENDER) as any,
				},
				contactInfo: {
					email: row.EMAIL,
					phones: row.PHONE
						? [
								{
									type: "mobile" as const,
									countryCode: "+63",
									number: String(row.PHONE),
									isPrimary: true,
								},
							]
						: [],
					address:
						row.STREET || row.CITY
							? [
									{
										street: row.STREET,
										city: row.CITY,
										state: row.STATE,
										country: row.COUNTRY,
										postalCode: row.POSTAL_CODE,
									},
								]
							: [],
				},
				identification: {
					type: row.TIN ? "tin" : undefined,
					number: row.TIN || undefined,
					issuingCountry: "Philippines",
					statutoryIds: {
						tin: row.TIN || null,
						sss: row.SSS || null,
						philhealth: row.PHILHEALTH || null,
						pagibig: row.PAGIBIG || null,
					},
				},
				metadata: {
					statutoryIds: {
						tin: row.TIN || null,
						sss: row.SSS || null,
						philhealth: row.PHILHEALTH || null,
						pagibig: row.PAGIBIG || null,
					},
					sourceOfTruth: {
						stage: "DM3",
						step: "DM3.1 Employees",
						sourceWorkbook,
						sourceSheet: row.SOURCE_SHEET || "Manpower Databank",
						sourceRow: row.SOURCE_ROW || null,
					},
				},
			},
			warnings,
		};
	}
}

