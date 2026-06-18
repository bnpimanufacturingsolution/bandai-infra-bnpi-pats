import { Clock, Lock } from "lucide-react";
import { differenceInSeconds } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/atoms/Button";
import { useClockIn, useClockOut, useTodayAttendance } from "~/lib/hooks/useEmployees";
import { getEmployeeActionBlock } from "~/lib/employee-action-block";
import type { Employee } from "~/services/employees.service";

interface ProfileHeaderCardProps {
	employee: Employee | undefined;
	employeeId: string;
	showClockToggle?: boolean;
}

const getInitials = (firstName?: string, lastName?: string) => {
	const first = firstName?.charAt(0) || "";
	const last = lastName?.charAt(0) || "";
	return `${first}${last}` || "UK";
};

const fmtTime = (seconds: number) => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export function ProfileHeaderCard({
	employee,
	employeeId,
	showClockToggle = false,
}: ProfileHeaderCardProps) {
	const navigate = useNavigate();
	const clockInMutation = useClockIn();
	const clockOutMutation = useClockOut();
	const { data: todayAttendance } = useTodayAttendance(employeeId);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const actionBlock = getEmployeeActionBlock(employee);

	const isClockedIn = !!todayAttendance?.timeIn && !todayAttendance?.timeOut;

	useEffect(() => {
		let intervalId: ReturnType<typeof setInterval> | undefined;
		if (isClockedIn && todayAttendance?.timeIn) {
			const start = new Date(todayAttendance.timeIn);
			const tick = () => setElapsedSeconds(differenceInSeconds(new Date(), start));
			tick();
			intervalId = setInterval(tick, 1000);
		} else {
			setElapsedSeconds(0);
		}

		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, [isClockedIn, todayAttendance?.timeIn]);

	const firstName = employee?.person?.personalInfo?.firstName || "";
	const lastName = employee?.person?.personalInfo?.lastName || "";
	const position = employee?.position?.title || "Employee";
	const levelName = employee?.level?.name || "";
	const positionDisplay = levelName ? `${levelName} ${position}` : position;
	const department = employee?.department?.name || "Unassigned Department";
	const managerFirstName = (employee as any)?.reportTo?.person?.personalInfo?.firstName || "";
	const managerLastName = (employee as any)?.reportTo?.person?.personalInfo?.lastName || "";
	const managerName =
		managerFirstName && managerLastName ? `${managerFirstName} ${managerLastName}` : "";
	const managerId = (employee as any)?.reportTo?.id || "";
	const managerInitials = getInitials(managerFirstName, managerLastName);
	const initials = useMemo(() => getInitials(firstName, lastName), [firstName, lastName]);
	const profileId = employee?.id || employeeId;

	const handleClockToggle = async () => {
		if (actionBlock.blocked) return;
		if (!employeeId) return;
		if (isClockedIn) {
			await clockOutMutation.mutateAsync({ employeeId });
			return;
		}
		await clockInMutation.mutateAsync({ employeeId });
	};

	return (
		<div className="flex flex-col lg:flex-row items-start justify-between gap-6 lg:gap-8">
			<div
				role={profileId ? "button" : undefined}
				tabIndex={profileId ? 0 : -1}
				onClick={() => profileId && navigate(`/employee/${profileId}`)}
				onKeyDown={(e) => {
					if (!profileId) return;
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						navigate(`/employee/${profileId}`);
					}
				}}
				className={`flex items-start gap-4 flex-1 rounded-lg ${profileId ? "cursor-pointer hover:bg-orange-50/40 px-2 py-1 -mx-2 -my-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300" : ""}`}>
				<div className="w-14 h-14 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xl font-bold border-2 border-white shadow-sm flex-shrink-0">
					{initials}
				</div>
				<div className="space-y-0.5">
					<h2 className="text-xl font-bold text-gray-900 leading-tight">
						Hi, {firstName}!
					</h2>
					<p className="text-sm font-medium text-orange-600 leading-tight">
						{positionDisplay}
					</p>
					<p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest leading-tight">
						{department.toUpperCase()} DEPT.
					</p>
				</div>
			</div>

			<div className="flex flex-col items-start gap-3 lg:items-end lg:gap-2.5 w-full lg:w-auto">
				{showClockToggle && isClockedIn && (
					<div className="text-sm font-mono font-semibold text-gray-600">
						<Clock className="w-4 h-4 inline mr-1.5 text-orange-500" />
						{fmtTime(elapsedSeconds)}
					</div>
				)}

				{showClockToggle && (
					<div className="flex flex-col items-start gap-2 lg:items-end">
						<Button
							onClick={handleClockToggle}
							disabled={
								actionBlock.blocked ||
								clockInMutation.isPending ||
								clockOutMutation.isPending
							}
							className={`whitespace-nowrap font-semibold px-5 py-2.5 ${
								actionBlock.blocked
									? "bg-gray-300 text-gray-700 hover:bg-gray-300"
									: isClockedIn
										? "bg-red-500 hover:bg-red-600 text-white"
										: "bg-orange-600 hover:bg-orange-700 text-white"
							}`}>
							{actionBlock.blocked ? (
								<Lock className="w-4 h-4 mr-2" />
							) : (
								<Clock className="w-4 h-4 mr-2" />
							)}
							{actionBlock.blocked ? "Actions Blocked" : isClockedIn ? "Clock Out" : "Clock In"}
						</Button>
						{actionBlock.blocked && (
							<p className="max-w-xs text-xs leading-5 text-amber-700">
								{actionBlock.message}
							</p>
						)}
					</div>
				)}

				{managerName && (
					<div
						role={managerId ? "button" : undefined}
						tabIndex={managerId ? 0 : -1}
						onClick={() => managerId && navigate(`/employee/${managerId}`)}
						onKeyDown={(e) => {
							if (!managerId) return;
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								navigate(`/employee/${managerId}`);
							}
						}}
						className={`flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100 ${
							managerId
								? "cursor-pointer hover:border-orange-200 hover:bg-orange-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
								: ""
						}`}>
						<div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
							{managerInitials}
						</div>
						<span className="text-xs font-medium text-gray-600">
							Manager:{" "}
							<span
								className={`text-gray-900 ${
									managerId ? "hover:text-orange-700 hover:underline" : ""
								}`}>
								{managerName}
							</span>
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
