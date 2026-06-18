// Helper function to safely access nested values
function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((acc, key) => {
		if (acc && typeof acc === "object" && key in acc) {
			return acc[key];
		}
		return undefined;
	}, obj);
}

// Helper function to group data by specified field (supports nested fields like "position.title")
export const groupDataByField = (data: any[], groupBy: string) => {
	const grouped: { [key: string]: any[] } = {};

	data.forEach((item) => {
		const groupValue = getNestedValue(item, groupBy) ?? "unassigned";
		if (!grouped[groupValue]) {
			grouped[groupValue] = [];
		}
		grouped[groupValue].push(item);
	});

	return grouped;
};
