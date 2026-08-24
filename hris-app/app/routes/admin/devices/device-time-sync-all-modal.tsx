import { useEffect } from "react";
import { Button } from "~/components/atoms/Button";
import { Modal } from "~/components/atoms/Modal";
import { Badge } from "~/components/atoms/Badge";
import { Clock3 } from "lucide-react";
import {
	type HikvisionDeviceTimeSyncAllResponse,
	type HikvisionDeviceTimeSyncAllRow,
} from "~/services/devices.service";
import { useHikvisionDeviceTimeSyncAll } from "~/lib/hooks/useDevices";
import { HR_MODAL_STANDARD_CLASS } from "~/lib/ui/admin-configuration-modal";

type Step = "previewing" | "review" | "writing" | "done";

function formatSkew(seconds: number | null | undefined) {
	if (seconds === null || seconds === undefined) return "Unknown";
	if (seconds === 0) return "0s";
	return `${seconds > 0 ? "+" : "-"}${Math.abs(seconds)}s`;
}

export function DeviceTimeSyncAllModal({
	open,
	onClose,
	devices,
}: {
	open: boolean;
	onClose: () => void;
	devices: { id: string; name: string; address: string | null }[];
}) {
	const mutation = useHikvisionDeviceTimeSyncAll();
	const result = mutation.data as HikvisionDeviceTimeSyncAllResponse | undefined;
	const step: Step =
		mutation.isPending && !result
			? "previewing"
			: mutation.isPending && result?.execute
				? "writing"
				: result
					? result.execute
						? "done"
						: "review"
					: "previewing";

	useEffect(() => {
		if (!open) return;
		mutation.reset();
		mutation.mutate({ execute: false });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const writableCount = result ? Math.max(result.readable - 0, 0) : 0;

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Sync device time"
			className={HR_MODAL_STANDARD_CLASS}>
			<div className="space-y-4">
				<p className="text-sm text-slate-600">
					Reads every Hikvision panel clock and writes Manila time (UTC+8,
					CST-8:00:00, manual). Preview first; nothing is written until you confirm.
				</p>

				{step === "previewing" ? (
					<div className="flex items-center gap-2 py-6 text-sm text-slate-500">
						<Clock3 className="h-4 w-4 animate-spin" />
						Reading clocks on {devices.length} Hikvision device
						{devices.length === 1 ? "" : "s"}…
					</div>
				) : null}

				{(step === "review" || step === "writing" || step === "done") && result ? (
					<>
						<div className="flex flex-wrap items-center gap-2 text-xs">
							<Badge variant="secondary">Targets {result.totalTargets}</Badge>
							<Badge variant="outline">Readable {result.readable}</Badge>
							{result.execute ? (
								<Badge variant="default">Written {result.written}</Badge>
							) : null}
							{result.failed > 0 ? (
								<Badge variant="destructive">Failed {result.failed}</Badge>
							) : null}
							{!result.execute ? <Badge variant="secondary">Preview only</Badge> : null}
						</div>
						<div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200">
							<table className="w-full text-left text-xs">
								<thead className="sticky top-0 bg-slate-50 text-slate-500">
									<tr>
										<th className="px-3 py-2 font-medium">Device</th>
										<th className="px-3 py-2 font-medium">{step === "done" ? "After" : "Panel clock"}</th>
										<th className="px-3 py-2 font-medium">Drift</th>
										<th className="px-3 py-2 font-medium">Path</th>
										<th className="px-3 py-2 font-medium">Status</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{result.results.map((row: HikvisionDeviceTimeSyncAllRow) => (
										<tr key={row.deviceId} className="text-slate-700">
											<td className="px-3 py-2">
												<div className="font-medium text-slate-950">{row.name}</div>
												<div className="text-slate-400">{row.address}</div>
											</td>
											<td className="px-3 py-2 font-mono">
												{step === "done"
													? row.after?.localTime || "-"
													: row.before?.localTime || "-"}
											</td>
											<td className="px-3 py-2 font-mono">
												{formatSkew(
													step === "done"
														? row.after?.skewSeconds
														: row.before?.skewSeconds,
												)}
											</td>
											<td className="px-3 py-2">{row.transport || "-"}</td>
											<td className="px-3 py-2">
												{row.ok ? (
													row.execute && !row.wrote ? (
														<span className="text-amber-600">Unclear write</span>
													) : (
														<span className="text-emerald-600">
															{step === "done" ? "Updated" : "Readable"}
														</span>
													)
												) : (
													<span
														className="text-red-600"
														title={row.error || undefined}>
														Failed
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				) : null}

				<div className="flex justify-end gap-2 pt-1">
					<Button type="button" variant="outline" onClick={onClose}>
						{step === "done" ? "Close" : "Cancel"}
					</Button>
					{step === "review" ? (
						<Button
							type="button"
							disabled={mutation.isPending || writableCount === 0}
							onClick={() => mutation.mutate({ execute: true })}>
							<Clock3 className="mr-2 h-4 w-4" />
							{step === "writing"
								? "Updating clocks…"
								: `Update ${writableCount} clock${writableCount === 1 ? "" : "s"}`}
						</Button>
					) : null}
				</div>
			</div>
		</Modal>
	);
}

export default DeviceTimeSyncAllModal;
