"use client";

import * as React from "react";
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";

type TooltipSide = "top" | "bottom" | "left" | "right";

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
	side?: TooltipSide;
	sideOffset?: number;
	collisionPadding?: number;
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

const DEFAULT_COLLISION_PADDING = 8;

const getAvailableSpace = (triggerRect: DOMRect, padding: number) => ({
	top: triggerRect.top - padding,
	bottom: window.innerHeight - triggerRect.bottom - padding,
	left: triggerRect.left - padding,
	right: window.innerWidth - triggerRect.right - padding,
});

const sideFits = (space: number, contentSize: number, offset: number) =>
	space >= contentSize + offset;

const pickTooltipSide = (
	triggerRect: DOMRect,
	content: { width: number; height: number },
	preferred: TooltipSide,
	offset: number,
	padding: number,
): TooltipSide => {
	const space = getAvailableSpace(triggerRect, padding);
	const fits: Record<TooltipSide, boolean> = {
		top: sideFits(space.top, content.height, offset),
		bottom: sideFits(space.bottom, content.height, offset),
		left: sideFits(space.left, content.width, offset),
		right: sideFits(space.right, content.width, offset),
	};

	if (fits[preferred]) return preferred;

	const fallbackOrder: TooltipSide[] = ["bottom", "top", "right", "left"];
	for (const candidate of fallbackOrder) {
		if (candidate !== preferred && fits[candidate]) return candidate;
	}

	const scores: Record<TooltipSide, number> = {
		top: space.top,
		bottom: space.bottom,
		left: space.left,
		right: space.right,
	};

	return (Object.entries(scores) as Array<[TooltipSide, number]>).sort(
		(a, b) => b[1] - a[1],
	)[0][0];
};

const computeTooltipPosition = (
	triggerRect: DOMRect,
	content: { width: number; height: number },
	side: TooltipSide,
	offset: number,
	padding: number,
) => {
	const triggerCenterX = triggerRect.left + triggerRect.width / 2;
	const triggerCenterY = triggerRect.top + triggerRect.height / 2;

	let top = 0;
	let left = 0;

	switch (side) {
		case "top":
			top = triggerRect.top - offset - content.height;
			left = triggerCenterX - content.width / 2;
			break;
		case "bottom":
			top = triggerRect.bottom + offset;
			left = triggerCenterX - content.width / 2;
			break;
		case "left":
			top = triggerCenterY - content.height / 2;
			left = triggerRect.left - offset - content.width;
			break;
		case "right":
			top = triggerCenterY - content.height / 2;
			left = triggerRect.right + offset;
			break;
	}

	const maxLeft = window.innerWidth - content.width - padding;
	const maxTop = window.innerHeight - content.height - padding;

	left = Math.max(padding, Math.min(left, maxLeft));
	top = Math.max(padding, Math.min(top, maxTop));

	return { top, left };
};

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
	const { isOpen, setIsOpen, setTriggerRect } = React.useContext(TooltipContext);
	const triggerRef = useRef<HTMLDivElement>(null);
	const suppressOpenUntilLeaveRef = useRef(false);

	const updateRect = useCallback(() => {
		if (triggerRef.current) {
			setTriggerRect(triggerRef.current.getBoundingClientRect());
		}
	}, [setTriggerRect]);

	const dismissTooltip = useCallback(() => {
		suppressOpenUntilLeaveRef.current = true;
		setIsOpen(false);
	}, [setIsOpen]);

	const handleMouseEnter = useCallback(() => {
		if (suppressOpenUntilLeaveRef.current) return;
		updateRect();
		setIsOpen(true);
	}, [setIsOpen, updateRect]);

	const handleMouseLeave = useCallback(() => {
		suppressOpenUntilLeaveRef.current = false;
		setIsOpen(false);
	}, [setIsOpen]);

	useEffect(() => {
		if (!isOpen) return;
		updateRect();
		window.addEventListener("resize", updateRect);
		window.addEventListener("scroll", updateRect, true);
		return () => {
			window.removeEventListener("resize", updateRect);
			window.removeEventListener("scroll", updateRect, true);
		};
	}, [isOpen, updateRect]);

	return (
		<div
			ref={triggerRef}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			onPointerDown={dismissTooltip}
			onClick={dismissTooltip}
			className="w-full">
			{children}
		</div>
	);
}

export function TooltipContent({
	children,
	side = "top",
	sideOffset = 8,
	collisionPadding = DEFAULT_COLLISION_PADDING,
	className,
}: TooltipContentProps) {
	const { isOpen, triggerRect } = React.useContext(TooltipContext);
	const [mounted, setMounted] = useState(false);
	const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setMounted(true);
	}, []);

	useLayoutEffect(() => {
		if (!isOpen || !triggerRect || !contentRef.current) {
			setCoords(null);
			return;
		}

		const element = contentRef.current;
		if (!element) return;

		const content = {
			width: element.offsetWidth,
			height: element.offsetHeight,
		};
		const resolvedSide = pickTooltipSide(
			triggerRect,
			content,
			side,
			sideOffset,
			collisionPadding,
		);
		setCoords(
			computeTooltipPosition(
				triggerRect,
				content,
				resolvedSide,
				sideOffset,
				collisionPadding,
			),
		);
	}, [isOpen, triggerRect, side, sideOffset, collisionPadding, children]);

	if (!isOpen || !mounted || !triggerRect) return null;

	return createPortal(
		<div
			ref={contentRef}
			style={{
				position: "fixed",
				top: coords?.top ?? 0,
				left: coords?.left ?? 0,
				visibility: coords ? "visible" : "hidden",
				zIndex: 9999,
			}}
			className={cn(
				"pointer-events-none min-w-max rounded-lg border bg-white px-3 py-2 text-sm shadow-lg",
				className,
			)}>
			{children}
		</div>,
		document.body,
	);
}