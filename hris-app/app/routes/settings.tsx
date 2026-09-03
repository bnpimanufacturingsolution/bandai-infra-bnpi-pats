import { MyProfile } from "~/components/templates/common/profile-template";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useResetGeneratedPayrolls } from "~/lib/hooks/useEmployeePayroll";

export default function SettingsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const resetGeneratedPayrollsMutation = useResetGeneratedPayrolls();
	const resetTriggerRef = useRef("");

	useEffect(() => {
		const shouldReset =
			searchParams.get("debug") === "true" &&
			searchParams.get("resetEmployeePayrolls") === "true";
		const triggerKey = searchParams.toString();
		if (!shouldReset || resetTriggerRef.current === triggerKey) return;

		resetTriggerRef.current = triggerKey;
		resetGeneratedPayrollsMutation.mutate(undefined, {
			onSuccess: () => {
				setSearchParams((prev) => {
					const next = new URLSearchParams(prev);
					next.delete("debug");
					next.delete("resetEmployeePayrolls");
					return next;
				});
			},
		});
	}, [searchParams, resetGeneratedPayrollsMutation, setSearchParams]);

	return <MyProfile />;
}
