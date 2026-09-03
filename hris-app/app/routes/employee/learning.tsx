import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";
import {
	BookOpen,
	Users,
	Target,
	TrendingUp,
	Play,
	Pause,
	CheckCircle,
	Clock,
	Star,
	Plus,
	Eye,
	Download,
} from "lucide-react";

export default function ManagerLearning() {
	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Learning & Development</h1>
					<p className="text-gray-600">
						Manage your learning and team development programs
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline">
						<Download className="w-4 h-4 mr-2" />
						Export
					</Button>
					<Button>
						<Plus className="w-4 h-4 mr-2" />
						Assign Training
					</Button>
				</div>
			</div>

			{/* Learning Stats */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<BookOpen className="w-8 h-8 text-blue-500" />
						<div>
							<p className="text-sm text-gray-600">Courses Completed</p>
							<p className="text-lg font-bold">12</p>
						</div>
					</div>
				</Card>
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<Users className="w-8 h-8 text-orange-500" />
						<div>
							<p className="text-sm text-gray-600">Team Training</p>
							<p className="text-lg font-bold">8</p>
						</div>
					</div>
				</Card>
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<Target className="w-8 h-8 text-purple-500" />
						<div>
							<p className="text-sm text-gray-600">Certifications</p>
							<p className="text-lg font-bold">5</p>
						</div>
					</div>
				</Card>
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<TrendingUp className="w-8 h-8 text-orange-500" />
						<div>
							<p className="text-sm text-gray-600">Progress</p>
							<p className="text-lg font-bold">85%</p>
						</div>
					</div>
				</Card>
			</div>

			{/* Team Learning Overview */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Users className="w-5 h-5 text-blue-600" />
						Team Learning Overview
					</CardTitle>
					<CardDescription>
						Track your team&apos;s learning progress and development
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="text-center py-12 text-gray-500">
						<BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
						<h3 className="text-lg font-medium text-gray-900 mb-2">
							Team Learning Dashboard
						</h3>
						<p>
							View and manage your team&apos;s learning progress and development
							programs
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
