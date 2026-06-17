import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "~/components/atoms/Input";
import { cn } from "~/lib/utils";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	className?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
	({ className, ...props }, ref) => {
		const [showPassword, setShowPassword] = React.useState(false);

		return (
			<div className="relative group">
				<Input
					type={showPassword ? "text" : "password"}
					className={cn("pr-10", className)}
					ref={ref}
					{...props}
				/>
				<button
					type="button"
					onClick={() => setShowPassword(!showPassword)}
					className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-orange-600 transition-colors p-1"
					aria-label={showPassword ? "Hide password" : "Show password"}>
					{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
				</button>
			</div>
		);
	},
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
