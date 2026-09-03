// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoricalText, formatCategoricalTextLabel } from "./CategoricalText";

describe("CategoricalText", () => {
	it("renders semibold inline text with a semantic dot", () => {
		render(<CategoricalText value="ACTIVE" />);

		const label = screen.getByText("Active");
		expect(label).toHaveClass("inline-flex", "items-center", "gap-1.5", "text-sm", "font-semibold");
		expect(label.querySelector("[aria-hidden='true']")).toHaveClass("h-2", "w-2", "rounded-full");
	});

	it("applies tone classes to text and dot", () => {
		render(<CategoricalText value="Cancelled" tone="red" />);

		const label = screen.getByText("Cancelled");
		expect(label).toHaveClass("text-red-700");
		expect(label.querySelector("[aria-hidden='true']")).toHaveClass("bg-red-500");
	});

	it("formats enum-like labels", () => {
		expect(formatCategoricalTextLabel("SALARY_LOAN")).toBe("Salary Loan");
		expect(formatCategoricalTextLabel("CURRENT_STATE")).toBe("Current State");
		expect(formatCategoricalTextLabel("ACTIVE")).toBe("Active");
	});

	it("falls back to neutral styling for unknown values", () => {
		render(<CategoricalText value="Unknown Flag" />);

		const label = screen.getByText("Unknown Flag");
		expect(label).toHaveClass("text-gray-600");
		expect(label.querySelector("[aria-hidden='true']")).toHaveClass("bg-gray-400");
	});
});
