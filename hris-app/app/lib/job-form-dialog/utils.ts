import type { SelectOption } from "~/components/atoms/Select";
import type { Position } from "~/zod/position.zod";
import type { Level } from "~/zod/level.zod";

export function transformPositionsToOptions(positions: Position[]): SelectOption[] {
	return positions.map((position) => ({
		value: position.id,
		label: `${position.title} (${position.code})`,
	}));
}

export function transformLevelsToOptions(levels: Level[]): SelectOption[] {
	return levels.map((level) => ({
		value: level.id,
		label: level.name,
	}));
}

export function getNoLevelsMessage(positionId: string | undefined): string | undefined {
	if (!positionId) {
		return "Select a position first";
	}
	return "No levels available for this position";
}

export function shouldDisableLevelSelect(
	positionId: string | undefined,
	availableLevels: Level[],
): boolean {
	return !positionId || availableLevels.length === 0;
}
