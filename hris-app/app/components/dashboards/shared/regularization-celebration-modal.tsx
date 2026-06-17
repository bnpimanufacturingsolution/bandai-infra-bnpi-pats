import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { BadgeCheck, CalendarCheck, PartyPopper, Sparkles, UserRound } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { isNotificationUnread, useNotifications } from "~/contexts/notification-context";
import { useEmployee } from "~/lib/hooks/useEmployees";
import { cn } from "~/lib/utils";

const employeeFields = [
	"id",
	"employeeId",
	"employmentType",
	"employmentStatus",
	"metadata",
	"person.personalInfo",
	"department.name",
	"position.title",
] as const;

const confettiPieces = Array.from({ length: 24 }, (_, index) => ({
	id: index,
	left: `${6 + ((index * 37) % 88)}%`,
	delay: `${(index % 8) * 0.12}s`,
	duration: `${1.8 + (index % 5) * 0.16}s`,
	color: ["#c0000b", "#ff8a00", "#177245", "#2563eb"][index % 4],
	rotate: `${(index % 6) * 24}deg`,
}));

const getFullName = (employee: any, fallback?: string | null) => {
	const personalInfo = employee?.person?.personalInfo || {};
	const fullName = [personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();
	return fullName || fallback || "teammate";
};

const formatDate = (value?: string | Date | null) => {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat("en", {
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(date);
};

const getNotificationMetadata = (notification: any) =>
	(notification?.metadata && typeof notification.metadata === "object"
		? notification.metadata
		: {}) as Record<string, any>;

export function RegularizationCelebrationModal({
	employeeId,
	enabled,
}: {
	employeeId: string;
	enabled: boolean;
}) {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { markAsRead, notifications } = useNotifications();
	const [isOpen, setIsOpen] = useState(false);
	const [isDismissed, setIsDismissed] = useState(false);
	const { data: employee, refetch } = useEmployee(enabled ? employeeId : "", [...employeeFields]);
	const regularizationNotificationId = searchParams.get("regularizationNotification");

	const completedRegularizationNotification = useMemo(() => {
		const matchingNotifications = notifications.filter((notification) => {
			const metadata = getNotificationMetadata(notification);
			return (
				String(metadata.requestType || "").toUpperCase() === "REGULARIZATION" &&
				String(metadata.status || "").toUpperCase() === "COMPLETED"
			);
		});

		const targetedNotification = matchingNotifications.find(
			(notification) => notification.id === regularizationNotificationId,
		);
		if (targetedNotification) {
			return targetedNotification;
		}

		return matchingNotifications.find((notification) =>
			isNotificationUnread(notification, employeeId),
		);
	}, [employeeId, notifications, regularizationNotificationId]);

	useEffect(() => {
		if (completedRegularizationNotification && enabled && employeeId) {
			void refetch();
		}
	}, [completedRegularizationNotification, employeeId, enabled, refetch]);

	useEffect(() => {
		if (regularizationNotificationId) {
			setIsDismissed(false);
		}
	}, [regularizationNotificationId]);

	const celebration = useMemo(() => {
		if (
			!enabled ||
			!employee ||
			employee.employmentType !== "REGULAR" ||
			!completedRegularizationNotification
		) {
			return null;
		}

		const metadata =
			employee.metadata && typeof employee.metadata === "object" ? employee.metadata : {};
		const lastPanApplication =
			metadata.lastPanApplication && typeof metadata.lastPanApplication === "object"
				? metadata.lastPanApplication
				: null;
		const notificationMetadata = getNotificationMetadata(completedRegularizationNotification);
		const isRegularizationPan =
			String(lastPanApplication?.requestType || "").toUpperCase() === "REGULARIZATION";
		const requestId =
			(isRegularizationPan ? lastPanApplication?.requestId : null) ||
			notificationMetadata.entityId ||
			metadata.lastActionRequest ||
			null;
		const appliedAt =
			(isRegularizationPan ? lastPanApplication?.appliedAt : null) ||
			metadata.lastActionDate ||
			completedRegularizationNotification?.createdAt ||
			null;

		if (!requestId && !completedRegularizationNotification) {
			return null;
		}

		return {
			notificationId: completedRegularizationNotification.id,
			requestId,
			name: getFullName(employee),
			employeeCode: employee.employeeId,
			departmentName: employee.department?.name || null,
			positionTitle: employee.position?.title || null,
			effectiveDate: formatDate(lastPanApplication?.effectiveDate || appliedAt),
		};
	}, [completedRegularizationNotification, employee, enabled]);

	useEffect(() => {
		if (!celebration || isDismissed) {
			return;
		}

		setIsOpen(true);
	}, [celebration, isDismissed]);

	const acknowledge = async () => {
		if (celebration?.notificationId) {
			await markAsRead(celebration.notificationId);
		}
		if (regularizationNotificationId) {
			const nextSearchParams = new URLSearchParams(searchParams);
			nextSearchParams.delete("regularizationNotification");
			setSearchParams(nextSearchParams, { replace: true });
		}
		setIsDismissed(true);
		setIsOpen(false);
	};

	if (!celebration) {
		return null;
	}

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (open) {
					setIsOpen(true);
					return;
				}
				void acknowledge();
			}}>
			<DialogContent
				className="max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-3xl border border-red-100 bg-white p-0 shadow-[0_24px_80px_rgba(120,20,20,0.22)] duration-300 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:zoom-in-90 sm:max-w-[560px]"
				showCloseButton={false}>
				<style>{`
					@keyframes regularization-confetti-fall {
						0% { opacity: 0; transform: translate3d(0, -28px, 0) rotate(0deg); }
						12% { opacity: 1; }
						100% { opacity: 0; transform: translate3d(18px, 220px, 0) rotate(320deg); }
					}
					@keyframes regularization-pulse {
						0%, 100% { transform: scale(1); opacity: 0.95; }
						50% { transform: scale(1.06); opacity: 1; }
					}
					@keyframes regularization-card-enter {
						0% { opacity: 0; transform: translateY(18px) scale(0.96); }
						100% { opacity: 1; transform: translateY(0) scale(1); }
					}
				`}</style>
				<div className="relative isolate overflow-hidden bg-[#fff8f2] px-6 pt-7 pb-6 text-center sm:px-8">
					<div className="pointer-events-none absolute inset-0 overflow-hidden">
						{confettiPieces.map((piece) => (
							<span
								key={piece.id}
								className="absolute top-0 h-3 w-1.5 rounded-full"
								style={{
									left: piece.left,
									backgroundColor: piece.color,
									animation: `regularization-confetti-fall ${piece.duration} ease-out ${piece.delay} infinite`,
									transform: `rotate(${piece.rotate})`,
								}}
							/>
						))}
					</div>

					<div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#c0000b] shadow-[0_16px_36px_rgba(192,0,11,0.18)]">
						<PartyPopper className="h-8 w-8" aria-hidden="true" />
						<Sparkles
							className="absolute -right-1 -top-1 h-5 w-5 text-[#ff8a00]"
							style={{ animation: "regularization-pulse 1.8s ease-in-out infinite" }}
							aria-hidden="true"
						/>
					</div>

					<DialogHeader className="relative text-center">
						<DialogTitle className="text-2xl font-bold leading-tight text-neutral-950 sm:text-3xl">
							Congratulations, {celebration.name}
						</DialogTitle>
						<DialogDescription className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-700">
							You are now a regular employee. Your employment record has been updated
							after the completed regularization approval.
						</DialogDescription>
					</DialogHeader>
				</div>

				<div
					className="space-y-4 px-6 pb-6 pt-5 sm:px-8"
					style={{ animation: "regularization-card-enter 360ms ease-out both" }}>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="rounded-2xl border border-neutral-200 bg-white p-4">
							<div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
								<BadgeCheck className="h-4 w-4 text-[#177245]" aria-hidden="true" />
								New status
							</div>
							<p className="mt-2 text-lg font-semibold text-neutral-950">Regular</p>
						</div>
						<div className="rounded-2xl border border-neutral-200 bg-white p-4">
							<div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
								<CalendarCheck
									className="h-4 w-4 text-[#ff8a00]"
									aria-hidden="true"
								/>
								Effective
							</div>
							<p className="mt-2 text-lg font-semibold text-neutral-950">
								{celebration.effectiveDate || "Now effective"}
							</p>
						</div>
					</div>

					<div className="rounded-2xl border border-red-100 bg-[#fff7f7] p-4 text-left">
						<div className="flex min-w-0 items-start gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#c0000b]">
								<UserRound className="h-5 w-5" aria-hidden="true" />
							</div>
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold text-neutral-950">
									{celebration.employeeCode}
									{celebration.positionTitle
										? ` · ${celebration.positionTitle}`
										: ""}
								</p>
								<p className="mt-1 text-sm text-neutral-600">
									{celebration.departmentName || "Your department"} has your
									updated employment status on record.
								</p>
							</div>
						</div>
					</div>

					<DialogFooter className="gap-2 sm:justify-center">
						<Button
							variant="outline"
							className={cn("rounded-full border-neutral-300 px-5")}
							onClick={() => void acknowledge()}>
							Close
						</Button>
						<Button
							className="rounded-full bg-[#c0000b] px-5 text-white hover:bg-[#a60009]"
							onClick={async () => {
								await acknowledge();
								navigate(`/employee/${employeeId}`);
							}}>
							View my profile
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
