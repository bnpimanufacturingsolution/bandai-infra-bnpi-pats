import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { resolveSocketBaseUrl } from "~/lib/api-url.helper";
import { useAuth } from "~/lib/hooks/use-auth";
import { getRuntimeApiBase } from "~/lib/runtime-api-base";

interface SocketContextType {
	socket: Socket | null;
	isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | null>(null);

interface SocketProviderProps {
	children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
	const [socket, setSocket] = useState<Socket | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const { user } = useAuth();
	const employeeId = user?.metadata?.employee?.id;

	useEffect(() => {
		const socketBaseUrl = resolveSocketBaseUrl(
			getRuntimeApiBase(),
			typeof window !== "undefined" ? window.location.origin : "",
		);
		if (!socketBaseUrl) return;

		// Initialize socket connection
		const socketInstance = io(socketBaseUrl, {
			withCredentials: true,
			transports: ["websocket", "polling"],
		});

		socketInstance.on("connect", () => {
			console.log("🔌 Socket connected:", socketInstance.id);
			setIsConnected(true);
		});

		socketInstance.on("disconnect", () => {
			console.log("🔌 Socket disconnected");
			setIsConnected(false);
		});

		socketInstance.on("connect_error", (error) => {
			console.error("Socket connection error:", error);
			setIsConnected(false);
		});

		socketInstance.on("account:deactivated", (payload: any) => {
			const message =
				payload?.message ||
				"Your account has been deactivated due to termination or resignation. Please contact HR for further assistance.";
			window.dispatchEvent(
				new CustomEvent("auth:deactivated", {
					detail: {
						message,
						employmentStatus: payload?.employmentStatus,
					},
				}),
			);
		});

		setSocket(socketInstance);

		return () => {
			socketInstance.disconnect();
		};
	}, []);

	// Join employee room when authenticated
	useEffect(() => {
		if (socket && isConnected && employeeId) {
			socket.emit("join:employee", employeeId);
			console.log(`📢 Joining employee room: ${employeeId}`);
		}

		return () => {
			if (socket && employeeId) {
				socket.emit("leave:employee", employeeId);
			}
		};
	}, [socket, isConnected, employeeId]);

	return (
		<SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>
	);
}

export function useSocket() {
	const context = useContext(SocketContext);
	if (!context) {
		throw new Error("useSocket must be used within a SocketProvider");
	}
	return context;
}

export { SocketContext };
