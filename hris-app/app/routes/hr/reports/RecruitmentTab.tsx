import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/atoms/Card";

export default function RecruitmentTab() {
	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Recruitment Reports</CardTitle>
					<CardDescription>View and analyze recruitment and hiring data</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-neutral-600">
						Recruitment report content will be displayed here.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
