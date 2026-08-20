import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AgencyAttendanceTab } from "./tabs/AgencyAttendanceTab";
import { DirectIndirectLaborTab } from "./tabs/DirectIndirectLaborTab";
import { ManpowerDistributionTab } from "./tabs/ManpowerDistributionTab";

const visibleTabs = new Set(["agency", "labor", "direct-indirect"]);

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
				<TabsList className="grid h-auto w-full grid-cols-1 gap-2 mb-6 sm:grid-cols-3">
					<TabsTrigger
						value="agency"
						className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Agency Attendance
					</TabsTrigger>
					<TabsTrigger
						value="labor"
						className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Manpower Distribution
					</TabsTrigger>
					<TabsTrigger
						value="direct-indirect"
						className="whitespace-normal text-center text-xs leading-tight md:text-sm">
						Direct vs Indirect
					</TabsTrigger>
				</TabsList>

				<TabsContent value="agency" className="space-y-4">
					<AgencyAttendanceTab />
				</TabsContent>

				<TabsContent value="labor" className="space-y-4">
					<ManpowerDistributionTab />
				</TabsContent>

				<TabsContent value="direct-indirect" className="space-y-4">
					<DirectIndirectLaborTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
