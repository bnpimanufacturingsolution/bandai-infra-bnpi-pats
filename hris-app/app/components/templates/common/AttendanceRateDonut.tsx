import { Pie, PieChart } from "recharts";

type AttendanceRateDonutProps = {
	value: number;
	label: string;
	rateLabel?: string;
	color?: string;
	trackColor?: string;
	isLoading?: boolean;
};

export function AttendanceRateDonut({
	value,
	label,
	rateLabel,
	color = "#334155",
	trackColor = "#e5e7eb",
	isLoading = false,
}: AttendanceRateDonutProps) {
	const raw = Math.max(0, Number(value) || 0);
	const percent = Math.max(0, Math.min(100, Math.round(raw)));
	const filled = raw > 0 ? Math.max(raw, 4) : 0;
	const remainder = Math.max(0, 100 - filled);
	const data =
		filled <= 0
			? [{ name: "track", value: 100, fill: trackColor }]
			: remainder <= 0
				? [{ name: "rate", value: 100, fill: color }]
				: [
						{ name: "rate", value: filled, fill: color },
						{ name: "track", value: remainder, fill: trackColor },
					];

	return (
		<div className="relative h-28 w-28 shrink-0">
			<PieChart width={112} height={112}>
				<Pie
					data={data}
					dataKey="value"
					cx="50%"
					cy="50%"
					innerRadius="72%"
					outerRadius="100%"
					cornerRadius="50%"
					paddingAngle={filled > 0 && remainder > 0 ? 5 : 0}
					startAngle={90}
					endAngle={-270}
					stroke="none"
					isAnimationActive={false}
				/>
			</PieChart>
			<div className="pointer-events-none absolute inset-0 grid place-items-center">
				<div className="text-center leading-none">
					<div className="text-2xl font-bold tabular-nums text-neutral-900">
						{isLoading ? "..." : rateLabel || `${percent}%`}
					</div>
					<div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
						{label}
					</div>
				</div>
			</div>
		</div>
	);
}
