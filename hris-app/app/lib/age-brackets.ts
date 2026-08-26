export interface AgeBracketDefinition {
	id: string;
	label: string;
	min: number;
	max: number;
}

export const AGE_BRACKETS: AgeBracketDefinition[] = [
	{ id: "18-24", label: "18–24", min: 18, max: 24 },
	{ id: "25-34", label: "25–34", min: 25, max: 34 },
	{ id: "35-44", label: "35–44", min: 35, max: 44 },
	{ id: "45-54", label: "45–54", min: 45, max: 54 },
	{ id: "55-64", label: "55–64", min: 55, max: 64 },
	{ id: "65+", label: "65+", min: 65, max: 200 },
];

export function computeAge(
	dateOfBirth: string | Date | null | undefined,
	asOf: Date = new Date(),
): number | null {
	if (!dateOfBirth) return null;
	const birth = new Date(dateOfBirth);
	if (Number.isNaN(birth.getTime())) return null;
	let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
	const monthDiff = asOf.getUTCMonth() - birth.getUTCMonth();
	if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < birth.getUTCDate())) {
		age -= 1;
	}
	return age >= 0 && age < 130 ? age : null;
}

export interface AgeBracketRow extends AgeBracketDefinition {
	count: number;
}

export function summarizeAgeBrackets(
	people: Array<{ dateOfBirth?: string | Date | null }>,
	asOf: Date = new Date(),
): { rows: AgeBracketRow[]; withAge: number; withoutAge: number; averageAge: number | null } {
	const counts = new Map<string, number>();
	let withAge = 0;
	let ageSum = 0;
	let withoutAge = 0;

	for (const person of people) {
		const age = computeAge(person.dateOfBirth, asOf);
		if (age == null) {
			withoutAge += 1;
			continue;
		}
		withAge += 1;
		ageSum += age;
		const bracket =
			AGE_BRACKETS.find((candidate) => age >= candidate.min && age <= candidate.max) ||
			AGE_BRACKETS[0];
		counts.set(bracket.id, (counts.get(bracket.id) || 0) + 1);
	}

	return {
		rows: AGE_BRACKETS.map((bracket) => ({
			...bracket,
			count: counts.get(bracket.id) || 0,
		})),
		withAge,
		withoutAge,
		averageAge: withAge > 0 ? Math.round((ageSum / withAge) * 10) / 10 : null,
	};
}
