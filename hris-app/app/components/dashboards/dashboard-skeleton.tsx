import { Card, CardContent, CardHeader } from "~/components/atoms/Card";
import { Skeleton } from "~/components/ui/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			{/* Greeting header skeleton */}
			<div className="flex items-end justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-56" />
					<Skeleton className="h-3.5 w-40" />
				</div>
				<Skeleton className="hidden h-3.5 w-28 md:block" />
			</div>

			{/* Top row (3 cards) */}
			<div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
				{[1, 2, 3].map((i) => (
					<Card key={i} className="min-h-[240px]">
						<CardHeader>
							<Skeleton className="h-4 w-28" />
						</CardHeader>
						<CardContent className="space-y-3">
							{[1, 2].map((j) => (
								<div key={j} className="flex items-center gap-3">
									<Skeleton className="h-7 w-7 rounded" />
									<div className="flex-1 space-y-1.5">
										<Skeleton className="h-3.5 w-3/4" />
										<Skeleton className="h-3 w-1/2" />
									</div>
								</div>
							))}
						</CardContent>
					</Card>
				))}
			</div>

			{/* Bottom row (2 cards) */}
			<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
				{[1, 2].map((i) => (
					<Card key={i} className="min-h-[210px]">
						<CardHeader>
							<Skeleton className="h-4 w-32" />
						</CardHeader>
						<CardContent>
							<div className="space-y-2 pt-1">
								{[1, 2, 3].map((j) => (
									<div key={j} className="flex gap-2">
										<Skeleton className="h-4 w-4" />
										<Skeleton className="h-3.5 flex-1" />
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
