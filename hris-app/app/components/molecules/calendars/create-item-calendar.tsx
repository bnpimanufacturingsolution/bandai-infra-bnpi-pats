import type React from "react";

import { useState } from "react";
import { X, Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

import { Badge } from "~/components/atoms";
import { CalendarItemType } from "~/zod/calendar-item.zod";
import { useCreateCalendarItem } from "~/lib/hooks/use-calendar-items";
import type { z } from "zod";

type CalendarItemTypeEnum = z.infer<typeof CalendarItemType>;

interface CreateItemSidebarProps {
	isOpen: boolean;
	onClose: () => void;
	year: number;
	calendarId: string;
	organizationId: string;
}

export function CreateItemSidebar({
	isOpen,
	onClose,
	year,
	calendarId,
	organizationId,
}: CreateItemSidebarProps) {
	const { mutate: createItem, isPending } = useCreateCalendarItem();

	interface FormData {
		title: string;
		description: string;
		type:
			| "EVENT"
			| "HOLIDAY"
			| "COMPANY_EVENT"
			| "MEETING"
			| "DEADLINE"
			| "REMINDER"
			| "BIRTHDAY";
		startDate: string;
		endDate: string;
		isAllDay: boolean;
		location: string;
		isVirtual: boolean;
		meetingUrl: string;
		tags: string[];
	}

	const [formData, setFormData] = useState<FormData>({
		title: "",
		description: "",
		type: "EVENT",
		startDate: "",
		endDate: "",
		isAllDay: false,
		location: "",
		isVirtual: false,
		meetingUrl: "",
		tags: [],
	});
	const [tagInput, setTagInput] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const startYear = new Date(formData.startDate).getFullYear();
		const endYear = new Date(formData.endDate).getFullYear();
		console.log("Start Year:", startYear, "End Year:", endYear, "Expected Year:", year);

		// Convert year to number for comparison
		const expectedYear = Number(year);

		if (startYear !== expectedYear || endYear !== expectedYear) {
			alert(`You can only create items for ${year}`);
			return;
		}

		// Convert form data to ISO strings for API
		const payload = {
			organizationId,
			calendarId,
			title: formData.title,
			description: formData.description,
			type: formData.type,
			startDate: new Date(formData.startDate),
			endDate: new Date(formData.endDate),
			isAllDay: formData.isAllDay,
			timezone: "Asia/Manila",
			location: formData.location,
			isVirtual: formData.isVirtual,
			meetingUrl: formData.meetingUrl || "",
			tags: formData.tags,
			status: "ACTIVE" as const,
		};

		createItem(
			{ calendarId, payload },
			{
				onSuccess: () => {
					// Reset form
					setFormData({
						title: "",
						description: "",
						type: "EVENT",
						startDate: "",
						endDate: "",
						isAllDay: false,
						location: "",
						isVirtual: false,
						meetingUrl: "",
						tags: [],
					});
					onClose();
				},
			},
		);
	};

	const addTag = () => {
		if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
			setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
			setTagInput("");
		}
	};

	const removeTag = (tag: string) => {
		setFormData({ ...formData, tags: formData.tags.filter((t: string) => t !== tag) });
	};

	const getTypeColor = (type: FormData["type"]) => {
		switch (type) {
			case "HOLIDAY":
				return "bg-rose-500 hover:bg-rose-600";
			case "EVENT":
				return "bg-blue-500 hover:bg-blue-600";
			case "COMPANY_EVENT":
				return "bg-purple-500 hover:bg-purple-600";
			case "MEETING":
				return "bg-emerald-500 hover:bg-emerald-600";
			case "DEADLINE":
				return "bg-orange-500 hover:bg-orange-600";
			case "REMINDER":
				return "bg-amber-500 hover:bg-amber-600";
			default:
				return "bg-gray-500 hover:bg-gray-600";
		}
	};

	if (!isOpen) return null;

	return (
		<>
			{/* Overlay */}
			<div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

			{/* Sidebar */}
			<div className="fixed right-0 top-0 h-full w-full md:w-[480px] bg-background border-l border-border z-50 overflow-y-auto">
				<div className="p-4 sm:p-6">
					<div className="flex items-center justify-between mb-4 sm:mb-6">
						<h2 className="text-xl sm:text-2xl font-bold text-foreground">
							Create New Item
						</h2>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 sm:h-10 sm:w-10"
							onClick={onClose}>
							<X className="w-4 h-4 sm:w-5 sm:h-5" />
						</Button>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
						{/* Type Selection */}
						<div className="space-y-2 sm:space-y-3">
							<Label className="text-sm font-medium">Item Type</Label>
							<div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
								{(
									[
										"HOLIDAY",
										"EVENT",
										"COMPANY_EVENT",
										"MEETING",
										"DEADLINE",
										"REMINDER",
									] as CalendarItemTypeEnum[]
								).map((type) => (
									<Button
										key={type}
										type="button"
										variant={formData.type === type ? "default" : "outline"}
										className={formData.type === type ? getTypeColor(type) : ""}
										onClick={() => setFormData({ ...formData, type })}>
										{type.replace("_", " ")}
									</Button>
								))}
							</div>
						</div>

						{/* Title */}
						<div className="space-y-2">
							<Label htmlFor="title">Title *</Label>
							<Input
								id="title"
								value={formData.title}
								onChange={(e) =>
									setFormData({ ...formData, title: e.target.value })
								}
								placeholder="Enter title"
								required
							/>
						</div>

						{/* Description */}
						<div className="space-y-2">
							<Label htmlFor="description">Description</Label>
							<textarea
								id="description"
								value={formData.description}
								onChange={(e) =>
									setFormData({ ...formData, description: e.target.value })
								}
								placeholder="Enter description"
								className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
							/>
						</div>

						{/* Date & Time */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
							<div className="space-y-2">
								<Label htmlFor="startDate">Start Date *</Label>
								<Input
									id="startDate"
									type="datetime-local"
									value={formData.startDate}
									onChange={(e) =>
										setFormData({ ...formData, startDate: e.target.value })
									}
									min={`${year}-01-01T00:00`}
									max={`${year}-12-31T23:59`}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="endDate">End Date *</Label>
								<Input
									id="endDate"
									type="datetime-local"
									value={formData.endDate}
									onChange={(e) =>
										setFormData({ ...formData, endDate: e.target.value })
									}
									min={`${year}-01-01T00:00`}
									max={`${year}-12-31T23:59`}
									required
								/>
							</div>
						</div>

						{/* All Day */}
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="isAllDay"
								checked={formData.isAllDay}
								onChange={(e) =>
									setFormData({ ...formData, isAllDay: e.target.checked })
								}
								className="w-4 h-4 rounded border-input"
							/>
							<Label htmlFor="isAllDay" className="cursor-pointer">
								All day event
							</Label>
						</div>

						{/* Location */}
						<div className="space-y-2">
							<Label htmlFor="location">Location</Label>
							<Input
								id="location"
								value={formData.location}
								onChange={(e) =>
									setFormData({ ...formData, location: e.target.value })
								}
								placeholder="Enter location"
							/>
						</div>

						{/* Virtual Meeting */}
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<input
									type="checkbox"
									id="isVirtual"
									checked={formData.isVirtual}
									onChange={(e) =>
										setFormData({ ...formData, isVirtual: e.target.checked })
									}
									className="w-4 h-4 rounded border-input"
								/>
								<Label htmlFor="isVirtual" className="cursor-pointer">
									Virtual meeting
								</Label>
							</div>
							{formData.isVirtual && (
								<Input
									id="meetingUrl"
									value={formData.meetingUrl}
									onChange={(e) =>
										setFormData({ ...formData, meetingUrl: e.target.value })
									}
									placeholder="Meeting URL"
								/>
							)}
						</div>

						{/* Tags */}
						<div className="space-y-2">
							<Label>Tags</Label>
							<div className="flex gap-2">
								<Input
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
									onKeyDown={(e) =>
										e.key === "Enter" && (e.preventDefault(), addTag())
									}
									placeholder="Add tag"
								/>
								<Button
									type="button"
									size="icon"
									variant="outline"
									onClick={addTag}>
									<Plus className="w-4 h-4" />
								</Button>
							</div>
							{formData.tags.length > 0 && (
								<div className="flex flex-wrap gap-2 mt-2">
									{formData.tags.map((tag: string) => (
										<Badge key={tag} variant="secondary" className="gap-1">
											<Tag className="w-3 h-3" />
											{tag}
											<button
												type="button"
												onClick={() => removeTag(tag)}
												className="ml-1 hover:text-destructive">
												<X className="w-3 h-3" />
											</button>
										</Badge>
									))}
								</div>
							)}
						</div>

						{/* Note about year restriction */}
						<Card className="p-3 bg-muted">
							<p className="text-xs text-muted-foreground">
								Note: You can only create items for the year {year}. Dates outside
								this year will be rejected.
							</p>
						</Card>

						{/* Submit */}
						<div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2 sm:pt-4">
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								className="w-full sm:w-auto">
								Cancel
							</Button>
							<Button type="submit" className="flex-1" disabled={isPending}>
								{isPending ? "Creating..." : "Create Item"}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</>
	);
}
