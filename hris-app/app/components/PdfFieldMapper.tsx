import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
	getMockBIR2316Data,
	mapFieldNameToData,
	formatFieldValue,
	resetFieldOccurrenceTracker,
} from "~/lib/bir-2316-mock-data";
import { wrapTextToWidth } from "~/lib/pdf-text-layout";
import { getBoxMappingForField, extractFieldNumber } from "~/lib/box-field-mapper";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Add global styles to disable pointer events on PDF text layer
if (typeof document !== "undefined") {
	const style = document.createElement("style");
	style.textContent = `
		.react-pdf__Page__textContent {
			pointer-events: none !important;
			user-select: none !important;
		}
		.react-pdf__Page__annotations {
			pointer-events: none !important;
		}
	`;
	if (!document.head.querySelector("style[data-pdf-mapper]")) {
		style.setAttribute("data-pdf-mapper", "true");
		document.head.appendChild(style);
	}
}

interface Field {
	id: string;
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontSize: number;
	value?: string;
	letterSpacing?: number; // Manual letter spacing adjustment
	lineHeight?: number; // Line height spacing (multiplier, e.g., 1.2 = 120% of font size)
	textAlign?: "left" | "center" | "right"; // Text horizontal alignment
	verticalAlign?: "top" | "middle" | "bottom"; // Text vertical alignment
}

interface PdfFieldMapperProps {
	pdfUrl: string;
}

export default function PdfFieldMapper({ pdfUrl }: PdfFieldMapperProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState<number>(1);
	const [scale, setScale] = useState<number>(1.5);
	const [fields, setFields] = useState<Field[]>([]);
	const [selectedFields, setSelectedFields] = useState<string[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
	const canvasRef = useRef<HTMLDivElement>(null);
	const [showCoordinates, setShowCoordinates] = useState(true);
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
	const [resizeCorner, setResizeCorner] = useState<
		"tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r" | null
	>(null);
	const [showFields, setShowFields] = useState(true); // Toggle field visibility
	interface AlignmentGuide {
		position: number; // x or y position
		start: number; // start position (x for vertical, y for horizontal)
		end: number; // end position (x for vertical, y for horizontal)
	}

	const [alignmentGuides, setAlignmentGuides] = useState<{
		horizontal: AlignmentGuide[];
		vertical: AlignmentGuide[];
	}>({ horizontal: [], vertical: [] });
	const [snapThreshold] = useState(3); // Pixels threshold for snapping (smaller = less aggressive)
	const [guideDetectionThreshold] = useState(10); // Larger threshold for showing guides (but not snapping)

	// Undo/Redo state
	const [history, setHistory] = useState<Field[][]>([[]]);
	const [historyIndex, setHistoryIndex] = useState<number>(0);

	function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
		setNumPages(numPages);
	}

	// Save current state to history
	const saveToHistory = (newFields: Field[]) => {
		const newHistory = history.slice(0, historyIndex + 1);
		newHistory.push(JSON.parse(JSON.stringify(newFields))); // Deep clone
		setHistory(newHistory);
		setHistoryIndex(newHistory.length - 1);
	};

	// Undo function
	const undo = () => {
		if (historyIndex > 0) {
			const newIndex = historyIndex - 1;
			setHistoryIndex(newIndex);
			setFields(JSON.parse(JSON.stringify(history[newIndex])));
		}
	};

	// Redo function
	const redo = () => {
		if (historyIndex < history.length - 1) {
			const newIndex = historyIndex + 1;
			setHistoryIndex(newIndex);
			setFields(JSON.parse(JSON.stringify(history[newIndex])));
		}
	};

	// Move selected fields with arrow keys
	const moveSelectedFields = (deltaX: number, deltaY: number) => {
		if (selectedFields.length === 0 || !showFields) return;

		const newFields = fields.map((field) => {
			if (selectedFields.includes(field.id)) {
				return {
					...field,
					x: Math.max(0, field.x + deltaX),
					y: Math.max(0, field.y + deltaY),
				};
			}
			return field;
		});

		setFields(newFields);
		saveToHistory(newFields);
	};

	// Keyboard shortcuts for undo/redo, delete, arrow keys, and preview
	// Use a ref for the keydown handler to avoid re-attaching listener on every state change
	const handleKeyDownRef = useRef<(e: KeyboardEvent) => void>(null);

	const handleKeyDown = (e: KeyboardEvent) => {
		// Don't handle shortcuts when typing in input fields
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
			e.preventDefault();
			undo();
		} else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
			e.preventDefault();
			redo();
		} else if (e.key === "Delete" && selectedFields.length > 0 && showFields) {
			e.preventDefault();
			selectedFields.forEach((id) => deleteField(id));
			setSelectedFields([]);
		} else if (e.key === "Escape") {
			e.preventDefault();
			setShowFields(!showFields);
			if (showFields) {
				setSelectedFields([]); // Deselect when hiding
			}
		} else if (
			selectedFields.length > 0 &&
			showFields &&
			(e.key === "ArrowUp" ||
				e.key === "ArrowDown" ||
				e.key === "ArrowLeft" ||
				e.key === "ArrowRight")
		) {
			e.preventDefault();
			// Shift+Arrow for larger movement (10px), regular Arrow for smaller (1px)
			const step = e.shiftKey ? 10 : 1;
			let deltaX = 0;
			let deltaY = 0;

			switch (e.key) {
				case "ArrowUp":
					deltaY = -step;
					break;
				case "ArrowDown":
					deltaY = step;
					break;
				case "ArrowLeft":
					deltaX = -step;
					break;
				case "ArrowRight":
					deltaX = step;
					break;
			}

			moveSelectedFields(deltaX, deltaY);
		}
	};

	// Update ref whenever handler dependencies change
	useEffect(() => {
		handleKeyDownRef.current = handleKeyDown;
	});

	useEffect(() => {
		const eventListener = (e: KeyboardEvent) => {
			if (handleKeyDownRef.current) {
				handleKeyDownRef.current(e);
			}
		};

		window.addEventListener("keydown", eventListener);
		return () => window.removeEventListener("keydown", eventListener);
	}, []);

	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Auto-load saved mapping on component mount
	useEffect(() => {
		const saved = localStorage.getItem("pdf-field-mapping");
		if (saved) {
			try {
				const mapping = JSON.parse(saved);
				const loadedFields: Field[] = mapping.map((item: any, index: number) => ({
					id: `field-${Date.now()}-${index}`,
					name: item.name,
					x: item.coordinates.x,
					y: item.coordinates.y,
					width: item.dimensions.width,
					height: item.dimensions.height,
					fontSize: item.fontSize,
					value: item.value || "",
					letterSpacing: item.letterSpacing,
					lineHeight: item.lineHeight,
					textAlign: item.textAlign,
					verticalAlign: item.verticalAlign,
				}));
				setFields(loadedFields);
			} catch (error) {
				console.error("Failed to load saved mapping:", error);
			}
		}
		setIsInitialLoad(false);
	}, []);

	// Auto-save fields whenever they change (but not on initial load)
	useEffect(() => {
		if (isInitialLoad || fields.length === 0) {
			return;
		}

		const mapping = fields.map((f) => ({
			name: f.name,
			coordinates: { x: f.x, y: f.y },
			dimensions: { width: f.width, height: f.height },
			fontSize: f.fontSize,
			value: f.value || "",
			letterSpacing: f.letterSpacing,
			lineHeight: f.lineHeight,
			textAlign: f.textAlign,
			verticalAlign: f.verticalAlign,
		}));

		console.log("[Auto-save] Saving fields to localStorage:", mapping);
		localStorage.setItem("pdf-field-mapping", JSON.stringify(mapping));
	}, [fields, isInitialLoad]);

	const addField = () => {
		const newField: Field = {
			id: `field-${Date.now()}`,
			name: `Field ${fields.length + 1}`,
			x: 50,
			y: 50,
			width: 150,
			height: 25,
			fontSize: 12,
			value: "",
		};
		const newFields = [...fields, newField];
		setFields(newFields);
		saveToHistory(newFields);
		setSelectedFields([newField.id]);
	};

	const deleteField = (id: string) => {
		const newFields = fields.filter((f) => f.id !== id);
		setFields(newFields);
		saveToHistory(newFields);
		setSelectedFields((prev) => prev.filter((fieldId) => fieldId !== id));
	};

	// Helper function to find alignment guides - only edges, no centers
	// Returns only the nearest guide for each axis
	const findAlignmentGuides = (
		draggingField: Field,
		otherFields: Field[],
	): { horizontal: AlignmentGuide[]; vertical: AlignmentGuide[] } => {
		const horizontalCandidates: Array<{ guide: AlignmentGuide; distance: number }> = [];
		const verticalCandidates: Array<{ guide: AlignmentGuide; distance: number }> = [];
		const threshold = guideDetectionThreshold; // Use larger threshold for showing guides

		otherFields.forEach((field) => {
			// Check horizontal alignment (top and bottom edges)
			const fieldTop = field.y;
			const fieldBottom = field.y + field.height;
			const draggingTop = draggingField.y;
			const draggingBottom = draggingField.y + draggingField.height;

			// Top edge alignment
			const topDistance = Math.abs(draggingTop - fieldTop);
			if (topDistance < threshold) {
				const alignY = fieldTop;
				const startX = Math.min(draggingField.x, field.x);
				const endX = Math.max(draggingField.x + draggingField.width, field.x + field.width);
				horizontalCandidates.push({
					guide: {
						position: alignY,
						start: startX,
						end: endX,
					},
					distance: topDistance,
				});
			}

			// Bottom edge alignment
			const bottomDistance = Math.abs(draggingBottom - fieldBottom);
			if (bottomDistance < threshold) {
				const alignY = fieldBottom;
				const startX = Math.min(draggingField.x, field.x);
				const endX = Math.max(draggingField.x + draggingField.width, field.x + field.width);
				horizontalCandidates.push({
					guide: {
						position: alignY,
						start: startX,
						end: endX,
					},
					distance: bottomDistance,
				});
			}

			// Check vertical alignment (left and right edges)
			const fieldLeft = field.x;
			const fieldRight = field.x + field.width;
			const draggingLeft = draggingField.x;
			const draggingRight = draggingField.x + draggingField.width;

			// Left edge alignment
			const leftDistance = Math.abs(draggingLeft - fieldLeft);
			if (leftDistance < threshold) {
				const alignX = fieldLeft;
				const startY = Math.min(draggingField.y, field.y);
				const endY = Math.max(
					draggingField.y + draggingField.height,
					field.y + field.height,
				);
				verticalCandidates.push({
					guide: {
						position: alignX,
						start: startY,
						end: endY,
					},
					distance: leftDistance,
				});
			}

			// Right edge alignment
			const rightDistance = Math.abs(draggingRight - fieldRight);
			if (rightDistance < threshold) {
				const alignX = fieldRight;
				const startY = Math.min(draggingField.y, field.y);
				const endY = Math.max(
					draggingField.y + draggingField.height,
					field.y + field.height,
				);
				verticalCandidates.push({
					guide: {
						position: alignX,
						start: startY,
						end: endY,
					},
					distance: rightDistance,
				});
			}
		});

		// Find the nearest horizontal guide
		let nearestHorizontal: AlignmentGuide | null = null;
		if (horizontalCandidates.length > 0) {
			horizontalCandidates.sort((a, b) => a.distance - b.distance);
			nearestHorizontal = horizontalCandidates[0].guide;
		}

		// Find the nearest vertical guide
		let nearestVertical: AlignmentGuide | null = null;
		if (verticalCandidates.length > 0) {
			verticalCandidates.sort((a, b) => a.distance - b.distance);
			nearestVertical = verticalCandidates[0].guide;
		}

		return {
			horizontal: nearestHorizontal ? [nearestHorizontal] : [],
			vertical: nearestVertical ? [nearestVertical] : [],
		};
	};

	// Helper function to snap to nearest guide (for alignment guides)
	const snapToGuide = (
		value: number,
		guides: AlignmentGuide[],
		threshold: number = snapThreshold,
	): number => {
		for (const guide of guides) {
			if (Math.abs(value - guide.position) < threshold) {
				return guide.position;
			}
		}
		return value;
	};

	// Helper function to snap to nearest numeric value (for resize)
	const snapToValue = (
		value: number,
		values: number[],
		threshold: number = snapThreshold,
	): number => {
		for (const val of values) {
			if (Math.abs(value - val) < threshold) {
				return val;
			}
		}
		return value;
	};

	// Helper function to find size/position alignment guides for resizing
	const findResizeAlignmentGuides = (
		resizingField: Field,
		otherFields: Field[],
	): {
		widths: number[];
		heights: number[];
		xPositions: number[];
		yPositions: number[];
		rightEdges: number[];
		bottomEdges: number[];
	} => {
		const guides = {
			widths: [] as number[],
			heights: [] as number[],
			xPositions: [] as number[],
			yPositions: [] as number[],
			rightEdges: [] as number[],
			bottomEdges: [] as number[],
		};
		const threshold = snapThreshold * 2;

		otherFields.forEach((field) => {
			// Collect widths and heights
			guides.widths.push(field.width);
			guides.heights.push(field.height);

			// Collect x and y positions
			guides.xPositions.push(field.x);
			guides.yPositions.push(field.y);

			// Collect right and bottom edges
			guides.rightEdges.push(field.x + field.width);
			guides.bottomEdges.push(field.y + field.height);
		});

		return {
			widths: [...new Set(guides.widths)],
			heights: [...new Set(guides.heights)],
			xPositions: [...new Set(guides.xPositions)],
			yPositions: [...new Set(guides.yPositions)],
			rightEdges: [...new Set(guides.rightEdges)],
			bottomEdges: [...new Set(guides.bottomEdges)],
		};
	};

	const updateField = (id: string, updates: Partial<Field>) => {
		const newFields = fields.map((f) => (f.id === id ? { ...f, ...updates } : f));
		setFields(newFields);
		// Save to history for alignment and other property changes
		if (updates.textAlign !== undefined || updates.verticalAlign !== undefined) {
			saveToHistory(newFields);
		}
	};

	const handleMouseDown = (
		e: React.MouseEvent,
		fieldId: string,
		action: "drag" | "resize",
		edge?: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r",
	) => {
		e.stopPropagation();
		const field = fields.find((f) => f.id === fieldId);
		if (!field) return;

		// Handle shift-click for multi-select
		if (action === "drag" && e.shiftKey) {
			setSelectedFields((prev) => {
				if (prev.includes(fieldId)) {
					// Deselect if already selected
					return prev.filter((id) => id !== fieldId);
				} else {
					// Add to selection
					return [...prev, fieldId];
				}
			});
			return;
		}

		// If not shift-clicking, select this field (and deselect others if not already selected)
		if (!selectedFields.includes(fieldId)) {
			setSelectedFields([fieldId]);
		}

		if (action === "drag") {
			setIsDragging(true);
			const rect = (e.target as HTMLElement).getBoundingClientRect();
			setDragOffset({
				x: e.clientX - rect.left,
				y: e.clientY - rect.top,
			});
		} else {
			setIsResizing(true);
			setResizeCorner(edge || "br");
		}
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!canvasRef.current) return;

		const rect = canvasRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		setMousePos({ x: Math.round(x), y: Math.round(y) });

		if (selectedFields.length > 0 && (isDragging || isResizing)) {
			const primaryFieldId = selectedFields[0];
			const field = fields.find((f) => f.id === primaryFieldId);
			if (!field) return;

			if (isDragging) {
				// Calculate new position
				let newX = Math.max(0, x - dragOffset.x);
				let newY = Math.max(0, y - dragOffset.y);

				// Find other fields (excluding selected ones)
				const otherFields = fields.filter((f) => !selectedFields.includes(f.id));

				// Calculate offset for multi-select
				const offsetX = newX - field.x;
				const offsetY = newY - field.y;

				// Create temporary field for guide detection
				const tempField: Field = {
					...field,
					x: newX,
					y: newY,
				};

				// Find alignment guides (only edges)
				const guides = findAlignmentGuides(tempField, otherFields);
				setAlignmentGuides(guides);

				// Snap left and top edges
				newX = snapToGuide(newX, guides.vertical);
				newY = snapToGuide(newY, guides.horizontal);

				// Also snap right and bottom edges
				const fieldRight = newX + field.width;
				const fieldBottom = newY + field.height;

				const snappedRight = snapToGuide(fieldRight, guides.vertical);
				const snappedBottom = snapToGuide(fieldBottom, guides.horizontal);

				// Adjust position based on which edge snapped
				if (snappedRight !== fieldRight) {
					newX = snappedRight - field.width;
				}

				if (snappedBottom !== fieldBottom) {
					newY = snappedBottom - field.height;
				}

				// Update all selected fields
				selectedFields.forEach((fieldId) => {
					const f = fields.find((field) => field.id === fieldId);
					if (f) {
						const relativeOffsetX = f.x - field.x;
						const relativeOffsetY = f.y - field.y;
						updateField(fieldId, {
							x: Math.max(0, newX + relativeOffsetX),
							y: Math.max(0, newY + relativeOffsetY),
						});
					}
				});
			} else if (isResizing && resizeCorner) {
				// Find other fields for alignment
				const otherFields = fields.filter((f) => f.id !== primaryFieldId);
				const resizeGuides = findResizeAlignmentGuides(field, otherFields);

				// Calculate temporary field with new dimensions for guide detection
				let tempField: Field = { ...field };
				// We'll update tempField after calculating new dimensions

				const updates: Partial<Field> = {};
				let newWidth = 0;
				let newHeight = 0;
				let newX = field.x;
				let newY = field.y;

				switch (resizeCorner) {
					case "br": // bottom-right corner
						newWidth = Math.max(50, x - field.x);
						newHeight = Math.max(20, y - field.y);
						// Snap width and height to other fields
						newWidth = snapToValue(newWidth, resizeGuides.widths);
						newHeight = snapToValue(newHeight, resizeGuides.heights);
						// Also snap right edge and bottom edge
						const rightEdge = field.x + newWidth;
						const bottomEdge = field.y + newHeight;
						const snappedRightEdge = snapToValue(rightEdge, resizeGuides.rightEdges);
						const snappedBottomEdge = snapToValue(bottomEdge, resizeGuides.bottomEdges);
						if (snappedRightEdge !== rightEdge) {
							newWidth = snappedRightEdge - field.x;
						}
						if (snappedBottomEdge !== bottomEdge) {
							newHeight = snappedBottomEdge - field.y;
						}
						updates.width = newWidth;
						updates.height = newHeight;
						break;
					case "bl": // bottom-left corner
						newX = Math.min(x, field.x + field.width - 50);
						newWidth = Math.max(50, field.x + field.width - x);
						newHeight = Math.max(20, y - field.y);
						// Snap x position, width, and height
						newX = snapToValue(newX, resizeGuides.xPositions);
						newWidth = snapToValue(newWidth, resizeGuides.widths);
						newHeight = snapToValue(newHeight, resizeGuides.heights);
						// Also snap left edge and bottom edge
						const snappedLeftX = snapToValue(newX, resizeGuides.xPositions);
						if (snappedLeftX !== newX) {
							newX = snappedLeftX;
							newWidth = field.x + field.width - newX;
						}
						const bottomEdgeBL = field.y + newHeight;
						const snappedBottomEdgeBL = snapToValue(
							bottomEdgeBL,
							resizeGuides.bottomEdges,
						);
						if (snappedBottomEdgeBL !== bottomEdgeBL) {
							newHeight = snappedBottomEdgeBL - field.y;
						}
						updates.x = newX;
						updates.width = newWidth;
						updates.height = newHeight;
						break;
					case "tr": // top-right corner
						newY = Math.min(y, field.y + field.height - 20);
						newHeight = Math.max(20, field.y + field.height - y);
						newWidth = Math.max(50, x - field.x);
						// Snap y position, height, and width
						newY = snapToValue(newY, resizeGuides.yPositions);
						newHeight = snapToValue(newHeight, resizeGuides.heights);
						newWidth = snapToValue(newWidth, resizeGuides.widths);
						// Also snap top edge and right edge
						const snappedTopY = snapToValue(newY, resizeGuides.yPositions);
						if (snappedTopY !== newY) {
							newY = snappedTopY;
							newHeight = field.y + field.height - newY;
						}
						const rightEdgeTR = field.x + newWidth;
						const snappedRightEdgeTR = snapToValue(
							rightEdgeTR,
							resizeGuides.rightEdges,
						);
						if (snappedRightEdgeTR !== rightEdgeTR) {
							newWidth = snappedRightEdgeTR - field.x;
						}
						updates.y = newY;
						updates.height = newHeight;
						updates.width = newWidth;
						break;
					case "tl": // top-left corner
						newX = Math.min(x, field.x + field.width - 50);
						newY = Math.min(y, field.y + field.height - 20);
						newWidth = Math.max(50, field.x + field.width - x);
						newHeight = Math.max(20, field.y + field.height - y);
						// Snap x, y, width, and height
						newX = snapToValue(newX, resizeGuides.xPositions);
						newY = snapToValue(newY, resizeGuides.yPositions);
						newWidth = snapToValue(newWidth, resizeGuides.widths);
						newHeight = snapToValue(newHeight, resizeGuides.heights);
						// Also snap left and top edges
						const snappedLeftXTL = snapToValue(newX, resizeGuides.xPositions);
						if (snappedLeftXTL !== newX) {
							newX = snappedLeftXTL;
							newWidth = field.x + field.width - newX;
						}
						const snappedTopYTL = snapToValue(newY, resizeGuides.yPositions);
						if (snappedTopYTL !== newY) {
							newY = snappedTopYTL;
							newHeight = field.y + field.height - newY;
						}
						updates.x = newX;
						updates.y = newY;
						updates.width = newWidth;
						updates.height = newHeight;
						break;
					case "t": // top edge
						newY = Math.min(y, field.y + field.height - 20);
						newHeight = Math.max(20, field.y + field.height - y);
						// Snap y position and height
						newY = snapToValue(newY, resizeGuides.yPositions);
						newHeight = snapToValue(newHeight, resizeGuides.heights);
						// Also snap top edge
						const snappedTopYT = snapToValue(newY, resizeGuides.yPositions);
						if (snappedTopYT !== newY) {
							newY = snappedTopYT;
							newHeight = field.y + field.height - newY;
						}
						updates.y = newY;
						updates.height = newHeight;
						break;
					case "b": // bottom edge
						newHeight = Math.max(20, y - field.y);
						// Snap height and bottom edge
						newHeight = snapToValue(newHeight, resizeGuides.heights);
						const bottomEdgeB = field.y + newHeight;
						const snappedBottomEdgeB = snapToValue(
							bottomEdgeB,
							resizeGuides.bottomEdges,
						);
						if (snappedBottomEdgeB !== bottomEdgeB) {
							newHeight = snappedBottomEdgeB - field.y;
						}
						updates.height = newHeight;
						break;
					case "l": // left edge
						newX = Math.min(x, field.x + field.width - 50);
						newWidth = Math.max(50, field.x + field.width - x);
						// Snap x position and width
						newX = snapToValue(newX, resizeGuides.xPositions);
						newWidth = snapToValue(newWidth, resizeGuides.widths);
						// Also snap left edge
						const snappedLeftXL = snapToValue(newX, resizeGuides.xPositions);
						if (snappedLeftXL !== newX) {
							newX = snappedLeftXL;
							newWidth = field.x + field.width - newX;
						}
						updates.x = newX;
						updates.width = newWidth;
						break;
					case "r": // right edge
						newWidth = Math.max(50, x - field.x);
						// Snap width and right edge
						newWidth = snapToValue(newWidth, resizeGuides.widths);
						const rightEdgeR = field.x + newWidth;
						const snappedRightEdgeR = snapToValue(rightEdgeR, resizeGuides.rightEdges);
						if (snappedRightEdgeR !== rightEdgeR) {
							newWidth = snappedRightEdgeR - field.x;
						}
						updates.width = newWidth;
						break;
				}

				// Update tempField with new dimensions to calculate alignment guides
				tempField = {
					...field,
					...updates,
					x: updates.x !== undefined ? updates.x : field.x,
					y: updates.y !== undefined ? updates.y : field.y,
					width: updates.width !== undefined ? updates.width : field.width,
					height: updates.height !== undefined ? updates.height : field.height,
				};

				// Find position guides for alignment with updated field
				const positionGuides = findAlignmentGuides(tempField, otherFields);
				setAlignmentGuides(positionGuides);

				updateField(primaryFieldId, updates);
			}
		} else {
			// Clear guides when not dragging
			setAlignmentGuides({ horizontal: [], vertical: [] });
		}
	};

	const handleMouseUp = () => {
		// Save to history when user finishes dragging or resizing
		if (isDragging || isResizing) {
			saveToHistory(fields);
		}
		setIsDragging(false);
		setIsResizing(false);
		setResizeCorner(null);
		setAlignmentGuides({ horizontal: [], vertical: [] });
	};

	const saveMapping = () => {
		const mapping = fields.map((f) => ({
			name: f.name,
			coordinates: { x: f.x, y: f.y },
			dimensions: { width: f.width, height: f.height },
			fontSize: f.fontSize,
			value: f.value || "",
			letterSpacing: f.letterSpacing,
			lineHeight: f.lineHeight,
			textAlign: f.textAlign,
			verticalAlign: f.verticalAlign,
		}));

		// Save to localStorage
		localStorage.setItem("pdf-field-mapping", JSON.stringify(mapping));
		alert("Mapping saved successfully!");
	};

	const loadMapping = () => {
		const saved = localStorage.getItem("pdf-field-mapping");
		if (!saved) {
			alert("No saved mapping found");
			return;
		}

		try {
			const mapping = JSON.parse(saved);
			const loadedFields: Field[] = mapping.map((item: any, index: number) => ({
				id: `field-${Date.now()}-${index}`,
				name: item.name,
				x: item.coordinates.x,
				y: item.coordinates.y,
				width: item.dimensions.width,
				height: item.dimensions.height,
				fontSize: item.fontSize,
				value: item.value || "",
				letterSpacing: item.letterSpacing,
				lineHeight: item.lineHeight,
				textAlign: item.textAlign || "center",
				verticalAlign: item.verticalAlign || "middle",
			}));
			setFields(loadedFields);
			alert("Mapping loaded successfully!");
		} catch (error) {
			alert("Failed to load mapping");
		}
	};

	const exportMapping = () => {
		const mapping = fields.map((f) => ({
			name: f.name,
			coordinates: { x: f.x, y: f.y },
			dimensions: { width: f.width, height: f.height },
			fontSize: f.fontSize,
			value: f.value || "",
			letterSpacing: f.letterSpacing,
			lineHeight: f.lineHeight,
			textAlign: f.textAlign,
			verticalAlign: f.verticalAlign,
		}));

		const blob = new Blob([JSON.stringify(mapping, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "pdf-field-mapping.json";
		a.click();
		URL.revokeObjectURL(url);
	};

	const importMapping = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			try {
				const mapping = JSON.parse(event.target?.result as string);
				const importedFields: Field[] = mapping.map((item: any, index: number) => ({
					id: `field-${Date.now()}-${index}`,
					name: item.name,
					x: item.coordinates.x,
					y: item.coordinates.y,
					width: item.dimensions.width,
					height: item.dimensions.height,
					fontSize: item.fontSize,
					value: item.value || "",
					letterSpacing: item.letterSpacing,
					lineHeight: item.lineHeight,
					textAlign: item.textAlign,
					verticalAlign: item.verticalAlign,
				}));
				setFields(importedFields);
			} catch (error) {
				alert("Failed to import mapping file");
			}
		};
		reader.readAsText(file);
	};

	const downloadPdfWithText = async () => {
		try {
			// Fetch the original PDF
			const existingPdfBytes = await fetch(pdfUrl).then((res) => res.arrayBuffer());

			// Load the PDF with pdf-lib
			const pdfDoc = await PDFDocument.load(existingPdfBytes);
			const pages = pdfDoc.getPages();
			const currentPage = pages[pageNumber - 1]; // Get current page

			if (!currentPage) {
				alert("Page not found");
				return;
			}

			const { width: pdfWidth, height: pdfHeight } = currentPage.getSize();

			console.log("=== PDF Download Debug ===");
			console.log("PDF actual dimensions:", { pdfWidth, pdfHeight });
			console.log("Current scale factor:", scale);
			console.log("Rendered canvas dimensions:", {
				width: pdfWidth * scale,
				height: pdfHeight * scale,
			});

			// Embed font once for all fields
			const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

			// Draw each field's text onto the PDF
			for (const field of fields) {
				if (!field.value) continue;

				// Field coordinates are in pixels on the SCALED canvas
				// The canvas displays PDF at: scale * PDF_SIZE
				// So to get actual PDF coordinates, just divide by scale

				// Convert coordinates from scaled canvas to PDF
				const pdfFieldX = field.x / scale;
				const pdfFieldY = pdfHeight - field.y / scale;
				const pdfFieldWidth = field.width / scale;
				const pdfFieldHeight = field.height / scale;

				// Font size and letter spacing - also divide by scale
				const pdfFontSize = field.fontSize / scale;
				const letterSpacingPdf =
					field.letterSpacing !== undefined ? field.letterSpacing / scale : 0;

				// Get alignment settings with defaults
				const textAlign = field.textAlign || "center";
				const verticalAlign = field.verticalAlign || "middle";

				// Wrap text into multiple lines so it fits inside the box width.
				// Leave the value exactly as entered in the mapper.
				const value = field.value?.toString() ?? "";
				const processedLines = wrapTextToWidth(
					value,
					pdfFieldWidth,
					font,
					pdfFontSize,
					letterSpacingPdf,
				);

				// Calculate line height (use field's lineHeight if set, otherwise default to 1.2)
				const lineHeightMultiplier =
					field.lineHeight !== undefined ? field.lineHeight : 1.2;
				const lineHeight = pdfFontSize * lineHeightMultiplier;

				// Calculate total text height
				const totalTextHeight = processedLines.length * lineHeight;

				// Calculate vertical position based on vertical alignment
				let startY: number;
				switch (verticalAlign) {
					case "top":
						startY = pdfFieldY - pdfFontSize * 0.8; // Top of field, adjusted for baseline
						break;
					case "bottom":
						startY =
							pdfFieldY -
							pdfFieldHeight +
							pdfFontSize * 0.8 +
							totalTextHeight -
							lineHeight;
						break;
					default: // middle
						startY =
							pdfFieldY -
							pdfFieldHeight / 2 -
							pdfFontSize / 3 +
							(totalTextHeight - lineHeight) / 2;
						break;
				}

				console.log(`Field "${field.name}" (${field.value}):`, {
					canvasField: {
						x: field.x,
						y: field.y,
						width: field.width,
						height: field.height,
					},
					pdfField: {
						x: pdfFieldX.toFixed(2),
						y: pdfFieldY.toFixed(2),
						width: pdfFieldWidth.toFixed(2),
						height: pdfFieldHeight.toFixed(2),
					},
					alignment: {
						textAlign,
						verticalAlign,
					},
					lines: {
						count: processedLines.length,
						content: processedLines,
					},
					fontSizeCanvas: field.fontSize,
					fontSizePdf: pdfFontSize.toFixed(2),
					letterSpacingCanvas: field.letterSpacing,
					letterSpacingPdf: letterSpacingPdf.toFixed(2),
					lineHeightCanvas: field.lineHeight,
					lineHeightPdf: lineHeightMultiplier.toFixed(2),
				});

				// Draw each line
				for (let lineIndex = 0; lineIndex < processedLines.length; lineIndex++) {
					const line = processedLines[lineIndex];

					// Calculate line width with letter spacing
					let lineWidth = 0;
					for (let i = 0; i < line.length; i++) {
						const charWidth = font.widthOfTextAtSize(line[i], pdfFontSize);
						lineWidth += charWidth;
						if (i < line.length - 1) {
							lineWidth += letterSpacingPdf;
						}
					}

					// Calculate horizontal position based on text alignment
					let lineX: number;
					switch (textAlign) {
						case "left":
							lineX = pdfFieldX;
							break;
						case "right":
							lineX = pdfFieldX + pdfFieldWidth - lineWidth;
							break;
						default: // center
							lineX = pdfFieldX + (pdfFieldWidth - lineWidth) / 2;
							break;
					}

					// Calculate Y position for this line
					const lineY = startY - lineIndex * lineHeight;

					// Draw the line with letter spacing
					let currentX = lineX;
					for (let i = 0; i < line.length; i++) {
						const char = line[i];

						// Draw the character
						currentPage.drawText(char, {
							x: currentX,
							y: lineY,
							size: pdfFontSize,
							color: rgb(0, 0, 0),
							font: font,
						});

						// Get actual character width from the font at PDF size
						const charWidth = font.widthOfTextAtSize(char, pdfFontSize);

						// Move to next character position: character width + letter spacing
						currentX += charWidth + letterSpacingPdf;
					}
				}
			}

			// Serialize the PDFDocument to bytes
			const pdfBytes = await pdfDoc.save();

			// Create a blob and download
			const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "filled-form.pdf";
			a.click();
			URL.revokeObjectURL(url);

			console.log("=== PDF Download Complete ===");
		} catch (error) {
			console.error("Error generating PDF:", error);
			alert("Failed to generate PDF. Check console for details.");
		}
	};

	const addMockInput = () => {
		if (fields.length === 0) {
			alert("Please add at least one field first before loading mock data");
			return;
		}

		const mockData = getMockBIR2316Data();

		// Reset the occurrence tracker for sequential mapping
		resetFieldOccurrenceTracker();

		// Debug: Log all field names
		console.log(
			"[FieldMapper] Current field names:",
			fields.map((f) => f.name),
		);
		console.log("[FieldMapper] Available mock data keys:", Object.keys(mockData));

		// Populate fields with mock data
		const updatedFields = fields.map((field) => {
			const dataValue = mapFieldNameToData(field.name, mockData);
			// Extract box number for proper formatting
			const fieldNumber = extractFieldNumber(field.name);
			const boxMapping = fieldNumber ? getBoxMappingForField(fieldNumber) : null;
			const formattedValue = formatFieldValue(dataValue, boxMapping?.boxNumber);

			// Log if field was matched
			if (dataValue !== undefined) {
				console.log(`[FieldMapper] ✓ Matched "${field.name}" -> ${formattedValue}`);
			} else {
				console.log(`[FieldMapper] ✗ No match for "${field.name}"`);
			}

			return {
				...field,
				value: formattedValue,
			};
		});

		setFields(updatedFields);

		// Count how many fields were populated
		const populatedCount = updatedFields.filter((f) => f.value && f.value !== "").length;
		const unmatchedFields = updatedFields
			.filter((f) => !f.value || f.value === "")
			.map((f) => f.name);

		let message = `Mock data loaded! ${populatedCount} out of ${fields.length} fields populated.`;
		if (unmatchedFields.length > 0) {
			message += `\n\nUnmatched fields:\n${unmatchedFields.join(", ")}\n\nCheck the browser console for details.`;
		}

		alert(message);
	};

	const selectedFieldData =
		selectedFields.length > 0 ? fields.find((f) => f.id === selectedFields[0]) : null;

	return (
		<div
			className="pdf-mapper-container"
			style={{ display: "flex", height: "100vh", gap: "1rem", padding: "1rem" }}>
			{/* Left Panel - Controls */}
			<div
				style={{
					width: "300px",
					overflowY: "auto",
					borderRight: "1px solid #ccc",
					paddingRight: "1rem",
				}}>
				<h2 style={{ marginBottom: "1rem" }}>PDF Field Mapper</h2>

				<div style={{ marginBottom: "1rem" }}>
					<button onClick={addField} style={buttonStyle}>
						Add Field
					</button>
					<button
						onClick={undo}
						disabled={historyIndex <= 0}
						style={{
							...buttonStyle,
							backgroundColor: historyIndex <= 0 ? "#6c757d" : "#007bff",
							cursor: historyIndex <= 0 ? "not-allowed" : "pointer",
							opacity: historyIndex <= 0 ? 0.5 : 1,
						}}
						title="Undo (Ctrl+Z)">
						↶ Undo
					</button>
					<button
						onClick={redo}
						disabled={historyIndex >= history.length - 1}
						style={{
							...buttonStyle,
							backgroundColor:
								historyIndex >= history.length - 1 ? "#6c757d" : "#007bff",
							cursor: historyIndex >= history.length - 1 ? "not-allowed" : "pointer",
							opacity: historyIndex >= history.length - 1 ? 0.5 : 1,
						}}
						title="Redo (Ctrl+Y)">
						↷ Redo
					</button>
					<button
						onClick={saveMapping}
						style={{ ...buttonStyle, backgroundColor: "#28a745" }}>
						Save
					</button>
					<button
						onClick={loadMapping}
						style={{ ...buttonStyle, backgroundColor: "#17a2b8" }}>
						Load
					</button>
					<button onClick={exportMapping} style={buttonStyle}>
						Export JSON
					</button>
					<label style={{ ...buttonStyle, cursor: "pointer", display: "inline-block" }}>
						Import JSON
						<input
							type="file"
							accept=".json"
							onChange={importMapping}
							style={{ display: "none" }}
						/>
					</label>
					<button
						onClick={addMockInput}
						style={{ ...buttonStyle, backgroundColor: "#ffc107", color: "#000" }}>
						Add Mock Input
					</button>
					<button
						onClick={downloadPdfWithText}
						style={{ ...buttonStyle, backgroundColor: "#dc3545" }}>
						Download PDF
					</button>
				</div>

				<div style={{ marginBottom: "1rem" }}>
					<button
						onClick={() => setShowFields(!showFields)}
						style={{
							...buttonStyle,
							backgroundColor: showFields ? "#28a745" : "#6c757d",
							width: "100%",
							marginBottom: "0.5rem",
						}}>
						{showFields ? "👁 Hide Fields (ESC)" : "👁 Show Fields (ESC)"}
					</button>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "0.5rem",
							marginBottom: "0.5rem",
						}}>
						<input
							type="checkbox"
							checked={showCoordinates}
							onChange={(e) => setShowCoordinates(e.target.checked)}
						/>
						Show Coordinates
					</label>
				</div>

				<div style={{ marginBottom: "1rem" }}>
					<label>Zoom: {scale.toFixed(1)}x</label>
					<input
						type="range"
						min="0.5"
						max="3"
						step="0.1"
						value={scale}
						onChange={(e) => setScale(parseFloat(e.target.value))}
						style={{ width: "100%" }}
					/>
				</div>

				{showCoordinates && (
					<div style={{ marginBottom: "1rem", fontSize: "12px", color: "#666" }}>
						Mouse: ({mousePos.x}, {mousePos.y})
					</div>
				)}

				<h3>Fields ({fields.length})</h3>
				{selectedFields.length > 1 && (
					<div
						style={{
							marginTop: "0.5rem",
							padding: "0.5rem",
							backgroundColor: "#e7f3ff",
							borderRadius: "4px",
							fontSize: "12px",
							color: "#007bff",
						}}>
						{selectedFields.length} fields selected (Shift+Click to toggle)
					</div>
				)}
				<div style={{ marginTop: "1rem" }}>
					{fields.map((field) => (
						<div
							key={field.id}
							style={{
								padding: "0.5rem",
								marginBottom: "0.5rem",
								border: selectedFields.includes(field.id)
									? "2px solid #007bff"
									: "1px solid #ddd",
								borderRadius: "4px",
								cursor: "pointer",
								backgroundColor: selectedFields.includes(field.id)
									? "#e7f3ff"
									: "white",
							}}
							onClick={(e) => {
								if (e.shiftKey) {
									setSelectedFields((prev) => {
										if (prev.includes(field.id)) {
											return prev.filter((id) => id !== field.id);
										} else {
											return [...prev, field.id];
										}
									});
								} else {
									setSelectedFields([field.id]);
								}
							}}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
								}}>
								<strong>{field.name}</strong>
								<button
									onClick={(e) => {
										e.stopPropagation();
										deleteField(field.id);
									}}
									style={{
										...buttonStyle,
										padding: "2px 8px",
										fontSize: "12px",
									}}>
									Delete
								</button>
							</div>
							<div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
								Position: ({Math.round(field.x)}, {Math.round(field.y)})<br />
								Size: {Math.round(field.width)}x{Math.round(field.height)}
							</div>
						</div>
					))}
				</div>

				{selectedFieldData && (
					<div
						style={{
							marginTop: "1rem",
							padding: "1rem",
							border: "2px solid #007bff",
							borderRadius: "4px",
							backgroundColor: "#f8f9fa",
						}}>
						<h4 style={{ marginTop: 0, marginBottom: "1rem", color: "#007bff" }}>
							Edit: {selectedFieldData.name}
						</h4>

						{/* Text Value - prominently displayed */}
						<div style={{ marginBottom: "1rem" }}>
							<label
								style={{
									display: "block",
									fontSize: "12px",
									marginBottom: "4px",
									fontWeight: "bold",
								}}>
								Text Value:
							</label>
							<input
								type="text"
								value={selectedFieldData.value || ""}
								onChange={(e) =>
									updateField(selectedFields[0], { value: e.target.value })
								}
								style={{ ...inputStyle, fontSize: "14px", padding: "8px" }}
								placeholder="Enter text"
							/>
						</div>

						{/* Alignment Controls */}
						<div style={{ marginBottom: "1rem" }}>
							<label
								style={{
									display: "block",
									fontSize: "12px",
									marginBottom: "4px",
									fontWeight: "bold",
								}}>
								Horizontal Alignment:
							</label>
							<div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
								<button
									onClick={() =>
										updateField(selectedFields[0], { textAlign: "left" })
									}
									style={{
										...buttonStyle,
										flex: 1,
										padding: "6px",
										fontSize: "11px",
										backgroundColor:
											selectedFieldData.textAlign === "left"
												? "#007bff"
												: "#e9ecef",
										color:
											selectedFieldData.textAlign === "left"
												? "white"
												: "#000",
									}}>
									⬅ Left
								</button>
								<button
									onClick={() =>
										updateField(selectedFields[0], { textAlign: "center" })
									}
									style={{
										...buttonStyle,
										flex: 1,
										padding: "6px",
										fontSize: "11px",
										backgroundColor:
											(selectedFieldData.textAlign || "center") === "center"
												? "#007bff"
												: "#e9ecef",
										color:
											(selectedFieldData.textAlign || "center") === "center"
												? "white"
												: "#000",
									}}>
									↔ Center
								</button>
								<button
									onClick={() =>
										updateField(selectedFields[0], { textAlign: "right" })
									}
									style={{
										...buttonStyle,
										flex: 1,
										padding: "6px",
										fontSize: "11px",
										backgroundColor:
											selectedFieldData.textAlign === "right"
												? "#007bff"
												: "#e9ecef",
										color:
											selectedFieldData.textAlign === "right"
												? "white"
												: "#000",
									}}>
									➡ Right
								</button>
							</div>
							<label
								style={{
									display: "block",
									fontSize: "12px",
									marginBottom: "4px",
									fontWeight: "bold",
									marginTop: "0.5rem",
								}}>
								Vertical Alignment:
							</label>
							<div style={{ display: "flex", gap: "0.5rem" }}>
								<button
									onClick={() =>
										updateField(selectedFields[0], { verticalAlign: "top" })
									}
									style={{
										...buttonStyle,
										flex: 1,
										padding: "6px",
										fontSize: "11px",
										backgroundColor:
											selectedFieldData.verticalAlign === "top"
												? "#007bff"
												: "#e9ecef",
										color:
											selectedFieldData.verticalAlign === "top"
												? "white"
												: "#000",
									}}>
									⬆ Top
								</button>
								<button
									onClick={() =>
										updateField(selectedFields[0], { verticalAlign: "middle" })
									}
									style={{
										...buttonStyle,
										flex: 1,
										padding: "6px",
										fontSize: "11px",
										backgroundColor:
											(selectedFieldData.verticalAlign || "middle") ===
											"middle"
												? "#007bff"
												: "#e9ecef",
										color:
											(selectedFieldData.verticalAlign || "middle") ===
											"middle"
												? "white"
												: "#000",
									}}>
									↕ Middle
								</button>
								<button
									onClick={() =>
										updateField(selectedFields[0], { verticalAlign: "bottom" })
									}
									style={{
										...buttonStyle,
										flex: 1,
										padding: "6px",
										fontSize: "11px",
										backgroundColor:
											selectedFieldData.verticalAlign === "bottom"
												? "#007bff"
												: "#e9ecef",
										color:
											selectedFieldData.verticalAlign === "bottom"
												? "white"
												: "#000",
									}}>
									⬇ Bottom
								</button>
							</div>
						</div>

						{/* Field Name */}
						<div style={{ marginBottom: "0.75rem" }}>
							<label
								style={{
									display: "block",
									fontSize: "12px",
									marginBottom: "4px",
									fontWeight: "bold",
								}}>
								Field Name:
							</label>
							<input
								type="text"
								value={selectedFieldData.name}
								onChange={(e) =>
									updateField(selectedFields[0], { name: e.target.value })
								}
								style={inputStyle}
							/>
						</div>
						{/* Position & Size - Compact Grid */}
						<div style={{ marginBottom: "0.75rem" }}>
							<label
								style={{
									display: "block",
									fontSize: "12px",
									marginBottom: "4px",
									fontWeight: "bold",
								}}>
								Position & Size:
							</label>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: "0.5rem",
								}}>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "10px",
											marginBottom: "2px",
										}}>
										X:
									</label>
									<input
										type="number"
										value={Math.round(selectedFieldData.x)}
										onChange={(e) =>
											updateField(selectedFields[0], {
												x: parseFloat(e.target.value),
											})
										}
										style={{ ...inputStyle, padding: "4px", fontSize: "12px" }}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "10px",
											marginBottom: "2px",
										}}>
										Y:
									</label>
									<input
										type="number"
										value={Math.round(selectedFieldData.y)}
										onChange={(e) =>
											updateField(selectedFields[0], {
												y: parseFloat(e.target.value),
											})
										}
										style={{ ...inputStyle, padding: "4px", fontSize: "12px" }}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "10px",
											marginBottom: "2px",
										}}>
										Width:
									</label>
									<input
										type="number"
										value={Math.round(selectedFieldData.width)}
										onChange={(e) =>
											updateField(selectedFields[0], {
												width: parseFloat(e.target.value),
											})
										}
										style={{ ...inputStyle, padding: "4px", fontSize: "12px" }}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "10px",
											marginBottom: "2px",
										}}>
										Height:
									</label>
									<input
										type="number"
										value={Math.round(selectedFieldData.height)}
										onChange={(e) =>
											updateField(selectedFields[0], {
												height: parseFloat(e.target.value),
											})
										}
										style={{ ...inputStyle, padding: "4px", fontSize: "12px" }}
									/>
								</div>
							</div>
						</div>

						{/* Font Settings - Compact Grid */}
						<div style={{ marginBottom: "0.75rem" }}>
							<label
								style={{
									display: "block",
									fontSize: "12px",
									marginBottom: "4px",
									fontWeight: "bold",
								}}>
								Font Settings:
							</label>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: "0.5rem",
								}}>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "10px",
											marginBottom: "2px",
										}}>
										Font Size:
									</label>
									<input
										type="number"
										value={selectedFieldData.fontSize}
										onChange={(e) =>
											updateField(selectedFields[0], {
												fontSize: parseFloat(e.target.value),
											})
										}
										style={{ ...inputStyle, padding: "4px", fontSize: "12px" }}
									/>
								</div>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "10px",
											marginBottom: "2px",
										}}>
										Letter Spacing:
									</label>
									<input
										type="number"
										value={selectedFieldData.letterSpacing ?? ""}
										onChange={(e) =>
											updateField(selectedFields[0], {
												letterSpacing:
													e.target.value === ""
														? undefined
														: parseFloat(e.target.value),
											})
										}
										style={{ ...inputStyle, padding: "4px", fontSize: "12px" }}
										placeholder="Auto"
										step="0.1"
									/>
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: "0.5rem",
									marginTop: "0.5rem",
								}}>
								<div>
									<label
										style={{
											display: "block",
											fontSize: "10px",
											marginBottom: "2px",
										}}>
										Line Height:
									</label>
									<input
										type="number"
										value={selectedFieldData.lineHeight ?? ""}
										onChange={(e) =>
											updateField(selectedFields[0], {
												lineHeight:
													e.target.value === ""
														? undefined
														: parseFloat(e.target.value),
											})
										}
										style={{ ...inputStyle, padding: "4px", fontSize: "12px" }}
										placeholder="Auto (1.0)"
										step="0.1"
										min="0.5"
										max="3"
									/>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Right Panel - PDF Canvas */}
			<div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
				<div
					ref={canvasRef}
					style={{ position: "relative", display: "inline-block" }}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
					onMouseDown={(e) => {
						// Deselect field when clicking on the canvas background
						if (
							e.target === e.currentTarget ||
							(e.target as HTMLElement).closest(".react-pdf__Page")
						) {
							if (!e.shiftKey) {
								setSelectedFields([]);
							}
						}
					}}>
					<Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
						<Page pageNumber={pageNumber} scale={scale} />
					</Document>

					{/* Render alignment guides - only show when aligned, extend between fields */}
					{alignmentGuides.horizontal.map((guide, index) => (
						<div
							key={`h-guide-${index}`}
							style={{
								position: "absolute",
								left: `${guide.start}px`,
								top: `${guide.position}px`,
								width: `${guide.end - guide.start}px`,
								height: "1px",
								backgroundColor: "#ff6b6b",
								opacity: 0.7,
								pointerEvents: "none",
								zIndex: 1000,
							}}
						/>
					))}
					{alignmentGuides.vertical.map((guide, index) => (
						<div
							key={`v-guide-${index}`}
							style={{
								position: "absolute",
								left: `${guide.position}px`,
								top: `${guide.start}px`,
								width: "1px",
								height: `${guide.end - guide.start}px`,
								backgroundColor: "#ff6b6b",
								opacity: 0.7,
								pointerEvents: "none",
								zIndex: 1000,
							}}
						/>
					))}

					{/* Render fields overlay */}
					{fields.map((field) => (
						<div
							key={field.id}
							style={{
								position: "absolute",
								left: `${field.x}px`,
								top: `${field.y}px`,
								width: `${field.width}px`,
								height: `${field.height}px`,
								border: showFields
									? selectedFields.includes(field.id)
										? "2px solid #007bff"
										: "1px dashed #999"
									: "none",
								backgroundColor: showFields
									? selectedFields.includes(field.id)
										? "rgba(0, 123, 255, 0.1)"
										: "rgba(200, 200, 200, 0.05)"
									: "transparent",
								cursor: showFields ? (isDragging ? "grabbing" : "move") : "default",
								userSelect: "none",
								pointerEvents: showFields ? "auto" : "none",
							}}
							onMouseDown={(e) => showFields && handleMouseDown(e, field.id, "drag")}>
							{showFields && (
								<div
									style={{
										position: "absolute",
										top: "-20px",
										left: "0",
										fontSize: "10px",
										backgroundColor: selectedFields.includes(field.id)
											? "#007bff"
											: "#6c757d",
										color: "white",
										padding: "2px 6px",
										borderRadius: "3px",
										whiteSpace: "nowrap",
										cursor: "move",
									}}>
									{field.name}
								</div>
							)}

							{field.value &&
								(() => {
									// Get alignment settings with defaults
									const textAlign = field.textAlign || "center";
									const verticalAlign = field.verticalAlign || "middle";
									const hasLetterSpacing =
										field.letterSpacing !== undefined &&
										field.letterSpacing !== null &&
										field.letterSpacing !== 0;

									// Calculate positioning based on alignment
									const getHorizontalAlign = () => {
										switch (textAlign) {
											case "left":
												return "flex-start";
											case "right":
												return "flex-end";
											default:
												return "center";
										}
									};

									const getVerticalAlign = () => {
										switch (verticalAlign) {
											case "top":
												return "flex-start";
											case "bottom":
												return "flex-end";
											default:
												return "center";
										}
									};

									// Calculate text indent for letter spacing to ensure proper alignment
									const textIndent =
										hasLetterSpacing && field.letterSpacing
											? `${field.letterSpacing}px`
											: "0px";

									return (
										<div
											style={{
												fontSize: `${field.fontSize}px`,
												padding: "2px",
												overflow: "hidden",
												whiteSpace: "normal",
												wordWrap: "break-word",
												pointerEvents: "none",
												display: "flex",
												alignItems: getVerticalAlign(),
												justifyContent: getHorizontalAlign(),
												width: "100%",
												height: "100%",
												textAlign: textAlign,
												lineHeight: field.lineHeight
													? `${field.lineHeight}`
													: "1",
												letterSpacing: hasLetterSpacing
													? `${field.letterSpacing}px`
													: undefined,
												textIndent: textIndent,
											}}>
											{field.value}
										</div>
									);
								})()}

							{/* Corner and edge resize handles - only show for primary selected field */}
							{showFields &&
								selectedFields.length > 0 &&
								selectedFields[0] === field.id && (
									<>
										{/* Corners */}
										{/* Top-left */}
										<div
											style={{
												position: "absolute",
												left: "-4px",
												top: "-4px",
												width: "8px",
												height: "8px",
												backgroundColor: "#007bff",
												cursor: "nwse-resize",
												border: "1px solid white",
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "tl")
											}
										/>
										{/* Top-right */}
										<div
											style={{
												position: "absolute",
												right: "-4px",
												top: "-4px",
												width: "8px",
												height: "8px",
												backgroundColor: "#007bff",
												cursor: "nesw-resize",
												border: "1px solid white",
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "tr")
											}
										/>
										{/* Bottom-left */}
										<div
											style={{
												position: "absolute",
												left: "-4px",
												bottom: "-4px",
												width: "8px",
												height: "8px",
												backgroundColor: "#007bff",
												cursor: "nesw-resize",
												border: "1px solid white",
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "bl")
											}
										/>
										{/* Bottom-right */}
										<div
											style={{
												position: "absolute",
												right: "-4px",
												bottom: "-4px",
												width: "8px",
												height: "8px",
												backgroundColor: "#007bff",
												cursor: "nwse-resize",
												border: "1px solid white",
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "br")
											}
										/>

										{/* Edges */}
										{/* Top edge */}
										<div
											style={{
												position: "absolute",
												left: "8px",
												right: "8px",
												top: "-3px",
												height: "6px",
												backgroundColor: "#007bff",
												cursor: "ns-resize",
												opacity: 0.7,
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "t")
											}
										/>
										{/* Bottom edge */}
										<div
											style={{
												position: "absolute",
												left: "8px",
												right: "8px",
												bottom: "-3px",
												height: "6px",
												backgroundColor: "#007bff",
												cursor: "ns-resize",
												opacity: 0.7,
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "b")
											}
										/>
										{/* Left edge */}
										<div
											style={{
												position: "absolute",
												left: "-3px",
												top: "8px",
												bottom: "8px",
												width: "6px",
												backgroundColor: "#007bff",
												cursor: "ew-resize",
												opacity: 0.7,
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "l")
											}
										/>
										{/* Right edge */}
										<div
											style={{
												position: "absolute",
												right: "-3px",
												top: "8px",
												bottom: "8px",
												width: "6px",
												backgroundColor: "#007bff",
												cursor: "ew-resize",
												opacity: 0.7,
											}}
											onMouseDown={(e) =>
												handleMouseDown(e, field.id, "resize", "r")
											}
										/>
									</>
								)}
						</div>
					))}
				</div>

				{numPages > 1 && (
					<div style={{ marginTop: "1rem", textAlign: "center" }}>
						<button
							disabled={pageNumber <= 1}
							onClick={() => setPageNumber(pageNumber - 1)}
							style={buttonStyle}>
							Previous
						</button>
						<span style={{ margin: "0 1rem" }}>
							Page {pageNumber} of {numPages}
						</span>
						<button
							disabled={pageNumber >= numPages}
							onClick={() => setPageNumber(pageNumber + 1)}
							style={buttonStyle}>
							Next
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

const buttonStyle: React.CSSProperties = {
	padding: "8px 16px",
	marginRight: "8px",
	marginBottom: "8px",
	backgroundColor: "#007bff",
	color: "white",
	border: "none",
	borderRadius: "4px",
	cursor: "pointer",
	fontSize: "14px",
};

const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "6px",
	border: "1px solid #ddd",
	borderRadius: "4px",
	fontSize: "14px",
};
