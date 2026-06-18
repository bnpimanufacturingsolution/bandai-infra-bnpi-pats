import { Input } from "~/components/atoms/Input";
import { Button } from "~/components/atoms/Button";
import { Search, Filter } from "lucide-react";
import { useState } from "react";

interface SearchBarProps {
	placeholder?: string;
	onSearch?: (query: string) => void;
	onFilter?: () => void;
	showFilter?: boolean;
	className?: string;
}

export function SearchBar({
	placeholder = "Search...",
	onSearch,
	onFilter,
	showFilter = true,
	className,
}: SearchBarProps) {
	const [query, setQuery] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSearch?.(query);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setQuery(value);
		// Optional: Trigger search on input change for real-time search
		// onSearch?.(value);
	};

	return (
		<form onSubmit={handleSubmit} className={`flex items-center gap-2 ${className || ""}`}>
			<div className="relative flex-1">
				<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
				<Input
					type="text"
					placeholder={placeholder}
					value={query}
					onChange={handleInputChange}
					className="pl-10 pr-4"
				/>
			</div>
			<Button type="submit" size="sm">
				Search
			</Button>
			{showFilter && (
				<Button type="button" variant="outline" size="sm" onClick={onFilter}>
					<Filter className="h-4 w-4 mr-1" />
					Filter
				</Button>
			)}
		</form>
	);
}
