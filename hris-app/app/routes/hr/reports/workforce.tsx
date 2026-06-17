import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AgencyAttendanceTab } from "./tabs/AgencyAttendanceTab";
import { ManpowerDistributionTab } from "./tabs/ManpowerDistributionTab";

const visibleTabs = new Set(["agency", "labor"]);

export default function WorkforceAnalyticsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const requestedTab = searchParams.get("tab") || "labor";
	const currentTab = visibleTabs.has(requestedTab) ? requestedTab : "labor";

	useEffect(() => {
		if (visibleTabs.has(requestedTab)) return;

		const nextSearchParams = new URLSearchParams(searchParams);
		nextSearchParams.set("tab", "labor");
		setSearchParams(nextSearchParams, { replace: true });
	}, [requestedTab, searchParams, setSearchParams]);

	const handleTabChange = (tab: string) => {
		const nextSearchParams = new URLSearchParams(searchParams);
		nextSearchParams.set("tab", tab);
		setSearchParams(nextSearchParams);
	};

	return (
		<div className="flex flex-col gap-6 p-6">
			<Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
				<TabsList className="grid w-full grid-cols-2 mb-6 h-auto">
					<TabsTrigger value="agency">Agency Attendance</TabsTrigger>
					<TabsTrigger value="labor">Manpower Distribution</TabsTrigger>
				</TabsList>

				<TabsContent value="agency" className="space-y-4">
					<AgencyAttendanceTab />
				</TabsContent>

				<TabsContent value="labor" className="space-y-4">
					<ManpowerDistributionTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
