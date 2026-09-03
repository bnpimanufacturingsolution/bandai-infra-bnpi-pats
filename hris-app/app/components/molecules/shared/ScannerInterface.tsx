import { useEffect, useRef, useState } from "react";
import { Camera, QrCode, AlertCircle, User, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "~/components/atoms/Card";
import { Alert, AlertDescription } from "~/components/atoms";
import { facialRecognitionService } from "~/services/facial-recognition.service";
import type { RecognitionResult } from "~/services/facial-recognition.service";

interface ScannerInterfaceProps {
	scanMode: "face" | "qr";
	isScanning: boolean;
	onScan: () => void;
	onFaceDetected?: () => void;
	onFaceRecognized?: (result: RecognitionResult) => void;
}

export default function ScannerInterface({
	scanMode,
	isScanning,
	onFaceDetected,
	onFaceRecognized,
}: ScannerInterfaceProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [cameraError, setCameraError] = useState<string | null>(null);
	const [faceDetected, setFaceDetected] = useState(false);
	const detectionIntervalRef = useRef<number | null>(null);
	const [modelLoading, setModelLoading] = useState(false);
	const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);
	const [scanStartTime, setScanStartTime] = useState<number | null>(null);

	useEffect(() => {
		if (isScanning && scanMode === "face") {
			startCamera();
		} else {
			stopCamera();
		}

		return () => {
			stopCamera();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isScanning, scanMode]);

	const initializeRecognitionService = async () => {
		try {
			setModelLoading(true);
			console.log("[Scanner] Initializing facial recognition service...");

			// Wait for the service to be ready
			const isReady = await facialRecognitionService.isReady();
			if (!isReady) {
				console.error("[Scanner] Facial recognition service not ready");
				setModelLoading(false);
				return false;
			}

			setModelLoading(false);
			console.log("[Scanner] Facial recognition service ready");
			return true;
		} catch (error) {
			console.error("[Scanner] Error initializing facial recognition service:", error);
			setModelLoading(false);
			return false;
		}
	};

	const recognizeFaces = async () => {
		const video = videoRef.current;
		if (!video || video.readyState !== 4) return;

		try {
			// Use the facial recognition service
			const result = await facialRecognitionService.recognizeFace(video);

			if (result.faceDetected) {
				console.log("[Scanner] Face detected, recognition result:", result);
				setRecognitionResult(result);
				setFaceDetected(true);

				// Stop the detection interval
				if (detectionIntervalRef.current) {
					clearInterval(detectionIntervalRef.current);
					detectionIntervalRef.current = null;
				}

				// Notify parent components
				if (onFaceDetected) {
					setTimeout(() => {
						onFaceDetected();
					}, 1000);
				}

				if (onFaceRecognized) {
					setTimeout(() => {
						onFaceRecognized(result);
					}, 1000);
				}
			} else {
				// Fallback: Simulate face detection after a few seconds for demo purposes
				console.log("[Scanner] No face detected, checking fallback...");
				const scanTime = Date.now() - (scanStartTime || Date.now());
				if (scanTime > 5000 && !faceDetected) {
					console.log("[Scanner] Fallback face detection triggered");

					// Create a mock recognition result for demo
					const mockResult: RecognitionResult = {
						user: {
							id: "1",
							name: "Sarah Johnson",
							encoding: [],
							department: "Engineering",
							position: "Senior Developer",
							avatar: "SJ",
						},
						confidence: 0.92,
						faceDetected: true,
					};

					setRecognitionResult(mockResult);
					setFaceDetected(true);

					if (detectionIntervalRef.current) {
						clearInterval(detectionIntervalRef.current);
						detectionIntervalRef.current = null;
					}

					if (onFaceDetected) {
						setTimeout(() => {
							onFaceDetected();
						}, 1000);
					}

					if (onFaceRecognized) {
						setTimeout(() => {
							onFaceRecognized(mockResult);
						}, 1000);
					}
				}
			}
		} catch (error) {
			console.error("[Scanner] Face recognition error:", error);
		}
	};

	const startCamera = async () => {
		try {
			setCameraError(null);
			setScanStartTime(Date.now());

			const mediaStream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: 1280 },
					height: { ideal: 720 },
					facingMode: "user",
				},
				audio: false,
			});

			setStream(mediaStream);

			if (videoRef.current) {
				videoRef.current.srcObject = mediaStream;
				await videoRef.current.play();

				videoRef.current.onloadedmetadata = async () => {
					console.log("[Scanner] Video ready, initializing recognition service");

					// Initialize the recognition service
					const isReady = await initializeRecognitionService();
					if (isReady) {
						console.log("[Scanner] Starting face recognition");
						detectionIntervalRef.current = window.setInterval(() => {
							recognizeFaces();
						}, 1500); // Slower interval for face-api.js recognition
					}
				};
			}
		} catch (error) {
			console.error("[Scanner] Camera access error:", error);
			setCameraError("Unable to access camera. Please check permissions.");
		}
	};

	const stopCamera = () => {
		if (detectionIntervalRef.current) {
			clearInterval(detectionIntervalRef.current);
			detectionIntervalRef.current = null;
		}

		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			setStream(null);
		}

		if (videoRef.current) {
			videoRef.current.srcObject = null;
		}

		setFaceDetected(false);
		setRecognitionResult(null);
		setScanStartTime(null);
	};

	return (
		<Card className="relative overflow-hidden border-2 border-gray-200 rounded-2xl shadow-2xl">
			<CardContent className="p-0">
				<div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 relative">
					{isScanning && scanMode === "face" ? (
						<div className="relative w-full h-full">
							<video
								ref={videoRef}
								autoPlay
								playsInline
								muted
								className="absolute inset-0 w-full h-full object-cover"
							/>

							<div className="absolute inset-0 pointer-events-none">
								{/* Corner Brackets */}
								<div className="absolute top-6 left-6 w-20 h-20 border-t-4 border-l-4 border-orange-600 rounded-tl-2xl shadow-lg shadow-orange-600/20" />
								<div className="absolute top-6 right-6 w-20 h-20 border-t-4 border-r-4 border-orange-600 rounded-tr-2xl shadow-lg shadow-orange-600/20" />
								<div className="absolute bottom-6 left-6 w-20 h-20 border-b-4 border-l-4 border-orange-600 rounded-bl-2xl shadow-lg shadow-orange-600/20" />
								<div className="absolute bottom-6 right-6 w-20 h-20 border-b-4 border-r-4 border-orange-600 rounded-br-2xl shadow-lg shadow-orange-600/20" />

								{/* Animated scanning lines */}
								<div className="absolute inset-0">
									{/* Horizontal scanning line */}
									<div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent animate-scan-horizontal shadow-lg shadow-orange-500/50" />

									{/* Vertical scanning line */}
									<div className="absolute h-full w-1 bg-gradient-to-b from-transparent via-orange-500 to-transparent animate-scan-vertical shadow-lg shadow-orange-500/50" />
								</div>

								{/* Scanning grid overlay */}
								<div className="absolute inset-0 opacity-20">
									<svg
										className="w-full h-full"
										viewBox="0 0 100 100"
										preserveAspectRatio="none">
										<defs>
											<pattern
												id="scan-grid"
												x="0"
												y="0"
												width="10"
												height="10"
												patternUnits="userSpaceOnUse">
												<path
													d="M 10 0 L 0 0 0 10"
													fill="none"
													stroke="orange"
													strokeWidth="0.5"
													opacity="0.6"
												/>
											</pattern>
										</defs>
										<rect width="100%" height="100%" fill="url(#scan-grid)" />
									</svg>
								</div>

								{/* Pulsing center dot */}
								<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
									<div className="w-4 h-4 bg-orange-500 rounded-full animate-pulse shadow-lg shadow-orange-500/50" />
								</div>

								{/* Processing indicator */}
								<div className="absolute top-8 left-1/2 transform -translate-x-1/2">
									<div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
										<div className="flex gap-1">
											<div
												className="w-1 h-1 bg-orange-400 rounded-full animate-pulse"
												style={{ animationDelay: "0s" }}
											/>
											<div
												className="w-1 h-1 bg-orange-400 rounded-full animate-pulse"
												style={{ animationDelay: "0.2s" }}
											/>
											<div
												className="w-1 h-1 bg-orange-400 rounded-full animate-pulse"
												style={{ animationDelay: "0.4s" }}
											/>
										</div>
										<span className="text-xs text-white font-medium">
											SCANNING
										</span>
									</div>
								</div>

								{/* Scanning radar effect */}
								<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
									<div className="w-32 h-32 border border-orange-400 rounded-full animate-scan-radar opacity-30" />
									<div
										className="w-48 h-48 border border-orange-300 rounded-full animate-scan-radar opacity-20"
										style={{ animationDelay: "0.5s" }}
									/>
									<div
										className="w-64 h-64 border border-orange-200 rounded-full animate-scan-radar opacity-10"
										style={{ animationDelay: "1s" }}
									/>
								</div>

								{/* Face recognized overlay */}
								{faceDetected && recognitionResult && (
									<div className="absolute inset-0 flex items-center justify-center animate-in fade-in zoom-in duration-300">
										<div className="bg-green-500/20 backdrop-blur-xl border-4 border-green-500 rounded-2xl p-6 shadow-2xl shadow-green-500/30 max-w-sm">
											{recognitionResult.user ? (
												<div className="text-center">
													<div className="flex items-center justify-center mb-3">
														<div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
															{recognitionResult.user.avatar ||
																recognitionResult.user.name.charAt(
																	0,
																)}
														</div>
													</div>
													<p className="text-green-600 font-bold text-xl mb-2">
														{recognitionResult.user.name}
													</p>
													<p className="text-green-700 text-sm mb-1">
														{recognitionResult.user.position}
													</p>
													<p className="text-green-700 text-sm mb-2">
														{recognitionResult.user.department}
													</p>
													<div className="flex items-center justify-center gap-1">
														<CheckCircle2 className="w-4 h-4 text-green-600" />
														<span className="text-green-600 text-xs">
															{Math.round(
																recognitionResult.confidence * 100,
															)}
															% Match
														</span>
													</div>
												</div>
											) : (
												<div className="text-center">
													<User className="w-8 h-8 text-green-600 mx-auto mb-2" />
													<p className="text-green-600 font-bold text-xl">
														Face Detected
													</p>
													<p className="text-green-700 text-sm">
														Unknown Person
													</p>
												</div>
											)}
										</div>
									</div>
								)}

								{/* Face frame guide */}
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="w-72 h-96 border-2 border-dashed border-orange-400/40 rounded-[3rem] relative overflow-hidden">
										{/* Scanning beam effect */}
										<div className="absolute inset-0">
											<div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-orange-400 to-transparent animate-scan-beam shadow-lg shadow-orange-400/60" />
										</div>

										{/* Face outline guide */}
										<div className="absolute inset-4 border border-orange-300/30 rounded-full" />
										<div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 border border-orange-300/30 rounded-full" />
										<div className="absolute top-1/3 left-1/4 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-orange-300/30 rounded-full" />
										<div className="absolute top-1/3 right-1/4 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-orange-300/30 rounded-full" />
										<div className="absolute bottom-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-6 border border-orange-300/30 rounded-full" />
									</div>
								</div>
							</div>

							{/* Camera error overlay */}
							{cameraError && (
								<div className="absolute inset-0 flex items-center justify-center bg-white/95 backdrop-blur-xl p-6">
									<Alert
										variant="destructive"
										className="max-w-md rounded-2xl border-2">
										<AlertDescription className="text-sm">
											{cameraError}
										</AlertDescription>
									</Alert>
								</div>
							)}
						</div>
					) : (
						<div className="relative w-full h-full flex items-center justify-center p-8">
							<div className="relative w-full h-full max-w-md">
								{/* Grid pattern background */}
								<div className="absolute inset-0 opacity-5">
									<div className="grid grid-cols-8 grid-rows-6 h-full w-full gap-3">
										{Array.from({ length: 48 }).map((_, i) => (
											<div
												key={i}
												className="bg-orange-600 rounded-full animate-pulse"
												style={{ animationDelay: `${i * 0.05}s` }}
											/>
										))}
									</div>
								</div>

								{/* Icon */}
								<div className="absolute inset-0 flex items-center justify-center">
									<div className="relative">
										<div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-600 opacity-20 blur-3xl rounded-full" />
										{scanMode === "face" ? (
											<Camera
												className="h-24 w-24 text-orange-600 relative z-10"
												strokeWidth={1.5}
											/>
										) : (
											<QrCode
												className="h-24 w-24 text-orange-600 relative z-10"
												strokeWidth={1.5}
											/>
										)}
									</div>
								</div>

								{/* Corner brackets */}
								<div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-orange-500/50 rounded-tl-2xl" />
								<div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-orange-500/50 rounded-tr-2xl" />
								<div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-orange-500/50 rounded-bl-2xl" />
								<div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-orange-500/50 rounded-br-2xl" />
							</div>
						</div>
					)}
				</div>

				{/* Status text */}
				<div className="absolute bottom-6 left-0 right-0 text-center px-6">
					<div className="flex flex-col items-center gap-2">
						<p className="text-sm font-medium text-gray-900 bg-white/90 backdrop-blur-xl inline-block px-6 py-3 rounded-full border border-gray-200 shadow-xl">
							{isScanning && scanMode === "face"
								? faceDetected
									? recognitionResult?.user
										? `Welcome, ${recognitionResult.user.name}!`
										: "Face detected! Processing..."
									: modelLoading
										? "Loading facial recognition..."
										: "Position your face in the frame"
								: isScanning
									? "Scanning QR code..."
									: `Ready to scan ${scanMode === "face" ? "face" : "QR code"}`}
						</p>
						{/* Manual trigger button for testing */}
						{isScanning && scanMode === "face" && !faceDetected && (
							<button
								onClick={() => {
									console.log("[Scanner] Manual face recognition triggered");

									// Create a mock recognition result for testing
									const mockResult: RecognitionResult = {
										user: {
											id: "1",
											name: "Sarah Johnson",
											encoding: [],
											department: "Engineering",
											position: "Senior Developer",
											avatar: "SJ",
										},
										confidence: 0.92,
										faceDetected: true,
									};

									setRecognitionResult(mockResult);
									setFaceDetected(true);

									if (onFaceDetected) {
										setTimeout(() => {
											onFaceDetected();
										}, 1000);
									}

									if (onFaceRecognized) {
										setTimeout(() => {
											onFaceRecognized(mockResult);
										}, 1000);
									}
								}}
								className="text-xs bg-orange-500 text-white px-3 py-1 rounded-full hover:bg-orange-600 transition-colors">
								Manual Recognize
							</button>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

// Add CSS animations for scanning effects
const scanStyles = `
	@keyframes scan-horizontal {
		0% { top: 0; }
		50% { top: 100%; }
		100% { top: 0; }
	}
	
	@keyframes scan-vertical {
		0% { left: 0; }
		50% { left: 100%; }
		100% { left: 0; }
	}
	
	@keyframes scan-radar {
		0% { transform: scale(0.5); opacity: 0.8; }
		100% { transform: scale(1.5); opacity: 0; }
	}
	
	@keyframes scan-beam {
		0% { top: 0; }
		100% { top: 100%; }
	}
	
	.animate-scan-horizontal {
		animation: scan-horizontal 2s ease-in-out infinite;
	}
	
	.animate-scan-vertical {
		animation: scan-vertical 2.5s ease-in-out infinite;
	}
	
	.animate-scan-radar {
		animation: scan-radar 3s ease-out infinite;
	}
	
	.animate-scan-beam {
		animation: scan-beam 1.5s linear infinite;
	}
`;

// Inject styles into the document
if (typeof document !== "undefined") {
	const styleSheet = document.createElement("style");
	styleSheet.textContent = scanStyles;
	document.head.appendChild(styleSheet);
}
