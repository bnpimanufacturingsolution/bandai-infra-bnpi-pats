import { Link } from "react-router";
import { Shield, Home, ArrowLeft } from "lucide-react";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { useAuth } from "~/lib/hooks/use-auth";

export default function AccessDeniedPage() {
	const { user } = useAuth();

	console.log(JSON.stringify(user, null, 2));

	return (
		<div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center px-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
						<Shield className="w-8 h-8 text-red-600" />
					</div>
					<CardTitle className="text-2xl font-bold text-gray-900">
						Access Denied
					</CardTitle>
					<CardDescription className="text-gray-600">
						You don&apos;t have permission to access this page. Please contact your
						administrator if you believe this is an error.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="text-center">
						<p className="text-sm text-gray-500 mb-4">Error Code: 403 - Forbidden</p>
					</div>
					<div className="flex flex-col gap-2">
						<Button asChild className="w-full">
							<Link to="/auth/login">
								<ArrowLeft className="w-4 h-4 mr-2" />
								Back to Login
							</Link>
						</Button>
						<Button variant="outline" asChild className="w-full">
							<Link to="/">
								<Home className="w-4 h-4 mr-2" />
								Go Home
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
