import { useState } from "react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Modal } from "~/components/atoms/Modal";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, Circle } from "lucide-react";
import { useForm } from "react-hook-form";
import { cn } from "~/lib/utils";
import { apiClient } from "~/lib/api-client";

interface ChangePasswordModalProps {
	isOpen: boolean;
	onClose: () => void;
	onPasswordChanged: () => void;
	userEmail: string;
	enforceLock?: boolean;
}

type ChangePasswordFormValues = {
	newPassword: string;
	confirmPassword: string;
};

export function ChangePasswordModal({
	isOpen,
	onClose,
	onPasswordChanged,
	userEmail,
	enforceLock = false,
}: ChangePasswordModalProps) {
	const [showNewPassword, setShowNewPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const {
		register,
		handleSubmit,
		formState: { errors },
		watch,
		reset,
	} = useForm<ChangePasswordFormValues>({
		defaultValues: {
			newPassword: "",
			confirmPassword: "",
		},
		mode: "onChange",
	});

	const newPassword = watch("newPassword") || "";

	// Real-time validation checks
	const hasMinLength = newPassword.length >= 8;
	const hasUppercase = /[A-Z]/.test(newPassword);
	const hasLowercase = /[a-z]/.test(newPassword);
	const hasNumber = /\d/.test(newPassword);
	// const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword); // Not in requirements but good practice

	const onSubmit = async (values: ChangePasswordFormValues) => {
		try {
			setIsSubmitting(true);
			setError(null);

			await apiClient.patch("/auth/change-password", {
				newPassword: values.newPassword,
			});

			// Success - reset form, close modal, and notify parent
			reset();
			onClose();
			onPasswordChanged();
		} catch (err: any) {
			console.error("Password change error:", err);
			setError(err.message || "Failed to change password. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const RequirementItem = ({ met, text }: { met: boolean; text: string }) => (
		<li
			className={cn(
				"flex items-center gap-2 text-sm transition-colors",
				met ? "text-green-600" : "text-gray-500",
			)}>
			{met ? (
				<CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
			) : (
				<Circle className="w-4 h-4 text-gray-300 shrink-0" />
			)}
			<span>{text}</span>
		</li>
	);

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => {
				if (!open && !enforceLock) {
					onClose();
				}
			}}
			title="Change Your Password"
			description="Please create a new secure password"
			showCloseButton={!enforceLock}
			className="max-w-md">
			{/* Warning / Context Header */}
			<div className="flex items-start gap-4 mb-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
				<div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm border border-orange-100">
					<Lock className="w-5 h-5 text-orange-500" />
				</div>
				<div>
					<p className="text-sm text-gray-700 leading-relaxed">
						For security reasons, you must change your password before continuing. This
						is your first login with employee ID as password.
					</p>
				</div>
			</div>

			{/* Form */}
			<form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
				{/* New Password */}
				<div className="space-y-2">
					<label className="text-sm font-medium text-gray-700">New Password *</label>
					<div className="relative">
						<Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
						<Input
							type={showNewPassword ? "text" : "password"}
							className="pl-10 pr-10 h-12"
							placeholder="Enter new password"
							onKeyDown={(e) => {
								if (e.key === "Tab" && !e.shiftKey) {
									e.preventDefault();
									const confirmPasswordInput = document.querySelector(
										'input[name="confirmPassword"]',
									) as HTMLInputElement;
									if (confirmPasswordInput) confirmPasswordInput.focus();
								}
							}}
							{...register("newPassword", {
								required: "New password is required",
								minLength: {
									value: 8,
									message: "Password must be at least 8 characters",
								},
								pattern: {
									value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
									message:
										"Password must contain uppercase, lowercase, and number",
								},
							})}
						/>
						<button
							type="button"
							onClick={() => setShowNewPassword(!showNewPassword)}
							className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none">
							{showNewPassword ? (
								<EyeOff className="w-4 h-4" />
							) : (
								<Eye className="w-4 h-4" />
							)}
						</button>
					</div>
					{errors.newPassword && (
						<p className="text-sm text-red-600">{errors.newPassword.message}</p>
					)}
				</div>

				{/* Confirm Password */}
				<div className="space-y-2">
					<label className="text-sm font-medium text-gray-700">Confirm Password *</label>
					<div className="relative">
						<Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
						<Input
							type={showConfirmPassword ? "text" : "password"}
							className="pl-10 pr-10 h-12"
							placeholder="Confirm new password"
							{...register("confirmPassword", {
								required: "Please confirm your password",
								validate: (value) =>
									value === newPassword || "Passwords do not match",
							})}
						/>
						<button
							type="button"
							onClick={() => setShowConfirmPassword(!showConfirmPassword)}
							className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none">
							{showConfirmPassword ? (
								<EyeOff className="w-4 h-4" />
							) : (
								<Eye className="w-4 h-4" />
							)}
						</button>
					</div>
					{errors.confirmPassword && (
						<p className="text-sm text-red-600">{errors.confirmPassword.message}</p>
					)}
				</div>

				{/* Password Requirements */}
				<div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
					<p className="text-sm font-medium text-gray-700 mb-3">Password must contain:</p>
					<ul className="space-y-2">
						<RequirementItem met={hasMinLength} text="At least 8 characters" />
						<RequirementItem met={hasUppercase} text="One uppercase letter" />
						<RequirementItem met={hasLowercase} text="One lowercase letter" />
						<RequirementItem met={hasNumber} text="One number" />
					</ul>
				</div>

				{/* Error Message */}
				{error && (
					<div className="bg-red-50 border border-red-200 rounded-lg p-3">
						<p className="text-sm text-red-800">{error}</p>
					</div>
				)}

				{/* Submit Button */}
				<Button
					type="submit"
					disabled={isSubmitting}
					className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-medium disabled:opacity-50 transition-all shadow-md hover:shadow-lg">
					{isSubmitting ? (
						<>
							<Loader2 className="w-4 h-4 mr-2 animate-spin" />
							Changing Password...
						</>
					) : (
						"Change Password"
					)}
				</Button>
			</form>

			{/* Footer Note */}
			<p className="text-xs text-center text-gray-500 mt-6">
				You will be logged in automatically after changing your password
			</p>
		</Modal>
	);
}
