import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { MessageSquare, Clock, Bell, Users, Mail, Phone } from "lucide-react";

export function MessagesComingSoon() {
	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900">Messages</h1>
					<p className="text-gray-600">Stay connected with your team and colleagues</p>
				</div>
			</div>

			{/* Coming Soon Card */}
			<Card className="max-w-2xl mx-auto">
				<CardHeader className="text-center">
					<div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
						<MessageSquare className="w-8 h-8 text-orange-600" />
					</div>
					<CardTitle className="text-2xl text-gray-900">Messages Coming Soon!</CardTitle>
					<CardDescription className="text-lg text-gray-600">
						We&apos;re working hard to bring you a powerful messaging system that will
						help you stay connected with your team.
					</CardDescription>
				</CardHeader>
				<CardContent className="text-center space-y-6">
					<div className="space-y-4">
						<h3 className="text-lg font-semibold text-gray-900">What to expect:</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
							<div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
								<Users className="w-5 h-5 text-orange-600 mt-0.5" />
								<div>
									<div className="font-medium text-gray-900">
										Team Communication
									</div>
									<div className="text-sm text-gray-600">
										Chat with your team members and colleagues
									</div>
								</div>
							</div>
							<div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
								<Bell className="w-5 h-5 text-orange-600 mt-0.5" />
								<div>
									<div className="font-medium text-gray-900">
										Real-time Notifications
									</div>
									<div className="text-sm text-gray-600">
										Get instant updates on important messages
									</div>
								</div>
							</div>
							<div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
								<Mail className="w-5 h-5 text-orange-600 mt-0.5" />
								<div>
									<div className="font-medium text-gray-900">Direct Messages</div>
									<div className="text-sm text-gray-600">
										Private conversations with colleagues
									</div>
								</div>
							</div>
							<div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
								<Phone className="w-5 h-5 text-orange-600 mt-0.5" />
								<div>
									<div className="font-medium text-gray-900">File Sharing</div>
									<div className="text-sm text-gray-600">
										Share documents and files seamlessly
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="p-4 bg-orange-50 rounded-lg">
						<div className="flex items-center gap-2 text-orange-800 mb-2">
							<Clock className="w-4 h-4" />
							<span className="font-medium">Expected Launch</span>
						</div>
						<div className="text-sm text-orange-700">
							We&apos;re targeting Q2 2024 for the full messaging feature rollout.
							Stay tuned for updates!
						</div>
					</div>

					<div className="space-y-3">
						<Button
							className="w-full bg-orange-600 hover:bg-orange-700 text-white"
							onClick={() => (window.location.href = "/employee/help")}>
							Get Notified When Available
						</Button>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => (window.location.href = "/employee/help")}>
							Learn More About Upcoming Features
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Alternative Communication Options */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Alternative Communication Options</CardTitle>
					<CardDescription>
						While we work on the messaging system, here are other ways to stay connected
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="p-4 border rounded-lg text-center">
							<Mail className="w-8 h-8 text-orange-600 mx-auto mb-2" />
							<div className="font-medium text-gray-900 mb-1">Email</div>
							<div className="text-sm text-gray-600 mb-3">
								Use your company email for formal communication
							</div>
							<Button variant="outline" size="sm" className="w-full">
								Open Email
							</Button>
						</div>
						<div className="p-4 border rounded-lg text-center">
							<Phone className="w-8 h-8 text-orange-600 mx-auto mb-2" />
							<div className="font-medium text-gray-900 mb-1">Phone Directory</div>
							<div className="text-sm text-gray-600 mb-3">
								Find contact information for your colleagues
							</div>
							<Button variant="outline" size="sm" className="w-full">
								View Directory
							</Button>
						</div>
						<div className="p-4 border rounded-lg text-center">
							<Users className="w-8 h-8 text-orange-600 mx-auto mb-2" />
							<div className="font-medium text-gray-900 mb-1">Team Page</div>
							<div className="text-sm text-gray-600 mb-3">
								Connect with your team members
							</div>
							<Button variant="outline" size="sm" className="w-full">
								View Team
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
