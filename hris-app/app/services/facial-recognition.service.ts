export interface FaceEncoding {
	id: string;
	name: string;
	encoding: number[];
	department: string;
	position: string;
	avatar?: string;
}

export interface RecognitionResult {
	user: FaceEncoding | null;
	confidence: number;
	faceDetected: boolean;
}

export interface FaceDetection {
	topLeft: [number, number];
	bottomRight: [number, number];
	landmarks: number[][];
	descriptor?: Float32Array;
}

class FacialRecognitionService {
	private isInitialized = false;
	private initializationPromise: Promise<boolean> | null = null;
	private faceDatabase: FaceEncoding[] = [];
	private knownFaceDescriptors: Float32Array[] = [];

	constructor() {
		this.loadMockFaceDatabase();
	}

	private async loadFaceApi() {
		return import("@vladmandic/face-api");
	}

	private async loadTf() {
		const tf = await import("@tensorflow/tfjs-core");
		await import("@tensorflow/tfjs-backend-webgl");
		return tf;
	}

	private async initializeModelsInternal(): Promise<boolean> {
		try {
			console.log("[FacialRecognition] Initializing TensorFlow.js...");
			const [tf, faceapi] = await Promise.all([this.loadTf(), this.loadFaceApi()]);

			// Initialize TensorFlow.js backend
			await tf.ready();
			console.log("[FacialRecognition] TensorFlow.js backend ready");

			// Load face-api.js models
			console.log("[FacialRecognition] Loading face-api.js models...");

			// Try multiple model URLs for better reliability
			const MODEL_URLS = [
				"https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/",
				"https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights/",
				"./models/", // Fallback to local models if available
			];

			let modelsLoaded = false;
			let lastError: Error | null = null;

			for (const MODEL_URL of MODEL_URLS) {
				try {
					console.log(`[FacialRecognition] Trying to load models from: ${MODEL_URL}`);

					await Promise.all([
						faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
						faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
						faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
						faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
					]);

					console.log(
						"[FacialRecognition] Face-api.js models loaded successfully from:",
						MODEL_URL,
					);
					modelsLoaded = true;
					break;
				} catch (error) {
					console.warn(
						`[FacialRecognition] Failed to load models from ${MODEL_URL}:`,
						error,
					);
					lastError = error as Error;
					continue;
				}
			}

			if (!modelsLoaded) {
				throw new Error(
					`Failed to load models from any source. Last error: ${lastError?.message}`,
				);
			}

			this.isInitialized = true;
			console.log("[FacialRecognition] All models initialized successfully");
			return true;
		} catch (error) {
			console.error("[FacialRecognition] Error initializing models:", error);
			this.isInitialized = false;
			this.initializationPromise = null;
			return false;
		}
	}

	private async ensureInitialized(): Promise<boolean> {
		if (this.isInitialized) {
			return true;
		}

		if (!this.initializationPromise) {
			this.initializationPromise = this.initializeModelsInternal();
		}

		return this.initializationPromise;
	}

	private loadMockFaceDatabase() {
		// Mock face database - in a real application, this would come from a server
		this.faceDatabase = [
			{
				id: "1",
				name: "Sarah Johnson",
				encoding: this.generateMockEncoding("Sarah Johnson"),
				department: "Engineering",
				position: "Senior Developer",
				avatar: "SJ",
			},
			{
				id: "2",
				name: "Michael Chen",
				encoding: this.generateMockEncoding("Michael Chen"),
				department: "Marketing",
				position: "Marketing Manager",
				avatar: "MC",
			},
			{
				id: "3",
				name: "Emily Rodriguez",
				encoding: this.generateMockEncoding("Emily Rodriguez"),
				department: "HR",
				position: "HR Specialist",
				avatar: "ER",
			},
			{
				id: "4",
				name: "David Kim",
				encoding: this.generateMockEncoding("David Kim"),
				department: "Finance",
				position: "Financial Analyst",
				avatar: "DK",
			},
		];

		// Generate mock descriptors for face-api.js
		this.knownFaceDescriptors = this.faceDatabase.map((user) =>
			this.generateMockDescriptor(user.name),
		);
	}

	private generateMockEncoding(name: string): number[] {
		// Generate a mock 128-dimensional face encoding based on name
		// In a real application, this would be generated from actual face images
		const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
		return Array.from({ length: 128 }, (_, i) => Math.sin(hash + i) * 0.5);
	}

	private generateMockDescriptor(name: string): Float32Array {
		// Generate a mock face descriptor for face-api.js
		const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
		return new Float32Array(128).map((_, i) => Math.sin(hash + i) * 0.5);
	}

	public async detectFaces(video: HTMLVideoElement): Promise<FaceDetection[]> {
		if (!(await this.ensureInitialized())) {
			throw new Error("Models not initialized");
		}

		try {
			const faceapi = await this.loadFaceApi();
			const detections = await faceapi
				.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
				.withFaceLandmarks()
				.withFaceDescriptors();

			return detections.map((detection) => {
				const box = detection.detection.box;
				return {
					topLeft: [box.x, box.y] as [number, number],
					bottomRight: [box.x + box.width, box.y + box.height] as [number, number],
					landmarks: detection.landmarks.positions.map((pos) => [pos.x, pos.y]),
					descriptor: detection.descriptor,
				};
			});
		} catch (error) {
			console.error("[FacialRecognition] Error detecting faces:", error);
			return [];
		}
	}

	public async extractFaceEncoding(
		video: HTMLVideoElement,
		faceDetection: FaceDetection,
	): Promise<number[]> {
		try {
			// For face-api.js, we already have the descriptor from detection
			if (faceDetection.descriptor) {
				return Array.from(faceDetection.descriptor);
			}

			// Fallback: generate mock encoding
			return this.generateMockEncoding("Unknown");
		} catch (error) {
			console.error("[FacialRecognition] Error extracting face encoding:", error);
			return [];
		}
	}

	public async recognizeFace(video: HTMLVideoElement): Promise<RecognitionResult> {
		if (!(await this.ensureInitialized())) {
			return { user: null, confidence: 0, faceDetected: false };
		}

		try {
			const faceapi = await this.loadFaceApi();
			// Detect faces with descriptors
			const detections = await faceapi
				.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
				.withFaceLandmarks()
				.withFaceDescriptors();

			if (detections.length === 0) {
				return { user: null, confidence: 0, faceDetected: false };
			}

			// Use the first detected face
			const detection = detections[0];

			// Match against database using face descriptors
			const match = await this.matchFaceDescriptor(detection.descriptor);

			return {
				user: match.user,
				confidence: match.confidence,
				faceDetected: true,
			};
		} catch (error) {
			console.error("[FacialRecognition] Error recognizing face:", error);
			return { user: null, confidence: 0, faceDetected: false };
		}
	}

	private async matchFaceDescriptor(descriptor: Float32Array): Promise<{
		user: FaceEncoding | null;
		confidence: number;
	}> {
		const faceapi = await this.loadFaceApi();

		let bestMatch: FaceEncoding | null = null;
		let bestDistance = Infinity;

		for (let i = 0; i < this.faceDatabase.length; i++) {
			const knownDescriptor = this.knownFaceDescriptors[i];
			const distance = faceapi.euclideanDistance(descriptor, knownDescriptor);

			if (distance < bestDistance) {
				bestDistance = distance;
				bestMatch = this.faceDatabase[i];
			}
		}

		// Convert distance to confidence (lower distance = higher confidence)
		// face-api.js typically uses 0.6 as threshold, lower is better match
		const threshold = 0.6;
		const confidence = Math.max(0, 1 - bestDistance / threshold);

		if (bestDistance <= threshold) {
			return {
				user: bestMatch,
				confidence: confidence,
			};
		}

		return {
			user: null,
			confidence: confidence,
		};
	}

	private matchFace(encoding: number[]): { user: FaceEncoding | null; confidence: number } {
		let bestMatch: FaceEncoding | null = null;
		let bestSimilarity = -1;

		for (const user of this.faceDatabase) {
			const similarity = this.cosineSimilarity(encoding, user.encoding);

			if (similarity > bestSimilarity) {
				bestSimilarity = similarity;
				bestMatch = user;
			}
		}

		// Threshold for face recognition (adjust as needed)
		const threshold = 0.7;

		if (bestSimilarity >= threshold) {
			return {
				user: bestMatch,
				confidence: bestSimilarity,
			};
		}

		return {
			user: null,
			confidence: bestSimilarity,
		};
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		normA = Math.sqrt(normA);
		normB = Math.sqrt(normB);

		if (normA === 0 || normB === 0) return 0;

		return dotProduct / (normA * normB);
	}

	public async isReady(): Promise<boolean> {
		return this.ensureInitialized();
	}

	public getFaceDatabase(): FaceEncoding[] {
		return this.faceDatabase;
	}

	public addFaceToDatabase(faceEncoding: Omit<FaceEncoding, "id">): void {
		const id = (this.faceDatabase.length + 1).toString();
		this.faceDatabase.push({ ...faceEncoding, id });
	}

	public removeFaceFromDatabase(id: string): void {
		this.faceDatabase = this.faceDatabase.filter((face) => face.id !== id);
	}
}

// Export singleton instance
export const facialRecognitionService = new FacialRecognitionService();
