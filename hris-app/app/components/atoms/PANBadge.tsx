import { type VariantProps } from "class-variance-authority";
import {
	TrendingUp,
	Clock,
	UserX,
	UserCheck,
	CalendarDays,
	Timer,
	RotateCcw,
	Receipt,
	FileText,
	LogOut,
	Briefcase,
	HelpCircle,
	CheckCircle2,
	XCircle,
	AlertCircle,
	MinusCircle,
	Eye,
	type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";

// Define Request Intent types (Mixed PAN types + Statuses)
export type PANIntent =
	// Statuses
	| "PENDING"
	| "IN_REVIEW"
	| "PROCESSING"
	| "APPROVED"
	| "REJECTED"
	| "CANCELLED"
	| "COMPLETED"
	| "NEW" // Legacy mapping
	// Request Types
	| "PROMOTION"
	| "TERMINATION"
	| "REGULARIZATION"
	| "SALARY_CHANGE"
	| "LEAVE"
	| "OVERTIME"
	| "TIME_ADJUSTMENT"
	| "EXPENSE_REIMBURSEMENT"
	| "DOCUMENT_REQUEST"
	| "RESIGNATION"
	| "PERSONNEL_ACTION"
	| "OTHER"
	| "PERSONAL_INFO_UPDATE"
	| "LEAVE_ADJUSTMENT"
	| "LEAVE_CONVERSION"
	| "TRANSFER";

// Configuration interface
interface PANConfig {
	label: string;
	color: string; // Hex or Var
	icon: LucideIcon;
	variant: "default" | "secondary" | "destructive" | "outline" | "menu"; // Fallback or base variant
	className: string; // Specific tailwind classes for the badge
}

// Global Color Constants
export const PAN_COLORS = {
	// Status Colors (Matching app.css variables)
	PENDING: "var(--status-pending)", // Gray
	IN_REVIEW: "var(--status-in-review)", // Blue
	PROCESSING: "var(--status-processing)", // Amber
	APPROVED: "var(--status-approved)", // Green
	REJECTED: "var(--status-rejected)", // Red
	CANCELLED: "var(--status-cancelled)", // Slate
	COMPLETED: "var(--status-completed)", // Emerald

	// Legacy / Types (Keeping existing hexes for types)
	PROMOTION: "#2563EB",
	TERMINATION: "#991B1B",
	REGULARIZATION: "#16A34A",
	SALARY_CHANGE: "#0F766E",
	LEAVE: "#14B8A6",
	OVERTIME: "#6366F1",
	TIME_ADJUSTMENT: "#06B6D4",
	EXPENSE_REIMBURSEMENT: "#EAB308",
	DOCUMENT_REQUEST: "#64748B",
	RESIGNATION: "#F97316",
	PERSONNEL_ACTION: "#A855F7",
	OTHER: "#6B7280",
} as const;

// Configuration Mapping
export const PAN_BADGE_CONFIG: Record<PANIntent, PANConfig> = {
	// --- STATUSES ---
	PENDING: {
		label: "Pending",
		color: PAN_COLORS.PENDING,
		icon: Clock,
		variant: "menu", // Custom
		className:
			"bg-[var(--status-pending)]/15 text-[var(--status-pending)] border-[var(--status-pending)]/20",
	},
	NEW: {
		// Mapping NEW to Pending/Draft
		label: "Draft",
		color: PAN_COLORS.PENDING,
		icon: FileText,
		variant: "menu",
		className:
			"bg-[var(--status-pending)]/15 text-[var(--status-pending)] border-[var(--status-pending)]/20",
	},
	IN_REVIEW: {
		label: "In Review",
		color: PAN_COLORS.IN_REVIEW,
		icon: Eye, // or Search
		variant: "menu",
		className:
			"bg-[var(--status-in-review)]/15 text-[var(--status-in-review)] border-[var(--status-in-review)]/20",
	},
	PROCESSING: {
		label: "Processing",
		color: PAN_COLORS.PROCESSING,
		icon: RotateCcw,
		variant: "menu",
		className:
			"bg-[var(--status-processing)]/15 text-[var(--status-processing)] border-[var(--status-processing)]/20",
	},
	APPROVED: {
		label: "Approved",
		color: PAN_COLORS.APPROVED,
		icon: CheckCircle2,
		variant: "menu",
		className:
			"bg-[var(--status-approved)]/15 text-[var(--status-approved)] border-[var(--status-approved)]/20",
	},
	REJECTED: {
		label: "Rejected",
		color: PAN_COLORS.REJECTED,
		icon: XCircle,
		variant: "destructive",
		className:
			"bg-[var(--status-rejected)]/15 text-[var(--status-rejected)] border-[var(--status-rejected)]/20",
	},
	CANCELLED: {
		label: "Cancelled",
		color: PAN_COLORS.CANCELLED,
		icon: MinusCircle,
		variant: "secondary",
		className:
			"bg-[var(--status-cancelled)]/15 text-[var(--status-cancelled)] border-[var(--status-cancelled)]/20",
	},
	COMPLETED: {
		label: "Completed",
		color: PAN_COLORS.COMPLETED,
		icon: CheckCircle2,
		variant: "menu",
		className:
			"bg-[var(--status-completed)]/15 text-[var(--status-completed)] border-[var(--status-completed)]/20",
	},

	// --- TYPES ---
	PROMOTION: {
		label: "Promotion",
		color: PAN_COLORS.PROMOTION,
		icon: TrendingUp,
		variant: "default",
		className: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200",
	},
	TERMINATION: {
		label: "Termination",
		color: PAN_COLORS.TERMINATION,
		icon: UserX,
		variant: "destructive",
		className: "bg-red-100 text-red-800 hover:bg-red-200 border-red-200",
	},
	REGULARIZATION: {
		label: "Regularization",
		color: PAN_COLORS.REGULARIZATION,
		icon: UserCheck,
		variant: "default",
		className: "bg-green-100 text-green-700 hover:bg-green-200 border-green-200",
	},
	SALARY_CHANGE: {
		label: "Salary Change",
		color: PAN_COLORS.SALARY_CHANGE,
		icon: Receipt,
		variant: "default",
		className: "bg-teal-100 text-teal-800 hover:bg-teal-200 border-teal-200",
	},
	LEAVE: {
		label: "Leave",
		color: PAN_COLORS.LEAVE,
		icon: CalendarDays,
		variant: "default",
		className: "bg-teal-100 text-teal-700 hover:bg-teal-200 border-teal-200",
	},
	OVERTIME: {
		label: "Overtime",
		color: PAN_COLORS.OVERTIME,
		icon: Timer,
		variant: "default",
		className: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200",
	},
	TIME_ADJUSTMENT: {
		label: "Time Adjustment",
		color: PAN_COLORS.TIME_ADJUSTMENT,
		icon: RotateCcw,
		variant: "default",
		className: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200 border-cyan-200",
	},
	EXPENSE_REIMBURSEMENT: {
		label: "Expense Reimbursement",
		color: PAN_COLORS.EXPENSE_REIMBURSEMENT,
		icon: Receipt,
		variant: "default",
		className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200",
	},
	DOCUMENT_REQUEST: {
		label: "Document Request",
		color: PAN_COLORS.DOCUMENT_REQUEST,
		icon: FileText,
		variant: "default",
		className: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200",
	},
	RESIGNATION: {
		label: "Resignation",
		color: PAN_COLORS.RESIGNATION,
		icon: LogOut,
		variant: "default",
		className: "bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200",
	},
	PERSONNEL_ACTION: {
		label: "Personnel Action",
		color: PAN_COLORS.PERSONNEL_ACTION,
		icon: Briefcase,
		variant: "default",
		className: "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200",
	},
	OTHER: {
		label: "Other",
		color: PAN_COLORS.OTHER,
		icon: HelpCircle,
		variant: "secondary",
		className: "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200",
	},
	PERSONAL_INFO_UPDATE: {
		label: "Personal Info Update",
		color: PAN_COLORS.PERSONNEL_ACTION,
		icon: Briefcase,
		variant: "default",
		className: "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200",
	},
	LEAVE_ADJUSTMENT: {
		label: "Leave Adjustment",
		color: PAN_COLORS.LEAVE,
		icon: CalendarDays,
		variant: "default",
		className: "bg-teal-100 text-teal-700 hover:bg-teal-200 border-teal-200",
	},
	LEAVE_CONVERSION: {
		label: "Leave Conversion",
		color: PAN_COLORS.LEAVE,
		icon: CalendarDays,
		variant: "default",
		className: "bg-teal-100 text-teal-700 hover:bg-teal-200 border-teal-200",
	},
	TRANSFER: {
		label: "Transfer",
		color: PAN_COLORS.PERSONNEL_ACTION,
		icon: Briefcase,
		variant: "default",
		className: "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200",
	},
};

// Component Props
interface PANBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
	intent: PANIntent | string;
	showIcon?: boolean;
	iconClassName?: string;
}

// The Component
export function PANBadge({
	intent,
	showIcon = true,
	className,
	iconClassName,
	...props
}: PANBadgeProps) {
	// Flexible approach: cast to PANIntent. If key exists, use it. Else fallback to OTHER or try to match case-insensitive?
	// For now, assume uppercase keys.
	const safeIntent = (intent || "OTHER").toString().toUpperCase() as PANIntent;
	const config = PAN_BADGE_CONFIG[safeIntent] || PAN_BADGE_CONFIG.OTHER;
	const Icon = config.icon;

	return (
		<div
			className={cn(
				"inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
				config.className,
				className,
			)}
			style={
				{
					// Use CSS variables for consistent theming if classes fail or for fine-tuning
					// but tailwind arbitrary values like bg-[var(--status-pending)] work better.
					// Leaving style empty as Tailwind handles it.
				}
			}
			{...props}>
			{showIcon && <Icon className={cn("mr-1.5 h-3.5 w-3.5", iconClassName)} />}
			{config.label}
		</div>
	);
}
