export const convertStringBooleans = (obj: any): any => {
	if (Array.isArray(obj)) {
		return obj.map(convertStringBooleans);
	} else if (obj && typeof obj === "object") {
		const converted: any = {};
		for (const [key, value] of Object.entries(obj)) {
			converted[key] = convertStringBooleans(value);
		}
		return converted;
	} else if (typeof obj === "string") {
		const stringValue = obj.toLowerCase().replace(/['"]/g, "");
		if (stringValue === "true") {
			return true;
		} else if (stringValue === "false") {
			return false;
		}
		return obj;
	}
	return obj;
};

export const transformFormDataToObject = (formData: any): any => {
	if (!formData || typeof formData !== "object") {
		return {};
	}

	const result: any = {};

	for (const [key, value] of Object.entries(formData)) {
		const keys = key.split(/[\[\]]+/).filter((k) => k !== "");
		let current = result;

		for (let i = 0; i < keys.length - 1; i++) {
			const currentKey = keys[i];
			const nextKey = keys[i + 1];

			if (!current[currentKey]) {
				current[currentKey] = /^\d+$/.test(nextKey) ? [] : {};
			}
			current = current[currentKey];
		}

		const finalKey = keys[keys.length - 1];
		current[finalKey] = value;
	}

	return convertStringBooleans(result);
};
