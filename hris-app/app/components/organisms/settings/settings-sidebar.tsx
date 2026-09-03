import {
	User,
	Settings as SettingsIcon,
	Sliders,
	Grid,
	Users,
	ArrowUp,
	Shield,
	FileText,
	CreditCard,
	Map,
} from "lucide-react";
import { SettingsSectionHeader } from "~/components/atoms/settings/settings-section-header";
import { SettingsNavItem } from "~/components/atoms/settings/settings-nav-item";

interface SettingsSidebarProps {
	activeSection: string;
	onSectionChange: (section: string) => void;
}

export function SettingsSidebar({ activeSection, onSectionChange }: SettingsSidebarProps) {
	return (
		<aside className="w-64 min-h-screen border-r border-border bg-background px-5 py-8">
			<div className="space-y-8">
				{/* Account Section */}
				<div>
					<SettingsSectionHeader title="ACCOUNT" />
					<div className="space-y-1">
						<SettingsNavItem
							icon={User}
							label="My Profile"
							isActive={activeSection === "profile"}
							onClick={() => onSectionChange("profile")}
						/>
						<SettingsNavItem
							icon={SettingsIcon}
							label="General"
							isActive={activeSection === "general"}
							onClick={() => onSectionChange("general")}
						/>
						<SettingsNavItem
							icon={Sliders}
							label="Preferences"
							isActive={activeSection === "preferences"}
							onClick={() => onSectionChange("preferences")}
						/>
						<SettingsNavItem
							icon={Grid}
							label="Applications"
							isActive={activeSection === "applications"}
							onClick={() => onSectionChange("applications")}
						/>
					</div>
				</div>

				{/* Workspace Section */}
				<div>
					<SettingsSectionHeader title="WORKSPACE" />
					<div className="space-y-1">
						<SettingsNavItem
							icon={SettingsIcon}
							label="Settings"
							isActive={activeSection === "settings"}
							onClick={() => onSectionChange("settings")}
						/>
						<SettingsNavItem
							icon={Users}
							label="Members"
							isActive={activeSection === "members"}
							onClick={() => onSectionChange("members")}
						/>
						<SettingsNavItem
							icon={ArrowUp}
							label="Upgrade"
							isActive={activeSection === "upgrade"}
							onClick={() => onSectionChange("upgrade")}
						/>
						<SettingsNavItem
							icon={Shield}
							label="Security"
							isActive={activeSection === "security"}
							onClick={() => onSectionChange("security")}
						/>
						<SettingsNavItem
							icon={FileText}
							label="Templates"
							isActive={activeSection === "templates"}
							onClick={() => onSectionChange("templates")}
						/>
						<SettingsNavItem
							icon={CreditCard}
							label="Billing"
							isActive={activeSection === "billing"}
							onClick={() => onSectionChange("billing")}
						/>
						<SettingsNavItem
							icon={Map}
							label="Roadmaps"
							isActive={activeSection === "roadmaps"}
							onClick={() => onSectionChange("roadmaps")}
						/>
					</div>
				</div>
			</div>
		</aside>
	);
}
