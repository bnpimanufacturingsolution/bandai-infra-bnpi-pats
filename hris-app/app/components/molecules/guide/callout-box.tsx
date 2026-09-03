import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { Icon } from "../../atoms/Icon";

type CalloutVariant = "info" | "warning" | "success";

interface CalloutBoxProps {
	variant: CalloutVariant;
	content: string;
	title?: string;
}

const variantConfig: Record<
	CalloutVariant,
	{
		icon: typeof AlertCircle;
		containerClass: string;
		iconClass: string;
	}
> = {
	info: {
		icon: AlertCircle,
		containerClass: "bg-callout-info-bg border-callout-info-border text-callout-info-text",
		iconClass: "text-callout-info-border",
	},
	warning: {
		icon: AlertTriangle,
		containerClass:
			"bg-callout-warning-bg border-callout-warning-border text-callout-warning-text",
		iconClass: "text-callout-warning-border",
	},
	success: {
		icon: CheckCircle,
		containerClass:
			"bg-callout-success-bg border-callout-success-border text-callout-success-text",
		iconClass: "text-callout-success-border",
	},
};

export function CalloutBox({ variant, content, title }: CalloutBoxProps) {
	const { icon, containerClass, iconClass } = variantConfig[variant];

	return (
		<div
			className={cn(
				"flex gap-3 p-4 rounded-lg border-l-4 my-6 animate-fade-in",
				containerClass,
			)}
			role="note"
			aria-label={`${variant} callout`}>
			<Icon icon={icon} size={16} className={cn("shrink-0 mt-0.5", iconClass)} />
			<div className="flex-1 min-w-0">
				{title && <p className="font-semibold mb-1">{title}</p>}
				<p className="text-sm leading-relaxed">{content}</p>
			</div>
		</div>
	);
}
