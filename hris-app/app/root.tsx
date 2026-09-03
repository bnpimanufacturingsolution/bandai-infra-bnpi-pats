import { lazy, Suspense } from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLocation,
} from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

// import type { Route } from "./+types/root";
import "./app.css";
import { queryClient } from "~/lib/query-client";
import { ToastProvider } from "~/lib/contexts/toast-context";
import AuthProvider from "./contexts/auth-provider";
import { PasswordEnforcementGuard } from "./components/guards/password-enforcement-guard";
import { ProvisioningGuard } from "./components/guards/provisioning-guard";

// Font loading is handled by self-hosted Fontsource imports in app.css.
export const links = () => [];

const ReactQueryDevtools = import.meta.env.DEV
	? lazy(async () => {
			const module = await import("@tanstack/react-query-devtools");
			return { default: module.ReactQueryDevtools };
		})
	: null;

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>HR Management System</title>
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	const location = useLocation();
	const isPublicStatusPage = location.pathname === "/status";

	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider disableBootstrap={isPublicStatusPage}>
				<ToastProvider>
					{!isPublicStatusPage && <PasswordEnforcementGuard />}
					{!isPublicStatusPage && <ProvisioningGuard />}
					<Outlet />

					<Toaster
						richColors
						position="top-right"
						swipeDirections={["top", "right", "bottom", "left"]}
					/>
					{ReactQueryDevtools ? (
						<Suspense fallback={null}>
							<ReactQueryDevtools initialIsOpen={false} />
						</Suspense>
					) : null}
				</ToastProvider>
			</AuthProvider>
		</QueryClientProvider>
	);
}

export function ErrorBoundary({ error }: { error: unknown }) {
	let message = "Something went wrong";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;
	let isNotFound = false;

	if (isRouteErrorResponse(error)) {
		isNotFound = error.status === 404;
		message = isNotFound ? "Page not found" : "Request failed";
		details = isNotFound
			? "The page you requested does not exist or the URL is incorrect."
			: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="min-h-screen bg-gradient-to-b from-orange-50 to-white px-4 py-16">
			<div className="mx-auto w-full max-w-2xl rounded-2xl border border-orange-100 bg-white p-8 shadow-sm">
				<div className="mb-3 text-sm font-semibold uppercase tracking-wide text-orange-600">
					{isNotFound ? "404" : "Error"}
				</div>
				<h1 className="text-2xl font-semibold text-gray-900">{message}</h1>
				<p className="mt-3 text-sm text-gray-600">{details}</p>

				<div className="mt-6 flex flex-wrap gap-3">
					<a
						href="/dashboard"
						className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
						Go to Dashboard
					</a>
					<a
						href="/settings"
						className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
						Open Profile
					</a>
					<a
						href="/employee/notifications"
						className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
						View Notifications
					</a>
				</div>
			</div>

			{stack && (
				<pre className="mx-auto mt-6 w-full max-w-2xl overflow-x-auto rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-900">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
