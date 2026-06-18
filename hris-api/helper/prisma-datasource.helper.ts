type LoggerLike = {
	error: (message: string, meta?: Record<string, unknown>) => void;
};

export class PrismaDatasourceConfigError extends Error {
	override name = "PrismaDatasourceConfigError";

	constructor(
		message: string,
		public readonly details: {
			context: string;
			displayValue: string;
			reason: string;
		},
	) {
		super(message);
	}
}

export type PrismaDatasourceValidationResult = {
	valid: boolean;
	displayValue: string;
	reason?: string;
};

const VALID_PREFIXES = ["mongodb://", "mongodb+srv://", "postgresql://", "postgres://"];
const loggedInvalidDatasourceKeys = new Set<string>();

const redactDatasourceUrl = (value: string): string => {
	const trimmed = value.trim();
	if (!trimmed) return "<empty>";

	try {
		const parsed = new URL(trimmed);
		const host = parsed.hostname || "<unknown-host>";
		const port = parsed.port ? `:${parsed.port}` : "";
		const pathname = parsed.pathname || "";
		return `${parsed.protocol}//${host}${port}${pathname}`;
	} catch {
		const schemeMatch = trimmed.match(/^[a-z0-9+.-]+:\/\//i);
		return schemeMatch ? `${schemeMatch[0]}[redacted]` : "<unparseable>";
	}
};

export const validatePrismaDatasourceUrl = (
	rawValue: string | undefined = process.env.PG_DATABASE_URL || process.env.DATABASE_URL,
): PrismaDatasourceValidationResult => {
	const value = String(rawValue || "").trim();
	const displayValue = redactDatasourceUrl(value);

	if (!value) {
		return {
			valid: false,
			displayValue,
			reason:
				"Effective Prisma datasource URL is empty. Set PG_DATABASE_URL (preferred) or DATABASE_URL. dotenv.config() does not override an already-exported shell or IDE environment variable.",
		};
	}

	if (VALID_PREFIXES.some((prefix) => value.startsWith(prefix))) {
		return {
			valid: true,
			displayValue,
		};
	}

	return {
		valid: false,
		displayValue,
		reason:
			"Effective Prisma datasource URL must start with `mongodb://`, `mongodb+srv://`, `postgresql://`, or `postgres://`. Set PG_DATABASE_URL (preferred) or DATABASE_URL. Checked-in .env files do not override an already-exported shell or IDE environment variable because dotenv.config() preserves the existing process environment.",
	};
};

export const assertValidPrismaDatasourceUrl = (params: {
	context: string;
	logger?: LoggerLike;
	rawValue?: string | undefined;
}) => {
	const result = validatePrismaDatasourceUrl(params.rawValue);

	if (result.valid) {
		return result;
	}

	const key = `${params.context}:${result.displayValue}:${result.reason}`;
	if (params.logger && !loggedInvalidDatasourceKeys.has(key)) {
		loggedInvalidDatasourceKeys.add(key);
		params.logger.error("prisma.datasource.invalid", {
			event: "prisma.datasource.invalid",
			context: params.context,
			database_url: result.displayValue,
			reason: result.reason,
		});
	}

	throw new PrismaDatasourceConfigError("Invalid Prisma datasource configuration", {
		context: params.context,
		displayValue: result.displayValue,
		reason: result.reason || "Unknown datasource validation error",
	});
};
