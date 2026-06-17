# Template Grouping Functionality

## Overview

The template service now supports grouping templates by any field in the model. This allows the frontend to request templates grouped by specific fields like `type`, `name`, or any other field.

## Usage

### Basic Grouping

To group templates by a specific field, add the `groupBy` query parameter to the GET request:

```
GET /api/template?groupBy=type
```

### Example Response

When grouping is applied, the response structure changes:

**Without grouping:**

```json
{
	"success": true,
	"message": "Templates retrieved successfully",
	"data": [
		{
			"id": "507f1f77bcf86cd799439011",
			"name": "Template 1",
			"description": "Description 1",
			"type": "email",
			"createdAt": "2024-01-01T00:00:00.000Z",
			"updatedAt": "2024-01-01T00:00:00.000Z"
		},
		{
			"id": "507f1f77bcf86cd799439012",
			"name": "Template 2",
			"description": "Description 2",
			"type": "sms",
			"createdAt": "2024-01-01T00:00:00.000Z",
			"updatedAt": "2024-01-01T00:00:00.000Z"
		}
	]
}
```

**With grouping by type:**

```json
{
	"success": true,
	"message": "Templates retrieved successfully",
	"data": {
		"grouped": {
			"email": [
				{
					"id": "507f1f77bcf86cd799439011",
					"name": "Template 1",
					"description": "Description 1",
					"type": "email",
					"createdAt": "2024-01-01T00:00:00.000Z",
					"updatedAt": "2024-01-01T00:00:00.000Z"
				}
			],
			"sms": [
				{
					"id": "507f1f77bcf86cd799439012",
					"name": "Template 2",
					"description": "Description 2",
					"type": "sms",
					"createdAt": "2024-01-01T00:00:00.000Z",
					"updatedAt": "2024-01-01T00:00:00.000Z"
				}
			]
		},
		"groupBy": "type",
		"totalGroups": 2,
		"totalItems": 2
	}
}
```

### Grouping by Different Fields

You can group by any field in the template model:

- `groupBy=type` - Groups by template type
- `groupBy=name` - Groups by template name
- `groupBy=description` - Groups by description
- `groupBy=createdAt` - Groups by creation date

### Handling Missing Values

Templates with missing or null values for the grouping field will be placed in an "unassigned" group.

### Combining with Other Parameters

The grouping functionality works with all existing query parameters:

```
GET /api/template?groupBy=type&page=1&limit=10&sort=name&order=asc
```

## Frontend Integration

### JavaScript/TypeScript Example

```typescript
// Fetch templates grouped by type
const fetchGroupedTemplates = async () => {
	const response = await fetch("/api/template?groupBy=type");
	const data = await response.json();

	if (data.success) {
		const { grouped, groupBy, totalGroups, totalItems } = data.data;

		// Process grouped data
		Object.entries(grouped).forEach(([groupValue, templates]) => {
			console.log(`Group ${groupValue}:`, templates);
		});
	}
};
```

### React Example

```jsx
const TemplateGroups = () => {
	const [groupedTemplates, setGroupedTemplates] = useState({});

	useEffect(() => {
		const fetchTemplates = async () => {
			const response = await fetch("/api/template?groupBy=type");
			const data = await response.json();

			if (data.success) {
				setGroupedTemplates(data.data.grouped);
			}
		};

		fetchTemplates();
	}, []);

	return (
		<div>
			{Object.entries(groupedTemplates).map(([groupValue, templates]) => (
				<div key={groupValue}>
					<h3>{groupValue}</h3>
					{templates.map((template) => (
						<div key={template.id}>{template.name}</div>
					))}
				</div>
			))}
		</div>
	);
};
```

## Error Handling

- Invalid `groupBy` parameter will return a validation error
- The grouping field must exist in the template model
- Empty groups are handled gracefully

## Performance Considerations

- Grouping is performed in memory after data retrieval
- For large datasets, consider implementing database-level grouping
- The current implementation maintains all existing pagination and filtering capabilities
