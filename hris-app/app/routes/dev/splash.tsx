import { useSearchParams } from "react-router";
import LoadingScreen from "~/components/atoms/LoadingScreen";

/**
 * Dev-only preview of the branded splash / LoadingScreen.
 * Stays on screen forever — no auth checks, no redirects.
 *
 * Open: /dev/splash
 * Optional: /dev/splash?message=Redirecting
 */
export default function SplashPreviewPage() {
	const [searchParams] = useSearchParams();
	const message = searchParams.get("message") || "Redirecting";

	return (
		<LoadingScreen
			message={message}
			subtitle="Splash preview — this route never navigates away"
		/>
	);
}

export function meta() {
	return [
		{ title: "Splash preview · Bandai HRIS" },
		{ name: "robots", content: "noindex, nofollow" },
	];
}
