import { Response } from "express";

export const handleError = (error: unknown, res: Response): void => {
	if (error instanceof Error) {
		if (error.name === "ValidationError") {
			res.status(400).json({
				status: "error",
				message: error.message,
				code: "VALIDATION_ERROR",
				errors: [{ field: "general", message: error.message }],
				timestamp: new Date().toISOString(),
			});
		} else if (error.name === "UnauthorizedError") {
			res.status(401).json({
				status: "error",
				message: error.message,
				code: "UNAUTHORIZED",
				timestamp: new Date().toISOString(),
			});
		} else {
			res.status(500).json({
				status: "error",
				message: error.message,
				code: "INTERNAL_ERROR",
				timestamp: new Date().toISOString(),
			});
		}
	}
};

export const extractPrismaMessage = (message: string): string => {
	const match = message.match(/Unknown field `(\w+)`.*?model `(\w+)`/);
	if (match) {
		const [, field, model] = match;
		return `Invalid field '${field}' in select statement on model '${model}'`;
	}
	return "Invalid Prisma query.";
};
