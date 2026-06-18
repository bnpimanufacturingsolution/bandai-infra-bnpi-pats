import React, { useState, useContext, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Camera, ChevronLeft, Flag, Mail, Phone, User } from "lucide-react";
import AuthContext from "~/contexts/auth-context";
import { useEmployee, useUpdateEmployee, employeesQueryKeys } from "~/lib/hooks/useEmployees";
import { Skeleton } from "~/components/ui/skeleton";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "~/lib/utils/error-formatter";

interface ProfileCompletionProps {
	onNext: () => void;
	onBack: () => void;
	onSkip: () => void;
}

const getPreviewUrl = (file: File | null, fallback?: string | null) =>
	file ? URL.createObjectURL(file) : fallback || null;

const removeNullishContactValues = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(removeNullishContactValues);
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
			.map(([key, entryValue]) => [key, removeNullishContactValues(entryValue)]),
	);
};

type ProfileFormData = {
	email: string;
	phone: string;
	emergencyContact: string;
	emergencyPhone: string;
};

type ProfileFieldErrors = Partial<Record<keyof ProfileFormData, string>>;

const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const validateProfileForm = (values: ProfileFormData): ProfileFieldErrors => {
	const nextErrors: ProfileFieldErrors = {};
	if (!values.email.trim()) {
		nextErrors.email = "Personal email is missing from your employee record.";
	} else if (!validateEmail(values.email)) {
		nextErrors.email = "Personal email must be valid.";
	}

	const phoneDigits = values.phone.replace(/[^\d]/g, "");
	if (!values.phone.trim()) {
		nextErrors.phone = "Phone number is required.";
	} else if (phoneDigits.length < 7) {
		nextErrors.phone = "Enter a valid phone number.";
	}

	if (!values.emergencyContact.trim()) {
		nextErrors.emergencyContact = "Emergency contact name is required.";
	}

	const emergencyPhoneDigits = values.emergencyPhone.replace(/[^\d]/g, "");
	if (!values.emergencyPhone.trim()) {
		nextErrors.emergencyPhone = "Emergency contact phone is required.";
	} else if (emergencyPhoneDigits.length < 7) {
		nextErrors.emergencyPhone = "Enter a valid emergency phone number.";
	}

	return nextErrors;
};

const FieldError = ({ message }: { message?: string }) =>
	message ? (
		<p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
			<Flag className="h-3 w-3 shrink-0" />
			<span>{message}</span>
		</p>
	) : null;

export default function ProfileCompletion({ onNext, onBack, onSkip }: ProfileCompletionProps) {
	const authContext = useContext(AuthContext);
	const user = authContext?.user;
	const employeeId = user?.metadata?.employee?.id;
	const updateEmployee = useUpdateEmployee();
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { data: employee, isLoading } = useEmployee(employeeId || "", "person,metadata");

	const [formData, setFormData] = useState({
		email: "",
		phone: "",
		emergencyContact: "",
		emergencyPhone: "",
	});
	const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
	const [touchedFields, setTouchedFields] = useState<
		Partial<Record<keyof ProfileFormData, boolean>>
	>({});
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const employeeMetadata =
		employee?.metadata && typeof employee.metadata === "object" ? employee.metadata : {};

	const firstName =
		user?.metadata?.employee?.personalInfo?.firstName ||
		employee?.person?.personalInfo?.firstName ||
		"";

	useEffect(() => {
		if (!employee) return;
		const emergencyPhone =
			employee.person?.contactInfo?.phones?.find((phone: any) => phone.type === "emergency")
				?.number || "";
		const emergencyContactName =
			typeof (employeeMetadata as Record<string, unknown>).emergencyContactName === "string"
				? String((employeeMetadata as Record<string, unknown>).emergencyContactName)
				: "";
		setFormData({
			email: employee.person?.contactInfo?.email || "",
			phone:
				employee.person?.contactInfo?.phones?.find((phone: any) => phone.isPrimary)
					?.number || "",
			emergencyContact: emergencyContactName,
			emergencyPhone,
		});
	}, [employee, employeeMetadata]);

	const avatarPreviewUrl = useMemo(
		() => getPreviewUrl(avatarFile, user?.avatar || null),
		[avatarFile, user?.avatar],
	);

	useEffect(() => {
		if (!avatarFile || !avatarPreviewUrl || avatarPreviewUrl === user?.avatar) return;
		return () => {
			URL.revokeObjectURL(avatarPreviewUrl);
		};
	}, [avatarFile, avatarPreviewUrl, user?.avatar]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
		const { name, value } = e.target as { name: keyof ProfileFormData; value: string };
		const nextFormData = {
			...formData,
			[name]: value,
		};
		setFormData(nextFormData);
		if (touchedFields[name]) {
			setFieldErrors(validateProfileForm(nextFormData));
		}
	};

	const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
		const name = e.target.name as keyof ProfileFormData;
		setTouchedFields((prev) => ({ ...prev, [name]: true }));
		setFieldErrors(validateProfileForm(formData));
	};

	const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const nextFile = event.target.files?.[0] || null;
		if (!nextFile) return;
		setAvatarFile(nextFile);
	};

	const handleSave = () => {
		if (!employeeId || !employee) return;
		const validationErrors = validateProfileForm(formData);
		if (Object.keys(validationErrors).length > 0) {
			setTouchedFields({
				email: true,
				phone: true,
				emergencyContact: true,
				emergencyPhone: true,
			});
			setFieldErrors(validationErrors);
			return;
		}

		const existingContactInfo = employee.person?.contactInfo || {};
		const existingPhones = Array.isArray(existingContactInfo.phones)
			? existingContactInfo.phones
			: [];
		const primaryPhone = existingPhones.find((phone: any) => phone.isPrimary);
		const emergencyPhone = existingPhones.find((phone: any) => phone.type === "emergency");
		const preservedPhones = existingPhones.filter((phone: any) => !phone?.isPrimary);
		const nextPrimaryPhone = {
			type: primaryPhone?.type || "mobile",
			countryCode: primaryPhone?.countryCode || "",
			number: formData.phone,
			isPrimary: true,
		};
		const nextEmergencyPhone = {
			type: "emergency",
			countryCode: emergencyPhone?.countryCode || "",
			number: formData.emergencyPhone,
			isPrimary: false,
		};
		const otherPhones = preservedPhones.filter((phone: any) => phone?.type !== "emergency");
		const nextContactInfo = removeNullishContactValues({
			...existingContactInfo,
			email: formData.email,
			phones: [nextPrimaryPhone, nextEmergencyPhone, ...otherPhones],
		});
		const existingEmergencyContact =
			typeof (employeeMetadata as Record<string, unknown>).emergencyContactName === "string"
				? String((employeeMetadata as Record<string, unknown>).emergencyContactName)
				: "";
		const hasContactChanged =
			String(existingContactInfo.email || "") !== formData.email ||
			String(primaryPhone?.number || "") !== formData.phone ||
			String(emergencyPhone?.number || "") !== formData.emergencyPhone;
		const hasEmergencyContactChanged = existingEmergencyContact !== formData.emergencyContact;

		const payload: Record<string, unknown> = {};
		if (hasContactChanged) {
			payload.person = {
				contactInfo: nextContactInfo,
			};
		}
		if (hasEmergencyContactChanged) {
			payload.employee = {
				metadata: {
					...employeeMetadata,
					emergencyContactName: formData.emergencyContact,
				},
			};
		}
		if (avatarFile) {
			payload.avatar = avatarFile;
		}

		if (!hasContactChanged && !hasEmergencyContactChanged && !avatarFile) {
			onNext();
			return;
		}

		updateEmployee.mutate(
			{
				id: employeeId,
				payload,
			},
			{
				onSuccess: async () => {
					await Promise.all([
						queryClient.invalidateQueries({
							queryKey: [...employeesQueryKeys.employees.details(), employeeId],
						}),
						queryClient.invalidateQueries({
							queryKey: employeesQueryKeys.employees.detail(employeeId),
						}),
					]);
					await authContext?.getCurrentUser?.();
					toast.success("Profile updated successfully!");
					onNext();
				},
				onError: (error: any) => {
					toast.error(getErrorMessage(error) || "Failed to update profile");
				},
			},
		);
	};

	const shouldShowError = (field: keyof ProfileFormData) =>
		touchedFields[field] ? fieldErrors[field] : undefined;

	if (isLoading) {
		return (
			<div className="w-full max-w-xl mx-auto animate-in fade-in duration-500">
				<div className="mb-6 text-center md:text-left space-y-2">
					<Skeleton className="h-8 w-56 mx-auto md:mx-0" />
					<Skeleton className="h-4 w-80 max-w-full mx-auto md:mx-0" />
				</div>

				<div className="bg-white rounded-2xl shadow-lg border border-orange-100 p-5 space-y-6">
					<div className="flex justify-center">
						<Skeleton className="w-24 h-24 rounded-full" />
					</div>

					<div className="grid gap-4">
						<div className="grid md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-10 w-full rounded-lg" />
							</div>
							<div className="space-y-2">
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-10 w-full rounded-lg" />
							</div>
						</div>
					</div>
				</div>

				<div className="mt-6 flex gap-3 flex-col md:flex-row items-center">
					<Skeleton className="h-10 w-full md:flex-1 rounded-full" />
					<Skeleton className="h-10 w-full md:w-36 rounded-full" />
				</div>
			</div>
		);
	}

	return (
		<div className="w-full max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
			<div className="mb-6 text-center md:text-left">
				{firstName ? (
					<p className="mb-2 text-sm font-semibold text-orange-600">
						Welcome, {firstName}
					</p>
				) : null}
				<h2 className="text-2xl md:text-3xl font-extrabold mb-2">
					<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600">
						Complete Your Profile
					</span>
				</h2>
				<p className="text-sm text-muted-foreground leading-relaxed max-w-md">
					Let&apos;s get your information set up so we can personalize your experience.
				</p>
			</div>

			<div className="bg-white rounded-2xl shadow-lg border border-orange-100 p-5 relative overflow-hidden">
				<div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-orange-100/40 to-red-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

				<div className="relative z-10 space-y-6">
					<div className="flex justify-center">
						<div className="relative">
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="group relative h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-orange-50 to-red-50 shadow-lg transition hover:scale-[1.02]">
								{avatarPreviewUrl ? (
									<img
										src={avatarPreviewUrl}
										alt="Profile avatar preview"
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center text-orange-400">
										<User className="h-8 w-8" />
									</div>
								)}
								<div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100">
									<Camera className="h-5 w-5 text-white" />
								</div>
							</button>
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-orange-500 text-white shadow-md transition hover:bg-orange-600">
								<Camera className="h-3.5 w-3.5" />
							</button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/png,image/jpeg,image/webp"
								className="hidden"
								onChange={handleAvatarChange}
							/>
						</div>
					</div>

					<div className="grid gap-4">
						<div className="grid md:grid-cols-2 gap-4">
							<div className="space-y-1.5">
								<label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
									<Mail className="w-3.5 h-3.5 text-orange-500" /> Personal Email
								</label>
								<input
									type="email"
									name="email"
									value={formData.email}
									disabled
									className="w-full cursor-not-allowed px-3 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-500 text-sm outline-none"
									placeholder="your.email@example.com"
								/>
								<FieldError message={shouldShowError("email")} />
								<p className="text-[11px] text-muted-foreground">
									Your personal email is managed from your employee record.
								</p>
							</div>

							<div className="space-y-1.5">
								<label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
									<Phone className="w-3.5 h-3.5 text-orange-500" /> Phone Number
								</label>
								<input
									type="tel"
									name="phone"
									value={formData.phone}
									onChange={handleInputChange}
									onBlur={handleInputBlur}
									aria-invalid={Boolean(shouldShowError("phone"))}
									className={`w-full px-3 py-2 rounded-lg border bg-gray-50/50 text-gray-900 text-sm focus:bg-white focus:ring-4 transition-all outline-none ${
										shouldShowError("phone")
											? "border-red-300 focus:border-red-400 focus:ring-red-100"
											: "border-gray-200 focus:border-orange-300 focus:ring-orange-100"
									}`}
									placeholder="+1 (555) 000-0000"
								/>
								<FieldError message={shouldShowError("phone")} />
							</div>
						</div>

						<div className="rounded-xl border border-orange-100/60 bg-orange-50/60 p-4 space-y-3">
							<h3 className="text-xs font-bold uppercase tracking-wider text-orange-800 flex items-center gap-1.5">
								<User className="w-3.5 h-3.5" /> Emergency Contact
							</h3>
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-1.5">
									<label className="text-[11px] font-semibold text-gray-600">
										Full Name
									</label>
									<input
										type="text"
										name="emergencyContact"
										value={formData.emergencyContact}
										onChange={handleInputChange}
										onBlur={handleInputBlur}
										aria-invalid={Boolean(shouldShowError("emergencyContact"))}
										className={`w-full px-3 py-2 rounded-lg border bg-white shadow-sm text-gray-900 text-sm focus:ring-4 transition-all outline-none ${
											shouldShowError("emergencyContact")
												? "border-red-300 focus:border-red-400 focus:ring-red-100"
												: "border-white focus:border-orange-300 focus:ring-orange-100"
										}`}
										placeholder="Full name"
									/>
									<FieldError message={shouldShowError("emergencyContact")} />
								</div>

								<div className="space-y-1.5">
									<label className="text-[11px] font-semibold text-gray-600">
										Phone Number
									</label>
									<input
										type="tel"
										name="emergencyPhone"
										value={formData.emergencyPhone}
										onChange={handleInputChange}
										onBlur={handleInputBlur}
										aria-invalid={Boolean(shouldShowError("emergencyPhone"))}
										className={`w-full px-3 py-2 rounded-lg border bg-white shadow-sm text-gray-900 text-sm focus:ring-4 transition-all outline-none ${
											shouldShowError("emergencyPhone")
												? "border-red-300 focus:border-red-400 focus:ring-red-100"
												: "border-white focus:border-orange-300 focus:ring-orange-100"
										}`}
										placeholder="+1 (555) 000-0000"
									/>
									<FieldError message={shouldShowError("emergencyPhone")} />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="mt-6 flex gap-3 flex-col md:flex-row items-center">
				<Button
					onClick={handleSave}
					disabled={updateEmployee.isPending}
					className="w-full md:flex-1 h-10 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all rounded-full text-sm font-bold">
					{updateEmployee.isPending ? "Saving..." : "Continue"}{" "}
					<ArrowRight className="w-4 h-4 ml-2" />
				</Button>

				<Button
					onClick={onSkip}
					variant="outline"
					className="w-full md:w-auto h-10 border-2 border-orange-100 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 rounded-full font-semibold px-6 text-sm">
					Skip for Now
				</Button>

				<Button
					onClick={onBack}
					variant="ghost"
					className="md:hidden flex items-center justify-center gap-2 text-gray-500 text-sm">
					<ChevronLeft className="w-3.5 h-3.5" /> Back
				</Button>
			</div>
		</div>
	);
}
