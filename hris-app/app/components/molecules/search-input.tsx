import type React from "react";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";
import { Icon } from "../atoms";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	iconName?: string;
}

export function SearchInput({ iconName = "search", className, ...props }: SearchInputProps) {
	return (
		<div className="relative">
			<Icon
				name={iconName}
				className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
				size={20}
			/>
			<Input className={cn("pl-10", className)} {...props} />
		</div>
	);
}
