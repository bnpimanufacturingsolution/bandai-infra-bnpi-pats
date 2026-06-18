import { Card, CardContent, CardHeader } from "~/components/atoms/Card";
import { Skeleton } from "~/components/ui/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="p-6 space-y-6">
			{/* Header Skeleton */}
			<div className="space-y-2">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-96" />
			</div>

			{/* Stats Cards Skeleton */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{[1, 2, 3, 4].map((i) => (
					<Card key={i}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-4 rounded" />
						</CardHeader>
						<CardContent>
							<Skeleton className="h-8 w-16 mb-2" />
							<Skeleton className="h-3 w-32" />
						</CardContent>
					</Card>
				))}
			</div>

			{/* Main Content Grid Skeleton */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
				{/* Left Column - Large Card */}
				<Card className="col-span-4">
					<CardHeader>
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-4 w-64 mt-2" />
					</CardHeader>
					<CardContent className="space-y-4">
						{[1, 2, 3, 4, 5].map((i) => (
							<div key={i} className="flex items-center space-x-4">
								<Skeleton className="h-12 w-12 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-3 w-3/4" />
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				{/* Right Column - Calendar & Info */}
				<Card className="col-span-3">
					<CardHeader>
						<Skeleton className="h-6 w-32" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-64 w-full rounded-lg" />
						<div className="mt-4 space-y-3">
							{[1, 2, 3].map((i) => (
								<div key={i} className="space-y-2">
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-3 w-5/6" />
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
