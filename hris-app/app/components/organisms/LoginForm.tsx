import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";

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

const fieldClassName =
	"h-11 rounded-md border-gray-200 bg-white px-3.5 text-sm text-gray-900 shadow-none placeholder:text-gray-400 focus:border-red-600 focus:ring-1 focus:ring-red-600";

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
		<form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
			<div className="space-y-1.5">
				<Label
					htmlFor="login-identifier"
					className="text-sm font-medium text-gray-700"
				>
					Employee ID or Email
				</Label>
				<Input
					id="login-identifier"
					type="text"
					autoComplete="username"
					className={fieldClassName}
					placeholder="you@company.com"
					{...register("identifier", {
						required: "Employee ID or email is required",
					})}
				/>
				{errors.identifier ? (
					<p className="text-xs text-red-600">{errors.identifier.message}</p>
				) : null}
			</div>

			<div className="space-y-1.5">
				<Label
					htmlFor="login-password"
					className="text-sm font-medium text-gray-700"
				>
					Password
				</Label>
				<PasswordInput
					id="login-password"
					autoComplete="current-password"
					className={fieldClassName}
					placeholder="Password"
					{...register("password", {
						required: "Password is required",
					})}
				/>
				{errors.password ? (
					<p className="text-xs text-red-600">{errors.password.message}</p>
				) : null}
			</div>

			<div className="flex items-center justify-between gap-3 pt-0.5">
				<label
					htmlFor="keepLoggedIn"
					className="flex cursor-pointer items-center gap-2"
				>
					<Checkbox
						id="keepLoggedIn"
						{...register("keepLoggedIn")}
						onCheckedChange={() => {
							/* controlled via RHF register; no-op for a11y */
						}}
					/>
					<span className="text-sm text-gray-600">Remember me</span>
				</label>
				<Link
					to="/auth/forgot-password"
					className="text-sm font-medium text-red-600 transition-colors hover:text-red-700"
				>
					Forgot password?
				</Link>
			</div>

			<Button
				type="submit"
				disabled={isLoading || isSubmitting}
				className="mt-1 h-11 w-full rounded-md bg-red-600 text-sm font-semibold text-white shadow-none transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{isLoading || isSubmitting ? (
					<span className="inline-flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						Signing in…
					</span>
				) : (
					"Sign in"
				)}
			</Button>
		</form>
	);
}
