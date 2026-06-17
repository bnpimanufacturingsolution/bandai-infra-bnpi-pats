import { FieldLabel, FieldValue } from "~/components/atoms/jobs";

interface FieldGroupProps {
	label: string;
	value: React.ReactNode;
	valueClassName?: string;
}

export const FieldGroup = ({ label, value, valueClassName }: FieldGroupProps) => (
	<div>
		<FieldLabel>{label}</FieldLabel>
		<FieldValue className={valueClassName}>{value}</FieldValue>
	</div>
);
