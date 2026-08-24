import type { UseFormReturn } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { FormCharHint } from "~/components/molecules/FormCharHint";
import { EMPLOYEE_FORM_LIMITS } from "~/zod/employee-form.rhf.zod";
import { SearchableSelect } from "~/components/ui/searchable-select";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import {
	MAX_ALLOWED_DATE_INPUT,
	MIN_ALLOWED_DATE_INPUT,
	parseDateInputAsUtcDate,
} from "~/lib/utils/date-validation";
import type { FormData } from "~/types/employee-form.types";

interface PersonalIDsFormProps {
	form: UseFormReturn<FormData>;
	lockApplicantIdentity?: boolean;
}

const genderOptions = [
	{ value: "male", label: "Male" },
	{ value: "female", label: "Female" },
	{ value: "other", label: "Other" },
	{ value: "prefer_not_to_say", label: "Prefer not to say" },
];

const nationalityOptions = [
	{ value: "Filipino", label: "Filipino" },
	{ value: "American", label: "American" },
	{ value: "Australian", label: "Australian" },
	{ value: "British", label: "British" },
	{ value: "Canadian", label: "Canadian" },
	{ value: "Chinese", label: "Chinese" },
	{ value: "Indian", label: "Indian" },
	{ value: "Indonesian", label: "Indonesian" },
	{ value: "Japanese", label: "Japanese" },
	{ value: "Korean", label: "Korean" },
	{ value: "Malaysian", label: "Malaysian" },
	{ value: "Singaporean", label: "Singaporean" },
	{ value: "Thai", label: "Thai" },
	{ value: "Vietnamese", label: "Vietnamese" },
];

const normalizeNationalityValue = (value: unknown) => {
	const nationality = String(value || "").trim();
	if (!nationality) return "Filipino";
	const normalized = nationality.toLowerCase();
	if (normalized === "phl" || normalized === "ph" || normalized === "philippines") {
		return "Filipino";
	}
	return nationality;
};

const countryOptions = [
	{ value: "Philippines", label: "Philippines" },
	{ value: "United States", label: "United States" },
	{ value: "Australia", label: "Australia" },
	{ value: "United Kingdom", label: "United Kingdom" },
	{ value: "Canada", label: "Canada" },
	{ value: "China", label: "China" },
	{ value: "India", label: "India" },
	{ value: "Indonesia", label: "Indonesia" },
	{ value: "Japan", label: "Japan" },
	{ value: "South Korea", label: "South Korea" },
	{ value: "Malaysia", label: "Malaysia" },
	{ value: "Singapore", label: "Singapore" },
	{ value: "Thailand", label: "Thailand" },
	{ value: "Vietnam", label: "Vietnam" },
];

const countryCodeOptions = [
	{ value: "+63", label: "+63 (Philippines)" },
	{ value: "+1", label: "+1 (USA/Canada)" },
	{ value: "+61", label: "+61 (Australia)" },
	{ value: "+44", label: "+44 (UK)" },
	{ value: "+86", label: "+86 (China)" },
	{ value: "+91", label: "+91 (India)" },
	{ value: "+62", label: "+62 (Indonesia)" },
	{ value: "+81", label: "+81 (Japan)" },
	{ value: "+82", label: "+82 (South Korea)" },
	{ value: "+60", label: "+60 (Malaysia)" },
	{ value: "+65", label: "+65 (Singapore)" },
	{ value: "+66", label: "+66 (Thailand)" },
	{ value: "+84", label: "+84 (Vietnam)" },
];

const phoneTypeOptions = [
	{ value: "mobile", label: "Mobile" },
	{ value: "home", label: "Home" },
	{ value: "work", label: "Work" },
	{ value: "emergency", label: "Emergency" },
];

const idTypeOptions = [
	{ value: "passport", label: "Passport" },
	{ value: "drivers_license", label: "Driver's License" },
	{ value: "national_id", label: "National ID" },
	{ value: "postal_id", label: "Postal ID" },
	{ value: "voters_id", label: "Voter's ID" },
];

export function PersonalIDsForm({ form, lockApplicantIdentity = false }: PersonalIDsFormProps) {
	const {
		register,
		control,
		formState: { errors },
	} = form;
	const firstNameLen = (useWatch({ control, name: "person.personalInfo.firstName" }) ?? "")
		.length;
	const middleNameLen = (useWatch({ control, name: "person.personalInfo.middleName" }) ?? "")
		.length;
	const lastNameLen = (useWatch({ control, name: "person.personalInfo.lastName" }) ?? "").length;
	const emailLen = (useWatch({ control, name: "person.contactInfo.email" }) ?? "").length;
	const phoneLen = (useWatch({ control, name: "person.contactInfo.phones.0.number" }) ?? "")
		.length;
	const streetLen = (useWatch({ control, name: "person.contactInfo.address.0.street" }) ?? "")
		.length;
	const houseNumLen = (
		useWatch({ control, name: "person.contactInfo.address.0.houseNumber" }) ?? ""
	).length;
	const cityLen = (useWatch({ control, name: "person.contactInfo.address.0.city" }) ?? "").length;
	const stateLen = (useWatch({ control, name: "person.contactInfo.address.0.state" }) ?? "")
		.length;
	const postalLen = (useWatch({ control, name: "person.contactInfo.address.0.postalCode" }) ?? "")
		.length;
	const zipLen = (useWatch({ control, name: "person.contactInfo.address.0.zipCode" }) ?? "")
		.length;
	const idNumberLen = (useWatch({ control, name: "person.identification.number" }) ?? "").length;
	const minAllowedDate = parseDateInputAsUtcDate(MIN_ALLOWED_DATE_INPUT) || undefined;
	const maxAllowedDate = parseDateInputAsUtcDate(MAX_ALLOWED_DATE_INPUT) || undefined;
	const maxDateOfBirth = new Date();

	return (
		<div className="space-y-8">
			{/* Personal Information Section */}
			<div className="space-y-6">
				<h3 className="text-lg font-semibold text-foreground pb-2 border-b border-border">
					Personal Information
				</h3>
				{lockApplicantIdentity ? (
					<p className="text-sm text-muted-foreground">
						First name, last name, and email come from the public job application and cannot be changed here.
					</p>
				) : null}

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div data-field-path="person.personalInfo.firstName">
						<label className="block text-sm font-normal text-muted-foreground/70">
							First Name *
						</label>
						<input
							id="firstName"
							type="text"
							placeholder="Juan"
							className={`mt-1 w-full rounded-md border ${
								errors.person?.personalInfo?.firstName
									? "border-red-300 focus:border-red-500"
									: "border-border"
							} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70`}
							maxLength={EMPLOYEE_FORM_LIMITS.firstName}
							disabled={lockApplicantIdentity}
							{...register("person.personalInfo.firstName", {
								required: "First name is required",
							})}
						/>
						{errors.person?.personalInfo?.firstName && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.personalInfo.firstName.message}
							</p>
						)}
						<FormCharHint
							length={firstNameLen}
							max={EMPLOYEE_FORM_LIMITS.firstName}
							min={1}
						/>
					</div>

					<div data-field-path="person.personalInfo.middleName">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Middle Name
						</label>
						<input
							id="middleName"
							type="text"
							placeholder="Santos"
							className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary"
							maxLength={EMPLOYEE_FORM_LIMITS.middleName}
							{...register("person.personalInfo.middleName")}
						/>
						<FormCharHint
							length={middleNameLen}
							max={EMPLOYEE_FORM_LIMITS.middleName}
						/>
					</div>

					<div data-field-path="person.personalInfo.lastName">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Last Name *
						</label>
						<input
							id="lastName"
							type="text"
							placeholder="Dela Cruz"
							className={`mt-1 w-full rounded-md border ${
								errors.person?.personalInfo?.lastName
									? "border-red-300 focus:border-red-500"
									: "border-border"
							} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70`}
							maxLength={EMPLOYEE_FORM_LIMITS.lastName}
							disabled={lockApplicantIdentity}
							{...register("person.personalInfo.lastName", {
								required: "Last name is required",
							})}
						/>
						{errors.person?.personalInfo?.lastName && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.personalInfo.lastName.message}
							</p>
						)}
						<FormCharHint
							length={lastNameLen}
							max={EMPLOYEE_FORM_LIMITS.lastName}
							min={1}
						/>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div data-field-path="person.personalInfo.dateOfBirth">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Date of Birth *
						</label>
						<Controller
							name="person.personalInfo.dateOfBirth"
							control={control}
							rules={{ required: "Date of birth is required" }}
							render={({ field }) => (
								<CalendarDatePicker
									value={field.value || ""}
									onChange={field.onChange}
									minDate={minAllowedDate}
									maxDate={maxDateOfBirth}
									className={
										errors.person?.personalInfo?.dateOfBirth
											? "mt-1 border-red-300 focus:border-red-500 focus-visible:ring-red-500/20"
											: "mt-1"
									}
								/>
							)}
						/>
						{errors.person?.personalInfo?.dateOfBirth && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.personalInfo.dateOfBirth.message}
							</p>
						)}
					</div>

					<div data-field-path="person.personalInfo.gender">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Gender *
						</label>
						<Controller
							name="person.personalInfo.gender"
							control={control}
							rules={{ required: "Gender is required" }}
							render={({ field }) => (
								<SearchableSelect
									options={genderOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select gender"
									searchPlaceholder="Search gender..."
									className={
										errors.person?.personalInfo?.gender
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{errors.person?.personalInfo?.gender && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.personalInfo.gender.message}
							</p>
						)}
					</div>

					<div data-field-path="person.personalInfo.nationality">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Nationality *
						</label>
						<Controller
							name="person.personalInfo.nationality"
							control={control}
							rules={{ required: "Nationality is required" }}
							render={({ field }) => (
								<SearchableSelect
									options={nationalityOptions}
									value={normalizeNationalityValue(field.value)}
									onValueChange={field.onChange}
									placeholder="Select nationality"
									searchPlaceholder="Search nationality..."
									className={
										errors.person?.personalInfo?.nationality
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{errors.person?.personalInfo?.nationality && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.personalInfo.nationality.message}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Contact Information Section */}
			<div className="space-y-6 pt-6 border-t border-border">
				<h3 className="text-lg font-semibold text-foreground">Contact Information</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div data-field-path="person.contactInfo.email">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Email Address *
						</label>
						<input
							id="email"
							type="email"
							placeholder="juan.delacruz@example.com"
							className={`mt-1 w-full rounded-md border ${
								errors.person?.contactInfo?.email
									? "border-red-300 focus:border-red-500"
									: "border-border"
							} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70`}
							maxLength={EMPLOYEE_FORM_LIMITS.contactEmail}
							disabled={lockApplicantIdentity}
							{...register("person.contactInfo.email", {
								required: "Email is required",
							})}
						/>
						{errors.person?.contactInfo?.email && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.contactInfo.email.message}
							</p>
						)}
						<FormCharHint
							length={emailLen}
							max={EMPLOYEE_FORM_LIMITS.contactEmail}
							min={1}
						/>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					<div data-field-path="person.contactInfo.phones.0.type">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Phone Type *
						</label>
						<Controller
							name="person.contactInfo.phones.0.type"
							control={control}
							rules={{ required: "Phone type is required" }}
							render={({ field }) => (
								<SearchableSelect
									options={phoneTypeOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select type"
									searchPlaceholder="Search type..."
									className={
										errors.person?.contactInfo?.phones?.[0]?.type
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{errors.person?.contactInfo?.phones?.[0]?.type && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.contactInfo.phones[0].type.message}
							</p>
						)}
					</div>

					<div data-field-path="person.contactInfo.phones.0.countryCode">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Country Code *
						</label>
						<Controller
							name="person.contactInfo.phones.0.countryCode"
							control={control}
							rules={{ required: "Country code is required" }}
							render={({ field }) => (
								<SearchableSelect
									options={countryCodeOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select country code"
									searchPlaceholder="Search country code..."
									className={
										errors.person?.contactInfo?.phones?.[0]?.countryCode
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{errors.person?.contactInfo?.phones?.[0]?.countryCode && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.contactInfo.phones[0].countryCode.message}
							</p>
						)}
					</div>

					<div data-field-path="person.contactInfo.phones.0.number">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Phone Number *
						</label>
						<input
							type="text"
							placeholder="9123456789"
							className={`mt-1 w-full rounded-md border ${
								errors.person?.contactInfo?.phones?.[0]?.number
									? "border-red-300 focus:border-red-500"
									: "border-border"
							} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
							maxLength={EMPLOYEE_FORM_LIMITS.phoneNumber}
							{...register("person.contactInfo.phones.0.number", {
								required: "Phone number is required",
							})}
						/>
						{errors.person?.contactInfo?.phones?.[0]?.number && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.contactInfo.phones[0].number.message}
							</p>
						)}
						<FormCharHint
							length={phoneLen}
							max={EMPLOYEE_FORM_LIMITS.phoneNumber}
							min={1}
						/>
					</div>
				</div>

				{/* Address Section */}
				<div className="space-y-6 pt-6 border-t border-border">
					<h3 className="text-lg font-semibold text-foreground">Address</h3>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div data-field-path="person.contactInfo.address.0.street">
							<label className="block text-sm font-normal text-muted-foreground/70">
								Street Address *
							</label>
							<input
								type="text"
								placeholder="123 Main St"
								className={`mt-1 w-full rounded-md border ${
									errors.person?.contactInfo?.address?.[0]?.street
										? "border-red-300 focus:border-red-500"
										: "border-border"
								} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
								maxLength={EMPLOYEE_FORM_LIMITS.street}
								{...register("person.contactInfo.address.0.street", {
									required: "Street address is required",
								})}
							/>
							{errors.person?.contactInfo?.address?.[0]?.street && (
								<p className="mt-1 text-sm text-red-600">
									{errors.person.contactInfo.address[0].street.message}
								</p>
							)}
							<FormCharHint
								length={streetLen}
								max={EMPLOYEE_FORM_LIMITS.street}
								min={1}
							/>
						</div>

						<div data-field-path="person.contactInfo.address.0.houseNumber">
							<label className="block text-sm font-normal text-muted-foreground/70">
								House Number *
							</label>
							<input
								type="text"
								placeholder="123"
								className={`mt-1 w-full rounded-md border ${
									errors.person?.contactInfo?.address?.[0]?.houseNumber
										? "border-red-300 focus:border-red-500"
										: "border-border"
								} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
								maxLength={32}
								{...register("person.contactInfo.address.0.houseNumber", {
									required: "House number is required",
								})}
							/>
							{errors.person?.contactInfo?.address?.[0]?.houseNumber && (
								<p className="mt-1 text-sm text-red-600">
									{errors.person.contactInfo.address[0].houseNumber.message}
								</p>
							)}
							<FormCharHint length={houseNumLen} max={32} min={1} />
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div data-field-path="person.contactInfo.address.0.city">
							<label className="block text-sm font-normal text-muted-foreground/70">
								City *
							</label>
							<input
								type="text"
								placeholder="Manila"
								className={`mt-1 w-full rounded-md border ${
									errors.person?.contactInfo?.address?.[0]?.city
										? "border-red-300 focus:border-red-500"
										: "border-border"
								} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
								maxLength={EMPLOYEE_FORM_LIMITS.city}
								{...register("person.contactInfo.address.0.city", {
									required: "City is required",
								})}
							/>
							{errors.person?.contactInfo?.address?.[0]?.city && (
								<p className="mt-1 text-sm text-red-600">
									{errors.person.contactInfo.address[0].city.message}
								</p>
							)}
							<FormCharHint
								length={cityLen}
								max={EMPLOYEE_FORM_LIMITS.city}
								min={1}
							/>
						</div>

						<div data-field-path="person.contactInfo.address.0.state">
							<label className="block text-sm font-normal text-muted-foreground/70">
								State/Province *
							</label>
							<input
								type="text"
								placeholder="Metro Manila"
								className={`mt-1 w-full rounded-md border ${
									errors.person?.contactInfo?.address?.[0]?.state
										? "border-red-300 focus:border-red-500"
										: "border-border"
								} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
								maxLength={EMPLOYEE_FORM_LIMITS.state}
								{...register("person.contactInfo.address.0.state", {
									required: "State/Province is required",
								})}
							/>
							{errors.person?.contactInfo?.address?.[0]?.state && (
								<p className="mt-1 text-sm text-red-600">
									{errors.person.contactInfo.address[0].state.message}
								</p>
							)}
							<FormCharHint
								length={stateLen}
								max={EMPLOYEE_FORM_LIMITS.state}
								min={1}
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div data-field-path="person.contactInfo.address.0.country">
							<label className="block text-sm font-normal text-muted-foreground/70">
								Country *
							</label>
							<Controller
								name="person.contactInfo.address.0.country"
								control={control}
								rules={{ required: "Country is required" }}
								render={({ field }) => (
									<SearchableSelect
										options={countryOptions}
										value={field.value}
										onValueChange={field.onChange}
										placeholder="Select country"
										searchPlaceholder="Search country..."
										className={
											errors.person?.contactInfo?.address?.[0]?.country
												? "border-red-300 focus:border-red-500 focus:ring-red-500"
												: ""
										}
									/>
								)}
							/>
							{errors.person?.contactInfo?.address?.[0]?.country && (
								<p className="mt-1 text-sm text-red-600">
									{errors.person.contactInfo.address[0].country.message}
								</p>
							)}
						</div>

						<div data-field-path="person.contactInfo.address.0.postalCode">
							<label className="block text-sm font-normal text-muted-foreground/70">
								Postal Code *
							</label>
							<input
								type="text"
								placeholder="1000"
								className={`mt-1 w-full rounded-md border ${
									errors.person?.contactInfo?.address?.[0]?.postalCode
										? "border-red-300 focus:border-red-500"
										: "border-border"
								} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
								maxLength={EMPLOYEE_FORM_LIMITS.postalCode}
								{...register("person.contactInfo.address.0.postalCode", {
									required: "Postal code is required",
								})}
							/>
							{errors.person?.contactInfo?.address?.[0]?.postalCode && (
								<p className="mt-1 text-sm text-red-600">
									{errors.person.contactInfo.address[0].postalCode.message}
								</p>
							)}
							<FormCharHint
								length={postalLen}
								max={EMPLOYEE_FORM_LIMITS.postalCode}
								min={1}
							/>
						</div>

						<div data-field-path="person.contactInfo.address.0.zipCode">
							<label className="block text-sm font-normal text-muted-foreground/70">
								Zip Code *
							</label>
							<input
								type="text"
								placeholder="1000"
								className={`mt-1 w-full rounded-md border ${
									errors.person?.contactInfo?.address?.[0]?.zipCode
										? "border-red-300 focus:border-red-500"
										: "border-border"
								} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
								maxLength={EMPLOYEE_FORM_LIMITS.postalCode}
								{...register("person.contactInfo.address.0.zipCode", {
									required: "Zip code is required",
								})}
							/>
							{errors.person?.contactInfo?.address?.[0]?.zipCode && (
								<p className="mt-1 text-sm text-red-600">
									{errors.person.contactInfo.address[0].zipCode.message}
								</p>
							)}
							<FormCharHint
								length={zipLen}
								max={EMPLOYEE_FORM_LIMITS.postalCode}
								min={1}
							/>
						</div>
					</div>
				</div>
			</div>

			{/* Identification Document Section */}
			<div className="space-y-6 pt-6 border-t border-border">
				<h3 className="text-lg font-semibold text-foreground">Valid ID Document</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div data-field-path="person.identification.type">
						<label className="block text-sm font-normal text-muted-foreground/70">
							ID Type *
						</label>
						<Controller
							name="person.identification.type"
							control={control}
							rules={{ required: "ID type is required" }}
							render={({ field }) => (
								<SearchableSelect
									options={idTypeOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select ID type"
									searchPlaceholder="Search ID type..."
									className={
										errors.person?.identification?.type
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{errors.person?.identification?.type && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.identification.type.message}
							</p>
						)}
					</div>

					<div data-field-path="person.identification.number">
						<label className="block text-sm font-normal text-muted-foreground/70">
							ID Number *
						</label>
						<input
							type="text"
							placeholder="ABC123456"
							className={`mt-1 w-full rounded-md border ${
								errors.person?.identification?.number
									? "border-red-300 focus:border-red-500"
									: "border-border"
							} bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary`}
							maxLength={EMPLOYEE_FORM_LIMITS.idDocumentNumber}
							{...register("person.identification.number", {
								required: "ID number is required",
							})}
						/>
						{errors.person?.identification?.number && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.identification.number.message}
							</p>
						)}
						<FormCharHint
							length={idNumberLen}
							max={EMPLOYEE_FORM_LIMITS.idDocumentNumber}
							min={1}
						/>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div data-field-path="person.identification.issuingCountry">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Issuing Country *
						</label>
						<Controller
							name="person.identification.issuingCountry"
							control={control}
							rules={{ required: "Issuing country is required" }}
							render={({ field }) => (
								<SearchableSelect
									options={countryOptions}
									value={field.value}
									onValueChange={field.onChange}
									placeholder="Select issuing country"
									searchPlaceholder="Search country..."
									className={
										errors.person?.identification?.issuingCountry
											? "border-red-300 focus:border-red-500 focus:ring-red-500"
											: ""
									}
								/>
							)}
						/>
						{errors.person?.identification?.issuingCountry && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.identification.issuingCountry.message}
							</p>
						)}
					</div>

					<div data-field-path="person.identification.expiryDate">
						<label className="block text-sm font-normal text-muted-foreground/70">
							Expiry Date
						</label>
						<Controller
							name="person.identification.expiryDate"
							control={control}
							render={({ field }) => (
								<CalendarDatePicker
									value={field.value || ""}
									onChange={field.onChange}
									minDate={minAllowedDate}
									maxDate={maxAllowedDate}
									className={
										errors.person?.identification?.expiryDate
											? "mt-1 border-red-300 focus:border-red-500 focus-visible:ring-red-500/20"
											: "mt-1"
									}
								/>
							)}
						/>
						{errors.person?.identification?.expiryDate && (
							<p className="mt-1 text-sm text-red-600">
								{errors.person.identification.expiryDate.message}
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
