import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Card, CardContent } from "~/components/atoms/Card";
import { useState } from "react";
import { Plus, X, Phone, MapPin, User } from "lucide-react";

export type SectionStatus = "not-started" | "in-progress" | "completed";

interface PersonalDetailsFormProps {
	form: any;
	onComplete: () => void;
	status: SectionStatus;
}

const countries = [
	{ value: "USA", label: "United States" },
	{ value: "PHL", label: "Philippines" },
	{ value: "CAN", label: "Canada" },
	{ value: "GBR", label: "United Kingdom" },
	{ value: "AUS", label: "Australia" },
];

const nationalities = [
	{ value: "American", label: "American" },
	{ value: "Filipino", label: "Filipino" },
	{ value: "Canadian", label: "Canadian" },
	{ value: "British", label: "British" },
	{ value: "Australian", label: "Australian" },
];

const languages = [
	{ value: "English", label: "English" },
	{ value: "Filipino", label: "Filipino" },
	{ value: "Spanish", label: "Spanish" },
	{ value: "French", label: "French" },
	{ value: "German", label: "German" },
];

const genders = [
	{ value: "male", label: "Male" },
	{ value: "female", label: "Female" },
	{ value: "other", label: "Other" },
	{ value: "prefer_not_to_say", label: "Prefer not to say" },
	{ value: "unknown", label: "Unknown" },
	{ value: "not_applicable", label: "Not applicable" },
];

const phoneTypes = [
	{ value: "mobile", label: "Mobile" },
	{ value: "home", label: "Home" },
	{ value: "work", label: "Work" },
	{ value: "emergency", label: "Emergency" },
	{ value: "fax", label: "Fax" },
	{ value: "pager", label: "Pager" },
	{ value: "main", label: "Main" },
	{ value: "other", label: "Other" },
];

const countryCodes = [
	{ value: "+1", label: "+1 (US/CA)" },
	{ value: "+63", label: "+63 (PH)" },
	{ value: "+44", label: "+44 (UK)" },
	{ value: "+61", label: "+61 (AU)" },
];

const identificationTypes = [
	{ value: "passport", label: "Passport" },
	{ value: "drivers_license", label: "Driver's License" },
	{ value: "national_id", label: "National ID" },
	{ value: "postal_id", label: "Postal ID" },
	{ value: "voters_id", label: "Voter's ID" },
	{ value: "senior_citizen_id", label: "Senior Citizen ID" },
	{ value: "company_id", label: "Company ID" },
	{ value: "school_id", label: "School ID" },
];

export function PersonalDetailsForm({ form, onComplete, status }: PersonalDetailsFormProps) {
	const {
		register,
		formState: { errors },
		trigger,
		watch,
		setValue,
	} = form;

	const isCompleted = status === "completed";
	// Note: isCompleted is only used for UI indicators, not for disabling fields
	// Fields remain editable even after completion so users can go back and edit

	// Watch the phones array to manage dynamic phone fields
	const phones = watch("person.contactInfo.phones") || [];

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const isValid = await trigger("person");
		if (isValid) {
			onComplete();
		}
	};

	const addPhone = () => {
		const newPhones = [
			...phones,
			{ type: "mobile", countryCode: "+63", number: "", isPrimary: false },
		];
		setValue("person.contactInfo.phones", newPhones);
	};

	const removePhone = (index: number) => {
		const newPhones = phones.filter((_: any, i: number) => i !== index);
		setValue("person.contactInfo.phones", newPhones);
	};

	const setPrimaryPhone = (index: number) => {
		const newPhones = phones.map((phone: any, i: number) => ({
			...phone,
			isPrimary: i === index,
		}));
		setValue("person.contactInfo.phones", newPhones);
	};

	return (
		<Card className="border border-gray-200 bg-white">
			<CardContent className="p-6">
				<div className="space-y-8">
					<div>
						<h2 className="text-xl font-semibold text-gray-900">
							Personal Information
						</h2>
						<p className="text-sm text-gray-600 mt-1">
							Enter comprehensive personal and contact details
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-8">
						{/* Personal Information Section */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 pb-2 border-b border-gray-200">
								<User className="h-5 w-5 text-orange-600" />
								<h3 className="text-lg font-medium text-gray-900">
									Personal Information
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label
										htmlFor="person.personalInfo.firstName"
										className="block text-sm font-medium text-gray-700 mb-1">
										First Name *
									</label>
									<Input
										id="person.personalInfo.firstName"
										type="text"
										placeholder="Bryan"
										className={
											errors.person?.personalInfo?.firstName
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.personalInfo.firstName", {
											required: "First name is required",
										})}
									/>
									{errors.person?.personalInfo?.firstName && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.firstName.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.personalInfo.middleName"
										className="block text-sm font-medium text-gray-700 mb-1">
										Middle Name
									</label>
									<Input
										id="person.personalInfo.middleName"
										type="text"
										placeholder="Sumayang"
										className={
											errors.person?.personalInfo?.middleName
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.personalInfo.middleName")}
									/>
									{errors.person?.personalInfo?.middleName && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.middleName.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.personalInfo.lastName"
										className="block text-sm font-medium text-gray-700 mb-1">
										Last Name *
									</label>
									<Input
										id="person.personalInfo.lastName"
										type="text"
										placeholder="Rubio"
										className={
											errors.person?.personalInfo?.lastName
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.personalInfo.lastName", {
											required: "Last name is required",
										})}
									/>
									{errors.person?.personalInfo?.lastName && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.lastName.message}
										</p>
									)}
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label
										htmlFor="person.personalInfo.dateOfBirth"
										className="block text-sm font-medium text-gray-700 mb-1">
										Date of Birth *
									</label>
									<Input
										id="person.personalInfo.dateOfBirth"
										type="date"
										className={
											errors.person?.personalInfo?.dateOfBirth
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.personalInfo.dateOfBirth", {
											required: "Date of birth is required",
										})}
									/>
									{errors.person?.personalInfo?.dateOfBirth && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.dateOfBirth.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.personalInfo.placeOfBirth"
										className="block text-sm font-medium text-gray-700 mb-1">
										Place of Birth
									</label>
									<Input
										id="person.personalInfo.placeOfBirth"
										type="text"
										placeholder="New York, USA"
										className={
											errors.person?.personalInfo?.placeOfBirth
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.personalInfo.placeOfBirth")}
									/>
									{errors.person?.personalInfo?.placeOfBirth && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.placeOfBirth.message}
										</p>
									)}
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label
										htmlFor="person.personalInfo.age"
										className="block text-sm font-medium text-gray-700 mb-1">
										Age
									</label>
									<Input
										id="person.personalInfo.age"
										type="number"
										placeholder="34"
										min="0"
										max="150"
										className={
											errors.person?.personalInfo?.age
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.personalInfo.age", {
											valueAsNumber: true,
											min: { value: 0, message: "Age must be at least 0" },
											max: { value: 150, message: "Age must be at most 150" },
										})}
									/>
									{errors.person?.personalInfo?.age && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.age.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.personalInfo.nationality"
										className="block text-sm font-medium text-gray-700 mb-1">
										Nationality
									</label>
									<select
										id="person.personalInfo.nationality"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.person?.personalInfo?.nationality
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("person.personalInfo.nationality")}>
										<option value="">Select Nationality</option>
										{nationalities.map((nationality) => (
											<option
												key={nationality.value}
												value={nationality.value}>
												{nationality.label}
											</option>
										))}
									</select>
									{errors.person?.personalInfo?.nationality && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.nationality.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.personalInfo.gender"
										className="block text-sm font-medium text-gray-700 mb-1">
										Gender
									</label>
									<select
										id="person.personalInfo.gender"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.person?.personalInfo?.gender
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("person.personalInfo.gender")}>
										<option value="">Select Gender</option>
										{genders.map((gender) => (
											<option key={gender.value} value={gender.value}>
												{gender.label}
											</option>
										))}
									</select>
									{errors.person?.personalInfo?.gender && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.personalInfo.gender.message}
										</p>
									)}
								</div>
							</div>

							<div>
								<label
									htmlFor="person.personalInfo.primaryLanguage"
									className="block text-sm font-medium text-gray-700 mb-1">
									Primary Language
								</label>
								<select
									id="person.personalInfo.primaryLanguage"
									className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
										errors.person?.personalInfo?.primaryLanguage
											? "border-red-300 focus:border-red-500"
											: "border-gray-300"
									} ${isCompleted ? "bg-gray-100" : ""}`}
									{...register("person.personalInfo.primaryLanguage")}>
									<option value="">Select Primary Language</option>
									{languages.map((language) => (
										<option key={language.value} value={language.value}>
											{language.label}
										</option>
									))}
								</select>
								{errors.person?.personalInfo?.primaryLanguage && (
									<p className="mt-1 text-sm text-red-600">
										{errors.person.personalInfo.primaryLanguage.message}
									</p>
								)}
							</div>
						</div>

						{/* Contact Information Section */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 pb-2 border-b border-gray-200">
								<Phone className="h-5 w-5 text-orange-600" />
								<h3 className="text-lg font-medium text-gray-900">
									Contact Information
								</h3>
							</div>

							<div>
								<label
									htmlFor="person.contactInfo.email"
									className="block text-sm font-medium text-gray-700 mb-1">
									Contact Email *
								</label>
								<Input
									id="person.contactInfo.email"
									type="email"
									placeholder="employeebandai@gmail.com"
									className={
										errors.person?.contactInfo?.email
											? "border-red-300 focus:border-red-500"
											: ""
									}
									{...register("person.contactInfo.email", {
										required: "Contact email is required",
										pattern: {
											value: /\S+@\S+\.\S+/,
											message: "Email is invalid",
										},
									})}
								/>
								{errors.person?.contactInfo?.email && (
									<p className="mt-1 text-sm text-red-600">
										{errors.person.contactInfo.email.message}
									</p>
								)}
							</div>

							{/* Phone Numbers */}
							<div>
								<div className="flex items-center justify-between mb-2">
									<label className="block text-sm font-medium text-gray-700">
										Phone Numbers *
									</label>
									{!isCompleted && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={addPhone}
											className="text-xs">
											<Plus className="h-3 w-3 mr-1" />
											Add Phone
										</Button>
									)}
								</div>

								{phones.map((phone: any, index: number) => (
									<div
										key={index}
										className="grid grid-cols-12 gap-2 mb-3 items-end">
										<div className="col-span-3">
											<select
												className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
													errors.person?.contactInfo?.phones?.[index]
														?.type
														? "border-red-300 focus:border-red-500"
														: "border-gray-300"
												}`}
												{...register(
													`person.contactInfo.phones.${index}.type`,
												)}>
												{phoneTypes.map((type) => (
													<option key={type.value} value={type.value}>
														{type.label}
													</option>
												))}
											</select>
										</div>
										<div className="col-span-2">
											<select
												className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
													errors.person?.contactInfo?.phones?.[index]
														?.countryCode
														? "border-red-300 focus:border-red-500"
														: "border-gray-300"
												}`}
												{...register(
													`person.contactInfo.phones.${index}.countryCode`,
												)}>
												{countryCodes.map((code) => (
													<option key={code.value} value={code.value}>
														{code.label}
													</option>
												))}
											</select>
										</div>
										<div className="col-span-5">
											<Input
												type="tel"
												placeholder="5551234567"
												className={
													errors.person?.contactInfo?.phones?.[index]
														?.number
														? "border-red-300 focus:border-red-500"
														: ""
												}
												{...register(
													`person.contactInfo.phones.${index}.number`,
													{
														required: "Phone number is required",
														pattern: {
															value: /^\d{7,15}$/,
															message: "Invalid phone number format",
														},
													},
												)}
											/>
										</div>
										<div className="col-span-1">
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => setPrimaryPhone(index)}
												disabled={phone.isPrimary}
												className={`text-xs ${
													phone.isPrimary
														? "bg-orange-100 border-orange-300"
														: ""
												}`}>
												Primary
											</Button>
										</div>
										<div className="col-span-1">
											{!isCompleted && phones.length > 1 && (
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => removePhone(index)}
													className="text-red-600 hover:bg-red-50">
													<X className="h-3 w-3" />
												</Button>
											)}
										</div>
									</div>
								))}

								{phones.length === 0 && (
									<p className="text-sm text-gray-500 italic">
										No phone numbers added
									</p>
								)}
							</div>
						</div>

						{/* Address Section */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 pb-2 border-b border-gray-200">
								<MapPin className="h-5 w-5 text-orange-600" />
								<h3 className="text-lg font-medium text-gray-900">
									Address Information
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="md:col-span-2">
									<label
										htmlFor="person.contactInfo.address.0.street"
										className="block text-sm font-medium text-gray-700 mb-1">
										Street Address *
									</label>
									<Input
										id="person.contactInfo.address.0.street"
										type="text"
										placeholder="123 Main Street"
										className={
											errors.person?.contactInfo?.address?.street
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.contactInfo.address.0.street", {
											required: "Street address is required",
										})}
									/>
									{errors.person?.contactInfo?.address?.[0]?.street && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.contactInfo.address[0].street.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.contactInfo.address.0.houseNumber"
										className="block text-sm font-medium text-gray-700 mb-1">
										House Number
									</label>
									<Input
										id="person.contactInfo.address.0.houseNumber"
										type="text"
										placeholder="123"
										className={
											errors.person?.contactInfo?.address?.houseNumber
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.contactInfo.address.0.houseNumber")}
									/>
								</div>

								<div>
									<label
										htmlFor="person.contactInfo.address.0.city"
										className="block text-sm font-medium text-gray-700 mb-1">
										City *
									</label>
									<Input
										id="person.contactInfo.address.0.city"
										type="text"
										placeholder="New York"
										className={
											errors.person?.contactInfo?.address?.city
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.contactInfo.address.0.city", {
											required: "City is required",
										})}
									/>
									{errors.person?.contactInfo?.address?.[0]?.city && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.contactInfo.address[0].city.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.contactInfo.address.0.state"
										className="block text-sm font-medium text-gray-700 mb-1">
										State/Province *
									</label>
									<Input
										id="person.contactInfo.address.0.state"
										type="text"
										placeholder="NY"
										className={
											errors.person?.contactInfo?.address?.state
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.contactInfo.address.0.state", {
											required: "State/Province is required",
										})}
									/>
									{errors.person?.contactInfo?.address?.[0]?.state && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.contactInfo.address[0].state.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.contactInfo.address.0.country"
										className="block text-sm font-medium text-gray-700 mb-1">
										Country *
									</label>
									<select
										id="person.contactInfo.address.0.country"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.person?.contactInfo?.address?.country
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("person.contactInfo.address.0.country", {
											required: "Country is required",
										})}>
										<option value="">Select Country</option>
										{countries.map((country) => (
											<option key={country.value} value={country.value}>
												{country.label}
											</option>
										))}
									</select>
									{errors.person?.contactInfo?.address?.[0]?.country && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.contactInfo.address[0].country.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.contactInfo.address.0.postalCode"
										className="block text-sm font-medium text-gray-700 mb-1">
										Postal Code *
									</label>
									<Input
										id="person.contactInfo.address.0.postalCode"
										type="text"
										placeholder="10001"
										className={
											errors.person?.contactInfo?.address?.postalCode
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.contactInfo.address.0.postalCode", {
											required: "Postal code is required",
										})}
									/>
									{errors.person?.contactInfo?.address?.[0]?.postalCode && (
										<p className="mt-1 text-sm text-red-600">
											{
												errors.person.contactInfo.address[0].postalCode
													.message
											}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.contactInfo.address.0.zipCode"
										className="block text-sm font-medium text-gray-700 mb-1">
										ZIP Code
									</label>
									<Input
										id="person.contactInfo.address.0.zipCode"
										type="text"
										placeholder="10001"
										className={
											errors.person?.contactInfo?.address?.zipCode
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.contactInfo.address.0.zipCode")}
									/>
								</div>
							</div>
						</div>

						{/* Identification Section */}
						<div className="space-y-4">
							<div className="flex items-center gap-2 pb-2 border-b border-gray-200">
								<User className="h-5 w-5 text-orange-600" />
								<h3 className="text-lg font-medium text-gray-900">
									Identification
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label
										htmlFor="person.identification.type"
										className="block text-sm font-medium text-gray-700 mb-1">
										ID Type
									</label>
									<select
										id="person.identification.type"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.person?.identification?.type
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("person.identification.type")}>
										<option value="">Select ID Type</option>
										{identificationTypes.map((type) => (
											<option key={type.value} value={type.value}>
												{type.label}
											</option>
										))}
									</select>
									{errors.person?.identification?.type && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.identification.type.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.identification.number"
										className="block text-sm font-medium text-gray-700 mb-1">
										ID Number
									</label>
									<Input
										id="person.identification.number"
										type="text"
										placeholder="DL123456789"
										className={
											errors.person?.identification?.number
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.identification.number")}
									/>
									{errors.person?.identification?.number && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.identification.number.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.identification.issuingCountry"
										className="block text-sm font-medium text-gray-700 mb-1">
										Issuing Country
									</label>
									<select
										id="person.identification.issuingCountry"
										className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
											errors.person?.identification?.issuingCountry
												? "border-red-300 focus:border-red-500"
												: "border-gray-300"
										}`}
										{...register("person.identification.issuingCountry")}>
										<option value="">Select Country</option>
										{countries.map((country) => (
											<option key={country.value} value={country.value}>
												{country.label}
											</option>
										))}
									</select>
									{errors.person?.identification?.issuingCountry && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.identification.issuingCountry.message}
										</p>
									)}
								</div>

								<div>
									<label
										htmlFor="person.identification.expiryDate"
										className="block text-sm font-medium text-gray-700 mb-1">
										Expiry Date
									</label>
									<Input
										id="person.identification.expiryDate"
										type="date"
										className={
											errors.person?.identification?.expiryDate
												? "border-red-300 focus:border-red-500"
												: ""
										}
										{...register("person.identification.expiryDate")}
									/>
									{errors.person?.identification?.expiryDate && (
										<p className="mt-1 text-sm text-red-600">
											{errors.person.identification.expiryDate.message}
										</p>
									)}
								</div>
							</div>
						</div>

						{!isCompleted && (
							<div className="pt-6 border-t border-gray-200">
								<Button
									type="submit"
									className="bg-orange-600 hover:bg-orange-700 text-white">
									Save & Continue
								</Button>
							</div>
						)}

						{isCompleted && (
							<div className="pt-4">
								<div className="flex items-center gap-2 text-green-600">
									<svg
										className="h-4 w-4"
										fill="currentColor"
										viewBox="0 0 20 20">
										<path
											fillRule="evenodd"
											d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
											clipRule="evenodd"
										/>
									</svg>
									<span className="text-sm font-medium">
										Personal details saved successfully
									</span>
								</div>
							</div>
						)}
					</form>
				</div>
			</CardContent>
		</Card>
	);
}
