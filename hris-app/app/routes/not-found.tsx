import { Link } from "react-router";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";

export default function NotFoundPage() {
	return (
		<div className="min-h-screen bg-gradient-to-b from-orange-50 to-white px-4 py-16">
			<div className="mx-auto w-full max-w-2xl rounded-2xl border border-orange-100 bg-white p-8 shadow-sm">
				<div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
					<AlertCircle className="h-3.5 w-3.5" />
					404 Not Found
				</div>
				<h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
				<p className="mt-3 text-sm text-gray-600">
					The route you requested does not exist in the current app hierarchy.
				</p>

				<div className="mt-6 flex flex-wrap gap-3">
					<Link
						to="/dashboard"
						className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
						<Home className="h-4 w-4" />
						Dashboard
					</Link>
					<button
						type="button"
						onClick={() => window.history.back()}
						className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
						<ArrowLeft className="h-4 w-4" />
						Go back
					</button>
				</div>
			</div>
		</div>
	);
}
