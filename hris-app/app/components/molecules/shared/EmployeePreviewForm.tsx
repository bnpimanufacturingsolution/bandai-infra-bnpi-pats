import { Button } from "~/components/atoms/Button";
import { Card, CardContent } from "~/components/atoms/Card";

import { Edit, User, Briefcase, Calendar, Clock, CalendarDays } from "lucide-react";
import type { FormData, SectionStatus } from "~/components/templates/add-employee-template";

interface EmployeePreviewFormProps {
	form: any;
	onEditSection: (sectionId: string) => void;
	onSubmit: () => void;
	status: SectionStatus;
	isEditMode?: boolean;
}

const scheduleTypes = [
	{ value: "full-time", label: "Full Time" },
	{ value: "part-time", label: "Part Time" },
	{ value: "contract", label: "Contract" },
	{ value: "flexible", label: "Flexible Hours" },
];

const weekDays = [
	{ value: "monday", label: "Monday" },
	{ value: "tuesday", label: "Tuesday" },
	{ value: "wednesday", label: "Wednesday" },
	{ value: "thursday", label: "Thursday" },
	{ value: "friday", label: "Friday" },
	{ value: "saturday", label: "Saturday" },
	{ value: "sunday", label: "Sunday" },
];

export function EmployeePreviewForm({
	form,
	onEditSection,
	onSubmit,
	status,
	isEditMode = false,
}: EmployeePreviewFormProps) {
	const formData = form.watch() as FormData;

	const isCompleted = status === "completed";

	const handleSubmit = () => {
		onSubmit();
	};

	return (
		<Card className="border border-gray-200 bg-white">
			<CardContent className="p-6">
				<div className="space-y-6">
					<div>
						<h2 className="text-xl font-semibold text-gray-900">Employee Preview</h2>
						<p className="text-sm text-gray-600 mt-1">
							{isEditMode
								? "Review all information before updating the employee"
								: "Review all information before adding the employee"}
						</p>
					</div>

					<div className="space-y-6">
						{/* User Account Section - Only show in add mode */}
						{!isEditMode && (
							<div className="border border-gray-200 rounded-lg p-4">
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										<User className="h-4 w-4 text-orange-600" />
										<h3 className="font-medium text-gray-900">User Account</h3>
									</div>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
									<div>
										<span className="font-medium text-gray-700">Email:</span>
										<span className="ml-2 text-gray-900">
											{formData.user?.email || "Not provided"}
										</span>
									</div>
									<div>
										<span className="font-medium text-gray-700">Username:</span>
										<span className="ml-2 text-gray-900">
											{formData.user?.userName || "Not provided"}
										</span>
									</div>
									<div>
										<span className="font-medium text-gray-700">Role ID:</span>
										<span className="ml-2 text-gray-900">
											{formData.user?.roleId || "Not provided"}
										</span>
									</div>
									<div>
										<span className="font-medium text-gray-700">Status:</span>
										<span className="ml-2 text-gray-900">
											{formData.user?.status || "Not provided"}
										</span>
									</div>
									<div className="md:col-span-2">
										<span className="font-medium text-gray-700">Password:</span>
										<span className="ml-2 text-gray-900">
											{"*".repeat(8)} (Temporary)
										</span>
									</div>
									<div className="md:col-span-2">
										<span className="font-medium text-gray-700">
											Login Method:
										</span>
										<span className="ml-2 text-gray-900">
											{formData.user?.loginMethod || "Not provided"}
										</span>
									</div>
								</div>
							</div>
						)}

						{/* Personal Details Section */}
						<div className="border border-gray-200 rounded-lg p-4">
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-2">
									<User className="h-4 w-4 text-orange-600" />
									<h3 className="font-medium text-gray-900">
										Personal Information
									</h3>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => onEditSection("personal-details")}
									className="text-xs">
									<Edit className="h-3 w-3 mr-1" />
									Edit
								</Button>
							</div>
							<div className="space-y-4">
								{/* Personal Info */}
								<div>
									<h4 className="text-sm font-semibold text-gray-800 mb-2">
										Personal Information
									</h4>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
										<div>
											<span className="font-medium text-gray-700">
												First Name:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.firstName ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Middle Name:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.middleName ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Last Name:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.lastName ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Date of Birth:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.dateOfBirth ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">Age:</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.age ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Gender:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.gender ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Nationality:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.nationality ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Primary Language:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.personalInfo?.primaryLanguage ||
													"Not provided"}
											</span>
										</div>
									</div>
								</div>

								{/* Contact Info */}
								<div>
									<h4 className="text-sm font-semibold text-gray-800 mb-2">
										Contact Information
									</h4>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
										<div className="md:col-span-2">
											<span className="font-medium text-gray-700">
												Contact Email:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.contactInfo?.email ||
													"Not provided"}
											</span>
										</div>
										<div className="md:col-span-2">
											<span className="font-medium text-gray-700">
												Phone Numbers:
											</span>
											<div className="ml-2 text-gray-900">
												{formData.person?.contactInfo?.phones &&
												formData.person.contactInfo.phones.length > 0 ? (
													formData.person.contactInfo.phones.map(
														(phone: any, index: number) => (
															<div key={index} className="text-sm">
																{phone.countryCode} {phone.number} (
																{phone.type}){" "}
																{phone.isPrimary && "(Primary)"}
															</div>
														),
													)
												) : (
													<span>Not provided</span>
												)}
											</div>
										</div>
										<div className="md:col-span-2">
											<span className="font-medium text-gray-700">
												Address:
											</span>
											<div className="ml-2 text-gray-900">
												{formData.person?.contactInfo?.address &&
												formData.person.contactInfo.address.length > 0 ? (
													<div className="text-sm">
														{formData.person.contactInfo.address[0]
															.houseNumber &&
															`${formData.person.contactInfo.address[0].houseNumber}, `}
														{
															formData.person.contactInfo.address[0]
																.street
														}
														<br />
														{
															formData.person.contactInfo.address[0]
																.city
														}
														,{" "}
														{
															formData.person.contactInfo.address[0]
																.state
														}
														<br />
														{
															formData.person.contactInfo.address[0]
																.country
														}{" "}
														{
															formData.person.contactInfo.address[0]
																.postalCode
														}
													</div>
												) : (
													<span>Not provided</span>
												)}
											</div>
										</div>
									</div>
								</div>

								{/* Identification */}
								<div>
									<h4 className="text-sm font-semibold text-gray-800 mb-2">
										Identification
									</h4>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
										<div>
											<span className="font-medium text-gray-700">
												ID Type:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.identification?.type ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												ID Number:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.identification?.number ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Issuing Country:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.identification?.issuingCountry ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Expiry Date:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.person?.identification?.expiryDate ||
													"Not provided"}
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Employee Details Section */}
						<div className="border border-gray-200 rounded-lg p-4">
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-2">
									<Briefcase className="h-4 w-4 text-orange-600" />
									<h3 className="font-medium text-gray-900">
										Employment Details
									</h3>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => onEditSection("employee-details")}
									className="text-xs">
									<Edit className="h-3 w-3 mr-1" />
									Edit
								</Button>
							</div>
							<div className="space-y-4">
								{/* Employment Information */}
								<div>
									<h4 className="text-sm font-semibold text-gray-800 mb-2">
										Employment Information
									</h4>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
										<div>
											<span className="font-medium text-gray-700">
												Employee ID:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.employeeId || "Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Employment Status:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.employmentStatus ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Employment Type:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.employmentType ||
													"Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Work Location:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.workLocation || "Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Department ID:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.departmentId || "Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Position ID:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.positionId || "Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Manager Status:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.isManager ? "Yes" : "No"}
											</span>
										</div>
									</div>
								</div>

								{/* Important Dates */}
								<div>
									<h4 className="text-sm font-semibold text-gray-800 mb-2">
										Important Dates
									</h4>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
										<div>
											<span className="font-medium text-gray-700">
												Hire Date:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.employmentHireDate ||
													"Not provided"}
											</span>
										</div>
										{formData.employee?.probationEndDate && (
											<div>
												<span className="font-medium text-gray-700">
													Probation End Date:
												</span>
												<span className="ml-2 text-gray-900">
													{formData.employee.probationEndDate}
												</span>
											</div>
										)}
									</div>
								</div>

								{/* Compensation */}
								<div>
									<h4 className="text-sm font-semibold text-gray-800 mb-2">
										Compensation
									</h4>
									<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
										<div>
											<span className="font-medium text-gray-700">
												Basic Salary:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.basicSalary
													? `${formData.employee.basicSalary} ${formData.employee.currency || ""}`
													: "Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Currency:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.currency || "Not provided"}
											</span>
										</div>
										<div>
											<span className="font-medium text-gray-700">
												Pay Frequency:
											</span>
											<span className="ml-2 text-gray-900">
												{formData.employee?.payFrequency || "Not provided"}
											</span>
										</div>
									</div>
								</div>

								{/* Documents */}
								{formData.employee?.documents &&
									formData.employee.documents.length > 0 && (
										<div>
											<h4 className="text-sm font-semibold text-gray-800 mb-2">
												Documents
											</h4>
											<div className="space-y-2">
												{formData.employee.documents.map(
													(doc: any, index: any) => (
														<div
															key={index}
															className="text-sm p-2 bg-gray-50 rounded">
															<div className="font-medium text-gray-700">
																{doc.type}
															</div>
															<div className="text-gray-600">
																Number: {doc.number}
															</div>
															<div className="text-gray-600">
																Issue Date: {doc.issueDate}
															</div>
															{doc.expiryDate && (
																<div className="text-gray-600">
																	Expiry Date: {doc.expiryDate}
																</div>
															)}
														</div>
													),
												)}
											</div>
										</div>
									)}

								{/* Leave Balances */}
								{formData.employee?.leaveBalances &&
									formData.employee.leaveBalances.length > 0 && (
										<div>
											<h4 className="text-sm font-semibold text-gray-800 mb-2">
												Leave Balances
											</h4>
											<div className="space-y-2">
												{formData.employee.leaveBalances.map(
													(lb: any, index: number) => (
														<div
															key={index}
															className="text-sm p-2 bg-gray-50 rounded">
															<div className="font-medium text-gray-700">
																{lb.leaveType}
															</div>
															<div className="grid grid-cols-2 gap-2 mt-1">
																<div className="text-gray-600">
																	Total Entitled:{" "}
																	{lb.totalEntitled}
																</div>
															</div>
															<div className="text-gray-600 mt-1">
																Period: {lb.periodStart} to{" "}
																{lb.periodEnd}
															</div>
														</div>
													),
												)}
											</div>
										</div>
									)}
							</div>
						</div>

						{/* Work Schedule Section - Show schedule ID if available */}
						{formData.employee?.defaultScheduleId && (
							<div className="border border-gray-200 rounded-lg p-4">
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										<Clock className="h-4 w-4 text-orange-600" />
										<h3 className="font-medium text-gray-900">Work Schedule</h3>
									</div>
								</div>
								<div className="space-y-4">
									<div>
										<h4 className="text-sm font-semibold text-gray-800 mb-2">
											Schedule Information
										</h4>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
											<div>
												<span className="font-medium text-gray-700">
													Schedule ID:
												</span>
												<span className="ml-2 text-gray-900">
													{formData.employee.defaultScheduleId ||
														"Not provided"}
												</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}
					</div>

					{!isCompleted && (
						<div className="pt-6 border-t border-gray-200">
							<div className="flex justify-between items-center">
								<p className="text-sm text-gray-600">
									Please review all information above. You can edit any section by
									clicking the &quot;Edit&quot; button.
								</p>
								<Button
									onClick={handleSubmit}
									className="bg-orange-600 hover:bg-orange-700 text-white">
									{isEditMode ? "Update Employee" : "Create Employee"}
								</Button>
							</div>
						</div>
					)}

					{isCompleted && (
						<div className="pt-4">
							<div className="flex items-center gap-2 text-green-600">
								<svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
									<path
										fillRule="evenodd"
										d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
										clipRule="evenodd"
									/>
								</svg>
								<span className="text-sm font-medium">
									Employee added successfully!
								</span>
							</div>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
