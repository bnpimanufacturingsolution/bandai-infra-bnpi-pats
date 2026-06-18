import { useToastContext } from "~/lib/contexts/toast-context";
import { Button } from "~/components/atoms/Button";

export function ToastExample() {
	const { toast } = useToastContext();

	return (
		<div className="p-4 space-y-4">
			<h2 className="text-xl font-bold">Toast Notification Examples</h2>
			<div className="flex gap-2 flex-wrap">
				<Button
					onClick={() => toast.success("Login successful! Welcome back.", "Success")}
					className="bg-green-600 hover:bg-green-700">
					Success Toast
				</Button>
				<Button
					onClick={() =>
						toast.error(
							"Invalid email or password. Please check your credentials.",
							"Login Failed",
						)
					}
					className="bg-red-600 hover:bg-red-700">
					Error Toast
				</Button>
				<Button
					onClick={() =>
						toast.warning("Your session will expire in 5 minutes.", "Session Warning")
					}
					className="bg-yellow-600 hover:bg-yellow-700">
					Warning Toast
				</Button>
				<Button
					onClick={() =>
						toast.info(
							"New features are available in the latest update.",
							"Information",
						)
					}
					className="bg-blue-600 hover:bg-blue-700">
					Info Toast
				</Button>
			</div>
		</div>
	);
}
