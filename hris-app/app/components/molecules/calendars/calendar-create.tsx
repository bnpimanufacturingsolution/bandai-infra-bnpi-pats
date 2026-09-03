"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";
import { useCreateCalendar } from "~/lib/hooks/use-calendar";
import type { CreateCalendar } from "~/zod/calendar.zod";
import { CreateCalendarHeader } from "./create-calendar-header";
import { CalendarDetailsForm } from "./calendar-details-form";

interface CreateCalendarModalProps {
	onClose: () => void;
	onSuccess: () => void;
}

export default function CreateCalendarModal({ onClose, onSuccess }: CreateCalendarModalProps) {
	const [formData, setFormData] = useState({
		name: "",
		year: 2025,
		type: "COMPANY" as "COMPANY" | "DEPARTMENT" | "REGIONAL",
		isActive: true,
		organizationId: "default-org", // TODO: Get from auth context
	});

	const createCalendarMutation = useCreateCalendar();

	const handleInputChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
	) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleTypeSelect = (type: string) => {
		setFormData((prev) => ({
			...prev,
			type: type.toUpperCase() as "COMPANY" | "DEPARTMENT" | "REGIONAL",
		}));
	};

	const handleSubmit = async () => {
		try {
			const payload: CreateCalendar = {
				organizationId: formData.organizationId,
				name: formData.name,
				type: formData.type,
				year: formData.year,
				isActive: formData.isActive,
			};

			console.log("Creating Calendar with payload: ", payload);

			// await createCalendarMutation.mutateAsync(payload);
			onSuccess();
		} catch (error) {
			console.error("Failed to create calendar:", error);
		}
	};

	return (
		<div className="h-full pt-8 pb-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-4xl mx-auto">
				<CreateCalendarHeader currentStep={1} totalSteps={1} onClose={onClose} />

				<Card className="p-8 border border-border bg-background shadow-sm">
					<CalendarDetailsForm
						formData={formData}
						onInputChange={handleInputChange}
						onTypeSelect={handleTypeSelect}
					/>

					<div className="flex gap-3 mt-8 pt-6 border-t border-border">
						<Button variant="outline" onClick={onClose} className="px-6">
							Cancel
						</Button>
						<Button
							onClick={handleSubmit}
							disabled={createCalendarMutation.isPending || !formData.name}
							className="ml-auto px-8 bg-red-500 hover:bg-red-600 text-white gap-2">
							<Check className="w-4 h-4" />
							{createCalendarMutation.isPending ? "Creating..." : "Create Calendar"}
						</Button>
					</div>
				</Card>
			</div>
		</div>
	);
}
