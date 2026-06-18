import { Link, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/atoms/Card";
import { Button } from "~/components/atoms/Button";

export default function EmployeeProfilePage() {
	const [params] = useSearchParams();
	// Accept both 'id' and 'profileId' for backward compatibility
	const id = params.get("id") ?? params.get("profileId") ?? "";

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-base font-semibold text-neutral-900">Profile Details</h2>
				<Link to="/admin/employees">
					<Button variant="secondary">Back to Directory</Button>
				</Link>
			</div>

			<Card className="border border-neutral-200">
				<CardHeader>
					<CardTitle className="text-lg font-semibold text-neutral-900">
						Employee ID: {id}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-neutral-600">
						This is a placeholder profile page. We can expand this to match your full
						profile layout (General Info, Job, Job Description, Time Off, Payroll) and
						load data for employee {id}.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
