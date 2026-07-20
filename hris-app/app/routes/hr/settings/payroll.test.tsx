// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollSettingsModule } from "./payroll";

globalThis.ResizeObserver =
	globalThis.ResizeObserver ||
	class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn();

const mockUseCalculator = vi.hoisted(() => vi.fn());
const mockUseUpdateCalculator = vi.hoisted(() => vi.fn());
const mockUsePayrollCycleConfig = vi.hoisted(() => vi.fn());
const mockUseUpdatePayrollCycleConfig = vi.hoisted(() => vi.fn());
const mockUseBulkGeneratePayrollPeriods = vi.hoisted(() => vi.fn());
const mockUseBulkAdjustPayrollPeriods = vi.hoisted(() => vi.fn());
const mockUsePayrollPeriods = vi.hoisted(() => vi.fn());
const mockUpdatePayrollCycleConfig = vi.hoisted(() => vi.fn());
const mockBulkGeneratePeriods = vi.hoisted(() => vi.fn());

vi.mock("~/lib/hooks/useCalculator", () => ({
	useCalculator: () => mockUseCalculator(),
	useUpdateCalculator: () => mockUseUpdateCalculator(),
}));

vi.mock("~/lib/hooks/usePayrollPeriods", () => ({
	usePayrollCycleConfig: () => mockUsePayrollCycleConfig(),
	useUpdatePayrollCycleConfig: () => mockUseUpdatePayrollCycleConfig(),
	useBulkGeneratePayrollPeriods: () => mockUseBulkGeneratePayrollPeriods(),
	useBulkAdjustPayrollPeriods: () => mockUseBulkAdjustPayrollPeriods(),
	usePayrollPeriods: () => mockUsePayrollPeriods(),
}));

describe("PayrollSettingsModule cycle tab", () => {
	beforeEach(() => {
		mockUseCalculator.mockReturnValue({ data: null, isLoading: false });
		mockUseUpdateCalculator.mockReturnValue({ mutate: vi.fn(), isPending: false });
		mockUsePayrollCycleConfig.mockReturnValue({
			data: {
				defaultPayFrequency: "SEMI_MONTHLY",
				payDateOffsetDays: 5,
				businessDayRule: "NEXT_BUSINESS_DAY",
				includeHolidaysInBusinessDayCheck: true,
				cycleRules: {
					SEMI_MONTHLY: { firstStartDay: 1, secondStartDay: 16, secondEndDay: "LAST_DAY" },
				},
			},
			isLoading: false,
			refetch: vi.fn(),
		});
		mockUseUpdatePayrollCycleConfig.mockReturnValue({
			mutate: mockUpdatePayrollCycleConfig,
			isPending: false,
		});
		mockUseBulkGeneratePayrollPeriods.mockReturnValue({
			mutate: mockBulkGeneratePeriods,
			isPending: false,
		});
		mockUseBulkAdjustPayrollPeriods.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});
		mockUsePayrollPeriods.mockReturnValue({ data: { data: [] }, refetch: vi.fn() });
		mockUpdatePayrollCycleConfig.mockReset();
		mockBulkGeneratePeriods.mockReset();
	});

	const renderModule = () =>
		render(
			<MemoryRouter>
				<PayrollSettingsModule mode="settings" />
			</MemoryRouter>,
		);

	it("applies the 5-19 / 20-4 preset and saves the resulting wraparound cutoff", () => {
		renderModule();

		fireEvent.click(screen.getByText("Advanced Cutoff Tools"));
		fireEvent.click(screen.getByRole("button", { name: "5-19 / 20-4" }));
		fireEvent.click(screen.getByRole("button", { name: /Save Changes|Saving/ }));

		expect(mockUpdatePayrollCycleConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				cycleRules: expect.objectContaining({
					SEMI_MONTHLY: { firstStartDay: 5, secondStartDay: 20, secondEndDay: 4 },
				}),
			}),
		);
	});

	it("applies the 10-24 / 25-9 preset and saves the resulting wraparound cutoff", () => {
		renderModule();

		fireEvent.click(screen.getByText("Advanced Cutoff Tools"));
		fireEvent.click(screen.getByRole("button", { name: "10-24 / 25-9" }));
		fireEvent.click(screen.getByRole("button", { name: /Save Changes|Saving/ }));

		expect(mockUpdatePayrollCycleConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				cycleRules: expect.objectContaining({
					SEMI_MONTHLY: { firstStartDay: 10, secondStartDay: 25, secondEndDay: 9 },
				}),
			}),
		);
	});

	it("submits the bulk-generate form with the selected frequency and date range", () => {
		renderModule();

		const bulkGenerateSection = screen.getByText("Bulk Generate Periods").closest("details");
		expect(bulkGenerateSection).not.toBeNull();

		const section = within(bulkGenerateSection as HTMLElement);
		const dateInputs = Array.from(
			bulkGenerateSection!.querySelectorAll('input[type="date"]'),
		) as HTMLInputElement[];
		expect(dateInputs).toHaveLength(2);
		fireEvent.change(dateInputs[0], { target: { value: "2026-02-01" } });
		fireEvent.change(dateInputs[1], { target: { value: "2026-02-28" } });
		fireEvent.click(section.getByRole("button", { name: /Generate Periods|Generating/ }));

		expect(mockBulkGeneratePeriods).toHaveBeenCalledWith(
			expect.objectContaining({
				frequency: "SEMI_MONTHLY",
				rangeStart: "2026-02-01",
				rangeEnd: "2026-02-28",
			}),
		);
	}, 30_000);
});
