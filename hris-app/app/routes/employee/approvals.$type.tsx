import { useParams, useNavigate } from "react-router";
import { useEffect } from "react";
import LeaveApprovalsPage from "./approvals/leave";
import ExpenseReimbursementApprovalsPage from "./approvals/expense-reimbursement";
import DocumentRequestApprovalsPage from "./approvals/document-request";
import Offboarding from "./approvals/offboarding";
import PersonnelActionApprovalsPage from "./approvals/personnel-action";

type ApprovalTypeRoute =
	| "leave"
	| "expense-reimbursement"
	| "document-request"
	| "offboarding"
	| "personnel-action";

export default function ApprovalTypePage() {
	const { type } = useParams<{ type?: ApprovalTypeRoute }>();
	const navigate = useNavigate();

	// Redirect to leave if no type provided
	useEffect(() => {
		if (!type) {
			navigate("/employee/approvals/leave", { replace: true });
		}
	}, [type, navigate]);

	if (!type) {
		return null; // Will redirect
	}

	// Validate type
	const validTypes: ApprovalTypeRoute[] = [
		"leave",
		"expense-reimbursement",
		"document-request",
		"offboarding",
		"personnel-action",
	];

	if (!validTypes.includes(type as ApprovalTypeRoute)) {
		navigate("/employee/approvals/leave", { replace: true });
		return null;
	}

	// Render appropriate component based on type
	switch (type) {
		case "leave":
			return <LeaveApprovalsPage />;
		case "expense-reimbursement":
			return <ExpenseReimbursementApprovalsPage />;
		case "offboarding":
			return <Offboarding />;
		case "document-request":
			return <DocumentRequestApprovalsPage />;
		case "personnel-action":
			return <PersonnelActionApprovalsPage />;
		default:
			return <LeaveApprovalsPage />;
	}
}
