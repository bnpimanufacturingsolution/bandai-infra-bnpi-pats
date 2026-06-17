// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { JobList } from "./job-lists";

const mockUseActiveJobs = vi.fn();

vi.mock("~/lib/hooks/use-job", () => ({
	useActiveJobs: (...args: unknown[]) => mockUseActiveJobs(...args),
}));

vi.mock("./job-card", () => ({
	JobCard: ({
		id,
		title,
		onCardClick,
	}: {
		id: string;
		title: string;
		onCardClick?: (id: string) => void;
	}) => (
		<button type="button" onClick={() => onCardClick?.(id)}>
			{title}
		</button>
	),
}));

vi.mock("./job-details-modal", () => ({
	JobDetailsModal: ({
		job,
		isOpen,
		onClose,
	}: {
		job: { title: string };
		isOpen: boolean;
		onClose: () => void;
	}) =>
		isOpen ? (
			<div>
				<p>{job.title}</p>
				<button type="button" onClick={onClose}>
					Close details
				</button>
			</div>
		) : null,
}));

const jobsResponse = {
	jobs: [
		{
			id: "job-1",
			headcountRequested: 2,
			tags: ["QA", "Automation"],
			type: "FULL_TIME",
			description: "Test our internal tools.",
			position: {
				id: "position-1",
				title: "QA Engineer",
				description: "Test our internal tools.",
				minSalary: 30000,
				maxSalary: 50000,
			},
			level: null,
			createdAt: "2026-06-01T00:00:00.000Z",
			location: "REMOTE",
			applicants: [],
			isDeleted: false,
		},
	],
};

function LocationSearch() {
	const location = useLocation();
	return <p data-testid="location-search">{location.search}</p>;
}

describe("JobList", () => {
	it("preserves existing search params when opening the job details modal", () => {
		mockUseActiveJobs.mockReturnValue({
			data: jobsResponse,
			isLoading: false,
		});

		render(
			<MemoryRouter initialEntries={["/jobs?source=career-fair&ref=homepage"]}>
				<Routes>
					<Route
						path="/jobs"
						element={
							<>
								<JobList />
								<LocationSearch />
							</>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: "QA Engineer" }));
		expect(screen.getAllByText("QA Engineer")).toHaveLength(2);
		expect(screen.getByTestId("location-search")).toHaveTextContent(
			"?source=career-fair&ref=homepage&id=job-1",
		);
	}, 15_000);

	it("removes only the job id when closing the job details modal", () => {
		mockUseActiveJobs.mockReturnValue({
			data: jobsResponse,
			isLoading: false,
		});

		render(
			<MemoryRouter initialEntries={["/jobs?source=career-fair&ref=homepage&id=job-1"]}>
				<Routes>
					<Route
						path="/jobs"
						element={
							<>
								<JobList />
								<LocationSearch />
							</>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getAllByText("QA Engineer")).toHaveLength(2);

		fireEvent.click(screen.getByRole("button", { name: "Close details" }));

		expect(screen.getByTestId("location-search")).toHaveTextContent(
			"?source=career-fair&ref=homepage",
		);
		expect(screen.getAllByText("QA Engineer")).toHaveLength(1);
	}, 15_000);
});
