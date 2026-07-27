import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { Card, CardContent } from "~/components/atoms/Card";

type SectionStatus = "not-started" | "in-progress" | "completed";

interface WorkScheduleFormProps {
	form: any;
	onComplete: () => void;
	status: SectionStatus;
}

const scheduleTypes = [
	{ value: "full-time", label: "Full Time" },
	{ value: "part-time", label: "Part Time" },
	{ value: "contract", label: "Contract" },
	{ value: "flexible", label: "Flexible Hours" },
];

const weekDays = [
	{ value: "monday", label: "Monday" },
	{ value: "tuesday", label: "Tuesday" },
	{ value: "wednesday", label: "Wednesday" },
	{ value: "thursday", label: "Thursday" },
	{ value: "friday", label: "Friday" },
	{ value: "saturday", label: "Saturday" },
	{ value: "sunday", label: "Sunday" },
];

export function WorkScheduleForm({ form, onComplete, status }: WorkScheduleFormProps) {
	const {
		register,
		formState: { errors },
		setValue,
		trigger,
		watch,
	} = form;

	const watchedWorkDays = watch("workSchedule.workDays") || [];
	const watchedStartTime = watch("workSchedule.startTime");
	const watchedEndTime = watch("workSchedule.endTime");
	const watchedScheduleType = watch("workSchedule.scheduleType");

	const isCompleted = status === "completed";

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const isValid = await trigger("workSchedule");
		if (isValid) {
			onComplete();
		}
	};

	const handleDayToggle = (day: string) => {
		const newWorkDays = watchedWorkDays.includes(day)
			? watchedWorkDays.filter((d: string) => d !== day)
			: [...watchedWorkDays, day];
		setValue("workSchedule.workDays", newWorkDays);
	};

	return (
		<Card className="border border-gray-200 bg-white">
			<CardContent className="p-6">
				<div className="space-y-6">
					<div>
						<h2 className="text-xl font-semibold text-gray-900">Work Schedule</h2>
						<p className="text-sm text-gray-600 mt-1">Set working hours and days</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-6">
						<div>
							<label
								htmlFor="workSchedule.scheduleType"
								className="block text-sm font-medium text-gray-700 mb-2">
								Schedule Type
							</label>
							<select
								id="workSchedule.scheduleType"
								className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
									errors.workSchedule?.scheduleType
										? "border-red-300 focus:border-red-500"
										: "border-gray-300"
								} ${isCompleted ? "bg-gray-100" : ""}`}
								disabled={isCompleted}
								{...register("workSchedule.scheduleType", {
									required: "Schedule type is required",
								})}>
								<option value="">Select Schedule Type</option>
								{scheduleTypes.map((type) => (
									<option key={type.value} value={type.value}>
										{type.label}
									</option>
								))}
							</select>
							{errors.workSchedule?.scheduleType && (
								<p className="mt-1 text-sm text-red-600">
									{errors.workSchedule.scheduleType.message}
								</p>
							)}
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Work Days
							</label>
							<input
								type="hidden"
								{...register("workSchedule.workDays", {
									validate: (value: string[]) =>
										(value && value.length > 0) ||
										"At least one work day must be selected",
								})}
							/>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
								{weekDays.map((day) => (
									<label
										key={day.value}
										className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
											watchedWorkDays.includes(day.value)
												? "bg-orange-50 border-orange-200 text-orange-700"
												: "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
										} ${isCompleted ? "cursor-not-allowed opacity-50" : ""}`}>
										<input
											type="checkbox"
											checked={watchedWorkDays.includes(day.value)}
											onChange={() => handleDayToggle(day.value)}
											className="sr-only"
											disabled={isCompleted}
										/>
										<span className="text-sm font-medium">{day.label}</span>
									</label>
								))}
							</div>
							{errors.workSchedule?.workDays && (
								<p className="mt-1 text-sm text-red-600">
									{errors.workSchedule.workDays.message}
								</p>
							)}
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label
									htmlFor="workSchedule.startTime"
									className="block text-sm font-medium text-gray-700 mb-1">
									Start Time
								</label>
								<Input
									id="workSchedule.startTime"
									type="time"
									className={
										errors.workSchedule?.startTime
											? "border-red-300 focus:border-red-500"
											: ""
									}
									disabled={isCompleted}
									{...register("workSchedule.startTime", {
										required: "Start time is required",
									})}
								/>
								{errors.workSchedule?.startTime && (
									<p className="mt-1 text-sm text-red-600">
										{errors.workSchedule.startTime.message}
									</p>
								)}
							</div>

							<div>
								<label
									htmlFor="workSchedule.endTime"
									className="block text-sm font-medium text-gray-700 mb-1">
									End Time
								</label>
								<Input
									id="workSchedule.endTime"
									type="time"
									className={
										errors.workSchedule?.endTime
											? "border-red-300 focus:border-red-500"
											: ""
									}
									disabled={isCompleted}
									{...register("workSchedule.endTime", {
										required: "End time is required",
										validate: (value: string) => {
											if (
												watchedStartTime &&
												value &&
												value <= watchedStartTime
											) {
												return "End time must be after start time";
											}
											return true;
										},
									})}
								/>
								{errors.workSchedule?.endTime && (
									<p className="mt-1 text-sm text-red-600">
										{errors.workSchedule.endTime.message}
									</p>
								)}
							</div>
						</div>

						{watchedStartTime && watchedEndTime && (
							<div className="p-4 bg-gray-50 rounded-lg">
								<h4 className="text-sm font-medium text-gray-900 mb-2">
									Schedule Summary
								</h4>
								<div className="text-sm text-gray-600 space-y-1">
									<p>
										<span className="font-medium">Type:</span>{" "}
										{
											scheduleTypes.find(
												(t) => t.value === watchedScheduleType,
											)?.label
										}
									</p>
									<p>
										<span className="font-medium">Days:</span>{" "}
										{watchedWorkDays.length > 0
											? watchedWorkDays
													.map(
														(day: string) =>
															weekDays.find((d) => d.value === day)
																?.label,
													)
													.join(", ")
											: "None selected"}
									</p>
									<p>
										<span className="font-medium">Hours:</span>{" "}
										{watchedStartTime} - {watchedEndTime}
									</p>
								</div>
							</div>
						)}

						{!isCompleted && (
							<div className="pt-4">
								<Button
									type="submit"
									className="bg-orange-600 hover:bg-orange-700 text-white">
									Save & Continue
								</Button>
							</div>
						)}

						{isCompleted && (
							<div className="pt-4">
								<div className="flex items-center gap-2 text-green-600">
									<svg
										className="h-4 w-4"
										fill="currentColor"
										viewBox="0 0 20 20">
										<path
											fillRule="evenodd"
											d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
											clipRule="evenodd"
										/>
									</svg>
									<span className="text-sm font-medium">
										Work schedule saved successfully
									</span>
								</div>
							</div>
						)}
					</form>
				</div>
			</CardContent>
		</Card>
	);
}
