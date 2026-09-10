/**
 * Decision logic for the Application Launcher external launch flow.
 *
 * The HRIS API returns `{ status: "success", data: { launchUrl, app } }`
 * (see `buildSuccessResponse` in hris-api). Older `success: true` payloads
 * are still accepted defensively. Navigation must only happen when the
 * response indicates success AND carries a valid http(s) launch URL.
 */

export interface ExternalLaunchPayload {
	launchUrl?: string;
	app?: string;
}

export interface ExternalLaunchApiResponse {
	status?: string;
	success?: boolean;
	message?: string;
	error?: string;
	code?: number;
	timestamp?: string;
	data?: ExternalLaunchPayload;
}

export interface ExternalLaunchDecision {
	navigate: boolean;
	launchUrl?: string;
	errorMessage?: string;
}

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

export function resolveExternalLaunchDecision(
	response: ExternalLaunchApiResponse | null | undefined,
	fallbackApp: string,
): ExternalLaunchDecision {
	const succeeded = response?.status === "success" || response?.success === true;
	const rawLaunchUrl = response?.data?.launchUrl;
	const launchUrl = typeof rawLaunchUrl === "string" ? rawLaunchUrl.trim() : "";

	if (succeeded && launchUrl && isHttpUrl(launchUrl)) {
		return { navigate: true, launchUrl };
	}

	if (succeeded) {
		return {
			navigate: false,
			errorMessage: `Launch URL missing for ${fallbackApp.toUpperCase()}`,
		};
	}

	return {
		navigate: false,
		errorMessage:
			response?.error || response?.message || `Failed to launch ${fallbackApp.toUpperCase()}`,
	};
}
