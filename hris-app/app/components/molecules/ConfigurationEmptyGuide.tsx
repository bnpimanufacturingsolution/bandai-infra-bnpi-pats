import { useNavigate } from "react-router";
import { Button } from "~/components/atoms/Button";

export type ConfigurationEmptyGuideProps = {
	/** Button label (e.g. "Add level"). */
	label: string;
	/** Navigate here on click (ignored if `onClick` is set). */
	to?: string;
	/** If set, called on click instead of navigating to `to`. */
	onClick?: () => void;
};

/**
 * Empty-state CTA: one click opens create (deep link or callback). No modal.
 */
export function ConfigurationEmptyGuide({ label, to, onClick }: ConfigurationEmptyGuideProps) {
	const navigate = useNavigate();

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() => {
				if (onClick) {
					onClick();
					return;
				}
				if (to) navigate(to);
			}}>
			{label}
		</Button>
	);
}
