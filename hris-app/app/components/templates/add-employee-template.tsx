import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/atoms/Button";
import { JourneyTimeline } from "~/components/molecules/shared/JourneyTimeline";
import { PersonalDetailsForm } from "~/components/molecules/shared/PersonalDetailsForm";
import { EmployeeDetailsForm } from "~/components/molecules/shared/EmployeeDetailsForm";
import { EmployeePreviewForm } from "~/components/molecules/shared/EmployeePreviewForm";
import {
	useCreateEmployeeWithAccount,
	useUpdateEmployeeWithAccount,
	useEmployee,
} from "~/lib/hooks/useEmployees";
import { useAuth } from "~/lib/hooks/useAuth";
import { useRoles } from "~/lib/hooks/useRoles";
import {
	CheckCircle2,
	ArrowLeft,
	Clock,
	UserCheck,
	Users,
	Briefcase,
	UserCog,
	Search,
	DollarSign,
	FileText,
	ArrowRight,
	Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { usePositions } from "~/lib/hooks/usePositions";
import { useWorkSchedules } from "~/lib/hooks/useWorkSchedules";

export type SectionStatus = "not-started" | "in-progress" | "completed";

export interface FormData {
	user: {
		email: string;
		userName: string;
		password: string;
		avatar?: string;
		status: "active" | "inactive";
		loginMethod: "email" | "username";
		roleId: string;
		organizationId: string;
	};
	person: {
		organizationId: string;
		personalInfo: {
			prefix?: string;
			firstName: string;
			middleName?: string;
			lastName: string;
			dateOfBirth: string;
			placeOfBirth?: string;
			age?: number;
			nationality?: string;
			primaryLanguage?: string;
			gender?:
				| "male"
				| "female"
				| "other"
				| "prefer_not_to_say"
				| "unknown"
				| "not_applicable";
			currency?: string;
			vipCode?: string;
		};
		contactInfo: {
			email: string;
			phones: Array<{
				type: "mobile" | "home" | "work" | "emergency" | "fax" | "pager" | "main" | "other";
				countryCode: string;
				number: string;
				isPrimary: boolean;
			}>;
			fax?: string;
			address: Array<{
				street: string;
				address2?: string;
				city: string;
				state: string;
				country: string;
				postalCode: string;
				zipCode: string;
				houseNumber: string;
			}>;
		};
		identification: {
			type:
				| "passport"
				| "drivers_license"
				| "national_id"
				| "postal_id"
				| "voters_id"
				| "senior_citizen_id"
				| "company_id"
				| "school_id";
			number: string;
			issuingCountry: string;
			expiryDate: string;
		};
	};
	employee: {
		organizationId: string;
		employeeId: string;
		employmentHireDate: string;
		employmentStartDate: string;
		employmentTerminationDate?: string | null;
		employmentStatus:
			| "ACTIVE"
			| "INACTIVE"
			| "TERMINATED"
			| "RESIGNED"
			| "RETIRED"
			| "ON_LEAVE";
		employmentType:
			| "REGULAR"
			| "PROBATIONARY"
			| "CONTRACTUAL"
			| "PART_TIME"
			| "CONSULTANT"
			| "INTERN";
		probationEndDate?: string;
		departmentId: string;
		positionId: string;
		defaultScheduleId: string;
		basicSalary: number;
		currency: string;
		payFrequency:
			| "DAILY"
			| "WEEKLY"
			| "BIWEEKLY"
			| "SEMI_MONTHLY"
			| "MONTHLY"
			| "QUARTERLY"
			| "ANNUALLY";
		documents: Array<{
			type: string;
			number: string;
			issueDate: string;
			expiryDate?: string | null;
		}>;
		leaveBalances?: Array<{
			leaveType:
				| "VACATION"
				| "SICK"
				| "PERSONAL"
				| "MATERNITY"
				| "PATERNITY"
				| "BEREAVEMENT"
				| "UNPAID"
				| "COMPENSATORY";
			totalEntitled: number;
			periodStart: string;
			periodEnd: string;
		}>;
		workLocation: "ONSITE" | "REMOTE" | "HYBRID";
		isManager: boolean;
		reportToId?: string | null;
	};
}

type SupportedEmploymentStatus = FormData["employee"]["employmentStatus"];

const SUPPORTED_EMPLOYMENT_STATUSES: readonly SupportedEmploymentStatus[] = [
	"ACTIVE",
	"INACTIVE",
	"TERMINATED",
	"RESIGNED",
	"RETIRED",
	"ON_LEAVE",
];

function normalizeEmploymentStatus(status?: string | null): SupportedEmploymentStatus {
	if (status && SUPPORTED_EMPLOYMENT_STATUSES.includes(status as SupportedEmploymentStatus)) {
		return status as SupportedEmploymentStatus;
	}

	return "ACTIVE";
}

export function AddEmployee() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const todayDate = new Date().toISOString().split("T")[0];
	// Get MongoDB _id (e.g., "690ac9737c4d2e503d8bab75"), not employeeId field (e.g., "EMP234")
	const employeeId = searchParams.get("id");
	const isEditMode = !!employeeId;

	// Get section from URL for deep linking, or use default
	const urlSection = searchParams.get("section");
	const defaultSection = isEditMode ? "personal-details" : "employee-type";

	// Valid sections based on mode
	const validSections = isEditMode
		? ["personal-details", "employee-details", "preview"]
		: ["employee-type", "personal-details", "employee-details", "preview"];

	// Use URL section if valid, otherwise use default
	const initialSection =
		urlSection && validSections.includes(urlSection) ? urlSection : defaultSection;

	const [activeSection, setActiveSection] = useState<string>(initialSection);
	const [sectionStatus, setSectionStatus] = useState<Record<string, SectionStatus>>({
		"employee-type": isEditMode ? "completed" : "in-progress",
		"personal-details": isEditMode ? "in-progress" : "not-started",
		"employee-details": "not-started",
		preview: "not-started",
	});
	const [selectedEmployeeType, setSelectedEmployeeType] = useState<"hr" | "employee" | null>(
		null,
	);
	const [selectedHRSubRole, setSelectedHRSubRole] = useState<string | null>(null);
	const [isManager, setIsManager] = useState<boolean>(false);
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");
	const [isPrefilling, setIsPrefilling] = useState<boolean>(false);

	// Hardcoded HR sub-roles
	const hrSubRoles = [
		{
			id: "recruitment",
			label: "Recruitment",
			icon: Search,
			description: "Hiring and talent acquisition",
		},
		{
			id: "payroll",
			label: "Payroll",
			icon: DollarSign,
			description: "Salary and compensation management",
		},
		{
			id: "benefits",
			label: "Benefits",
			icon: FileText,
			description: "Employee benefits administration",
		},
		{
			id: "training",
			label: "Training & Development",
			icon: Users,
			description: "Employee learning and growth",
		},
		{ id: "general", label: "General HR", icon: UserCog, description: "General HR operations" },
	];

	// React Query mutation for creating/updating employee
	const createEmployeeMutation = useCreateEmployeeWithAccount();
	const updateEmployeeMutation = useUpdateEmployeeWithAccount();

	// Fetch roles to get actual role IDs
	const { data: rolesData } = useRoles(true);
	const roles = rolesData?.data?.roles || [];

	// Fetch supporting lookups so the randomizer can pick valid IDs
	const { data: departmentsData } = useDepartments({ page: 1, limit: 1000 });
	const { data: positionsData } = usePositions({ page: 1, limit: 1000 });
	const { data: workSchedulesData } = useWorkSchedules(true);

	// Fetch employee data if in edit mode
	// Note: We might need to fetch with document=true to get full employee data including user info
	const { data: employeeData, isLoading: isLoadingEmployee } = useEmployee(employeeId || "");

	// Debug: Log when employeeData changes
	useEffect(() => {
		if (employeeData) {
			console.log("=== EMPLOYEE DATA RECEIVED ===");
			console.log("employeeData:", employeeData);
			console.log("employeeData type:", typeof employeeData);
			console.log("employeeData keys:", Object.keys(employeeData || {}));
		}
	}, [employeeData]);

	// Initialize React Hook Form with default values
	const form = useForm<FormData>({
		defaultValues: {
			person: {
				organizationId: user?.organizationId || "",
				personalInfo: {
					prefix: "",
					firstName: "",
					middleName: "",
					lastName: "",
					dateOfBirth: "",
					placeOfBirth: "",
					age: 0,
					nationality: "Filipino",
					primaryLanguage: "",
					gender: undefined,
					currency: "PHP",
					vipCode: "",
				},
				contactInfo: {
					email: "",
					phones: [{ type: "mobile", countryCode: "+63", number: "", isPrimary: true }],
					fax: "",
					address: [
						{
							street: "",
							address2: "",
							city: "",
							state: "",
							country: "Philippines",
							postalCode: "",
							zipCode: "",
							houseNumber: "",
						},
					],
				},
				identification: {
					type: undefined,
					number: "",
					issuingCountry: "Philippines",
					expiryDate: "",
				},
			},
			employee: {
				organizationId: user?.organizationId || "",
				employeeId: "",
				employmentHireDate: todayDate,
				employmentStartDate: todayDate,
				employmentTerminationDate: null,
				employmentStatus: "ACTIVE" as const,
				employmentType: "PROBATIONARY" as const,
				probationEndDate: "",
				departmentId: "",
				positionId: "",
				defaultScheduleId: "",
				basicSalary: 0,
				currency: "PHP",
				payFrequency: "SEMI_MONTHLY" as const,
				documents: [],
				leaveBalances: [],
				workLocation: "ONSITE" as const,
				isManager: false,
				reportToId: null,
			},
		},
		mode: "onChange",
	});

	// Populate form when employee data is loaded (edit mode)
	useEffect(() => {
		if (employeeData && isEditMode) {
			const data = employeeData;
			console.log("=== POPULATING FORM WITH EMPLOYEE DATA ===");
			console.log("Full employeeData:", data);
			console.log("Person data:", data.person);
			console.log("Employee fields:", {
				employeeId: data.employeeId,
				departmentId: data.departmentId,
				positionId: data.positionId,
				defaultScheduleId: data.defaultScheduleId,
				basicSalary: data.basicSalary,
				employmentHireDate: data.employmentHireDate,
			});

			// Prepare form data (user account fields are no longer required)
			// Try to get roleId from employee data or user metadata
			const existingRoleId = (data as any).roleId || (data as any).user?.roleId || "";

			const formData = {
				user: {
					email: data.person?.contactInfo?.email || "",
					userName: "",
					password: "",
					avatar: "",
					status: "inactive" as const,
					loginMethod: "email" as const,
					roleId: existingRoleId,
					organizationId: data.organizationId || user?.organizationId || "",
				},
				person: {
					organizationId: data.organizationId || user?.organizationId || "",
					personalInfo: {
						prefix: data.person?.personalInfo?.prefix || "",
						firstName: data.person?.personalInfo?.firstName || "",
						middleName: data.person?.personalInfo?.middleName || "",
						lastName: data.person?.personalInfo?.lastName || "",
						dateOfBirth: data.person?.personalInfo?.dateOfBirth
							? new Date(data.person.personalInfo.dateOfBirth)
									.toISOString()
									.split("T")[0]
							: "",
						placeOfBirth: data.person?.personalInfo?.placeOfBirth || "",
						age: data.person?.personalInfo?.age || 0,
						nationality: data.person?.personalInfo?.nationality || "Filipino",
						primaryLanguage: data.person?.personalInfo?.primaryLanguage || "",
						gender: data.person?.personalInfo?.gender || undefined,
						currency: data.person?.personalInfo?.currency || "PHP",
						vipCode: data.person?.personalInfo?.vipCode || "",
					},
					contactInfo: {
						email: data.person?.contactInfo?.email || "",
						phones:
							data.person?.contactInfo?.phones?.length > 0
								? data.person.contactInfo.phones.map((phone: any) => ({
										type: phone.type as
											| "mobile"
											| "home"
											| "work"
											| "emergency"
											| "fax"
											| "pager"
											| "main"
											| "other",
										countryCode: phone.countryCode,
										number: phone.number,
										isPrimary: phone.isPrimary,
									}))
								: [
										{
											type: "mobile" as const,
											countryCode: "+63",
											number: "",
											isPrimary: true,
										},
									],
						fax: data.person?.contactInfo?.fax || "",
						address:
							data.person?.contactInfo?.address?.length > 0
								? data.person.contactInfo.address
								: [
										{
											street: "",
											address2: "",
											city: "",
											state: "",
											country: "Philippines",
											postalCode: "",
											zipCode: "",
											houseNumber: "",
										},
									],
					},
					identification: {
						type: data.person?.identification?.type || undefined,
						number: data.person?.identification?.number || "",
						issuingCountry:
							data.person?.identification?.issuingCountry || "Philippines",
						expiryDate: data.person?.identification?.expiryDate
							? new Date(data.person.identification.expiryDate)
									.toISOString()
									.split("T")[0]
							: "",
					},
				},
				employee: {
					organizationId: data.organizationId || user?.organizationId || "",
					employeeId: data.employeeId || "",
					employmentHireDate: data.employmentHireDate
						? new Date(data.employmentHireDate).toISOString().split("T")[0]
						: "",
					employmentStartDate: data.employmentStartDate
						? new Date(data.employmentStartDate).toISOString().split("T")[0]
						: data.employmentHireDate
							? new Date(data.employmentHireDate).toISOString().split("T")[0]
							: "",
					employmentTerminationDate: data.employmentTerminationDate
						? new Date(data.employmentTerminationDate).toISOString().split("T")[0]
						: null,
					employmentStatus: normalizeEmploymentStatus(data.employmentStatus),
					employmentType: data.employmentType || ("PROBATIONARY" as const),
					probationEndDate: data.probationEndDate
						? new Date(data.probationEndDate).toISOString().split("T")[0]
						: "",
					departmentId: data.departmentId || "",
					positionId: data.positionId || "",
					defaultScheduleId: data.defaultScheduleId || "",
					basicSalary: data.basicSalary || 0,
					currency: data.currency || "PHP",
					payFrequency: data.payFrequency || ("MONTHLY" as const),
					documents: data.documents || [],
					leaveBalances: (data as any).leaveBalances
						? (data as any).leaveBalances.map((lb: any) => ({
								leaveType: lb.leaveType,
								totalEntitled: lb.totalEntitled || 0,
								periodStart: lb.periodStart
									? new Date(lb.periodStart).toISOString().split("T")[0]
									: "",
								periodEnd: lb.periodEnd
									? new Date(lb.periodEnd).toISOString().split("T")[0]
									: "",
							}))
						: [],
					workLocation: data.workLocation || ("ONSITE" as const),
					isManager: (data as any).isManager || false,
					reportToId: (data as any).reportToId || null,
				},
			};

			// Set selected role ID if available
			if (existingRoleId) {
				setSelectedRoleId(existingRoleId);
			}

			// Reset form with new values - this updates all form state
			form.reset(formData, {
				keepDefaultValues: false,
				keepErrors: false,
				keepDirty: false,
				keepIsSubmitted: false,
				keepTouched: false,
				keepIsValid: false,
				keepSubmitCount: false,
			});

			// Also set values individually to ensure they update in the UI
			// This is important for uncontrolled inputs
			// Note: User account fields are set to defaults since user account is no longer required
			const { setValue } = form;

			// Set person fields
			setValue("person.organizationId", formData.person.organizationId);
			setValue("person.personalInfo.firstName", formData.person.personalInfo.firstName, {
				shouldValidate: true,
			});
			setValue("person.personalInfo.lastName", formData.person.personalInfo.lastName, {
				shouldValidate: true,
			});
			setValue("person.personalInfo.middleName", formData.person.personalInfo.middleName);
			setValue("person.personalInfo.prefix", formData.person.personalInfo.prefix);
			setValue("person.personalInfo.dateOfBirth", formData.person.personalInfo.dateOfBirth, {
				shouldValidate: true,
			});
			setValue("person.personalInfo.placeOfBirth", formData.person.personalInfo.placeOfBirth);
			setValue("person.personalInfo.age", formData.person.personalInfo.age);
			setValue("person.personalInfo.nationality", formData.person.personalInfo.nationality);
			setValue(
				"person.personalInfo.primaryLanguage",
				formData.person.personalInfo.primaryLanguage,
			);
			setValue("person.personalInfo.gender", formData.person.personalInfo.gender);
			setValue("person.personalInfo.currency", formData.person.personalInfo.currency);
			setValue("person.personalInfo.vipCode", formData.person.personalInfo.vipCode);

			// Set contact info
			setValue("person.contactInfo.email", formData.person.contactInfo.email, {
				shouldValidate: true,
			});
			setValue("person.contactInfo.phones", formData.person.contactInfo.phones);
			setValue("person.contactInfo.fax", formData.person.contactInfo.fax);
			setValue("person.contactInfo.address", formData.person.contactInfo.address);

			// Set identification
			setValue("person.identification.type", formData.person.identification.type, {
				shouldValidate: true,
			});
			setValue("person.identification.number", formData.person.identification.number, {
				shouldValidate: true,
			});
			setValue(
				"person.identification.issuingCountry",
				formData.person.identification.issuingCountry,
				{ shouldValidate: true },
			);
			setValue(
				"person.identification.expiryDate",
				formData.person.identification.expiryDate,
				{ shouldValidate: true },
			);

			// Set employee fields
			setValue("employee.organizationId", formData.employee.organizationId);
			setValue("employee.employeeId", formData.employee.employeeId, { shouldValidate: true });
			setValue("employee.employmentHireDate", formData.employee.employmentHireDate, {
				shouldValidate: true,
			});
			setValue("employee.employmentStartDate", formData.employee.employmentStartDate, {
				shouldValidate: true,
			});
			setValue(
				"employee.employmentTerminationDate",
				formData.employee.employmentTerminationDate,
			);
			setValue("employee.employmentStatus", formData.employee.employmentStatus, {
				shouldValidate: true,
			});
			setValue("employee.employmentType", formData.employee.employmentType, {
				shouldValidate: true,
			});
			setValue("employee.probationEndDate", formData.employee.probationEndDate);
			setValue("employee.departmentId", formData.employee.departmentId, {
				shouldValidate: true,
			});
			setValue("employee.positionId", formData.employee.positionId, { shouldValidate: true });
			setValue("employee.defaultScheduleId", formData.employee.defaultScheduleId, {
				shouldValidate: true,
			});
			setValue("employee.basicSalary", formData.employee.basicSalary, {
				shouldValidate: true,
			});
			setValue("employee.currency", formData.employee.currency);
			setValue("employee.payFrequency", formData.employee.payFrequency, {
				shouldValidate: true,
			});
			setValue("employee.documents", formData.employee.documents as any);
			setValue("employee.leaveBalances", formData.employee.leaveBalances || [], {
				shouldDirty: false,
				shouldValidate: false,
			});
			setValue("employee.workLocation", formData.employee.workLocation, {
				shouldValidate: true,
			});
			setValue("employee.isManager", formData.employee.isManager);
			setValue("employee.reportToId", formData.employee.reportToId);

			// Mark all sections as in-progress in edit mode
			setSectionStatus({
				"personal-details": "in-progress",
				"employee-details": "in-progress",
				preview: "not-started",
			});

			// Trigger validation after a small delay to ensure form is updated
			setTimeout(async () => {
				await form.trigger();
				console.log(
					"Form populated and validation triggered. Form values:",
					form.getValues(),
				);
				console.log("Leave Balances:", form.getValues("employee.leaveBalances"));
				console.log("Form errors:", form.formState.errors);
			}, 100);
		}
	}, [employeeData, isEditMode, form, user]);

	const sections = [
		...(isEditMode
			? []
			: [
					{
						id: "employee-type",
						title: "Employee Type",
						description: "Select employee role",
						icon: UserCheck,
					},
				]),
		{
			id: "personal-details",
			title: "Personal Information",
			description: "Personal & contact details",
			icon: Clock,
		},
		{
			id: "employee-details",
			title: "Employment Details",
			description: "Job & compensation info",
			icon: Clock,
		},
		{
			id: "preview",
			title: "Preview",
			description: "Review all information",
			icon: Clock,
		},
	];

	// Normalize lookup data so the randomizer can pick valid IDs
	const departmentList = useMemo(() => {
		const fromRoot = (departmentsData as any)?.departments;
		const fromData = (departmentsData as any)?.data?.departments;
		if (Array.isArray(fromRoot)) return fromRoot;
		if (Array.isArray(fromData)) return fromData;
		if (Array.isArray(departmentsData)) return departmentsData;
		return [];
	}, [departmentsData]);

	const positionList = useMemo(() => {
		const fromRoot = (positionsData as any)?.positions;
		const fromData = (positionsData as any)?.data?.positions;
		if (Array.isArray(fromRoot)) return fromRoot;
		if (Array.isArray(fromData)) return fromData;
		if (Array.isArray(positionsData)) return positionsData;
		return [];
	}, [positionsData]);

	const workScheduleList = useMemo(() => {
		const fromRoot = (workSchedulesData as any)?.schedules;
		const fromData = (workSchedulesData as any)?.data?.schedules;
		if (Array.isArray(fromRoot)) return fromRoot;
		if (Array.isArray(fromData)) return fromData;
		if (Array.isArray(workSchedulesData)) return workSchedulesData;
		return [];
	}, [workSchedulesData]);

	const roleIdByName = useMemo(() => {
		const map = new Map<string, string>();
		roles.forEach((role: any) => {
			const roleName = String(role?.name || "")
				.trim()
				.toLowerCase();
			if (!roleName) return;
			const roleId = String(role?.id || role?.name || "")
				.trim()
				.toLowerCase();
			if (!roleId) return;
			map.set(roleName, roleId);
		});

		["hris-hr-manager", "hris-hr-user", "hris-employee-manager", "hris-employee"].forEach(
			(roleName) => {
				if (!map.has(roleName)) {
					map.set(roleName, roleName);
				}
			},
		);

		return map;
	}, [roles]);

	const ROLE_IDS = useMemo(
		() => ({
			HR_MANAGER: roleIdByName.get("hris-hr-manager") || "hris-hr-manager",
			HR_USER: roleIdByName.get("hris-hr-user") || "hris-hr-user",
			EMPLOYEE_MANAGER: roleIdByName.get("hris-employee-manager") || "hris-employee-manager",
			EMPLOYEE: roleIdByName.get("hris-employee") || "hris-employee",
		}),
		[roleIdByName],
	);

	// Map selections to roleId using the unified role source (local key fallback).
	const getRoleIdFromSelection = useCallback((): string => {
		if (selectedEmployeeType === "hr") {
			// General HR sub-role maps to HR Manager
			if (selectedHRSubRole === "general") {
				return ROLE_IDS.HR_MANAGER;
			}
			// All other HR sub-roles (recruitment, payroll, benefits, training) map to HR User
			if (selectedHRSubRole) {
				return ROLE_IDS.HR_USER;
			}
			// If HR type is selected but no sub-role yet, return empty
			return "";
		} else if (selectedEmployeeType === "employee") {
			if (isManager) {
				// Employee Manager role
				return ROLE_IDS.EMPLOYEE_MANAGER;
			} else {
				// Regular Employee
				return ROLE_IDS.EMPLOYEE;
			}
		}
		return "";
	}, [
		selectedEmployeeType,
		selectedHRSubRole,
		isManager,
		ROLE_IDS.HR_MANAGER,
		ROLE_IDS.HR_USER,
		ROLE_IDS.EMPLOYEE_MANAGER,
		ROLE_IDS.EMPLOYEE,
	]);

	// Update roleId immediately when HR sub-role is selected
	const handleHRSubRoleSelect = (subRoleId: string) => {
		setSelectedHRSubRole(subRoleId);
		// Immediately set the roleId based on the selected sub-role
		if (subRoleId === "general") {
			const roleId = ROLE_IDS.HR_MANAGER;
			setSelectedRoleId(roleId);
		} else if (subRoleId) {
			const roleId = ROLE_IDS.HR_USER;
			setSelectedRoleId(roleId);
		}
	};

	// Update roleId when selections change
	useEffect(() => {
		if (selectedEmployeeType) {
			if (selectedEmployeeType === "employee" || selectedHRSubRole) {
				const roleId = getRoleIdFromSelection();
				if (roleId) {
					setSelectedRoleId(roleId);
				}
			}
		}
	}, [selectedEmployeeType, selectedHRSubRole, isManager, getRoleIdFromSelection]);

	const handleSectionClick = (sectionId: string) => {
		// If trying to navigate past employee-type without selection, prevent it
		if (sectionId !== "employee-type" && !selectedRoleId && sectionId !== activeSection) {
			toast.error("Please select an employee type first", {
				description: "Employee Type Required",
			});
			return;
		}

		setActiveSection(sectionId);

		// Update URL with section parameter for deep linking
		const newParams = new URLSearchParams(searchParams);
		newParams.set("section", sectionId);
		setSearchParams(newParams, { replace: true });

		// Set the clicked section to "in-progress" if it's not already completed
		if (sectionStatus[sectionId] === "not-started") {
			setSectionStatus((prev) => ({ ...prev, [sectionId]: "in-progress" }));
		}
	};

	const handleSectionComplete = (sectionId: string) => {
		// For employee-type section, validate that selections are complete
		if (sectionId === "employee-type") {
			if (!selectedEmployeeType) {
				toast.error("Please select an employee type to continue", {
					description: "Employee Type Required",
				});
				return;
			}
			if (selectedEmployeeType === "hr" && !selectedHRSubRole) {
				toast.error("Please select an HR sub-role to continue", {
					description: "HR Sub-Role Required",
				});
				return;
			}
		}

		// In edit mode, keep sections as "in-progress" so they remain editable
		// Only mark as "completed" in create mode
		if (isEditMode) {
			setSectionStatus((prev) => ({ ...prev, [sectionId]: "in-progress" }));
		} else {
			setSectionStatus((prev) => ({ ...prev, [sectionId]: "completed" }));
		}

		const currentIndex = sections.findIndex((s) => s.id === sectionId);
		if (currentIndex < sections.length - 1) {
			const nextSection = sections[currentIndex + 1];
			setActiveSection(nextSection.id);

			// Update URL with next section for deep linking
			const newParams = new URLSearchParams(searchParams);
			newParams.set("section", nextSection.id);
			setSearchParams(newParams, { replace: true });

			if (sectionStatus[nextSection.id] === "not-started") {
				setSectionStatus((prev) => ({ ...prev, [nextSection.id]: "in-progress" }));
			}
		}
	};

	const handleEmployeeTypeSelect = (type: "hr" | "employee") => {
		setSelectedEmployeeType(type);
		if (type === "employee") {
			// For employee, we can proceed to manager question
			setSelectedHRSubRole(null);
		}
	};

	const handleManagerToggle = (value: boolean) => {
		setIsManager(value);
		form.setValue("employee.isManager", value);
		// Update roleId immediately when manager status changes for employees
		if (selectedEmployeeType === "employee") {
			const roleId = value ? ROLE_IDS.EMPLOYEE_MANAGER : ROLE_IDS.EMPLOYEE;
			setSelectedRoleId(roleId);
		}
	};

	const canProceedFromEmployeeType = () => {
		if (!selectedEmployeeType) return false;
		if (selectedEmployeeType === "hr" && !selectedHRSubRole) return false;
		return true;
	};

	const pickPositionForDepartment = (departmentId: string) => {
		const match = positionList.find(
			(pos: any) => pos.departmentId === departmentId || pos.department?.id === departmentId,
		);
		return match?.id || match?._id || positionList[0]?.id || positionList[0]?._id || "";
	};

	const pickDepartmentId = () => departmentList[0]?.id || departmentList[0]?._id || "";
	const pickScheduleId = () =>
		workScheduleList[0]?.id || workScheduleList[0]?._id || workScheduleList[0]?._id || "";

	const prefillWithDemoData = () => {
		setIsPrefilling(true);
		const uniqueSuffix = Date.now().toString().slice(-6);
		const departmentId = pickDepartmentId();
		const positionId = pickPositionForDepartment(departmentId);
		const scheduleId = pickScheduleId();

		if (!departmentId || !positionId || !scheduleId) {
			toast.error(
				"Could not auto-fill because departments, positions, or schedules are missing.",
				{
					description: "Try refreshing so lookup data loads first.",
				},
			);
			setIsPrefilling(false);
			return;
		}

		const today = new Date();
		const toISO = (date: Date) => date.toISOString().split("T")[0];
		const hireDate = new Date(today);
		hireDate.setDate(hireDate.getDate() - 7);
		const probationEnd = new Date(hireDate);
		probationEnd.setMonth(probationEnd.getMonth() + 3);

		const demoData: FormData = {
			user: {
				email: `demo.user.${uniqueSuffix}@example.test`,
				userName: `demouser${uniqueSuffix}`,
				password: `DemoPass!${uniqueSuffix}`,
				avatar: "",
				status: "active",
				loginMethod: "email",
				roleId: ROLE_IDS.EMPLOYEE,
				organizationId: user?.organizationId || "",
			},
			person: {
				organizationId: user?.organizationId || "",
				personalInfo: {
					prefix: "Mr.",
					firstName: "Demo",
					middleName: "Debug",
					lastName: `User${uniqueSuffix}`,
					dateOfBirth: "1992-04-12",
					placeOfBirth: "Makati, PHL",
					age: 32,
					nationality: "Filipino",
					primaryLanguage: "English",
					gender: "male",
					currency: "PHP",
					vipCode: "",
				},
				contactInfo: {
					email: `demo.employee.${uniqueSuffix}@example.test`,
					phones: [
						{
							type: "mobile",
							countryCode: "+63",
							number: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
							isPrimary: true,
						},
					],
					fax: "",
					address: [
						{
							street: "123 Debug Street",
							address2: "Brgy. Poblacion",
							city: "Makati",
							state: "NCR",
							country: "Philippines",
							postalCode: "1200",
							zipCode: "1200",
							houseNumber: "12B",
						},
					],
				},
				identification: {
					type: "passport",
					number: `P${uniqueSuffix}`,
					issuingCountry: "Philippines",
					expiryDate: toISO(new Date(today.getFullYear() + 5, today.getMonth(), 1)),
				},
			},
			employee: {
				organizationId: user?.organizationId || "",
				employeeId: `EMP${(parseInt(uniqueSuffix.slice(-3)) % 900) + 100}`,
				employmentHireDate: toISO(hireDate),
				employmentStartDate: toISO(hireDate),
				employmentTerminationDate: null,
				employmentStatus: "ACTIVE",
				employmentType: "PROBATIONARY",
				probationEndDate: toISO(probationEnd),
				departmentId,
				positionId,
				defaultScheduleId: scheduleId,
				basicSalary: 52000,
				currency: "PHP",
				payFrequency: "SEMI_MONTHLY",
				documents: [
					{
						type: "TIN",
						number: `TIN-${uniqueSuffix}`,
						issueDate: toISO(new Date(today.getFullYear() - 2, today.getMonth(), 15)),
						expiryDate: "",
					},
				],
				leaveBalances: [],
				workLocation: "HYBRID",
				isManager: false,
				reportToId: null,
			},
		};

		// Set selection state so wizard validation passes
		setSelectedEmployeeType("employee");
		setSelectedHRSubRole(null);
		setIsManager(false);
		setSelectedRoleId(ROLE_IDS.EMPLOYEE);

		form.reset(demoData, {
			keepErrors: false,
			keepDirty: false,
			keepIsSubmitted: false,
		});

		setSectionStatus({
			"employee-type": "completed",
			"personal-details": "completed",
			"employee-details": "completed",
			preview: "not-started",
		});
		setActiveSection("employee-details");

		// Trigger validation asynchronously so UI updates
		setTimeout(() => {
			form.trigger();
			setIsPrefilling(false);
			toast.success("Auto-filled with demo data — you can tweak then submit.");
		}, 50);
	};

	const handleEditSection = (sectionId: string) => {
		setActiveSection(sectionId);

		// Update URL with section parameter for deep linking
		const newParams = new URLSearchParams(searchParams);
		newParams.set("section", sectionId);
		setSearchParams(newParams, { replace: true });

		setSectionStatus((prev) => ({ ...prev, [sectionId]: "in-progress" }));
	};

	const handleSubmit = form.handleSubmit((data) => {
		console.log("Submitting employee data:", data);
		console.log("Department ID being sent:", data.employee.departmentId);
		console.log("Position ID being sent:", data.employee.positionId);
		console.log("Schedule ID being sent:", data.employee.defaultScheduleId);

		// Get organizationId from authenticated user (required for all entities)
		// The authenticated user's organizationId should always be available
		const organizationId = user?.organizationId || user?.organization?.id;

		if (!organizationId || organizationId.trim() === "") {
			toast.error("Organization ID not found. Please ensure you are logged in.", {
				description: "Missing Organization ID",
			});
			console.error("Missing organizationId. User object:", user);
			return;
		}

		console.log("Using organizationId from authenticated user:", organizationId);

		// Validate that all required sections are completed
		// In edit mode, exclude "employee-type" and check for "in-progress" or "completed"
		// In create mode, check all sections are "completed"
		const requiredSections = isEditMode
			? ["personal-details", "employee-details"]
			: ["employee-type", "personal-details", "employee-details"];
		const incompleteSections = requiredSections.filter((sectionId) => {
			const status = sectionStatus[sectionId];
			// In edit mode, accept "in-progress" or "completed"
			// In create mode, only accept "completed"
			return isEditMode
				? status !== "completed" && status !== "in-progress"
				: status !== "completed";
		});

		if (incompleteSections.length > 0) {
			const incompleteSectionNames = incompleteSections.map((id) => {
				const section = sections.find((s) => s.id === id);
				return section?.title || id;
			});

			toast.error(
				`Please complete the following sections before submitting: ${incompleteSectionNames.join(", ")}`,
				{
					description: "Incomplete Form",
				},
			);
			return;
		}

		// Helper function to format dates to ISO string
		const formatDateToISO = (dateString: string): string => {
			if (!dateString) return "";
			// If it's already in ISO format, return as is
			if (dateString.includes("T")) return dateString;
			// If it's in MM/DD/YYYY format, convert to ISO
			if (dateString.includes("/")) {
				const [month, day, year] = dateString.split("/");
				return new Date(
					`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`,
				).toISOString();
			}
			// If it's in YYYY-MM-DD format, add time
			if (dateString.includes("-") && dateString.length === 10) {
				return new Date(`${dateString}T00:00:00.000Z`).toISOString();
			}
			return new Date(dateString).toISOString();
		};

		// Helper function to format documents with proper dates
		const formatDocuments = (documents: any[]) => {
			return documents.map((doc) => ({
				...doc,
				issueDate: doc.issueDate ? formatDateToISO(doc.issueDate) : "",
				expiryDate: doc.expiryDate ? formatDateToISO(doc.expiryDate) : undefined,
			}));
		};

		// Helper function to format leave balances with proper dates
		const formatLeaveBalances = (leaveBalances: any[]) => {
			return leaveBalances.map((lb) => ({
				leaveType: lb.leaveType,
				totalEntitled: lb.totalEntitled || 0,
				periodStart: lb.periodStart ? formatDateToISO(lb.periodStart) : "",
				periodEnd: lb.periodEnd ? formatDateToISO(lb.periodEnd) : "",
			}));
		};

		// Helper function to ensure empty strings instead of null
		const ensureString = (value: any): string => {
			if (value === null || value === undefined || value === "") return "";
			return value.toString();
		};

		// Helper function to generate username from firstName + employeeId
		const generateUsername = (firstName: string, employeeId: string): string => {
			if (!firstName || !employeeId) return "";
			return `${firstName}${employeeId}`.toLowerCase().replace(/\s+/g, "");
		};

		// Prepare the payload to match your API structure
		// No user object - only roleId at top level, person, and employee
		const payload: any = {
			roleId: selectedRoleId || "", // Use selected role ID from card selection at top level
			person: {
				organizationId: organizationId, // Use authenticated user's organizationId
				personalInfo: {
					prefix: ensureString(data.person.personalInfo.prefix),
					firstName: data.person.personalInfo.firstName,
					middleName: ensureString(data.person.personalInfo.middleName),
					lastName: data.person.personalInfo.lastName,
					dateOfBirth: formatDateToISO(data.person.personalInfo.dateOfBirth),
					placeOfBirth: ensureString(data.person.personalInfo.placeOfBirth),
					age: data.person.personalInfo.age || undefined,
					nationality: ensureString(data.person.personalInfo.nationality),
					primaryLanguage: ensureString(data.person.personalInfo.primaryLanguage),
					gender: data.person.personalInfo.gender as
						| "male"
						| "female"
						| "other"
						| "prefer_not_to_say"
						| "unknown"
						| "not_applicable"
						| undefined,
					currency: data.person.personalInfo.currency,
					vipCode: ensureString(data.person.personalInfo.vipCode),
				},
				contactInfo: {
					email: data.person.contactInfo.email,
					phones: data.person.contactInfo.phones,
					fax: ensureString(data.person.contactInfo.fax),
					address: data.person.contactInfo.address.map((addr: any) => ({
						street: ensureString(addr.street),
						address2: ensureString(addr.address2),
						city: ensureString(addr.city),
						state: ensureString(addr.state),
						country: ensureString(addr.country),
						postalCode: ensureString(addr.postalCode),
						zipCode: ensureString(addr.zipCode),
						houseNumber: ensureString(addr.houseNumber),
					})),
				},
				identification: {
					type: data.person.identification.type,
					number: data.person.identification.number,
					issuingCountry: data.person.identification.issuingCountry,
					expiryDate: formatDateToISO(data.person.identification.expiryDate),
				},
			},
			employee: {
				organizationId: organizationId, // Use authenticated user's organizationId
				employeeId: data.employee.employeeId,
				employmentHireDate: formatDateToISO(data.employee.employmentHireDate),
				employmentStartDate: formatDateToISO(data.employee.employmentStartDate),
				employmentTerminationDate: data.employee.employmentTerminationDate,
				employmentStatus: normalizeEmploymentStatus(data.employee.employmentStatus),
				employmentType: data.employee.employmentType as
					| "REGULAR"
					| "PROBATIONARY"
					| "CONTRACTUAL"
					| "PART_TIME"
					| "CONSULTANT"
					| "INTERN",
				probationEndDate: data.employee.probationEndDate
					? formatDateToISO(data.employee.probationEndDate)
					: undefined,
				departmentId: data.employee.departmentId,
				positionId: data.employee.positionId,
				defaultScheduleId: data.employee.defaultScheduleId,
				basicSalary: data.employee.basicSalary,
				currency: data.employee.currency,
				payFrequency: data.employee.payFrequency as
					| "DAILY"
					| "WEEKLY"
					| "BIWEEKLY"
					| "MONTHLY"
					| "QUARTERLY"
					| "ANNUALLY",
				documents: formatDocuments(data.employee.documents),
				leaveBalances:
					data.employee.leaveBalances && data.employee.leaveBalances.length > 0
						? formatLeaveBalances(data.employee.leaveBalances)
						: undefined,
				workLocation: data.employee.workLocation as "ONSITE" | "REMOTE" | "HYBRID",
				isManager: data.employee.isManager || false,
				reportToId: data.employee.reportToId || null,
			},
		};

		// Verify organizationId is consistent
		console.log("=== ORGANIZATION ID VERIFICATION ===");
		console.log("Authenticated User organizationId:", organizationId);
		console.log("Payload roleId:", payload.roleId);
		console.log("Payload person.organizationId:", payload.person.organizationId);
		console.log("Payload employee.organizationId:", payload.employee.organizationId);

		if (
			payload.person.organizationId !== organizationId ||
			payload.employee.organizationId !== organizationId
		) {
			console.error("ERROR: OrganizationId mismatch detected!");
		}

		console.log("Final payload being sent:", JSON.stringify(payload, null, 2));
		console.log("=== PAYLOAD VALIDATION CHECK ===");
		console.log("Employment Status:", payload.employee.employmentStatus);
		console.log("Employment Type:", payload.employee.employmentType);
		console.log(
			"Document Types:",
			payload.employee.documents.map((doc: { type: string }) => doc.type),
		);
		console.log("Hire Date:", payload.employee.employmentHireDate);
		console.log("Probation End Date:", payload.employee.probationEndDate);
		console.log("Identification Expiry:", payload.person.identification.expiryDate);

		// Use React Query mutation with toast promise
		const promise = new Promise((resolve, reject) => {
			if (isEditMode && employeeId) {
				// Update existing employee
				updateEmployeeMutation.mutate(
					{ id: employeeId, payload },
					{
						onSuccess: (response) => {
							console.log("Employee updated successfully:", response);
							resolve(response);
							// Navigate back to employees list after a short delay
							setTimeout(() => {
								navigate("/hr/employees");
							}, 1000);
						},
						onError: (error: any) => {
							console.error("Error updating employee:", error);
							console.error("Full error response:", error.response?.data);
							console.error("Error status:", error.response?.status);
							console.error("Error message:", error.message);

							// Handle validation errors specifically
							if (
								error.response?.data?.errors &&
								Array.isArray(error.response.data.errors)
							) {
								const validationErrors = error.response.data.errors;
								const errorMessage = validationErrors
									.map((err: any) => `${err.field}: ${err.message}`)
									.join(", ");
								reject(new Error(errorMessage));
							} else {
								reject(
									new Error(
										error instanceof Error
											? error.message
											: "Unknown error occurred",
									),
								);
							}
						},
					},
				);
			} else {
				// Create new employee
				createEmployeeMutation.mutate(payload, {
					onSuccess: (response) => {
						console.log("Employee created successfully:", response);
						resolve(response);
						// Navigate back to employees list after a short delay
						setTimeout(() => {
							navigate("/hr/employees");
						}, 1000);
					},
					onError: (error: any) => {
						console.error("Error creating employee:", error);
						console.error("Full error response:", error.response?.data);
						console.error("Error status:", error.response?.status);
						console.error("Error message:", error.message);

						// Handle validation errors specifically
						if (
							error.response?.data?.errors &&
							Array.isArray(error.response.data.errors)
						) {
							const validationErrors = error.response.data.errors;
							const errorMessage = validationErrors
								.map((err: any) => `${err.field}: ${err.message}`)
								.join(", ");
							reject(new Error(errorMessage));
						} else {
							reject(
								new Error(
									error instanceof Error
										? error.message
										: "Unknown error occurred",
								),
							);
						}
					},
				});
			}
		});

		toast.promise(promise, {
			loading: isEditMode ? "Updating employee account..." : "Creating employee account...",
			success: isEditMode
				? "Employee updated successfully!"
				: "Employee created successfully!",
			error: (err) =>
				`Failed to ${isEditMode ? "update" : "create"} employee: ${err.message}`,
		});
	});

	// In edit mode, check if sections are "in-progress" or "completed" (meaning they've been worked on)
	// In create mode, check if all sections are "completed"
	const allCompleted = isEditMode
		? Object.entries(sectionStatus)
				.filter(([key]) => {
					if (key === "preview") return false;
					if (key === "employee-type") return false; // Skip employee-type in edit mode
					return true;
				})
				.every(([, status]) => status === "completed" || status === "in-progress")
		: Object.entries(sectionStatus)
				.filter(([key]) => {
					if (key === "preview") return false;
					return true;
				})
				.every(([, status]) => status === "completed");

	const completedCount = Object.entries(sectionStatus)
		.filter(([key]) => {
			if (key === "preview") return false;
			return true;
		})
		.filter(([, status]) => status === "completed").length;

	// Show loading state while fetching employee data in edit mode
	if (isEditMode && isLoadingEmployee) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading employee data...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Back button - outside header */}
			<div className="mx-auto max-w-7xl px-6 pt-6">
				<Link
					to="/hr/employees"
					className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
					<ArrowLeft className="h-4 w-4" />
					<span>Back to Employees</span>
				</Link>
			</div>

			<div className="mx-auto max-w-7xl px-6 py-8">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold text-gray-900">Add Employee</h1>
						<p className="text-sm text-gray-600">
							Use the auto-fill button to drop in valid demo data for quick testing.
						</p>
					</div>
					<Button
						onClick={prefillWithDemoData}
						disabled={isPrefilling}
						className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2">
						<Sparkles className="h-4 w-4" />
						{isPrefilling ? "Filling..." : "Auto-fill demo data"}
					</Button>
				</div>

				<div className="grid gap-8 lg:grid-cols-[320px_1fr]">
					<JourneyTimeline
						sections={sections}
						activeSection={activeSection}
						sectionStatus={sectionStatus}
						onSectionClick={handleSectionClick}
						completedCount={completedCount}
						totalCount={sections.length - 1}
					/>

					<div className="space-y-6">
						{/* Employee Type Selection */}
						{activeSection === "employee-type" && (
							<div className="bg-white rounded-lg border border-gray-200 p-6">
								<div className="mb-6">
									<h2 className="text-xl font-semibold text-gray-900 mb-2">
										Select Employee Type
									</h2>
									<p className="text-sm text-gray-600">
										Choose the type of employee you&apos;re adding to the system
									</p>
								</div>

								{/* Step 1: Select HR or Employee */}
								{!selectedEmployeeType && (
									<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
										<button
											type="button"
											onClick={() => handleEmployeeTypeSelect("hr")}
											className="relative p-8 rounded-lg border-2 border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50 transition-all text-left group">
											<div className="flex items-start gap-4">
												<div className="p-4 rounded-lg bg-blue-100 group-hover:bg-blue-200 transition-colors">
													<UserCog className="h-8 w-8 text-blue-600" />
												</div>
												<div className="flex-1">
													<h3 className="font-semibold text-lg text-gray-900 mb-2">
														HR Type
													</h3>
													<p className="text-sm text-gray-600">
														Human Resources personnel with specialized
														roles
													</p>
												</div>
											</div>
											<ArrowRight className="absolute bottom-4 right-4 h-5 w-5 text-gray-400 group-hover:text-orange-600" />
										</button>

										<button
											type="button"
											onClick={() => handleEmployeeTypeSelect("employee")}
											className="relative p-8 rounded-lg border-2 border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50 transition-all text-left group">
											<div className="flex items-start gap-4">
												<div className="p-4 rounded-lg bg-green-100 group-hover:bg-green-200 transition-colors">
													<Users className="h-8 w-8 text-green-600" />
												</div>
												<div className="flex-1">
													<h3 className="font-semibold text-lg text-gray-900 mb-2">
														Employee
													</h3>
													<p className="text-sm text-gray-600">
														Regular employee in the organization
													</p>
												</div>
											</div>
											<ArrowRight className="absolute bottom-4 right-4 h-5 w-5 text-gray-400 group-hover:text-orange-600" />
										</button>
									</div>
								)}

								{/* Step 2a: HR Sub-Role Selection */}
								{selectedEmployeeType === "hr" && !selectedHRSubRole && (
									<div className="space-y-4">
										<div className="flex items-center gap-2 mb-4">
											<button
												type="button"
												onClick={() => {
													setSelectedEmployeeType(null);
													setSelectedHRSubRole(null);
												}}
												className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
												<ArrowLeft className="h-4 w-4" />
												Back
											</button>
											<div className="h-px bg-gray-200 flex-1"></div>
											<span className="text-sm text-gray-500">
												Step 2 of 3
											</span>
										</div>
										<h3 className="text-lg font-semibold text-gray-900 mb-2">
											Select HR Specialization
										</h3>
										<p className="text-sm text-gray-600 mb-6">
											Choose the HR sub-role for this employee
										</p>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
											{hrSubRoles.map((subRole) => {
												const Icon = subRole.icon;
												return (
													<button
														key={subRole.id}
														type="button"
														onClick={() =>
															handleHRSubRoleSelect(subRole.id)
														}
														className="relative p-6 rounded-lg border-2 border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50 transition-all text-left">
														<div className="flex items-start gap-3">
															<div className="p-2 rounded-lg bg-gray-100">
																<Icon className="h-5 w-5 text-gray-600" />
															</div>
															<div className="flex-1 min-w-0">
																<h4 className="font-semibold text-gray-900 mb-1">
																	{subRole.label}
																</h4>
																<p className="text-xs text-gray-600">
																	{subRole.description}
																</p>
															</div>
														</div>
													</button>
												);
											})}
										</div>
									</div>
								)}

								{/* Step 2b/3: Manager Question (for both HR and Employee) */}
								{(selectedEmployeeType === "employee" ||
									(selectedEmployeeType === "hr" && selectedHRSubRole)) && (
									<div className="space-y-4">
										<div className="flex items-center gap-2 mb-4">
											<button
												type="button"
												onClick={() => {
													if (selectedEmployeeType === "hr") {
														setSelectedHRSubRole(null);
													} else {
														setSelectedEmployeeType(null);
													}
													setIsManager(false);
												}}
												className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
												<ArrowLeft className="h-4 w-4" />
												Back
											</button>
											<div className="h-px bg-gray-200 flex-1"></div>
											<span className="text-sm text-gray-500">
												{selectedEmployeeType === "hr"
													? "Step 3 of 3"
													: "Step 2 of 2"}
											</span>
										</div>
										<h3 className="text-lg font-semibold text-gray-900 mb-2">
											Is this employee a Manager?
										</h3>
										<p className="text-sm text-gray-600 mb-6">
											Managers have team management responsibilities and can
											approve requests from their team members.
										</p>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
											<button
												type="button"
												onClick={() => handleManagerToggle(true)}
												className={`relative p-6 rounded-lg border-2 transition-all text-left ${
													isManager
														? "border-orange-500 bg-orange-50 shadow-md"
														: "border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50"
												}`}>
												{isManager && (
													<div className="absolute top-3 right-3">
														<CheckCircle2 className="h-5 w-5 text-orange-600" />
													</div>
												)}
												<div className="flex items-start gap-4">
													<div
														className={`p-3 rounded-lg ${
															isManager
																? "bg-orange-100"
																: "bg-gray-100"
														}`}>
														<Briefcase
															className={`h-6 w-6 ${
																isManager
																	? "text-orange-600"
																	: "text-gray-600"
															}`}
														/>
													</div>
													<div className="flex-1">
														<h4
															className={`font-semibold mb-1 ${
																isManager
																	? "text-orange-900"
																	: "text-gray-900"
															}`}>
															Yes, Manager
														</h4>
														<p
															className={`text-sm ${
																isManager
																	? "text-orange-700"
																	: "text-gray-600"
															}`}>
															Has team management responsibilities
														</p>
													</div>
												</div>
											</button>

											<button
												type="button"
												onClick={() => handleManagerToggle(false)}
												className={`relative p-6 rounded-lg border-2 transition-all text-left ${
													!isManager
														? "border-orange-500 bg-orange-50 shadow-md"
														: "border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50"
												}`}>
												{!isManager && (
													<div className="absolute top-3 right-3">
														<CheckCircle2 className="h-5 w-5 text-orange-600" />
													</div>
												)}
												<div className="flex items-start gap-4">
													<div
														className={`p-3 rounded-lg ${
															!isManager
																? "bg-orange-100"
																: "bg-gray-100"
														}`}>
														<Users
															className={`h-6 w-6 ${
																!isManager
																	? "text-orange-600"
																	: "text-gray-600"
															}`}
														/>
													</div>
													<div className="flex-1">
														<h4
															className={`font-semibold mb-1 ${
																!isManager
																	? "text-orange-900"
																	: "text-gray-900"
															}`}>
															No, Regular
														</h4>
														<p
															className={`text-sm ${
																!isManager
																	? "text-orange-700"
																	: "text-gray-600"
															}`}>
															Standard employee without management
															role
														</p>
													</div>
												</div>
											</button>
										</div>
									</div>
								)}

								{/* Continue Button */}
								{canProceedFromEmployeeType() && (
									<div className="mt-6 flex justify-end">
										<Button
											onClick={() => handleSectionComplete("employee-type")}
											className="bg-orange-600 hover:bg-orange-700 text-white">
											Continue to Personal Details
											<ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
										</Button>
									</div>
								)}
							</div>
						)}
						{activeSection === "personal-details" && (
							<PersonalDetailsForm
								form={form}
								onComplete={() => handleSectionComplete("personal-details")}
								status={sectionStatus["personal-details"]}
							/>
						)}
						{activeSection === "employee-details" && (
							<EmployeeDetailsForm
								form={form}
								onComplete={() => handleSectionComplete("employee-details")}
								status={sectionStatus["employee-details"]}
							/>
						)}
						{activeSection === "preview" && (
							<EmployeePreviewForm
								form={form}
								onEditSection={handleEditSection}
								onSubmit={() => {
									setSectionStatus((prev) => ({ ...prev, preview: "completed" }));
									handleSubmit();
								}}
								status={sectionStatus["preview"]}
								isEditMode={isEditMode}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
