import type { ReactNode } from "react";

interface RulesPoliciesShellProps {
	title: string;
	actions?: ReactNode;
	tabs?: ReactNode;
	children: ReactNode;
	className?: string;
	maxWidth?: string;
}

export function RulesPoliciesShell({
	title,
	actions,
	tabs,
	children,
	className = "",
	maxWidth = "max-w-7xl",
}: RulesPoliciesShellProps) {
	return (
		<div className={`mx-auto w-full ${maxWidth} space-y-3 ${className}`}>
			<div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<h1 className="text-lg font-semibold tracking-tight text-gray-900">
						{title}
					</h1>
					{actions ? (
						<div className="flex flex-wrap items-center gap-2">{actions}</div>
					) : null}
				</div>
				{tabs ? <div className="mt-3">{tabs}</div> : null}
			</div>
			{children}
		</div>
	);
}
