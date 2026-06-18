import { ConstraintTokenRow } from "~/components/molecules/ConstraintTokens";

type FormCharHintProps = {
	length: number;
	max: number;
	min?: number;
	className?: string;
};

export function FormCharHint({ length, max, min, className = "" }: FormCharHintProps) {
	const safeLen = Math.max(0, length);
	const over = safeLen > max;

	return (
		<ConstraintTokenRow
			className={className}
			tokens={[
				min != null && min > 0
					? { label: `${min}-${max}`, tone: over ? "invalid" : "default" }
					: null,
				{ label: `${safeLen}/${max}`, tone: over ? "invalid" : "subtle" },
			]}
		/>
	);
}
