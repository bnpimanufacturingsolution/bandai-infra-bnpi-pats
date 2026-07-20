import { useMemo } from "react";
import { useSearchParams } from "react-router";

import type { AttendanceScopeFilterControl } from "~/components/molecules/AttendanceScopeFilterPopover";
import { useDepartments } from "~/lib/hooks/useDepartments";
import { useLevels } from "~/lib/hooks/useLevels";
import { usePositions } from "~/lib/hooks/usePositions";
import { useSections } from "~/lib/hooks/useSections";

export interface TurnoverAttritionHierarchyFilters {
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
}

function readScopeParam(searchParams: URLSearchParams, key: string) {
	const value = searchParams.get(key);
	return value && value !== "all" ? value : undefined;
}

export function useTurnoverAttritionHierarchyFilters() {
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedDepartment = searchParams.get("department") || "all";
	const selectedSection = searchParams.get("section") || "all";
	const selectedPosition = searchParams.get("position") || "all";
	const selectedLevel = searchParams.get("level") || "all";

	const { data: departmentsData } = useDepartments({ limit: 1000 });
	const departments = departmentsData?.departments || [];

	const { data: sectionsData } = useSections({
		page: 1,
		limit: 1000,
		sort: "name",
		order: "asc",
	});
	const sections = useMemo(
		() => ((sectionsData as any)?.sections || (sectionsData as any)?.data?.sections || []) as any[],
		[sectionsData],
	);

	const { data: positionsData } = usePositions({
		page: 1,
		limit: 1000,
		sort: "title",
		order: "asc",
	});
	const positions = useMemo(
		() => ((positionsData as any)?.positions || (positionsData as any)?.data?.positions || []) as any[],
		[positionsData],
	);

	const { data: levelsData } = useLevels({
		page: 1,
		limit: 1000,
		sort: "rank",
		order: "asc",
	});
	const levels = useMemo(
		() => ((levelsData as any)?.levels || (levelsData as any)?.data?.levels || []) as any[],
		[levelsData],
	);

	const updateSearchParams = (mutator: (params: URLSearchParams) => void) => {
		const nextParams = new URLSearchParams(searchParams);
		mutator(nextParams);
		setSearchParams(nextParams, { replace: true });
	};

	const handleDepartmentFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("department");
			} else {
				params.set("department", value);
			}
			params.delete("section");
			params.delete("position");
			params.delete("level");
		});
	};

	const handleSectionFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("section");
			} else {
				params.set("section", value);
			}
			params.delete("position");
			params.delete("level");
		});
	};

	const handlePositionFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("position");
			} else {
				params.set("position", value);
			}
			params.delete("level");
		});
	};

	const handleLevelFilterChange = (value: string) => {
		updateSearchParams((params) => {
			if (value === "all") {
				params.delete("level");
			} else {
				params.set("level", value);
			}
		});
	};

	const clearHierarchyFilters = () => {
		updateSearchParams((params) => {
			params.delete("department");
			params.delete("section");
			params.delete("position");
			params.delete("level");
		});
	};

	const filteredSections = useMemo(() => {
		const scopedSections = sections.filter((section: any) => {
			if (selectedDepartment === "all") return true;
			return section.departmentId === selectedDepartment;
		});

		if (
			selectedSection !== "all" &&
			!scopedSections.some((section: any) => section.id === selectedSection)
		) {
			const selectedSectionRecord = sections.find((section: any) => section.id === selectedSection);
			if (selectedSectionRecord) scopedSections.unshift(selectedSectionRecord);
		}

		return scopedSections;
	}, [sections, selectedDepartment, selectedSection]);

	const filteredPositions = useMemo(() => {
		const scopedPositions = positions.filter((position: any) => {
			const positionSectionId = String(position.sectionId || position.section?.id || "");
			const positionDepartmentId = String(
				position.section?.departmentId || position.section?.department?.id || "",
			);
			if (selectedSection !== "all") {
				return positionSectionId === selectedSection;
			}
			if (selectedDepartment !== "all") {
				return positionDepartmentId === selectedDepartment;
			}
			return true;
		});

		if (
			selectedPosition !== "all" &&
			!scopedPositions.some((position: any) => position.id === selectedPosition)
		) {
			const selectedPositionRecord = positions.find(
				(position: any) => position.id === selectedPosition,
			);
			if (selectedPositionRecord) scopedPositions.unshift(selectedPositionRecord);
		}

		return scopedPositions;
	}, [positions, selectedDepartment, selectedPosition, selectedSection]);

	const selectedPositionRecord = useMemo(
		() => positions.find((position: any) => position.id === selectedPosition) || null,
		[positions, selectedPosition],
	);
	const selectedLevelRecord = useMemo(
		() => levels.find((level: any) => level.id === selectedLevel) || null,
		[levels, selectedLevel],
	);

	const filteredLevels = useMemo(() => {
		const levelById = new Map<string, any>();
		const scopedPositions =
			selectedPosition !== "all"
				? selectedPositionRecord
					? [selectedPositionRecord]
					: []
				: filteredPositions;

		scopedPositions.forEach((position: any) => {
			(Array.isArray(position.levels) ? position.levels : []).forEach((entry: any) => {
				const levelId = String(entry?.level?.id || entry?.levelId || entry?.id || "").trim();
				if (!levelId || levelById.has(levelId)) return;
				const levelRecord =
					levels.find((level: any) => level.id === levelId) ||
					entry?.level ||
					(entry?.id ? entry : null);
				if (levelRecord) {
					levelById.set(levelId, levelRecord);
				}
			});
		});

		const scopedLevels = Array.from(levelById.values()).sort((left, right) => {
			const leftRank = Number(left.rank ?? left.level?.rank ?? 0);
			const rightRank = Number(right.rank ?? right.level?.rank ?? 0);
			if (leftRank !== rightRank) return leftRank - rightRank;
			const leftName = String(left.name || left.level?.name || "");
			const rightName = String(right.name || right.level?.name || "");
			return leftName.localeCompare(rightName);
		});

		if (
			selectedLevel !== "all" &&
			!scopedLevels.some((level: any) => level.id === selectedLevel)
		) {
			if (selectedLevelRecord) scopedLevels.unshift(selectedLevelRecord);
		}

		return scopedLevels;
	}, [
		filteredPositions,
		levels,
		selectedLevel,
		selectedLevelRecord,
		selectedPosition,
		selectedPositionRecord,
	]);

	const hierarchyFilterControls = useMemo<AttendanceScopeFilterControl[]>(
		() => [
			{
				key: "department",
				label: "Department",
				value: selectedDepartment,
				options: [
					{ value: "all", label: "All Departments" },
					...departments.map((dept: any) => ({
						value: dept.id,
						label: dept.name,
					})),
				],
				onChange: handleDepartmentFilterChange,
			},
			{
				key: "section",
				label: "Section",
				value: selectedSection,
				options: [
					{ value: "all", label: "All Sections" },
					...filteredSections.map((section: any) => ({
						value: section.id,
						label: section.name,
					})),
				],
				onChange: handleSectionFilterChange,
			},
			{
				key: "position",
				label: "Position",
				value: selectedPosition,
				options: [
					{ value: "all", label: "All Positions" },
					...filteredPositions.map((position: any) => ({
						value: position.id,
						label: position.title,
					})),
				],
				onChange: handlePositionFilterChange,
			},
			{
				key: "level",
				label: "Level",
				value: selectedLevel,
				options: [
					{ value: "all", label: "All Levels" },
					...filteredLevels.map((level: any) => ({
						value: level.id,
						label: level.name,
					})),
				],
				onChange: handleLevelFilterChange,
			},
		],
		[
			departments,
			filteredLevels,
			filteredPositions,
			filteredSections,
			selectedDepartment,
			selectedLevel,
			selectedPosition,
			selectedSection,
		],
	);

	const apiFilters = useMemo<TurnoverAttritionHierarchyFilters>(
		() => ({
			departmentId: readScopeParam(searchParams, "department"),
			sectionId: readScopeParam(searchParams, "section"),
			positionId: readScopeParam(searchParams, "position"),
			levelId: readScopeParam(searchParams, "level"),
		}),
		[searchParams],
	);

	return {
		hierarchyFilterControls,
		apiFilters,
		clearHierarchyFilters,
	};
}