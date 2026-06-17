# Admin Dashboard Setup Guide

## Overview

The HR API now includes a comprehensive admin dashboard with charts, analytics, and customizable themes. This dashboard provides real-time insights into employee data, attendance trends, payroll analytics, and performance metrics.

## Features

### 📊 Dashboard Analytics

- **Overview Statistics**: Total employees, active/inactive counts, departments, positions, benefits
- **Employee Statistics by Department**: Department-wise employee distribution and status
- **Attendance Trends**: Daily, weekly, and monthly attendance patterns
- **Payroll Analytics**: Monthly and yearly payroll summaries with averages
- **Performance Metrics**: Employee performance tracking and rating distributions

### 🎨 Chart Themes & Colors

- **Light Theme**: Clean, professional appearance with blue color scheme
- **Dark Theme**: Modern dark interface with vibrant chart colors
- **Corporate Theme**: Business-focused design with professional colors
- **Custom Color Palettes**: Predefined color sets for different chart types

### 📈 Chart Types Supported

- Line charts for trends
- Bar charts for comparisons
- Pie charts for distributions
- Doughnut charts for percentages
- Area charts for cumulative data
- Scatter plots for correlations

## API Endpoints

### Dashboard Overview

```
GET /api/dashboard/overview
```

Returns key statistics and metrics for the admin dashboard.

**Response:**

```json
{
	"success": true,
	"message": "Dashboard overview retrieved successfully",
	"data": {
		"overview": {
			"totalEmployees": 150,
			"activeEmployees": 142,
			"inactiveEmployees": 8,
			"totalDepartments": 12,
			"totalPositions": 25,
			"totalBenefits": 8,
			"pendingLeaveApplications": 5,
			"activePayrollPeriods": 2,
			"totalPerformanceReviews": 18,
			"employeeRetentionRate": "94.7"
		}
	}
}
```

### Employee Statistics by Department

```
GET /api/dashboard/employee-stats-by-department
```

Returns employee count and status statistics grouped by department.

**Response:**

```json
{
	"success": true,
	"message": "Department statistics retrieved successfully",
	"data": {
		"departmentStats": [
			{
				"departmentId": "dept123",
				"departmentName": "Engineering",
				"totalEmployees": 25,
				"activeEmployees": 24,
				"inactiveEmployees": 1
			}
		]
	}
}
```

### Attendance Trends

```
GET /api/dashboard/attendance-trends?period=30&groupBy=day
```

Returns attendance trends data for charts.

**Parameters:**

- `period`: Number of days (default: 30)
- `groupBy`: Grouping period - day, week, month (default: day)

**Response:**

```json
{
	"success": true,
	"message": "Attendance trends retrieved successfully",
	"data": {
		"trends": [
			{
				"date": "2024-01-15",
				"present": 45,
				"absent": 3,
				"leave": 2,
				"total": 50,
				"attendanceRate": "90.0"
			}
		],
		"period": 30,
		"groupBy": "day"
	}
}
```

### Payroll Analytics

```
GET /api/dashboard/payroll-analytics?year=2024
```

Returns payroll analytics and trends.

**Parameters:**

- `year`: Year for analytics (default: current year)

**Response:**

```json
{
	"success": true,
	"message": "Payroll analytics retrieved successfully",
	"data": {
		"monthlyAnalytics": [
			{
				"month": "2024-01",
				"totalGrossPay": 450000,
				"totalNetPay": 380000,
				"totalDeductions": 70000,
				"recordCount": 150,
				"averageGrossPay": "3000.00",
				"averageNetPay": "2533.33"
			}
		],
		"yearlySummary": {
			"totalGrossPay": 5400000,
			"totalNetPay": 4560000,
			"totalDeductions": 840000,
			"totalRecords": 1800
		},
		"year": 2024
	}
}
```

### Performance Metrics

```
GET /api/dashboard/performance-metrics?period=6
```

Returns performance metrics and analytics.

**Parameters:**

- `period`: Number of months (default: 6)

**Response:**

```json
{
	"success": true,
	"message": "Performance metrics retrieved successfully",
	"data": {
		"monthlyPerformance": {
			"2024-01": {
				"Engineering": {
					"total": 85.5,
					"count": 3,
					"average": 28.5
				}
			}
		},
		"ratingDistribution": {
			"4-5": 15,
			"3-4": 25,
			"2-3": 8
		},
		"overallAverage": "3.7",
		"totalReviews": 48,
		"period": 6
	}
}
```

### Chart Themes

```
GET /api/dashboard/chart-themes?theme=light
```

Returns available chart themes and color palettes.

**Parameters:**

- `theme`: Theme type - light, dark, corporate (default: light)

**Response:**

```json
{
	"success": true,
	"message": "Chart themes retrieved successfully",
	"data": {
		"theme": "light",
		"colors": {
			"background": "#FFFFFF",
			"surface": "#F8FAFC",
			"text": "#1E293B",
			"textSecondary": "#64748B",
			"border": "#E2E8F0",
			"chartColors": ["#3B82F6", "#1E40AF", "#1E3A8A", "#1E293B"]
		},
		"allThemes": ["light", "dark", "corporate"],
		"chartColors": {
			"primary": ["#3B82F6", "#1E40AF", "#1E3A8A", "#1E293B"],
			"secondary": ["#10B981", "#059669", "#047857", "#065F46"],
			"accent": ["#F59E0B", "#D97706", "#B45309", "#92400E"],
			"danger": ["#EF4444", "#DC2626", "#B91C1C", "#991B1B"],
			"warning": ["#F97316", "#EA580C", "#C2410C", "#9A3412"],
			"info": ["#06B6D4", "#0891B2", "#0E7490", "#155E75"],
			"success": ["#84CC16", "#65A30D", "#4D7C0F", "#365314"],
			"purple": ["#8B5CF6", "#7C3AED", "#6D28D9", "#5B21B6"],
			"gradient": {
				"blue": ["#3B82F6", "#1E40AF"],
				"green": ["#10B981", "#059669"],
				"orange": ["#F59E0B", "#D97706"],
				"coral": ["#F87171", "#FB7185"],
				"purple": ["#8B5CF6", "#7C3AED"]
			}
		}
	}
}
```

### Custom Metrics

```
GET /api/dashboard/custom-metrics?metricType=employeeMetrics&filters[startDate]=2024-01-01&filters[endDate]=2024-12-31
```

Returns custom metrics based on predefined configurations.

**Parameters:**

- `metricType`: Type of metrics (required)
    - `employeeMetrics`: Employee-related metrics
    - `attendanceMetrics`: Attendance-related metrics
    - `payrollMetrics`: Payroll-related metrics
    - `performanceMetrics`: Performance-related metrics
    - `leaveMetrics`: Leave application metrics
    - `departmentMetrics`: Department-related metrics
    - `positionMetrics`: Position-related metrics
    - `benefitMetrics`: Benefit-related metrics
    - `workScheduleMetrics`: Work schedule metrics
- `filters`: Additional filters (optional)

## Frontend Integration Examples

### React Dashboard Component

```jsx
import React, { useState, useEffect } from "react";

const Dashboard = () => {
	const [overview, setOverview] = useState(null);
	const [theme, setTheme] = useState("light");

	useEffect(() => {
		const fetchOverview = async () => {
			const response = await fetch("/api/dashboard/overview");
			const data = await response.json();
			if (data.success) {
				setOverview(data.data.overview);
			}
		};

		fetchOverview();
	}, []);

	const handleThemeChange = async (newTheme) => {
		const response = await fetch(`/api/dashboard/chart-themes?theme=${newTheme}`);
		const data = await response.json();
		if (data.success) {
			setTheme(newTheme);
			// Apply theme colors to your charts
			applyThemeToCharts(data.data.colors);
		}
	};

	return (
		<div className="dashboard">
			<div className="theme-selector">
				<button onClick={() => handleThemeChange("light")}>Light</button>
				<button onClick={() => handleThemeChange("dark")}>Dark</button>
				<button onClick={() => handleThemeChange("corporate")}>Corporate</button>
			</div>

			{overview && (
				<div className="overview-cards">
					<div className="card">
						<h3>Total Employees</h3>
						<p>{overview.totalEmployees}</p>
					</div>
					<div className="card">
						<h3>Active Employees</h3>
						<p>{overview.activeEmployees}</p>
					</div>
					<div className="card">
						<h3>Retention Rate</h3>
						<p>{overview.employeeRetentionRate}%</p>
					</div>
				</div>
			)}
		</div>
	);
};
```

### Chart.js Integration

```javascript
// Fetch attendance trends
const fetchAttendanceTrends = async () => {
	const response = await fetch("/api/dashboard/attendance-trends?period=30&groupBy=day");
	const data = await response.json();

	if (data.success) {
		const ctx = document.getElementById("attendanceChart").getContext("2d");
		new Chart(ctx, {
			type: "line",
			data: {
				labels: data.data.trends.map((t) => t.date),
				datasets: [
					{
						label: "Present",
						data: data.data.trends.map((t) => t.present),
						borderColor: "#3B82F6",
						backgroundColor: "rgba(59, 130, 246, 0.1)",
					},
					{
						label: "Absent",
						data: data.data.trends.map((t) => t.absent),
						borderColor: "#F87171",
						backgroundColor: "rgba(248, 113, 113, 0.1)",
					},
				],
			},
			options: {
				responsive: true,
				plugins: {
					title: {
						display: true,
						text: "Attendance Trends (Last 30 Days)",
					},
				},
			},
		});
	}
};
```

## Color Themes Reference

### Light Theme

- Background: `#FFFFFF`
- Surface: `#F8FAFC`
- Text: `#1E293B`
- Text Secondary: `#64748B`
- Border: `#E2E8F0`
- Chart Colors: Blue palette

### Dark Theme

- Background: `#0F172A`
- Surface: `#1E293B`
- Text: `#F1F5F9`
- Text Secondary: `#94A3B8`
- Border: `#334155`
- Chart Colors: Bright palette

### Corporate Theme

- Background: `#FFFFFF`
- Surface: `#F1F5F9`
- Text: `#1E293B`
- Text Secondary: `#475569`
- Border: `#CBD5E1`
- Chart Colors: Professional palette

## Security

All dashboard endpoints require authentication and appropriate role permissions. Ensure users have the necessary access rights before accessing dashboard data.

## Performance Considerations

- Dashboard data is cached for 5 minutes to improve performance
- Large datasets are paginated automatically
- Consider implementing real-time updates for critical metrics
- Use appropriate date ranges to avoid overwhelming the system

## Error Handling

All endpoints return standardized error responses:

```json
{
	"success": false,
	"message": "Error message",
	"error": "Detailed error information"
}
```

Common HTTP status codes:

- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `404`: Not Found
- `500`: Internal Server Error

## Troubleshooting

### Common Issues

1. **Empty Data**: Ensure your database has sufficient data for the selected time periods
2. **Performance Issues**: Use appropriate date ranges and consider caching
3. **Theme Not Applying**: Check that the frontend is properly handling the theme response
4. **Chart Not Rendering**: Verify that chart data is in the correct format

### Debug Mode

Enable debug logging by setting the environment variable:

```bash
NODE_ENV=development
```

This will provide detailed logging for dashboard operations.

## Future Enhancements

- Real-time dashboard updates using WebSockets
- Custom dashboard layouts and widgets
- Export functionality for reports
- Advanced filtering and drill-down capabilities
- Mobile-responsive dashboard design
- Integration with external analytics tools

## Support

For issues or questions regarding the dashboard implementation, please refer to the API documentation or contact the development team.
