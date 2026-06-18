import {
	BANDAI_DIRECT_ANNUAL_WORK_DAYS,
	BANDAI_SOURCE_DAILY_RATE_MAX,
	BANDAI_WORKING_HOURS_PER_DAY,
	resolveBandaiApprovedBucketRateBasis,
} from "../helper/payroll-period.helper";
import { roundToCentavo } from "../helper/tax-calculator.helper";

type Scenario = {
	name: string;
	periodBasic: number;
	sourceRegularDays: number;
	periodNumber: 1 | 2;
	regOtHrs: number;
	rdHrs: number;
	rdOtHrs: number;
	spclHrs: number;
	spclOtHrs: number;
	rholHrs: number;
	rholOtHrs: number;
	regNdHrs: number;
	expectedMethod: "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS" | "BNPI_DIRECT_313_APPROVED_BUCKETS";
};

const scenarios: Scenario[] = [
	{
		name: "source daily rate accepted for operator-like cutoff",
		periodBasic: 6500,
		sourceRegularDays: 13,
		periodNumber: 1,
		regOtHrs: 8,
		rdHrs: 0,
		rdOtHrs: 0,
		spclHrs: 0,
		spclOtHrs: 0,
		rholHrs: 0,
		rholOtHrs: 0,
		regNdHrs: 4,
		expectedMethod: "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS",
	},
	{
		name: "source daily rate too high falls back to BNPI 313",
		periodBasic: 30000,
		sourceRegularDays: 13,
		periodNumber: 1,
		regOtHrs: 10,
		rdHrs: 8,
		rdOtHrs: 2,
		spclHrs: 0,
		spclOtHrs: 0,
		rholHrs: 0,
		rholOtHrs: 0,
		regNdHrs: 0,
		expectedMethod: "BNPI_DIRECT_313_APPROVED_BUCKETS",
	},
	{
		name: "zero source days uses BNPI 313",
		periodBasic: 18000,
		sourceRegularDays: 0,
		periodNumber: 2,
		regOtHrs: 0,
		rdHrs: 0,
		rdOtHrs: 0,
		spclHrs: 4,
		spclOtHrs: 2,
		rholHrs: 8,
		rholOtHrs: 1,
		regNdHrs: 6,
		expectedMethod: "BNPI_DIRECT_313_APPROVED_BUCKETS",
	},
	{
		name: "boundary source rate exactly at max is accepted",
		periodBasic: BANDAI_SOURCE_DAILY_RATE_MAX * 10,
		sourceRegularDays: 10,
		periodNumber: 2,
		regOtHrs: 1,
		rdHrs: 1,
		rdOtHrs: 1,
		spclHrs: 1,
		spclOtHrs: 1,
		rholHrs: 1,
		rholOtHrs: 1,
		regNdHrs: 1,
		expectedMethod: "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS",
	},
];

function money(value: number) {
	return `PHP ${value.toLocaleString("en-PH", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function assertClose(label: string, actual: number, expected: number) {
	const delta = roundToCentavo(actual - expected);
	if (Math.abs(delta) > 0.01) {
		throw new Error(`${label} mismatch: actual ${money(actual)}, expected ${money(expected)}, delta ${money(delta)}`);
	}
}

function contributionSplit(periodNumber: 1 | 2) {
	return periodNumber === 1 ? 1 : 0;
}

function runScenario(scenario: Scenario) {
	const basis = resolveBandaiApprovedBucketRateBasis(scenario);
	if (basis.method !== scenario.expectedMethod) {
		throw new Error(`${scenario.name}: expected ${scenario.expectedMethod}, got ${basis.method}`);
	}

	const expectedDaily =
		scenario.expectedMethod === "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS"
			? scenario.periodBasic / scenario.sourceRegularDays
			: (scenario.periodBasic * 24) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
	const expectedHourly = expectedDaily / BANDAI_WORKING_HOURS_PER_DAY;
	assertClose(`${scenario.name} daily rate`, basis.dailyRate, roundToCentavo(expectedDaily));
	assertClose(`${scenario.name} hourly rate`, basis.hourlyRate, roundToCentavo(expectedHourly));

	const specialHolidayWorkMultiplier =
		basis.method === "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS" ? 1.3 : 0.3;
	const regularOt = roundToCentavo(scenario.regOtHrs * expectedHourly * 1.25);
	const restDay = roundToCentavo(scenario.rdHrs * expectedHourly * 1.3);
	const restDayOt = roundToCentavo(scenario.rdOtHrs * expectedHourly * 1.69);
	const specialHoliday = roundToCentavo(
		scenario.spclHrs * expectedHourly * specialHolidayWorkMultiplier +
			scenario.spclOtHrs * expectedHourly * 1.69,
	);
	const legalHoliday = roundToCentavo(
		scenario.rholHrs * expectedHourly * 1 + scenario.rholOtHrs * expectedHourly * 2.6,
	);
	const nightDiff = roundToCentavo(scenario.regNdHrs * expectedHourly * 0.1);

	return {
		scenario: scenario.name,
		method: basis.method,
		periodNumber: scenario.periodNumber,
		contributionSplitFactor: contributionSplit(scenario.periodNumber),
		sourceDailyRate: basis.sourceDailyRate,
		dailyRate: basis.dailyRate,
		hourlyRate: basis.hourlyRate,
		premiums: {
			regularOt,
			restDay,
			restDayOt,
			specialHoliday,
			legalHoliday,
			nightDiff,
		},
	};
}

function main() {
	const results = scenarios.map(runScenario);
	console.log("BNPI payroll rate-basis regression");
	console.log(`Annual divisor: ${BANDAI_DIRECT_ANNUAL_WORK_DAYS}`);
	console.log(`Source daily-rate max: ${money(BANDAI_SOURCE_DAILY_RATE_MAX)}`);
	for (const result of results) {
		console.log(
			[
				`OK ${result.scenario}`,
				`method=${result.method}`,
				`period=${result.periodNumber}`,
				`split=${result.contributionSplitFactor}`,
				`sourceDaily=${money(result.sourceDailyRate)}`,
				`daily=${money(result.dailyRate)}`,
				`hourly=${money(result.hourlyRate)}`,
				`regOT=${money(result.premiums.regularOt)}`,
				`holiday/rest=${money(
					result.premiums.restDay +
						result.premiums.restDayOt +
						result.premiums.specialHoliday +
						result.premiums.legalHoliday,
				)}`,
				`ND=${money(result.premiums.nightDiff)}`,
			].join(" | "),
		);
	}
}

main();
