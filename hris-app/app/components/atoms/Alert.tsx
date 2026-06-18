import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

export interface AlertProps {
	variant?: "default" | "destructive" | "success" | "warning" | "info";
	children: React.ReactNode;
	className?: string;
}

export function Alert({ variant = "default", children, className = "" }: AlertProps) {
	const getVariantStyles = () => {
		switch (variant) {
			case "destructive":
				return "bg-red-50 border-red-200 text-red-800";
			case "success":
				return "bg-green-50 border-green-200 text-green-800";
			case "warning":
				return "bg-yellow-50 border-yellow-200 text-yellow-800";
			case "info":
				return "bg-blue-50 border-blue-200 text-blue-800";
			default:
				return "bg-gray-50 border-gray-200 text-gray-800";
		}
	};

	const getIcon = () => {
		switch (variant) {
			case "destructive":
				return <AlertCircle className="h-5 w-5 text-red-600" />;
			case "success":
				return <CheckCircle className="h-5 w-5 text-green-600" />;
			case "warning":
				return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
			case "info":
				return <Info className="h-5 w-5 text-blue-600" />;
			default:
				return <Info className="h-5 w-5 text-gray-600" />;
		}
	};

	return (
		<div
			className={`flex items-start gap-3 p-4 border rounded-lg ${getVariantStyles()} ${className}`}>
			<div className="flex-shrink-0">{getIcon()}</div>
			<div className="flex-1">{children}</div>
		</div>
	);
}

interface AlertDescriptionProps {
	children: React.ReactNode;
	className?: string;
}

export function AlertDescription({ children, className = "" }: AlertDescriptionProps) {
	return <div className={`text-sm ${className}`}>{children}</div>;
}
