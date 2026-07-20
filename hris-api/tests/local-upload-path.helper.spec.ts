/// <reference types="mocha" />

import assert from "node:assert/strict";
import path from "node:path";
import { resolveLocalUploadPath } from "../helper/local-upload-path.helper";

describe("local upload path resolver", () => {
	const previousRoot = process.env.LOCAL_UPLOAD_ROOT;

	afterEach(() => {
		if (previousRoot === undefined) {
			delete process.env.LOCAL_UPLOAD_ROOT;
		} else {
			process.env.LOCAL_UPLOAD_ROOT = previousRoot;
		}
	});

	it("maps relative /uploads URLs to the configured upload root", () => {
		const uploadRoot = path.resolve("tmp-test-uploads");
		process.env.LOCAL_UPLOAD_ROOT = uploadRoot;

		const resolved = resolveLocalUploadPath(
			"/uploads/hris/employees/01360/documents/payslip_01360_period",
		);

		assert.equal(
			resolved,
			path.resolve(uploadRoot, "hris/employees/01360/documents/payslip_01360_period"),
		);
	});

	it("leaves non-local URLs for remote fetch handling", () => {
		process.env.LOCAL_UPLOAD_ROOT = path.resolve("tmp-test-uploads");

		assert.equal(resolveLocalUploadPath("https://files.example/payslip.pdf"), null);
	});

	it("rejects traversal outside the upload root", () => {
		process.env.LOCAL_UPLOAD_ROOT = path.resolve("tmp-test-uploads");

		assert.throws(
			() => resolveLocalUploadPath("/uploads/../secrets/payslip.pdf"),
			/Invalid local upload path/,
		);
	});
});
