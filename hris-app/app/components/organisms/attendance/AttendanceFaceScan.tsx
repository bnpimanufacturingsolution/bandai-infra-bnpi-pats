import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Check, X, ArrowLeft } from "lucide-react"; // Added X and ArrowLeft
import { cn } from "~/lib/utils";

interface AttendanceFaceScanProps {
	isOpen: boolean;
	onClose: () => void;
	onVerified: () => void;
}

export function AttendanceFaceScan({ isOpen, onClose, onVerified }: AttendanceFaceScanProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
	const [status, setStatus] = useState<"idle" | "scanning" | "verified">("idle");
	const [error, setError] = useState<string>("");

	// Load devices
	useEffect(() => {
		if (!isOpen) return;

		let mounted = true;
		setError(""); // Reset error on open

		const getDevices = async () => {
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const videoDevices = devices.filter((d) => d.kind === "videoinput");

				if (mounted) {
					if (videoDevices.length === 0) {
						setError("No camera device detected.");
						setStatus("idle");
					} else {
						setDevices(videoDevices);
						// Default to first device or previously selected
						if (!selectedDeviceId) {
							setSelectedDeviceId(videoDevices[0].deviceId);
						}
					}
				}
			} catch (err) {
				console.error("Error listing devices:", err);
				if (mounted) setError("Error detecting camera devices.");
			}
		};

		// Ask for permission first to get labels
		navigator.mediaDevices
			.getUserMedia({ video: true })
			.then((stream) => {
				stream.getTracks().forEach((t) => t.stop());
				getDevices();
			})
			.catch(() => {
				if (mounted) setError("Camera permission denied");
			});

		return () => {
			mounted = false;
		};
	}, [isOpen, selectedDeviceId]);

	// Start stream when device changes
	const streamRef = useRef<MediaStream | null>(null);

	useEffect(() => {
		if (!isOpen || !selectedDeviceId) return;

		setStatus("scanning");
		const constraints = {
			video: { deviceId: { exact: selectedDeviceId } },
		};

		navigator.mediaDevices
			.getUserMedia(constraints)
			.then((stream) => {
				streamRef.current = stream; // Store for cleanup
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
				}
				// Simulate verification delay
				setTimeout(() => {
					setStatus("verified");
				}, 3000);
			})
			.catch((err) => {
				console.error("Error starting stream:", err);
				setError("Could not start camera");
				setStatus("idle");
			});

		return () => {
			// Robust cleanup
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
			}
		};
	}, [selectedDeviceId, isOpen]);

	// Auto-close on verified
	useEffect(() => {
		if (status === "verified") {
			const timer = setTimeout(() => {
				onVerified();
			}, 1000); // Wait 1s to show verified state
			return () => clearTimeout(timer);
		}
	}, [status, onVerified]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			{/* Responsive Dialog Content: Fullscreen on Mobile, Modal on Desktop */}
			<DialogContent
				className="fixed inset-0 w-screen h-screen max-w-none m-0 p-0 rounded-none border-none bg-white shadow-none flex items-center justify-center translate-x-0 translate-y-0 data-[state=open]:slide-in-from-bottom md:inset-auto md:top-[50%] md:left-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:w-full md:max-w-2xl md:h-auto md:rounded-xl md:border md:shadow-lg md:p-12 md:block md:data-[state=open]:slide-in-from-top-1/2 md:data-[state=open]:zoom-in-95"
				showCloseButton={false}>
				<div className="flex flex-col items-center justify-center w-full h-full md:block">
					{/* Mobile Close Button: Back Arrow (Top-Left) */}
					<button
						onClick={onClose}
						className="absolute top-6 left-6 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors md:hidden">
						<ArrowLeft className="w-5 h-5 text-gray-900" />
					</button>

					{/* Desktop Close Button: X (Top-Right) */}
					<button
						onClick={onClose}
						className="hidden md:flex absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
						<X className="w-4 h-4 text-gray-900" />
					</button>

					<div className="flex flex-col items-center justify-center w-full max-w-md md:max-w-lg px-6 mx-auto">
						<h2 className="text-2xl font-bold text-gray-900 mb-8 font-heading mt-12 md:mt-0">
							{status === "verified" ? "Face scan verified!" : "Clock In"}
						</h2>

						{/* Camera Circle */}
						<div className="relative w-64 h-64 mb-6">
							{/* Scanning Border / Progress */}
							{!error && (
								<div
									className={cn(
										"absolute inset-0 rounded-full border-[6px] transition-all duration-500",
										status === "scanning"
											? "border-t-primary border-r-gray-100 border-b-gray-100 border-l-primary animate-spin"
											: "border-green-500",
									)}
								/>
							)}

							{/* Verified Success Indicator */}
							{status === "verified" && (
								<div className="absolute -top-2 -right-2 z-20 bg-green-500 text-white p-2 rounded-full shadow-lg animate-in zoom-in">
									<Check className="w-6 h-6" strokeWidth={3} />
								</div>
							)}

							{/* Video Container */}
							<div className="w-full h-full rounded-full overflow-hidden bg-gray-100 relative shadow-inner flex items-center justify-center">
								{error ? (
									<div className="text-center p-4">
										<p className="text-red-500 font-medium text-sm">{error}</p>
									</div>
								) : (
									<>
										<video
											ref={videoRef}
											autoPlay
											playsInline
											muted
											className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
										/>

										{status === "scanning" && (
											<>
												{/* Scanning Line */}
												<div className="absolute top-0 left-0 w-full h-1 bg-primary/50 shadow-[0_0_20px_rgba(230,0,0,0.5)] animate-scan opacity-80" />

												{/* Face Guide Overlay */}
												<div className="absolute inset-0 border-2 border-white/20 rounded-full" />
												<div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary/30" />
												<div className="absolute top-1/2 left-0 right-0 h-px bg-primary/30" />
											</>
										)}
									</>
								)}
							</div>
						</div>

						{/* Instruction Text */}
						<p className="text-center text-sm text-gray-500 mb-6 max-w-[240px]">
							{error
								? "Please check your camera settings."
								: status === "verified"
									? "You can now clock in securely."
									: "Make sure your head is in the circle while we scan your face"}
						</p>

						{/* Device Selector (Web only, if multiple) */}
						{!error && devices.length > 1 && status !== "verified" && (
							<div className="w-full mb-2 px-6">
								<Select
									value={selectedDeviceId}
									onValueChange={setSelectedDeviceId}>
									<SelectTrigger className="w-full bg-gray-50 border-gray-200">
										<SelectValue placeholder="Select Camera" />
									</SelectTrigger>
									<SelectContent>
										{devices.map((device) => (
											<SelectItem
												key={device.deviceId}
												value={device.deviceId}>
												{device.label ||
													`Camera ${devices.indexOf(device) + 1}`}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
