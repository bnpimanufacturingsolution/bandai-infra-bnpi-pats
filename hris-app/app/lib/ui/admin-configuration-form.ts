import { useCallback } from "react";
import type { FieldErrors } from "react-hook-form";

export const ADMIN_INVALID_FIELD_CLASS =
	"border-red-300 focus:border-red-500 focus:ring-red-500/20 focus-visible:border-red-500 focus-visible:ring-red-500/20";
const FORM_CONTROL_SELECTOR =
	"input:not([type='hidden']), textarea, select, [role='combobox'], button";

function getFirstErrorPath(errors: FieldErrors<any>, prefix = ""): string | null {
	for (const [key, value] of Object.entries(errors || {})) {
		if (!value) continue;

		const nextPath = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "object" && "message" in value && value.message) {
			return nextPath;
		}

		if (typeof value === "object") {
			const nested = getFirstErrorPath(value as FieldErrors<any>, nextPath);
			if (nested) return nested;
		}
	}

	return null;
}

function findFieldElement(path: string): HTMLElement | null {
	if (typeof document === "undefined") return null;

	const controlSelectors = [
		`[name="${path}"]`,
		`[data-field-name="${path}"]`,
	];
	const fieldWrapperSelectors = [`[data-field-path="${path}"]`];

	for (const selector of controlSelectors) {
		const match = document.querySelector(selector);
		if (match instanceof HTMLElement) return match;
	}

	for (const selector of fieldWrapperSelectors) {
		const match = document.querySelector(selector);
		if (match instanceof HTMLElement) return match;
	}

	return null;
}

function highlightTarget(target: HTMLElement) {
	target.classList.add(
		"ring-2",
		"ring-red-200",
		"ring-offset-1",
		"transition-shadow",
		"shadow-[0_0_0_6px_rgba(248,113,113,0.08)]",
	);
	window.setTimeout(() => {
		target.classList.remove(
			"ring-2",
			"ring-red-200",
			"ring-offset-1",
			"transition-shadow",
			"shadow-[0_0_0_6px_rgba(248,113,113,0.08)]",
		);
	}, 1600);
}

function focusAndScrollToElement(target: HTMLElement) {
	const focusTarget =
		target.matches(FORM_CONTROL_SELECTOR)
			? target
			: (target.querySelector(
					FORM_CONTROL_SELECTOR,
				) as HTMLElement | null);

	const visualTarget = focusTarget || target;
	visualTarget.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
	focusTarget?.focus?.({ preventScroll: true });
	highlightTarget(visualTarget);
}

export function useAdminFormErrorNavigation() {
	return useCallback((errors: FieldErrors<any>) => {
		window.requestAnimationFrame(() => {
			const firstErrorPath = getFirstErrorPath(errors);
			if (firstErrorPath) {
				const field = findFieldElement(firstErrorPath);
				if (field) {
					focusAndScrollToElement(field);
					return;
				}
			}

			const fallback = document.querySelector(
				"[aria-invalid='true'], [data-field-invalid='true']",
			);
			if (fallback instanceof HTMLElement) {
				focusAndScrollToElement(fallback);
			}
		});
	}, []);
}
