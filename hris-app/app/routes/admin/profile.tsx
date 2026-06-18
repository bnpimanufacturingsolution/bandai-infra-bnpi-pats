import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import { User, Mail, Phone, MapPin, Calendar, Shield, Edit, Save } from "lucide-react";

export default function ProfilePage() {
	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Profile</h1>
					<p className="text-gray-600">Manage your account information and preferences</p>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Profile Picture & Basic Info */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<User className="h-5 w-5" />
							Profile Information
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex flex-col items-center">
							<div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
								<User className="h-12 w-12 text-gray-400" />
							</div>
							<Button variant="outline" size="sm">
								<Edit className="h-4 w-4 mr-2" />
								Change Photo
							</Button>
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">Full Name</label>
							<Input defaultValue="Admin User" />
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">Job Title</label>
							<Input defaultValue="System Administrator" />
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">Department</label>
							<Input defaultValue="Information Technology" />
						</div>

						<Button className="w-full">
							<Save className="h-4 w-4 mr-2" />
							Save Changes
						</Button>
					</CardContent>
				</Card>

				{/* Contact Information */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Mail className="h-5 w-5" />
							Contact Information
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<label className="block text-sm font-medium mb-1">Email Address</label>
							<Input type="email" defaultValue="admin@company.com" />
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">Phone Number</label>
							<Input defaultValue="+63 912 345 6789" />
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">Address</label>
							<Input defaultValue="123 Business St, Manila, Philippines" />
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">
								Emergency Contact
							</label>
							<Input defaultValue="+63 912 345 6788" />
						</div>

						<Button className="w-full">
							<Save className="h-4 w-4 mr-2" />
							Update Contact Info
						</Button>
					</CardContent>
				</Card>

				{/* Account Details */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="h-5 w-5" />
							Account Details
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<User className="h-4 w-4 text-gray-400" />
								<span className="text-sm">Employee ID: ADM001</span>
							</div>
							<div className="flex items-center gap-2">
								<Calendar className="h-4 w-4 text-gray-400" />
								<span className="text-sm">Joined: January 1, 2024</span>
							</div>
							<div className="flex items-center gap-2">
								<Shield className="h-4 w-4 text-gray-400" />
								<span className="text-sm">Role: System Administrator</span>
							</div>
							<div className="flex items-center gap-2">
								<MapPin className="h-4 w-4 text-gray-400" />
								<span className="text-sm">Location: Manila Office</span>
							</div>
						</div>

						<div className="pt-4 border-t">
							<h4 className="font-medium mb-2">Security</h4>
							<Button variant="outline" className="w-full mb-2">
								Change Password
							</Button>
							<Button variant="outline" className="w-full">
								Two-Factor Authentication
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Activity Log */}
			<Card>
				<CardHeader>
					<CardTitle>Recent Activity</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
							<div className="w-2 h-2 bg-green-500 rounded-full"></div>
							<div className="flex-1">
								<p className="text-sm font-medium">Logged in successfully</p>
								<p className="text-xs text-gray-500">2 hours ago</p>
							</div>
						</div>
						<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
							<div className="w-2 h-2 bg-blue-500 rounded-full"></div>
							<div className="flex-1">
								<p className="text-sm font-medium">Updated system settings</p>
								<p className="text-xs text-gray-500">1 day ago</p>
							</div>
						</div>
						<div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
							<div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
							<div className="flex-1">
								<p className="text-sm font-medium">Password changed</p>
								<p className="text-xs text-gray-500">3 days ago</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
