import { useState } from "react";
import { GraduationCap, TrendingUp, X, LayoutGrid } from "lucide-react";
import { cn } from "~/lib/utils";
import { LAUNCHABLE_APPLICATIONS, type LaunchableApplicationId } from "~/lib/launchable-applications";

const applicationIcons: Record<
	LaunchableApplicationId,
	{ icon: typeof GraduationCap; iconColor: string }
> = {
	lms: { icon: GraduationCap, iconColor: "text-blue-500" },
	epmr: { icon: TrendingUp, iconColor: "text-violet-500" },
};

export function ApplicationLauncherPopover({ onClose }: { onClose?: () => void }) {
	const [launchingId, setLaunchingId] = useState<LaunchableApplicationId | null>(null);

	const handleSelect = (id: LaunchableApplicationId) => {
		// One click -> one tab, opened synchronously inside the click handler
		// so popup blockers treat it as user-initiated. All loading/auth
		// feedback lives in the newly opened tab, never here. If the open is
		// blocked (null), keep the launcher available for retry.
		if (launchingId) return;
		setLaunchingId(id);
		const tab = window.open(`/application-launch?app=${id}`, "_blank");
		if (tab) {
			onClose?.();
			return;
		}
		setLaunchingId(null);
	};

	return (
		<div className="relative w-full overflow-hidden rounded-[20px] border border-rose-100/80 bg-gradient-to-tr from-rose-50 via-white to-white shadow-[0_8px_30px_rgba(15,23,42,0.12)]">
			{/* Warm decorative gradients — bottom-left (primary) + top-right (secondary), clipped */}
			<div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-red-300/25 blur-3xl" />
			<div className="pointer-events-none absolute -bottom-8 -left-6 h-20 w-20 rounded-full bg-orange-200/30 blur-2xl" />
			<div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-rose-300/25 blur-3xl" />

			{/* Header */}
			<div className="relative flex items-center justify-between px-4 pt-4 pb-1">
				<div className="flex items-center gap-2">
					<LayoutGrid className="h-4 w-4 text-gray-400" />
					<h2 className="text-base font-semibold text-gray-900">Applications</h2>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close">
					<X className="h-4 w-4" />
				</button>
			</div>

			{/* Application items */}
			<div className="relative grid grid-cols-2 gap-2 px-3 pt-2 pb-3">
				{LAUNCHABLE_APPLICATIONS.map((app) => {
					const { icon: Icon, iconColor } = applicationIcons[app.id];
					return (
						<button
							key={app.id}
							type="button"
							onClick={() => handleSelect(app.id)}
							disabled={launchingId !== null}
							className={cn(
								"group flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-transparent px-4 py-4 text-center transition-all duration-150 ease-out",
								"hover:border-gray-200/70 hover:bg-white/70 hover:shadow-sm",
								"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
								"active:scale-[0.97]",
								launchingId !== null && "pointer-events-none opacity-40",
							)}>
							<Icon
								className={cn(
									"h-7 w-7 transition-all duration-150 ease-out group-hover:scale-105",
									iconColor,
								)}
								strokeWidth={1.5}
							/>
							<span className="text-sm font-medium text-gray-700">{app.displayName}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
