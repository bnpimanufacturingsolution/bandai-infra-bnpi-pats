// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HikvisionDeviceTimeSyncAllResponse } from "~/services/devices.service";
import { DeviceTimeSyncAllModal } from "./device-time-sync-all-modal";

const mutate = vi.fn();
const reset = vi.fn();

let hookState: {
	data?: HikvisionDeviceTimeSyncAllResponse;
	isPending: boolean;
};

vi.mock("~/lib/hooks/useDevices", () => ({
	useHikvisionDeviceTimeSyncAll: () => ({
		...hookState,
		mutate,
		reset,
	}),
}));

vi.mock("~/components/atoms/Button", () => ({
	Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("~/components/atoms/Badge", () => ({
	Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("~/components/atoms/Modal", () => ({
	Modal: ({ open, children, title }: any) =>
		open ? (
			<div role="dialog" aria-label={title}>
				{children}
			</div>
		) : null,
}));

const DEVICES = [
	{ id: "hk1", name: "Main A", address: "10.184.37.21" },
	{ id: "hk2", name: "Main D", address: "10.184.37.23" },
	{ id: "hk3", name: "Main F", address: "10.184.37.25" },
];

const previewResult: HikvisionDeviceTimeSyncAllResponse = {
	execute: false,
	totalTargets: 3,
	readable: 2,
	written: 0,
	failed: 1,
	results: [
		{
			deviceId: "hk1",
			name: "Main A",
			address: "10.184.37.21",
			ok: true,
			transport: "sdk_stdxml",
			wrote: false,
			before: {
				localTime: "2026-08-24T14:52:23+08:00",
				timeMode: "manual",
				timeZone: "CST-8:00:00",
				skewSeconds: 70,
			},
			after: null,
			plannedWrite: { timeMode: "manual", localTime: "x", timeZone: "CST-8:00:00" },
			error: null,
		},
		{
			deviceId: "hk2",
			name: "Main D",
			address: "10.184.37.23",
			ok: true,
			transport: "sdk_stdxml",
			wrote: false,
			before: {
				localTime: "2026-08-24T14:52:07+08:00",
				timeMode: "manual",
				timeZone: "CST-8:00:00",
				skewSeconds: -3,
			},
			after: null,
			plannedWrite: null,
			error: null,
		},
		{
			deviceId: "hk3",
			name: "Main F",
			address: "10.184.37.25",
			ok: false,
			transport: null,
			wrote: false,
			before: null,
			after: null,
			plannedWrite: null,
			error: "read ECONNRESET",
		},
	],
};

describe("DeviceTimeSyncAllModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hookState = { isPending: false };
	});

	it("auto-runs a preview and shows the reading state first", () => {
		hookState = { isPending: true };
		render(<DeviceTimeSyncAllModal open onClose={vi.fn()} devices={DEVICES} />);

		expect(reset).toHaveBeenCalled();
		expect(mutate).toHaveBeenCalledWith({ execute: false });
		expect(
			screen.getByText("Reading clocks on 3 Hikvision devices…"),
		).toBeTruthy();
	});

	it("shows per-device clock/drift/status in review and offers a scoped write", () => {
		hookState = { isPending: false, data: previewResult };
		render(<DeviceTimeSyncAllModal open onClose={vi.fn()} devices={DEVICES} />);

		expect(screen.getByText("Preview only")).toBeTruthy();
		expect(screen.getByText("Readable 2")).toBeTruthy();
		expect(screen.getByText("Failed 1")).toBeTruthy();
		expect(screen.getByText("Main A")).toBeTruthy();
		expect(screen.getByText("+70s")).toBeTruthy();
		expect(screen.getByText("-3s")).toBeTruthy();
		expect(screen.getAllByText("sdk_stdxml").length).to.equal(2);
		expect(screen.getAllByText(/^Failed$/).length).to.be.at.least(1);

		const update = screen.getByRole("button", { name: /Update 2 clocks/i });
		fireEvent.click(update);
		expect(mutate).toHaveBeenCalledWith({ execute: true });
	});

	it("disables the write when nothing is readable", () => {
		hookState = {
			isPending: false,
			data: { ...previewResult, readable: 0, failed: 3 },
		};
		render(<DeviceTimeSyncAllModal open onClose={vi.fn()} devices={DEVICES} />);

		const update = screen.getByRole("button", { name: /Update 0 clocks/i }) as HTMLButtonElement;
		expect(update.disabled).to.equal(true);
	});

	it("renders post-write results with after-clock and Updated statuses", () => {
		hookState = {
			isPending: false,
			data: {
				...previewResult,
				execute: true,
				written: 2,
				results: previewResult.results.map((row, index) =>
					row.ok
						? {
								...row,
								wrote: true,
								after: {
									localTime: `2026-08-24T15:30:0${index}+08:00`,
									timeMode: "manual",
									timeZone: "CST-8:00:00",
									skewSeconds: -12 + index,
								},
							}
						: row,
				),
			},
		};
		render(<DeviceTimeSyncAllModal open onClose={vi.fn()} devices={DEVICES} />);

		expect(screen.getByText("Written 2")).toBeTruthy();
		const updated = screen.getAllByText("Updated");
		expect(updated.length).to.equal(2);
		expect(screen.getByText("2026-08-24T15:30:00+08:00")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Update/i })).toBeNull();
	});
});
