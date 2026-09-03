import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { Bell, AlertCircle, CheckCircle, Info, X } from "lucide-react";

export default function NotificationsPage() {
	const notifications = [
		{
			id: "1",
			type: "success",
			title: "System Update Complete",
			message: "All system updates have been successfully applied.",
			timestamp: "2 hours ago",
			read: false,
		},
		{
			id: "2",
			type: "warning",
			title: "Backup Required",
			message: "Scheduled backup is due. Please initiate backup process.",
			timestamp: "4 hours ago",
			read: false,
		},
		{
			id: "3",
			type: "info",
			title: "New Employee Onboarded",
			message: "Juan Dela Cruz has completed the onboarding process.",
			timestamp: "1 day ago",
			read: true,
		},
		{
			id: "4",
			type: "error",
			title: "Login Attempt Failed",
			message: "Multiple failed login attempts detected from IP 192.168.1.100",
			timestamp: "2 days ago",
			read: true,
		},
		{
			id: "5",
			type: "success",
			title: "Data Export Complete",
			message: "Employee data export has been completed successfully.",
			timestamp: "3 days ago",
			read: true,
		},
	];

	const getIcon = (type: string) => {
		switch (type) {
			case "success":
				return <CheckCircle className="h-5 w-5 text-green-600" />;
			case "warning":
				return <AlertCircle className="h-5 w-5 text-yellow-600" />;
			case "error":
				return <X className="h-5 w-5 text-red-600" />;
			default:
				return <Info className="h-5 w-5 text-blue-600" />;
		}
	};

	const getBadgeColor = (type: string) => {
		switch (type) {
			case "success":
				return "bg-green-100 text-green-800";
			case "warning":
				return "bg-yellow-100 text-yellow-800";
			case "error":
				return "bg-red-100 text-red-800";
			default:
				return "bg-blue-100 text-blue-800";
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
					<p className="text-gray-600">System notifications and alerts</p>
				</div>
				<div className="flex items-center gap-2">
					<Bell className="h-5 w-5 text-gray-400" />
					<Badge variant="secondary">
						{notifications.filter((n) => !n.read).length} unread
					</Badge>
				</div>
			</div>

			{/* Notifications List */}
			<Card>
				<CardHeader>
					<CardTitle>All Notifications</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{notifications.map((notification) => (
							<div
								key={notification.id}
								className={`p-4 border rounded-lg ${
									!notification.read ? "bg-blue-50 border-blue-200" : "bg-white"
								}`}>
								<div className="flex items-start gap-3">
									{getIcon(notification.type)}
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-1">
											<h3 className="font-medium text-gray-900">
												{notification.title}
											</h3>
											<Badge className={getBadgeColor(notification.type)}>
												{notification.type}
											</Badge>
											{!notification.read && (
												<div className="w-2 h-2 bg-blue-600 rounded-full"></div>
											)}
										</div>
										<p className="text-sm text-gray-600 mb-2">
											{notification.message}
										</p>
										<p className="text-xs text-gray-400">
											{notification.timestamp}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
