import type { ReactNode } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { Badge } from "~/components/atoms/Badge";
import { cn } from "~/lib/utils";

type AdminConfigChipKind = "code" | "category" | "source" | "priority" | "policy";
type AdminConfigStatusTone =
	| "active"
	| "inactive"
	| "open"
	| "closed"
	| "processing"
	| "warning"
	| "neutral";

const chipClassByKind: Record<AdminConfigChipKind, string> = {
	code: "border-slate-200 bg-slate-50 font-mono text-[11px] font-semibold text-slate-700",
	category: "border-stone-200 bg-stone-50 text-[11px] font-semibold text-stone-700",
	source: "border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-800",
	priority: "border-orange-200 bg-orange-50 text-[11px] font-semibold text-orange-800",
	policy: "border-emerald-100 bg-emerald-50 text-[11px] font-semibold text-emerald-800",
};

const statusClassByTone: Record<AdminConfigStatusTone, string> = {
	active: "border-emerald-200 bg-emerald-50 text-emerald-800",
	inactive: "border-slate-200 bg-slate-50 text-slate-600",
	open: "border-blue-100 bg-blue-50 text-blue-800",
	closed: "border-slate-200 bg-slate-100 text-slate-700",
	processing: "border-amber-200 bg-amber-50 text-amber-800",
	warning: "border-orange-200 bg-orange-50 text-orange-800",
	neutral: "border-slate-200 bg-white text-slate-700",
};

export function AdminConfigChip({
	children,
	kind = "code",
	className,
	title,
}: {
	children: ReactNode;
	kind?: AdminConfigChipKind;
	className?: string;
	title?: string;
}) {
	return (
		<Badge
			variant="outline"
			title={title}
			className={cn(
				"w-fit max-w-full truncate rounded-md px-2 py-0.5",
				chipClassByKind[kind],
				className,
			)}>
			{children}
		</Badge>
	);
}

export function AdminConfigCodeChip({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<AdminConfigChip kind="code" className={className}>
			{children}
		</AdminConfigChip>
	);
}

export function AdminConfigCategoryChip({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<AdminConfigChip kind="category" className={className}>
			{children}
		</AdminConfigChip>
	);
}

export function AdminConfigSourceChip({
	children,
	className,
	title,
}: {
	children: ReactNode;
	className?: string;
	title?: string;
}) {
	return (
		<AdminConfigChip kind="source" className={className} title={title}>
			{children}
		</AdminConfigChip>
	);
}

export function AdminConfigPriorityChip({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<AdminConfigChip kind="priority" className={className}>
			{children}
		</AdminConfigChip>
	);
}

export function AdminConfigPolicyChip({
	children,
	className,
	title,
}: {
	children: ReactNode;
	className?: string;
	title?: string;
}) {
	return (
		<AdminConfigChip kind="policy" className={className} title={title}>
			{children}
		</AdminConfigChip>
	);
}

export function AdminConfigStatusBadge({
	active,
	children,
	tone,
	className,
}: {
	active?: boolean;
	children: ReactNode;
	tone?: AdminConfigStatusTone;
	className?: string;
}) {
	const resolvedTone = tone || (active ? "active" : "inactive");
	return (
		<Badge
			variant="outline"
			className={cn(
				"w-fit rounded-md px-2.5 py-0.5 text-xs font-semibold",
				statusClassByTone[resolvedTone],
				className,
			)}>
			{children}
		</Badge>
	);
}

export function AdminConfigPrimaryCell({
	primary,
	secondary,
	title,
	className,
	truncate = true,
}: {
	primary: ReactNode;
	secondary?: ReactNode;
	title?: string;
	className?: string;
	/** When false, primary text wraps instead of ellipsis truncation. Default true. */
	truncate?: boolean;
}) {
	return (
		<div className={cn("min-w-0", className)}>
			<div
				className={cn(
					"font-medium text-gray-900",
					truncate ? "truncate" : "whitespace-normal break-words",
				)}
				title={title}>
				{primary}
			</div>
			{secondary ? (
				<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">{secondary}</div>
			) : null}
		</div>
	);
}

export function AdminConfigMissingValue({
	label = "-",
	italic = false,
}: {
	label?: string;
	italic?: boolean;
}) {
	return <span className={cn("text-sm text-slate-400", italic && "italic")}>{label}</span>;
}

export const AdminConfigMutedDash = AdminConfigMissingValue;

export function AdminConfigDateText({
	children,
	estimated = false,
	className,
}: {
	children: ReactNode;
	estimated?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn("text-sm tabular-nums text-slate-600", estimated && "italic", className)}>
			{children}
		</span>
	);
}

export function AdminConfigRelationText({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <span className={cn("text-sm font-medium text-slate-800", className)}>{children}</span>;
}

export function AdminConfigRelationLink({
	children,
	to,
	title,
	className,
}: {
	children: ReactNode;
	to?: string | null;
	title?: string;
	className?: string;
}) {
	const inRouterContext = useInRouterContext();

	if (!children) return <AdminConfigMutedDash />;
	if (!to || !inRouterContext) {
		return (
			<AdminConfigRelationText className={className}>
				{children}
			</AdminConfigRelationText>
		);
	}

	return (
		<Link
			to={to}
			title={title}
			className={cn(
				"inline-flex max-w-full truncate rounded-sm text-sm font-medium text-slate-800 underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
				className,
			)}>
			{children}
		</Link>
	);
}

export function AdminConfigRoleText({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("text-sm font-semibold text-slate-900", className)}>{children}</span>
	);
}

export function AdminConfigLongText({
	children,
	className,
	title,
}: {
	children: ReactNode;
	className?: string;
	title?: string;
}) {
	return (
		<span
			className={cn("line-clamp-2 max-w-[28rem] text-sm text-slate-600", className)}
			title={title}>
			{children}
		</span>
	);
}

export function formatAdminConfigChipLabel(value: unknown, fallback = "Other") {
	const text = String(value || fallback).trim();
	return text
		.replace(/[_-]+/g, " ")
		.toLowerCase()
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
