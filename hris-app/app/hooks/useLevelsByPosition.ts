import { useEffect, useState } from "react";
import type { Position } from "~/zod/position.zod";
import type { Level } from "~/zod/level.zod";

interface PositionLevel {
	level: Level;
	levelId: string;
}

const hasNestedLevel = (value: PositionLevel | Level): value is PositionLevel & { level: Level } =>
	typeof value === "object" && value !== null && "level" in value && Boolean(value.level);

export function useLevelsByPosition(positionId: string | undefined, positions: Position[]) {
	const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
	const [availableLevels, setAvailableLevels] = useState<Level[]>([]);

	useEffect(() => {
		if (!positionId) {
			setSelectedPosition(null);
			setAvailableLevels([]);
			return;
		}

		const position = positions.find((p) => p.id === positionId);

		if (!position) {
			setSelectedPosition(null);
			setAvailableLevels([]);
			return;
		}

		setSelectedPosition(position);

		// Extract levels from position.levels - handle nested structure
		const positionLevels = extractLevelsFromPosition(position);
		setAvailableLevels(positionLevels);
	}, [positionId, positions]);

	return { selectedPosition, availableLevels };
}

function extractLevelsFromPosition(position: Position): Level[] {
	if (!position.levels || !Array.isArray(position.levels)) {
		return [];
	}

	return position.levels
		.map((pl) =>
			hasNestedLevel(pl as PositionLevel | Level) ? pl.level : (pl as unknown as Level),
		)
		.filter((level): level is Level => Boolean(level?.id));
}
