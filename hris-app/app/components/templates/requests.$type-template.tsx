import { useParams, useNavigate } from "react-router";
import { useEffect } from "react";
import LeaveRequestsPage from "~/routes/employee/requests/leave";
import TimeRequestsPage from "~/routes/employee/requests/time-requests";
import ExpenseReimbursementRequestsPage from "~/routes/employee/requests/expense-reimbursement";
import DocumentRequestRequestsPage from "~/routes/employee/requests/document-request";
import ResignationRequest from "~/routes/employee/requests/resignation-request";

type RequestTypeRoute = "leave" | "time-requests" | "expense-reimbursement" | "document-request";

export function RequestTypePage() {
	const { type } = useParams<{ type?: RequestTypeRoute }>();
	const navigate = useNavigate();

	// Redirect to leave if no type provided
	useEffect(() => {
		if (!type) {
			navigate("/employee/requests/leave", { replace: true });
		}
	}, [type, navigate]);

	if (!type) {
		return null; // Will redirect
	}

	// Validate type
	const validTypes: RequestTypeRoute[] = [
		"leave",
		"time-requests",
		"expense-reimbursement",
		"document-request",
	];

	if (!validTypes.includes(type as RequestTypeRoute)) {
		navigate("/employee/requests/leave", { replace: true });
		return null;
	}

	// Render appropriate component based on type
	switch (type) {
		case "leave":
			return <LeaveRequestsPage />;
		case "time-requests":
			return <TimeRequestsPage />;
		case "expense-reimbursement":
			return <ExpenseReimbursementRequestsPage />;
		case "document-request":
			return <DocumentRequestRequestsPage />;
		default:
			return <LeaveRequestsPage />;
	}
}
