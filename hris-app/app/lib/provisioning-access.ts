import type { User } from "~/types/auth";
import type { SystemProvisioningStatus } from "~/services/system-provisioning.service";

export const getProvisioningModeFromUser = (user: User | null | undefined) =>
	user?.organization?.provisioning?.mode ||
	user?.organization?.branding?.provisioning?.mode ||
	undefined;

export const getEffectiveProvisioningMode = (params: {
	user?: User | null;
	provisioningStatus?: SystemProvisioningStatus;
}) => getProvisioningModeFromUser(params.user) || params.provisioningStatus?.mode;

export const isSetupAutoRedirectEnabled = () =>
	String(import.meta.env.VITE_SETUP_AUTO_REDIRECT || "")
		.trim()
		.toLowerCase() === "true";

export const hasSetupDeeplinkAccess = (search: string | URLSearchParams) => {
	const params = typeof search === "string" ? new URLSearchParams(search) : search;
	return (
		params.get("setup") === "1" ||
		params.get("provisioning") === "1" ||
		params.get("allowSetup") === "1"
	);
};
