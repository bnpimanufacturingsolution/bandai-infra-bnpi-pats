import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import { Input } from "~/components/atoms/Input";
import {
	Settings,
	Bell,
	Shield,
	Globe,
	Smartphone,
	MessageSquare,
	Eye,
	EyeOff,
	Key,
	User,
	Mail,
	Phone,
	Calendar,
	DollarSign,
	Save,
	Edit,
	X,
	Check,
	AlertCircle,
	Info,
} from "lucide-react";
import { useState } from "react";

export function SettingsPreferences() {
	const [activeTab, setActiveTab] = useState("notifications");
	const [isEditing, setIsEditing] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [showCurrentPassword, setShowCurrentPassword] = useState(false);

	const tabs = [
		{ id: "notifications", label: "Notification Settings" },
		{ id: "privacy", label: "Privacy Controls" },
		{ id: "security", label: "Security Settings" },
		{ id: "language", label: "Language & Region" },
		{ id: "mobile", label: "Mobile App Settings" },
		{ id: "communication", label: "Communication Preferences" },
	];

	const notificationSettings = {
		email: {
			leaveRequests: true,
			payrollUpdates: true,
			performanceReviews: true,
			companyAnnouncements: true,
			teamUpdates: false,
			learningReminders: true,
		},
		sms: {
			urgentAlerts: true,
			leaveApprovals: false,
			payrollAlerts: true,
			securityAlerts: true,
		},
		push: {
			realTimeUpdates: true,
			meetingReminders: true,
			deadlineAlerts: true,
			socialNotifications: false,
		},
	};

	const privacyControls = {
		profileVisibility: "Team Only",
		contactInfo: "HR Only",
		performanceData: "Manager Only",
		learningProgress: "Public",
		attendanceData: "Manager Only",
		allowDataSharing: false,
		analyticsOptIn: true,
	};

	const securitySettings = {
		twoFactorAuth: true,
		loginNotifications: true,
		sessionTimeout: "8 hours",
		passwordLastChanged: "2024-11-15",
		activeSessions: 2,
	};

	const languageRegion = {
		language: "English",
		dateFormat: "MM/DD/YYYY",
		timeFormat: "12-hour",
		timezone: "Pacific Standard Time (PST)",
		currency: "USD ($)",
		numberFormat: "US Format",
	};

	const mobileSettings = {
		biometricLogin: true,
		offlineSync: true,
		dataUsage: "WiFi Only",
		backgroundRefresh: true,
		locationServices: false,
	};

	const communicationPreferences = {
		meetingNotifications: "15 minutes before",
		newsletterSubscription: true,
		marketingEmails: false,
		surveyParticipation: true,
		feedbackRequests: true,
	};

	const handleSave = () => {
		// TODO: Implement save functionality
		console.log("Settings saved");
		setIsEditing(false);
	};

	const handleCancel = () => {
		// TODO: Implement cancel functionality
		console.log("Settings cancelled");
		setIsEditing(false);
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900">Settings & Preferences</h1>
					<p className="text-gray-600">
						Customize your experience and manage your account settings
					</p>
				</div>
				<div className="flex items-center gap-2">
					{isEditing ? (
						<>
							<Button
								variant="outline"
								onClick={handleCancel}
								className="flex items-center gap-2">
								<X className="w-4 h-4" />
								Cancel
							</Button>
							<Button
								onClick={handleSave}
								className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
								<Save className="w-4 h-4" />
								Save Changes
							</Button>
						</>
					) : (
						<Button
							onClick={() => setIsEditing(true)}
							className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
							<Edit className="w-4 h-4" />
							Edit Settings
						</Button>
					)}
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

			{/* Notification Settings */}
			{activeTab === "notifications" && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Mail className="w-5 h-5" />
								Email Notifications
							</CardTitle>
							<CardDescription>
								Configure email notification preferences by category
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{Object.entries(notificationSettings.email).map(([key, value]) => (
								<div key={key} className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900 capitalize">
											{key.replace(/([A-Z])/g, " $1").trim()}
										</div>
										<div className="text-sm text-gray-600">
											{key === "leaveRequests" &&
												"Get notified about leave request status updates"}
											{key === "payrollUpdates" &&
												"Receive payroll and payslip notifications"}
											{key === "performanceReviews" &&
												"Performance review and feedback notifications"}
											{key === "companyAnnouncements" &&
												"Company-wide announcements and updates"}
											{key === "teamUpdates" &&
												"Team-specific updates and messages"}
											{key === "learningReminders" &&
												"Learning and development reminders"}
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={value}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Phone className="w-5 h-5" />
								SMS Notifications
							</CardTitle>
							<CardDescription>
								Configure SMS notification preferences
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{Object.entries(notificationSettings.sms).map(([key, value]) => (
								<div key={key} className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900 capitalize">
											{key.replace(/([A-Z])/g, " $1").trim()}
										</div>
										<div className="text-sm text-gray-600">
											{key === "urgentAlerts" &&
												"Critical alerts and emergency notifications"}
											{key === "leaveApprovals" &&
												"Leave request approval notifications"}
											{key === "payrollAlerts" &&
												"Payroll processing and payment alerts"}
											{key === "securityAlerts" &&
												"Security and account activity alerts"}
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={value}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
							))}
						</CardContent>
					</Card>

					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Bell className="w-5 h-5" />
								Push Notifications
							</CardTitle>
							<CardDescription>
								Configure push notification preferences for mobile app
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{Object.entries(notificationSettings.push).map(([key, value]) => (
									<div key={key} className="flex items-center justify-between">
										<div>
											<div className="font-medium text-gray-900 capitalize">
												{key.replace(/([A-Z])/g, " $1").trim()}
											</div>
											<div className="text-sm text-gray-600">
												{key === "realTimeUpdates" &&
													"Real-time updates and notifications"}
												{key === "meetingReminders" &&
													"Meeting and appointment reminders"}
												{key === "deadlineAlerts" &&
													"Project and task deadline alerts"}
												{key === "socialNotifications" &&
													"Social feed and team activity notifications"}
											</div>
										</div>
										<label className="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												checked={value}
												disabled={!isEditing}
												className="sr-only peer"
											/>
											<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
										</label>
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Privacy Controls */}
			{activeTab === "privacy" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="w-5 h-5" />
							Privacy Controls
						</CardTitle>
						<CardDescription>
							Data sharing preferences and visibility settings
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-4">
							<h3 className="text-lg font-semibold text-gray-900">
								Profile Visibility
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{Object.entries(privacyControls).map(([key, value]) => (
									<div key={key} className="flex items-center justify-between">
										<div>
											<div className="font-medium text-gray-900 capitalize">
												{key.replace(/([A-Z])/g, " $1").trim()}
											</div>
											<div className="text-sm text-gray-600">
												{key === "profileVisibility" &&
													"Who can see your profile information"}
												{key === "contactInfo" &&
													"Who can access your contact details"}
												{key === "performanceData" &&
													"Who can view your performance metrics"}
												{key === "learningProgress" &&
													"Who can see your learning progress"}
												{key === "attendanceData" &&
													"Who can view your attendance records"}
												{key === "allowDataSharing" &&
													"Allow data sharing for analytics"}
												{key === "analyticsOptIn" &&
													"Opt-in to personalized analytics"}
											</div>
										</div>
										{typeof value === "boolean" ? (
											<label className="relative inline-flex items-center cursor-pointer">
												<input
													type="checkbox"
													checked={value}
													disabled={!isEditing}
													className="sr-only peer"
												/>
												<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
											</label>
										) : (
											<select
												disabled={!isEditing}
												className="border border-gray-300 rounded px-3 py-1 text-sm">
												<option
													value="Public"
													selected={value === "Public"}>
													Public
												</option>
												<option
													value="Team Only"
													selected={value === "Team Only"}>
													Team Only
												</option>
												<option
													value="Manager Only"
													selected={value === "Manager Only"}>
													Manager Only
												</option>
												<option
													value="HR Only"
													selected={value === "HR Only"}>
													HR Only
												</option>
											</select>
										)}
									</div>
								))}
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Security Settings */}
			{activeTab === "security" && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Key className="w-5 h-5" />
								Password & Authentication
							</CardTitle>
							<CardDescription>
								Manage your password and authentication settings
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Current Password
								</label>
								<div className="relative">
									<Input
										type={showCurrentPassword ? "text" : "password"}
										placeholder="Enter current password"
										disabled={!isEditing}
									/>
									<button
										type="button"
										onClick={() => setShowCurrentPassword(!showCurrentPassword)}
										className="absolute right-3 top-1/2 -translate-y-1/2">
										{showCurrentPassword ? (
											<EyeOff className="w-4 h-4" />
										) : (
											<Eye className="w-4 h-4" />
										)}
									</button>
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									New Password
								</label>
								<div className="relative">
									<Input
										type={showPassword ? "text" : "password"}
										placeholder="Enter new password"
										disabled={!isEditing}
									/>
									<button
										type="button"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute right-3 top-1/2 -translate-y-1/2">
										{showPassword ? (
											<EyeOff className="w-4 h-4" />
										) : (
											<Eye className="w-4 h-4" />
										)}
									</button>
								</div>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Confirm New Password
								</label>
								<Input
									type="password"
									placeholder="Confirm new password"
									disabled={!isEditing}
								/>
							</div>
							<div className="p-3 bg-blue-50 rounded-lg">
								<div className="flex items-center gap-2 text-sm text-blue-800">
									<Info className="w-4 h-4" />
									Password last changed: {securitySettings.passwordLastChanged}
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Shield className="w-5 h-5" />
								Security Features
							</CardTitle>
							<CardDescription>
								Additional security settings and session management
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<div className="font-medium text-gray-900">
										Two-Factor Authentication
									</div>
									<div className="text-sm text-gray-600">
										Add an extra layer of security to your account
									</div>
								</div>
								<label className="relative inline-flex items-center cursor-pointer">
									<input
										type="checkbox"
										checked={securitySettings.twoFactorAuth}
										disabled={!isEditing}
										className="sr-only peer"
									/>
									<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
								</label>
							</div>
							<div className="flex items-center justify-between">
								<div>
									<div className="font-medium text-gray-900">
										Login Notifications
									</div>
									<div className="text-sm text-gray-600">
										Get notified when someone logs into your account
									</div>
								</div>
								<label className="relative inline-flex items-center cursor-pointer">
									<input
										type="checkbox"
										checked={securitySettings.loginNotifications}
										disabled={!isEditing}
										className="sr-only peer"
									/>
									<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
								</label>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Session Timeout
								</label>
								<select
									disabled={!isEditing}
									className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
									<option
										value="1 hour"
										selected={securitySettings.sessionTimeout === "1 hour"}>
										1 hour
									</option>
									<option
										value="4 hours"
										selected={securitySettings.sessionTimeout === "4 hours"}>
										4 hours
									</option>
									<option
										value="8 hours"
										selected={securitySettings.sessionTimeout === "8 hours"}>
										8 hours
									</option>
									<option
										value="24 hours"
										selected={securitySettings.sessionTimeout === "24 hours"}>
										24 hours
									</option>
								</select>
							</div>
							<div className="p-3 bg-yellow-50 rounded-lg">
								<div className="flex items-center gap-2 text-sm text-yellow-800">
									<AlertCircle className="w-4 h-4" />
									Active sessions: {securitySettings.activeSessions}
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Language & Region */}
			{activeTab === "language" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Globe className="w-5 h-5" />
							Language & Region
						</CardTitle>
						<CardDescription>
							Interface language, date/time format, and currency display
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Language
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="English"
											selected={languageRegion.language === "English"}>
											English
										</option>
										<option
											value="Spanish"
											selected={languageRegion.language === "Spanish"}>
											Spanish
										</option>
										<option
											value="French"
											selected={languageRegion.language === "French"}>
											French
										</option>
										<option
											value="German"
											selected={languageRegion.language === "German"}>
											German
										</option>
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Date Format
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="MM/DD/YYYY"
											selected={languageRegion.dateFormat === "MM/DD/YYYY"}>
											MM/DD/YYYY
										</option>
										<option
											value="DD/MM/YYYY"
											selected={languageRegion.dateFormat === "DD/MM/YYYY"}>
											DD/MM/YYYY
										</option>
										<option
											value="YYYY-MM-DD"
											selected={languageRegion.dateFormat === "YYYY-MM-DD"}>
											YYYY-MM-DD
										</option>
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Time Format
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="12-hour"
											selected={languageRegion.timeFormat === "12-hour"}>
											12-hour (AM/PM)
										</option>
										<option
											value="24-hour"
											selected={languageRegion.timeFormat === "24-hour"}>
											24-hour
										</option>
									</select>
								</div>
							</div>
							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Timezone
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="PST"
											selected={
												languageRegion.timezone ===
												"Pacific Standard Time (PST)"
											}>
											Pacific Standard Time (PST)
										</option>
										<option
											value="EST"
											selected={
												languageRegion.timezone ===
												"Eastern Standard Time (EST)"
											}>
											Eastern Standard Time (EST)
										</option>
										<option
											value="CST"
											selected={
												languageRegion.timezone ===
												"Central Standard Time (CST)"
											}>
											Central Standard Time (CST)
										</option>
										<option
											value="MST"
											selected={
												languageRegion.timezone ===
												"Mountain Standard Time (MST)"
											}>
											Mountain Standard Time (MST)
										</option>
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Currency
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="USD"
											selected={languageRegion.currency === "USD ($)"}>
											USD ($)
										</option>
										<option
											value="EUR"
											selected={languageRegion.currency === "EUR (€)"}>
											EUR (€)
										</option>
										<option
											value="GBP"
											selected={languageRegion.currency === "GBP (£)"}>
											GBP (£)
										</option>
										<option
											value="CAD"
											selected={languageRegion.currency === "CAD (C$)"}>
											CAD (C$)
										</option>
									</select>
								</div>
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Number Format
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="US Format"
											selected={languageRegion.numberFormat === "US Format"}>
											US Format (1,234.56)
										</option>
										<option
											value="EU Format"
											selected={languageRegion.numberFormat === "EU Format"}>
											EU Format (1.234,56)
										</option>
									</select>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Mobile App Settings */}
			{activeTab === "mobile" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Smartphone className="w-5 h-5" />
							Mobile App Settings
						</CardTitle>
						<CardDescription>
							Biometric login, offline sync preferences, and mobile-specific settings
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Biometric Login
										</div>
										<div className="text-sm text-gray-600">
											Use fingerprint or face recognition to log in
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={mobileSettings.biometricLogin}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Offline Sync
										</div>
										<div className="text-sm text-gray-600">
											Sync data when offline and update when online
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={mobileSettings.offlineSync}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Background Refresh
										</div>
										<div className="text-sm text-gray-600">
											Allow app to refresh content in background
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={mobileSettings.backgroundRefresh}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
							</div>
							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Data Usage
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="WiFi Only"
											selected={mobileSettings.dataUsage === "WiFi Only"}>
											WiFi Only
										</option>
										<option
											value="WiFi + Cellular"
											selected={
												mobileSettings.dataUsage === "WiFi + Cellular"
											}>
											WiFi + Cellular
										</option>
										<option
											value="Cellular Only"
											selected={mobileSettings.dataUsage === "Cellular Only"}>
											Cellular Only
										</option>
									</select>
								</div>
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Location Services
										</div>
										<div className="text-sm text-gray-600">
											Allow app to access your location
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={mobileSettings.locationServices}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Communication Preferences */}
			{activeTab === "communication" && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageSquare className="w-5 h-5" />
							Communication Preferences
						</CardTitle>
						<CardDescription>
							Meeting notifications, newsletter subscriptions, and communication
							settings
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							<div className="space-y-4">
								<div>
									<label className="block text-sm font-medium text-gray-700 mb-1">
										Meeting Notifications
									</label>
									<select
										disabled={!isEditing}
										className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
										<option
											value="5 minutes"
											selected={
												communicationPreferences.meetingNotifications ===
												"5 minutes"
											}>
											5 minutes before
										</option>
										<option
											value="15 minutes"
											selected={
												communicationPreferences.meetingNotifications ===
												"15 minutes"
											}>
											15 minutes before
										</option>
										<option
											value="30 minutes"
											selected={
												communicationPreferences.meetingNotifications ===
												"30 minutes"
											}>
											30 minutes before
										</option>
										<option
											value="1 hour"
											selected={
												communicationPreferences.meetingNotifications ===
												"1 hour"
											}>
											1 hour before
										</option>
									</select>
								</div>
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Newsletter Subscription
										</div>
										<div className="text-sm text-gray-600">
											Receive company newsletters and updates
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={
												communicationPreferences.newsletterSubscription
											}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Marketing Emails
										</div>
										<div className="text-sm text-gray-600">
											Receive marketing and promotional emails
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={communicationPreferences.marketingEmails}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
							</div>
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Survey Participation
										</div>
										<div className="text-sm text-gray-600">
											Participate in company surveys and feedback
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={communicationPreferences.surveyParticipation}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
								<div className="flex items-center justify-between">
									<div>
										<div className="font-medium text-gray-900">
											Feedback Requests
										</div>
										<div className="text-sm text-gray-600">
											Receive requests for feedback and suggestions
										</div>
									</div>
									<label className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={communicationPreferences.feedbackRequests}
											disabled={!isEditing}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
									</label>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
