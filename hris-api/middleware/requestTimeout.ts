import { Request, Response, NextFunction } from "express";
import { getLogger } from "../helper/logger.helper";

const logger = getLogger();

export interface RequestTimeoutOptions {
	timeoutMs: number;
	label?: string;
}

export const requestTimeout = ({ timeoutMs, label }: RequestTimeoutOptions) => {
	return (req: Request, res: Response, next: NextFunction) => {
		const timeoutLabel = label || req.originalUrl;
		const timeoutHandler = () => {
			logger.warn(
				`Request timeout reached for ${timeoutLabel} (${req.method} ${req.originalUrl}) after ${timeoutMs}ms`,
			);
		};

		req.setTimeout(timeoutMs, timeoutHandler);
		res.setTimeout(timeoutMs, timeoutHandler);

		next();
	};
};
