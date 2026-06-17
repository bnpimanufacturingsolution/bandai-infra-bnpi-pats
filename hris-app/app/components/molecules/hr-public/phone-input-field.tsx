import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countryCodes } from "~/lib/config/country-code";

interface PhoneInputFieldProps {
	label: string;
	id: string;
	required?: boolean;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	error?: string | null;
	inputClassName?: string;
	countryTriggerClassName?: string;
}

const phoneFormats: Record<string, string> = {
	US: "(555) 123-4567",
	CA: "(555) 123-4567",
	GB: "7400 123456",
	AU: "412 345 678",
	NZ: "21 123 4567",
	IN: "98765 43210",
	PH: "912 345 6789",
	CN: "131 2345 6789",
	JP: "90-1234-5678",
	KR: "10-1234-5678",
	FR: "6 12 34 56 78",
	DE: "151 23456789",
	IT: "312 345 6789",
	ES: "612 34 56 78",
	BR: "(11) 91234-5678",
	MX: "55 1234 5678",
	AR: "11 2345-6789",
	SG: "8123 4567",
	MY: "12-345 6789",
	TH: "81 234 5678",
	VN: "91 234 5678",
	ID: "812-3456-7890",
	AE: "50 123 4567",
	SA: "50 123 4567",
	ZA: "82 123 4567",
	NG: "802 345 6789",
	KE: "712 345678",
	EG: "100 123 4567",
	RU: "912 345-67-89",
	UA: "50 123 4567",
	PL: "512 345 678",
	TR: "532 123 4567",
	SE: "70-123 45 67",
	NO: "412 34 567",
	DK: "32 12 34 56",
	FI: "41 234 5678",
	NL: "6 12345678",
	BE: "470 12 34 56",
	CH: "78 123 45 67",
	AT: "664 1234567",
	IE: "85 123 4567",
	PT: "912 345 678",
	GR: "691 234 5678",
	CZ: "601 123 456",
	HU: "20 123 4567",
	RO: "712 345 678",
};

const phoneCountryCodes = countryCodes
	.filter((country) => /^\+\d+/.test(country.dial_code))
	.sort((first, second) => second.dial_code.length - first.dial_code.length);

const getPhoneFormat = (countryCode: string): string => {
	return phoneFormats[countryCode] || "123456789";
};

const formatPhoneNumber = (value: string, countryCode: string): string => {
	const digitsOnly = value.replace(/\D/g, "");

	if (!digitsOnly) return "";

	const format = phoneFormats[countryCode];
	if (!format) return digitsOnly;

	let formatted = "";
	let digitIndex = 0;

	for (let index = 0; index < format.length && digitIndex < digitsOnly.length; index += 1) {
		const char = format[index];

		if (/\d/.test(char)) {
			formatted += digitsOnly[digitIndex];
			digitIndex += 1;
			continue;
		}

		formatted += char;
	}

	if (digitIndex < digitsOnly.length) {
		formatted += digitsOnly.substring(digitIndex);
	}

	return formatted;
};

const getFlagEmoji = (countryCode: string): string => {
	if (!countryCode || countryCode.length !== 2) {
		return "GL";
	}

	return countryCode
		.toUpperCase()
		.split("")
		.map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
		.join("");
};

export function PhoneInputField({
	label,
	id,
	required = false,
	value,
	onChange,
	placeholder,
	error,
	inputClassName,
	countryTriggerClassName,
}: PhoneInputFieldProps) {
	const [open, setOpen] = React.useState(false);
	const [selectedCountry, setSelectedCountry] = React.useState(
		phoneCountryCodes.find((country) => country.code === "PH") || phoneCountryCodes[0],
	);
	const [phoneNumber, setPhoneNumber] = React.useState("");
	const [dynamicPlaceholder, setDynamicPlaceholder] = React.useState(
		placeholder || getPhoneFormat(selectedCountry.code),
	);

	React.useEffect(() => {
		setDynamicPlaceholder(placeholder || getPhoneFormat(selectedCountry.code));
	}, [selectedCountry, placeholder]);

	React.useEffect(() => {
		if (!value || !value.startsWith("+")) return;

		const country = phoneCountryCodes.find((candidate) =>
			value.startsWith(candidate.dial_code),
		);
		if (!country) return;

		setSelectedCountry(country);
		setPhoneNumber(value.substring(country.dial_code.length).trim());
	}, [value]);

	const handlePhoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const formatted = formatPhoneNumber(event.target.value, selectedCountry.code);
		setPhoneNumber(formatted);
		onChange(`${selectedCountry.dial_code} ${formatted}`.trim());
	};

	const handleCountrySelect = (country: (typeof countryCodes)[0]) => {
		const reformatted = formatPhoneNumber(phoneNumber, country.code);
		setSelectedCountry(country);
		setPhoneNumber(reformatted);
		onChange(`${country.dial_code} ${reformatted}`.trim());
		setOpen(false);
	};

	return (
		<div className="space-y-1.5">
			<Label htmlFor={id} className="text-[13px] font-medium text-neutral-700">
				{label}
				{required && <span className="text-red-500">*</span>}
			</Label>
			<div className="flex gap-2">
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="outline"
							role="combobox"
							aria-expanded={open}
							className={cn(
								"h-11 w-[118px] shrink-0 justify-between rounded-xl border-0 bg-[#faf6f3] px-3 shadow-none ring-1 ring-[#e8dede]/90 hover:bg-[#f5f0eb]",
								error && "ring-red-300",
								countryTriggerClassName,
							)}>
							<div className="flex items-center gap-1.5">
								<span className="text-xs font-semibold text-neutral-800">
									{selectedCountry.code}
								</span>
								<span className="text-xs font-medium text-neutral-700">
									{selectedCountry.dial_code}
								</span>
							</div>
							<ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[300px] p-0">
						<Command>
							<CommandInput placeholder="Search country..." className="h-9" />
							<CommandList>
								<CommandEmpty>No country found.</CommandEmpty>
								<CommandGroup>
									{phoneCountryCodes.map((country) => (
										<CommandItem
											key={country.code}
											value={`${country.name} ${country.code} ${country.dial_code}`}
											onSelect={() => handleCountrySelect(country)}>
											<div className="flex items-center gap-3">
												<span
													className="flex h-5 w-6 items-center justify-center text-sm"
													aria-hidden="true">
													{getFlagEmoji(country.code)}
												</span>
												<span className="min-w-8 text-xs font-semibold text-neutral-700">
													{country.code}
												</span>
												<span className="flex-1">{country.name}</span>
												<span className="text-sm text-muted-foreground">
													{country.dial_code}
												</span>
											</div>
											<Check
												className={cn(
													"ml-auto",
													selectedCountry.code === country.code
														? "opacity-100"
														: "opacity-0",
												)}
											/>
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
				<Input
					type="tel"
					id={id}
					required={required}
					value={phoneNumber}
					onChange={handlePhoneChange}
					placeholder={dynamicPlaceholder}
					className={cn(
						"h-11 min-w-0 flex-1 rounded-xl border-0 bg-[#faf6f3] shadow-none ring-1 ring-[#e8dede]/90 focus-visible:ring-2 focus-visible:ring-[var(--theme-red)]/30",
						error && "ring-red-300",
						inputClassName,
					)}
				/>
			</div>
			{error && <p className="text-sm text-red-600">{error}</p>}
		</div>
	);
}
