import { useEffect, useState } from "react";
import type { Position } from "~/zod/position.zod";
import type { Level } from "~/zod/level.zod";

interface PositionLevel {
	level: Level;
	levelId: string;
}

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
		.map((pl: PositionLevel | Level) => {
			// Handle both junction table format (pl.level) and direct level format
			return "level" in pl ? pl.level : pl;
		})
		.filter((level): level is Level => Boolean(level?.id));
}
