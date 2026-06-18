"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";

interface TooltipProviderProps {
	children: React.ReactNode;
	delayDuration?: number;
}

interface TooltipProps {
	children: React.ReactNode;
}

interface TooltipTriggerProps {
	children: React.ReactNode;
	asChild?: boolean;
}

interface TooltipContentProps {
	children: React.ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	sideOffset?: number;
	className?: string;
}

interface TooltipContextValue {
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
	triggerRect: DOMRect | null;
	setTriggerRect: (rect: DOMRect | null) => void;
}

const TooltipContext = React.createContext<TooltipContextValue>({
	isOpen: false,
	setIsOpen: () => {},
	triggerRect: null,
	setTriggerRect: () => {},
});

export function TooltipProvider({ children }: TooltipProviderProps) {
	return <>{children}</>;
}

export function Tooltip({ children }: TooltipProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

	return (
		<TooltipContext.Provider value={{ isOpen, setIsOpen, triggerRect, setTriggerRect }}>
			<div className="relative inline-block w-full">{children}</div>
		</TooltipContext.Provider>
	);
}

export function TooltipTrigger({ children, asChild }: TooltipTriggerProps) {
	const { setIsOpen, setTriggerRect } = React.useContext(TooltipContext);
	const triggerRef = useRef<HTMLDivElement>(null);

	const handleMouseEnter = useCallback(() => {
		if (triggerRef.current) {
			setTriggerRect(triggerRef.current.getBoundingClientRect());
		}
		setIsOpen(true);
	}, [setIsOpen, setTriggerRect]);

	const handleMouseLeave = useCallback(() => {
		setIsOpen(false);
	}, [setIsOpen]);

	return (
		<div
			ref={triggerRef}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			className="w-full">
			{children}
		</div>
	);
}

export function TooltipContent({
	children,
	side = "top",
	sideOffset = 8,
	className,
}: TooltipContentProps) {
	const { isOpen, triggerRect } = React.useContext(TooltipContext);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!isOpen || !mounted || !triggerRect) return null;

	// Calculate position based on trigger rect
	let top = 0;
	let left = 0;

	const triggerCenterX = triggerRect.left + triggerRect.width / 2;
	const triggerCenterY = triggerRect.top + triggerRect.height / 2;

	switch (side) {
		case "top":
			top = triggerRect.top - sideOffset;
			left = triggerCenterX;
			break;
		case "bottom":
			top = triggerRect.bottom + sideOffset;
			left = triggerCenterX;
			break;
		case "left":
			top = triggerCenterY;
			left = triggerRect.left - sideOffset;
			break;
		case "right":
			top = triggerCenterY;
			left = triggerRect.right + sideOffset;
			break;
	}

	const transformClasses = {
		top: "-translate-x-1/2 -translate-y-full",
		bottom: "-translate-x-1/2",
		left: "-translate-x-full -translate-y-1/2",
		right: "-translate-y-1/2",
	};

	return createPortal(
		<div
			style={{
				position: "fixed",
				top,
				left,
				zIndex: 9999,
			}}
			className={cn(
				"min-w-max rounded-lg border bg-white px-3 py-2 text-sm shadow-lg",
				transformClasses[side],
				className,
			)}>
			{children}
		</div>,
		document.body,
	);
}
