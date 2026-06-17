import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { UnifiedSearchBar } from "~/components/molecules/shared/UnifiedSearchBar";
import {
	HelpCircle,
	Search,
	MessageSquare,
	Phone,
	Mail,
	User,
	FileText,
	Video,
	Star,
	Send,
	ChevronDown,
	ChevronRight,
	BookOpen,
	Headphones,
	AlertCircle,
	Info,
	CheckCircle,
	XCircle,
	Clock,
	Eye,
} from "lucide-react";
import { useState } from "react";

export function HelpSupport() {
	const [activeTab, setActiveTab] = useState("faq");
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedFAQ, setExpandedFAQ] = useState<string[]>([]);
	const [chatMessage, setChatMessage] = useState("");

	const tabs = [
		{ id: "faq", label: "FAQ Section" },
		{ id: "contacts", label: "Contact Directory" },
		{ id: "guides", label: "User Guides" },
		{ id: "videos", label: "Video Tutorials" },
		{ id: "resources", label: "Resource Center" },
		{ id: "feedback", label: "Feedback System" },
		{ id: "chat", label: "Live Chat" },
	];

	const faqCategories = [
		{
			category: "Payroll & Benefits",
			questions: [
				{
					id: "payroll-1",
					question: "How do I view my payslip?",
					answer: "You can view your payslip by going to My Payroll > Current Payslip. You can also download previous payslips from the Payslip History section.",
				},
				{
					id: "payroll-2",
					question: "When will I receive my salary?",
					answer: "Salaries are processed bi-weekly and deposited directly into your bank account. You can check the exact date in your payroll dashboard.",
				},
				{
					id: "payroll-3",
					question: "How do I update my banking information?",
					answer: "Go to My Profile > Banking Information and click Edit Profile. You can update your bank details, but changes may take 1-2 pay periods to take effect.",
				},
			],
		},
		{
			category: "Leave Management",
			questions: [
				{
					id: "leave-1",
					question: "How do I request time off?",
					answer: "Navigate to Leave Management > Request Leave and fill out the leave request form. Make sure to provide sufficient notice as per company policy.",
				},
				{
					id: "leave-2",
					question: "What types of leave are available?",
					answer: "We offer vacation leave, sick leave, emergency leave, and special leave. Each type has different accrual rates and approval requirements.",
				},
				{
					id: "leave-3",
					question: "How much leave do I have remaining?",
					answer: "Check your leave balances in Leave Management > Leave Balances. This shows your total, used, and remaining days for each leave type.",
				},
			],
		},
		{
			category: "Time & Attendance",
			questions: [
				{
					id: "attendance-1",
					question: "How do I clock in and out?",
					answer: "Use the Clock In/Out button on the Time & Attendance page or the quick action button on your dashboard. Make sure you're in the office location.",
				},
				{
					id: "attendance-2",
					question: "What if I forget to clock out?",
					answer: "Contact your manager or HR to manually adjust your attendance record. You can also submit a request through the Requests & Services page.",
				},
				{
					id: "attendance-3",
					question: "How do I request overtime?",
					answer: "Go to Time & Attendance > Overtime Summary and click Request Overtime. Make sure to get prior approval from your manager.",
				},
			],
		},
		{
			category: "Learning & Development",
			questions: [
				{
					id: "learning-1",
					question: "How do I enroll in a course?",
					answer: "Browse available courses in Learning & Development > Course Catalog and click Enroll Now on the course you're interested in.",
				},
				{
					id: "learning-2",
					question: "Where can I find my certificates?",
					answer: "Your completed certificates are available in Learning & Development > Certifications. You can download them as PDF files.",
				},
				{
					id: "learning-3",
					question: "How do I track my learning progress?",
					answer: "Check My Courses section to see your enrolled courses and progress. You can also view your learning history and skill assessments.",
				},
			],
		},
	];

	const contactDirectory = [
		{
			department: "Human Resources",
			contacts: [
				{
					name: "Mike Wilson",
					title: "Head of HR",
					email: "mike.wilson@company.com",
					phone: "+1 (555) 000-0003",
					availability: "Mon-Fri, 9 AM - 6 PM",
				},
				{
					name: "Sarah Johnson",
					title: "HR Specialist",
					email: "sarah.johnson@company.com",
					phone: "+1 (555) 000-0004",
					availability: "Mon-Fri, 8 AM - 5 PM",
				},
			],
		},
		{
			department: "IT Support",
			contacts: [
				{
					name: "David Brown",
					title: "IT Manager",
					email: "david.brown@company.com",
					phone: "+1 (555) 000-0005",
					availability: "Mon-Fri, 9 AM - 6 PM",
				},
				{
					name: "Emily Davis",
					title: "IT Support Specialist",
					email: "emily.davis@company.com",
					phone: "+1 (555) 000-0006",
					availability: "24/7 Support",
				},
			],
		},
		{
			department: "Payroll",
			contacts: [
				{
					name: "Lisa Wang",
					title: "Payroll Manager",
					email: "lisa.wang@company.com",
					phone: "+1 (555) 000-0007",
					availability: "Mon-Fri, 9 AM - 5 PM",
				},
			],
		},
		{
			department: "Facilities",
			contacts: [
				{
					name: "Tom Rodriguez",
					title: "Facilities Manager",
					email: "tom.rodriguez@company.com",
					phone: "+1 (555) 000-0008",
					availability: "Mon-Fri, 8 AM - 6 PM",
				},
			],
		},
	];

	const userGuides = [
		{
			title: "Getting Started with the HR Portal",
			description: "Complete guide for new employees on how to use the HR portal",
			category: "Getting Started",
			difficulty: "Beginner",
			estimatedTime: "15 minutes",
		},
		{
			title: "How to Request Leave",
			description: "Step-by-step guide on requesting different types of leave",
			category: "Leave Management",
			difficulty: "Beginner",
			estimatedTime: "10 minutes",
		},
		{
			title: "Understanding Your Payslip",
			description: "Detailed explanation of payslip components and deductions",
			category: "Payroll",
			difficulty: "Intermediate",
			estimatedTime: "20 minutes",
		},
		{
			title: "Setting Up Two-Factor Authentication",
			description: "Security guide for enabling 2FA on your account",
			category: "Security",
			difficulty: "Intermediate",
			estimatedTime: "10 minutes",
		},
		{
			title: "Using the Mobile App",
			description: "Complete guide to using the HR portal mobile application",
			category: "Mobile",
			difficulty: "Beginner",
			estimatedTime: "25 minutes",
		},
	];

	const videoTutorials = [
		{
			title: "HR Portal Overview",
			description: "Introduction to the HR portal and its main features",
			duration: "5:30",
			category: "Getting Started",
			views: 1250,
			rating: 4.8,
		},
		{
			title: "Leave Request Process",
			description: "How to submit and track leave requests",
			duration: "3:45",
			category: "Leave Management",
			views: 890,
			rating: 4.6,
		},
		{
			title: "Payroll Dashboard Walkthrough",
			description: "Understanding your payroll information and payslips",
			duration: "7:20",
			category: "Payroll",
			views: 1100,
			rating: 4.9,
		},
		{
			title: "Performance Management",
			description: "Setting goals and tracking performance metrics",
			duration: "6:15",
			category: "Performance",
			views: 750,
			rating: 4.7,
		},
	];

	const resources = [
		{
			name: "Employee Handbook",
			description: "Complete guide to company policies and procedures",
			type: "PDF",
			size: "2.5 MB",
			lastUpdated: "2024-12-01",
		},
		{
			name: "IT Support Guide",
			description: "Common IT issues and troubleshooting steps",
			type: "PDF",
			size: "1.2 MB",
			lastUpdated: "2024-11-15",
		},
		{
			name: "Benefits Overview",
			description: "Comprehensive guide to employee benefits",
			type: "PDF",
			size: "3.1 MB",
			lastUpdated: "2024-12-10",
		},
		{
			name: "Remote Work Guidelines",
			description: "Best practices for remote work and collaboration",
			type: "PDF",
			size: "1.8 MB",
			lastUpdated: "2024-12-18",
		},
	];

	const feedbackCategories = [
		"Bug Report",
		"Feature Request",
		"UI/UX Improvement",
		"Performance Issue",
		"Content Error",
		"General Feedback",
	];

	const toggleFAQ = (questionId: string) => {
		setExpandedFAQ((prev) =>
			prev.includes(questionId)
				? prev.filter((id) => id !== questionId)
				: [...prev, questionId],
		);
	};

	const handleSendMessage = () => {
		if (chatMessage.trim()) {
			// TODO: Implement chat functionality
			console.log("Sending message:", chatMessage);
			setChatMessage("");
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900">Help & Support</h1>
					<p className="text-gray-600">
						Get help, find answers, and connect with support
					</p>
				</div>
			</div>

			{/* Tab Navigation */}
			<div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
							activeTab === tab.id
								? "bg-white text-[color:var(--gt-700)] shadow-sm"
								: "text-gray-600 hover:text-gray-900"
						}`}>
						{tab.label}
					</button>
				))}
			</div>

			{/* FAQ Section */}
			{activeTab === "faq" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<HelpCircle className="w-5 h-5" />
							Frequently Asked Questions
						</CardTitle>
						<CardDescription>
							Common questions about payroll, leaves, benefits, and more
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex items-center gap-4 mb-6">
							<div className="flex-1">
								<UnifiedSearchBar
									placeholder="Search FAQ..."
									value={searchQuery}
									onChange={(value) => setSearchQuery(value)}
									variant="full-width"
									showFilter={false}
								/>
							</div>
						</div>
						<div className="space-y-6">
							{faqCategories.map((category) => (
								<div key={category.category}>
									<h3 className="text-lg font-semibold text-gray-900 mb-4">
										{category.category}
									</h3>
									<div className="space-y-3">
										{category.questions
											.filter(
												(q) =>
													q.question
														.toLowerCase()
														.includes(searchQuery.toLowerCase()) ||
													q.answer
														.toLowerCase()
														.includes(searchQuery.toLowerCase()),
											)
											.map((question) => (
												<div
													key={question.id}
													className="border rounded-lg">
													<button
														onClick={() => toggleFAQ(question.id)}
														className="w-full p-4 text-left flex items-center justify-between hover:bg-gray-50">
														<span className="font-medium text-gray-900">
															{question.question}
														</span>
														{expandedFAQ.includes(question.id) ? (
															<ChevronDown className="w-4 h-4 text-gray-500" />
														) : (
															<ChevronRight className="w-4 h-4 text-gray-500" />
														)}
													</button>
													{expandedFAQ.includes(question.id) && (
														<div className="px-4 pb-4 text-sm text-gray-600">
															{question.answer}
														</div>
													)}
												</div>
											))}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Contact Directory */}
			{activeTab === "contacts" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<User className="w-5 h-5" />
							Contact Directory
						</CardTitle>
						<CardDescription>
							HR contacts, IT support, department heads, and key personnel
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-6">
							{contactDirectory.map((dept) => (
								<div key={dept.department}>
									<h3 className="text-lg font-semibold text-gray-900 mb-4">
										{dept.department}
									</h3>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										{dept.contacts.map((contact, index) => (
											<div key={index} className="p-4 border rounded-lg">
												<div className="flex items-center gap-3 mb-3">
													<div className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold">
														{contact.name
															.split(" ")
															.map((n) => n[0])
															.join("")}
													</div>
													<div>
														<div className="font-medium text-gray-900">
															{contact.name}
														</div>
														<div className="text-sm text-gray-600">
															{contact.title}
														</div>
													</div>
												</div>
												<div className="space-y-2 text-sm">
													<div className="flex items-center gap-2">
														<Mail className="w-3 h-3 text-gray-400" />
														<span className="text-gray-600">
															{contact.email}
														</span>
													</div>
													<div className="flex items-center gap-2">
														<Phone className="w-3 h-3 text-gray-400" />
														<span className="text-gray-600">
															{contact.phone}
														</span>
													</div>
													<div className="flex items-center gap-2">
														<Clock className="w-3 h-3 text-gray-400" />
														<span className="text-gray-600">
															{contact.availability}
														</span>
													</div>
												</div>
												<div className="flex items-center gap-2 mt-3">
													<Button
														variant="outline"
														size="sm"
														className="flex items-center gap-1">
														<Mail className="w-3 h-3" />
														Email
													</Button>
													<Button
														variant="outline"
														size="sm"
														className="flex items-center gap-1">
														<Phone className="w-3 h-3" />
														Call
													</Button>
												</div>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* User Guides */}
			{activeTab === "guides" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BookOpen className="w-5 h-5" />
							User Guides
						</CardTitle>
						<CardDescription>
							Step-by-step tutorials for common tasks and features
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{userGuides.map((guide, index) => (
								<div key={index} className="p-4 border rounded-lg">
									<div className="flex items-center justify-between mb-3">
										<div>
											<div className="font-medium text-gray-900">
												{guide.title}
											</div>
											<div className="text-sm text-gray-600">
												{guide.description}
											</div>
										</div>
										<Button
											variant="outline"
											size="sm"
											className="flex items-center gap-1">
											<FileText className="w-3 h-3" />
											View Guide
										</Button>
									</div>
									<div className="flex items-center gap-4 text-sm text-gray-500">
										<div className="flex items-center gap-1">
											<span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
												{guide.category}
											</span>
										</div>
										<div className="flex items-center gap-1">
											<span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">
												{guide.difficulty}
											</span>
										</div>
										<div className="flex items-center gap-1">
											<Clock className="w-3 h-3" />
											{guide.estimatedTime}
										</div>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Video Tutorials */}
			{activeTab === "videos" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Video className="w-5 h-5" />
							Video Tutorials
						</CardTitle>
						<CardDescription>
							Training videos for system features and common tasks
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							{videoTutorials.map((video, index) => (
								<div key={index} className="p-4 border rounded-lg">
									<div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
										<Video className="w-12 h-12 text-gray-400" />
									</div>
									<div className="mb-3">
										<div className="font-medium text-gray-900">
											{video.title}
										</div>
										<div className="text-sm text-gray-600">
											{video.description}
										</div>
									</div>
									<div className="flex items-center justify-between text-sm text-gray-500 mb-3">
										<div className="flex items-center gap-1">
											<Clock className="w-3 h-3" />
											{video.duration}
										</div>
										<div className="flex items-center gap-1">
											<Eye className="w-3 h-3" />
											{video.views.toLocaleString()} views
										</div>
										<div className="flex items-center gap-1">
											<Star className="w-3 h-3 text-yellow-500" />
											{video.rating}
										</div>
									</div>
									<div className="flex items-center justify-between">
										<span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
											{video.category}
										</span>
										<Button
											size="sm"
											className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white">
											<Video className="w-3 h-3" />
											Watch
										</Button>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Resource Center */}
			{activeTab === "resources" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<FileText className="w-5 h-5" />
							Resource Center
						</CardTitle>
						<CardDescription>
							Employee handbook, policies, FAQs, and contact directories
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{resources.map((resource, index) => (
								<div key={index} className="p-4 border rounded-lg">
									<div className="flex items-center justify-between mb-3">
										<div className="flex items-center gap-3">
											<FileText className="w-5 h-5 text-gray-400" />
											<div>
												<div className="font-medium text-gray-900">
													{resource.name}
												</div>
												<div className="text-sm text-gray-600">
													{resource.description}
												</div>
											</div>
										</div>
										<span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
											{resource.type}
										</span>
									</div>
									<div className="flex items-center justify-between text-sm text-gray-500">
										<div>
											Size: {resource.size} • Updated: {resource.lastUpdated}
										</div>
										<Button
											variant="outline"
											size="sm"
											className="flex items-center gap-1">
											<Eye className="w-3 h-3" />
											View
										</Button>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Feedback System */}
			{activeTab === "feedback" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageSquare className="w-5 h-5" />
							Feedback System
						</CardTitle>
						<CardDescription>
							Report issues, suggest improvements, and rate features
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-6">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Feedback Type
								</label>
								<select className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
									{feedbackCategories.map((category) => (
										<option key={category} value={category}>
											{category}
										</option>
									))}
								</select>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Subject
								</label>
								<Input placeholder="Brief description of your feedback" />
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Description
								</label>
								<textarea
									className="w-full border border-gray-300 rounded px-3 py-2 text-sm h-32"
									placeholder="Please provide detailed information about your feedback, including steps to reproduce if it's a bug report."></textarea>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Priority
								</label>
								<select className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
									<option value="Low">Low</option>
									<option value="Medium">Medium</option>
									<option value="High">High</option>
									<option value="Critical">Critical</option>
								</select>
							</div>
							<div className="flex items-center gap-2">
								<Button className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white">
									<Send className="w-4 h-4" />
									Submit Feedback
								</Button>
								<Button variant="outline" className="flex items-center gap-2">
									<FileText className="w-4 h-4" />
									Save Draft
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Live Chat */}
			{activeTab === "chat" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Headphones className="w-5 h-5" />
							Live Chat Support
						</CardTitle>
						<CardDescription>
							Real-time support for urgent queries and immediate assistance
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="p-4 bg-orange-50 rounded-lg">
								<div className="flex items-center gap-2 text-orange-800">
									<CheckCircle className="w-4 h-4" />
									<span className="font-medium">Support Team Online</span>
								</div>
								<div className="text-sm text-orange-700 mt-1">
									Our support team is available Monday-Friday, 9 AM - 6 PM PST
								</div>
							</div>
							<div className="h-64 border rounded-lg p-4 bg-gray-50 overflow-y-auto">
								<div className="space-y-3">
									<div className="flex items-start gap-3">
										<div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
											S
										</div>
										<div className="flex-1">
											<div className="bg-white p-3 rounded-lg shadow-sm">
												<div className="text-sm text-gray-900">
													Hello! How can I help you today?
												</div>
												<div className="text-xs text-gray-500 mt-1">
													Support Agent • 2 minutes ago
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Input
									placeholder="Type your message..."
									value={chatMessage}
									onChange={(e) => setChatMessage(e.target.value)}
									onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
								/>
								<Button
									onClick={handleSendMessage}
									className="flex items-center gap-1">
									<Send className="w-4 h-4" />
									Send
								</Button>
							</div>
							<div className="flex items-center gap-4 text-sm text-gray-500">
								<div className="flex items-center gap-1">
									<Info className="w-3 h-3" />
									Average response time: 2 minutes
								</div>
								<div className="flex items-center gap-1">
									<CheckCircle className="w-3 h-3" />
									Available 24/7 for urgent issues
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
