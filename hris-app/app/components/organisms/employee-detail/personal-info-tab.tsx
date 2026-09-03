import type { ReactNode } from "react";
import { Button } from "~/components/atoms/Button";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";
import type { Employee } from "~/services/employees.service";
import {
	Calendar,
	FileText,
	Globe,
	IdCard,
	KeyRound,
	Languages,
	Mail,
	MapPin,
	Phone,
	Settings,
	User,
	Baby,
} from "lucide-react";

interface PersonalInfoTabProps {
	employee: Employee;
	isOwnProfile?: boolean;
	avatarUrl?: string;
	onUpdateProfile?: () => void;
	onChangePassword?: () => void;
	onResignationFlow?: () => void;
}

const formatDate = (date?: string | null) => {
	if (!date) return "N/A";
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

const formatEnumLabel = (value?: string | null) => {
	const normalized = String(value || "").trim();
	if (!normalized) return "N/A";
	return normalized
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
};

const calculateAge = (dob?: string | null) => {
	if (!dob) return null;
	const today = new Date();
	const birthDate = new Date(dob);
	let age = today.getFullYear() - birthDate.getFullYear();
	const monthDiff = today.getMonth() - birthDate.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
		age--;
	}
	return age;
};

const formatLocationSummary = (employee: Employee) => {
	const parts = [formatEnumLabel(employee.workLocation), employee.department?.name]
		.filter((value) => value && value !== "N/A")
		.map((value) => String(value).trim());
	return parts.length > 0 ? parts.join(" • ") : "Location not assigned";
};

const formatAddressLines = (address?: {
	street?: string;
	address2?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country?: string;
} | null) => {
	if (!address) return null;
	const lines = [
		address.street,
		address.address2,
		[address.city, address.state, address.postalCode].filter(Boolean).join(", "),
		address.country,
	].filter(Boolean);
	return lines.length > 0 ? lines : null;
};

export function PersonalInfoTab({
	employee,
	isOwnProfile = false,
	avatarUrl,
	onUpdateProfile,
	onChangePassword,
	onResignationFlow,
}: PersonalInfoTabProps) {
	const personalInfo = employee.person?.personalInfo || {};
	const contactInfo = employee.person?.contactInfo || {};
	const primaryAddress = contactInfo.address?.[0];
	const primaryPhone = contactInfo.phones?.find((phone) => phone.isPrimary);
	const otherPhones = contactInfo.phones?.filter((phone) => !phone.isPrimary) || [];

	const firstName = personalInfo.firstName || "";
	const middleName = personalInfo.middleName || "";
	const lastName = personalInfo.lastName || "";
	const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
	const roleLine = [employee.level?.name, employee.position?.title]
		.filter(Boolean)
		.map((value) => String(value).trim())
		.join(" • ");

	const addressLines = formatAddressLines(primaryAddress);
	const age = calculateAge(personalInfo.dateOfBirth);
	const children = employee.person?.children || [];

	const contactRows: Array<{
		label: string;
		value: ReactNode;
		hint?: ReactNode;
	}> = [];

	if (contactInfo.email) {
		contactRows.push({
			label: "Email",
			value: (
				<a
					href={`mailto:${contactInfo.email}`}
					className="text-foreground transition-colors hover:text-primary">
					{contactInfo.email}
				</a>
			),
		});
	}

	if (primaryPhone) {
		contactRows.push({
			label: "Phone (Primary)",
			value: (
				<a
					href={`tel:${primaryPhone.countryCode}${primaryPhone.number}`}
					className="text-foreground transition-colors hover:text-primary">
					{primaryPhone.countryCode} {primaryPhone.number}
				</a>
			),
			hint: primaryPhone.type ? formatEnumLabel(primaryPhone.type) : undefined,
		});
	}

	for (const phone of otherPhones) {
		contactRows.push({
			label: `Phone (${formatEnumLabel(phone.type)})`,
			value: (
				<a
					href={`tel:${phone.countryCode}${phone.number}`}
					className="text-foreground transition-colors hover:text-primary">
					{phone.countryCode} {phone.number}
				</a>
			),
		});
	}

	contactRows.push({
		label: "Work Location",
		value: formatLocationSummary(employee),
	});

	if (addressLines) {
		contactRows.push({
			label: "Address",
			value: (
				<div className="space-y-0.5">
					{addressLines.map((line) => (
						<p key={line}>{line}</p>
					))}
				</div>
			),
		});
	}

	const personalRows: Array<{
		label: string;
		value: ReactNode;
		hint?: ReactNode;
	}> = [];

	if (personalInfo.dateOfBirth) {
		personalRows.push({
			label: "Date of Birth",
			value: formatDate(personalInfo.dateOfBirth),
			hint: age ? `${age} years old` : undefined,
		});
	}

	if (personalInfo.placeOfBirth) {
		personalRows.push({
			label: "Place of Birth",
			value: personalInfo.placeOfBirth,
		});
	}

	if (personalInfo.gender) {
		personalRows.push({
			label: "Gender",
			value: <span className="capitalize">{personalInfo.gender}</span>,
		});
	}

	if (personalInfo.nationality) {
		personalRows.push({
			label: "Nationality",
			value: personalInfo.nationality,
		});
	}

	if (personalInfo.primaryLanguage) {
		personalRows.push({
			label: "Primary Language",
			value: <span className="capitalize">{personalInfo.primaryLanguage}</span>,
		});
	}

	return (
		<div className="space-y-4">
			<section
				className="rounded-2xl border border-border bg-white px-5 py-5 shadow-sm"
				data-testid="employee-profile-hero">
				<div className="flex flex-col gap-4 md:flex-row md:items-center">
					<EmployeeAvatar
						src={avatarUrl}
						alt={fullName || "Employee avatar"}
						size="xl"
						className="h-20 w-20 shrink-0 border border-primary/20 shadow-sm"
					/>
					<div className="min-w-0 space-y-2">
						<h1 className="text-xl font-semibold text-foreground">
							{fullName || "Unnamed employee"}
						</h1>
						<p className="text-sm text-muted-foreground">
							{roleLine || "Position not assigned"}
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<StatusBadge status={employee.employmentStatus} className="text-[11px]" />
							{employee.employeeId ? (
								<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
									<IdCard className="h-3 w-3" />
									{employee.employeeId}
								</span>
							) : null}
						</div>
					</div>
				</div>
			</section>

			<div className="grid gap-4 xl:grid-cols-2">
				<PersonalInfoCard
					icon={Mail}
					title="Contact Information"
					rows={contactRows}
					emptyMessage="No contact information available."
				/>
				<PersonalInfoCard
					icon={User}
					title="Personal Details"
					rows={personalRows}
					emptyMessage="No personal details available."
				/>
			</div>

			{/* Beneficiaries Section */}
			<section className="rounded-2xl border border-border bg-white shadow-sm">
				<div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-4">
					<div className="rounded-xl bg-primary/10 p-2 text-primary">
						<Baby className="h-4 w-4" />
					</div>
					<h3 className="text-base font-semibold text-foreground">Beneficiaries</h3>
				</div>

				{children.length > 0 ? (
					<div className="divide-y divide-border/70 px-5">
						{children.map((child: any, index: number) => (
							<div
								key={child.id || index}
								className="flex items-start justify-between gap-4 py-4">
								<div className="min-w-0 space-y-1">
									<p className="text-sm font-medium text-foreground">
										{child.firstName} {child.middleName} {child.lastName}
									</p>
									<p className="text-xs text-muted-foreground">
										DOB: {formatDate(child.dateOfBirth)}
										{child.gender ? ` • ${formatEnumLabel(child.gender)}` : ""}
										{child.isDependent ? " • Dependent" : ""}
									</p>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="px-5 py-8 text-center text-sm text-muted-foreground">
						<Baby className="mx-auto mb-2 h-5 w-5 opacity-40" />
						<p>No beneficiaries registered.</p>
					</div>
				)}
			</section>

			{isOwnProfile ? (
				<section
					className="rounded-2xl border border-border bg-muted/20 px-5 py-5"
					data-testid="employee-profile-actions">
					<h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
						Profile Actions
					</h2>
					<div className="grid gap-2">
						<Button
							variant="outline"
							onClick={onUpdateProfile}
							className="justify-start">
							<Settings className="h-4 w-4" />
							Update Profile
						</Button>
						<Button
							variant="outline"
							onClick={onChangePassword}
							className="justify-start">
							<KeyRound className="h-4 w-4" />
							Change Password
						</Button>
						<Button
							variant="outline"
							onClick={onResignationFlow}
							className="justify-start border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">
							<FileText className="h-4 w-4" />
							Resignation Requests
						</Button>
					</div>
				</section>
			) : null}
		</div>
	);
}

function PersonalInfoCard({
	icon: Icon,
	title,
	rows,
	emptyMessage,
}: {
	icon: typeof Mail;
	title: string;
	rows: Array<{
		label: string;
		value: ReactNode;
		hint?: ReactNode;
	}>;
	emptyMessage?: string;
}) {
	const visibleRows = rows.filter((row) => {
		if (typeof row.value === "string") {
			return row.value.trim().length > 0;
		}
		return row.value !== null && row.value !== undefined;
	});

	return (
		<section className="rounded-2xl border border-border bg-white shadow-sm">
			<div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-4">
				<div className="rounded-xl bg-primary/10 p-2 text-primary">
					<Icon className="h-4 w-4" />
				</div>
				<h3 className="text-base font-semibold text-foreground">{title}</h3>
			</div>

			{visibleRows.length > 0 ? (
				<div className="divide-y divide-border/70 px-5">
					{visibleRows.map((row) => (
						<div
							key={`${title}-${row.label}`}
							className="flex items-start justify-between gap-4 py-4">
							<div className="min-w-0 space-y-1">
								<p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
									{row.label}
								</p>
								{row.hint ? (
									<p className="text-sm text-muted-foreground">{row.hint}</p>
								) : null}
							</div>
							<div className="min-w-0 text-right text-sm font-medium text-foreground">
								{row.value}
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="px-5 py-8 text-center text-sm text-muted-foreground">
					<Icon className="mx-auto mb-2 h-5 w-5 opacity-40" />
					<p>{emptyMessage || "No information available."}</p>
				</div>
			)}
		</section>
	);
}