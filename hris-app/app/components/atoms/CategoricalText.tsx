import * as React from "react";
import { cn } from "~/lib/utils";

export type CategoricalTextTone =
	| "green"
	| "slate"
	| "gray"
	| "blue"
	| "amber"
	| "orange"
	| "purple"
	| "red"
	| "neutral";

export interface CategoricalTextProps extends React.ComponentProps<"span"> {
	value?: React.ReactNode;
	tone?: CategoricalTextTone;
	dotClassName?: string;
}

const toneClasses: Record<CategoricalTextTone, { text: string; dot: string }> = {
	green: { text: "text-green-700", dot: "bg-green-500" },
	slate: { text: "text-slate-600", dot: "bg-slate-400" },
	gray: { text: "text-gray-600", dot: "bg-gray-400" },
	blue: { text: "text-blue-700", dot: "bg-blue-500" },
	amber: { text: "text-amber-700", dot: "bg-amber-500" },
	orange: { text: "text-orange-700", dot: "bg-orange-500" },
	purple: { text: "text-purple-700", dot: "bg-purple-500" },
	red: { text: "text-red-700", dot: "bg-red-500" },
	neutral: { text: "text-gray-600", dot: "bg-gray-400" },
};

const inferredToneByValue: Record<string, CategoricalTextTone> = {
	active: "green",
	available: "green",
	completed: "green",
	enabled: "green",
	enrolled: "green",
	paid: "green",
	present: "green",
	yes: "green",
	automatic: "blue",
	compensation: "blue",
	current: "blue",
	open: "blue",
	processing: "blue",
	deduction: "purple",
	manual: "purple",
	required: "amber",
	draft: "amber",
	pending: "amber",
	cancelled: "red",
	failed: "red",
	no: "slate",
	disabled: "slate",
	inactive: "slate",
	optional: "slate",
	unpaid: "slate",
};

export function formatCategoricalTextLabel(value: React.ReactNode): React.ReactNode {
	if (typeof value !== "string") return value;

	const formatted = value
		.trim()
		.replace(/[_-]+/g, " ")
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

	return formatted || value;
}

function inferCategoricalTextTone(value: React.ReactNode): CategoricalTextTone {
	if (typeof value !== "string") return "neutral";
	return inferredToneByValue[value.trim().toLowerCase().replace(/[_-]+/g, " ")] || "neutral";
}

export function CategoricalText({
	value,
	tone,
	children,
	className,
	dotClassName,
	...props
}: CategoricalTextProps) {
	const content = children ?? formatCategoricalTextLabel(value);
	const resolvedTone = tone || inferCategoricalTextTone(content);
	const classes = toneClasses[resolvedTone] || toneClasses.neutral;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-sm font-semibold",
				classes.text,
				className,
			)}
			{...props}>
			<span
				aria-hidden="true"
				className={cn("h-2 w-2 rounded-full", classes.dot, dotClassName)}
			/>
			{content}
		</span>
	);
}
