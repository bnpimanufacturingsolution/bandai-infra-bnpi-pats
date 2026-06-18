import type { ReactNode } from "react";

export type ConstraintTokenTone = "default" | "invalid" | "subtle";

export type ConstraintTokenSpec = {
	label: string;
	tone?: ConstraintTokenTone;
};

const toneClassMap: Record<ConstraintTokenTone, string> = {
	default: "border-slate-200 bg-slate-100 text-slate-700",
	invalid: "border-red-200 bg-red-50 text-red-700",
	subtle: "border-slate-200 bg-white text-slate-500",
};

interface ConstraintTokenRowProps {
	tokens: Array<ConstraintTokenSpec | null | undefined | false>;
	className?: string;
	trailing?: ReactNode;
}

export function ConstraintTokenRow({ tokens, className = "", trailing }: ConstraintTokenRowProps) {
	const visibleTokens = tokens.filter(Boolean) as ConstraintTokenSpec[];

	if (visibleTokens.length === 0 && !trailing) return null;

	return (
		<div
			className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-none ${className}`.trim()}>
			{visibleTokens.map((token) => (
				<span
					key={`${token.label}-${token.tone || "default"}`}
					className={`inline-flex items-center rounded-md border px-1.5 py-1 font-medium tabular-nums ${toneClassMap[token.tone || "default"]}`}>
					[{token.label}]
				</span>
			))}
			{trailing}
		</div>
	);
}
