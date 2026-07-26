import { useState } from "react";
import type { DeviceLiveReadiness, DeviceLiveReadinessLevel } from "~/services/devices.service";
import { cn } from "~/lib/utils";
import { Button } from "~/components/atoms/Button";
import { Switch } from "~/components/ui/switch";
import {
	Database,
	Radio,
	ShieldCheck,
	AlertTriangle,
	XCircle,
	Loader2,
	ChevronDown,
	ChevronUp,
	Zap,
} from "lucide-react";

const levelBadge: Record<DeviceLiveReadinessLevel, string> = {
	green: "border-emerald-300 bg-emerald-100 text-emerald-950",
	yellow: "border-amber-300 bg-amber-100 text-amber-950",
	red: "border-red-300 bg-red-100 text-red-950",
};

const levelDot: Record<DeviceLiveReadinessLevel, string> = {
	green: "bg-emerald-500",
	yellow: "bg-amber-500",
	red: "bg-red-500",
};

const checkIcon = (id: string) => {
	if (id === "database") return Database;
	if (id === "liveCapture") return Radio;
	return ShieldCheck;
};

const shortOverall = (
	level: DeviceLiveReadinessLevel,
	mode: "events" | "enroll",
	safeToEnroll: boolean,
	safeToTap: boolean,
) => {
	if (level === "green" && safeToEnroll && safeToTap) {
		return mode === "enroll" ? "Safe to enroll" : "Safe to tap / enroll";
	}
	if (level === "yellow") return mode === "enroll" ? "Needs fresh proof" : "Ready for tap proof";
	return mode === "enroll" ? "Not safe to enroll" : "Not ready for live ops";
};

/**
 * Compact top-bar readiness + Keep ready toggle + Prove button.
 * Keep ready persists in localStorage and auto-repairs when the parent wires it.
 * Parent must only set keepReadyWorking for true red-path repair — never while green.
 */
export function DeviceLiveReadinessStrip({
	readiness,
	isLoading,
	errorMessage,
	mode = "events",
	className,
	compact = false,
	onProve,
	isProving,
	keepReady = false,
	onKeepReadyChange,
	keepReadyWorking = false,
}: {
	readiness?: DeviceLiveReadiness | null;
	isLoading?: boolean;
	errorMessage?: string | null;
	mode?: "events" | "enroll";
	className?: string;
	compact?: boolean;
	onProve?: () => void;
	isProving?: boolean;
	/** When on, auto re-arm / prove while page is open (persisted by parent). */
	keepReady?: boolean;
	onKeepReadyChange?: (on: boolean) => void;
	/** True only while auto-repairing a red path (not while green). */
	keepReadyWorking?: boolean;
}) {
	const [open, setOpen] = useState(false);

	const keepReadyControl =
		typeof onKeepReadyChange === "function" ? (
			<label
				className={cn(
					"inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold",
					keepReady
						? "border-emerald-400 bg-emerald-50 text-emerald-950"
						: "border-slate-200 bg-white text-slate-700",
				)}
				title="When ON: only auto-repairs if the live path goes red (DB/listener down). Stays quiet while green. Saved after refresh.">
				<Switch
					checked={keepReady}
					onCheckedChange={(checked) => onKeepReadyChange(Boolean(checked))}
					className="scale-90 data-[state=checked]:bg-emerald-600"
					aria-label="Keep live path ready"
				/>
				<span className="whitespace-nowrap">
					Keep ready{keepReady ? " ON" : ""}
					{keepReady && keepReadyWorking ? " · repairing" : ""}
				</span>
			</label>
		) : null;

	if (isLoading && !readiness) {
		return (
			<div
				className={cn(
					"flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700",
					className,
				)}>
				<span className="inline-flex items-center gap-2">
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
					Checking DB + live path
				</span>
				{keepReadyControl}
			</div>
		);
	}

	if (errorMessage && !readiness) {
		return (
			<div
				className={cn(
					"flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between",
					className,
				)}>
				<div className="flex min-w-0 items-start gap-2">
					<XCircle className="mt-0.5 h-4 w-4 shrink-0" />
					<div className="min-w-0">
						<p className="font-semibold">Live path health check failed</p>
						<p className="mt-0.5 break-words text-xs text-red-800">{errorMessage}</p>
						<p className="mt-1 text-xs text-red-700">
							Turn <strong>Keep ready</strong> ON to auto-retry, or click Prove live path.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{keepReadyControl}
					{onProve ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8 shrink-0 border-red-300 px-3 text-xs text-red-800 hover:bg-red-100"
							disabled={isProving}
							onClick={onProve}>
							{isProving ? (
								<Loader2 className="mr-1 h-3 w-3 animate-spin" />
							) : (
								<Zap className="mr-1 h-3 w-3" />
							)}
							Prove live path
						</Button>
					) : null}
				</div>
			</div>
		);
	}

	if (!readiness) return null;

	const level = readiness.overall;
	const OverallIcon =
		level === "green" ? ShieldCheck : level === "yellow" ? AlertTriangle : XCircle;
	// Gate labels follow truth flags, not overall color.
	const tapLabel = readiness.safeToTap ? "YES" : "NO";
	const enrollLabel = readiness.safeToEnroll ? "YES" : "NO";
	// Never show Prove spinner chrome as "broken" when path is already green.
	const showProveBusy = Boolean(isProving) && level !== "green";

	return (
		<div className={cn("min-w-0", className)}>
			<div
				className={cn(
					"flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5",
					levelBadge[level],
				)}>
				<button
					type="button"
					className="inline-flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					title={readiness.headline}>
					<span className={cn("h-2 w-2 shrink-0 rounded-full", levelDot[level])} />
					<OverallIcon className="h-3.5 w-3.5 shrink-0" />
					<span className="truncate">
						{shortOverall(level, mode, readiness.safeToEnroll, readiness.safeToTap)}
					</span>
					<span className="hidden font-normal opacity-80 sm:inline">
						· DB {readiness.database.ok ? "ok" : "down"} · Live{" "}
						{readiness.listener.receiving
							? "receiving"
							: readiness.listener.armed
								? "armed"
								: readiness.listener.running
									? "quiet"
									: "off"}
						{readiness.proof.fresh
							? " · proof fresh"
							: readiness.proof.stale
								? " · proof stale"
								: " · proof aging"}
					</span>
					{open ? (
						<ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-70" />
					) : (
						<ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
					)}
				</button>

				<span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
					Tap {tapLabel} · Enroll {enrollLabel}
				</span>

				<div className="ml-auto flex flex-wrap items-center gap-1.5">
					{keepReadyControl}
					{onProve ? (
						<Button
							type="button"
							size="sm"
							variant={level === "green" ? "outline" : "default"}
							className={cn(
								"h-7 px-2 text-xs",
								level !== "green" && "bg-slate-900 text-white hover:bg-slate-800",
							)}
							disabled={isProving}
							onClick={onProve}>
							{isProving ? (
								<Loader2 className="mr-1 h-3 w-3 animate-spin" />
							) : (
								<Zap className="mr-1 h-3 w-3" />
							)}
							{showProveBusy ? "Working" : isProving ? "Checking" : "Prove / fix now"}
						</Button>
					) : null}
				</div>
			</div>

			{open ? (
				<div className="mt-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 shadow-sm">
					<p className="font-medium text-slate-900">{readiness.headline}</p>
					<p className="mt-0.5 text-[11px] text-slate-600">
						<strong>Keep ready ON</strong> stays quiet while green and only auto-repairs if
						the path goes red (listener/DB). It cannot fix a down database tunnel by itself
						— predev/DB access still needed for that. Green needs{" "}
						<strong>database</strong> + <strong>live capture</strong> +{" "}
						<strong>recent proof</strong>.
					</p>
					<div className="mt-2 grid gap-1 sm:grid-cols-3">
						{readiness.checks.map((check) => {
							const Icon = checkIcon(check.id);
							return (
								<div
									key={check.id}
									className={cn("rounded border px-2 py-1.5", levelBadge[check.level])}>
									<div className="flex items-center gap-1 font-semibold">
										<Icon className="h-3 w-3" />
										{check.label}
									</div>
									<p className="mt-0.5 leading-snug opacity-90">{check.detail}</p>
								</div>
							);
						})}
					</div>
					{!compact && readiness.reasons?.length ? (
						<ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px]">
							{readiness.reasons.slice(0, 3).map((r) => (
								<li key={r}>{r}</li>
							))}
						</ul>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export default DeviceLiveReadinessStrip;
