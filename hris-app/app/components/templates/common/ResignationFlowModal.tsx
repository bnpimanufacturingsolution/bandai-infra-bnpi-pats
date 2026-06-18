import { useState, useMemo } from "react";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import { Button } from "~/components/atoms/Button";
import { useCreateRequest } from "~/lib/hooks/useRequests";
import { toast } from "sonner";
import {
	AlertTriangle,
	ArrowLeft,
	Briefcase,
	CheckCircle2,
	ChevronRight,
	Heart,
	Home,
	GraduationCap,
	HelpCircle,
	Info,
	TrendingUp,
	Shield,
	X,
} from "lucide-react";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { format, differenceInDays } from "date-fns";
import { cn } from "~/lib/utils";

interface ResignationFlowModalProps {
	isOpen: boolean;
	onClose: () => void;
	employeeId: string;
	organizationId: string;
}

type ReasonCategory =
	| "BETTER_OPPORTUNITY"
	| "CAREER_GROWTH"
	| "RELOCATION"
	| "PERSONAL_REASONS"
	| "HEALTH_REASONS"
	| "FURTHER_EDUCATION"
	| "RETIREMENT"
	| "COMPANY_CULTURE"
	| "COMPENSATION"
	| "WORK_LIFE_BALANCE"
	| "OTHER";

interface ResignationFormData {
	reasonCategory: ReasonCategory | "";
	reasonDetails: string;
	lastWorkingDay: string;
	additionalComments: string;
}

const NOTICE_PERIOD_DAYS = 30;

export function ResignationFlowModal({
	isOpen,
	onClose,
	employeeId,
	organizationId,
}: ResignationFlowModalProps) {
	const [step, setStep] = useState(1);
	const [formData, setFormData] = useState<ResignationFormData>({
		reasonCategory: "",
		reasonDetails: "",
		lastWorkingDay: "",
		additionalComments: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const createRequestMutation = useCreateRequest();

	const handleNext = () => {
		if (step < 4) setStep(step + 1);
	};

	const handleBack = () => {
		if (step > 1) setStep(step - 1);
	};

	const updateFormData = (field: keyof ResignationFormData, value: any) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	const handleSubmit = async () => {
		if (!employeeId || !organizationId) {
			toast.error("Missing employee information");
			return;
		}

		setIsSubmitting(true);
		try {
			await createRequestMutation.mutateAsync({
				organizationId,
				requesterId: employeeId,
				type: "RESIGNATION",
				description: `Voluntary resignation - ${formData.reasonCategory.replace(/_/g, " ")}`,
				startDate: new Date().toISOString(),
				endDate: new Date(formData.lastWorkingDay).toISOString(),
				metadata: {
					reasonCategory: formData.reasonCategory,
					reasonDetails: formData.reasonDetails,
					additionalComments: formData.additionalComments,
					lastWorkingDay: formData.lastWorkingDay,
					noticePeriodDays: NOTICE_PERIOD_DAYS,
				},
			});
			toast.success("Resignation request submitted successfully");
			onClose();
			// Reset form after successful submission
			setStep(1);
			setFormData({
				reasonCategory: "",
				reasonDetails: "",
				lastWorkingDay: "",
				additionalComments: "",
			});
		} catch (error: any) {
			console.error("Error submitting resignation:", error);
			toast.error(error?.message || "Failed to submit resignation request");
		} finally {
			setIsSubmitting(false);
		}
	};

	const renderStep1 = () => (
		<div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<div className="text-center space-y-4">
				<div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
					<Shield className="w-10 h-10 text-orange-600" />
				</div>
				<h2 className="text-2xl font-bold text-gray-900">We're sorry to see you go</h2>
				<p className="text-gray-500 max-w-md mx-auto">
					Resigning is a big decision. Before you proceed, please know that we value your
					contributions. This process will guide you through the necessary steps to
					formalize your departure.
				</p>
			</div>

			<div className="bg-orange-50 border border-orange-100 rounded-xl p-5 space-y-3">
				<h3 className="font-semibold text-orange-900 flex items-center gap-2">
					<Info className="w-5 h-5" />
					Important Things to Know
				</h3>
				<ul className="space-y-2 text-sm text-orange-800 ml-1">
					<li className="flex gap-2">
						<div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
						<span>
							This action initiates a resignation request that requires approval from
							your manager and HR.
						</span>
					</li>
					<li className="flex gap-2">
						<div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
						<span>
							You will have a chance to review your request before final submission.
						</span>
					</li>
					<li className="flex gap-2">
						<div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
						<span>
							Your exit process will include a handover period and exit clearance.
						</span>
					</li>
				</ul>
			</div>

			<div className="flex justify-end pt-4">
				<Button
					onClick={handleNext}
					className="bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto">
					I understand, continue <ChevronRight className="w-4 h-4 ml-2" />
				</Button>
			</div>
		</div>
	);

	const reasons: { id: ReasonCategory; label: string; icon: any }[] = [
		{ id: "BETTER_OPPORTUNITY", label: "Better Opportunity", icon: TrendingUp },
		{ id: "CAREER_GROWTH", label: "Career Growth", icon: Briefcase },
		{ id: "RELOCATION", label: "Relocation", icon: Home },
		{ id: "FURTHER_EDUCATION", label: "Further Education", icon: GraduationCap },
		{ id: "PERSONAL_REASONS", label: "Personal Reasons", icon: Heart },
		{ id: "OTHER", label: "Other Reasons", icon: HelpCircle },
	];

	const renderStep2 = () => (
		<div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
			<div>
				<h2 className="text-xl font-bold text-gray-900">Why are you leaving?</h2>
				<p className="text-gray-500 text-sm mt-1">
					Your feedback helps us improve our workplace culture and employee experience.
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{reasons.map((reason) => {
					const Icon = reason.icon;
					const isSelected = formData.reasonCategory === reason.id;
					return (
						<button
							key={reason.id}
							onClick={() => updateFormData("reasonCategory", reason.id)}
							className={cn(
								"flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:bg-orange-50",
								isSelected
									? "border-orange-500 bg-orange-50 ring-1 ring-orange-500"
									: "border-gray-200 bg-white hover:border-orange-200",
							)}>
							<div
								className={cn(
									"w-10 h-10 rounded-full flex items-center justify-center transition-colors",
									isSelected
										? "bg-orange-100 text-orange-600"
										: "bg-gray-100 text-gray-500",
								)}>
								<Icon className="w-5 h-5" />
							</div>
							<span
								className={cn(
									"font-medium",
									isSelected ? "text-orange-900" : "text-gray-700",
								)}>
								{reason.label}
							</span>
						</button>
					);
				})}
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium text-gray-700">
					Can you tell us more? (Required)
				</label>
				<textarea
					value={formData.reasonDetails}
					onChange={(e) => updateFormData("reasonDetails", e.target.value)}
					placeholder="Please share more details about your decision..."
					className="w-full min-h-[100px] p-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm resize-none"
				/>
			</div>

			<div className="flex justify-between pt-4">
				<Button variant="ghost" onClick={handleBack}>
					Back
				</Button>
				<Button
					onClick={handleNext}
					disabled={!formData.reasonCategory || !formData.reasonDetails}
					className="bg-orange-600 hover:bg-orange-700 text-white">
					Next Step <ChevronRight className="w-4 h-4 ml-2" />
				</Button>
			</div>
		</div>
	);

	const renderStep3 = () => {
		const today = new Date();
		const selectedDate = formData.lastWorkingDay ? new Date(formData.lastWorkingDay) : null;
		const daysNotice = selectedDate ? differenceInDays(selectedDate, today) : 0;
		const isShortNotice = daysNotice < NOTICE_PERIOD_DAYS;

		return (
			<div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
				<div>
					<h2 className="text-xl font-bold text-gray-900">When is your last day?</h2>
					<p className="text-gray-500 text-sm mt-1">
						Please select your proposed last working day.
					</p>
				</div>

				<div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-blue-800 text-sm">
					<Info className="w-5 h-5 shrink-0 text-blue-600" />
					<div>
						<p className="font-medium mb-1">Notice Period Policy</p>
						<p>
							Your contract requires a standard notice period of{" "}
							<span className="font-bold">{NOTICE_PERIOD_DAYS} days</span>.
						</p>
					</div>
				</div>

				<div className="space-y-2">
					<label className="text-sm font-medium text-gray-700">Last Working Day</label>
					<CalendarDatePicker
						value={formData.lastWorkingDay}
						onChange={(date) => updateFormData("lastWorkingDay", date)}
						placeholder="Select date"
						className="w-full"
						minDate={today}
					/>
				</div>

				{formData.lastWorkingDay && isShortNotice && (
					<div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3 text-amber-800 text-sm">
						<AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
						<div>
							<p className="font-medium mb-1">Short Notice Period</p>
							<p>
								You have selected a date that is less than the required{" "}
								{NOTICE_PERIOD_DAYS} days notice. This may be subject to approval or
								policy implications.
							</p>
						</div>
					</div>
				)}

				<div className="space-y-2">
					<label className="text-sm font-medium text-gray-700">
						Additional Comments{" "}
						<span className="text-gray-400 font-normal">(Optional)</span>
					</label>
					<textarea
						value={formData.additionalComments}
						onChange={(e) => updateFormData("additionalComments", e.target.value)}
						placeholder="Any other details regarding your departure date or handover..."
						className="w-full min-h-[80px] p-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm resize-none"
					/>
				</div>

				<div className="flex justify-between pt-4">
					<Button variant="ghost" onClick={handleBack}>
						Back
					</Button>
					<Button
						onClick={handleNext}
						disabled={!formData.lastWorkingDay}
						className="bg-orange-600 hover:bg-orange-700 text-white">
						Review Request <ChevronRight className="w-4 h-4 ml-2" />
					</Button>
				</div>
			</div>
		);
	};

	const renderStep4 = () => (
		<div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
			<div className="text-center pb-2">
				<div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
					<CheckCircle2 className="w-8 h-8 text-green-600" />
				</div>
				<h2 className="text-xl font-bold text-gray-900">Review & Submit</h2>
				<p className="text-gray-500 text-sm mt-1">
					Please review your resignation details before final submission.
				</p>
			</div>

			<div className="bg-gray-50 rounded-xl p-6 space-y-4 border border-gray-100">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
							Reason Category
						</p>
						<p className="font-medium text-gray-900">
							{formData.reasonCategory.replace(/_/g, " ")}
						</p>
					</div>
					<div>
						<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
							Last Working Day
						</p>
						<p className="font-medium text-gray-900">
							{formData.lastWorkingDay
								? format(new Date(formData.lastWorkingDay), "MMMM d, yyyy")
								: "-"}
						</p>
					</div>
				</div>

				<div className="border-t border-gray-200 pt-4">
					<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
						Reason Details
					</p>
					<p className="text-sm text-gray-700 bg-white p-3 rounded border border-gray-100">
						{formData.reasonDetails}
					</p>
				</div>

				{formData.additionalComments && (
					<div className="border-t border-gray-200 pt-4">
						<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
							Additional Comments
						</p>
						<p className="text-sm text-gray-700">{formData.additionalComments}</p>
					</div>
				)}
			</div>

			<div className="flex justify-between pt-4 gap-3">
				<Button variant="ghost" onClick={handleBack} disabled={isSubmitting}>
					Back
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={isSubmitting}
					className="bg-red-600 hover:bg-red-700 text-white flex-1 sm:flex-none">
					{isSubmitting ? "Submitting..." : "Submit Resignation"}
				</Button>
			</div>
		</div>
	);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !isSubmitting && !open && onClose()}>
			<DialogContent className="max-w-xl p-0 overflow-hidden gap-0" showCloseButton={false}>
				<div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
					<h2 className="font-semibold text-gray-700">Resignation Request</h2>
					<div className="flex items-center gap-4">
						<div className="flex gap-1">
							{[1, 2, 3, 4].map((i) => (
								<div
									key={i}
									className={cn(
										"h-1.5 w-8 rounded-full transition-colors",
										step >= i ? "bg-orange-500" : "bg-gray-200",
									)}
								/>
							))}
						</div>
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-gray-600 transition-colors p-1">
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>
				<div className="p-6 sm:p-8">
					{step === 1 && renderStep1()}
					{step === 2 && renderStep2()}
					{step === 3 && renderStep3()}
					{step === 4 && renderStep4()}
				</div>
			</DialogContent>
		</Dialog>
	);
}
