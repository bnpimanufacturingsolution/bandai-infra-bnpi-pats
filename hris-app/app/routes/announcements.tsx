"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { Modal } from "~/components/atoms/Modal";
import { Button } from "~/components/atoms/Button";
import { Bell, Calendar, Clock, Megaphone, AlertTriangle, FileText } from "lucide-react";
import { useAuth } from "~/lib/hooks/use-auth";
import notificationsService from "~/services/notifications.service";

export default function AnnouncementDisplay() {
	const { user } = useAuth();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [currentTime, setCurrentTime] = useState(new Date());
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [formData, setFormData] = useState({
		title: "",
		description: "",
		type: "INFO",
		subCategory: "General",
		broadcast: true,
		recipientEmployeeIds: "",
	});

	const isAuthorized =
		user?.role === "hris-hr-manager" ||
		user?.role === "hris-hr-user" ||
		user?.role === "hris-admin" ||
		user?.role === "admin";

	// Fetch Announcements
	const {
		data: announcementsData,
		isLoading: isAnnouncementsLoading,
		refetch: refetchAnnouncements,
	} = useQuery({
		queryKey: ["notifications", "ANNOUNCEMENT"],
		queryFn: () =>
			notificationsService
				.setParams({
					category: "ANNOUNCEMENT",
					limit: 100,
					document: "true",
					pagination: "false",
				})
				.getNotifications(),
	});

	// Fetch Alerts
	const {
		data: alertsData,
		isLoading: isAlertsLoading,
		refetch: refetchAlerts,
	} = useQuery({
		queryKey: ["notifications", "ALERT"],
		queryFn: () =>
			notificationsService
				.setParams({
					category: "ALERT",
					limit: 100,
					document: "true",
					pagination: "false",
				})
				.getNotifications(),
	});

	const announcementsList = useMemo(() => {
		const combined = [
			...(announcementsData?.notifications || []),
			...(alertsData?.notifications || []),
		];
		return combined.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
	}, [announcementsData, alertsData]);

	// Auto-rotate announcements every 10 seconds
	useEffect(() => {
		if (announcementsList.length === 0) return;
		const interval = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % announcementsList.length);
		}, 10000);

		return () => clearInterval(interval);
	}, [announcementsList.length]);

	// Update current time every minute
	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 60000);

		return () => clearInterval(interval);
	}, []);

	const currentAnnouncement = useMemo(() => {
		if (announcementsList.length === 0) return null;
		return announcementsList[currentIndex % announcementsList.length];
	}, [announcementsList, currentIndex]);

	const getCategoryColor = (subcategory: string) => {
		switch (subcategory) {
			case "Urgent Alert":
				return "bg-rose-100 text-rose-800 border-rose-200";
			case "Holiday":
				return "bg-blue-100 text-blue-800 border-blue-200";
			case "Policy":
				return "bg-violet-100 text-violet-800 border-violet-200";
			default:
				return "bg-sky-100 text-sky-800 border-sky-200";
		}
	};

	const getAnnouncementIcon = (subcategory: string) => {
		switch (subcategory) {
			case "Urgent Alert":
				return AlertTriangle;
			case "Holiday":
				return Calendar;
			case "Policy":
				return FileText;
			default:
				return Megaphone;
		}
	};

	const handleFormSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.title || !formData.description) return;

		const isAlert = formData.type === "ALERT" || formData.subCategory === "Urgent Alert";
		const category = isAlert ? "ALERT" : "ANNOUNCEMENT";

		const payload: any = {
			organizationId: user?.organizationId || "org-1",
			sourceEmployeeId: user?.metadata?.employee?.id,
			category,
			title: formData.title,
			description: formData.description,
			type: formData.type,
			broadcast: formData.broadcast,
			metadata: {
				subcategory: formData.subCategory,
			},
		};

		if (!formData.broadcast) {
			const ids = formData.recipientEmployeeIds
				.split(",")
				.map((id) => id.trim())
				.filter(Boolean);
			payload.recipientEmployeeIds =
				ids.length > 0 ? ids : [user?.metadata?.employee?.id || "employee-1"];
		}

		try {
			await notificationsService.createNotification(payload);
			setFormData({
				title: "",
				description: "",
				type: "INFO",
				subCategory: "General",
				broadcast: true,
				recipientEmployeeIds: "",
			});
			setIsModalOpen(false);
			void refetchAnnouncements();
			void refetchAlerts();
			alert("Announcement created successfully!");
		} catch (err: any) {
			console.error("Error creating announcement:", err);
			alert("Failed to create announcement: " + err.message);
		}
	};

	if (isAnnouncementsLoading || isAlertsLoading) {
		return (
			<div className="min-h-screen bg-gray-900 flex items-center justify-center">
				<div className="text-white text-2xl font-sans animate-pulse">
					Loading announcements...
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-900 p-8 flex flex-col justify-between">
			{/* Header */}
			<header className="flex items-center justify-between mb-8">
				<div className="flex items-center gap-4">
					<div className="bg-white/10 p-4 rounded-xl">
						<Bell className="w-10 h-10 text-white" />
					</div>
					<div>
						<h1 className="text-5xl font-bold text-white font-sans">
							HR Announcements
						</h1>
						<p className="text-xl text-white/70 mt-1 font-sans">
							Stay informed with the latest updates
						</p>
					</div>
				</div>
				<div className="flex items-center gap-8">
					{isAuthorized && (
						<Button
							onClick={() => setIsModalOpen(true)}
							className="bg-orange-600 text-white px-6 py-3 rounded-xl hover:bg-orange-500 transition cursor-pointer font-sans"
							id="create-announcement-btn">
							Create Announcement
						</Button>
					)}
					<div className="text-right">
						<p className="text-3xl font-semibold text-white font-mono">
							{currentTime.toLocaleTimeString("en-US", {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</p>
						<p className="text-lg text-white/70 font-sans">
							{currentTime.toLocaleDateString("en-US", {
								weekday: "long",
								month: "long",
								day: "numeric",
							})}
						</p>
					</div>
				</div>
			</header>

			{/* Main Announcement Card */}
			<div className="flex-1 flex items-center justify-center">
				{currentAnnouncement ? (
					<Card className="w-full max-w-6xl p-12 shadow-2xl border-0 bg-white">
						<div className="space-y-8">
							{/* Category & Priority Badge */}
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									{(() => {
										const subcat =
											currentAnnouncement.metadata?.subcategory ||
											currentAnnouncement.metadata?.subCategory ||
											(currentAnnouncement.category === "ALERT"
												? "Urgent Alert"
												: "General");
										const Icon = getAnnouncementIcon(subcat);
										return (
											<Badge
												className={`${getCategoryColor(
													subcat,
												)} text-lg px-6 py-2 font-sans flex items-center gap-2`}>
												<Icon className="w-5 h-5" />
												{subcat}
											</Badge>
										);
									})()}
								</div>
								{currentAnnouncement.type === "ALERT" && (
									<Badge className="bg-rose-500 text-white text-lg px-6 py-2 font-sans">
										Priority Alert
									</Badge>
								)}
							</div>

							{/* Title */}
							<h2 className="text-6xl font-bold text-gray-900 leading-tight text-balance font-sans">
								{currentAnnouncement.title}
							</h2>

							{/* Description */}
							<p className="text-3xl text-gray-600 leading-relaxed text-pretty font-sans">
								{currentAnnouncement.description}
							</p>

							{/* Date and Time */}
							<div className="flex items-center gap-8 pt-6 border-t border-gray-200">
								<div className="flex items-center gap-3">
									<Calendar className="w-8 h-8 text-orange-600" />
									<span className="text-2xl text-gray-900 font-sans">
										{new Date(
											currentAnnouncement.createdAt,
										).toLocaleDateString("en-US", {
											month: "long",
											day: "numeric",
											year: "numeric",
										})}
									</span>
								</div>
								<div className="flex items-center gap-3">
									<Clock className="w-8 h-8 text-orange-600" />
									<span className="text-2xl text-gray-900 font-sans">
										{new Date(
											currentAnnouncement.createdAt,
										).toLocaleTimeString("en-US", {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
								</div>
							</div>
						</div>
					</Card>
				) : (
					<Card className="w-full max-w-6xl p-12 shadow-2xl border-0 bg-white text-center">
						<h2 className="text-4xl font-bold text-gray-900 mb-4 font-sans">
							No Announcements
						</h2>
						<p className="text-xl text-gray-600 font-sans">
							There are no active announcements or alerts at the moment.
						</p>
					</Card>
				)}
			</div>

			{/* Footer - Rotation Controls */}
			<footer className="flex items-center justify-center gap-3 mt-8">
				{announcementsList.map((_, index) => (
					<button
						key={index}
						onClick={() => setCurrentIndex(index)}
						className={`h-3 rounded-full transition-all cursor-pointer ${
							index === currentIndex
								? "w-12 bg-white"
								: "w-3 bg-white/30 hover:bg-white/50"
						}`}
						aria-label={`Go to announcement ${index + 1}`}
					/>
				))}
			</footer>

			{/* Creation Modal */}
			<Modal
				open={isModalOpen}
				onOpenChange={setIsModalOpen}
				title="Create Announcement / Alert">
				<form onSubmit={handleFormSubmit} className="space-y-4 font-sans text-neutral-900">
					<div>
						<label className="block text-sm font-semibold mb-1 text-neutral-700">
							Title
						</label>
						<input
							type="text"
							required
							placeholder="Enter announcement title"
							value={formData.title}
							onChange={(e) => setFormData({ ...formData, title: e.target.value })}
							className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300 transition"
							id="announcement-form-title"
						/>
					</div>

					<div>
						<label className="block text-sm font-semibold mb-1 text-neutral-700">
							Description
						</label>
						<textarea
							required
							rows={4}
							placeholder="Enter announcement description"
							value={formData.description}
							onChange={(e) =>
								setFormData({ ...formData, description: e.target.value })
							}
							className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300 transition"
							id="announcement-form-description"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-semibold mb-1 text-neutral-700">
								Type
							</label>
							<select
								value={formData.type}
								onChange={(e) => setFormData({ ...formData, type: e.target.value })}
								className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-orange-300"
								id="announcement-form-type">
								<option value="INFO">INFO</option>
								<option value="WARNING">WARNING</option>
								<option value="ALERT">ALERT</option>
							</select>
						</div>

						<div>
							<label className="block text-sm font-semibold mb-1 text-neutral-700">
								Sub-category
							</label>
							<select
								value={formData.subCategory}
								onChange={(e) =>
									setFormData({ ...formData, subCategory: e.target.value })
								}
								className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-orange-300"
								id="announcement-form-subcategory">
								<option value="General">General</option>
								<option value="Holiday">Holiday</option>
								<option value="Policy">Policy</option>
								<option value="Urgent Alert">Urgent Alert</option>
							</select>
						</div>
					</div>

					<div className="flex items-center gap-2 py-2">
						<input
							type="checkbox"
							checked={formData.broadcast}
							onChange={(e) =>
								setFormData({ ...formData, broadcast: e.target.checked })
							}
							id="announcement-form-broadcast"
							className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
						/>
						<label
							htmlFor="announcement-form-broadcast"
							className="text-sm font-semibold text-neutral-700 cursor-pointer">
							Send to all active employees (Broadcast)
						</label>
					</div>

					{!formData.broadcast && (
						<div>
							<label className="block text-sm font-semibold mb-1 text-neutral-700">
								Recipient Employee IDs (Comma-separated)
							</label>
							<input
								type="text"
								placeholder="e.g. employee-1, employee-2"
								value={formData.recipientEmployeeIds}
								onChange={(e) =>
									setFormData({
										...formData,
										recipientEmployeeIds: e.target.value,
									})
								}
								className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300 transition"
								id="announcement-form-recipients"
							/>
						</div>
					)}

					<div className="flex justify-end gap-3 pt-4 border-t">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsModalOpen(false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							className="bg-orange-600 hover:bg-orange-500 text-white cursor-pointer"
							id="announcement-form-submit">
							Create
						</Button>
					</div>
				</form>
			</Modal>
		</div>
	);
}
