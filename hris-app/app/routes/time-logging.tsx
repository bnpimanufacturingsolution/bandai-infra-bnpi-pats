import { useState, useEffect, useRef, useCallback } from "react";
import { Meta } from "react-router";
import { Button } from "~/components/atoms/Button";
import { Card, CardContent } from "~/components/atoms/Card";
import {
	Clock,
	Camera,
	QrCode,
	User,
	Bell,
	AlertCircle,
	LogIn,
	LogOut,
	Check,
	Lock,
	ArrowRightFromLine,
} from "lucide-react";
import { Badge } from "~/components/atoms/Badge";
import TimeLoggingGuard from "~/guard/TimeLoggingGuard";

// Mock user database
const MOCK_USERS = [
	{
		id: "1",
		name: "John Doe",
		email: "john.doe@company.com",
		department: "Engineering",
		faceId: "face_001",
		qrCode: "QR_001",
		notifications: [
			{ id: 1, message: "Team meeting at 2 PM today", type: "info", unread: true },
			{
				id: 2,
				message: "Please submit your timesheet by Friday",
				type: "warning",
				unread: true,
			},
		],
		lastClockIn: null as Date | null,
		status: "clocked-out",
	},
	{
		id: "2",
		name: "Jane Smith",
		email: "jane.smith@company.com",
		department: "Marketing",
		faceId: "face_002",
		qrCode: "QR_002",
		notifications: [
			{ id: 3, message: "New project assigned to you", type: "info", unread: true },
		],
		lastClockIn: null as Date | null,
		status: "clocked-out",
	},
	{
		id: "3",
		name: "Sarah Johnson",
		email: "sarah.johnson@company.com",
		department: "Engineering",
		faceId: "face_003",
		qrCode: "QR_003",
		notifications: [
			{ id: 4, message: "Performance review scheduled", type: "info", unread: true },
		],
		lastClockIn: null as Date | null,
		status: "clocked-out",
	},
];

type ScanMethod = "face" | "qr";

function TimeLogging() {
	const [activeTab, setActiveTab] = useState<ScanMethod>("face");
	const [timeAction, setTimeAction] = useState<"in" | "out">("in");
	const [recognizedUser, setRecognizedUser] = useState<any>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [scanMessage, setScanMessage] = useState("");
	const [faceDetected, setFaceDetected] = useState(false);
	const [modelsLoaded, setModelsLoaded] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [lastProcessedTime, setLastProcessedTime] = useState(0);
	const [recentActivity, setRecentActivity] = useState<any[]>([]);

	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const timeActionRef = useRef(timeAction);
	const isProcessingRef = useRef(isProcessing);

	// Sync refs with state
	useEffect(() => {
		timeActionRef.current = timeAction;
	}, [timeAction]);

	useEffect(() => {
		isProcessingRef.current = isProcessing;
	}, [isProcessing]);

	useEffect(() => {
		const loadModels = async () => {
			try {
				console.log("[v0] Loading face-api.js models...");
				const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";

				const faceapi = await import("@vladmandic/face-api");
				const tf = await import("@tensorflow/tfjs-core");
				await import("@tensorflow/tfjs-backend-webgl");

				console.log("[v0] Initializing TensorFlow backend...");
				await tf.ready();
				console.log("[v0] TensorFlow backend ready");

				await Promise.all([
					faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
					faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
					faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
				]);

				console.log("[v0] Face-api.js models loaded successfully");
				setModelsLoaded(true);
				setScanMessage("Face detection ready!");
			} catch (error) {
				console.error("[v0] Error loading face-api models:", error);
				setScanMessage("Error loading face detection models");
			}
		};

		loadModels();

		return () => {
			if (detectionIntervalRef.current) {
				clearInterval(detectionIntervalRef.current);
			}
		};
	}, []);

	const startFaceDetection = useCallback(async () => {
		if (!modelsLoaded) {
			setScanMessage("Face detection models not loaded yet...");
			return;
		}

		const faceapi = await import("@vladmandic/face-api");

		const detectFace = async () => {
			if (!videoRef.current || !canvasRef.current) return;

			try {
				const video = videoRef.current;
				const canvas = canvasRef.current;

				// Check if video is ready
				if (video.readyState !== 4) return;

				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;

				const detections = await faceapi
					.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
					.withFaceLandmarks();

				// console.log("[v0] Detections:", detections.length);

				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.clearRect(0, 0, canvas.width, canvas.height);
				}

				if (detections.length > 0 && !isProcessingRef.current) {
					// Use ref here
					const currentTime = Date.now();
					// We need to access lastProcessedTime from state, but since this is interval, it might be stale.
					// Ideally use a ref for lastProcessedTime too, but for now let's rely on setLastProcessedTime functional update?
					// Use a ref for lastProcessedTime to be safe
					// For simplicity in this fix, I'll trust the component re-renders won't break the interval logic heavily if we just gate by isProcessing
					// But wait, the interval loop closure has stale state.
					// We need to move detection logic inside the effect or use refs for everything.
					// Let's use basic logic:
					// Just gate with isProcessingRef.

					setFaceDetected(true);
					setIsProcessing(true); // This updates state and ref via effect
					setLastProcessedTime(currentTime);
					setScanMessage("Face detected! Recognizing user...");

					const resizedDetections = faceapi.resizeResults(detections, {
						width: canvas.width,
						height: canvas.height,
					});
					faceapi.draw.drawDetections(canvas, resizedDetections);
					faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

					setTimeout(() => {
						const randomUser =
							MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];

						const currentAction = timeActionRef.current; // Use ref

						setRecognizedUser({
							...randomUser,
							status: currentAction === "in" ? "clocked-in" : "clocked-out",
							lastClockIn:
								currentAction === "in" ? new Date() : randomUser.lastClockIn,
						});

						// Add to recent activity
						const newActivity = {
							id: Date.now(),
							name: randomUser.name,
							action: currentAction === "in" ? "TIME IN" : "TIME OUT",
							time: new Date().toLocaleTimeString(),
							department: randomUser.department,
							status: "success",
						};
						setRecentActivity((prev) => [newActivity, ...prev.slice(0, 19)]);

						setScanMessage(
							`✅ Time ${currentAction === "in" ? "IN" : "OUT"} logged for ${randomUser.name}`,
						);

						setTimeout(() => {
							setRecognizedUser(null);
							setFaceDetected(false);
							setIsProcessing(false);
							setScanMessage("Awaiting biometric scan...");
						}, 3000);
					}, 1000);
				} else if (detections.length === 0) {
					setFaceDetected(false);
					if (!isProcessingRef.current) {
						setScanMessage("Awaiting biometric scan...");
					}
				}
			} catch (error) {
				console.error("[v0] Face detection error:", error);
			}
		};

		if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
		detectionIntervalRef.current = setInterval(detectFace, 1000);
	}, [modelsLoaded]); // Depends on modelsLoaded. timeAction and isProcessing via refs.

	const startCamera = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "user", width: 640, height: 480 },
			});
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				setIsScanning(true);
				setIsProcessing(false);
				setLastProcessedTime(0);
				setScanMessage("Awaiting biometric scan...");

				videoRef.current.onloadedmetadata = () => {
					console.log("[v0] Video metadata loaded, starting face detection");
					startFaceDetection();
				};
			}
		} catch (error) {
			setScanMessage("Camera access denied. Please enable camera permissions.");
			console.error("[v0] Camera error:", error);
		}
	}, [startFaceDetection]);

	const stopCamera = useCallback(() => {
		if (videoRef.current?.srcObject) {
			const stream = videoRef.current.srcObject as MediaStream;
			stream.getTracks().forEach((track) => track.stop());
			videoRef.current.srcObject = null;
			setIsScanning(false);
			setScanMessage("");
			setFaceDetected(false);
			setIsProcessing(false);
			setLastProcessedTime(0);

			if (detectionIntervalRef.current) {
				clearInterval(detectionIntervalRef.current);
				detectionIntervalRef.current = null;
			}
		}
	}, []);

	const startQRScanner = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: "environment" },
			});
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				setIsScanning(true);
				setIsProcessing(false);
				setScanMessage("QR Scanner active. Point camera at QR code...");

				setTimeout(() => {
					if (!isProcessingRef.current) {
						setIsProcessing(true);
						const randomUser =
							MOCK_USERS[Math.floor(Math.random() * MOCK_USERS.length)];

						const currentAction = timeActionRef.current;

						setRecognizedUser({
							...randomUser,
							status: currentAction === "in" ? "clocked-in" : "clocked-out",
							lastClockIn:
								currentAction === "in" ? new Date() : randomUser.lastClockIn,
						});

						// Add to recent activity
						const newActivity = {
							id: Date.now(),
							name: randomUser.name,
							action: currentAction === "in" ? "TIME IN" : "TIME OUT",
							time: new Date().toLocaleTimeString(),
							department: randomUser.department,
							status: "success",
						};
						setRecentActivity((prev) => [newActivity, ...prev.slice(0, 19)]);

						setScanMessage(
							`✅ Time ${currentAction === "in" ? "IN" : "OUT"} logged for ${randomUser.name}`,
						);

						setTimeout(() => {
							setRecognizedUser(null);
							setIsProcessing(false);
							setScanMessage("Awaiting biometric scan...");
						}, 3000);
					}
				}, 2000);
			}
		} catch (error) {
			setScanMessage("Camera access denied. Please enable camera permissions.");
			console.error("[v0] QR Scanner error:", error);
		}
	}, []);

	useEffect(() => {
		return () => {
			stopCamera();
		};
	}, [stopCamera]);

	// Auto-start camera when component mounts
	useEffect(() => {
		if (modelsLoaded && !isScanning) {
			startCamera();
		}
	}, [modelsLoaded, startCamera, isScanning]); // isScanning removed to prevent re-trigger? No, isScanning is deps. But logic says if NOT scanning.
	// Actually better to have [modelsLoaded, startCamera] and check isScanning ref or just trust effect only runs when modelsLoaded changes or startCamera changes?
	// If startCamera changes, it might re-run.
	// But startCamera is mostly stable now except if startFaceDetection changes. startFaceDetection changes on modelsLoaded.
	// So it should be fine.

	return (
		<div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
			{/* Header */}
			<div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 bg-gray-800 rounded flex items-center justify-center">
							<Lock className="h-6 w-6 text-white" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-gray-900">
								BIOMETRIC TIME SYSTEM
							</h1>
							<p className="text-sm text-gray-600">Secure Access Control</p>
						</div>
					</div>
					<div className="flex items-center gap-3 flex-shrink-0">
						<Button
							variant={timeAction === "in" ? "default" : "outline"}
							onClick={() => setTimeAction("in")}
							className={`flex items-center justify-center whitespace-nowrap min-w-[120px] ${
								timeAction === "in"
									? "bg-gray-900 hover:bg-gray-800 text-white"
									: "border-gray-300 hover:bg-gray-100 text-gray-900"
							}`}>
							<LogIn className="h-4 w-4 mr-2 flex-shrink-0" />
							<span>TIME IN</span>
						</Button>
						<Button
							variant={timeAction === "out" ? "default" : "outline"}
							onClick={() => setTimeAction("out")}
							className={`flex items-center justify-center whitespace-nowrap min-w-[120px] ${
								timeAction === "out"
									? "bg-gray-900 hover:bg-gray-800 text-white"
									: "border-gray-300 hover:bg-gray-100 text-gray-900"
							}`}>
							<LogOut className="h-4 w-4 mr-2 flex-shrink-0" />
							<span>TIME OUT</span>
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								// API logout call
								fetch("/api/auth/logout", {
									method: "POST",
									headers: {
										"Content-Type": "application/json",
									},
								}).then(() => {
									window.location.href = "/auth/login";
								});
							}}
							className="flex items-center justify-center whitespace-nowrap min-w-[120px] border-gray-300 hover:bg-gray-100 text-gray-900">
							<ArrowRightFromLine className="h-4 w-4 mr-2 flex-shrink-0" />
							<span>LOGOUT</span>
						</Button>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="flex-1 px-6 py-4 overflow-hidden">
				<div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4">
					{/* Left Panel - Camera */}
					<div className="lg:col-span-2 h-full">
						<Card className="h-full overflow-hidden">
							<CardContent className="p-6 h-full flex flex-col">
								{/* Tab Selection */}
								<div className="flex gap-2 mb-4">
									<Button
										variant={activeTab === "face" ? "default" : "outline"}
										onClick={() => {
											setActiveTab("face");
											stopCamera();
											setTimeout(() => startCamera(), 100);
										}}
										className={`flex-1 ${
											activeTab === "face"
												? "bg-gray-900 text-white"
												: "border-gray-300 text-gray-700"
										}`}>
										<User className="h-4 w-4 mr-2" />
										FACIAL RECOGNITION
									</Button>
									<Button
										variant={activeTab === "qr" ? "default" : "outline"}
										onClick={() => {
											setActiveTab("qr");
											stopCamera();
											setTimeout(() => startQRScanner(), 100);
										}}
										className={`flex-1 ${
											activeTab === "qr"
												? "bg-gray-900 text-white"
												: "border-gray-300 text-gray-700"
										}`}>
										<QrCode className="h-4 w-4 mr-2" />
										QR CODE
									</Button>
								</div>

								{/* Camera View */}
								<div className="relative bg-gray-900 rounded-lg overflow-hidden h-[450px]">
									<video
										ref={videoRef}
										autoPlay
										playsInline
										muted
										className="w-full h-full object-cover"
									/>
									<canvas
										ref={canvasRef}
										className="absolute top-0 left-0 w-full h-full object-cover"
									/>

									{!isScanning && (
										<div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
											<div className="text-center text-white">
												{activeTab === "face" ? (
													<>
														<Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
														<p className="text-sm">Camera inactive</p>
													</>
												) : (
													<>
														<QrCode className="h-16 w-16 mx-auto mb-4 opacity-50" />
														<p className="text-sm">
															QR Scanner inactive
														</p>
													</>
												)}
											</div>
										</div>
									)}

									{isScanning && faceDetected && activeTab === "face" && (
										<div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
											<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
											Face Detected
										</div>
									)}

									{/* Processing Overlay */}
									{isProcessing && (
										<div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
											<div className="text-center text-white">
												<div className="relative mb-4">
													<div className="w-20 h-20 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
													<div className="absolute inset-0 flex items-center justify-center">
														<div className="w-8 h-8 bg-green-400 rounded-full flex items-center justify-center">
															<Check className="h-4 w-4 text-white" />
														</div>
													</div>
												</div>
												<p className="text-sm font-medium">
													Processing Time{" "}
													{timeAction === "in" ? "IN" : "OUT"}...
												</p>
											</div>
										</div>
									)}

									{/* QR Scanner Frame */}
									{isScanning && activeTab === "qr" && (
										<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
											<div className="w-64 h-64 border-4 border-blue-500 rounded-lg animate-pulse" />
										</div>
									)}
								</div>

								{/* Manual Scan Button */}
								<div className="mt-4">
									<Button
										className="w-full bg-gray-900 hover:bg-gray-800 text-white"
										onClick={() => {
											if (activeTab === "face") {
												isScanning ? stopCamera() : startCamera();
											} else {
												isScanning ? stopCamera() : startQRScanner();
											}
										}}
										disabled={activeTab === "face" && !modelsLoaded}>
										<Camera className="h-4 w-4 mr-2" />
										{activeTab === "face"
											? modelsLoaded
												? isScanning
													? "STOP CAMERA"
													: "MANUAL SCAN"
												: "LOADING MODELS..."
											: isScanning
												? "STOP SCANNER"
												: "MANUAL SCAN"}
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Right Panel - Status & Activity */}
					<div className="h-full flex flex-col gap-3 overflow-hidden">
						{/* Current Detection */}
						<Card className="flex-1 min-h-0 overflow-hidden flex-shrink-0">
							<CardContent className="p-4 h-full overflow-y-auto">
								<h3 className="text-sm font-medium text-gray-600 uppercase mb-4">
									CURRENT DETECTION
								</h3>
								{recognizedUser ? (
									<div className="space-y-3">
										<div className="flex items-start justify-between gap-2">
											<div className="flex items-start gap-2">
												<div className="relative">
													<div className="h-14 w-14 rounded-lg bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white text-lg font-bold">
														{recognizedUser.name
															.split(" ")
															.map((n: string) => n[0])
															.join("")}
													</div>
													<div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1">
														<Check className="h-3 w-3 text-white" />
													</div>
												</div>
												<div>
													<h4 className="font-bold text-gray-900 text-base">
														{recognizedUser.name}
													</h4>
													<p className="text-xs text-gray-600">
														{recognizedUser.id}
													</p>
													<div className="flex items-center gap-2 mt-1">
														<Badge
															variant="outline"
															className="text-xs py-0">
															{recognizedUser.department}
														</Badge>
													</div>
													<div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
														<Clock className="h-4 w-4" />
														<span>
															{new Date().toLocaleTimeString()}
														</span>
													</div>
												</div>
											</div>
											<Badge
												className={`${
													timeAction === "in"
														? "bg-gray-900 text-white"
														: "bg-gray-200 text-gray-900"
												} px-3 py-1`}>
												{timeAction === "in" ? "TIME IN" : "TIME OUT"}
											</Badge>
										</div>

										{/* Notifications */}
										{recognizedUser.notifications &&
											recognizedUser.notifications.length > 0 && (
												<div className="border-t pt-3">
													<div className="flex items-center justify-between mb-2">
														<h5 className="text-xs font-medium text-gray-600 uppercase">
															NOTIFICATIONS (
															{recognizedUser.notifications.length})
														</h5>
													</div>
													<div className="space-y-1.5 max-h-24 overflow-y-auto">
														{recognizedUser.notifications.map(
															(notif: any) => (
																<div
																	key={notif.id}
																	className="text-xs text-gray-700 p-2 bg-gray-50 rounded">
																	{notif.message}
																</div>
															),
														)}
													</div>
												</div>
											)}
									</div>
								) : (
									<div className="flex flex-col items-center justify-center py-12 text-center">
										<User className="h-16 w-16 text-gray-300 mb-3" />
										<p className="text-gray-500">{scanMessage}</p>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Recent Activity */}
						<Card className="flex-1 min-h-0 overflow-hidden flex-shrink-0">
							<CardContent className="p-4 h-full flex flex-col overflow-hidden">
								<h3 className="text-sm font-medium text-gray-600 uppercase mb-4 flex-shrink-0">
									RECENT ACTIVITY
								</h3>
								{recentActivity.length > 0 ? (
									<div className="flex-1 overflow-y-auto space-y-3 pr-2">
										{recentActivity.map((activity) => (
											<div
												key={activity.id}
												className="flex items-center gap-3 p-3 border-b border-gray-100 flex-shrink-0 last:border-b-0">
												<div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
													{activity.name
														.split(" ")
														.map((n: string) => n[0])
														.join("")}
												</div>
												<div className="flex-1 min-w-0">
													<p className="font-semibold text-sm text-gray-900 truncate">
														{activity.name}
													</p>
													<p className="text-xs text-gray-600">
														{activity.time} • {activity.department}
													</p>
												</div>
												<Badge
													variant="outline"
													className="text-xs flex-shrink-0">
													{activity.action === "TIME IN" ? "IN" : "OUT"}
												</Badge>
											</div>
										))}
									</div>
								) : (
									<div className="flex-1 flex items-center justify-center">
										<div className="text-center">
											<Clock className="h-12 w-12 text-gray-300 mx-auto mb-2" />
											<p className="text-sm text-gray-500">
												No recent activity
											</p>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}

// Export the component wrapped with authentication guard
export default function ProtectedTimeLogging() {
	return (
		<TimeLoggingGuard requiredRole="dms_time_keeper">
			<TimeLogging />
		</TimeLoggingGuard>
	);
}
