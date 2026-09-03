import { Request, Response } from "express";
import { buildErrorResponse } from "../helper/error-handler";
import { config } from "../config/constant";
import { Logger } from "winston";

interface ValidationResult {
	isValid: boolean;
	errorResponse?: object;
	validatedParams?: {
		page: number;
		limit: number;
		order: "asc" | "desc";
		fields?: string;
		searchFields?: string;
		sort?: string | object;
		skip: number;
		query: string;
		document: boolean;
		pagination: boolean;
		count: boolean;
		filter?: string; // <-- raw filter string (key:value,key:value)
		groupBy?: string; // <-- Always an array of strings
		aggregateBy?: string;
		countBy?: string; // <-- Field to group counts by (e.g., "status")
		templateOnly?: boolean;
	};
}

export const validateQueryParams = (req: Request, logger: Logger): ValidationResult => {
	const {
		page = 1,
		limit = 10,
		order = "desc",
		fields,
		sort,
		query,
		searchFields,
		document = "false",
		pagination = "false",
		count = "false",
		filter,
		groupBy,
		aggregateBy,
		countBy,
		templateOnly = "false",
	} = req.query;

	// Validate document
	if (
		document !== undefined &&
		(typeof document !== "string" || !["true", "false"].includes(document))
	) {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_DOCUMENT}: ${document}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse("Document must be 'true' or 'false'", 400),
		};
	}
	const documentValue = document === "true";

	// Validate pagination
	if (
		pagination !== undefined &&
		(typeof pagination !== "string" || !["true", "false"].includes(pagination))
	) {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_PAGINATION}: ${pagination}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse("Pagination must be 'true' or 'false'", 400),
		};
	}
	const paginationValue = pagination === "true";

	// Validate count
	if (count !== undefined && (typeof count !== "string" || !["true", "false"].includes(count))) {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_COUNT}: ${count}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse("Count must be 'true' or 'false'", 400),
		};
	}
	const countValue = count === "true";

	if (
		templateOnly !== undefined &&
		(typeof templateOnly !== "string" || !["true", "false"].includes(templateOnly))
	) {
		logger.error(`Invalid templateOnly query param: ${templateOnly}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse("templateOnly must be 'true' or 'false'", 400),
		};
	}
	const templateOnlyValue = templateOnly === "true";

	// Rule 1: All three cannot be false
	if (!documentValue && !paginationValue && !countValue) {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_COMBINATION}: All flags cannot be false`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse(
				"At least one of document, pagination, or count must be true",
				400,
			),
		};
	}

	// Rule 2: Pagination cannot be true if document is false
	if (paginationValue && !documentValue) {
		logger.error(
			`${config.ERROR.QUERY_PARAMS.INVALID_COMBINATION}: Pagination requires document to be true`,
		);
		return {
			isValid: false,
			errorResponse: buildErrorResponse(
				"Pagination can only be true when document is also true",
				400,
			),
		};
	}

	// Validate page
	const pageNum = Number(page);
	if (isNaN(pageNum) || pageNum < 1) {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_PAGE}: ${page}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse(config.ERROR.QUERY_PARAMS.INVALID_PAGE, 400),
		};
	}

	// Validate limit
	const limitNum = Number(limit);
	if (isNaN(limitNum) || limitNum < 1) {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_LIMIT}: ${limit}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse(config.ERROR.QUERY_PARAMS.INVALID_LIMIT, 400),
		};
	}

	// Validate order
	if (order && !["asc", "desc"].includes(order as string)) {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_ORDER}: ${order}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse(
				config.ERROR.QUERY_PARAMS.ORDER_MUST_BE_ASC_OR_DESC,
				400,
			),
		};
	}

	// Validate fields
	if (fields && typeof fields !== "string") {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_POPULATE}: ${fields}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse(
				config.ERROR.QUERY_PARAMS.POPULATE_MUST_BE_STRING,
				400,
			),
		};
	}

	// Validate sort
	if (sort && typeof sort === "string" && sort.startsWith("{")) {
		try {
			JSON.parse(sort);
		} catch (error) {
			logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_SORT}: ${sort}`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse(
					config.ERROR.QUERY_PARAMS.SORT_MUST_BE_STRING,
					400,
				),
			};
		}
	}

	// Validate query
	if (query !== undefined && typeof query !== "string") {
		logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_QUERY}: ${query}`);
		return {
			isValid: false,
			errorResponse: buildErrorResponse("Query must be a string", 400),
		};
	}
	const queryValue = query !== undefined ? String(query) : "";

	// Validate searchFields
	let searchFieldsValue: string | undefined;
	if (searchFields !== undefined) {
		if (typeof searchFields !== "string") {
			logger.error(`Invalid searchFields query param: ${searchFields}`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse("searchFields must be a comma-separated string", 400),
			};
		}

		searchFieldsValue = searchFields
			.split(",")
			.map((field) => field.trim())
			.filter(Boolean)
			.join(",");
	}

	// Validate filter
	let filterValue: string | undefined;
	if (filter !== undefined) {
		if (typeof filter !== "string") {
			logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_FILTER}: ${filter}`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse(
					"Filter must be a comma-separated string (key:value,key:value)",
					400,
				),
			};
		}
		filterValue = filter;
	}

	// Validate groupBy: return as a single string (not array)
	let groupByValue: string | undefined;
	if (groupBy !== undefined) {
		if (!documentValue) {
			logger.error(
				`${config.ERROR.QUERY_PARAMS.INVALID_COMBINATION}: groupBy requires document=true`,
			);
			return {
				isValid: false,
				errorResponse: buildErrorResponse(
					"groupBy can only be used when document is true",
					400,
				),
			};
		}

		if (typeof groupBy !== "string") {
			logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_GROUPBY}: ${groupBy}`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse(
					"groupBy must be a string (e.g., category or category.name)",
					400,
				),
			};
		}

		const trimmed = groupBy.trim();
		if (!trimmed) {
			logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_GROUPBY}: Empty groupBy value`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse("groupBy must not be empty", 400),
			};
		}
		groupByValue = trimmed;
	}

	// Validate aggregateBy: comma separated list supporting dot-notation
	let aggregateByValue: string | undefined;
	if (aggregateBy !== undefined) {
		if (typeof aggregateBy !== "string") {
			logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_AGGREGATE_BY}: ${aggregateBy}`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse(
					"aggregateBy must be a string (e.g., attendances or department.employees)",
					400,
				),
			};
		}
		const trimmed = aggregateBy
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean)
			.join(",");

		aggregateByValue = trimmed || undefined;
	}

	// Validate countBy: field to group counts by (only works with aggregateBy)
	let countByValue: string | undefined;
	if (countBy !== undefined) {
		if (!aggregateByValue) {
			logger.error(
				`${config.ERROR.QUERY_PARAMS.INVALID_COUNT_BY}: countBy requires aggregateBy to be specified`,
			);
			return {
				isValid: false,
				errorResponse: buildErrorResponse(
					"countBy can only be used when aggregateBy is specified",
					400,
				),
			};
		}

		if (typeof countBy !== "string") {
			logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_COUNT_BY}: ${countBy}`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse("countBy must be a string (e.g., status)", 400),
			};
		}

		const trimmed = countBy.trim();
		if (!trimmed) {
			logger.error(`${config.ERROR.QUERY_PARAMS.INVALID_COUNT_BY}: Empty countBy value`);
			return {
				isValid: false,
				errorResponse: buildErrorResponse("countBy must not be empty", 400),
			};
		}
		countByValue = trimmed;
	}

	return {
		isValid: true,
		validatedParams: {
			page: pageNum,
			limit: limitNum,
			order: order as "asc" | "desc",
			fields: fields as string | undefined,
			searchFields: searchFieldsValue,
			sort: sort as string | undefined,
			skip: (pageNum - 1) * limitNum,
			query: queryValue,
			document: documentValue,
			pagination: paginationValue,
			count: countValue,
			filter: filterValue,
			groupBy: groupByValue, // <-- now just a string or undefined
			aggregateBy: aggregateByValue,
			countBy: countByValue,
			templateOnly: templateOnlyValue,
		},
	};
};
