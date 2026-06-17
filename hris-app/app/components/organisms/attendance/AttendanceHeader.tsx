import { Clock } from "lucide-react";

interface AttendanceHeaderProps {
	employeeName: string;
}

export function AttendanceHeader({ employeeName }: AttendanceHeaderProps) {
	return (
		<div className="relative mb-8">
			<div className="flex flex-col gap-1">
				<h2 className="text-xl font-medium text-gray-500">Good morning {employeeName}!</h2>
				<h1 className="text-3xl font-bold tracking-tight text-gray-900">
					Let&apos;s get to <span className="text-primary">work!</span>
				</h1>
			</div>

			{/* Abstract Illustration - Minimal Bandai Style */}
			<div className="absolute right-0 top-0 -mt-2 opacity-10 md:opacity-100 pointer-events-none">
				<div className="relative w-24 h-24">
					<div className="absolute inset-0 bg-primary/10 rounded-full blur-xl" />
					<Clock className="w-full h-full text-primary rotate-12" strokeWidth={1} />
				</div>
			</div>
		</div>
	);
}
