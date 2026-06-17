export interface SuccessResponse<T = unknown> {
	status: "success";
	message: string;
	data?: T;
	code?: number;
	timestamp: string;
}

export function buildSuccessResponse<T>(
	message: string,
	data?: T,
	statusCode: number = 200,
): SuccessResponse<T> {
	return {
		status: "success",
		message,
		data,
		code: statusCode,
		timestamp: new Date().toISOString(),
	};
}

export const buildPagination = (total: number, page: number, limit: number) => {
	const totalPages = Math.ceil(total / limit);
	return {
		total,
		page,
		limit,
		totalPages,
		hasNext: page < totalPages,
		hasPrev: page > 1,
	};
};
