import { Briefcase } from "lucide-react";
import { Card, CardContent } from "~/components/atoms/Card";

interface AttendanceStatsProps {
	todayHours: string;
	periodHours: string;
}

export function AttendanceStats({ todayHours, periodHours }: AttendanceStatsProps) {
	return (
		<Card className="mb-8 border-none shadow-sm bg-white overflow-hidden relative">
			<CardContent>
				<div className="flex items-center gap-3 mb-6">
					<div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100">
						<Briefcase className="w-4 h-4 text-gray-500" />
					</div>
					<h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
						Total Working Hours
					</h3>
				</div>

				<div className="grid grid-cols-2 gap-8 relative">
					{/* Vertical divider */}
					<div className="absolute left-1/2 top-1 bottom-1 w-px bg-gray-100 -ml-px" />

					<div className="space-y-1">
						<span className="text-xs text-gray-500 font-medium tracking-wide">
							Today
						</span>
						<p className="text-xl font-bold text-gray-900 font-heading">{todayHours}</p>
					</div>

					<div className="space-y-1 pl-4">
						<span className="text-xs text-gray-500 font-medium tracking-wide">
							This pay period
						</span>
						<p className="text-xl font-bold text-gray-900 font-heading">
							{periodHours}
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
