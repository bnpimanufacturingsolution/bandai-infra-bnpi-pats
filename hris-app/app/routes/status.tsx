import { useEffect, useMemo, useState } from "react";
import { getRuntimeApiBase } from "~/lib/runtime-api-base";

type ModuleStatus = "operational" | "degraded_performance" | "partial_outage" | "major_outage";

type StatusModule = {
	name: string;
	slug: string;
	status: ModuleStatus;
	dependencies: string[];
	notes?: string;
};

type StatusIncident = {
	id: string;
	moduleName: string;
	startedAt: string;
	resolvedAt: string | null;
	message: string;
};

type StatusPayload = {
	status: ModuleStatus;
	baseApiPath: string;
	dependencies?: {
		database?: { status: "operational" | "major_outage"; error?: string | null };
		redis?: { status: "operational" | "major_outage"; error?: string | null; latencyMs?: number | null };
	};
	httpEvents?: {
		recentClientErrors?: Array<{
			moduleSlug: string;
			statusCode: number;
			message: string;
			at: string;
		}>;
		recentServerErrors?: Array<{
			moduleSlug: string;
			statusCode: number;
			message: string;
			at: string;
		}>;
	};
	modules: StatusModule[];
	incidents: StatusIncident[];
};

type TimelineItem = {
	startAt: string;
	status: ModuleStatus | "unknown";
	color: string;
	samples: number;
	reason?: string | null;
};

const statusText = (status: ModuleStatus): string => {
	if (status === "operational") return "All Systems Operational";
	if (status === "degraded_performance") return "Degraded Performance";
	if (status === "partial_outage") return "Partial Outage";
	return "Major Outage";
};

const toneClass = (status: ModuleStatus): string => {
	if (status === "operational") return "border-emerald-200 bg-emerald-50 text-emerald-900";
	if (status === "degraded_performance") return "border-amber-200 bg-amber-50 text-amber-900";
	if (status === "partial_outage") return "border-orange-200 bg-orange-50 text-orange-900";
	return "border-red-200 bg-red-50 text-red-900";
};

const apiBase = getRuntimeApiBase().replace(/\/$/, "");

export default function StatusPage() {
	const [status, setStatus] = useState<StatusPayload | null>(null);
	const [timelineByModule, setTimelineByModule] = useState<Record<string, TimelineItem[]>>({});
	const [error, setError] = useState<string | null>(null);
	const [selectedModule, setSelectedModule] = useState<StatusModule | null>(null);
	const [selectedBar, setSelectedBar] = useState<{ module: StatusModule; item: TimelineItem } | null>(null);

	const getBarReason = (module: StatusModule, item: TimelineItem): string => {
		if (item.reason && item.reason.trim().length > 0) return item.reason;
		if (item.status === "unknown") return "No sample was recorded for this time bucket.";
		if (item.status === "operational") return "No outage detected for this time bucket.";
		const deps = module.dependencies || [];
		const dbDown = status?.dependencies?.database?.status === "major_outage";
		const redisDown = status?.dependencies?.redis?.status === "major_outage";
		const reasons: string[] = [];
		if (deps.includes("database") && dbDown) {
			reasons.push(`Database issue: ${status?.dependencies?.database?.error || "unavailable"}`);
		}
		if (deps.includes("redis") && redisDown) {
			reasons.push(`Redis issue: ${status?.dependencies?.redis?.error || "unavailable"}`);
		}
		if (reasons.length > 0) return reasons.join(" | ");
		return `Service reported ${item.status.replace(/_/g, " ")} during this period.`;
	};

	useEffect(() => {
		let active = true;
		let timerId: ReturnType<typeof setTimeout> | undefined;

		const load = async () => {
			try {
				const statusRes = await fetch(`${apiBase}/status`, { credentials: "include" });
				const statusData = (await statusRes.json()) as StatusPayload;
				if (!statusData?.modules || !Array.isArray(statusData.modules)) {
					throw new Error(`Status request failed (${statusRes.status})`);
				}
				if (!active) return;
				setStatus(statusData);
				setError(null);

				const to = new Date();
				const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
				const fromIso = from.toISOString();
				const toIso = to.toISOString();

				const timelineEntries = await Promise.all(
					statusData.modules.map(async (module) => {
						const url = `${apiBase}/status/timeline?moduleSlug=${encodeURIComponent(module.slug)}&interval=day&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
						const timelineRes = await fetch(url, { credentials: "include" });
						if (!timelineRes.ok) return [module.slug, []] as const;
						const timelineJson = (await timelineRes.json()) as { data?: TimelineItem[] };
						return [module.slug, timelineJson.data ?? []] as const;
					}),
				);

				if (!active) return;
				setTimelineByModule(Object.fromEntries(timelineEntries));
			} catch (err) {
				if (!active) return;
				setError(err instanceof Error ? err.message : "Failed to load status");
			} finally {
				timerId = setTimeout(load, 30000);
			}
		};

		void load();
		return () => {
			active = false;
			if (timerId) clearTimeout(timerId);
		};
	}, []);

	const rangeLabel = useMemo(() => {
		const to = new Date();
		const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
		return `${from.toLocaleString("en-US", { month: "short", year: "numeric" })} - ${to.toLocaleString("en-US", { month: "short", year: "numeric" })}`;
	}, []);

	return (
		<main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
			<div className="mx-auto max-w-6xl">
				<div className={`rounded-xl border px-5 py-4 ${toneClass(status?.status ?? "operational")}`}>
					<h1 className="text-3xl font-bold">{statusText(status?.status ?? "operational")}</h1>
					<p className="mt-2 text-sm">
						HRIS API status for <code>{status?.baseApiPath ?? "/api"}</code>
					</p>
					<p className="mt-1 text-xs font-medium uppercase tracking-wide opacity-80">
						Scope: Global (all users)
					</p>
				</div>

				{error && <p className="mt-4 rounded-lg bg-red-100 px-4 py-3 text-red-800">{error}</p>}

				<section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
					<div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
						<h2 className="text-2xl font-semibold">System status</h2>
						<p className="text-sm text-slate-500">{rangeLabel}</p>
					</div>

					{status?.modules.map((module) => {
						const timeline = timelineByModule[module.slug] ?? [];
						const considered = timeline.filter((item) => item.samples > 0);
						const nonOperational = considered.filter((item) => item.status !== "operational").length;
						const uptime =
							considered.length === 0
								? 100
								: Math.round((((considered.length - nonOperational) / considered.length) * 100) * 100) / 100;

						return (
							<div key={module.slug} className="border-b border-slate-100 px-5 py-4 last:border-b-0">
								<div className="flex items-center justify-between gap-3">
									<div className="flex items-center gap-2">
										<span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
										<strong>{module.name}</strong>
										<button
											type="button"
											onClick={() => setSelectedModule(module)}
											className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
											{module.dependencies.length} dependencies
										</button>
									</div>
									<span className="text-sm text-slate-500">{uptime.toFixed(2)}% uptime</span>
								</div>
								<div className="mt-3 grid grid-cols-10 gap-1 md:grid-cols-[repeat(91,minmax(0,1fr))]">
									{timeline.map((item) => (
										<button
											type="button"
											key={`${module.slug}-${item.startAt}`}
											className="block h-4 rounded-[2px] md:h-5"
											style={{ backgroundColor: item.color }}
											title={`${new Date(item.startAt).toLocaleDateString()} | ${item.status} | samples: ${item.samples}`}
											onClick={() => setSelectedBar({ module, item })}
										/>
									))}
								</div>
							</div>
						);
					})}
				</section>

				<section className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
					<h3 className="mb-2 text-lg font-semibold">Recent incidents</h3>
					<ul className="space-y-2 text-sm text-slate-700">
						{(status?.incidents?.slice(0, 8) ?? []).map((incident) => (
							<li key={incident.id}>
								<strong>{incident.moduleName}</strong> - {incident.resolvedAt ? "Resolved" : "Ongoing"} -{" "}
								{new Date(incident.startedAt).toLocaleString()}
								<div>{incident.message}</div>
							</li>
						))}
						{(!status || status.incidents.length === 0) && <li>No incidents recorded.</li>}
					</ul>
				</section>

				<section className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
					<h3 className="mb-2 text-lg font-semibold">Recent client errors (401/403/404)</h3>
					<ul className="space-y-2 text-sm text-slate-700">
						{(status?.httpEvents?.recentClientErrors?.slice(0, 20) ?? []).map((event, idx) => (
							<li key={`${event.moduleSlug}-${event.at}-${idx}`}>
								<strong>{event.moduleSlug}</strong> - {event.statusCode} -{" "}
								{new Date(event.at).toLocaleString()}
								<div>{event.message}</div>
							</li>
						))}
						{(!status?.httpEvents?.recentClientErrors ||
							status.httpEvents.recentClientErrors.length === 0) && (
							<li>No recent client errors.</li>
						)}
					</ul>
				</section>
			</div>

			{selectedModule && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
					<div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
						<div className="flex items-start justify-between gap-4">
							<div>
								<h4 className="text-lg font-semibold">{selectedModule.name}</h4>
								<p className="text-sm text-slate-500">Infrastructure dependencies</p>
							</div>
							<button
								type="button"
								onClick={() => setSelectedModule(null)}
								className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50">
								Close
							</button>
						</div>
						<ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
							{selectedModule.dependencies.length > 0 ? (
								selectedModule.dependencies.map((dep) => <li key={dep}>{dep}</li>)
							) : (
								<li>No infrastructure dependency declared.</li>
							)}
						</ul>
						{selectedModule.notes && (
							<div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
								{selectedModule.notes}
							</div>
						)}
					</div>
				</div>
			)}

			{selectedBar && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
					<div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
						<div className="flex items-start justify-between gap-4">
							<div>
								<h4 className="text-lg font-semibold">{selectedBar.module.name}</h4>
								<p className="text-sm text-slate-500">
									{new Date(selectedBar.item.startAt).toLocaleString()}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setSelectedBar(null)}
								className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50">
								Close
							</button>
						</div>
						<div className="mt-4 space-y-2 text-sm text-slate-700">
							<p>
								<strong>Status:</strong> {selectedBar.item.status.replace(/_/g, " ")}
							</p>
							<p>
								<strong>Samples:</strong> {selectedBar.item.samples}
							</p>
							<p>
								<strong>Why:</strong> {getBarReason(selectedBar.module, selectedBar.item)}
							</p>
						</div>
					</div>
				</div>
			)}
		</main>
	);
}
