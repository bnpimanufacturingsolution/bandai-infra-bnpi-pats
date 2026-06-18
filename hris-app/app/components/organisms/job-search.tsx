import { Button } from "@/components/ui/button";
import { SearchInput } from "../molecules/search-input";

interface JobSearchBarProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
}

export function JobSearchBar({ searchQuery, onSearchChange }: JobSearchBarProps) {
	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onSearchChange(e.target.value);
	};

	return (
		<div className="flex flex-col md:flex-row gap-4">
			<div className="flex-1">
				<SearchInput
					placeholder="Search for jobs"
					iconName="search"
					value={searchQuery}
					onChange={handleSearchChange}
				/>
			</div>
			<div className="flex-1">
				<SearchInput placeholder="Search by location" iconName="mapPin" />
			</div>
			<Button className="bg-accent text-accent-foreground hover:bg-accent/90 md:w-auto">
				Find Jobs
			</Button>
		</div>
	);
}
