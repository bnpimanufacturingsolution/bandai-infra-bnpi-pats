import type { Employee } from "~/services/employees.service";
import { Mail, Phone, MapPin, User, Globe, Calendar, Languages } from "lucide-react";

interface PersonalInfoTabProps {
	employee: Employee;
}

export function PersonalInfoTab({ employee }: PersonalInfoTabProps) {
	const personalInfo = employee.person?.personalInfo || {};
	const contactInfo = employee.person?.contactInfo || {};
	const primaryAddress = contactInfo.address?.[0];
	const primaryPhone = contactInfo.phones?.find((p) => p.isPrimary);
	const otherPhones = contactInfo.phones?.filter((p) => !p.isPrimary) || [];

	const formatDate = (date: string | undefined) => {
		if (!date) return "N/A";
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const calculateAge = (dob: string | undefined) => {
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

	return (
		<div className="space-y-8">
			{/* Contact Information Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<Phone className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Contact Information</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Email */}
						{contactInfo.email && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Mail className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">Email</span>
								</div>
								<a
									href={`mailto:${contactInfo.email}`}
									className="text-sm text-gray-600 hover:text-orange-600 transition-colors">
									{contactInfo.email}
								</a>
							</div>
						)}

						{/* Primary Phone */}
						{primaryPhone && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Phone className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Phone (Primary)
									</span>
								</div>
								<a
									href={`tel:${primaryPhone.countryCode}${primaryPhone.number}`}
									className="text-sm text-gray-600 hover:text-orange-600 transition-colors">
									{primaryPhone.countryCode} {primaryPhone.number}
								</a>
							</div>
						)}

						{/* Other Phones */}
						{otherPhones.map((phone, idx) => (
							<div
								key={idx}
								className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Phone className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Phone ({phone.type})
									</span>
								</div>
								<a
									href={`tel:${phone.countryCode}${phone.number}`}
									className="text-sm text-gray-600 hover:text-orange-600 transition-colors">
									{phone.countryCode} {phone.number}
								</a>
							</div>
						))}

						{/* Address */}
						{primaryAddress && (
							<div className="flex items-start justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
									<span className="text-sm font-medium text-gray-700">
										Address
									</span>
								</div>
								<div className="text-sm text-gray-600 text-right max-w-xs">
									<p>{primaryAddress.street}</p>
									{primaryAddress.address2 && <p>{primaryAddress.address2}</p>}
									<p>
										{primaryAddress.city}, {primaryAddress.state}{" "}
										{primaryAddress.postalCode}
									</p>
									<p>{primaryAddress.country}</p>
								</div>
							</div>
						)}

						{/* Show empty state if no contact info */}
						{!contactInfo.email &&
							!primaryPhone &&
							otherPhones.length === 0 &&
							!primaryAddress && (
								<div className="px-4 py-8 text-center">
									<Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
									<p className="text-sm text-gray-500">
										No contact information available
									</p>
								</div>
							)}
					</div>
				</div>
			</section>

			{/* Personal Details Section */}
			<section>
				<div className="flex items-center gap-2 mb-4">
					<div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
						<User className="w-4 h-4 text-orange-600" />
					</div>
					<h3 className="text-base font-semibold text-gray-900">Personal Details</h3>
				</div>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					<div className="divide-y divide-gray-100">
						{/* Date of Birth */}
						{personalInfo.dateOfBirth && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Calendar className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Date of Birth
									</span>
								</div>
								<div className="text-sm text-gray-600">
									{formatDate(personalInfo.dateOfBirth)}
									{calculateAge(personalInfo.dateOfBirth) && (
										<span className="text-gray-400 ml-2">
											({calculateAge(personalInfo.dateOfBirth)} years old)
										</span>
									)}
								</div>
							</div>
						)}

						{/* Place of Birth */}
						{personalInfo.placeOfBirth && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<MapPin className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Place of Birth
									</span>
								</div>
								<span className="text-sm text-gray-600">
									{personalInfo.placeOfBirth}
								</span>
							</div>
						)}

						{/* Gender */}
						{personalInfo.gender && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<User className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Gender
									</span>
								</div>
								<span className="text-sm text-gray-600 capitalize">
									{personalInfo.gender}
								</span>
							</div>
						)}

						{/* Nationality */}
						{personalInfo.nationality && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Globe className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Nationality
									</span>
								</div>
								<span className="text-sm text-gray-600">
									{personalInfo.nationality}
								</span>
							</div>
						)}

						{/* Primary Language */}
						{personalInfo.primaryLanguage && (
							<div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
								<div className="flex items-center gap-3">
									<Languages className="w-4 h-4 text-gray-400" />
									<span className="text-sm font-medium text-gray-700">
										Primary Language
									</span>
								</div>
								<span className="text-sm text-gray-600 capitalize">
									{personalInfo.primaryLanguage}
								</span>
							</div>
						)}

						{/* Show empty state if no personal details */}
						{!personalInfo.dateOfBirth &&
							!personalInfo.placeOfBirth &&
							!personalInfo.gender &&
							!personalInfo.nationality &&
							!personalInfo.primaryLanguage && (
								<div className="px-4 py-8 text-center">
									<User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
									<p className="text-sm text-gray-500">
										No personal details available
									</p>
								</div>
							)}
					</div>
				</div>
			</section>
		</div>
	);
}
