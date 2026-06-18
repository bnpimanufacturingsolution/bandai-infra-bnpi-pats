import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterCheckbox } from "../molecules/filter-checkbox";

export interface JobFilters {
	datePosted: string;
	jobTypes: {
		fullTime: boolean;
		partTime: boolean;
		contractual: boolean;
		freelance: boolean;
		internship: boolean;
		volunteer: boolean;
		[key: string]: boolean;
	};
	locationPreferences: {
		remote: boolean;
		onsite: boolean;
		hybrid: boolean;
	};
	salaryRange: [number, number];
}

interface FiltersSidebarProps {
	filters: JobFilters;
	onFiltersChange: (filters: JobFilters) => void;
}

const datePostedOptions = [
	{ value: "anytime", label: "Anytime" },
	{ value: "24hours", label: "Past 24 hours" },
	{ value: "week", label: "Past week" },
	{ value: "month", label: "Past month" },
];

const jobTypeOptions = [
	{ value: "fullTime", label: "Full-time" },
	{ value: "partTime", label: "Part-time" },
	{ value: "contractual", label: "Contractual" },
	{ value: "freelance", label: "Freelance" },
	{ value: "internship", label: "Internship" },
	{ value: "volunteer", label: "Volunteer" },
];

const locationOptions = [
	{ value: "remote", label: "Remote" },
	{ value: "onsite", label: "On-site" },
	{ value: "hybrid", label: "Hybrid" },
];

export function FiltersSidebar({ filters, onFiltersChange }: FiltersSidebarProps) {
	const handleDatePostedChange = (value: string) => {
		onFiltersChange({
			...filters,
			datePosted: value,
		});
	};

	const handleJobTypeChange = (type: keyof JobFilters["jobTypes"], checked: boolean) => {
		onFiltersChange({
			...filters,
			jobTypes: {
				...filters.jobTypes,
				[type]: checked,
			},
		});
	};

	const handleLocationChange = (
		location: keyof JobFilters["locationPreferences"],
		checked: boolean,
	) => {
		onFiltersChange({
			...filters,
			locationPreferences: {
				...filters.locationPreferences,
				[location]: checked,
			},
		});
	};

	const handleClearAll = () => {
		onFiltersChange({
			datePosted: "anytime",
			jobTypes: {
				fullTime: false,
				partTime: false,
				contractual: false,
				freelance: false,
				internship: false,
				volunteer: false,
			},
			locationPreferences: {
				remote: false,
				onsite: false,
				hybrid: false,
			},
			salaryRange: [0, 1000000],
		});
	};

	return (
		<Card className="sticky top-24 space-y-6 rounded-lg border-[#e8dede] bg-white p-5 shadow-sm">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold text-neutral-900">Refine openings</h3>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 text-[var(--theme-red)] hover:bg-red-50 hover:text-[var(--theme-red)]"
					onClick={handleClearAll}>
					Clear all
				</Button>
			</div>

			<div className="space-y-4">
				<h4 className="text-sm font-medium text-neutral-800">Date posted</h4>
				<div className="grid gap-2">
					{datePostedOptions.map((option) => (
						<Button
							key={option.value}
							type="button"
							variant={filters.datePosted === option.value ? "default" : "outline"}
							className={
								filters.datePosted === option.value
									? "h-9 justify-start rounded-md bg-[var(--theme-red)] text-white hover:bg-[#a60009]"
									: "h-9 justify-start rounded-md border-[#e8dede] bg-white text-neutral-700 hover:bg-[#fbf8f5]"
							}
							onClick={() => handleDatePostedChange(option.value)}>
							{option.label}
						</Button>
					))}
				</div>
			</div>

			<div className="space-y-4">
				<h4 className="text-sm font-medium text-neutral-800">Employment type</h4>
				<div className="space-y-3">
					{jobTypeOptions.map((option) => (
						<FilterCheckbox
							key={option.value}
							id={`job-type-${option.value}`}
							label={option.label}
							checked={Boolean(filters.jobTypes[option.value])}
							onCheckedChange={(checked) =>
								handleJobTypeChange(option.value, checked)
							}
						/>
					))}
				</div>
			</div>

			<div className="space-y-4">
				<h4 className="text-sm font-medium text-neutral-800">Work setup</h4>
				<div className="space-y-3">
					<FilterCheckbox
						id="remote"
						label="Remote"
						checked={filters.locationPreferences.remote}
						onCheckedChange={(checked) => handleLocationChange("remote", checked)}
					/>
					<FilterCheckbox
						id="onsite"
						label="On-site"
						checked={filters.locationPreferences.onsite}
						onCheckedChange={(checked) => handleLocationChange("onsite", checked)}
					/>
					<FilterCheckbox
						id="hybrid"
						label="Hybrid"
						checked={filters.locationPreferences.hybrid}
						onCheckedChange={(checked) => handleLocationChange("hybrid", checked)}
					/>
				</div>
			</div>
		</Card>
	);
}
