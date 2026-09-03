import { describe, expect, it } from "vitest";
import { CategoricalText } from "./index";

describe("atoms index", () => {
	it("exports the secondary categorical text atom", () => {
		expect(CategoricalText).toBeTypeOf("function");
	});
});
