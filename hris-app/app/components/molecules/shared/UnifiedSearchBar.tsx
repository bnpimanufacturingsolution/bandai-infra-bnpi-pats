import { Input } from "~/components/atoms/Input";
import { Button } from "~/components/atoms/Button";
import { Search, Filter, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface UnifiedSearchBarProps {
	placeholder?: string;
	onSearch?: (query: string) => void;
	onFilter?: () => void;
	showFilter?: boolean;
	className?: string;
	value?: string;
	onChange?: (value: string) => void;
	debounceMs?: number;
	showClearButton?: boolean;
	variant?: "default" | "compact" | "full-width";
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
}

export function UnifiedSearchBar({
	placeholder = "Search...",
	onSearch,
	onFilter,
	showFilter = true,
	className = "",
	value: controlledValue,
	onChange,
	debounceMs = 300,
	showClearButton = true,
	variant = "default",
	size = "md",
	disabled = false,
}: UnifiedSearchBarProps) {
	const [internalValue, setInternalValue] = useState(controlledValue || "");
	const [debouncedValue, setDebouncedValue] = useState(controlledValue || "");

	// Use controlled value if provided, otherwise use internal state
	const currentValue = controlledValue !== undefined ? controlledValue : internalValue;

	// Debounce the search value
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedValue(currentValue);
		}, debounceMs);

		return () => clearTimeout(timer);
	}, [currentValue, debounceMs]);

	// Trigger search when debounced value changes
	useEffect(() => {
		if (onSearch && debouncedValue !== (controlledValue || "")) {
			onSearch(debouncedValue);
		}
	}, [debouncedValue, onSearch, controlledValue]);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newValue = e.target.value;

			if (onChange) {
				onChange(newValue);
			} else {
				setInternalValue(newValue);
			}
		},
		[onChange],
	);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (onSearch) {
				onSearch(currentValue);
			}
		},
		[onSearch, currentValue],
	);

	const handleClear = useCallback(() => {
		if (onChange) {
			onChange("");
		} else {
			setInternalValue("");
		}
		if (onSearch) {
			onSearch("");
		}
	}, [onChange, onSearch]);

	// Size configurations
	const sizeConfig = {
		sm: {
			input: "h-8 text-sm",
			icon: "h-3 w-3",
			button: "h-8 px-2 text-xs",
			clearButton: "h-6 w-6",
			buttonSize: "sm" as const,
		},
		md: {
			input: "h-9 text-sm",
			icon: "h-4 w-4",
			button: "h-9 px-3 text-sm",
			clearButton: "h-7 w-7",
			buttonSize: "default" as const,
		},
		lg: {
			input: "h-10 text-base",
			icon: "h-5 w-5",
			button: "h-10 px-4 text-base",
			clearButton: "h-8 w-8",
			buttonSize: "lg" as const,
		},
	};

	// Variant configurations
	const variantConfig = {
		default: "w-64",
		compact: "w-48",
		"full-width": "w-full",
	};

	const config = sizeConfig[size];
	const widthClass = variantConfig[variant];

	return (
		<form onSubmit={handleSubmit} className={`flex items-center gap-2 ${className}`}>
			<div className={`relative ${widthClass}`}>
				<Search
					className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${config.icon} text-gray-400 pointer-events-none`}
				/>
				<Input
					type="text"
					placeholder={placeholder}
					value={currentValue}
					onChange={handleInputChange}
					disabled={disabled}
					className={`${config.input} pl-10 ${showClearButton && currentValue ? "pr-10" : "pr-4"} ${widthClass}`}
				/>
				{showClearButton && currentValue && (
					<button
						type="button"
						onClick={handleClear}
						className={`absolute right-2 top-1/2 transform -translate-y-1/2 ${config.clearButton} text-gray-400 hover:text-gray-600 transition-colors`}
						disabled={disabled}>
						<X className="h-3 w-3" />
					</button>
				)}
			</div>

			{variant !== "compact" && (
				<Button
					type="submit"
					size={config.buttonSize}
					disabled={disabled}
					className={config.button}>
					Search
				</Button>
			)}

			{showFilter && onFilter && (
				<Button
					type="button"
					variant="outline"
					size={config.buttonSize}
					onClick={onFilter}
					disabled={disabled}
					className={config.button}>
					<Filter className={`${config.icon} mr-1`} />
					Filter
				</Button>
			)}
		</form>
	);
}

// Export a simplified version for common use cases
export function SimpleSearchBar({
	placeholder = "Search...",
	onSearch,
	className = "",
	value,
	onChange,
	...props
}: Omit<UnifiedSearchBarProps, "showFilter" | "onFilter">) {
	return (
		<UnifiedSearchBar
			placeholder={placeholder}
			onSearch={onSearch}
			className={className}
			value={value}
			onChange={onChange}
			showFilter={false}
			variant="compact"
			{...props}
		/>
	);
}
