import { useState } from "react";
import { FiltersSidebar, type JobFilters } from "@/components/organisms/filters-sidebar";
import { JobList } from "../organisms/job-lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BriefcaseBusiness, MapPin, Search, SlidersHorizontal } from "lucide-react";
import careersImage from "~/assets/careers-image.jpg";
import logo from "~/assets/bandai_logo.png";

export function JobListingsTemplate() {
	const [searchQuery, setSearchQuery] = useState("");
	const [locationQuery, setLocationQuery] = useState("");
	const [sortBy, setSortBy] = useState("recent");
	const [jobCount, setJobCount] = useState(0);
	const [filters, setFilters] = useState<JobFilters>({
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

	const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSortBy(event.target.value);
	};

	const handleSearch = () => {
		setSearchQuery(searchQuery.trim());
		setLocationQuery(locationQuery.trim());
	};

	return (
		<div className="min-h-screen bg-[#fbf8f5] text-neutral-900">
			<header className="sticky top-0 z-50 border-b border-[#e8dede] bg-white/95 shadow-sm backdrop-blur">
				<div className="mx-auto max-w-7xl px-4">
					<div className="flex min-h-20 items-center justify-between gap-4">
						<img
							src={logo}
							alt="Bandai Namco"
							className="h-14 w-auto object-contain sm:h-16"
						/>
						<p className="hidden text-sm font-medium text-neutral-500 sm:block">
							Careers portal
						</p>
					</div>
				</div>
			</header>

			<section className="relative flex min-h-[310px] items-center overflow-hidden bg-black px-4 py-10 shadow-sm sm:py-12">
				<div
					className="absolute inset-0 bg-cover bg-no-repeat"
					style={{
						backgroundImage: `url(${careersImage})`,
						backgroundPosition: "70% 30%",
					}}
				/>
				<div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/35" />

				<div className="relative z-10 mx-auto w-full max-w-6xl">
					<div className="mb-7 max-w-3xl">
						<p className="mb-3 text-xs font-semibold uppercase text-white/70">
							Bandai Namco careers
						</p>
						<h1 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-5xl">
							Open roles for builders, operators, and creative teams
						</h1>
						<p className="mt-3 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">
							Review the role level, work setup, and team expectations before applying.
							Every listing below is kept readable for applicants and easy for HR to audit.
						</p>
					</div>

					<div className="grid gap-3 rounded-lg border border-white/15 bg-white/95 p-3 shadow-xl sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
						<div className="space-y-2">
							<label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
								<BriefcaseBusiness className="h-4 w-4 text-[var(--theme-red)]" />
								Role or keyword
							</label>
							<Input
								type="text"
								placeholder="Designer, HR, engineer, analyst"
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								onKeyDown={(event) => event.key === "Enter" && handleSearch()}
								className="h-11 border-[#e8dede] bg-white text-base"
							/>
						</div>

						<div className="space-y-2">
							<label className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
								<MapPin className="h-4 w-4 text-[var(--theme-red)]" />
								Location
							</label>
							<Input
								type="text"
								placeholder="Remote, onsite, hybrid, city"
								value={locationQuery}
								onChange={(event) => setLocationQuery(event.target.value)}
								onKeyDown={(event) => event.key === "Enter" && handleSearch()}
								className="h-11 border-[#e8dede] bg-white text-base"
							/>
						</div>

						<Button
							onClick={handleSearch}
							className="h-11 self-end rounded-md bg-[var(--theme-red)] px-6 font-semibold text-white hover:bg-[#a60009]">
							<Search className="mr-2 h-4 w-4" />
							Search
						</Button>
					</div>
				</div>
			</section>

			<main className="mx-auto max-w-7xl px-4 py-8">
				<div className="grid gap-8 lg:grid-cols-[300px_1fr]">
					<aside className="hidden lg:block">
						<FiltersSidebar filters={filters} onFiltersChange={setFilters} />
					</aside>

					<div>
						<div className="mb-6 flex flex-col gap-3 rounded-lg border border-[#e8dede] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="text-sm font-semibold text-neutral-900">
									Showing{" "}
									<span className="text-lg text-[var(--theme-red)]">
										{jobCount}
									</span>{" "}
									{jobCount === 1 ? "open role" : "open roles"}
								</p>
								<p className="text-xs text-neutral-500">
									Filtered by role, work setup, employment type, and posting date.
								</p>
							</div>
							<div className="flex items-center gap-2">
								<SlidersHorizontal className="h-4 w-4 text-neutral-400" />
								<label className="text-sm font-medium text-neutral-500">
									Sort by:
								</label>
								<select
									className="relative z-20 cursor-pointer rounded-md border border-[#e8dede] bg-white px-3 py-2 text-sm font-medium text-neutral-800 transition-all hover:border-[var(--theme-red)] focus:border-[var(--theme-red)] focus:ring-2 focus:ring-red-100"
									value={sortBy}
									onChange={handleSortChange}>
									<option value="recent">Most Recent</option>
									<option value="title">Role A-Z</option>
								</select>
							</div>
						</div>
						<JobList
							searchQuery={searchQuery}
							locationQuery={locationQuery}
							filters={filters}
							sortBy={sortBy}
							onJobCountChange={setJobCount}
						/>
					</div>
				</div>
			</main>

			<footer className="border-t border-[#e8dede] bg-white">
				<div className="mx-auto max-w-7xl px-4 py-10">
					<div className="flex flex-col items-center space-y-5 text-center">
						<img src={logo} alt="Bandai Namco" className="mx-auto h-16 w-auto" />
						<p className="text-sm text-neutral-500">
							© {new Date().getFullYear()} Bandai Namco Entertainment Inc. All rights
							reserved.
						</p>
					</div>
				</div>
			</footer>
		</div>
	);
}
