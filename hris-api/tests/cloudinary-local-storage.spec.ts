import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	deleteFromCloudinary,
	uploadToCloudinary,
} from "../helper/cloudinary.helper";

describe("STORAGE_PROVIDER=local", () => {
	const previousProvider = process.env.STORAGE_PROVIDER;
	const previousRoot = process.env.LOCAL_UPLOAD_ROOT;
	let uploadRoot = "";

	beforeEach(() => {
		uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hris-cloudinary-local-"));
		process.env.STORAGE_PROVIDER = "local";
		process.env.LOCAL_UPLOAD_ROOT = uploadRoot;
	});

	afterEach(() => {
		if (previousProvider === undefined) {
			delete process.env.STORAGE_PROVIDER;
		} else {
			process.env.STORAGE_PROVIDER = previousProvider;
		}
		if (previousRoot === undefined) {
			delete process.env.LOCAL_UPLOAD_ROOT;
		} else {
			process.env.LOCAL_UPLOAD_ROOT = previousRoot;
		}
		fs.rmSync(uploadRoot, { recursive: true, force: true });
	});

	it("stores applicant contracts on disk instead of Cloudinary", async () => {
		const result = await uploadToCloudinary(Buffer.from("%PDF-1.4 contract"), {
			folder: "applicants/attachments",
			resourceType: "raw",
			publicId: "attachment_applicant1_1.pdf",
		});

		assert.equal(result.success, true);
		assert.equal(
			result.secureUrl,
			"/uploads/applicants/attachments/attachment_applicant1_1.pdf",
		);
		assert.equal(
			fs.readFileSync(
				path.join(
					uploadRoot,
					"applicants",
					"attachments",
					"attachment_applicant1_1.pdf",
				),
				"utf8",
			),
			"%PDF-1.4 contract",
		);
	});

	it("deletes a local object by publicId", async () => {
		const uploaded = await uploadToCloudinary(Buffer.from("bye"), {
			folder: "applicants/attachments",
			publicId: "to-delete.pdf",
		});
		assert.equal(uploaded.success, true);
		assert.equal(await deleteFromCloudinary(uploaded.publicId || ""), true);
		assert.equal(
			fs.existsSync(
				path.join(uploadRoot, "applicants", "attachments", "to-delete.pdf"),
			),
			false,
		);
	});
});
