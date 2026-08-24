import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Badge } from "~/components/atoms/Badge";
import { PANBadge, PAN_COLORS, type PANIntent } from "~/components/atoms/PANBadge";

type ChangeType = PANIntent;
import { DataTable, type Column } from "~/components/atoms/DataTable";
import {
	UserCheck,
	UserX,
	TrendingUp,
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
	Eye,
	MoreVertical,
	User,
	Calendar,
	Award,
	UserCog,
	FileEdit,
	ArrowRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EmployeeAvatar } from "~/components/atoms/EmployeeAvatar";

import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { resolveSocketBaseUrl } from "~/lib/api-url.helper";
import { getRuntimeApiBase } from "~/lib/runtime-api-base";
import { queryKeys as metricsQueryKeys, useMetrics } from "~/lib/hooks/useMetrics";
import { type EligibilityCandidate } from "~/lib/hooks/useEmployees";
import { EmploymentStatusText } from "~/components/shared/EmploymentStatusText";
import { CandidateDetailsModal } from "~/components/modals/CandidateDetailsModal";
// Circular Progress Component
const CircularProgress = ({
	percent,
	color,
	size = 120,
}: {
	percent: number;
	color: string;
	size?: number;
}) => {
	const radius = (size - 8) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (percent / 100) * circumference;

	return (
		<svg width={size} height={size} className="transform -rotate-90">
			{/* Background circle */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="#e5e7eb"
				strokeWidth="8"
			/>
			{/* Progress circle */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={color}
				strokeWidth="8"
				strokeDasharray={circumference}
				strokeDashoffset={offset}
				strokeLinecap="round"
				className="transition-all duration-500"
			/>
		</svg>
	);
};

/**
 * Employee Status Change Candidates
 *
 * This page displays employees who are eligible for status changes based on
 * automated criteria evaluation. The eligibility criteria are documented in:
 *
 * @see docs/employee-status-changes-eligibility.md
 *
 * Key eligibility triggers:
 * - PROMOTION: Regular employees with 18+ months tenure, 95%+ attendance, high performance
 * - REGULARIZATION: Probationary employees approaching probation end with satisfactory performance
 * - TERMINATION: Employees with excessive absences, chronic tardiness, or policy violations
 * - TRANSFER: Employees requesting transfer or organization-initiated reassignments
 */

// StatusChangeCandidate interface is mapped from EligibilityCandidate, ensuring id is present
interface StatusChangeCandidate extends EligibilityCandidate {
	id: string;
}

export default function EmployeeStatusChangesPage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [selectedFilter, setSelectedFilter] = useState<"all" | ChangeType>("all");
	console.log("User : ", user);
	const [searchParams, setSearchParams] = useSearchParams();
	const candidateId = searchParams.get("candidateId");

	// Use generic metrics hook
	const { data, isLoading } = useMetrics("Employee", ["eligibilityCandidates"], {
		organizationId: user?.organizationId,
	});

	const queryClient = useQueryClient();

	// Socket.io connection for real-time updates
	useEffect(() => {
		const socketBaseUrl = resolveSocketBaseUrl(
			getRuntimeApiBase(),
			typeof window !== "undefined" ? window.location.origin : "",
		);
		if (!socketBaseUrl) return;

		// Initialize socket connection
		const socket = io(socketBaseUrl, {
			transports: ["websocket"],
			withCredentials: true,
		});

		socket.on("connect", () => {
			console.log("Connected to socket for eligibility updates");
		});

		socket.on("eligibility-updated", (eventData: any) => {
			console.log("Received eligibility update:", eventData);
			// Invalidate metrics query
			queryClient.invalidateQueries({
				queryKey: metricsQueryKeys.metrics.all,
			});
		});

		return () => {
			socket.disconnect();
		};
	}, [queryClient]);

	// Extract candidates from the metrics response
	const candidates = data?.metrics?.eligibilityCandidates || [];

	// Map data directly
	const mappedData: StatusChangeCandidate[] = candidates;

	// Filter data - Client side filtering on the current page of data
	// Ideally this should be server side filtering if using pagination
	const filteredData =
		selectedFilter === "all"
			? mappedData
			: mappedData.filter((d: any) => d.eligibleFor === selectedFilter);

	// Calculate stats from the candidates list
	const stats = {
		promotion: candidates.filter((c: any) => c.eligibleFor === "PROMOTION").length,
		regularization: candidates.filter((c: any) => c.eligibleFor === "REGULARIZATION").length,
		transfer: candidates.filter((c: any) => c.eligibleFor === "TRANSFER").length,
		termination: candidates.filter((c: any) => c.eligibleFor === "TERMINATION").length,
	};

	// Total count for percentages
	const totalCandidates = candidates.length;

	// Handle deep linking for PAN Modal
	const isPanOpen = searchParams.get("action") === "create-pan";
	const panEmployeeObjectId = searchParams.get("employeeId");

	// Find candidate if available in the list to get default intent or details
	const targetId = candidateId || panEmployeeObjectId;
	const linkedCandidate = targetId
		? candidates?.find(
				(c: any) =>
					c.employeeId === targetId || c.id === targetId || (c as any)._id === targetId,
			)
		: null;

	// Derived state for the modal
	const panDefaultIntent = linkedCandidate?.eligibleFor;

	const handleCreateRequest = (item: StatusChangeCandidate) => {
		// Use id from item, fallback to _id if available (backend variation)
		const targetId = item.id || (item as any)._id;

		if (!targetId) {
			console.error("Missing employee ID for PAN request:", item);
			return;
		}

		// Navigate to the unified request hub and open the personnel action modal
		const params = new URLSearchParams();
		params.set("action", "create");
		params.set("kind", "personnel-action");
		params.set("targetEmployeeId", targetId);
		if (item.eligibleFor) {
			params.set("intent", item.eligibleFor);
		}
		navigate(`/employee/requests?${params.toString()}`);
	};

	const getEligibilityBadge = (type: ChangeType) => {
		switch (type) {
			case "PROMOTION":
				return (
					<Badge className="bg-green-100 text-green-800">
						<TrendingUp className="w-3 h-3 mr-1" />
						Promotion
					</Badge>
				);
			case "REGULARIZATION":
				return (
					<Badge className="bg-blue-100 text-blue-800">
						<UserCheck className="w-3 h-3 mr-1" />
						Regularization
					</Badge>
				);
			case "TRANSFER":
				return (
					<Badge className="bg-purple-100 text-purple-800">
						<ArrowRight className="w-3 h-3 mr-1" />
						Transfer
					</Badge>
				);
			case "TERMINATION":
				return (
					<Badge className="bg-red-100 text-red-800">
						<UserX className="w-3 h-3 mr-1" />
						Termination
					</Badge>
				);
			default:
				return <Badge>{type}</Badge>;
		}
	};

	const columns: Column<StatusChangeCandidate>[] = [
		{
			key: "employeeName",
			label: "Employee",
			width: "200px",
			sortable: true,
			render: (value, item) => (
				<div className="flex min-w-0 items-center gap-2.5">
					<EmployeeAvatar
						src={item.avatar}
						alt={item.employeeName}
						size="sm"
						className="shrink-0"
					/>
					<div className="min-w-0">
						<div className="truncate font-medium text-gray-900" title={item.employeeName}>
							{item.employeeName}
						</div>
						<div className="truncate text-xs text-gray-500" title={item.position}>
							{item.position}
						</div>
					</div>
				</div>
			),
		},
		{
			key: "department",
			label: "Department",
			width: "128px",
			sortable: true,
			render: (value) => (
				<span className="block truncate text-gray-700" title={String(value || "")}>
					{String(value || "-")}
				</span>
			),
		},
		{
			key: "currentEmploymentStatus",
			label: "Status",
			width: "96px",
			sortable: true,
			className: "whitespace-nowrap",
			render: (value) => <EmploymentStatusText status={value as string} />,
		},
		{
			key: "tenureMonths",
			label: "Tenure",
			width: "72px",
			sortable: true,
			className: "whitespace-nowrap",
			render: (value, item) => {
				const years = Math.floor(item.tenureMonths / 12);
				const months = item.tenureMonths % 12;
				return (
					<span className="text-sm whitespace-nowrap">
						{years > 0 && `${years}y `}
						{months}m
					</span>
				);
			},
		},
		{
			key: "eligibleFor",
			label: "Eligible For",
			width: "124px",
			sortable: true,
			className: "whitespace-nowrap",
			render: (value, item) => <PANBadge intent={item.eligibleFor} />,
		},
		{
			key: "eligibilityReason",
			label: "Eligibility Reason",
			sortable: false,
			render: (value) => (
				<div className="truncate text-sm text-gray-600" title={value as string}>
					{value}
				</div>
			),
		},
		{
			key: "actions",
			label: "Actions",
			width: "56px",
			isActionColumn: true,
			className: "text-center",
			headerClassName: "text-center",
			render: (value, item) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm">
							<MoreVertical className="w-4 h-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => {
								const targetId = item.id || (item as any)._id;
								if (targetId) {
									setSearchParams((prev: any) => {
										prev.set("candidateId", targetId);
										return prev;
									});
								}
							}}>
							<Eye className="w-4 h-4 mr-2" />
							View Details
						</DropdownMenuItem>

						<DropdownMenuItem
							onClick={() => handleCreateRequest(item)}
							className="cursor-pointer text-orange-600">
							<FileEdit className="w-4 h-4 mr-2" />
							Create Pan Request
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	];

	return (
		<div className="space-y-6">
			{/* Stats Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{/* Promotions */}
				<button
					onClick={() =>
						setSelectedFilter(selectedFilter === "PROMOTION" ? "all" : "PROMOTION")
					}
					className={`text-left transition-all rounded-xl ${
						selectedFilter === "PROMOTION" ? "ring-2 ring-gray-900 ring-offset-2" : ""
					}`}>
					<Card className="hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between gap-3">
								<div className="space-y-0.5">
									<div className="flex items-center gap-1.5">
										<div className="p-1.5 rounded-lg bg-gray-100">
											<TrendingUp className="h-4 w-4 text-gray-600" />
										</div>
									</div>
									<h3 className="text-xs font-semibold text-gray-700 mt-2">
										For Promotion
									</h3>
									<div className="space-y-0.25 text-xs">
										<div className="font-bold text-gray-900">
											{stats.promotion}
										</div>
									</div>
								</div>
								<div className="relative flex-shrink-0">
									<CircularProgress
										percent={
											totalCandidates > 0
												? (stats.promotion / totalCandidates) * 100
												: 0
										}
										color={PAN_COLORS.PROMOTION}
										size={80}
									/>
									<div className="absolute inset-0 flex flex-col items-center justify-center">
										<div className="text-lg font-bold text-gray-900">
											{stats.promotion}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</button>

				{/* Regularizations */}
				<button
					onClick={() =>
						setSelectedFilter(
							selectedFilter === "REGULARIZATION" ? "all" : "REGULARIZATION",
						)
					}
					className={`text-left transition-all rounded-xl ${
						selectedFilter === "REGULARIZATION"
							? "ring-2 ring-gray-900 ring-offset-2"
							: ""
					}`}>
					<Card className="hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between gap-3">
								<div className="space-y-0.5">
									<div className="flex items-center gap-1.5">
										<div className="p-1.5 rounded-lg bg-gray-100">
											<UserCheck className="h-4 w-4 text-gray-600" />
										</div>
									</div>
									<h3 className="text-xs font-semibold text-gray-700 mt-2">
										For Regularization
									</h3>
									<div className="space-y-0.25 text-xs">
										<div className="font-bold text-gray-900">
											{stats.regularization}
										</div>
									</div>
								</div>
								<div className="relative flex-shrink-0">
									<CircularProgress
										percent={
											totalCandidates > 0
												? (stats.regularization / totalCandidates) * 100
												: 0
										}
										color={PAN_COLORS.REGULARIZATION}
										size={80}
									/>
									<div className="absolute inset-0 flex flex-col items-center justify-center">
										<div className="text-lg font-bold text-gray-900">
											{stats.regularization}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</button>

				{/* Transfers */}
				<button
					onClick={() =>
						setSelectedFilter(selectedFilter === "TRANSFER" ? "all" : "TRANSFER")
					}
					className={`text-left transition-all rounded-xl ${
						selectedFilter === "TRANSFER" ? "ring-2 ring-gray-900 ring-offset-2" : ""
					}`}>
					<Card className="hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between gap-3">
								<div className="space-y-0.5">
									<div className="flex items-center gap-1.5">
										<div className="p-1.5 rounded-lg bg-gray-100">
											<ArrowRight className="h-4 w-4 text-gray-600" />
										</div>
									</div>
									<h3 className="text-xs font-semibold text-gray-700 mt-2">
										For Transfer
									</h3>
									<div className="space-y-0.25 text-xs">
										<div className="font-bold text-gray-900">
											{stats.transfer}
										</div>
									</div>
								</div>
								<div className="relative flex-shrink-0">
									<CircularProgress
										percent={
											totalCandidates > 0
												? (stats.transfer / totalCandidates) * 100
												: 0
										}
										color="#a855f7"
										size={80}
									/>
									<div className="absolute inset-0 flex flex-col items-center justify-center">
										<div className="text-lg font-bold text-gray-900">
											{stats.transfer}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</button>

				{/* Terminations */}
				<button
					onClick={() =>
						setSelectedFilter(selectedFilter === "TERMINATION" ? "all" : "TERMINATION")
					}
					className={`text-left transition-all rounded-xl ${
						selectedFilter === "TERMINATION" ? "ring-2 ring-gray-900 ring-offset-2" : ""
					}`}>
					<Card className="hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between gap-3">
								<div className="space-y-0.5">
									<div className="flex items-center gap-1.5">
										<div className="p-1.5 rounded-lg bg-gray-100">
											<UserX className="h-4 w-4 text-gray-600" />
										</div>
									</div>
									<h3 className="text-xs font-semibold text-gray-700 mt-2">
										For Termination
									</h3>
									<div className="space-y-0.25 text-xs">
										<div className="font-bold text-gray-900">
											{stats.termination}
										</div>
									</div>
								</div>
								<div className="relative flex-shrink-0">
									<CircularProgress
										percent={
											totalCandidates > 0
												? (stats.termination / totalCandidates) * 100
												: 0
										}
										color={PAN_COLORS.TERMINATION}
										size={80}
									/>
									<div className="absolute inset-0 flex flex-col items-center justify-center">
										<div className="text-lg font-bold text-gray-900">
											{stats.termination}
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</button>
			</div>

			{/* Filter Info */}
			{selectedFilter !== "all" && (
				<div className="flex items-center gap-2">
					<Badge className="bg-orange-100 text-orange-800">
						Showing:{" "}
						{selectedFilter
							.split("_")
							.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
							.join(" ")}
					</Badge>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setSelectedFilter("all")}
						className="text-sm text-gray-600 hover:text-gray-900">
						Clear Filter
					</Button>
				</div>
			)}

			{/* Data Table */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Award className="w-5 h-5 text-orange-500" />
						Status Change Candidates
					</CardTitle>
				</CardHeader>
				<CardContent>
					<DataTable<StatusChangeCandidate>
						title=""
						data={filteredData}
						columns={columns}
						showSearch
						searchPlaceholder="Search by employee name, department, or eligibility..."
						noCard
					/>
				</CardContent>
			</Card>

			{/* Candidate Details Modal */}
			{candidateId && linkedCandidate && (
				<CandidateDetailsModal
					candidateId={candidateId}
					candidate={linkedCandidate}
					onClose={() =>
						setSearchParams((prev) => {
							prev.delete("candidateId");
							return prev;
						})
					}
				/>
			)}
		</div>
	);
}
