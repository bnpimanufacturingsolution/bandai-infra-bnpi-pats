// src/components/atoms/Icon.tsx (or wherever your path is)

import type React from "react";
import { cn } from "@/lib/utils";
import type { LucideProps } from "lucide-react";

// Semantic size mapping
const sizeMap = {
	xs: 12,
	sm: 16,
	md: 20,
	lg: 24,
	xl: 32,
} as const;

type SizeKey = keyof typeof sizeMap;
type IconSize = number | SizeKey;

// Your custom icon names
type CustomIconName =
	| "briefcase"
	| "mapPin"
	| "clock"
	| "dollar"
	| "search"
	| "check"
	| "users"
	| "rocket"
	| "heart"
	| "bookmark"
	| "x";

// Props for the Icon component
export interface IconProps {
	icon?: React.ComponentType<LucideProps> | CustomIconName;
	size?: IconSize;
	className?: string;
	[key: string]: any; // Allow other SVG/Lucide props like strokeWidth, etc.
}

// Custom hardcoded SVG paths
const customIcons: Record<CustomIconName, React.ReactNode> = {
	briefcase: (
		<path d="M20 7h-4V5l-2-2h-4L8 5v2H4c-1.1 0-2 .9-2 2v5c0 .75.4 1.38 1 1.73V19c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2v-3.28c.59-.35 1-.99 1-1.72V9c0-1.1-.9-2-2-2zM10 5h4v2h-4V5zM4 9h16v5h-5v-2H9v2H4V9zm9 6h-2v-2h2v2zm6 4H5v-3h4v2h6v-2h4v3z" />
	),
	mapPin: (
		<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
	),
	clock: (
		<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
	),
	dollar: (
		<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
	),
	search: (
		<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
	),
	check: <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />,
	users: (
		<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
	),
	rocket: (
		<path d="M9.19 6.35c-2.04 2.29-3.44 5.58-3.57 5.89L2 10.69l4.05-4.05c.47-.47 1.15-.68 1.81-.55l1.33 1.26zM11.17 17s3.74-1.55 5.89-3.7c5.4-5.4 4.5-9.62 4.21-10.57-.95-.3-5.17-1.19-10.57 4.21C8.55 9.09 7 12.83 7 12.83L11.17 17zM17.65 14.81c-.47.47-1.15.68-1.81.55l-1.33-1.26c2.04-2.29 3.44-5.58 3.57-5.89l3.62 1.55-4.05 4.05zM9 18l-4 4h3v3l4-4-3-3z" />
	),
	heart: (
		<path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
	),
	bookmark: (
		<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" />
	),
	x: (
		<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
	),
};

export function Icon({ icon, size = "md", className, ...props }: IconProps) {
	// Resolve size to actual number
	const resolvedSize: number = typeof size === "string" ? (sizeMap[size] ?? 20) : (size ?? 20);

	// Case 1: Lucide icon component passed (e.g., Check, Copy, File)
	if (typeof icon === "function") {
		const LucideIcon = icon;
		return (
			<LucideIcon size={resolvedSize} className={cn("inline-block", className)} {...props} />
		);
	}

	// Case 2: Custom icon name (string) or fallback
	const path =
		typeof icon === "string"
			? (customIcons[icon] ?? customIcons.briefcase)
			: customIcons.briefcase;

	return (
		<svg
			width={resolvedSize}
			height={resolvedSize}
			viewBox="0 0 24 24"
			fill="currentColor"
			className={cn("inline-block", className)}
			{...props}>
			{path}
		</svg>
	);
}
