import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/atoms/Button";
import { Select, type SelectOption } from "~/components/atoms/Select";
import { Input } from "~/components/ui/input";
import { useAuth } from "~/lib/hooks/use-auth";
import {
	useSystemProvisioningStatus,
	useUpdateProvisioningHrSettings,
} from "~/lib/hooks/useSystemProvisioning";
import systemProvisioningService from "~/services/system-provisioning.service";
import { bandaiLogo, resolveCompanyLogo } from "~/lib/company-logo";

const TIMEZONE_OPTIONS: SelectOption[] = [
	{ value: "Asia/Manila", label: "Asia/Manila (Philippines)" },
	{ value: "Asia/Singapore", label: "Asia/Singapore" },
	{ value: "Asia/Tokyo", label: "Asia/Tokyo" },
	{ value: "Asia/Hong_Kong", label: "Asia/Hong Kong" },
	{ value: "Australia/Sydney", label: "Australia/Sydney" },
	{ value: "Europe/London", label: "Europe/London" },
	{ value: "Europe/Berlin", label: "Europe/Berlin" },
	{ value: "America/New_York", label: "America/New York" },
	{ value: "America/Chicago", label: "America/Chicago" },
	{ value: "America/Los_Angeles", label: "America/Los Angeles" },
	{ value: "UTC", label: "UTC" },
];

function buildTimezoneOptions(selectedTimezone: string): SelectOption[] {
	if (!selectedTimezone || TIMEZONE_OPTIONS.some((option) => option.value === selectedTimezone)) {
		return TIMEZONE_OPTIONS;
	}

	return [{ value: selectedTimezone, label: selectedTimezone }, ...TIMEZONE_OPTIONS];
}

function FieldLabel(props: { children: ReactNode }) {
	return (
		<label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
			{props.children}
		</label>
	);
}

function ColorField(props: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-2">
			<FieldLabel>{props.label}</FieldLabel>
			<div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3">
				<input
					type="color"
					value={props.value}
					onChange={(event) => props.onChange(event.target.value)}
					className="h-6 w-8 shrink-0 cursor-pointer border-0 bg-transparent p-0"
					aria-label={props.label}
				/>
				<Input
					value={props.value}
					onChange={(event) => props.onChange(event.target.value)}
					className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
				/>
			</div>
		</div>
	);
}

export default function CompanyProfileConfigurationPage() {
	const { getCurrentUser } = useAuth();
	const statusQuery = useSystemProvisioningStatus(true);
	const updateHrSettings = useUpdateProvisioningHrSettings();

	const [companyName, setCompanyName] = useState("");
	const [description, setDescription] = useState("");
	const [timezone, setTimezone] = useState("Asia/Manila");
	const [logo, setLogo] = useState("");
	const [primaryColor, setPrimaryColor] = useState("#E60012");
	const [secondaryColor, setSecondaryColor] = useState("#FF8200");
	const [accentColor, setAccentColor] = useState("#f59e0b");
	const [didHydrate, setDidHydrate] = useState(false);
	const [isUploadingLogo, setIsUploadingLogo] = useState(false);

	const status = statusQuery.data;
	const timezoneOptions = buildTimezoneOptions(timezone);

	useEffect(() => {
		if (!status || didHydrate) return;

		const branding = status.organization.branding || {};
		const colors = branding.colors || {};
		setCompanyName(
			status.provisioning?.hrSettings?.companyName || status.organization.name || "",
		);
		setDescription(status.organization.description || "");
		setTimezone(status.provisioning?.hrSettings?.timezone || "Asia/Manila");
		setLogo(resolveCompanyLogo(String(branding.logo || "")));
		setPrimaryColor(String(colors.primary || "#E60012"));
		setSecondaryColor(String(colors.secondary || "#FF8200"));
		setAccentColor(String(colors.accent || "#f59e0b"));
		setDidHydrate(true);
	}, [didHydrate, status]);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!companyName.trim() || !timezone.trim()) {
			toast.error("Company name and timezone are required");
			return;
		}

		await updateHrSettings.mutateAsync({
			companyName: companyName.trim(),
			description: description.trim(),
			timezone: timezone.trim(),
			logo: logo.trim(),
			primaryColor,
			secondaryColor,
			accentColor,
		});
		await statusQuery.refetch();
		await getCurrentUser();
	};

	const handleLogoUpload = async (file?: File | null) => {
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error("Upload an image file for the company logo");
			return;
		}

		setIsUploadingLogo(true);
		try {
			const result = await systemProvisioningService.uploadLogo(file);
			setLogo(result.logo);
			await statusQuery.refetch();
			await getCurrentUser();
			toast.success("Company logo uploaded");
		} finally {
			setIsUploadingLogo(false);
		}
	};

	if (statusQuery.isLoading && !status) {
		return (
			<div className="flex min-h-[360px] items-center justify-center text-sm text-gray-500">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				Loading company profile...
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-5xl space-y-4">
			<div className="rounded-lg border border-gray-200 bg-white p-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h1 className="text-xl font-semibold text-gray-900">Company Profile</h1>
						<p className="mt-1 text-sm text-gray-500">
							Organization identity used by admin, HR, and employee workspaces.
						</p>
					</div>
					<Button
						type="submit"
						form="company-profile-form"
						disabled={updateHrSettings.isPending || !companyName.trim() || !timezone.trim()}
						className="bg-orange-600 text-white hover:bg-orange-700">
						{updateHrSettings.isPending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						Save Changes
					</Button>
				</div>
			</div>

			<form
				id="company-profile-form"
				onSubmit={handleSubmit}
				className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
				<section className="rounded-lg border border-gray-200 bg-white p-5">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<FieldLabel>Company Name</FieldLabel>
							<Input
								value={companyName}
								onChange={(event) => setCompanyName(event.target.value)}
								className="h-10 rounded-lg border-gray-200"
							/>
						</div>
						<div className="space-y-2">
							<FieldLabel>Timezone</FieldLabel>
							<Select
								options={timezoneOptions}
								value={timezone}
								onChange={setTimezone}
								className="h-10 rounded-lg border-gray-200 bg-white text-sm"
							/>
						</div>
						<div className="space-y-2 md:col-span-2">
							<FieldLabel>Description</FieldLabel>
							<textarea
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								rows={4}
								className="min-h-[112px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
							/>
						</div>
						<div className="space-y-2 md:col-span-2">
							<FieldLabel>Company Logo</FieldLabel>
							<label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition hover:border-orange-200 hover:bg-orange-50/30">
								<span className="min-w-0 truncate text-gray-600">
									{logo ? "Logo uploaded" : "Choose PNG, JPG, or WebP"}
								</span>
								<span className="inline-flex shrink-0 items-center font-semibold text-orange-700">
									<Upload className="mr-2 h-4 w-4" />
									{isUploadingLogo ? "Uploading..." : "Upload"}
								</span>
								<input
									type="file"
									accept="image/png,image/jpeg,image/webp,image/svg+xml"
									className="sr-only"
									disabled={isUploadingLogo}
									onChange={(event) => {
										void handleLogoUpload(event.target.files?.[0]);
										event.currentTarget.value = "";
									}}
								/>
							</label>
						</div>
						<div className="grid gap-4 md:col-span-2 md:grid-cols-3">
							<ColorField label="Primary Color" value={primaryColor} onChange={setPrimaryColor} />
							<ColorField
								label="Secondary Color"
								value={secondaryColor}
								onChange={setSecondaryColor}
							/>
							<ColorField label="Accent Color" value={accentColor} onChange={setAccentColor} />
						</div>
					</div>
				</section>

				<aside className="rounded-lg border border-gray-200 bg-white p-4">
					<div className="flex h-28 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-4">
						{logo ? (
							<img
								src={logo}
								alt={`${companyName || "Company"} logo`}
								className="max-h-20 max-w-full object-contain"
							/>
						) : (
							<div className="text-sm font-semibold text-gray-500">Logo preview</div>
						)}
					</div>
					<div className="mt-4 space-y-3">
						<div>
							<p className="truncate text-base font-semibold text-gray-900">
								{companyName || "Company name"}
							</p>
							<p className="mt-1 line-clamp-5 text-sm leading-6 text-gray-600">
								{description || "Company description"}
							</p>
						</div>
						<div className="flex gap-2">
							{[primaryColor, secondaryColor, accentColor].map((color) => (
								<span
									key={color}
									className="h-6 w-10 rounded-md border border-gray-200"
									style={{ backgroundColor: color }}
								/>
							))}
						</div>
					</div>
				</aside>
			</form>
		</div>
	);
}
