"use client";

import { useEffect, useState } from "react";
import { Card } from "~/components/atoms/Card";
import { Badge } from "~/components/atoms/Badge";
import { Bell, Calendar, Clock } from "lucide-react";

interface Announcement {
	id: number;
	title: string;
	description: string;
	date: string;
	time: string;
	category: "General" | "Important" | "Event" | "Policy";
	priority: "high" | "normal" | "low";
}

// Sample announcements data
const announcements: Announcement[] = [
	{
		id: 1,
		title: "Company Town Hall Meeting",
		description:
			"Join us for our quarterly town hall meeting where leadership will share company updates, Q3 results, and answer your questions. All employees are encouraged to attend.",
		date: "October 15, 2025",
		time: "2:00 PM",
		category: "Important",
		priority: "high",
	},
	{
		id: 2,
		title: "New Health & Wellness Benefits",
		description:
			"We are excited to announce expanded health and wellness benefits including gym memberships, mental health support, and flexible work arrangements starting next month.",
		date: "October 10, 2025",
		time: "9:00 AM",
		category: "Policy",
		priority: "high",
	},
	{
		id: 3,
		title: "Office Closure - Holiday",
		description:
			"Please note that all offices will be closed on October 31st for the company holiday. Regular operations will resume on November 1st.",
		date: "October 31, 2025",
		time: "All Day",
		category: "General",
		priority: "normal",
	},
	{
		id: 4,
		title: "Team Building Event",
		description:
			"Join us for a fun team building afternoon at Central Park! Activities include games, food, and networking. RSVP by October 12th.",
		date: "October 20, 2025",
		time: "3:00 PM",
		category: "Event",
		priority: "normal",
	},
];

export default function AnnouncementDisplay() {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [currentTime, setCurrentTime] = useState(new Date());

	// Auto-rotate announcements every 10 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % announcements.length);
		}, 10000);

		return () => clearInterval(interval);
	}, []);

	// Update current time every minute
	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 60000);

		return () => clearInterval(interval);
	}, []);

	const currentAnnouncement = announcements[currentIndex];

	const getCategoryColor = (category: string) => {
		switch (category) {
			case "Important":
				return "bg-red-100 text-red-800 border-red-200";
			case "Event":
				return "bg-blue-100 text-blue-800 border-blue-200";
			case "Policy":
				return "bg-green-100 text-green-800 border-green-200";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200";
		}
	};

	return (
		<div className="min-h-screen bg-gray-900 p-8 flex flex-col">
			{/* Header */}
			<header className="flex items-center justify-between mb-12">
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
			</header>

			{/* Main Announcement Card */}
			<div className="flex-1 flex items-center justify-center">
				<Card className="w-full max-w-6xl p-12 shadow-2xl border-0 bg-white">
					<div className="space-y-8">
						{/* Category Badge */}
						<div className="flex items-center justify-between">
							<Badge
								className={`${getCategoryColor(
									currentAnnouncement.category,
								)} text-lg px-6 py-2 font-sans`}>
								{currentAnnouncement.category}
							</Badge>
							{currentAnnouncement.priority === "high" && (
								<Badge className="bg-red-500 text-white text-lg px-6 py-2 font-sans">
									Priority
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
								<Calendar className="w-8 h-8 text-blue-600" />
								<span className="text-2xl text-gray-900 font-sans">
									{currentAnnouncement.date}
								</span>
							</div>
							<div className="flex items-center gap-3">
								<Clock className="w-8 h-8 text-blue-600" />
								<span className="text-2xl text-gray-900 font-sans">
									{currentAnnouncement.time}
								</span>
							</div>
						</div>
					</div>
				</Card>
			</div>

			{/* Footer - Pagination Dots */}
			<footer className="flex items-center justify-center gap-3 mt-12">
				{announcements.map((_, index) => (
					<button
						key={index}
						onClick={() => setCurrentIndex(index)}
						className={`h-3 rounded-full transition-all ${
							index === currentIndex
								? "w-12 bg-white"
								: "w-3 bg-white/30 hover:bg-white/50"
						}`}
						aria-label={`Go to announcement ${index + 1}`}
					/>
				))}
			</footer>
		</div>
	);
}
