/**
 * Chart series colors sourced from the app design tokens in app.css / tokens.css.
 * Use CSS variables so light/dark theme updates stay in sync.
 */
export const DESIGN_SYSTEM_CHART_SERIES_COLORS = [
	"var(--chart-1)",
	"var(--status-in-review)",
	"var(--status-processing)",
	"var(--brand-color-subheading)",
	"var(--status-cancelled)",
	"var(--brand-color-accent)",
	"var(--chart-3)",
	"var(--status-pending)",
] as const;

export const DESIGN_SYSTEM_COMPLIANCE_SUMMARY_COLORS = {
	nonCompliant: "var(--status-rejected)",
	warnings: "var(--status-processing)",
	overall: "var(--status-approved)",
} as const;

export function getDesignSystemChartColor(index: number): string {
	const palette = DESIGN_SYSTEM_CHART_SERIES_COLORS;
	const normalizedIndex =
		((index % palette.length) + palette.length) % palette.length;
	return palette[normalizedIndex];
}

export function getDesignSystemChartColorByKey(key: string): string {
	let hash = 0;
	for (let index = 0; index < key.length; index += 1) {
		hash = (hash + key.charCodeAt(index) * (index + 1)) % DESIGN_SYSTEM_CHART_SERIES_COLORS.length;
	}
	return getDesignSystemChartColor(hash);
}