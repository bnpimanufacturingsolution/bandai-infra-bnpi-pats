type HikvisionAddressAwareDevice = {
	address?: string | null;
	config?: any;
};

export const normalizeHikvisionAddress = (value?: string | null) => {
	const text = String(value || "").trim();
	if (!text) return "";
	try {
		return new URL(text).hostname.toLowerCase();
	} catch {
		return text
			.replace(/^https?:\/\//i, "")
			.split("/")[0]
			.split(":")[0]
			.trim()
			.toLowerCase();
	}
};

export const getConfiguredHikvisionAddresses = (device?: HikvisionAddressAwareDevice | null) => {
	const config = device?.config && typeof device.config === "object" ? device.config : {};
	return [
		device?.address,
		config.hikvisionRuntimeAddress,
		config.hikvisionSdkRuntimeAddress,
		config.runtimeAddress,
	]
		.map((value) => normalizeHikvisionAddress(value))
		.filter(Boolean);
};

export const hikvisionObservedAddressMatchesDevice = (
	observedAddress?: string | null,
	device?: HikvisionAddressAwareDevice | null,
) => {
	const normalizedObserved = normalizeHikvisionAddress(observedAddress);
	if (!normalizedObserved) return true;

	const configuredAddresses = getConfiguredHikvisionAddresses(device);
	return configuredAddresses.length === 0 ? true : configuredAddresses.includes(normalizedObserved);
};
