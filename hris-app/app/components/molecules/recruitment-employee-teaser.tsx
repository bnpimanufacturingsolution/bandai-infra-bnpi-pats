import { ChevronRight, ExternalLink } from "lucide-react";
import { ProfileInitialsAvatar } from "~/components/atoms/ProfileInitialsAvatar";
import { cn } from "~/lib/utils";

export type RecruitmentEmployeeTeaserProps = {
	name: string;
	role: string;
	level?: string | null;
	department?: string | null;
	/** HR-facing badge code (same string shown on employee profile header). */
	employeeCode?: string | null;
	email?: string | null;
	onOpenProfile: () => void;
	className?: string;
};

/**
 * Compact “employee record” preview for hired applicants: reuses ProfileInitialsAvatar
 * and surfaces what HR typically checks before opening the full employee profile.
 */
export function RecruitmentEmployeeTeaser({
	name,
	role,
	level,
	department,
	employeeCode,
	email,
	onOpenProfile,
	className,
}: RecruitmentEmployeeTeaserProps) {
	const hasRoleLine = Boolean(level || role || department);

	return (
		<button
			type="button"
			onClick={onOpenProfile}
			className={cn(
				"group w-full rounded-xl border border-[#e8dede] bg-white p-4 text-left shadow-sm transition hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
				className,
			)}
			aria-label={`Open employee profile for ${name}`}>
			<div className="flex items-start gap-4">
				<div className="shrink-0 rounded-full ring-2 ring-[#ff8a00]/35 ring-offset-2 ring-offset-[#fbf8f5]">
					<ProfileInitialsAvatar name={name} size="lg" variant="orange" />
				</div>
				<div className="min-w-0 flex-1 space-y-1">
					<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
						Employee record
					</p>
					<p className="font-heading text-base font-semibold tracking-tight text-neutral-900 transition group-hover:text-primary">
						{name}
					</p>
					{employeeCode ? (
						<p className="font-mono text-xs font-medium text-neutral-600">
							{employeeCode}
						</p>
					) : null}
					{hasRoleLine ? (
						<p className="text-sm leading-snug text-neutral-700">
							{level ? `${level} ` : null}
							{role || "—"}
							{department ? (
								<>
									{" "}
									<span className="text-neutral-400">•</span> {department}
								</>
							) : null}
						</p>
					) : null}
					{email ? (
						<p className="truncate text-xs text-[#5f5f63]" title={email}>
							{email}
						</p>
					) : null}
					<p className="inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-primary underline-offset-4 group-hover:underline">
						<ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
						View full employee profile
					</p>
				</div>
				<ChevronRight
					className="mt-1 h-5 w-5 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-primary"
					aria-hidden
				/>
			</div>
		</button>
	);
}
