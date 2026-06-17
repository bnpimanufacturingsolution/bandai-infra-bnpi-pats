import { useNavigate } from "react-router";
import { StatusBadge } from "~/components/atoms/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { PANBadge, type PANIntent } from "~/components/atoms/PANBadge";
import { useEmployee, type EligibilityCandidate } from "~/lib/hooks/useEmployees";
import { Loader2, User, Briefcase, Calendar, Award, FileText, TrendingUp } from "lucide-react";

interface CandidateDetailsModalProps {
	candidateId: string;
	candidate?: EligibilityCandidate;
	onClose: () => void;
}

export function CandidateDetailsModal({
	candidateId,
	candidate,
	onClose,
}: CandidateDetailsModalProps) {
	const navigate = useNavigate();

	// Use metrics from the candidate object directly as "Proof"
	// The API returns keys: attendanceRate, absentDays, lates
	const metrics = (candidate as any)?.metrics;

	const attendanceRate = metrics?.attendanceRate || 0;
	const absentCount = metrics?.absentDays || 0;
	const lateCount = metrics?.lates || 0;

	const { data: employee, isLoading } = useEmployee(candidateId, [
		"id",
		"employeeId",
		"person.personalInfo.firstName",
		"person.personalInfo.lastName",
		"employmentStatus",
		"metadata",
		"department.name",
		"position",
		"employmentHireDate",
	]);

	const fullName = employee
		? `${employee.person?.personalInfo?.firstName || ""} ${
				employee.person?.personalInfo?.lastName || ""
			}`.trim()
		: "Unknown Employee";

	const handleViewProfile = () => {
		if (candidateId) {
			navigate(`/employee/${candidateId}`);
		}
	};

	const formatDate = (dateString: string | Date | undefined) => {
		if (!dateString) return "N/A";
		// Handle specific format if needed, defaulting to standard locale date
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	return (
		<Dialog open={!!candidateId} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[600px] w-full max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-50 border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-0 font-sans">
				{/* Decorative Background Elements */}
				<div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 rounded-lg">
					<div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-orange-200/20 blur-[120px]" />
					<div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-red-200/20 blur-[120px]" />
				</div>

				<div className="relative z-10">
					{isLoading ? (
						<div className="w-full h-64 flex items-center justify-center">
							<Loader2 className="w-8 h-8 animate-spin text-orange-500" />
						</div>
					) : (
						employee && (
							<div className="flex flex-col relative w-full">
								<DialogHeader className="px-6 py-6 border-b border-gray-100/50 bg-white/50 backdrop-blur-sm sticky top-0 z-20">
									<div className="flex items-start gap-4">
										<div className="h-16 w-16 shrink-0 rounded-2xl bg-primary flex items-center justify-center text-2xl text-white font-bold border border-white/20">
											{employee?.person?.personalInfo?.firstName?.[0]}
											{employee?.person?.personalInfo?.lastName?.[0]}
										</div>
										<div className="space-y-1">
											<DialogTitle className="text-xl font-bold text-gray-900 heading-premium flex items-center gap-2">
												{fullName}
												<StatusBadge
													status={employee?.employmentStatus}
													className="text-[10px] px-2 py-0.5 h-auto"
												/>
											</DialogTitle>
											<div className="flex items-center gap-2 text-sm text-gray-500">
												<Briefcase className="w-3.5 h-3.5" />
												<span>
													{employee?.position?.title || "No Position"}
												</span>
												<span className="text-gray-300">•</span>
												<span>
													{employee?.department?.name || "General"}
												</span>
											</div>
										</div>
									</div>
								</DialogHeader>

								<div className="p-6 space-y-6">
									{/* Info Cards */}
									<div className="grid grid-cols-2 gap-4">
										<div className="p-4 rounded-xl border border-white bg-white/60 shadow-sm backdrop-blur-md flex flex-col gap-1">
											<div className="flex items-center gap-2 text-xs font-medium text-gray-500">
												<Briefcase className="w-3.5 h-3.5" />
												Employee ID
											</div>
											<span className="text-sm font-semibold text-gray-900">
												{employee.employeeId}
											</span>
										</div>

										<div className="p-4 rounded-xl border border-white bg-white/60 shadow-sm backdrop-blur-md flex flex-col gap-1">
											<div className="flex items-center gap-2 text-xs font-medium text-gray-500">
												<Calendar className="w-3.5 h-3.5" />
												Hire Date
											</div>
											<span className="text-sm font-semibold text-gray-900">
												{formatDate(employee?.employmentHireDate)}
											</span>
										</div>
									</div>

									{/* Metrics Proof Section */}
									<div className="space-y-3">
										<h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
											<TrendingUp className="w-4 h-4 text-orange-500" />
											Performance Metrics
										</h4>
										<div className="grid grid-cols-3 gap-3">
											<div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center gap-1 group hover:border-orange-200 transition-colors">
												<span
													className={`text-xl font-bold ${attendanceRate >= 90 ? "text-green-600" : "text-amber-600"}`}>
													{Math.round(attendanceRate)}%
												</span>
												<span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold group-hover:text-orange-500 transition-colors">
													Attendance
												</span>
											</div>
											<div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center gap-1 group hover:border-red-200 transition-colors">
												<span className="text-xl font-bold text-red-500">
													{absentCount}
												</span>
												<span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold group-hover:text-red-500 transition-colors">
													Absences
												</span>
											</div>
											<div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center gap-1 group hover:border-amber-200 transition-colors">
												<span className="text-xl font-bold text-amber-500">
													{lateCount}
												</span>
												<span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold group-hover:text-amber-500 transition-colors">
													Lates
												</span>
											</div>
										</div>
									</div>

									{/* Eligibility Status Banner */}
									<div className="p-4 rounded-xl bg-gradient-to-r from-orange-50 to-white border border-orange-100 flex items-center justify-between shadow-sm">
										<div className="flex items-center gap-3">
											<div className="p-2 bg-white rounded-lg shadow-sm text-orange-600 ring-1 ring-orange-100">
												<Award className="w-4 h-4" />
											</div>
											<div className="flex flex-col">
												<span className="text-xs font-semibold text-orange-900 uppercase tracking-wide">
													Eligibility Status
												</span>
												<span className="text-xs text-orange-700/80">
													Recommended Action
												</span>
											</div>
										</div>
										<PANBadge
											intent={
												(candidate?.eligibleFor ||
													employee.metadata?.eligibleFor ||
													"PROMOTION") as PANIntent
											}
											className="px-3 py-1 shadow-sm text-xs"
										/>
									</div>
								</div>

								{/* Actions */}
								<div className="p-6 pt-2 bg-gray-50/50 flex items-center gap-3 border-t border-gray-100">
									<Button
										className="flex-1 bg-white hover:bg-gray-50 text-gray-700 hover:cursor-pointer hover:text-black border-gray-200 shadow-sm h-11"
										variant="outline"
										onClick={handleViewProfile}>
										<User className="w-4 h-4 mr-2 text-gray-500" />
										View Profile
									</Button>

									<Button
										className="flex-1 bg-primary hover:cursor-pointer text-white shadow-md border-0 h-11"
										onClick={() => {
											const params = new URLSearchParams();
											params.set("action", "create");
											params.set("kind", "personnel-action");
											params.set("targetEmployeeId", employee.id);
											if (candidate?.eligibleFor) {
												params.set("intent", candidate.eligibleFor);
											}
											navigate(`/employee/requests?${params.toString()}`);
										}}>
										<FileText className="w-4 h-4 mr-2" />
										Create Personnel Action
									</Button>
								</div>
							</div>
						)
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
