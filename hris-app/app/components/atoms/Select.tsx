import React, { useId, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Check } from "lucide-react";

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
	/** Optional leading visual (status dot, icon) shown in trigger and menu. */
	leading?: React.ReactNode;
}

export interface SelectProps {
	options: SelectOption[];
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
	error?: boolean;
	name?: string;
	required?: boolean;
	dropdownPosition?: "bottom" | "right";
	dropdownClassName?: string;
}

type DropdownPosition = {
	left: number;
	top: number;
	minWidth: number;
	maxHeight: number;
};

export const Select: React.FC<SelectProps> = ({
	options,
	value,
	onChange,
	placeholder = "Select an option",
	disabled = false,
	className = "",
	error = false,
	name,
	required = false,
	dropdownClassName = "",
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedOption, setSelectedOption] = useState<SelectOption | null>(null);
	const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
	const selectRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const listboxId = useId();

	const updateDropdownPosition = useCallback(() => {
		if (!selectRef.current || typeof window === "undefined") return;

		const rect = selectRef.current.getBoundingClientRect();
		const viewportPadding = 8;
		const gap = 4;
		const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
		const spaceAbove = rect.top - viewportPadding;
		const estimatedOptionHeight = className.includes("h-7") ? 30 : 36;
		const estimatedDropdownHeight = Math.min(
			240,
			Math.max(estimatedOptionHeight, options.length * estimatedOptionHeight),
		);
		const shouldOpenUp = spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow;
		const availableHeight = Math.max(
			96,
			Math.min(240, shouldOpenUp ? spaceAbove - gap : spaceBelow - gap),
		);
		const renderedHeight = Math.min(estimatedDropdownHeight, availableHeight);

		setDropdownPosition({
			left: Math.max(
				viewportPadding,
				Math.min(rect.left, window.innerWidth - rect.width - viewportPadding),
			),
			top: shouldOpenUp
				? Math.max(viewportPadding, rect.top - renderedHeight - gap)
				: Math.min(window.innerHeight - viewportPadding, rect.bottom + gap),
			minWidth: rect.width,
			maxHeight: availableHeight,
		});
	}, [className, options.length]);

	const handleSelect = useCallback(
		(option: SelectOption) => {
			if (option.disabled) return;

			setSelectedOption(option);
			onChange?.(option.value);
			setIsOpen(false);
		},
		[onChange],
	);

	// Find selected option based on value prop
	useEffect(() => {
		const option = options.find((opt) => opt.value === value);
		setSelectedOption(option || null);
	}, [value, options]);

	// Close dropdown when clicking outside (pointerdown so we beat label/focus races).
	// Ignore the same interaction that opened the menu.
	const ignoreOutsideUntilRef = useRef(0);
	useEffect(() => {
		if (!isOpen) return;

		const handlePointerOutside = (event: Event) => {
			if (Date.now() < ignoreOutsideUntilRef.current) return;
			const target = event.target as Node | null;
			if (!target) return;
			if (selectRef.current?.contains(target) || listRef.current?.contains(target)) {
				return;
			}
			setIsOpen(false);
		};

		// Defer attach so the opening click cannot immediately close.
		const timer = window.setTimeout(() => {
			document.addEventListener("pointerdown", handlePointerOutside, true);
		}, 0);

		return () => {
			window.clearTimeout(timer);
			document.removeEventListener("pointerdown", handlePointerOutside, true);
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;

		updateDropdownPosition();
		window.addEventListener("resize", updateDropdownPosition);
		window.addEventListener("scroll", updateDropdownPosition, true);

		return () => {
			window.removeEventListener("resize", updateDropdownPosition);
			window.removeEventListener("scroll", updateDropdownPosition, true);
		};
	}, [isOpen, updateDropdownPosition]);

	// Handle keyboard navigation
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!isOpen) return;

			const currentIndex = options.findIndex((opt) => opt.value === value);
			let newIndex = currentIndex;

			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					newIndex = Math.min(currentIndex + 1, options.length - 1);
					break;
				case "ArrowUp":
					event.preventDefault();
					newIndex = Math.max(currentIndex - 1, 0);
					break;
				case "Enter":
					event.preventDefault();
					if (currentIndex >= 0) {
						handleSelect(options[currentIndex]);
					}
					break;
				case "Escape":
					event.preventDefault();
					setIsOpen(false);
					break;
			}

			if (newIndex !== currentIndex && options[newIndex]) {
				onChange?.(options[newIndex].value);
			}
		};

		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown);
		}

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, options, value, onChange, handleSelect]);

	const toggleDropdown = () => {
		if (disabled) return;
		if (!isOpen) {
			// Suppress outside-close for the opening gesture (label re-click, portal mount).
			ignoreOutsideUntilRef.current = Date.now() + 250;
			updateDropdownPosition();
		}
		setIsOpen((current) => !current);
	};

	// Extract height and text size from className, or use defaults
	const hasCustomHeight = className.includes("h-");
	const hasCustomTextSize = className.includes("text-");
	const defaultHeight = hasCustomHeight ? "" : "h-10";
	const defaultTextSize = hasCustomTextSize ? "" : "text-sm";
	const defaultPadding = className.includes("h-7") ? "px-2 py-1" : "px-3 py-2";

	const baseClasses = `
		relative w-full
		${className}
	`;

	const triggerClasses = `
		flex items-center justify-between
		${defaultHeight} w-full
		${defaultPadding}
		bg-white
		border rounded-md
		${defaultTextSize}
		cursor-pointer
		transition-all duration-200
		${
			error
				? isOpen
					? "border-red-500 ring-1 ring-red-500 bg-red-50/30"
					: "border-red-300 ring-1 ring-red-500/15"
				: isOpen
					? "border-blue-500 ring-1 ring-blue-500"
					: "border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
		}
		${disabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "hover:border-gray-400"}
	`;

	const dropdownClasses = `
		fixed z-[20000] pointer-events-auto
		bg-white border border-gray-300 rounded-md
		shadow-lg
		overflow-auto
		${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}
		transition-all duration-200
		${dropdownClassName}
	`;

	const optionPadding = className.includes("h-7") ? "px-2 py-1.5" : "px-3 py-2";
	const optionTextSize = className.includes("text-xs") ? "text-xs" : "text-sm";

	const optionClasses = (option: SelectOption, isSelected: boolean) => `
		${optionPadding} ${optionTextSize} cursor-pointer
		transition-colors duration-150
		${
			option.disabled
				? "text-gray-400 cursor-not-allowed bg-gray-50"
				: "text-gray-900 hover:bg-gray-100"
		}
		${isSelected ? "bg-blue-50 text-blue-900" : ""}
		flex items-center justify-between
	`;

	const dropdownList =
		isOpen && dropdownPosition && typeof document !== "undefined"
			? createPortal(
					<div
						ref={listRef}
						className={dropdownClasses}
						role="listbox"
						id={listboxId}
						style={{
							left: dropdownPosition.left,
							top: dropdownPosition.top,
							minWidth: dropdownPosition.minWidth,
							maxHeight: dropdownPosition.maxHeight,
						}}>
						{options.map((option) => {
							const isSelected = option.value === value;
							return (
								<div
									key={option.value}
									className={optionClasses(option, isSelected)}
									onClick={() => handleSelect(option)}
									role="option"
									tabIndex={option.disabled ? -1 : 0}
									aria-selected={isSelected}
									aria-disabled={option.disabled || undefined}
									onKeyDown={(event) => {
										if (option.disabled) return;
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											handleSelect(option);
										}
									}}>
									<span className="flex min-w-0 items-center gap-2">
										{option.leading ? (
											<span className="inline-flex shrink-0 items-center" aria-hidden="true">
												{option.leading}
											</span>
										) : null}
										<span className="truncate">{option.label}</span>
									</span>
									{isSelected && (
										<Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
									)}
								</div>
							);
						})}
					</div>,
					document.body,
				)
			: null;

	return (
		<div ref={selectRef} className={baseClasses}>
			{/* Hidden input for form integration */}
			{name && <input type="hidden" name={name} value={value || ""} required={required} />}

			{/* Select Trigger */}
			<div
				className={triggerClasses}
				onClick={(event) => {
					// Stop label ancestors from re-dispatching this click.
					event.preventDefault();
					event.stopPropagation();
					toggleDropdown();
				}}
				onMouseDown={(event) => {
					// Prevent focus/label activation races that close the menu immediately.
					event.stopPropagation();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						toggleDropdown();
					}
				}}
				tabIndex={disabled ? -1 : 0}
				role="combobox"
				aria-controls={listboxId}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
				aria-required={required}
				aria-invalid={error}
				data-select-trigger="true"
				data-field-invalid={error ? "true" : undefined}>
				<span
					className={`flex min-w-0 items-center gap-2 truncate ${
						selectedOption ? "text-gray-900" : "text-gray-500"
					}`}>
					{selectedOption?.leading ? (
						<span className="inline-flex shrink-0 items-center" aria-hidden="true">
							{selectedOption.leading}
						</span>
					) : null}
					<span className="truncate">
						{selectedOption ? selectedOption.label : placeholder}
					</span>
				</span>
				{isOpen ? (
					<ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
				) : (
					<ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
				)}
			</div>

			{dropdownList}
		</div>
	);
};

export default Select;
