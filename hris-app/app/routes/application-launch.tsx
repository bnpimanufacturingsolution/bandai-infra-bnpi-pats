import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import LoadingScreen from "~/components/atoms/LoadingScreen";
import { apiClient } from "~/lib/api-client";
import { resolveExternalLaunchDecision, type ExternalLaunchPayload } from "~/lib/external-launch";
import { getLaunchableApplication, type LaunchableApplication } from "~/lib/launchable-applications";

/**
 * Application launch transition page.
 *
 * Opened in a NEW tab by the Applications launcher. Owns the full
 * authentication-transition experience so the HRIS tab never shows a
 * loading/auth state: bridge session -> redirect to the target app,
 * or present a retryable error. Reuses the existing external-launch
 * auth bridge; it introduces no authentication logic of its own.
 */
export default function ApplicationLaunch() {
	const [searchParams] = useSearchParams();
	const appId = searchParams.get("app");
	const app: LaunchableApplication | null = getLaunchableApplication(appId);

	const [launchError, setLaunchError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	const startLaunch = useCallback(() => {
		setAttempt((value) => value + 1);
	}, []);

	useEffect(() => {
		if (!app) {
			setLaunchError("The requested application is not available.");
			return;
		}
		let cancelled = false;
		setLaunchError(null);
		(async () => {
			try {
				const response = await apiClient.post<ExternalLaunchPayload>(
					"/auth/external-launch",
					{ app: app.id },
				);
				if (cancelled) return;
				const decision = resolveExternalLaunchDecision(response, app.id);
				if (decision.navigate && decision.launchUrl) {
					window.location.assign(decision.launchUrl);
					return;
				}
				setLaunchError(decision.errorMessage ?? "We couldn't establish your session.");
			} catch (error: any) {
				if (cancelled) return;
				setLaunchError(
					error?.message || `We couldn't establish your session for ${app.displayName}.`,
				);
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [appId, attempt]);

	if (!app || launchError) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-white px-6">
				<div className="flex w-full max-w-sm flex-col items-center text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
						<AlertCircle className="h-6 w-6 text-red-500" strokeWidth={1.5} />
					</div>
					<h1 className="mt-5 text-lg font-semibold tracking-tight text-gray-900">
						{app ? `Unable to open ${app.displayName}` : "Application unavailable"}
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-gray-500">
						{app
							? "We couldn't establish your session. Please try again."
							: "The requested application doesn't exist or is no longer available."}
					</p>
					{launchError && app ? (
						<p className="mt-1 text-xs text-gray-400">{launchError}</p>
					) : null}
					{app ? (
						<Button onClick={startLaunch} className="mt-6 min-w-32" variant="default">
							<RotateCw className="h-4 w-4" />
							Try Again
						</Button>
					) : null}
				</div>
			</div>
		);
	}

	return (
		<LoadingScreen
			message={`Opening ${app.displayName}`}
			subtitle={`Establishing session for ${app.displayName}`}
		/>
	);
}
