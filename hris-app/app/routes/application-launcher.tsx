import { useAuth } from "~/lib/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Briefcase, GraduationCap, Target, ArrowRight, CheckCircle, Building2, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { useNavigate } from "react-router";
import { useState } from "react";
import { apiClient } from "~/lib/api-client";
import { resolveExternalLaunchDecision, type ExternalLaunchPayload } from "~/lib/external-launch";

export default function ApplicationLauncher() {
	const { user, isLoading } = useAuth();
	const navigate = useNavigate();
	const [launchingApp, setLaunchingApp] = useState<string | null>(null);
	const [launchError, setLaunchError] = useState<string | null>(null);

	const handleExternalLaunch = async (app: "lms" | "epmr") => {
		if (launchingApp) {
			return;
		}
		setLaunchingApp(app);
		setLaunchError(null);
		try {
			const response = await apiClient.post<ExternalLaunchPayload>(
				"/auth/external-launch",
				{ app },
			);
			const decision = resolveExternalLaunchDecision(response, app);
			if (decision.navigate && decision.launchUrl) {
				window.location.assign(decision.launchUrl);
				return;
			}
			setLaunchError(decision.errorMessage ?? null);
		} catch (error: any) {
			setLaunchError(error?.message || `Failed to launch ${app.toUpperCase()}`);
		} finally {
			setLaunchingApp(null);
		}
	};

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gray-50">
				<div className="flex flex-col items-center gap-4">
					<div className="animate-spin rounded-full h-10 w-10 border-3 border-primary border-t-transparent" />
					<p className="text-sm text-gray-600">Loading application launcher</p>
				</div>
			</div>
		);
	}

	if (!user) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-gray-50">
				<div className="text-center">
					<h1 className="text-2xl font-semibold text-gray-900">Authentication Required</h1>
					<p className="mt-2 text-gray-600">Please log in to access the application launcher.</p>
					<Button onClick={() => navigate("/auth/login")} className="mt-6" variant="default">
						Go to Login
					</Button>
				</div>
			</div>
		);
	}

	const userName = user.person?.personalInfo?.firstName
		? `${user.person.personalInfo.firstName} ${user.person.personalInfo.lastName || ""}`.trim()
		: user.email || "User";

	const applications = [
		{
			id: "hris",
			name: "HRIS",
			fullName: "Human Resources Information System",
			description: "Employee management, payroll, attendance, leave, recruitment, and HR operations.",
			icon: Building2,
			iconBg: "bg-blue-100 text-blue-600",
			current: true,
			action: "Open HRIS",
			onClick: () => navigate("/dashboard"),
		},
		{
			id: "lms",
			name: "LMS",
			fullName: "Learning Management System",
			description: "Employee training, courses, learning activities, and assessments.",
			icon: GraduationCap,
			iconBg: "bg-green-100 text-green-600",
			current: false,
			action: "Launch LMS",
			onClick: () => handleExternalLaunch("lms"),
		},
		{
			id: "epmr",
			name: "EPMR",
			fullName: "Employee Performance Management & Review",
			description: "Employee performance evaluation, reviews, goals, and assessments.",
			icon: Target,
			iconBg: "bg-purple-100 text-purple-600",
			current: false,
			action: "Launch EPMR",
			onClick: () => handleExternalLaunch("epmr"),
		},
	];

	return (
		<div className="min-h-screen bg-gray-50 py-12">
			<div className="container mx-auto max-w-7xl px-4 lg:px-6">
				{/* Header */}
				<div className="text-center mb-12">
					<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
						<Briefcase className="h-5 w-5" />
						<span className="text-sm font-medium">Application Launcher</span>
					</div>
					<h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
						Welcome back, {userName}
					</h1>
					<p className="text-lg text-gray-600 max-w-2xl mx-auto">
						Access your organization's applications from a single place.
						Select an application below to get started.
					</p>
				</div>

				{/* Application Grid */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{applications.map((app) => (
						<Card
							key={app.id}
							className={cn(
								"relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1",
								app.current && "ring-2 ring-primary"
							)}>
							{app.current && (
								<div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
							)}
							<CardHeader className="pb-4">
								<div className="flex items-center justify-between">
									<div className={cn("flex h-14 w-14 items-center justify-center rounded-xl", app.iconBg)}>
										<app.icon className="h-7 w-7" />
									</div>
									{app.current && (
										<CheckCircle className="h-5 w-5 text-primary" />
									)}
								</div>
								<div className="mt-4">
									<CardTitle className="text-2xl">{app.name}</CardTitle>
									<p className="text-sm text-gray-500 mt-1">{app.fullName}</p>
								</div>
							</CardHeader>
							<CardContent className="flex flex-col flex-1 pt-0">
								<p className="text-sm text-gray-600 mb-6 flex-1">{app.description}</p>
								<Button
									onClick={app.onClick}
									className="w-full"
									variant={app.current ? "default" : "outline"}
									size="lg"
									disabled={!app.current && launchingApp !== null}
								>
									{launchingApp === app.id ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Launching...
										</>
									) : (
										<>
											{app.action}
											{!app.current && <ArrowRight className="h-4 w-4 ml-2" />}
										</>
									)}
								</Button>
							</CardContent>
						</Card>
					))}
				</div>

				{/* Launch Error */}
				{launchError && (
					<div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200">
						<p className="text-sm text-red-700 text-center">{launchError}</p>
					</div>
				)}

				{/* Footer Note */}
				<div className="mt-12 p-4 rounded-xl bg-white border border-neutral-200">
					<p className="text-sm text-gray-600 text-center">
						<strong className="text-gray-900">Note:</strong> LMS and EPMR launches are
						performed via secure server-side handoff. Your HRIS session is used to
						authenticate with the target application.
					</p>
				</div>
			</div>
		</div>
	);
}