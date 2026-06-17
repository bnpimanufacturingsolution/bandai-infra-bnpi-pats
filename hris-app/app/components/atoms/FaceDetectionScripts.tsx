import { useEffect } from "react";

export default function FaceDetectionScripts() {
	useEffect(() => {
		// Load TensorFlow.js
		const loadTensorFlow = () => {
			return new Promise((resolve, reject) => {
				if ((window as any).tf) {
					resolve((window as any).tf);
					return;
				}

				const script = document.createElement("script");
				script.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js";
				script.onload = () => resolve((window as any).tf);
				script.onerror = reject;
				document.head.appendChild(script);
			});
		};

		// Load BlazeFace model
		const loadBlazeFace = () => {
			return new Promise((resolve, reject) => {
				if ((window as any).blazeface) {
					resolve((window as any).blazeface);
					return;
				}

				const script = document.createElement("script");
				script.src =
					"https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js";
				script.onload = () => resolve((window as any).blazeface);
				script.onerror = reject;
				document.head.appendChild(script);
			});
		};

		// Load both scripts
		Promise.all([loadTensorFlow(), loadBlazeFace()])
			.then(() => {
				console.log("[FaceDetection] All scripts loaded successfully");
			})
			.catch((error) => {
				console.error("[FaceDetection] Error loading scripts:", error);
			});
	}, []);

	return null;
}
