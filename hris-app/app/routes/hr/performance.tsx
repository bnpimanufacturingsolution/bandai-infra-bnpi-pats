import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "~/components/atoms/Card";
import { BarChart2, Target, GraduationCap, MessageSquareMore, ShieldCheck } from "lucide-react";
import OverviewTab from "./performance/OverviewTab";
import ProductivityTab from "./performance/ProductivityTab";
import GoalsTab from "./performance/GoalsTab";
import DevelopmentTab from "./performance/DevelopmentTab";
import FeedbackTab from "./performance/FeedbackTab";
import ComplianceTab from "./performance/ComplianceTab";

type PerfTab = "overview" | "productivity" | "goals" | "development" | "feedback" | "compliance";

export default function HRPerformance() {
	const { type } = useParams<{ type?: PerfTab }>();
	const navigate = useNavigate();

	useEffect(() => {
		if (!type) {
			navigate("/hr/performance/overview", { replace: true });
		}
	}, [type, navigate]);

	return (
		<div className="space-y-6">
			{(type === undefined || type === "overview") && <OverviewTab />}
			{type === "productivity" && <ProductivityTab />}
			{type === "goals" && <GoalsTab />}
			{type === "development" && <DevelopmentTab />}
			{type === "feedback" && <FeedbackTab />}
			{type === "compliance" && <ComplianceTab />}
		</div>
	);
}

// Removed in-file sections in favor of dedicated tab components
