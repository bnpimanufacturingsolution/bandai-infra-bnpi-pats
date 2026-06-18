import { useEffect, useMemo, useRef } from "react";
import { useFieldArray, type UseFormReturn, Controller } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { FormData } from "~/types/employee-form.types";
import { Plus, X } from "lucide-react";
import benefitTypesService from "~/services/benefit-types.service";
import { useEmployeeBenefits } from "~/lib/hooks/useEmployeeBenefits";
import { BenefitTypeCombobox } from "~/components/molecules/hr-public/benefit-type-combobox";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useLeaveTypes } from "~/lib/hooks/useLeaveTypes";
import { usePayrollPeriods } from "~/lib/hooks/usePayrollPeriods";

interface BenefitsLeaveFormProps {
	form: UseFormReturn<FormData>;
	employeeId?: string;
	organizationId?: string;
}

export function BenefitsLeaveForm({ form, employeeId, organizationId }: BenefitsLeaveFormProps) {
	const { register, control, setValue, watch } = form;
	const [searchParams] = useSearchParams();
	const focusedBenefitId = searchParams.get("adjustmentId") || "";
	const focusedPayrollPeriodId = searchParams.get("payrollPeriodId") || "";
	const adjustmentSource = searchParams.get("adjustment") || "";
	const fromRunPayroll = searchParams.get("from") === "run-payroll";
	const benefitRowRefs = useRef<Record<number, HTMLDivElement | null>>({});

	// Fetch benefit types
	const { data: benefitTypesData, isLoading: isLoadingBenefitTypes } = useQuery({
		queryKey: ["benefitTypes"],
		queryFn: () => benefitTypesService.getBenefitTypes(),
	});

	const benefitTypes = benefitTypesData?.benefitTypes || [];
	const { data: leaveTypesData } = useLeaveTypes({ limit: 200, document: true, pagination: false });
	const leaveTypes = leaveTypesData?.leaveTypes || leaveTypesData?.leavetypes || [];
	const { data: payrollPeriodsData } = usePayrollPeriods({ page: 1, limit: 200 }, true);
	const payrollPeriods =
		(payrollPeriodsData as any)?.payrollPeriods ||
		payrollPeriodsData?.data?.payrollPeriods ||
		[];
	const payrollPeriodOptions = useMemo<
		Array<{ id: string; label: string; startDate: string; endDate: string }>
	>(
		() =>
			payrollPeriods.map((period: any) => ({
				id: String(period.id),
				label: period.code ? `${period.name} (${period.code})` : String(period.name || period.id),
				startDate: period.startDate ? String(period.startDate).slice(0, 10) : "",
				endDate: period.endDate ? String(period.endDate).slice(0, 10) : "",
			})),
		[payrollPeriods],
	);
	const watchedLeaveBalances = watch("employee.leaveBalances") || [];
	const watchedBenefits = watch("employee.employeeBenefits") || [];
	const leaveTypeOptions = useMemo(() => {
		const options = new Map<string, { code: string; label: string }>();
		for (const leaveType of leaveTypes as any[]) {
			const code = String(leaveType?.code || leaveType?.name || "").trim();
			if (!code) continue;
			options.set(code, {
				code,
				label: leaveType?.name ? `${leaveType.name} (${code})` : code,
			});
		}
		for (const balance of watchedLeaveBalances as any[]) {
			const code = String(balance?.leaveType || "").trim();
			if (code && !options.has(code)) options.set(code, { code, label: code });
		}
		return Array.from(options.values());
	}, [leaveTypes, watchedLeaveBalances]);

	// Fetch employee benefits using the specific hook as requested
	const { data: employeeBenefitsData } = useEmployeeBenefits(
		employeeId ? { filter: `employeeId:${employeeId}`, limit: 100 } : undefined,
	);

	const { fields, append, remove } = useFieldArray({
		control,
		name: "employee.leaveBalances",
	});

	const {
		fields: benefitFields,
		append: appendBenefit,
		remove: removeBenefit,
		replace: replaceBenefits,
	} = useFieldArray({
		control,
		name: "employee.employeeBenefits",
	});

	// Sync fetched benefits to form state (only if we have data and it's not already populated or we want to force refresh)
	useEffect(() => {
		if (employeeBenefitsData?.employeeBenefits && employeeId) {
			const formattedBenefits = employeeBenefitsData.employeeBenefits.map((eb) => ({
				id: eb.id,
				organizationId: eb.organizationId || organizationId || "",
				employeeId: eb.employeeId || employeeId || "",
				benefitTypeId: eb.benefitTypeId || eb.benefitType?.id || "",
				payrollPeriodId: eb.payrollPeriodId || eb.payrollPeriod?.id || "",
				name: eb.name,
				description: eb.description || "",
				amount: eb.amount,
				startDate: eb.startDate ? new Date(eb.startDate).toISOString().split("T")[0] : "",
				endDate: eb.endDate ? new Date(eb.endDate).toISOString().split("T")[0] : "",
				isActive: eb.isActive,
			}));
			// We use replace to ensure the form reflects the dedicated hook's data
			// Check if we should replace (simple check: lengths different or empty)
			if (benefitFields.length === 0 && formattedBenefits.length > 0) {
				replaceBenefits(formattedBenefits);
			}
		}
	}, [employeeBenefitsData, employeeId, organizationId, replaceBenefits]); // Removed benefitFields from dep to avoid loop, though logical check handles it

	const hasPopulatedRef = useRef(false);

	const benefitTypeById = useMemo(() => {
		const map = new Map<string, any>();
		for (const benefitType of benefitTypes as any[]) {
			if (benefitType?.id) map.set(String(benefitType.id), benefitType);
		}
		return map;
	}, [benefitTypes]);
	const focusedBenefitIndex = useMemo(() => {
		if (!focusedBenefitId) return -1;
		return (watchedBenefits as any[]).findIndex(
			(benefit) => String(benefit?.id || "") === String(focusedBenefitId),
		);
	}, [focusedBenefitId, watchedBenefits]);
	const periodBenefitRows = useMemo(() => {
		if (!focusedPayrollPeriodId) return [];
		return (watchedBenefits as any[]).filter(
			(benefit) => String(benefit?.payrollPeriodId || "") === String(focusedPayrollPeriodId),
		);
	}, [focusedPayrollPeriodId, watchedBenefits]);
	const periodBenefitStats = useMemo(
		() =>
			periodBenefitRows.reduce(
				(summary, benefit) => {
					const amount = Number(benefit?.amount || 0);
					const benefitType = benefitTypeById.get(String(benefit?.benefitTypeId || ""));
					if (benefitType?.payrollDirection === "DEDUCTION") {
						summary.deductionAmount += amount;
						summary.deductionCount += 1;
					} else {
						summary.compensationAmount += amount;
						summary.compensationCount += 1;
					}
					summary.totalAmount += amount;
					summary.count += 1;
					return summary;
				},
				{
					count: 0,
					totalAmount: 0,
					compensationAmount: 0,
					compensationCount: 0,
					deductionAmount: 0,
					deductionCount: 0,
				},
			),
		[benefitTypeById, periodBenefitRows],
	);

	useEffect(() => {
		if (focusedBenefitIndex < 0) return;
		const row = benefitRowRefs.current[focusedBenefitIndex];
		if (!row) return;
		row.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [focusedBenefitIndex]);

	// Remove useRef and handle default population based strictly on field length and employeeId on mount
	useEffect(() => {
		// Only run logic if we're creating a new employee and benefit types are loaded
		if (!employeeId && benefitTypes && benefitTypes.length > 0 && !hasPopulatedRef.current) {
			const defaultBenefits = benefitTypes.filter((bt: any) => bt.isDefault);

			if (defaultBenefits.length > 0) {
				const currentBenefitTypeIds = new Set(
					benefitFields.map((field) => field.benefitTypeId),
				);
				const missingDefaults = defaultBenefits.filter(
					(bt) => !currentBenefitTypeIds.has(bt.id),
				);

				if (missingDefaults.length > 0) {
				const defaultBenefsToForm = missingDefaults.map((bt: any) => ({
					organizationId: organizationId || "",
					employeeId: "",
					benefitTypeId: bt.id,
					payrollPeriodId: "",
					name: bt.name,
					description: "",
					amount: bt.fixedAmount || 0,
					startDate: new Date().toISOString().split("T")[0],
					endDate: "",
					isActive: true,
					}));

					// If fields exist, append them; otherwise replace
					if (benefitFields.length > 0) {
						defaultBenefsToForm.forEach((benef) => appendBenefit(benef));
					} else {
						replaceBenefits(defaultBenefsToForm);
					}
				}
			}

			hasPopulatedRef.current = true;
		}
		// We intentionally do not include `benefitFields` in the dependency array to prevent infinite re-renders or losing user data when stepping forward and back.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [employeeId, benefitTypes, replaceBenefits, appendBenefit, organizationId]);

	const addLeaveBalance = () => {
		const currentYear = new Date().getFullYear();
		append({
			leaveType: "PERSONAL",
			totalEntitled: 10,
			periodStart: `${currentYear}-01-01`,
			periodEnd: `${currentYear}-12-31`,
		});
	};

	const addBenefit = () => {
		const linkedPayrollPeriod = payrollPeriodOptions.find(
			(period) => String(period.id) === String(focusedPayrollPeriodId),
		);
		appendBenefit({
			organizationId: organizationId || "",
			employeeId: employeeId || "",
			benefitTypeId: "",
			payrollPeriodId: focusedPayrollPeriodId || "",
			name: "",
			description: "",
			amount: 0,
			startDate: linkedPayrollPeriod?.startDate || new Date().toISOString().split("T")[0],
			endDate: linkedPayrollPeriod?.endDate || "",
			isActive: true,
		});
	};

	const handleBenefitTypeChange = (index: number, typeId: string, benefitType?: any) => {
		setValue(`employee.employeeBenefits.${index}.benefitTypeId`, typeId);
		if (benefitType) {
			setValue(`employee.employeeBenefits.${index}.name`, benefitType.name || "");
			setValue(`employee.employeeBenefits.${index}.description`, "");
			setValue(`employee.employeeBenefits.${index}.amount`, benefitType.fixedAmount || 0);
		}
	};

	const handlePayrollPeriodChange = (index: number, periodId: string) => {
		const normalizedPeriodId = periodId === "__none__" ? "" : periodId;
		setValue(`employee.employeeBenefits.${index}.payrollPeriodId`, normalizedPeriodId);
		const payrollPeriod = payrollPeriodOptions.find((period) => period.id === normalizedPeriodId);
		if (!payrollPeriod) return;
		if (payrollPeriod.startDate) {
			setValue(`employee.employeeBenefits.${index}.startDate`, payrollPeriod.startDate);
		}
		if (payrollPeriod.endDate) {
			setValue(`employee.employeeBenefits.${index}.endDate`, payrollPeriod.endDate);
		}
	};

	const getPayrollPeriodLabel = (periodId?: string) => {
		if (!periodId) return "Date range only";
		return (
			payrollPeriodOptions.find((period) => String(period.id) === String(periodId))?.label ||
			"Date range only"
		);
	};
	const formatAmount = (value: number) =>
		new Intl.NumberFormat("en-PH", {
			style: "currency",
			currency: "PHP",
			maximumFractionDigits: 2,
		}).format(Number(value || 0));

	return (
		<div className="space-y-8">
			{/* Leave Entitlements Section */}
			<div className="space-y-4">
				<div>
					<h2 className="text-xl font-bold tracking-tight text-foreground">
						Leave Entitlements
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Configure annual leave balances
					</p>
				</div>

				<div className="space-y-3">
					{fields.map((field, index) => (
						<div
							key={field.id}
							className="grid grid-cols-12 gap-3 p-3 bg-gray-50 rounded-md border border-gray-200">
							<div
								className="col-span-3"
								data-field-path={`employee.leaveBalances.${index}.leaveType`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Leave Type
								</span>
								<Controller
									control={control}
									name={`employee.leaveBalances.${index}.leaveType` as const}
									render={({ field }) => (
										<Select value={field.value || ""} onValueChange={field.onChange}>
											<SelectTrigger className="h-10 bg-white text-sm">
												<SelectValue placeholder="Select leave type" />
											</SelectTrigger>
											<SelectContent>
												{leaveTypeOptions.map((option) => (
													<SelectItem key={option.code} value={option.code}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
								/>
							</div>

							<div
								className="col-span-2"
								data-field-path={`employee.leaveBalances.${index}.totalEntitled`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Days
								</span>
								<input
									type="number"
									className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
									{...register(
										`employee.leaveBalances.${index}.totalEntitled` as const,
										{
											valueAsNumber: true,
										},
									)}
								/>
							</div>

							<div
								className="col-span-3"
								data-field-path={`employee.leaveBalances.${index}.periodStart`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Period Start
								</span>
								<Controller
									control={control}
									name={`employee.leaveBalances.${index}.periodStart` as const}
									render={({ field }) => (
										<CalendarDatePicker
											value={field.value || ""}
											onChange={field.onChange}
											className="h-8 py-1.5 text-sm"
										/>
									)}
								/>
							</div>

							<div
								className="col-span-3"
								data-field-path={`employee.leaveBalances.${index}.periodEnd`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Period End
								</span>
								<Controller
									control={control}
									name={`employee.leaveBalances.${index}.periodEnd` as const}
									render={({ field }) => (
										<CalendarDatePicker
											value={field.value || ""}
											onChange={field.onChange}
											className="h-8 py-1.5 text-sm"
										/>
									)}
								/>
							</div>

							<div className="col-span-1 flex items-end">
								<button
									type="button"
									onClick={() => remove(index)}
									className="w-full h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
									<X className="h-4 w-4" />
								</button>
							</div>
						</div>
					))}

					<button
						type="button"
						onClick={addLeaveBalance}
						className="w-full py-2 px-3 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2">
						<Plus className="h-4 w-4" />
						Add Leave Type
					</button>
				</div>
			</div>

			<hr className="border-gray-200" />

			{/* Benefit Types Section */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-bold tracking-tight text-foreground">
							Benefit Types
						</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Assign benefits to this employee
						</p>
					</div>
					<a
						href="/hr/benefit-types"
						target="_blank"
						className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
						Manage Benefit Types
					</a>
				</div>

				{fromRunPayroll && focusedPayrollPeriodId ? (
					<div className="grid gap-2 rounded-md border border-orange-100 bg-orange-50/60 p-2.5 sm:grid-cols-4">
						<div className="min-w-0">
							<p className="truncate text-[11px] text-orange-700">Run Payroll Period</p>
							<p className="mt-0.5 truncate text-xs font-semibold text-orange-950">
								{getPayrollPeriodLabel(focusedPayrollPeriodId)}
							</p>
						</div>
						<div className="min-w-0">
							<p className="truncate text-[11px] text-orange-700">Period Rows</p>
							<p className="mt-0.5 truncate text-xs font-semibold text-orange-950">
								{periodBenefitStats.count}
								{adjustmentSource ? ` / ${adjustmentSource}` : ""}
							</p>
						</div>
						<div className="min-w-0">
							<p className="truncate text-[11px] text-emerald-700">Compensation</p>
							<p className="mt-0.5 truncate text-xs font-semibold text-emerald-800">
								{periodBenefitStats.compensationCount} /{" "}
								{formatAmount(periodBenefitStats.compensationAmount)}
							</p>
						</div>
						<div className="min-w-0">
							<p className="truncate text-[11px] text-red-700">Deductions</p>
							<p className="mt-0.5 truncate text-xs font-semibold text-red-800">
								{periodBenefitStats.deductionCount} /{" "}
								{formatAmount(periodBenefitStats.deductionAmount)}
							</p>
						</div>
					</div>
				) : null}

				<div className="space-y-3">
					{benefitFields.map((field, index) => (
						<div
							key={field.id}
							ref={(node) => {
								benefitRowRefs.current[index] = node;
							}}
							className={`grid grid-cols-12 gap-3 p-3 rounded-md border relative transition-colors ${
								focusedBenefitIndex === index
									? "border-orange-300 bg-orange-50 shadow-sm"
									: focusedPayrollPeriodId &&
											String((watchedBenefits as any[])?.[index]?.payrollPeriodId || "") ===
												String(focusedPayrollPeriodId)
										? "border-orange-100 bg-orange-50/40"
										: "border-gray-200 bg-gray-50"
							}`}>
							{focusedBenefitIndex === index ? (
								<div className="absolute right-3 top-3 rounded-full border border-orange-200 bg-white px-2 py-0.5 text-[11px] font-medium text-orange-700">
									Run Payroll adjustment
								</div>
							) : null}
							<div
								className="col-span-12 md:col-span-4"
								data-field-path={`employee.employeeBenefits.${index}.benefitTypeId`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Benefit Type
								</span>
								<Controller
									control={control}
									name={`employee.employeeBenefits.${index}.benefitTypeId`}
									render={({ field: controllerField }) => (
										<BenefitTypeCombobox
											benefitTypes={benefitTypes}
											value={controllerField.value || ""}
											onChange={(typeId, benefitType) => {
												handleBenefitTypeChange(index, typeId, benefitType);
											}}
											isLoading={isLoadingBenefitTypes}
											placeholder="Select benefit..."
										/>
									)}
								/>
							</div>

							<div
								className="col-span-12 md:col-span-4"
								data-field-path={`employee.employeeBenefits.${index}.payrollPeriodId`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Payroll Period
								</span>
								<Controller
									control={control}
									name={`employee.employeeBenefits.${index}.payrollPeriodId` as const}
									render={({ field }) => (
										<Select
											value={field.value || "__none__"}
											onValueChange={(value) => handlePayrollPeriodChange(index, value)}>
											<SelectTrigger className="h-10 bg-white text-sm">
												<span className="truncate">
													{getPayrollPeriodLabel(field.value)}
												</span>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="__none__">Date range only</SelectItem>
												{payrollPeriodOptions.map((period) => (
													<SelectItem key={period.id} value={period.id}>
														{period.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
								/>
							</div>

							<div
								className="col-span-12 md:col-span-3"
								data-field-path={`employee.employeeBenefits.${index}.amount`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Amount
								</span>
								<input
									type="number"
									step="0.01"
									className="h-10 w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
									{...register(
										`employee.employeeBenefits.${index}.amount` as const,
										{
											valueAsNumber: true,
										},
									)}
								/>
							</div>

							<div
								className="col-span-6 md:col-span-2"
								data-field-path={`employee.employeeBenefits.${index}.startDate`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									Start Date
								</span>
								<Controller
									control={control}
									name={`employee.employeeBenefits.${index}.startDate` as const}
									render={({ field }) => (
										<CalendarDatePicker
											value={field.value || ""}
											onChange={field.onChange}
											className="h-10 py-1.5 text-sm"
										/>
									)}
								/>
							</div>

							<div
								className="col-span-6 md:col-span-2"
								data-field-path={`employee.employeeBenefits.${index}.endDate`}>
								<span className="block text-xs font-normal text-muted-foreground/70 mb-1">
									End Date
								</span>
								<Controller
									control={control}
									name={`employee.employeeBenefits.${index}.endDate` as const}
									render={({ field }) => (
										<CalendarDatePicker
											value={field.value || ""}
											onChange={field.onChange}
											className="h-10 py-1.5 text-sm"
										/>
									)}
								/>
							</div>

							<div className="col-span-12 md:col-span-1 flex items-end">
								<button
									type="button"
									onClick={() => removeBenefit(index)}
									className="w-full h-10 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
									<X className="h-4 w-4" />
								</button>
							</div>
						</div>
					))}

					<button
						type="button"
						onClick={addBenefit}
						className="w-full py-2 px-3 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2">
						<Plus className="h-4 w-4" />
						Add Benefit
					</button>
				</div>
			</div>
		</div>
	);
}
