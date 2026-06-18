import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { Flag, Loader2 } from "lucide-react";

import { useAuth } from "~/lib/hooks/use-auth";
import { useToastContext } from "~/lib/contexts/toast-context";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Label } from "~/components/atoms/Label";
import { Checkbox } from "~/components/atoms/Checkbox";
import { PasswordInput } from "~/components/molecules/PasswordInput";
import { useEffect, useState } from "react";
import { getErrorMessage } from "~/lib/utils/error-formatter";

const LOGIN_PREFILL_STORAGE_KEY = "hris-login-prefill-v1";

type LoginFormValues = {
	identifier: string;
	password: string;
	keepLoggedIn: boolean;
};

export default function LoginForm() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { login, isLoading } = useAuth();
	const { toast } = useToastContext();

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
		setError: setFormError,
	} = useForm<LoginFormValues>({
		defaultValues: {
			identifier: "",
			password: "",
			keepLoggedIn: true,
		},
		mode: "onSubmit",
		reValidateMode: "onChange",
	});

	useEffect(() => {
		if (typeof window === "undefined") return;
		const rawPrefill = window.localStorage.getItem(LOGIN_PREFILL_STORAGE_KEY);
		if (!rawPrefill) return;

		try {
			const parsed = JSON.parse(rawPrefill) as Partial<LoginFormValues>;
			reset({
				identifier: String(parsed.identifier || (parsed as any).email || ""),
				password: String(parsed.password || ""),
				keepLoggedIn: true,
			});
		} catch (error) {
			console.error("Failed to read login prefill data:", error);
		}
	}, [reset]);

	const onSubmit = async (values: LoginFormValues) => {
		try {
			setIsSubmitting(true);
			await login(values.identifier, values.password, "hris");
			if (typeof window !== "undefined") {
				window.localStorage.removeItem(LOGIN_PREFILL_STORAGE_KEY);
			}
			// The redirect will be handled by the Navigate component in the parent
		} catch (error: any) {
			console.error("Login error:", error);
			const message = getErrorMessage(error) || "Login failed. Please try again.";
			toast.error(message, "Login Failed");
			setFormError("password", { type: "manual", message });
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
			{/* Identifier Input */}
			<div className="space-y-1.5">
				<Label className="text-xs font-semibold text-gray-700 block ml-1">
					Employee ID or Email
				</Label>
				<div className="relative group">
					<Input
						type="text"
						className="pl-3.5 h-10 bg-white border-gray-200 focus:bg-white focus:border-orange-500 focus:ring-orange-500 rounded-lg transition-all duration-200 text-sm text-gray-900 placeholder:text-gray-400 group-hover:border-gray-300 shadow-sm"
						placeholder="EMP-HR-MGR-001 or hr-manager@seed.local"
						{...register("identifier", {
							required: "Employee ID or email is required",
						})}
					/>
				</div>
				{errors.identifier && (
					<p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-1 ml-1">
						<Flag className="w-3 h-3" />
						{errors.identifier.message}
					</p>
				)}
			</div>

			{/* Password Input */}
			<div className="space-y-1.5">
				<Label className="text-xs font-semibold text-gray-700 block ml-1">Password</Label>
				<div className="relative group">
					<PasswordInput
						className="pl-3.5 h-10 bg-white border-gray-200 focus:bg-white focus:border-orange-500 focus:ring-orange-500 rounded-lg transition-all duration-200 text-sm text-gray-900 placeholder:text-gray-400 group-hover:border-gray-300 shadow-sm"
						placeholder="Enter your password"
						{...register("password", {
							required: "Password is required",
						})}
					/>
				</div>
				{errors.password && (
					<p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-1 ml-1">
						<Flag className="w-3 h-3" />
						{errors.password.message}
					</p>
				)}
			</div>

			{/* Remember Me & Forgot Password */}
			<div className="flex items-center justify-between pt-1">
				<div className="flex items-center gap-2.5">
					<label
						htmlFor="keepLoggedIn"
						className="flex items-center gap-2.5 cursor-pointer">
						<Checkbox
							id="keepLoggedIn"
							{...register("keepLoggedIn")}
							onCheckedChange={(checked) => {
								console.log(checked);
							}}
						/>

						<span className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors">
							Remember me
						</span>
					</label>
				</div>
				<Link
					to="/auth/forgot-password"
					className="text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline transition-all">
					Forgot password?
				</Link>
			</div>

			{/* Login Button */}
			<Button
				type="submit"
				disabled={isLoading || isSubmitting}
				className="w-full h-11 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold text-sm rounded-lg shadow-md shadow-orange-500/25 transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none mt-4">
				{isLoading || isSubmitting ? (
					<span className="flex items-center gap-2">
						<Loader2 className="w-4 h-4 animate-spin" />
						Signing in...
					</span>
				) : (
					"Sign In"
				)}
			</Button>
		</form>
	);
}
