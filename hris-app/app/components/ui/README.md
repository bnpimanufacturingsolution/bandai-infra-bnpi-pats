# Toast Notification System

A comprehensive toast notification system for displaying user feedback, errors, and success messages throughout the application.

## Features

- **Multiple Types**: Success, Error, Warning, and Info notifications
- **Auto-dismiss**: Configurable auto-close duration
- **Manual Dismiss**: Users can close notifications manually
- **Smooth Animations**: Slide-in and fade-out animations
- **Global Context**: Available throughout the entire application
- **TypeScript Support**: Fully typed with IntelliSense support
- **Responsive Design**: Works on all screen sizes

## Components

### Toast

The main toast notification component with different types and styling.

### ToastContainer

Container component that manages the display of multiple toast notifications.

### useToast Hook

Hook for managing toast state and operations.

### ToastProvider Context

Global context provider for accessing toast functionality throughout the app.

## Usage

### Basic Usage

```tsx
import { useToastContext } from "~/lib/contexts/toast-context";

function MyComponent() {
	const { toast } = useToastContext();

	const handleSuccess = () => {
		toast.success("Operation completed successfully!");
	};

	const handleError = () => {
		toast.error("Something went wrong. Please try again.");
	};

	return (
		<div>
			<button onClick={handleSuccess}>Show Success</button>
			<button onClick={handleError}>Show Error</button>
		</div>
	);
}
```

### Toast Types

```tsx
// Success notification
toast.success("Login successful!", "Welcome Back");

// Error notification
toast.error("Invalid credentials", "Login Failed");

// Warning notification
toast.warning("Session expires in 5 minutes", "Session Warning");

// Info notification
toast.info("New features available", "Update Available");
```

### Custom Duration

```tsx
// Toast with custom duration (10 seconds)
toast.success("This will show for 10 seconds", "Custom Duration", 10000);
```

## Integration with Login

The toast system is fully integrated with the login functionality:

### Error Handling

```tsx
// Different error types with specific messages
if (error?.response?.status === 401) {
	toast.error("Invalid email or password. Please check your credentials.", "Login Failed");
} else if (error?.response?.status === 403) {
	toast.error("Your account has been suspended. Please contact support.", "Account Suspended");
} else if (error?.response?.status === 429) {
	toast.error("Too many login attempts. Please try again later.", "Rate Limited");
} else if (error?.response?.status >= 500) {
	toast.error("Server error. Please try again later.", "Server Error");
} else if (error?.code === "NETWORK_ERROR" || !navigator.onLine) {
	toast.error("Network error. Please check your internet connection.", "Connection Error");
}
```

### Validation Errors

```tsx
// Form validation errors
if (!email || !password) {
	const errorMessage = "Please fill in all fields";
	setError(errorMessage);
	toast.error(errorMessage, "Validation Error");
	return;
}
```

## Styling

The toast notifications use Tailwind CSS classes and are fully customizable:

- **Success**: Green background with check circle icon
- **Error**: Red background with alert circle icon
- **Warning**: Yellow background with alert triangle icon
- **Info**: Blue background with info icon

## Positioning

Toasts appear in the top-right corner of the screen by default:

```tsx
<div className="fixed top-4 right-4 z-50 space-y-2">{/* Toast notifications */}</div>
```

## Accessibility

- **Keyboard Navigation**: Toasts can be dismissed with the Escape key
- **Screen Reader Support**: Proper ARIA labels and roles
- **Focus Management**: Focus is properly managed when toasts appear/disappear

## Best Practices

1. **Use Appropriate Types**: Choose the right toast type for the message
2. **Keep Messages Concise**: Short, clear messages work best
3. **Provide Context**: Use titles to provide additional context
4. **Don't Overuse**: Avoid showing too many toasts at once
5. **Handle Errors Gracefully**: Always provide helpful error messages

## Examples

### Login Form Integration

```tsx
const handleSubmit = async (e: React.FormEvent) => {
	e.preventDefault();
	setError("");

	if (!email || !password) {
		const errorMessage = "Please fill in all fields";
		setError(errorMessage);
		toast.error(errorMessage, "Validation Error");
		return;
	}

	try {
		await loginMutation.mutateAsync({ email, password, keepLoggedIn });
		// Success handling is done in the useLogin hook
	} catch (error: any) {
		const errorMessage = handleApiError(error);
		setError(errorMessage);

		// Show specific error messages based on error type
		if (error?.response?.status === 401) {
			toast.error(
				"Invalid email or password. Please check your credentials.",
				"Login Failed",
			);
		} else {
			toast.error(errorMessage, "Login Failed");
		}
	}
};
```

### API Error Handling

```tsx
// In your API service
try {
	const response = await api.post("/endpoint", data);
	toast.success("Data saved successfully!");
	return response.data;
} catch (error) {
	const errorMessage = handleApiError(error);
	toast.error(errorMessage, "Operation Failed");
	throw error;
}
```

## Configuration

The toast system is configured in the root component:

```tsx
// app/root.tsx
export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ToastProvider>
				<Outlet />
				{import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
			</ToastProvider>
		</QueryClientProvider>
	);
}
```

This ensures that toast notifications are available throughout the entire application.
