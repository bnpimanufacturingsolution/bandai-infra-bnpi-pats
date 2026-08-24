import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rootTsx = readFileSync(join(process.cwd(), "app", "root.tsx"), "utf8");
const customToast = readFileSync(
	join(process.cwd(), "app", "components", "atoms", "Toast.tsx"),
	"utf8",
);
const design = readFileSync(join(process.cwd(), "..", "DESIGN.md"), "utf8");

describe("toast UX contract", () => {
	it("global sonner Toaster renders no close (X) button", () => {
		expect(rootTsx).to.contain("<Toaster");
		expect(rootTsx).to.contain("richColors");
		expect(rootTsx).to.not.match(/<Toaster[\s\S]{0,200}closeButton/);
	});

	it("custom atoms/Toast renders no manual close (X) button", () => {
		expect(customToast).to.not.contain("<X");
		expect(customToast).to.not.contain("closeButton");
		expect(customToast).to.contain("handleClose"); // auto-dismiss timer stays
	});

	it("documents the no-close-button toast standard in DESIGN.md", () => {
		expect(design).to.match(/Toast[s^\r\n]*no close|no close \(X\) button/i);
	});
});
