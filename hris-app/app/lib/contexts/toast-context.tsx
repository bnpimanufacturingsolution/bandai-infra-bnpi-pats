import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useToast, ToastContainer } from "~/components/atoms/Toast";

interface ToastContextType {
	toast: {
		success: (message: string, title?: string) => void;
		error: (message: string, title?: string) => void;
		warning: (message: string, title?: string) => void;
		info: (message: string, title?: string) => void;
	};
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
	const { toasts, toast, removeToast } = useToast();

	return (
		<ToastContext.Provider value={{ toast }}>
			{children}
			<ToastContainer toasts={toasts} onRemoveToast={removeToast} />
		</ToastContext.Provider>
	);
}

export function useToastContext() {
	const context = useContext(ToastContext);
	if (context === undefined) {
		throw new Error("useToastContext must be used within a ToastProvider");
	}
	return context;
}
