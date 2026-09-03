import { useState, useEffect, useCallback } from "react";
import { CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

export interface ToastProps {
	id: string;
	type: "success" | "error" | "warning" | "info";
	title?: string;
	message: string;
	duration?: number;
	onClose: (id: string) => void;
}

export function Toast({ id, type, title, message, duration = 5000, onClose }: ToastProps) {
	const [isVisible, setIsVisible] = useState(false);

	const handleClose = useCallback(() => {
		setIsVisible(false);
		setTimeout(() => onClose(id), 300); // Wait for animation to complete
	}, [id, onClose]);

	useEffect(() => {
		// Trigger animation
		setIsVisible(true);

		// Auto close after duration
		const timer = setTimeout(() => {
			handleClose();
		}, duration);

		return () => clearTimeout(timer);
	}, [duration, handleClose]);

	const getIcon = () => {
		switch (type) {
			case "success":
				return <CheckCircle className="w-5 h-5 text-green-500" />;
			case "error":
				return <AlertCircle className="w-5 h-5 text-red-500" />;
			case "warning":
				return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
			case "info":
				return <Info className="w-5 h-5 text-blue-500" />;
			default:
				return <Info className="w-5 h-5 text-gray-500" />;
		}
	};

	const getBackgroundColor = () => {
		switch (type) {
			case "success":
				return "bg-green-50 border-green-200";
			case "error":
				return "bg-red-50 border-red-200";
			case "warning":
				return "bg-yellow-50 border-yellow-200";
			case "info":
				return "bg-blue-50 border-blue-200";
			default:
				return "bg-gray-50 border-gray-200";
		}
	};

	const getTextColor = () => {
		switch (type) {
			case "success":
				return "text-green-800";
			case "error":
				return "text-red-800";
			case "warning":
				return "text-yellow-800";
			case "info":
				return "text-blue-800";
			default:
				return "text-gray-800";
		}
	};

	return (
		<div
			className={`
				transform transition-all duration-300 ease-in-out
				${isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
				max-w-sm w-full ${getBackgroundColor()} border rounded-lg shadow-lg p-4
			`}>
			<div className="flex items-start">
				<div className="flex-shrink-0">{getIcon()}</div>
				<div className="ml-3 flex-1">
					{title && <h3 className={`text-sm font-medium ${getTextColor()}`}>{title}</h3>}
					<p className={`text-sm ${getTextColor()} ${title ? "mt-1" : ""}`}>{message}</p>
				</div>
			</div>
		</div>
	);
}

// Toast Container Component
export function ToastContainer({
	toasts,
	onRemoveToast,
}: {
	toasts: ToastProps[];
	onRemoveToast: (id: string) => void;
}) {
	return (
		<div className="fixed top-4 right-4 z-50 space-y-2">
			{toasts.map((toast) => (
				<Toast key={toast.id} {...toast} onClose={onRemoveToast} />
			))}
		</div>
	);
}

// Toast Hook
export function useToast() {
	const [toasts, setToasts] = useState<ToastProps[]>([]);

	const addToast = (toast: Omit<ToastProps, "id" | "onClose">) => {
		const id = Math.random().toString(36).substr(2, 9);
		const newToast: ToastProps = {
			...toast,
			id,
			onClose: removeToast,
		};
		setToasts((prev) => [...prev, newToast]);
	};

	const removeToast = (id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	};

	const toast = {
		success: (message: string, title?: string) => addToast({ type: "success", message, title }),
		error: (message: string, title?: string) => addToast({ type: "error", message, title }),
		warning: (message: string, title?: string) => addToast({ type: "warning", message, title }),
		info: (message: string, title?: string) => addToast({ type: "info", message, title }),
	};

	return { toasts, toast, removeToast };
}
