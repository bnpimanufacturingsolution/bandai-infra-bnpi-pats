/// <reference types="mocha" />

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	deleteLocalUploadFile,
	resolveLocalUploadPath,
	writeLocalUploadFile,
} from "../helper/local-upload-path.helper";

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

describe("local upload write/delete", () => {
	const previousRoot = process.env.LOCAL_UPLOAD_ROOT;
	let uploadRoot = "";

	beforeEach(() => {
		uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hris-local-upload-"));
		process.env.LOCAL_UPLOAD_ROOT = uploadRoot;
	});

	afterEach(() => {
		if (previousRoot === undefined) {
			delete process.env.LOCAL_UPLOAD_ROOT;
		} else {
			process.env.LOCAL_UPLOAD_ROOT = previousRoot;
		}
		fs.rmSync(uploadRoot, { recursive: true, force: true });
	});

	it("writes a file under the upload root and returns a /uploads URL", async () => {
		const written = await writeLocalUploadFile(
			"applicants/attachments/contract.pdf",
			Buffer.from("%PDF-1.4 test"),
		);

		assert.equal(written.url, "/uploads/applicants/attachments/contract.pdf");
		assert.equal(
			fs.readFileSync(written.absolutePath, "utf8"),
			"%PDF-1.4 test",
		);
	});

	it("deletes a previously written local upload", async () => {
		const written = await writeLocalUploadFile("applicants/attachments/gone.pdf", Buffer.from("x"));
		assert.equal(await deleteLocalUploadFile(written.url), true);
		assert.equal(fs.existsSync(written.absolutePath), false);
	});
});
