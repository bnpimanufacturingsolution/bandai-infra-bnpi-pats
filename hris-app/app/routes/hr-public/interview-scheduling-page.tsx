import { useState, useCallback, useEffect } from "react";

import type { TimeSlot, RescheduleReason } from "@/types/interview";
import { mockAvailableDates, mockInterviewDetails } from "~/data/mock-interview-data";
import { ConfirmationPanel } from "~/components/organisms/confirmation-panel";
import { AdditionalInfoForm } from "~/components/organisms/additional-info-form";
import { InterviewSummaryCard } from "~/components/organisms/interview-summary-card";
import { DateTimeSelector } from "~/components/organisms/date-time-selector";
import { PageFooter } from "~/components/organisms/page-footer";
import { PageHeader } from "~/components/organisms/page-header";

const InterviewSchedulingPage = () => {
	useEffect(() => {
		document.title = "Schedule Your Interview | Bandai HRIS";

		let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
		if (!metaDescription) {
			metaDescription = document.createElement("meta") as HTMLMetaElement;
			metaDescription.name = "description";
			document.head.appendChild(metaDescription);
		}
		metaDescription.setAttribute(
			"content",
			"Select a convenient date and time for your upcoming interview with Bandai.",
		);
	}, []);

	// Schedule Selection State
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

	// Additional Info State
	const [notes, setNotes] = useState("");
	const [accessibilityRequests, setAccessibilityRequests] = useState("");

	// Reschedule State
	const [isRescheduleMode, setIsRescheduleMode] = useState(false);
	const [rescheduleReason, setRescheduleReason] = useState<RescheduleReason | "">("");

	// Handle date selection
	const handleDateSelect = useCallback((date: string) => {
		setSelectedDate(date);
		setSelectedSlot(null); // Reset slot when date changes
	}, []);

	// Handle slot selection
	const handleSlotSelect = useCallback((slot: TimeSlot) => {
		setSelectedSlot(slot);
	}, []);

	// Handle confirmation
	const handleConfirm = useCallback(async () => {
		// Simulate API call
		await new Promise((resolve, reject) => {
			setTimeout(() => {
				// Simulate occasional failure for demo
				if (Math.random() > 0.9) {
					reject(
						new Error(
							"The selected time slot is no longer available. Please choose another slot.",
						),
					);
				} else {
					resolve(true);
				}
			}, 1500);
		});

		// In production, this would:
		// 1. Send confirmation to backend
		// 2. Trigger email and calendar invite
		// 3. Update application status
		console.log("Confirmed:", {
			date: selectedDate,
			slot: selectedSlot,
			notes,
			accessibilityRequests,
			isReschedule: isRescheduleMode,
			rescheduleReason,
		});
	}, [
		selectedDate,
		selectedSlot,
		notes,
		accessibilityRequests,
		isRescheduleMode,
		rescheduleReason,
	]);

	// Handle reschedule mode toggle
	const handleRequestReschedule = useCallback(() => {
		setIsRescheduleMode(true);
	}, []);

	const handleCancelReschedule = useCallback(() => {
		setIsRescheduleMode(false);
		setRescheduleReason("");
	}, []);

	return (
		<div className="min-h-screen bg-background">
			<main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
				<PageHeader
					title="Interview Invitation"
					subtitle="Please review the details below and select a convenient time for your interview. We're excited to meet you!"
				/>

				<div className="space-y-6">
					{/* Interview Summary */}
					<InterviewSummaryCard details={mockInterviewDetails} />

					{/* Date & Time Selection */}
					<DateTimeSelector
						availableDates={mockAvailableDates}
						selectedDate={selectedDate}
						selectedSlot={selectedSlot}
						onDateSelect={handleDateSelect}
						onSlotSelect={handleSlotSelect}
					/>

					{/* Additional Information */}
					<AdditionalInfoForm
						notes={notes}
						onNotesChange={setNotes}
						accessibilityRequests={accessibilityRequests}
						onAccessibilityChange={setAccessibilityRequests}
						showReschedule={isRescheduleMode}
						rescheduleReason={rescheduleReason}
						onRescheduleReasonChange={setRescheduleReason}
					/>

					{/* Confirmation Actions */}
					<ConfirmationPanel
						selectedDate={selectedDate}
						selectedSlot={selectedSlot}
						isRescheduleMode={isRescheduleMode}
						rescheduleReason={rescheduleReason}
						onConfirm={handleConfirm}
						onRequestReschedule={handleRequestReschedule}
						onCancelReschedule={handleCancelReschedule}
					/>
				</div>
			</main>

			<PageFooter />
		</div>
	);
};

export default InterviewSchedulingPage;
