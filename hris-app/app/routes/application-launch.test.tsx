// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const apiClientMock = vi.hoisted(() => ({
	post: vi.fn(),
}));

vi.mock("~/lib/api-client", () => ({
	apiClient: apiClientMock,
}));

import ApplicationLaunch from "./application-launch";

const assignMock = vi.fn();

const LMS_LAUNCH_URL = "http://localhost:5173/auth/bridge?token=lms-jwt&orgCode=bnei";
const EPMR_LAUNCH_URL = "http://localhost:5181/auth/bridge?token=epmr-jwt&orgCode=bnei";

const successPayload = (launchUrl: string) => ({
	status: "success",
	data: { launchUrl, app: "lms" },
});

const renderLaunch = (url: string) =>
	render(
		<MemoryRouter initialEntries={[url]}>
			<ApplicationLaunch />
		</MemoryRouter>,
	);

describe("ApplicationLaunch page", () => {
	beforeEach(() => {
		Object.defineProperty(window, "location", {
			value: { href: "http://localhost:3000/application-launch?app=lms", assign: assignMock },
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows the loading state with the display name while bridging", () => {
		apiClientMock.post.mockReturnValueOnce(new Promise(() => {}));
		renderLaunch("/application-launch?app=lms");
		expect(screen.getByText(/opening trainings/i)).toBeInTheDocument();
		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
		expect(apiClientMock.post).toHaveBeenCalledWith("/auth/external-launch", { app: "lms" });
	});

	it("redirects to the LMS launch URL on success", async () => {
		apiClientMock.post.mockResolvedValueOnce(successPayload(LMS_LAUNCH_URL));
		renderLaunch("/application-launch?app=lms");
		await waitFor(() => expect(assignMock).toHaveBeenCalledWith(LMS_LAUNCH_URL));
	});

	it("redirects to the EPMR launch URL on success", async () => {
		apiClientMock.post.mockResolvedValueOnce({
			status: "success",
			data: { launchUrl: EPMR_LAUNCH_URL, app: "epmr" },
		});
		renderLaunch("/application-launch?app=epmr");
		await waitFor(() => expect(assignMock).toHaveBeenCalledWith(EPMR_LAUNCH_URL));
	});

	it("shows a retryable error and does not navigate when the bridge fails", async () => {
		apiClientMock.post.mockResolvedValueOnce({ status: "error", message: "handoff down", code: 502 });
		renderLaunch("/application-launch?app=lms");
		expect(await screen.findByText(/unable to open trainings/i)).toBeInTheDocument();
		expect(assignMock).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
	});

	it("retries the bridge when Try Again is clicked", async () => {
		apiClientMock.post
			.mockResolvedValueOnce({ status: "error", message: "handoff down", code: 502 })
			.mockResolvedValueOnce(successPayload(LMS_LAUNCH_URL));
		const user = userEvent.setup();
		renderLaunch("/application-launch?app=lms");
		await screen.findByText(/unable to open trainings/i);
		await user.click(screen.getByRole("button", { name: /try again/i }));
		await waitFor(() => expect(assignMock).toHaveBeenCalledWith(LMS_LAUNCH_URL));
		expect(apiClientMock.post).toHaveBeenCalledTimes(2);
	});

	it("shows an unavailable state for an unknown app id", () => {
		renderLaunch("/application-launch?app=unknown");
		expect(screen.getByText(/application unavailable/i)).toBeInTheDocument();
		expect(apiClientMock.post).not.toHaveBeenCalled();
	});

	it("shows an unavailable state when no app id is provided", () => {
		renderLaunch("/application-launch");
		expect(screen.getByText(/application unavailable/i)).toBeInTheDocument();
		expect(apiClientMock.post).not.toHaveBeenCalled();
	});
});
