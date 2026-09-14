// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const routerState = vi.hoisted(() => ({
	navigate: vi.fn(),
}));

vi.mock("react-router", async () => {
	const actual = await vi.importActual<typeof import("react-router")>("react-router");
	return {
		...actual,
		useNavigate: () => routerState.navigate,
	};
});

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: { email: "admin@bandai.local", isLoading: false },
		isLoading: false,
	}),
}));

const apiClientMock = vi.hoisted(() => ({
	post: vi.fn(),
}));

vi.mock("~/lib/api-client", () => ({
	apiClient: apiClientMock,
}));

import ApplicationLauncher from "./application-launcher";

const assignMock = vi.fn();

const LMS_LAUNCH_URL = "http://localhost:5173/auth/bridge?token=lms-jwt&orgCode=bnei";
const EPMR_LAUNCH_URL = "http://localhost:5181/auth/bridge?token=lms-jwt&source=lms&orgCode=bnei";

const successPayload = (launchUrl: string) => ({
	status: "success",
	message: "External launch URL generated successfully",
	data: { launchUrl, app: "lms" },
	code: 200,
	timestamp: "2026-09-07T00:00:00.000Z",
});

const renderLauncher = () =>
	render(
		<MemoryRouter>
			<ApplicationLauncher />
		</MemoryRouter>,
	);

describe("ApplicationLauncher external launch", () => {
	beforeEach(() => {
		Object.defineProperty(window, "location", {
			value: { href: "http://localhost:3000/application-launcher", assign: assignMock },
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("navigates to the returned LMS launch URL after a successful handoff", async () => {
		const user = userEvent.setup();
		apiClientMock.post.mockResolvedValueOnce(successPayload(LMS_LAUNCH_URL));

		renderLauncher();
		await user.click(screen.getByRole("button", { name: /launch lms/i }));

		await waitFor(() => {
			expect(assignMock).toHaveBeenCalledTimes(1);
		});
		expect(assignMock).toHaveBeenCalledWith(LMS_LAUNCH_URL);
		expect(apiClientMock.post).toHaveBeenCalledWith("/auth/external-launch", { app: "lms" });
	});

	it("navigates to the returned EPMR bridge URL after a successful handoff", async () => {
		const user = userEvent.setup();
		apiClientMock.post.mockResolvedValueOnce(successPayload(EPMR_LAUNCH_URL));

		renderLauncher();
		await user.click(screen.getByRole("button", { name: /launch epmr/i }));

		await waitFor(() => {
			expect(assignMock).toHaveBeenCalledTimes(1);
		});
		expect(assignMock).toHaveBeenCalledWith(EPMR_LAUNCH_URL);
		const parsed = new URL(EPMR_LAUNCH_URL);
		expect(parsed.pathname).toBe("/auth/bridge");
		expect(parsed.searchParams.get("source")).toBe("lms");
	});

	it("does not navigate and shows the error UI when the launch API fails", async () => {
		const user = userEvent.setup();
		apiClientMock.post.mockResolvedValueOnce({
			status: "error",
			message: "LMS external-handoff failed: 401",
			code: 401,
		});

		renderLauncher();
		await user.click(screen.getByRole("button", { name: /launch lms/i }));

		await waitFor(() => {
			expect(screen.getByText(/LMS external-handoff failed: 401/i)).toBeInTheDocument();
		});
		expect(assignMock).not.toHaveBeenCalled();
	});

	it("does not navigate when the response succeeds but has no launch URL", async () => {
		const user = userEvent.setup();
		apiClientMock.post.mockResolvedValueOnce({
			status: "success",
			message: "ok",
			data: { app: "lms" },
		});

		renderLauncher();
		await user.click(screen.getByRole("button", { name: /launch lms/i }));

		await waitFor(() => {
			expect(screen.getByText(/Launch URL missing for LMS/i)).toBeInTheDocument();
		});
		expect(assignMock).not.toHaveBeenCalled();
	});

	it("does not navigate when the API call throws", async () => {
		const user = userEvent.setup();
		apiClientMock.post.mockRejectedValueOnce({ message: "Unable to connect to the server" });

		renderLauncher();
		await user.click(screen.getByRole("button", { name: /launch epmr/i }));

		await waitFor(() => {
			expect(screen.getByText(/Unable to connect to the server/i)).toBeInTheDocument();
		});
		expect(assignMock).not.toHaveBeenCalled();
	});

	it("prevents duplicate submissions: both external buttons are disabled while a launch is pending", async () => {
		const user = userEvent.setup();
		let resolveLaunch: (value: unknown) => void = () => {};
		apiClientMock.post.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveLaunch = resolve;
			}),
		);

		renderLauncher();
		const lmsButton = screen.getByRole("button", { name: /launch lms/i });
		const epmrButton = screen.getByRole("button", { name: /launch epmr/i });

		await user.click(lmsButton);

		expect(lmsButton).toBeDisabled();
		expect(epmrButton).toBeDisabled();

		resolveLaunch(successPayload(LMS_LAUNCH_URL));
		await waitFor(() => {
			expect(assignMock).toHaveBeenCalledWith(LMS_LAUNCH_URL);
		});
	});

	it("restores the buttons after a failed launch", async () => {
		const user = userEvent.setup();
		apiClientMock.post.mockResolvedValueOnce({ status: "error", message: "handoff down", code: 502 });

		renderLauncher();
		const lmsButton = screen.getByRole("button", { name: /launch lms/i });
		await user.click(lmsButton);

		await waitFor(() => {
			expect(screen.getByText(/handoff down/i)).toBeInTheDocument();
		});
		expect(screen.getByRole("button", { name: /launch lms/i })).toBeEnabled();
		expect(screen.getByRole("button", { name: /launch epmr/i })).toBeEnabled();
	});
});
