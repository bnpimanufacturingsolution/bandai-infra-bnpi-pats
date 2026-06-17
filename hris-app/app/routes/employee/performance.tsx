import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import {
	Target,
	TrendingUp,
	TrendingDown,
	Star,
	CheckCircle,
	XCircle,
	AlertCircle,
	Plus,
	Edit,
	Eye,
	Calendar,
	Users,
	Award,
	FileText,
	MessageSquare,
	BarChart3,
	PieChart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

export default function PerformanceManagement() {
	const location = useLocation();
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState("dashboard");
	const [selectedPeriod, setSelectedPeriod] = useState("Q4 2024");

	// Sync active tab to pathname and redirect index to /dashboard
	useEffect(() => {
		const pathname = location.pathname;
		if (pathname === "/employee/performance") {
			navigate("/employee/performance/dashboard", { replace: true });
			return;
		}
		if (pathname.includes("/dashboard")) setActiveTab("dashboard");
		else if (pathname.includes("/goals")) setActiveTab("goals");
		else if (pathname.includes("/feedback")) setActiveTab("feedback");
		else if (pathname.includes("/development")) setActiveTab("development");
		else if (pathname.includes("/recognition")) setActiveTab("recognition");
		else if (pathname.includes("/reviews")) setActiveTab("reviews");
	}, [location.pathname, navigate]);

	const performanceMetrics = {
		overallRating: 4.2,
		goalCompletion: 85,
		kpiScore: 92,
		teamCollaboration: 88,
		initiative: 90,
		communication: 87,
	};

	const currentGoals = [
		{
			id: 1,
			title: "Complete React Advanced Course",
			description: "Finish the advanced React development course and obtain certification",
			progress: 75,
			deadline: "2024-12-31",
			status: "On Track",
			priority: "High",
			category: "Learning & Development",
		},
		{
			id: 2,
			title: "Lead Q4 Project Delivery",
			description: "Successfully deliver the Q4 product features on time and within budget",
			progress: 90,
			deadline: "2024-12-20",
			status: "On Track",
			priority: "High",
			category: "Project Management",
		},
		{
			id: 3,
			title: "Improve Code Review Process",
			description: "Implement new code review guidelines and train team members",
			progress: 60,
			deadline: "2025-01-15",
			status: "On Track",
			priority: "Medium",
			category: "Process Improvement",
		},
		{
			id: 4,
			title: "Mentor Junior Developer",
			description: "Provide guidance and support to new team member",
			progress: 100,
			deadline: "2024-12-15",
			status: "Completed",
			priority: "Medium",
			category: "Leadership",
		},
	];

	const feedbackHistory = [
		{
			id: 1,
			type: "Manager Feedback",
			from: "Sarah Johnson",
			date: "2024-12-10",
			rating: 4.5,
			summary:
				"Excellent work on the Q4 project delivery. Strong leadership and technical skills demonstrated.",
			category: "Quarterly Review",
		},
		{
			id: 2,
			type: "Peer Review",
			from: "Mike Wilson",
			date: "2024-11-25",
			rating: 4.0,
			summary:
				"Great collaboration on the team project. Always willing to help and share knowledge.",
			category: "360 Review",
		},
		{
			id: 3,
			type: "Self Evaluation",
			from: "John Doe",
			date: "2024-11-20",
			rating: 4.2,
			summary:
				"I've made good progress on my learning goals and project deliverables this quarter.",
			category: "Self Assessment",
		},
		{
			id: 4,
			type: "Manager Feedback",
			from: "Sarah Johnson",
			date: "2024-10-15",
			rating: 4.3,
			summary:
				"Strong performance in code quality and team collaboration. Keep up the great work!",
			category: "Monthly Check-in",
		},
	];

	const developmentPlans = [
		{
			skill: "Leadership",
			currentLevel: "Intermediate",
			targetLevel: "Advanced",
			progress: 60,
			actionItems: [
				"Complete leadership workshop",
				"Lead cross-functional project",
				"Provide mentorship to junior team members",
			],
			deadline: "2025-06-30",
		},
		{
			skill: "System Design",
			currentLevel: "Intermediate",
			targetLevel: "Advanced",
			progress: 45,
			actionItems: [
				"Study system design patterns",
				"Design scalable architecture for new project",
				"Present design to architecture team",
			],
			deadline: "2025-03-31",
		},
		{
			skill: "Public Speaking",
			currentLevel: "Beginner",
			targetLevel: "Intermediate",
			progress: 30,
			actionItems: [
				"Join Toastmasters club",
				"Present at team meetings",
				"Speak at company tech talks",
			],
			deadline: "2025-12-31",
		},
	];

	const recognitionReceived = [
		{
			id: 1,
			type: "Team Player Award",
			from: "Sarah Johnson",
			date: "2024-12-05",
			description: "Recognized for excellent collaboration and support during the Q4 project",
			category: "Teamwork",
		},
		{
			id: 2,
			type: "Innovation Badge",
			from: "Engineering Team",
			date: "2024-11-20",
			description: "For implementing new code review process that improved team efficiency",
			category: "Innovation",
		},
		{
			id: 3,
			type: "Mentor Recognition",
			from: "HR Department",
			date: "2024-10-15",
			description:
				"Outstanding mentorship of junior developer, helping them grow and succeed",
			category: "Leadership",
		},
		{
			id: 4,
			type: "Quality Excellence",
			from: "Quality Assurance Team",
			date: "2024-09-30",
			description:
				"Consistently high code quality with minimal bugs and excellent documentation",
			category: "Quality",
		},
	];

	const performanceReviews = [
		{
			period: "Q4 2024",
			reviewer: "Sarah Johnson",
			date: "2024-12-15",
			status: "Completed",
			overallRating: 4.2,
			summary:
				"Strong performance across all areas. Excellent technical skills and team collaboration.",
		},
		{
			period: "Q3 2024",
			reviewer: "Sarah Johnson",
			date: "2024-09-30",
			status: "Completed",
			overallRating: 4.0,
			summary: "Good progress on development goals. Continue focusing on leadership skills.",
		},
		{
			period: "Mid-Year 2024",
			reviewer: "Sarah Johnson",
			date: "2024-06-30",
			status: "Completed",
			overallRating: 4.1,
			summary: "Solid performance with room for growth in project management skills.",
		},
	];

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "Completed":
			case "On Track":
				return <CheckCircle className="w-4 h-4 text-orange-600" />;
			case "At Risk":
				return <AlertCircle className="w-4 h-4 text-yellow-600" />;
			case "Overdue":
				return <XCircle className="w-4 h-4 text-orange-600" />;
			default:
				return null;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "Completed":
			case "On Track":
				return "bg-orange-100 text-orange-800";
			case "At Risk":
				return "bg-yellow-100 text-yellow-800";
			case "Overdue":
				return "bg-orange-100 text-orange-800";
			default:
				return "bg-gray-100 text-gray-800";
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority) {
			case "High":
				return "bg-orange-100 text-orange-800";
			case "Medium":
				return "bg-yellow-100 text-yellow-800";
			case "Low":
				return "bg-orange-100 text-orange-800";
			default:
				return "bg-gray-100 text-gray-800";
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900">Performance Management</h1>
					<p className="text-gray-600">
						Track your performance, goals, and career development
					</p>
				</div>
				<div className="flex items-center gap-2">
					<select
						value={selectedPeriod}
						onChange={(e) => setSelectedPeriod(e.target.value)}
						className="border border-gray-300 rounded px-3 py-1 text-sm">
						<option value="Q4 2024">Q4 2024</option>
						<option value="Q3 2024">Q3 2024</option>
						<option value="Q2 2024">Q2 2024</option>
					</select>
				</div>
			</div>

			{/* Navigation handled from sidebar sub-items */}

			{/* Performance Dashboard */}
			{activeTab === "dashboard" && (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<BarChart3 className="w-5 h-5" />
								Performance Metrics - {selectedPeriod}
							</CardTitle>
							<CardDescription>
								Current performance rating, goal progress, and KPIs
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 md:grid-cols-3 gap-6">
								<div className="text-center">
									<div className="text-3xl font-bold text-blue-600 mb-2">
										{performanceMetrics.overallRating}
									</div>
									<div className="text-sm text-gray-600 mb-2">Overall Rating</div>
									<div className="flex justify-center">
										{Array.from({ length: 5 }, (_, i) => (
											<Star
												key={i}
												className={`w-4 h-4 ${
													i < Math.floor(performanceMetrics.overallRating)
														? "text-yellow-500"
														: "text-gray-300"
												}`}
											/>
										))}
									</div>
								</div>
								<div className="text-center">
									<div className="text-3xl font-bold text-orange-600 mb-2">
										{performanceMetrics.goalCompletion}%
									</div>
									<div className="text-sm text-gray-600 mb-2">
										Goal Completion
									</div>
									<div className="w-full bg-gray-200 rounded-full h-2">
										<div
											className="bg-orange-500 h-2 rounded-full"
											style={{
												width: `${performanceMetrics.goalCompletion}%`,
											}}></div>
									</div>
								</div>
								<div className="text-center">
									<div className="text-3xl font-bold text-purple-600 mb-2">
										{performanceMetrics.kpiScore}%
									</div>
									<div className="text-sm text-gray-600 mb-2">KPI Score</div>
									<div className="w-full bg-gray-200 rounded-full h-2">
										<div
											className="bg-purple-500 h-2 rounded-full"
											style={{
												width: `${performanceMetrics.kpiScore}%`,
											}}></div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<PieChart className="w-5 h-5" />
								Competency Scores
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-3">
								<div>
									<div className="flex justify-between text-sm mb-1">
										<span className="text-gray-600">Team Collaboration</span>
										<span className="text-gray-900">
											{performanceMetrics.teamCollaboration}%
										</span>
									</div>
									<div className="w-full bg-gray-200 rounded-full h-2">
										<div
											className="bg-blue-500 h-2 rounded-full"
											style={{
												width: `${performanceMetrics.teamCollaboration}%`,
											}}></div>
									</div>
								</div>
								<div>
									<div className="flex justify-between text-sm mb-1">
										<span className="text-gray-600">Initiative</span>
										<span className="text-gray-900">
											{performanceMetrics.initiative}%
										</span>
									</div>
									<div className="w-full bg-gray-200 rounded-full h-2">
										<div
											className="bg-orange-500 h-2 rounded-full"
											style={{
												width: `${performanceMetrics.initiative}%`,
											}}></div>
									</div>
								</div>
								<div>
									<div className="flex justify-between text-sm mb-1">
										<span className="text-gray-600">Communication</span>
										<span className="text-gray-900">
											{performanceMetrics.communication}%
										</span>
									</div>
									<div className="w-full bg-gray-200 rounded-full h-2">
										<div
											className="bg-orange-500 h-2 rounded-full"
											style={{
												width: `${performanceMetrics.communication}%`,
											}}></div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Goal Setting */}
			{activeTab === "goals" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Target className="w-5 h-5" />
							Goal Setting
						</CardTitle>
						<CardDescription>
							Personal and team objectives with milestone tracking
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center justify-between mb-6">
							<div className="text-sm text-gray-600">
								{currentGoals.length} active goals
							</div>
							<Button className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white">
								<Plus className="w-4 h-4" />
								Add New Goal
							</Button>
						</div>
						<div className="space-y-4">
							{currentGoals.map((goal) => (
								<div key={goal.id} className="p-4 border rounded-lg">
									<div className="flex items-center justify-between mb-3">
										<div className="flex items-center gap-2">
											{getStatusIcon(goal.status)}
											<span className="font-medium text-gray-900">
												{goal.title}
											</span>
										</div>
										<div className="flex items-center gap-2">
											<span
												className={`px-2 py-1 rounded-full text-xs ${getStatusColor(goal.status)}`}>
												{goal.status}
											</span>
											<span
												className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(goal.priority)}`}>
												{goal.priority}
											</span>
										</div>
									</div>
									<div className="text-sm text-gray-600 mb-3">
										{goal.description}
									</div>
									<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
										<div>
											<div className="text-sm text-gray-600">Category</div>
											<div className="font-medium">{goal.category}</div>
										</div>
										<div>
											<div className="text-sm text-gray-600">Deadline</div>
											<div className="font-medium">{goal.deadline}</div>
										</div>
										<div>
											<div className="text-sm text-gray-600">Progress</div>
											<div className="font-medium">{goal.progress}%</div>
										</div>
									</div>
									<div className="mb-4">
										<div className="w-full bg-gray-200 rounded-full h-2">
											<div
												className="bg-orange-500 h-2 rounded-full"
												style={{ width: `${goal.progress}%` }}></div>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											className="flex items-center gap-1">
											<Eye className="w-3 h-3" />
											View Details
										</Button>
										<Button
											variant="outline"
											size="sm"
											className="flex items-center gap-1">
											<Edit className="w-3 h-3" />
											Edit Goal
										</Button>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Feedback History */}
			{activeTab === "feedback" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageSquare className="w-5 h-5" />
							Feedback History
						</CardTitle>
						<CardDescription>
							Manager feedback, peer reviews, and self-evaluations
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{feedbackHistory.map((feedback) => (
								<div key={feedback.id} className="p-4 border rounded-lg">
									<div className="flex items-center justify-between mb-3">
										<div className="flex items-center gap-2">
											<MessageSquare className="w-4 h-4 text-gray-400" />
											<span className="font-medium text-gray-900">
												{feedback.type}
											</span>
										</div>
										<div className="flex items-center gap-2">
											<div className="flex items-center gap-1">
												<Star className="w-4 h-4 text-yellow-500" />
												<span className="text-sm text-gray-600">
													{feedback.rating}
												</span>
											</div>
											<span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
												{feedback.category}
											</span>
										</div>
									</div>
									<div className="space-y-2 mb-3">
										<div className="text-sm text-gray-600">
											From: {feedback.from}
										</div>
										<div className="text-sm text-gray-600">
											Date: {feedback.date}
										</div>
									</div>
									<div className="text-sm text-gray-700 mb-3">
										{feedback.summary}
									</div>
									<Button
										variant="outline"
										size="sm"
										className="flex items-center gap-1">
										<Eye className="w-3 h-3" />
										View Full Feedback
									</Button>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Development Plans */}
			{activeTab === "development" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TrendingUp className="w-5 h-5" />
							Development Plans
						</CardTitle>
						<CardDescription>
							Skills improvement areas, action items, and progress updates
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-6">
							{developmentPlans.map((plan, index) => (
								<div key={index} className="p-4 border rounded-lg">
									<div className="flex items-center justify-between mb-3">
										<div>
											<div className="font-medium text-gray-900">
												{plan.skill}
											</div>
											<div className="text-sm text-gray-600">
												{plan.currentLevel} → {plan.targetLevel}
											</div>
										</div>
										<div className="text-right">
											<div className="text-2xl font-bold text-gray-900">
												{plan.progress}%
											</div>
											<div className="text-sm text-gray-600">Progress</div>
										</div>
									</div>
									<div className="mb-4">
										<div className="w-full bg-gray-200 rounded-full h-2">
											<div
												className="bg-blue-500 h-2 rounded-full"
												style={{ width: `${plan.progress}%` }}></div>
										</div>
									</div>
									<div className="mb-4">
										<div className="text-sm font-medium text-gray-700 mb-2">
											Action Items:
										</div>
										<div className="space-y-1">
											{plan.actionItems.map((item, itemIndex) => (
												<div
													key={itemIndex}
													className="flex items-center gap-2 text-sm text-gray-600">
													<CheckCircle className="w-3 h-3 text-orange-600" />
													{item}
												</div>
											))}
										</div>
									</div>
									<div className="flex items-center justify-between">
										<div className="text-sm text-gray-600">
											Target Date: {plan.deadline}
										</div>
										<Button
											variant="outline"
											size="sm"
											className="flex items-center gap-1">
											<Edit className="w-3 h-3" />
											Update Progress
										</Button>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Recognition Received */}
			{activeTab === "recognition" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Award className="w-5 h-5" />
							Recognition Received
						</CardTitle>
						<CardDescription>
							Peer recognitions, awards, and achievement badges
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{recognitionReceived.map((recognition) => (
								<div key={recognition.id} className="p-4 border rounded-lg">
									<div className="flex items-center gap-3 mb-3">
										<Award className="w-5 h-5 text-yellow-600" />
										<div className="flex-1">
											<div className="font-medium text-gray-900">
												{recognition.type}
											</div>
											<div className="text-sm text-gray-600">
												From: {recognition.from} • {recognition.date}
											</div>
										</div>
										<span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
											{recognition.category}
										</span>
									</div>
									<div className="text-sm text-gray-700 mb-3">
										{recognition.description}
									</div>
									<Button
										variant="outline"
										size="sm"
										className="flex items-center gap-1">
										<Eye className="w-3 h-3" />
										View Details
									</Button>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Performance Reviews */}
			{activeTab === "reviews" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="w-5 h-5" />
							Performance Reviews
						</CardTitle>
						<CardDescription>
							Annual reviews, mid-year assessments, and development discussions
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{performanceReviews.map((review, index) => (
								<div key={index} className="p-4 border rounded-lg">
									<div className="flex items-center justify-between mb-3">
										<div>
											<div className="font-medium text-gray-900">
												{review.period}
											</div>
											<div className="text-sm text-gray-600">
												Reviewer: {review.reviewer} • {review.date}
											</div>
										</div>
										<div className="flex items-center gap-2">
											<div className="flex items-center gap-1">
												<Star className="w-4 h-4 text-yellow-500" />
												<span className="text-sm text-gray-600">
													{review.overallRating}
												</span>
											</div>
											<span
												className={`px-2 py-1 rounded-full text-xs ${getStatusColor(review.status)}`}>
												{review.status}
											</span>
										</div>
									</div>
									<div className="text-sm text-gray-700 mb-3">
										{review.summary}
									</div>
									<Button
										variant="outline"
										size="sm"
										className="flex items-center gap-1">
										<Eye className="w-3 h-3" />
										View Full Review
									</Button>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
