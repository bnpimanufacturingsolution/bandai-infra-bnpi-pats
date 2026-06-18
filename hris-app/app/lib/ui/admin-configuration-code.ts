import { useEffect, useRef } from "react";

const DEFAULT_DEBOUNCE_MS = 350;

interface UseDebouncedGeneratedCodeFieldOptions {
	enabled: boolean;
	sourceValue: string;
	currentCodeValue: string;
	onGeneratedCode: (nextCode: string) => void;
	generateCode: (sourceValue: string) => Promise<string>;
	debounceMs?: number;
}

export function useDebouncedGeneratedCodeField({
	enabled,
	sourceValue,
	currentCodeValue,
	onGeneratedCode,
	generateCode,
	debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseDebouncedGeneratedCodeFieldOptions) {
	const lastGeneratedCodeRef = useRef("");
	const activeRequestIdRef = useRef(0);

	useEffect(() => {
		if (!enabled) return;

		const currentCode = String(currentCodeValue || "").trim();
		const nextSourceValue = String(sourceValue || "").trim();
		const canReplace = currentCode === "" || currentCode === lastGeneratedCodeRef.current;

		if (!nextSourceValue || !canReplace) return;

		const timeoutId = window.setTimeout(() => {
			const requestId = activeRequestIdRef.current + 1;
			activeRequestIdRef.current = requestId;

			void generateCode(nextSourceValue)
				.then((generatedCode) => {
					if (activeRequestIdRef.current !== requestId) return;
					if (!generatedCode) return;
					lastGeneratedCodeRef.current = generatedCode;
					onGeneratedCode(generatedCode);
				})
				.catch(() => {
					// Keep the field editable if code suggestion is temporarily unavailable.
				});
		}, debounceMs);

		return () => window.clearTimeout(timeoutId);
	}, [currentCodeValue, debounceMs, enabled, generateCode, onGeneratedCode, sourceValue]);
}
