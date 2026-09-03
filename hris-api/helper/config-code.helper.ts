const CONFIG_CODE_STOP_WORDS = new Set([
	"A",
	"AN",
	"AND",
	"AT",
	"BY",
	"FOR",
	"FROM",
	"IN",
	"OF",
	"ON",
	"OR",
	"THE",
	"TO",
	"WITH",
]);

const DEFAULT_MAX_CODE_LENGTH = 12;

const normalizeWords = (value: string): string[] =>
	String(value || "")
		.normalize("NFKD")
		.replace(/[^A-Za-z0-9\s-]/g, " ")
		.trim()
		.split(/[\s_-]+/)
		.map((part) => part.trim().toUpperCase())
		.filter(Boolean);

export const buildConfigCodeAcronym = (
	value: string,
	{ maxLength = DEFAULT_MAX_CODE_LENGTH }: { maxLength?: number } = {},
): string => {
	const words = normalizeWords(value);
	if (!words.length) return "";

	const significantWords = words.filter((word) => !CONFIG_CODE_STOP_WORDS.has(word));
	const tokens = significantWords.length > 0 ? significantWords : words;

	if (tokens.length === 1) {
		return tokens[0].slice(0, Math.min(4, maxLength));
	}

	let acronym = tokens
		.slice(0, 4)
		.map((word) => word[0])
		.join("");

	if (acronym.length < Math.min(3, maxLength)) {
		const firstWord = tokens[0] || "";
		let cursor = 1;
		while (acronym.length < Math.min(3, maxLength) && cursor < firstWord.length) {
			acronym += firstWord[cursor];
			cursor += 1;
		}
	}

	return acronym.slice(0, maxLength);
};

interface SuggestUniqueConfigCodeOptions {
	value: string;
	maxLength?: number;
	isCodeTaken: (candidateCode: string) => Promise<boolean>;
}

export const suggestUniqueConfigCode = async ({
	value,
	maxLength = DEFAULT_MAX_CODE_LENGTH,
	isCodeTaken,
}: SuggestUniqueConfigCodeOptions): Promise<{
	baseCode: string;
	code: string;
	isAvailable: boolean;
}> => {
	const baseCode = buildConfigCodeAcronym(value, { maxLength });

	if (!baseCode) {
		return { baseCode: "", code: "", isAvailable: false };
	}

	if (!(await isCodeTaken(baseCode))) {
		return {
			baseCode,
			code: baseCode,
			isAvailable: true,
		};
	}

	for (let suffix = 2; suffix < 1000; suffix += 1) {
		const suffixText = String(suffix);
		const nextBaseLength = Math.max(1, maxLength - suffixText.length);
		const candidateCode = `${baseCode.slice(0, nextBaseLength)}${suffixText}`;

		if (!(await isCodeTaken(candidateCode))) {
			return {
				baseCode,
				code: candidateCode,
				isAvailable: false,
			};
		}
	}

	throw new Error("Failed to generate a unique code suggestion");
};
