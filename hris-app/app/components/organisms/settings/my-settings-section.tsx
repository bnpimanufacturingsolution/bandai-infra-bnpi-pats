import { SettingsSelectItem } from "~/components/molecules/settings/settings-select-item";
import { SettingsToggleItem } from "~/components/molecules/settings/settings-toggle-item";
import { useState } from "react";

export function MySettingsSection() {
	const [appearance, setAppearance] = useState("light");
	const [twoFactorAuth, setTwoFactorAuth] = useState(true);
	const [language, setLanguage] = useState("english");

	const appearanceOptions = [
		{ value: "light", label: "Light" },
		{ value: "dark", label: "Dark" },
		{ value: "system", label: "System" },
	];

	const languageOptions = [
		{ value: "english", label: "English" },
		{ value: "spanish", label: "Spanish" },
		{ value: "french", label: "French" },
		{ value: "german", label: "German" },
	];

	return (
		<div className="space-y-10">
			<div>
				<h2 className="text-2xl font-bold text-foreground mb-8">My Settings</h2>

				<div className="space-y-0 divide-y divide-border">
					<SettingsSelectItem
						id="appearance"
						title="Appearance"
						description="Customize how you theams looks on your device."
						value={appearance}
						options={appearanceOptions}
						onValueChange={setAppearance}
					/>

					<SettingsToggleItem
						id="two-factor"
						title="Two-factor authentication"
						description="Keep your account secure by enabling 2FA via SMS or using a temporary one-time passcode (TOTP)."
						checked={twoFactorAuth}
						onCheckedChange={setTwoFactorAuth}
					/>

					<SettingsSelectItem
						id="language"
						title="Language"
						description="Customize how you theams looks on your device."
						value={language}
						options={languageOptions}
						onValueChange={setLanguage}
					/>
				</div>
			</div>
		</div>
	);
}
