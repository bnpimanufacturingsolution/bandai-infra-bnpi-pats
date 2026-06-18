import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { MessageSquare, Mail, Send } from "lucide-react";

export default function MessagesPage() {
	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Messages</h1>
					<p className="text-gray-600">Internal communication and messaging system</p>
				</div>
			</div>

			{/* Messages Content */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Inbox */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Mail className="h-5 w-5" />
							Inbox
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="p-3 border rounded-lg">
								<div className="font-medium">System Notification</div>
								<div className="text-sm text-gray-600">
									New employee onboarding completed
								</div>
								<div className="text-xs text-gray-400">2 hours ago</div>
							</div>
							<div className="p-3 border rounded-lg">
								<div className="font-medium">HR Team</div>
								<div className="text-sm text-gray-600">
									Monthly report ready for review
								</div>
								<div className="text-xs text-gray-400">1 day ago</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Sent Messages */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Send className="h-5 w-5" />
							Sent
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="p-3 border rounded-lg">
								<div className="font-medium">To: IT Department</div>
								<div className="text-sm text-gray-600">
									System maintenance scheduled
								</div>
								<div className="text-xs text-gray-400">3 hours ago</div>
							</div>
							<div className="p-3 border rounded-lg">
								<div className="font-medium">To: All Managers</div>
								<div className="text-sm text-gray-600">
									Performance review deadline reminder
								</div>
								<div className="text-xs text-gray-400">2 days ago</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Compose */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageSquare className="h-5 w-5" />
							Compose
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium mb-1">To</label>
								<input
									type="text"
									className="w-full p-2 border rounded-md"
									placeholder="Enter recipient..."
								/>
							</div>
							<div>
								<label className="block text-sm font-medium mb-1">Subject</label>
								<input
									type="text"
									className="w-full p-2 border rounded-md"
									placeholder="Enter subject..."
								/>
							</div>
							<div>
								<label className="block text-sm font-medium mb-1">Message</label>
								<textarea
									className="w-full p-2 border rounded-md h-24"
									placeholder="Type your message..."
								/>
							</div>
							<button className="w-full bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700">
								Send Message
							</button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
