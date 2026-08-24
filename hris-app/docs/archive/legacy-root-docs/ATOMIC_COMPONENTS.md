# Atomic Components Documentation

This document describes the reusable atomic components implemented in the HR application. These components follow the atomic design pattern and provide consistent UI elements across all pages.

## Components Overview

### 1. SummaryCard

A reusable card component for displaying key metrics and statistics with icons, values, and trend indicators.

### 2. ChartCard

A wrapper component for displaying charts with consistent styling and loading states.

### 3. DataTable

A comprehensive table component with built-in search, filtering, pagination, and sorting capabilities.

## Usage Examples

### SummaryCard

```tsx
import { SummaryCard } from "~/components/atoms";
import { Users, TrendingUp } from "lucide-react";

<SummaryCard
	title="Total Employees"
	value="1,234"
	description="Active employees in the system"
	icon={Users}
	color="blue"
	change={{
		value: "+12%",
		type: "positive",
		period: "last month",
	}}
	trend={{
		direction: "up",
		value: "5.2%",
	}}
/>;
```

#### Props

- `title`: Card title
- `value`: Main metric value
- `description`: Optional description text
- `icon`: Lucide icon component
- `color`: Color theme ("blue" | "green" | "orange" | "red" | "purple" | "gray")
- `change`: Change indicator with value, type, and period
- `trend`: Trend indicator with direction and optional value
- `loading`: Show loading skeleton
- `onClick`: Optional click handler

### ChartCard

```tsx
import { ChartCard } from "~/components/atoms";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

<ChartCard title="Employee Growth" description="Monthly employee count trends" height="h-64">
	<ResponsiveContainer width="100%" height="100%">
		<BarChart data={data}>
			<XAxis dataKey="month" />
			<YAxis />
			<Bar dataKey="employees" fill="#3B82F6" />
		</BarChart>
	</ResponsiveContainer>
</ChartCard>;
```

#### Props

- `title`: Chart title
- `description`: Optional chart description
- `children`: Chart component (typically from recharts)
- `height`: Chart height (default: "h-64")
- `headerActions`: Optional header action buttons
- `loading`: Show loading skeleton
- `className`: Additional CSS classes

### DataTable

```tsx
import { DataTable, type Column, type FilterOption } from "~/components/atoms";

const columns: Column<Employee>[] = [
	{
		key: "name",
		label: "Employee Name",
		sortable: true,
		render: (value, item) => (
			<div className="flex items-center gap-2">
				<Avatar name={value} />
				<span>{value}</span>
			</div>
		),
	},
	{
		key: "department",
		label: "Department",
		sortable: true,
	},
	{
		key: "status",
		label: "Status",
		render: (value) => (
			<Badge variant={value === "Active" ? "success" : "secondary"}>{value}</Badge>
		),
	},
];

const filters: FilterOption[] = [
	{
		key: "department",
		label: "Department",
		options: [
			{ value: "engineering", label: "Engineering" },
			{ value: "hr", label: "Human Resources" },
		],
	},
];

<DataTable
	title="Employees"
	description="Manage employee information"
	data={employees}
	columns={columns}
	filters={filters}
	searchFields={["name", "email", "department"]}
	onAdd={() => console.log("Add employee")}
	onEdit={(item) => console.log("Edit", item)}
	onDelete={(item) => console.log("Delete", item)}
	onExport={() => console.log("Export")}
/>;
```

#### Props

- `title`: Table title
- `description`: Optional table description
- `data`: Array of data objects
- `columns`: Column definitions
- `filters`: Optional filter configurations
- `searchFields`: Fields to search in
- `onAdd`: Add button handler
- `onEdit`: Edit row handler
- `onDelete`: Delete row handler
- `onView`: View row handler
- `onExport`: Export handler
- `isLoading`: Loading state
- `itemsPerPage`: Items per page (default: 10)
- `showSearch`: Show search bar (default: true)
- `showFilters`: Show filter dropdowns (default: true)
- `showPagination`: Show pagination (default: true)
- `showExport`: Show export button (default: true)

## Implementation Status

### ✅ Completed

- [x] SummaryCard component with color variants and trend indicators
- [x] ChartCard component with loading states
- [x] DataTable component with full functionality
- [x] Updated admin dashboard to use SummaryCard
- [x] Updated admin analytics to use ChartCard
- [x] Created comprehensive demo page

### 🔄 In Progress

- [ ] Update all dashboard pages to use atomic components
- [ ] Replace existing table implementations with DataTable
- [ ] Add more chart types and configurations

### 📋 Pages to Update

#### Admin Pages

- [x] `/admin/dashboard` - Updated with SummaryCard
- [x] `/admin/analytics` - Updated with ChartCard
- [ ] `/admin/configuration` - Needs DataTable for CRUD operations
- [ ] `/admin/audit-logs` - Needs DataTable for log entries

#### HR Admin Pages

- [ ] `/hr/dashboard` - Needs SummaryCard and ChartCard
- [ ] `/hr/employees` - Needs DataTable replacement
- [ ] `/hr/attendance` - Needs DataTable for attendance records
- [ ] `/hr/payroll` - Needs ChartCard for payroll visualizations
- [ ] `/hr/performance` - Needs SummaryCard for metrics

#### Employee Pages

- [ ] `/employee/dashboard` - Needs SummaryCard for personal metrics
- [ ] `/employee/analytics` - Needs ChartCard for personal analytics
- [ ] `/employee/performance` - Needs SummaryCard for performance metrics

#### Manager Pages

- [ ] `/employee/dashboard` - Needs SummaryCard and ChartCard
- [ ] `/employee/team` - Needs DataTable for team management
- [ ] `/employee/reports` - Needs ChartCard for report visualizations

## Benefits

1. **Consistency**: All components follow the same design patterns
2. **Reusability**: Components can be used across different pages and roles
3. **Maintainability**: Centralized component logic makes updates easier
4. **Performance**: Optimized components with proper loading states
5. **Accessibility**: Built-in accessibility features
6. **Responsive**: All components work on mobile and desktop

## Demo Page

Visit `/admin/atomic-demo` to see all components in action with different configurations and use cases.

## Migration Guide

### From Custom Cards to SummaryCard

**Before:**

```tsx
<Card className="hover:shadow-md transition-shadow">
	<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
		<CardTitle className="text-sm font-medium text-gray-600">Total Employees</CardTitle>
		<Users className="h-4 w-4 text-gray-500" />
	</CardHeader>
	<CardContent>
		<div className="text-2xl font-bold">1,234</div>
		<div className="flex items-center space-x-2 text-xs text-gray-500">
			<span className="text-green-600">+12%</span>
			<span>from last month</span>
		</div>
		<p className="text-xs text-gray-500 mt-1">Active employees in the system</p>
	</CardContent>
</Card>
```

**After:**

```tsx
<SummaryCard
	title="Total Employees"
	value="1,234"
	description="Active employees in the system"
	icon={Users}
	color="blue"
	change={{ value: "+12%", type: "positive", period: "last month" }}
/>
```

### From Custom Tables to DataTable

**Before:**

```tsx
// Custom table implementation with manual search, sorting, pagination
```

**After:**

```tsx
<DataTable
	title="Employees"
	data={employees}
	columns={columns}
	filters={filters}
	onAdd={handleAdd}
	onEdit={handleEdit}
	onDelete={handleDelete}
/>
```

## Next Steps

1. **Update existing pages**: Replace custom implementations with atomic components
2. **Add more variants**: Create additional color schemes and configurations
3. **Performance optimization**: Add virtualization for large datasets
4. **Testing**: Add comprehensive unit and integration tests
5. **Documentation**: Create Storybook stories for component library
