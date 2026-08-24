import { describe, expect, it } from "vitest";
import {
	getDocumentRequestChangeAfterLabel,
	hasGeneratedDocumentFile,
} from "./document-request-handler";
import type { Request } from "~/services/requests.service";

const request = (metadata: Record<string, unknown>): Request =>
	({
		id: "req-1",
		type: "DOCUMENT_REQUEST",
		currentWorkflowStateKey: "COMPLETED",
		metadata,
	}) as Request;

describe("document request file truth", () => {
	it("does not treat a completed COE as issued when no file exists", () => {
		expect(hasGeneratedDocumentFile(request({ documentStatus: "READY_TO_GENERATE" }))).toBe(
			false,
		);
		expect(
			getDocumentRequestChangeAfterLabel({
				requestState: "COMPLETED",
				documentTypeLabel: "Certificate Of Employment",
				hasGeneratedFile: false,
			}),
		).toBe("Approved — file not generated");
	});

	it("calls the COE issued only after a generated file exists", () => {
		expect(
			hasGeneratedDocumentFile(
				request({ documentNumber: "2026-001", documentUrl: "https://example.test/coe.pdf" }),
			),
		).toBe(true);
		expect(
			getDocumentRequestChangeAfterLabel({
				requestState: "COMPLETED",
				documentTypeLabel: "Certificate Of Employment",
				hasGeneratedFile: true,
			}),
		).toBe("Certificate Of Employment Issued");
	});
});
