import { useState, useEffect } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "~/components/ui/form";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "~/components/ui/command";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { cn } from "~/lib/utils";
import { Textarea } from "~/components/ui/textarea";
import { AlertCircle, Check, ChevronsUpDown, FileText } from "lucide-react";

// Action Types
const ACTION_TYPES = [
	{ value: "REGULARIZATION", label: "Regularization" },
	{ value: "PROMOTION", label: "Promotion" },
	{ value: "TERMINATION", label: "Termination" },
] as const;

type ActionType = (typeof ACTION_TYPES)[number]["value"];

// Zod Schemas
const BaseSchema = z.object({
	actionType: z.enum(["REGULARIZATION", "PROMOTION", "TERMINATION"]),
});

const RegularizationSchema = BaseSchema.extend({
	actionType: z.literal("REGULARIZATION"),
	performanceAssessment: z.string().min(10, "Performance assessment is required"),
	attendanceConfirmation: z.literal("CONFIRMED", {
		message: "Please confirm attendance review",
	}),
	recommendation: z.string().min(10, "Recommendation statement is required"),
});

const PromotionSchema = BaseSchema.extend({
	actionType: z.literal("PROMOTION"),
	newPosition: z.string().min(2, "New position title is required"),
	justification: z.string().min(20, "Justification must be detailed (min 20 chars)"),
	effectiveDate: z.string().min(1, "Effective date is required"),
});

const TerminationSchema = BaseSchema.extend({
	actionType: z.literal("TERMINATION"),
	terminationType: z.string().min(1, "Termination type is required"),
	explanation: z.string().min(20, "Detailed explanation is required"),
	hasDocuments: z.boolean().refine((val) => val === true, {
		message: "Supporting documents are required",
	}),
});

// Union Schema
export const EligibilityRequestSchema = z.discriminatedUnion("actionType", [
	RegularizationSchema,
	PromotionSchema,
	TerminationSchema,
]);

export type EligibilityRequestFormValues = z.infer<typeof EligibilityRequestSchema>;

interface EligibilityRequestModalProps {
	isOpen: boolean;
	onClose: () => void;
	employeeName?: string;
	employeeStatus?: string;
	defaultActionType?: ActionType;
	onSubmit?: (data: EligibilityRequestFormValues) => void;
}

export function EligibilityRequestModal({
	isOpen,
	onClose,
	employeeName = "Employee",
	employeeStatus,
	defaultActionType,
	onSubmit: externalSubmit,
}: EligibilityRequestModalProps) {
	const [open, setOpen] = useState(false);
	const getInitialActionType = (actionType?: ActionType): ActionType => actionType || "REGULARIZATION";

	const getDefaultFormValues = (
		actionType?: ActionType,
	): DefaultValues<EligibilityRequestFormValues> => {
		switch (getInitialActionType(actionType)) {
			case "REGULARIZATION":
				return {
					actionType: "REGULARIZATION",
					performanceAssessment: "",
					recommendation: "",
				};
			case "PROMOTION":
				return {
					actionType: "PROMOTION",
					newPosition: "",
					justification: "",
					effectiveDate: "",
				};
			case "TERMINATION":
				return {
					actionType: "TERMINATION",
					terminationType: "",
					explanation: "",
					hasDocuments: false,
				};
		}
	};

	const form = useForm<EligibilityRequestFormValues>({
		resolver: zodResolver(EligibilityRequestSchema),
		defaultValues: getDefaultFormValues(defaultActionType),
		shouldUnregister: true,
	});

	// Reset form when modal opens or closes
	useEffect(() => {
		if (isOpen) {
			form.reset(getDefaultFormValues(defaultActionType));
		}
	}, [defaultActionType, isOpen, form]);

	// Handle action type change
	const handleActionTypeChange = (value: ActionType) => {
		form.setValue("actionType", value, {
			shouldDirty: true,
			shouldTouch: true,
			shouldValidate: false,
		});

		// Clear errors when switching types
		form.clearErrors();

		// Reset specific fields based on type if needed, but react-hook-form shouldUnregister handles most
	};

	const selectedAction = form.watch("actionType");

	const onSubmit = (data: EligibilityRequestFormValues) => {
		if (externalSubmit) {
			externalSubmit(data);
		} else {
			console.log("Eligibility Request Submitted:", data);
			alert(
				`Eligibility Request for ${employeeName} submitted successfully!\nType: ${data.actionType}`,
			);
			onClose();
		}
	};

	const isRegularizationAllowed = employeeStatus === "PROBATIONARY";
	const isDefaultActionDisabled =
		defaultActionType === "REGULARIZATION" && !isRegularizationAllowed && !!employeeStatus;

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-50 font-sans selection:bg-orange-100 selection:text-orange-900 border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)]">
				{/* Decorative Background Elements */}
				<div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 rounded-lg">
					<div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-orange-200/20 blur-[120px]" />
					<div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-red-200/20 blur-[120px]" />
				</div>

				<div className="relative z-10">
					<DialogHeader>
						<DialogTitle className="mb-2 text-xl font-semibold heading-premium flex items-center gap-2">
							<FileText className="w-5 h-5 text-primary" />
							Personnel Action Request
						</DialogTitle>
						<DialogDescription>
							Request status change for{" "}
							<span className="font-medium text-foreground">{employeeName}</span>. All
							requests require HR approval.
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
							<FormField
								control={form.control}
								name="actionType"
								render={({ field }) => (
									<FormItem className="flex flex-col">
										<FormLabel>
											Action Type <span className="text-red-500">*</span>
										</FormLabel>
										<Popover open={open} onOpenChange={setOpen}>
											<PopoverTrigger asChild>
												<FormControl>
													<Button
														variant="outline"
														disabled={!!defaultActionType}
														role="combobox"
														className={cn(
															"w-full justify-between",
															!field.value && "text-muted-foreground",
														)}>
														{field.value
															? ACTION_TYPES.find(
																	(type) =>
																		type.value === field.value,
																)?.label
															: "Select action type"}
														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent
												className="w-[var(--radix-popover-trigger-width)] p-0"
												align="start">
												<Command>
													<CommandInput placeholder="Search action type..." />
													<CommandList>
														<CommandEmpty>
															No action found.
														</CommandEmpty>
														<CommandGroup>
															{ACTION_TYPES.map((type) => {
																const isDisabled =
																	type.value ===
																		"REGULARIZATION" &&
																	!isRegularizationAllowed &&
																	!!employeeStatus;

																return (
																	<CommandItem
																		value={type.label}
																		key={type.value}
																		disabled={isDisabled}
																		onSelect={() => {
																			if (!isDisabled) {
																				handleActionTypeChange(
																					type.value,
																				);
																				setOpen(false);
																			}
																		}}
																		className={cn(
																			isDisabled &&
																				"opacity-50 cursor-not-allowed text-muted-foreground",
																		)}>
																		<Check
																			className={cn(
																				"mr-2 h-4 w-4",
																				type.value ===
																					field.value
																					? "opacity-100"
																					: "opacity-0",
																			)}
																		/>
																		{type.label}
																	</CommandItem>
																);
															})}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
										{!isRegularizationAllowed && employeeStatus && (
											<p className="text-[0.8rem] text-muted-foreground mt-1">
												* Regularization is only available for Probationary
												employees.
											</p>
										)}
										{isDefaultActionDisabled && (
											<p className="text-[0.8rem] text-red-500 mt-1">
												The preselected action is not valid for this
												employee status.
											</p>
										)}
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* REGULARIZATION FIELDS */}
							{selectedAction === "REGULARIZATION" && (
								<div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
									<FormField
										control={form.control}
										name="performanceAssessment"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Performance Assessment Summary{" "}
													<span className="text-red-500">*</span>
												</FormLabel>
												<Textarea
													placeholder="Summarize the employee's performance during probation..."
													className="min-h-[100px]"
													{...field}
													value={(field.value as string) || ""}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="recommendation"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Manager&apos;s Recommendation{" "}
													<span className="text-red-500">*</span>
												</FormLabel>
												<Input
													placeholder="e.g., Highly Recommended for Regularization"
													{...field}
													value={(field.value as string) || ""}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="attendanceConfirmation"
										render={({ field }) => (
											<FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
												<FormControl>
													<input
														type="checkbox"
														className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
														checked={field.value === "CONFIRMED"}
														onChange={(e) =>
															field.onChange(
																e.target.checked
																	? "CONFIRMED"
																	: undefined,
															)
														}
													/>
												</FormControl>
												<div className="space-y-1 leading-none">
													<FormLabel>
														Confirm Attendance Review{" "}
														<span className="text-red-500">*</span>
													</FormLabel>
													<p className="text-sm text-muted-foreground">
														I confirm that I have reviewed the
														employee&apos;s attendance record and it
														meets company standards.
													</p>
												</div>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							)}

							{/* PROMOTION FIELDS */}
							{selectedAction === "PROMOTION" && (
								<div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
									<FormField
										control={form.control}
										name="newPosition"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Proposed New Position{" "}
													<span className="text-red-500">*</span>
												</FormLabel>
												<Input
													placeholder="e.g., Senior Developer"
													{...field}
													value={(field.value as string) || ""}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="effectiveDate"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Effective Date{" "}
													<span className="text-red-500">*</span>
												</FormLabel>
												<CalendarDatePicker
													value={(field.value as string) || ""}
													onChange={field.onChange}
													placeholder="Pick effective date"
												/>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="justification"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Promotion Justification{" "}
													<span className="text-red-500">*</span>
												</FormLabel>
												<Textarea
													placeholder="Detail the achievements and reasons for this promotion..."
													className="min-h-[120px]"
													{...field}
													value={(field.value as string) || ""}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							)}

							{/* TERMINATION FIELDS */}
							{selectedAction === "TERMINATION" && (
								<div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
									<div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2 text-red-800 text-sm">
										<AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
										<p>
											<strong>Warning:</strong> All termination requests
											undergo a mandatory strict HR review process. Ensure all
											documentation is attached.
										</p>
									</div>

									<FormField
										control={form.control}
										name="terminationType"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Termination Type{" "}
													<span className="text-red-500">*</span>
												</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value as string}>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select type" />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														<SelectItem value="voluntary">
															Voluntary Resignation
														</SelectItem>
														<SelectItem value="performance">
															Performance Based
														</SelectItem>
														<SelectItem value="misconduct">
															Misconduct
														</SelectItem>
														<SelectItem value="redundancy">
															Redundancy
														</SelectItem>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="explanation"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													Detailed Explanation{" "}
													<span className="text-red-500">*</span>
												</FormLabel>
												<Textarea
													placeholder="Provide a comprehensive explanation for the termination..."
													className="min-h-[150px]"
													{...field}
													value={(field.value as string) || ""}
												/>
												<p className="text-xs text-muted-foreground">
													Please enter at least 20 characters.
												</p>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="hasDocuments"
										render={({ field }) => (
											<FormItem className="flex flex-col space-y-2 rounded-md border p-4 bg-muted/20">
												<div className="flex items-center gap-2 mb-2">
													<FileText className="w-4 h-4 text-muted-foreground" />
													<FormLabel className="mb-0">
														Supporting Documents{" "}
														<span className="text-red-500">*</span>
													</FormLabel>
												</div>

												<div className="flex items-center gap-4">
													<Button
														type="button"
														variant="outline"
														className="w-full"
														onClick={() => field.onChange(true)}>
														{field.value
															? "Documents Attached (Mock)"
															: "Upload Documents"}
													</Button>
												</div>
												{field.value && (
													<p className="text-xs text-green-600">
														✓ 1 file selected
													</p>
												)}

												<p className="text-xs text-muted-foreground">
													Upload disciplinary records, resignation
													letters, or performance reviews.
												</p>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							)}

							{/* Effective Date is captured by action-specific schemas where needed. */}

							<div className="flex justify-end gap-3 pt-4 border-t">
								<Button type="button" variant="outline" onClick={onClose}>
									Cancel
								</Button>
								<Button
									type="submit"
									className="bg-primary hover:bg-primary/90 text-white"
									disabled={!selectedAction || isDefaultActionDisabled}>
									Submit Request
								</Button>
							</div>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	);
}
