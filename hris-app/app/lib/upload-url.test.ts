import { describe, expect, it } from "vitest";

import { resolveUploadUrl } from "./upload-url";

describe("resolveUploadUrl", () => {
	it("rewrites stale private LAN upload URLs to same-origin paths", () => {
		expect(
			resolveUploadUrl(
				"http://192.168.1.54:3101/uploads/hris/users/user-1/avatar/avatar_user-1.jpg",
			),
		).toBe("/uploads/hris/users/user-1/avatar/avatar_user-1.jpg");
	});

	it("keeps external hosted images unchanged", () => {
		expect(resolveUploadUrl("https://cdn.example.com/avatar.jpg")).toBe(
			"https://cdn.example.com/avatar.jpg",
		);
	});
});
