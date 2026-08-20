import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { Save, Settings, FileText, Calculator, Clock, Loader2 } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { CalendarDatePicker } from "~/components/ui/calendar-date-picker";
import { RulesPoliciesShell } from "~/components/templates/admin/rules-policies-shell";
import { Switch } from "~/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useCalculator, useUpdateCalculator } from "~/lib/hooks/useCalculator";
import {
	usePayrollCycleConfig,
	useUpdatePayrollCycleConfig,
	useBulkGeneratePayrollPeriods,
	useBulkAdjustPayrollPeriods,
	usePayrollPeriods,
} from "~/lib/hooks/usePayrollPeriods";
import type {
	PayrollCycleRules,
	PayrollPeriod as PayrollPeriodItem,
} from "~/services/payroll-periods.service";

type SettingsTab = "cycle" | "tax-table" | "contributions" | "rates";

interface FormData {
	name: string;
	description?: string;
	type: "BASIC" | "GROSS_TO_NET" | "NET_TO_GROSS" | "THIRTEENTH_MONTH" | "CUSTOM";
	nightDiffRate?: number;
	taxRates: Record<string, any>;
	sssRates: {
		employeeRate: number;
		employerRate: number;
		minimumBase: number;
		maximumCeiling: number;
	};
	philHealthRates: {
		employeeRate: number;
		employerRate: number;
		minimumBase: number;
		maximumCeiling: number;
	};
	pagibigRates: {
		rateBelowThreshold: number;
		rateAboveThreshold: number;
		threshold: number;
		maximumCeiling: number;
	};
	rateMultipliers: {
		ordinaryDay: { work: number; ot: number; nd: number; ndot: number };
		restDayOrSpecialHoliday: { work: number; ot: number; nd: number; ndot: number };
		specialHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		regularHoliday: { work: number; ot: number; nd: number; ndot: number };
		regularHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
		doubleHoliday: { work: number; ot: number; nd: number; ndot: number };
		doubleHolidayOnRestDay: { work: number; ot: number; nd: number; ndot: number };
	};
	isActive: boolean;
}

type CycleRulesForm = {
	SEMI_MONTHLY: {
		firstStartDay: number;
		secondStartDay: number;
		secondEndDay: number | "LAST_DAY";
	};
	WEEKLY: { anchorWeekday: number };
	BIWEEKLY: { anchorWeekday: number };
	MONTHLY: { startDay: number; endDay: number | "LAST_DAY" };
	QUARTERLY: { startMonth: number };
	ANNUALLY: { startMonth: number };
};

type CycleFormState = {
	defaultPayFrequency: string;
	payDateOffsetDays: number;
	businessDayRule: string;
	includeHolidaysInBusinessDayCheck: boolean;
	cycleRules: CycleRulesForm;
};

interface PayrollSettingsModuleProps {
	mode?: "settings" | "setup";
	showHeader?: boolean;
	initialTab?: SettingsTab;
}

const PAY_FREQUENCIES = [
	"DAILY",
	"WEEKLY",
	"BIWEEKLY",
	"SEMI_MONTHLY",
	"MONTHLY",
	"QUARTERLY",
	"ANNUALLY",
] as const;

// BNPI default: 11-25 / 26-10 (matches Bandai semi-monthly register cutoffs).
const DEFAULT_CYCLE_RULES: CycleRulesForm = {
	SEMI_MONTHLY: {
		firstStartDay: 11,
		secondStartDay: 26,
		secondEndDay: 10,
	},
	WEEKLY: { anchorWeekday: 1 },
	BIWEEKLY: { anchorWeekday: 1 },
	MONTHLY: { startDay: 1, endDay: "LAST_DAY" },
	QUARTERLY: { startMonth: 1 },
	ANNUALLY: { startMonth: 1 },
};

const mergeCycleRules = (rules?: PayrollCycleRules): CycleRulesForm => ({
	...DEFAULT_CYCLE_RULES,
	...(rules || {}),
	SEMI_MONTHLY: {
		firstStartDay: Math.min(
			Math.max(
				Number(
					rules?.SEMI_MONTHLY?.firstStartDay ??
						DEFAULT_CYCLE_RULES.SEMI_MONTHLY.firstStartDay,
				) || 1,
				1,
			),
			28,
		),
		secondStartDay: Math.min(
			Math.max(
				Number(
					rules?.SEMI_MONTHLY?.secondStartDay ??
						DEFAULT_CYCLE_RULES.SEMI_MONTHLY.secondStartDay,
				) || DEFAULT_CYCLE_RULES.SEMI_MONTHLY.secondStartDay,
				2,
			),
			31,
		),
		secondEndDay:
			(rules?.SEMI_MONTHLY?.secondEndDay ?? DEFAULT_CYCLE_RULES.SEMI_MONTHLY.secondEndDay) ===
			"LAST_DAY"
				? "LAST_DAY"
				: Math.min(
						Math.max(
							Number(
								(rules?.SEMI_MONTHLY?.secondEndDay ??
									DEFAULT_CYCLE_RULES.SEMI_MONTHLY.secondEndDay) ||
									DEFAULT_CYCLE_RULES.SEMI_MONTHLY.secondEndDay,
							) || Number(DEFAULT_CYCLE_RULES.SEMI_MONTHLY.secondEndDay),
							1,
						),
						31,
					),
	},
	WEEKLY: {
		anchorWeekday: Math.min(
			Math.max(
				Number(rules?.WEEKLY?.anchorWeekday ?? DEFAULT_CYCLE_RULES.WEEKLY.anchorWeekday) ||
					1,
				0,
			),
			6,
		),
	},
	BIWEEKLY: {
		anchorWeekday: Math.min(
			Math.max(
				Number(
					rules?.BIWEEKLY?.anchorWeekday ?? DEFAULT_CYCLE_RULES.BIWEEKLY.anchorWeekday,
				) || 1,
				0,
			),
			6,
		),
	},
	MONTHLY: {
		startDay: Math.min(
			Math.max(
				Number(rules?.MONTHLY?.startDay ?? DEFAULT_CYCLE_RULES.MONTHLY.startDay) || 1,
				1,
			),
			31,
		),
		endDay:
			(rules?.MONTHLY?.endDay ?? DEFAULT_CYCLE_RULES.MONTHLY.endDay) === "LAST_DAY"
				? "LAST_DAY"
				: Math.min(
						Math.max(
							Number(
								(rules?.MONTHLY?.endDay ?? DEFAULT_CYCLE_RULES.MONTHLY.endDay) || 1,
							) || 1,
							1,
						),
						31,
					),
	},
	QUARTERLY: {
		startMonth: Math.min(
			Math.max(
				Number(rules?.QUARTERLY?.startMonth ?? DEFAULT_CYCLE_RULES.QUARTERLY.startMonth) ||
					1,
				1,
			),
			12,
		),
	},
	ANNUALLY: {
		startMonth: Math.min(
			Math.max(
				Number(rules?.ANNUALLY?.startMonth ?? DEFAULT_CYCLE_RULES.ANNUALLY.startMonth) || 1,
				1,
			),
			12,
		),
	},
});

export function PayrollSettingsModule({
	mode = "settings",
	showHeader = true,
	initialTab = "cycle",
}: PayrollSettingsModuleProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [localActiveTab, setLocalActiveTab] = useState<SettingsTab>(initialTab);
	const requestedTab = searchParams.get("tab") as SettingsTab | null;
	const validTabs: SettingsTab[] = ["cycle", "tax-table", "contributions", "rates"];
	const activeTab =
		mode === "settings"
			? requestedTab && validTabs.includes(requestedTab)
				? requestedTab
				: "cycle"
			: localActiveTab;

	const setActiveTab = (tab: SettingsTab) => {
		if (mode === "settings") {
			setSearchParams((prev) => {
				const next = new URLSearchParams(prev);
				next.set("tab", tab);
				return next;
			});
			return;
		}
		setLocalActiveTab(tab);
	};

	// Fetch default calculator by code
	const currentYear = new Date().getFullYear();
	const defaultCalculatorCode = `CALC-DEFAULT-${currentYear}`;
	const { data: calculator, isLoading } = useCalculator(defaultCalculatorCode);
	const { mutate: updateCalculator, isPending: isUpdating } = useUpdateCalculator();
	const {
		data: payrollCycleConfig,
		isLoading: isLoadingCycleConfig,
		refetch: refetchPayrollCycleConfig,
	} = usePayrollCycleConfig();
	const { mutate: updatePayrollCycleConfig, isPending: isUpdatingCycleConfig } =
		useUpdatePayrollCycleConfig();
	const { mutate: bulkGeneratePeriods, isPending: isGeneratingPeriods } =
		useBulkGeneratePayrollPeriods();
	const { mutateAsync: bulkAdjustPeriods, isPending: isAdjustingPeriods } =
		useBulkAdjustPayrollPeriods();
	const { data: payrollPeriodsData, refetch: refetchPayrollPeriods } = usePayrollPeriods({
		page: 1,
		limit: 100,
		sort: "startDate",
		order: "asc",
	});

	const [cycleForm, setCycleForm] = useState<CycleFormState>({
		defaultPayFrequency: "SEMI_MONTHLY",
		payDateOffsetDays: 5,
		businessDayRule: "NEXT_BUSINESS_DAY",
		includeHolidaysInBusinessDayCheck: true,
		cycleRules: {
			...DEFAULT_CYCLE_RULES,
			SEMI_MONTHLY: {
				...DEFAULT_CYCLE_RULES.SEMI_MONTHLY,
			},
		},
	});
	const [generationForm, setGenerationForm] = useState({
		frequency: "SEMI_MONTHLY",
		rangeStart: `${new Date().getFullYear()}-01-01`,
		rangeEnd: `${new Date().getFullYear()}-12-31`,
		namingMode: "DEFAULT",
		customNamePrefix: "",
		dryRun: false,
	});
	const [adjustmentForm, setAdjustmentForm] = useState({
		frequency: "SEMI_MONTHLY",
		forceRetroactive: false,
		dryRun: false,
	});
	const hasEditedGenerationFrequency = useRef(false);
	const hasEditedAdjustmentFrequency = useRef(false);
	const [bulkAdjustResultMessage, setBulkAdjustResultMessage] = useState<string | null>(null);
	const [isSyncingCycleConfigForAdjust, setIsSyncingCycleConfigForAdjust] = useState(false);

	// Form for Calculator Settings
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		reset,
		formState: { isDirty },
	} = useForm<FormData>();

	// Update form when calculator data is loaded
	useEffect(() => {
		if (mode === "setup") {
			setLocalActiveTab(initialTab);
		}
	}, [initialTab, mode]);

	useEffect(() => {
		if (calculator) {
			// Provide default rateMultipliers if not present (backward compatibility)
			const defaultRateMultipliers = {
				ordinaryDay: { work: 1.0, ot: 1.25, nd: 1.1, ndot: 1.375 },
				restDayOrSpecialHoliday: { work: 1.3, ot: 1.69, nd: 1.43, ndot: 1.859 },
				specialHolidayOnRestDay: { work: 1.5, ot: 1.95, nd: 1.65, ndot: 2.145 },
				regularHoliday: { work: 2.0, ot: 2.6, nd: 2.2, ndot: 2.86 },
				regularHolidayOnRestDay: { work: 2.6, ot: 3.38, nd: 2.86, ndot: 3.718 },
				doubleHoliday: { work: 3.0, ot: 3.9, nd: 3.3, ndot: 4.29 },
				doubleHolidayOnRestDay: { work: 3.9, ot: 5.07, nd: 4.29, ndot: 5.577 },
			};

			reset({
				...calculator,
				rateMultipliers: calculator.rateMultipliers || defaultRateMultipliers,
			});
		}
	}, [calculator, reset]);

	useEffect(() => {
		if (!payrollCycleConfig) return;
		const mergedRules = mergeCycleRules(payrollCycleConfig.cycleRules);
		const selectedFrequency = payrollCycleConfig.defaultPayFrequency || "SEMI_MONTHLY";
		setCycleForm({
			defaultPayFrequency: selectedFrequency,
			payDateOffsetDays: payrollCycleConfig.payDateOffsetDays,
			businessDayRule: payrollCycleConfig.businessDayRule,
			includeHolidaysInBusinessDayCheck: payrollCycleConfig.includeHolidaysInBusinessDayCheck,
			cycleRules: {
				...mergedRules,
				SEMI_MONTHLY: mergedRules.SEMI_MONTHLY,
			},
		});
		setGenerationForm((prev) =>
			hasEditedGenerationFrequency.current ? prev : { ...prev, frequency: selectedFrequency },
		);
		setAdjustmentForm((prev) =>
			hasEditedAdjustmentFrequency.current ? prev : { ...prev, frequency: selectedFrequency },
		);
	}, [payrollCycleConfig]);

	const onSubmit = (data: FormData) => {
		if (calculator) {
			updateCalculator({
				id: calculator.id,
				payload: { ...data, code: defaultCalculatorCode } as any,
			});
		}
	};

	const handleSaveCycleSettings = () => {
		const normalizeDay = (value: number, min: number, max: number, fallback: number) =>
			Math.min(Math.max(Number(value) || fallback, min), max);
		const firstStartDay = normalizeDay(
			cycleForm.cycleRules.SEMI_MONTHLY.firstStartDay,
			1,
			28,
			1,
		);
		const secondStartDay = normalizeDay(
			cycleForm.cycleRules.SEMI_MONTHLY.secondStartDay,
			2,
			31,
			16,
		);
		const secondEndDay: number | "LAST_DAY" =
			cycleForm.cycleRules.SEMI_MONTHLY.secondEndDay === "LAST_DAY"
				? "LAST_DAY"
				: normalizeDay(Number(cycleForm.cycleRules.SEMI_MONTHLY.secondEndDay), 1, 31, 1);
		const isSemiMonthlyContinuous =
			secondStartDay > firstStartDay &&
			((secondEndDay === "LAST_DAY" && firstStartDay === 1) ||
				(typeof secondEndDay === "number" && firstStartDay === secondEndDay + 1));
		if (!isSemiMonthlyContinuous) return;
		const normalizedMonthlyEndDay: number | "LAST_DAY" =
			cycleForm.cycleRules.MONTHLY.endDay === "LAST_DAY"
				? "LAST_DAY"
				: Math.min(Math.max(Number(cycleForm.cycleRules.MONTHLY.endDay) || 1, 1), 31);
		const normalizedRules: PayrollCycleRules = {
			SEMI_MONTHLY: {
				firstStartDay,
				secondStartDay,
				secondEndDay,
			},
			WEEKLY: {
				anchorWeekday: Math.min(
					Math.max(Number(cycleForm.cycleRules.WEEKLY.anchorWeekday) || 1, 0),
					6,
				),
			},
			BIWEEKLY: {
				anchorWeekday: Math.min(
					Math.max(Number(cycleForm.cycleRules.BIWEEKLY.anchorWeekday) || 1, 0),
					6,
				),
			},
			MONTHLY: {
				startDay: Math.min(
					Math.max(Number(cycleForm.cycleRules.MONTHLY.startDay) || 1, 1),
					31,
				),
				endDay: normalizedMonthlyEndDay,
			},
			QUARTERLY: {
				startMonth: Math.min(
					Math.max(Number(cycleForm.cycleRules.QUARTERLY.startMonth) || 1, 1),
					12,
				),
			},
			ANNUALLY: {
				startMonth: Math.min(
					Math.max(Number(cycleForm.cycleRules.ANNUALLY.startMonth) || 1, 1),
					12,
				),
			},
		};
		updatePayrollCycleConfig({
			defaultPayFrequency: cycleForm.defaultPayFrequency as any,
			payDateOffsetDays: Number(cycleForm.payDateOffsetDays),
			businessDayRule: cycleForm.businessDayRule as any,
			includeHolidaysInBusinessDayCheck: cycleForm.includeHolidaysInBusinessDayCheck,
			cycleRules: normalizedRules,
		});
	};

	const handleBulkGenerate = () => {
		bulkGeneratePeriods({
			frequency: generationForm.frequency as any,
			rangeStart: generationForm.rangeStart,
			rangeEnd: generationForm.rangeEnd,
			namingMode: generationForm.namingMode as any,
			customNamePrefix: generationForm.customNamePrefix || undefined,
			dryRun: generationForm.dryRun,
		});
	};

	const getSemiMonthlySnapshotText = (rules?: PayrollCycleRules) => {
		const semi = mergeCycleRules(rules).SEMI_MONTHLY;
		const firstEnd = Math.max(semi.firstStartDay, semi.secondStartDay - 1);
		const secondEnd = semi.secondEndDay === "LAST_DAY" ? "End" : semi.secondEndDay;
		return `${semi.firstStartDay}-${firstEnd} / ${semi.secondStartDay}-${secondEnd}`;
	};

	const isLocalSemiMonthlyDifferentFromServer = (serverRules?: PayrollCycleRules) => {
		const server = mergeCycleRules(serverRules).SEMI_MONTHLY;
		const local = cycleForm.cycleRules.SEMI_MONTHLY;
		return (
			server.firstStartDay !== Number(local.firstStartDay) ||
			server.secondStartDay !== Number(local.secondStartDay) ||
			server.secondEndDay !== local.secondEndDay
		);
	};

	const handleBulkAdjust = async () => {
		if (isAdjustingPeriods || isSyncingCycleConfigForAdjust) return;

		setBulkAdjustResultMessage(null);

		if (!adjustmentForm.dryRun) {
			if (!hasProjectedChanges) {
				setBulkAdjustResultMessage(
					"No projected changes found. Current and projected dates are the same for this frequency.",
				);
				return;
			}

			setIsSyncingCycleConfigForAdjust(true);
			try {
				const configResult = await refetchPayrollCycleConfig();
				const freshConfig = configResult.data;

				if (!freshConfig) {
					setBulkAdjustResultMessage(
						"Cycle config is not yet synced. Save and wait for confirmation.",
					);
					return;
				}

				if (isLocalSemiMonthlyDifferentFromServer(freshConfig.cycleRules)) {
					setBulkAdjustResultMessage(
						"Cycle config is not yet synced. Save and wait for confirmation.",
					);
					return;
				}
			} finally {
				setIsSyncingCycleConfigForAdjust(false);
			}
		}

		try {
			const result = await bulkAdjustPeriods({
				frequency: adjustmentForm.frequency as any,
				forceRetroactive: adjustmentForm.forceRetroactive,
				dryRun: adjustmentForm.dryRun,
			});
			const updated = result?.updated ?? 0;
			const skipped = result?.skipped ?? 0;

			if (adjustmentForm.dryRun) {
				setBulkAdjustResultMessage(
					`Preview generated, no periods were updated. Projected: ${updated}, Skipped: ${skipped}.`,
				);
				return;
			}

			await Promise.all([refetchPayrollPeriods(), refetchPayrollCycleConfig()]);
			setBulkAdjustResultMessage(`Periods updated: ${updated}, Skipped: ${skipped}.`);
		} catch {
			setBulkAdjustResultMessage("Failed to apply adjustments. Please try again.");
		}
	};

	const firstStartDay = Math.min(
		Math.max(Number(cycleForm.cycleRules.SEMI_MONTHLY.firstStartDay) || 1, 1),
		28,
	);
	const secondStartDay = Math.min(
		Math.max(Number(cycleForm.cycleRules.SEMI_MONTHLY.secondStartDay) || 16, 2),
		31,
	);
	const secondEndDay: number | "LAST_DAY" =
		cycleForm.cycleRules.SEMI_MONTHLY.secondEndDay === "LAST_DAY"
			? "LAST_DAY"
			: Math.min(
					Math.max(Number(cycleForm.cycleRules.SEMI_MONTHLY.secondEndDay) || 1, 1),
					31,
				);
	const firstPeriodEndDay = Math.max(firstStartDay, secondStartDay - 1);
	const semiMonthlyValidationError = (() => {
		if (secondStartDay <= firstStartDay) {
			return "2nd Period Start Day must be greater than 1st Period Start Day.";
		}
		if (secondEndDay === "LAST_DAY" && firstStartDay !== 1) {
			return "For continuous coverage with End = LAST_DAY, 1st Period Start Day must be 1.";
		}
		if (typeof secondEndDay === "number" && firstStartDay !== secondEndDay + 1) {
			return "For continuous coverage, 1st Period Start Day must equal (2nd Period End Day + 1).";
		}
		return null;
	})();
	const isSemiMonthly = cycleForm.defaultPayFrequency === "SEMI_MONTHLY";
	const isWeekly = cycleForm.defaultPayFrequency === "WEEKLY";
	const isBiweekly = cycleForm.defaultPayFrequency === "BIWEEKLY";
	const isMonthly = cycleForm.defaultPayFrequency === "MONTHLY";
	const isQuarterly = cycleForm.defaultPayFrequency === "QUARTERLY";
	const isAnnually = cycleForm.defaultPayFrequency === "ANNUALLY";
	const isCrossMonthSecondCutoff =
		typeof secondEndDay === "number" && secondEndDay < secondStartDay;
	const cycleExplainerLineThree = `Pay date = period end date + ${Number(cycleForm.payDateOffsetDays) || 0} day(s)`;
	const resolveDayInMonth = useCallback((year: number, month: number, day: number) => {
		const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		const clamped = Math.min(Math.max(day, 1), lastDay);
		return new Date(Date.UTC(year, month, clamped, 0, 0, 0, 0));
	}, []);
	const resolveSemiMonthlyPeriod = useCallback(
		(year: number, month: number, periodNumber: 1 | 2) => {
			const start =
				periodNumber === 1
					? resolveDayInMonth(year, month, firstStartDay)
					: resolveDayInMonth(year, month, secondStartDay);
			let end: Date;
			if (periodNumber === 1) {
				end = resolveDayInMonth(year, month, firstPeriodEndDay);
			} else if (secondEndDay === "LAST_DAY") {
				end = resolveDayInMonth(year, month, 31);
			} else {
				const targetMonth = secondEndDay < secondStartDay ? month + 1 : month;
				const targetYear = targetMonth > 11 ? year + 1 : year;
				const normalizedMonth = targetMonth % 12;
				end = resolveDayInMonth(targetYear, normalizedMonth, secondEndDay);
			}
			return { start, end };
		},
		[firstPeriodEndDay, firstStartDay, resolveDayInMonth, secondEndDay, secondStartDay],
	);
	const isPeriodOneDay = useCallback(
		(dayOfMonth: number) => dayOfMonth >= firstStartDay && dayOfMonth <= firstPeriodEndDay,
		[firstPeriodEndDay, firstStartDay],
	);
	const formatUtcDate = (dateValue?: string | Date | null) => {
		if (!dateValue) return "-";
		const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
		if (Number.isNaN(d.getTime())) return "-";
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "2-digit",
			year: "numeric",
			timeZone: "UTC",
		});
	};
	const normalizedPayrollPeriods = useMemo<PayrollPeriodItem[]>(() => {
		const payload: any = payrollPeriodsData as any;
		return (
			payload?.data?.payrollPeriods ||
			payload?.payrollPeriods ||
			payload?.data?.data?.payrollPeriods ||
			[]
		);
	}, [payrollPeriodsData]);

	const adjustmentPreviewRows = useMemo(() => {
		const existingPeriods = normalizedPayrollPeriods;
		const selectedFrequency = adjustmentForm.frequency;
		const matchingPeriods = existingPeriods.filter((period) => {
			if (!period.payFrequency) {
				// Legacy periods without payFrequency should still be visible for preview.
				return selectedFrequency === "SEMI_MONTHLY";
			}
			return period.payFrequency === selectedFrequency;
		});

		const rows = (matchingPeriods.length > 0 ? matchingPeriods : existingPeriods)
			.slice(0, 12)
			.map((period) => {
				const originalStart = new Date(period.startDate);
				const year = originalStart.getUTCFullYear();
				const month = originalStart.getUTCMonth();
				const inferredPeriodNumber =
					period.periodNumber || (isPeriodOneDay(originalStart.getUTCDate()) ? 1 : 2);

				let newStart: Date;
				let newEnd: Date;

				if (inferredPeriodNumber === 1) {
					const resolved = resolveSemiMonthlyPeriod(year, month, 1);
					newStart = resolved.start;
					newEnd = resolved.end;
				} else {
					const resolved = resolveSemiMonthlyPeriod(year, month, 2);
					newStart = resolved.start;
					newEnd = resolved.end;
				}

				const newPayDate = new Date(newEnd);
				newPayDate.setUTCDate(
					newPayDate.getUTCDate() + (Number(cycleForm.payDateOffsetDays) || 0),
				);

				return {
					id: period.id,
					name: period.name,
					currentRange: `${formatUtcDate(period.startDate)} - ${formatUtcDate(period.endDate)}`,
					projectedRange: `${formatUtcDate(newStart)} - ${formatUtcDate(newEnd)}`,
					currentPayDate: formatUtcDate(period.payDate),
					projectedPayDate: formatUtcDate(newPayDate),
				};
			});

		return rows;
	}, [
		normalizedPayrollPeriods,
		adjustmentForm.frequency,
		cycleForm.payDateOffsetDays,
		isPeriodOneDay,
		resolveSemiMonthlyPeriod,
	]);
	const hasProjectedChanges = useMemo(
		() =>
			adjustmentPreviewRows.some(
				(row) =>
					row.currentRange !== row.projectedRange ||
					row.currentPayDate !== row.projectedPayDate,
			),
		[adjustmentPreviewRows],
	);

	const setSemiMonthlyFirstStartDay = (rawValue: number) => {
		const firstStartDay = Math.min(Math.max(Number(rawValue) || 1, 1), 28);
		setCycleForm((prev) => ({
			...prev,
			cycleRules: {
				...prev.cycleRules,
				SEMI_MONTHLY: {
					firstStartDay,
					secondStartDay:
						prev.cycleRules.SEMI_MONTHLY.secondStartDay <= firstStartDay
							? Math.min(firstStartDay + 1, 31)
							: prev.cycleRules.SEMI_MONTHLY.secondStartDay,
					secondEndDay: prev.cycleRules.SEMI_MONTHLY.secondEndDay,
				},
			},
		}));
	};

	const setSemiMonthlySecondStartDay = (rawValue: number) => {
		setCycleForm((prev) => ({
			...prev,
			cycleRules: {
				...prev.cycleRules,
				SEMI_MONTHLY: {
					...prev.cycleRules.SEMI_MONTHLY,
					secondStartDay: Math.min(Math.max(Number(rawValue) || 2, 2), 31),
				},
			},
		}));
	};

	const setSemiMonthlySecondEndDay = (rawValue: number) => {
		const numericValue = Math.min(Math.max(Number(rawValue) || 1, 1), 31);
		setCycleForm((prev) => ({
			...prev,
			cycleRules: {
				...prev.cycleRules,
				SEMI_MONTHLY: {
					...prev.cycleRules.SEMI_MONTHLY,
					secondEndDay: numericValue >= 31 ? "LAST_DAY" : numericValue,
				},
			},
		}));
	};

	const setSemiMonthlySecondEndLastDay = () => {
		setCycleForm((prev) => ({
			...prev,
			cycleRules: {
				...prev.cycleRules,
				SEMI_MONTHLY: {
					...prev.cycleRules.SEMI_MONTHLY,
					secondEndDay: "LAST_DAY",
				},
			},
		}));
	};

	const setSemiMonthlyUnifiedShift = (rawValue: number) => {
		const firstStartDay = Math.min(Math.max(Number(rawValue) || 1, 1), 16);
		const secondStartDay = Math.min(firstStartDay + 15, 31);
		const secondEndDay: number | "LAST_DAY" =
			firstStartDay === 1 ? "LAST_DAY" : firstStartDay - 1;
		setCycleForm((prev) => ({
			...prev,
			cycleRules: {
				...prev.cycleRules,
				SEMI_MONTHLY: {
					firstStartDay,
					secondStartDay,
					secondEndDay,
				},
			},
		}));
	};

	const applyTodayMinus15ToSemiMonthly = () => {
		const today = new Date();
		const fifteenDaysAgo = new Date(today);
		fifteenDaysAgo.setDate(today.getDate() - 15);
		const targetDay = fifteenDaysAgo.getDate();

		const secondEndDay: number | "LAST_DAY" = targetDay >= 31 ? "LAST_DAY" : targetDay;
		const firstStartDay =
			secondEndDay === "LAST_DAY" ? 1 : Math.min(Math.max(secondEndDay + 1, 1), 28);
		const secondStartDay = Math.min(Math.max(firstStartDay + 15, firstStartDay + 1), 31);
		setCycleForm((prev) => ({
			...prev,
			cycleRules: {
				...prev.cycleRules,
				SEMI_MONTHLY: {
					firstStartDay,
					secondStartDay,
					secondEndDay,
				},
			},
		}));
	};

	const serverSemiMonthlySnapshot = useMemo(
		() => getSemiMonthlySnapshotText(payrollCycleConfig?.cycleRules),
		[payrollCycleConfig],
	);

	const existingPeriodRows = useMemo(() => {
		const periods = normalizedPayrollPeriods;
		return periods.slice(0, 20).map((period) => {
			return {
				id: period.id,
				name: period.name,
				frequency: period.payFrequency ? period.payFrequency.replace(/_/g, " ") : "LEGACY",
				range: `${formatUtcDate(period.startDate)} - ${formatUtcDate(period.endDate)}`,
				payDate: formatUtcDate(period.payDate),
				status: period.status,
			};
		});
	}, [normalizedPayrollPeriods]);

	const taxRates: any = watch("taxRates" as any);
	const rateMultipliers: any = watch("rateMultipliers" as any);

	const tabs: { id: SettingsTab; label: string; icon: any }[] = [
		{ id: "cycle", label: "Payroll Cycle", icon: Settings },
		{ id: "tax-table", label: "Tax Table", icon: FileText },
		{ id: "contributions", label: "Contributions", icon: Calculator },
		{ id: "rates", label: "Rates", icon: Clock },
	];

	if (isLoading || isLoadingCycleConfig) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<Loader2 className="w-8 h-8 animate-spin text-orange-500" />
			</div>
		);
	}

	const payrollActions =
		activeTab === "cycle" ? (
			<Button
				type="button"
				onClick={handleSaveCycleSettings}
				disabled={isUpdatingCycleConfig || (isSemiMonthly && !!semiMonthlyValidationError)}
				className="h-10 rounded-md bg-orange-600 text-white hover:bg-orange-700">
				{isUpdatingCycleConfig ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Saving...
					</>
				) : (
					<>
						<Save className="mr-2 h-4 w-4" />
						Save Changes
					</>
				)}
			</Button>
		) : (
			<>
				<Button variant="outline" className="h-10 rounded-md" onClick={() => reset()}>
					Discard Changes
				</Button>
				<Button
					onClick={handleSubmit(onSubmit)}
					disabled={!isDirty || isUpdating}
					className="h-10 rounded-md bg-orange-600 text-white hover:bg-orange-700">
					{isUpdating ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Saving...
						</>
					) : (
						<>
							<Save className="mr-2 h-4 w-4" />
							Save Changes
						</>
					)}
				</Button>
			</>
		);

	const payrollTabs = (
		<div
			role="tablist"
			aria-label="Payroll settings sections"
			className="bg-gray-50 relative -mb-px flex gap-1 overflow-x-auto px-3 pb-0 pt-3 [scrollbar-width:none] after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:content-[''] sm:px-4">
			{tabs.map((tab) => {
				const Icon = tab.icon;
				const isActive = activeTab === tab.id;
				return (
					<button
						id={`payroll-tab-${tab.id}`}
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={isActive}
						aria-controls={`payroll-panel-${tab.id}`}
						onClick={() => setActiveTab(tab.id)}
						className={`relative flex h-12 shrink-0 items-center gap-2 rounded-t-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
							isActive
								? "z-30 -mb-px border-orange-200 border-b-white bg-white text-orange-700 shadow-[0_-1px_0_rgba(15,23,42,0.03),0_8px_18px_rgba(15,23,42,0.08)] before:pointer-events-none before:absolute before:bottom-0 before:left-[-14px] before:h-[14px] before:w-[14px] before:rounded-br-[14px] before:border-b before:border-r before:border-orange-200 before:bg-transparent before:content-[''] before:shadow-[5px_5px_0_0_rgb(255_255_255)] after:pointer-events-none after:absolute after:bottom-0 after:right-[-14px] after:h-[14px] after:w-[14px] after:rounded-bl-[14px] after:border-b after:border-l after:border-orange-200 after:bg-transparent after:content-[''] after:shadow-[-5px_5px_0_0_rgb(255_255_255)]"
								: "z-10 border-transparent text-gray-600 hover:bg-white/70 hover:text-gray-950"
						}`}>
						<span
							className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
								isActive ? "bg-orange-100 text-orange-600" : "text-gray-500"
							}`}>
							<Icon className="h-4 w-4" />
						</span>
						<span>{tab.label}</span>
					</button>
				);
			})}
		</div>
	);

	const matrixInputClass =
		"h-8 w-20 rounded-md border-transparent bg-transparent text-right font-mono text-xs shadow-none transition-colors hover:border-gray-200 hover:bg-white focus:border-orange-300 focus:bg-white sm:w-24";
	const amountInputClass = "h-10 rounded-md border-gray-200 bg-white pl-12 text-sm shadow-sm";
	const percentInputClass = "h-10 rounded-md border-gray-200 bg-white pr-8 text-sm shadow-sm";

	const content = (
		<>
			{!showHeader && payrollActions ? (
				<div className="flex flex-wrap justify-end gap-3">{payrollActions}</div>
			) : null}
			<div className="overflow-visible rounded-2xl shadow-gray-200/60">
				{payrollTabs}
				<form
					onSubmit={handleSubmit(onSubmit)}
					className="relative rounded-b-2xl border border-orange-200 border-t-0 bg-white p-3 shadow-inner shadow-orange-100/70 sm:p-5">
					<div
						role="tabpanel"
						id={`payroll-panel-${activeTab}`}
						aria-labelledby={`payroll-tab-${activeTab}`}
						className="min-w-0">
				{/* Tax Table Settings */}
				{activeTab === "tax-table" && (
					<div className="max-w-5xl">
						<div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
							<div className="flex flex-col gap-3 border-b border-gray-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<h3 className="text-sm font-semibold text-gray-900">
									Annual Tax Table
								</h3>
								<a
									href="https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf"
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100">
									View BIR Reference
								</a>
							</div>
							<div className="overflow-x-auto">
								<table className="min-w-[700px] w-full text-left text-sm">
									<thead className="border-b border-gray-200 bg-slate-100 text-gray-700">
										<tr>
											<th className="px-3 py-2.5 font-medium">Bracket</th>
											<th
												colSpan={3}
												className="border-l border-gray-200 px-3 py-2.5 font-medium">
												Annual
											</th>
										</tr>
										<tr className="border-t border-gray-200">
											<th className="bg-slate-100 px-3 py-2 text-xs"></th>
											<th className="bg-slate-100 px-2 py-2 text-xs">Range</th>
											<th className="bg-slate-100 px-2 py-2 text-xs">
												Fixed Tax
											</th>
											<th className="bg-slate-100 px-2 py-2 text-xs">Rate</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-gray-100">
										{Array.isArray(taxRates) &&
											taxRates.map((bracket: any, idx: number) => (
												<tr
													key={idx}
													className="transition-colors hover:bg-orange-50/30">
													<td className="px-3 py-2.5 font-medium text-gray-900">
														{idx + 1}
													</td>

													{/* Annual */}
													<td className="px-2 py-2.5">
														<div className="flex gap-1 items-center text-xs">
															<Input
																{...register(
																	`taxRates.${idx}.annualBase`,
																)}
																type="number"
																className={matrixInputClass}
																placeholder="Base"
															/>
															<span className="text-gray-400">-</span>
															<Input
																{...register(
																	`taxRates.${idx}.annualCap`,
																)}
																type="number"
																className={matrixInputClass}
																placeholder="Cap"
															/>
														</div>
													</td>
													<td className="px-2 py-2.5">
														<Input
															{...register(
																`taxRates.${idx}.annualFixedTax`,
															)}
															type="number"
															className={matrixInputClass}
														/>
													</td>
													<td className="px-2 py-2.5">
														<div className="relative w-20">
															<Input
																{...register(
																	`taxRates.${idx}.rate`,
																)}
																type="number"
																step="0.01"
																className="h-8 rounded-md border-transparent bg-transparent pr-4 text-right font-mono text-xs shadow-none transition-colors hover:border-gray-200 focus:border-orange-300 focus:bg-white"
															/>
															<span className="absolute right-2 top-1 text-gray-400 text-xs">
																%
															</span>
														</div>
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
						</div>
					</div>
				)}
				{/* Contributions Settings */}
				{activeTab === "contributions" && (
					<div className="max-w-5xl space-y-3">
						{/* SSS Section */}
						<section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
							<div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
								<h3 className="text-sm font-semibold text-gray-900">
									SSS Contribution
								</h3>
								<Switch
									defaultChecked
									className="data-[state=checked]:bg-orange-600"
								/>
							</div>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Employee Rate
									</label>
									<div className="relative">
										<Input
											{...register("sssRates.employeeRate")}
											type="number"
											step="0.001"
											className={percentInputClass}
										/>
										<span className="absolute right-3 top-2.5 text-sm text-gray-500">
											%
										</span>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Employer Rate
									</label>
									<div className="relative">
										<Input
											{...register("sssRates.employerRate")}
											type="number"
											step="0.001"
											className={percentInputClass}
										/>
										<span className="absolute right-3 top-2.5 text-sm text-gray-500">
											%
										</span>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Minimum Base
									</label>
									<div className="relative">
										<span className="absolute left-3 top-2.5 text-sm text-gray-500">
											PHP
										</span>
										<Input
											{...register("sssRates.minimumBase")}
											type="number"
											className={amountInputClass}
										/>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Maximum Ceiling
									</label>
									<div className="relative">
										<span className="absolute left-3 top-2.5 text-sm text-gray-500">
											PHP
										</span>
										<Input
											{...register("sssRates.maximumCeiling")}
											type="number"
											className={amountInputClass}
										/>
									</div>
								</div>
							</div>
						</section>

						{/* PhilHealth Section */}
						<section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
							<div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
								<h3 className="text-sm font-semibold text-gray-900">PhilHealth</h3>
								<Switch
									defaultChecked
									className="data-[state=checked]:bg-orange-600"
								/>
							</div>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Employee Rate
									</label>
									<div className="relative">
										<Input
											{...register("philHealthRates.employeeRate")}
											type="number"
											step="0.001"
											className={percentInputClass}
										/>
										<span className="absolute right-3 top-2.5 text-sm text-gray-500">
											%
										</span>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Employer Rate
									</label>
									<div className="relative">
										<Input
											{...register("philHealthRates.employerRate")}
											type="number"
											step="0.001"
											className={percentInputClass}
										/>
										<span className="absolute right-3 top-2.5 text-sm text-gray-500">
											%
										</span>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Minimum Base
									</label>
									<div className="relative">
										<span className="absolute left-3 top-2.5 text-sm text-gray-500">
											PHP
										</span>
										<Input
											{...register("philHealthRates.minimumBase")}
											type="number"
											className={amountInputClass}
										/>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Maximum Ceiling
									</label>
									<div className="relative">
										<span className="absolute left-3 top-2.5 text-sm text-gray-500">
											PHP
										</span>
										<Input
											{...register("philHealthRates.maximumCeiling")}
											type="number"
											className={amountInputClass}
										/>
									</div>
								</div>
							</div>
						</section>

						{/* Pag-IBIG Section */}
						<section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
							<div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
								<h3 className="text-sm font-semibold text-gray-900">Pag-IBIG</h3>
								<Switch
									defaultChecked
									className="data-[state=checked]:bg-orange-600"
								/>
							</div>
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Rate Below Threshold
									</label>
									<div className="relative">
										<Input
											{...register("pagibigRates.rateBelowThreshold")}
											type="number"
											step="0.001"
											className={percentInputClass}
										/>
										<span className="absolute right-3 top-2.5 text-sm text-gray-500">
											%
										</span>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Rate Above Threshold
									</label>
									<div className="relative">
										<Input
											{...register("pagibigRates.rateAboveThreshold")}
											type="number"
											step="0.001"
											className={percentInputClass}
										/>
										<span className="absolute right-3 top-2.5 text-sm text-gray-500">
											%
										</span>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Threshold
									</label>
									<div className="relative">
										<span className="absolute left-3 top-2.5 text-sm text-gray-500">
											PHP
										</span>
										<Input
											{...register("pagibigRates.threshold")}
											type="number"
											className={amountInputClass}
										/>
									</div>
								</div>
								<div className="space-y-2">
									<label className="text-xs font-medium text-gray-600">
										Maximum Ceiling
									</label>
									<div className="relative">
										<span className="absolute left-3 top-2.5 text-sm text-gray-500">
											PHP
										</span>
										<Input
											{...register("pagibigRates.maximumCeiling")}
											type="number"
											className={amountInputClass}
										/>
									</div>
								</div>
							</div>
						</section>
					</div>
				)}
				{/* Rates Settings */}
				{activeTab === "rates" && (
					<div className="max-w-5xl">
						<div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
							<table className="min-w-[760px] w-full text-left text-sm">
								<thead className="border-b border-gray-200 bg-slate-100 text-gray-700">
									<tr>
										<th className="px-3 py-2.5 font-medium">Category</th>
										<th className="border-l border-gray-200 px-3 py-2.5 font-medium">
											Work
										</th>
										<th className="border-l border-gray-200 px-3 py-2.5 font-medium">
											OT
										</th>
										<th className="border-l border-gray-200 px-3 py-2.5 font-medium">
											ND
										</th>
										<th className="border-l border-gray-200 px-3 py-2.5 font-medium">
											ND OT
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-100">
									{[
										{ key: "ordinaryDay", label: "Ordinary Day" },
										{
											key: "restDayOrSpecialHoliday",
											label: "Rest Day or Special Holiday",
										},
										{
											key: "specialHolidayOnRestDay",
											label: "Special Holiday on Rest Day",
										},
										{ key: "regularHoliday", label: "Regular Holiday" },
										{
											key: "regularHolidayOnRestDay",
											label: "Regular Holiday on Rest Day",
										},
										{ key: "doubleHoliday", label: "Double Holiday" },
										{
											key: "doubleHolidayOnRestDay",
											label: "Double Holiday on Rest Day",
										},
									].map((r) => {
										const row = r as {
											key: keyof FormData["rateMultipliers"];
											label: string;
										};
										return (
											<tr
												key={row.key}
												className="transition-colors hover:bg-orange-50/30">
												<td className="px-3 py-2.5 font-medium text-gray-900">
													{row.label}
												</td>
												<td className="border-l border-gray-200 px-2 py-2.5">
													<Input
														{...register(
															`rateMultipliers.${row.key}.work` as any,
														)}
														type="number"
														step="0.001"
														className={matrixInputClass}
														placeholder="1.00"
														defaultValue={
															rateMultipliers?.[row.key]?.work
														}
													/>
												</td>
												<td className="border-l border-gray-200 px-2 py-2.5">
													<Input
														{...register(
															`rateMultipliers.${row.key}.ot` as any,
														)}
														type="number"
														step="0.001"
														className={matrixInputClass}
														placeholder="1.00"
														defaultValue={
															rateMultipliers?.[row.key]?.ot
														}
													/>
												</td>
												<td className="border-l border-gray-200 px-2 py-2.5">
													<Input
														{...register(
															`rateMultipliers.${row.key}.nd` as any,
														)}
														type="number"
														step="0.001"
														className={matrixInputClass}
														placeholder="1.00"
														defaultValue={
															rateMultipliers?.[row.key]?.nd
														}
													/>
												</td>
												<td className="border-l border-gray-200 px-2 py-2.5">
													<Input
														{...register(
															`rateMultipliers.${row.key}.ndot` as any,
														)}
														type="number"
														step="0.001"
														className={matrixInputClass}
														placeholder="1.00"
														defaultValue={
															rateMultipliers?.[row.key]?.ndot
														}
													/>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}
				{activeTab === "cycle" && (
					<div className="max-w-5xl space-y-4">
						<div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
							<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
								<div className="flex flex-wrap items-center gap-3">
									<h3 className="text-sm font-semibold text-gray-900">
										Cycle Configuration
									</h3>
									<span className="rounded-full border border-gray-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-gray-600">
										{cycleForm.defaultPayFrequency.replace(/_/g, " ")}
									</span>
									<span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
										{serverSemiMonthlySnapshot}
									</span>
								</div>
							</div>

							<div className="space-y-4">
								<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_220px]">
									<div className="space-y-2">
										<label className="text-xs font-medium text-gray-600">
											Default Frequency
										</label>
										<Select
											value={cycleForm.defaultPayFrequency}
											onValueChange={(value) =>
												setCycleForm((prev) => ({
													...prev,
													defaultPayFrequency: value,
												}))
											}>
											<SelectTrigger className="h-10 w-full rounded-md border-gray-200 bg-white text-sm">
												<SelectValue placeholder="Select frequency" />
											</SelectTrigger>
											<SelectContent>
												{PAY_FREQUENCIES.map((frequency) => (
													<SelectItem key={frequency} value={frequency}>
														{frequency.replace(/_/g, " ")}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<label className="text-xs font-medium text-gray-600">
											Pay Date Offset
										</label>
										<Input
											type="number"
											min={0}
											max={60}
											value={cycleForm.payDateOffsetDays}
											onChange={(e) =>
												setCycleForm((prev) => ({
													...prev,
													payDateOffsetDays: Number(e.target.value) || 0,
												}))
											}
											className="h-10 rounded-md border-gray-200 bg-white text-sm"
										/>
									</div>
									<div className="space-y-2">
										<label className="text-xs font-medium text-gray-600">
											Business Day Rule
										</label>
										<Select
											value={cycleForm.businessDayRule}
											onValueChange={(value) =>
												setCycleForm((prev) => ({
													...prev,
													businessDayRule: value,
												}))
											}>
											<SelectTrigger className="h-10 w-full rounded-md border-gray-200 bg-white text-sm">
												<SelectValue placeholder="Select business day rule" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="NEXT_BUSINESS_DAY">
													Next Business Day
												</SelectItem>
												<SelectItem value="PREVIOUS_BUSINESS_DAY">
													Previous Business Day
												</SelectItem>
												<SelectItem value="EXACT_DATE">
													Exact Date
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<label className="text-xs font-medium text-gray-600">
											Holiday Check
										</label>
										<div className="flex h-10 items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3">
											<p className="min-w-0 text-sm font-medium text-gray-900">
												Included
											</p>
											<Switch
												checked={
													cycleForm.includeHolidaysInBusinessDayCheck
												}
												onCheckedChange={(checked) =>
													setCycleForm((prev) => ({
														...prev,
														includeHolidaysInBusinessDayCheck: checked,
													}))
												}
												className="shrink-0 data-[state=checked]:bg-orange-600"
											/>
										</div>
									</div>
								</div>

								{isSemiMonthly && (
									<div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
										<div className="flex flex-col gap-2 border-b border-gray-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
											<label className="text-sm font-semibold text-gray-900">
												Semi-Monthly Cutoff
											</label>
											<div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
												{cycleForm.cycleRules.SEMI_MONTHLY.firstStartDay}-
												{Math.max(
													cycleForm.cycleRules.SEMI_MONTHLY.firstStartDay,
													cycleForm.cycleRules.SEMI_MONTHLY
														.secondStartDay - 1,
												)}{" "}
												/ {cycleForm.cycleRules.SEMI_MONTHLY.secondStartDay}
												-
												{cycleForm.cycleRules.SEMI_MONTHLY.secondEndDay ===
												"LAST_DAY"
													? "End"
													: cycleForm.cycleRules.SEMI_MONTHLY
															.secondEndDay}
											</div>
										</div>

										<div className="mt-3">
											<div className="grid gap-3 md:grid-cols-3">
												<div className="space-y-2">
													<label className="text-xs font-medium text-gray-600">
														1st Start
													</label>
													<Select
														value={String(
															cycleForm.cycleRules.SEMI_MONTHLY
																.firstStartDay,
														)}
														onValueChange={(value) =>
															setSemiMonthlyFirstStartDay(
																Number(value),
															)
														}>
														<SelectTrigger className="h-10 w-full rounded-md border-gray-200 bg-white text-sm">
															<SelectValue placeholder="1st Period Start Day" />
														</SelectTrigger>
														<SelectContent>
															{Array.from(
																{ length: 28 },
																(_, i) => i + 1,
															).map((day) => (
																<SelectItem
																	key={`semi-first-${day}`}
																	value={String(day)}>
																	{day}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												<div className="space-y-2">
													<label className="text-xs font-medium text-gray-600">
														2nd Start
													</label>
													<Select
														value={String(
															cycleForm.cycleRules.SEMI_MONTHLY
																.secondStartDay,
														)}
														onValueChange={(value) =>
															setSemiMonthlySecondStartDay(
																Number(value),
															)
														}>
														<SelectTrigger className="h-10 w-full rounded-md border-gray-200 bg-white text-sm">
															<SelectValue placeholder="2nd Period Start Day" />
														</SelectTrigger>
														<SelectContent>
															{Array.from(
																{
																	length:
																		31 -
																		cycleForm.cycleRules
																			.SEMI_MONTHLY
																			.firstStartDay,
																},
																(_, i) =>
																	i +
																	cycleForm.cycleRules
																		.SEMI_MONTHLY
																		.firstStartDay +
																	1,
															).map((day) => (
																<SelectItem
																	key={`semi-second-${day}`}
																	value={String(day)}>
																	{day}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												<div className="space-y-2">
													<label className="text-xs font-medium text-gray-600">
														2nd End
													</label>
													<Select
														value={String(
															cycleForm.cycleRules.SEMI_MONTHLY
																.secondEndDay,
														)}
														onValueChange={(value) => {
															if (value === "LAST_DAY") {
																setSemiMonthlySecondEndLastDay();
																return;
															}
															setSemiMonthlySecondEndDay(
																Number(value),
															);
														}}>
														<SelectTrigger className="h-10 w-full rounded-md border-gray-200 bg-white text-sm">
															<SelectValue placeholder="2nd Period End Day" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="LAST_DAY">
																LAST_DAY
															</SelectItem>
															{Array.from(
																{ length: 31 },
																(_, i) => i + 1,
															).map((day) => (
																<SelectItem
																	key={`semi-end-${day}`}
																	value={String(day)}>
																	{day}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											</div>
										</div>
									</div>
								)}

								<div className="space-y-2">
									{(isWeekly || isBiweekly) && (
										<>
											<label className="text-sm font-medium text-gray-700">
												Anchor Weekday (0=Sun..6=Sat)
											</label>
											<Input
												type="number"
												min={0}
												max={6}
												value={
													isWeekly
														? cycleForm.cycleRules.WEEKLY.anchorWeekday
														: cycleForm.cycleRules.BIWEEKLY
																.anchorWeekday
												}
												onChange={(e) =>
													setCycleForm((prev) => ({
														...prev,
														cycleRules: isWeekly
															? {
																	...prev.cycleRules,
																	WEEKLY: {
																		anchorWeekday: Math.min(
																			Math.max(
																				Number(
																					e.target.value,
																				) || 0,
																				0,
																			),
																			6,
																		),
																	},
																}
															: {
																	...prev.cycleRules,
																	BIWEEKLY: {
																		anchorWeekday: Math.min(
																			Math.max(
																				Number(
																					e.target.value,
																				) || 0,
																				0,
																			),
																			6,
																		),
																	},
																},
													}))
												}
											/>
										</>
									)}
									{isMonthly && (
										<div className="grid grid-cols-2 gap-2">
											<div className="space-y-1">
												<label className="text-sm font-medium text-gray-700">
													Monthly Start Day
												</label>
												<Input
													type="number"
													min={1}
													max={31}
													value={cycleForm.cycleRules.MONTHLY.startDay}
													onChange={(e) =>
														setCycleForm((prev) => ({
															...prev,
															cycleRules: {
																...prev.cycleRules,
																MONTHLY: {
																	...prev.cycleRules.MONTHLY,
																	startDay: Math.min(
																		Math.max(
																			Number(
																				e.target.value,
																			) || 1,
																			1,
																		),
																		31,
																	),
																},
															},
														}))
													}
												/>
											</div>
											<div className="space-y-1">
												<label className="text-sm font-medium text-gray-700">
													Monthly End Day
												</label>
												<Select
													value={String(
														cycleForm.cycleRules.MONTHLY.endDay,
													)}
													onValueChange={(value) =>
														setCycleForm((prev) => ({
															...prev,
															cycleRules: {
																...prev.cycleRules,
																MONTHLY: {
																	...prev.cycleRules.MONTHLY,
																	endDay:
																		value === "LAST_DAY"
																			? "LAST_DAY"
																			: Math.min(
																					Math.max(
																						Number(
																							value,
																						) || 1,
																						1,
																					),
																					31,
																				),
																},
															},
														}))
													}>
													<SelectTrigger className="h-10 w-full rounded-md border-gray-200 bg-white text-sm">
														<SelectValue placeholder="Monthly End Day" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="LAST_DAY">
															LAST_DAY
														</SelectItem>
														<SelectItem value="28">28</SelectItem>
														<SelectItem value="29">29</SelectItem>
														<SelectItem value="30">30</SelectItem>
														<SelectItem value="31">31</SelectItem>
													</SelectContent>
												</Select>
											</div>
										</div>
									)}
									{(isQuarterly || isAnnually) && (
										<>
											<label className="text-sm font-medium text-gray-700">
												Start Month (1..12)
											</label>
											<Input
												type="number"
												min={1}
												max={12}
												value={
													isQuarterly
														? cycleForm.cycleRules.QUARTERLY.startMonth
														: cycleForm.cycleRules.ANNUALLY.startMonth
												}
												onChange={(e) =>
													setCycleForm((prev) => ({
														...prev,
														cycleRules: isQuarterly
															? {
																	...prev.cycleRules,
																	QUARTERLY: {
																		startMonth: Math.min(
																			Math.max(
																				Number(
																					e.target.value,
																				) || 1,
																				1,
																			),
																			12,
																		),
																	},
																}
															: {
																	...prev.cycleRules,
																	ANNUALLY: {
																		startMonth: Math.min(
																			Math.max(
																				Number(
																					e.target.value,
																				) || 1,
																				1,
																			),
																			12,
																		),
																	},
																},
													}))
												}
											/>
										</>
									)}
								</div>
							</div>
						</div>

						{isSemiMonthly && (
							<details className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
								<summary className="flex cursor-pointer list-none items-center justify-between gap-3">
									<p className="text-sm font-semibold text-gray-900">
										Advanced Cutoff Tools
									</p>
									<span className="text-xs font-medium text-gray-500">
										Quick shift and presets
									</span>
								</summary>
								<div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 lg:grid-cols-[minmax(0,1fr)_280px]">
									<div className="space-y-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
										<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
											<p className="text-sm font-semibold text-gray-900">
												Quick Shift
											</p>
											<Button
												type="button"
												variant="outline"
												className="h-9 rounded-md px-3 text-xs"
												onClick={applyTodayMinus15ToSemiMonthly}>
												Today - 15 Days
											</Button>
										</div>
										<input
											type="range"
											min={1}
											max={16}
											value={Math.min(
												Math.max(
													Number(
														cycleForm.cycleRules.SEMI_MONTHLY
															.firstStartDay,
													) || 1,
													1,
												),
												16,
											)}
											onChange={(e) =>
												setSemiMonthlyUnifiedShift(Number(e.target.value))
											}
											className="w-full accent-orange-600"
										/>
										<div className="flex items-center justify-between text-xs text-gray-500">
											<span>Earlier start</span>
											<span>{cycleExplainerLineThree}</span>
											<span>Later start</span>
										</div>
									</div>

									<div className="space-y-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
										<p className="text-sm font-semibold text-gray-900">
											Presets
										</p>
										<div className="grid grid-cols-2 gap-2">
											{[
												{
													label: "11-25 / 26-10 (BNPI)",
													firstStartDay: 11,
													secondStartDay: 26,
													secondEndDay: 10 as const,
												},
												{
													label: "1-15 / 16-End",
													firstStartDay: 1,
													secondStartDay: 16,
													secondEndDay: "LAST_DAY" as const,
												},
												{
													label: "1-14 / 15-End",
													firstStartDay: 1,
													secondStartDay: 15,
													secondEndDay: "LAST_DAY" as const,
												},
												{
													label: "5-19 / 20-4",
													firstStartDay: 5,
													secondStartDay: 20,
													secondEndDay: 4 as const,
												},
												{
													label: "10-24 / 25-9",
													firstStartDay: 10,
													secondStartDay: 25,
													secondEndDay: 9 as const,
												},
											].map((preset) => (
												<Button
													type="button"
													variant="outline"
													className="h-9 justify-start rounded-md border-gray-200 bg-white px-2 text-xs hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
													key={preset.label}
													onClick={() =>
														setCycleForm((prev) => ({
															...prev,
															cycleRules: {
																...prev.cycleRules,
																SEMI_MONTHLY: {
																	firstStartDay:
																		preset.firstStartDay,
																	secondStartDay:
																		preset.secondStartDay,
																	secondEndDay:
																		preset.secondEndDay,
																},
															},
														}))
													}>
													{preset.label}
												</Button>
											))}
										</div>
									</div>
								</div>
							</details>
						)}

						<div className="space-y-4">
							<details className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
								<summary className="flex cursor-pointer list-none items-center justify-between gap-3">
									<p className="text-sm font-semibold text-gray-900">
										Bulk Generate Periods
									</p>
									<span className="text-xs font-medium text-orange-600">
										Advanced
									</span>
								</summary>
								<div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 md:grid-cols-2">
									<Select
										value={generationForm.frequency}
										onValueChange={(value) => {
											hasEditedGenerationFrequency.current = true;
											setGenerationForm((prev) => ({
												...prev,
												frequency: value,
											}));
										}}>
										<SelectTrigger className="h-10 rounded-md border-gray-200 bg-white text-sm md:col-span-2">
											<SelectValue placeholder="Frequency" />
										</SelectTrigger>
										<SelectContent>
											{PAY_FREQUENCIES.map((frequency) => (
												<SelectItem key={frequency} value={frequency}>
													{frequency.replace(/_/g, " ")}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<CalendarDatePicker
										value={generationForm.rangeStart}
										onChange={(next) =>
											setGenerationForm((prev) => ({
												...prev,
												rangeStart: next,
											}))
										}
										className="h-10 rounded-md border-gray-200 bg-white"
									/>
									<CalendarDatePicker
										value={generationForm.rangeEnd}
										onChange={(next) =>
											setGenerationForm((prev) => ({
												...prev,
												rangeEnd: next,
											}))
										}
										className="h-10 rounded-md border-gray-200 bg-white"
									/>
									<Button
										type="button"
										onClick={handleBulkGenerate}
										disabled={isGeneratingPeriods}
										className="h-10 rounded-md bg-orange-600 text-white hover:bg-orange-700 md:col-span-2">
										{isGeneratingPeriods ? "Generating..." : "Generate Periods"}
									</Button>
								</div>
							</details>

							{adjustmentPreviewRows.length > 0 ? (
								<details className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
									<summary className="flex cursor-pointer list-none items-center justify-between gap-3">
										<p className="text-sm font-semibold text-gray-900">
											Bulk Adjust Existing Periods
										</p>
										<span className="text-xs font-medium text-orange-600">
											{adjustmentPreviewRows.length} preview row(s)
										</span>
									</summary>
									<div className="mt-3 border-t border-gray-100 pt-3">
										<div className="space-y-5">
											<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
												<div className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
													{serverSemiMonthlySnapshot}
												</div>
											</div>

											<div className="grid gap-3 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
												<div className="space-y-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
													<div className="space-y-2">
														<label className="text-xs font-medium text-gray-600">
															Frequency
														</label>
														<Select
															value={adjustmentForm.frequency}
															onValueChange={(value) => {
																hasEditedAdjustmentFrequency.current =
																	true;
																setAdjustmentForm((prev) => ({
																	...prev,
																	frequency: value,
																}));
															}}>
															<SelectTrigger className="h-10 w-full rounded-md border-gray-200 bg-white text-sm">
																<SelectValue placeholder="Frequency" />
															</SelectTrigger>
															<SelectContent>
																{PAY_FREQUENCIES.map(
																	(frequency) => (
																		<SelectItem
																			key={frequency}
																			value={frequency}>
																			{frequency.replace(
																				/_/g,
																				" ",
																			)}
																		</SelectItem>
																	),
																)}
															</SelectContent>
														</Select>
													</div>

													<div className="space-y-3 rounded-md border border-gray-200 bg-white p-3">
														<div className="flex items-center justify-between gap-3">
															<p className="text-sm font-medium text-gray-900">
																Force Retroactive
															</p>
															<Switch
																checked={
																	adjustmentForm.forceRetroactive
																}
																onCheckedChange={(checked) =>
																	setAdjustmentForm((prev) => ({
																		...prev,
																		forceRetroactive: checked,
																	}))
																}
																className="data-[state=checked]:bg-orange-600"
															/>
														</div>
														<div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
															<p className="text-sm font-medium text-gray-900">
																Preview Only
															</p>
															<Switch
																checked={adjustmentForm.dryRun}
																onCheckedChange={(checked) =>
																	setAdjustmentForm((prev) => ({
																		...prev,
																		dryRun: checked,
																	}))
																}
																className="data-[state=checked]:bg-orange-600"
															/>
														</div>
													</div>

													<Button
														type="button"
														onClick={handleBulkAdjust}
														disabled={
															isAdjustingPeriods ||
															isSyncingCycleConfigForAdjust
														}
														className="h-10 w-full rounded-md bg-orange-600 text-white hover:bg-orange-700">
														{isSyncingCycleConfigForAdjust
															? "Syncing config..."
															: isAdjustingPeriods
																? adjustmentForm.dryRun
																	? "Previewing..."
																	: "Applying..."
																: adjustmentForm.dryRun
																	? "Preview Adjustments"
																	: "Apply Adjustments"}
													</Button>

													{bulkAdjustResultMessage && (
														<div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
															{bulkAdjustResultMessage}
														</div>
													)}
												</div>

												<div className="space-y-4">
													<div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
														<div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
															<p className="text-sm font-semibold text-gray-900">
																Adjustment Preview
															</p>
															<div className="text-xs text-gray-500">
																{adjustmentPreviewRows.length}{" "}
																period(s)
															</div>
														</div>
														<div className="mt-3 overflow-x-auto">
															<table className="min-w-full text-[11px] sm:text-xs">
																<thead className="text-gray-600">
																	<tr className="border-b border-gray-200">
																		<th className="py-2 pr-4 text-left font-semibold">
																			Period
																		</th>
																		<th className="py-2 pr-4 text-left font-semibold">
																			Current Range
																		</th>
																		<th className="py-2 pr-4 text-left font-semibold">
																			Projected Range
																		</th>
																		<th className="py-2 pr-4 text-left font-semibold">
																			Current Pay Date
																		</th>
																		<th className="py-2 text-left font-semibold">
																			Projected Pay Date
																		</th>
																	</tr>
																</thead>
																<tbody>
																	{adjustmentPreviewRows.map(
																		(row) => (
																			<tr
																				key={row.id}
																				className="border-b border-gray-100">
																				<td className="py-2 pr-4 font-medium text-gray-800">
																					{row.name}
																				</td>
																				<td className="py-2 pr-4 text-gray-700">
																					{
																						row.currentRange
																					}
																				</td>
																				<td className="py-2 pr-4 font-medium text-orange-700">
																					{
																						row.projectedRange
																					}
																				</td>
																				<td className="py-2 pr-4 text-gray-700">
																					{
																						row.currentPayDate
																					}
																				</td>
																				<td className="py-2 font-medium text-orange-700">
																					{
																						row.projectedPayDate
																					}
																				</td>
																			</tr>
																		),
																	)}
																</tbody>
															</table>
														</div>
													</div>
												</div>
											</div>
										</div>
									</div>
								</details>
							) : null}
						</div>
					</div>
				)}
					</div>
				</form>
			</div>
		</>
	);

	if (showHeader) {
		return (
			<RulesPoliciesShell title="Payroll Settings" actions={payrollActions}>
				{content}
			</RulesPoliciesShell>
		);
	}

	return <div className="w-full space-y-3 p-0">{content}</div>;
}

export default function PayrollSettingsPage() {
	return <PayrollSettingsModule />;
}
