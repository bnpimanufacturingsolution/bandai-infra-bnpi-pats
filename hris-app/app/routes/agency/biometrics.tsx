import { BiometricsImport } from "~/components/pages/agency-workspace/BiometricsImport";
import { AgencyGuard, AgencyPageShell, useAgencyIdentity } from "~/components/pages/agency-workspace/agency-shared";

export default function AgencyBiometricsPage() {
	return (
		<AgencyGuard>
			<AgencyBiometricsContent />
		</AgencyGuard>
	);
}

function AgencyBiometricsContent() {
	const { agencyId } = useAgencyIdentity();
	return (
		<AgencyPageShell>
			<div data-testid="agency-page-biometrics">
				<div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
					<BiometricsImport agencyId={agencyId} />
				</div>
			</div>
		</AgencyPageShell>
	);
}
