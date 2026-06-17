import { NotificationCheckboxItem } from "~/components/molecules/settings/notification-checkbox-item";
import { SettingsToggleItem } from "~/components/molecules/settings/settings-toggle-item";
import { useState } from "react";

export function NotificationsSection() {
	const [notifications, setNotifications] = useState({
		dailyUpdate: true,
		newEvent: true,
		addedToTeam: true,
	});

	const [pushSettings, setPushSettings] = useState({
		mobilePush: true,
		desktopNotification: true,
		emailNotification: false,
	});

	return (
		<div className="space-y-10">
			<div>
				<h2 className="text-2xl font-bold text-foreground mb-8">My Notifications</h2>

				{/* Notify me when section */}
				<div className="space-y-8">
					<div>
						<div className="flex items-center justify-between mb-5">
							<h3 className="text-sm font-medium text-foreground">
								Notify me when...
							</h3>
							<a
								href="#"
								className="text-sm text-primary hover:underline font-normal">
								About notifications?
							</a>
						</div>
						<div className="space-y-4">
							<NotificationCheckboxItem
								id="daily-update"
								label="Daily productivity update"
								checked={notifications.dailyUpdate}
								onCheckedChange={(checked) =>
									setNotifications((prev) => ({ ...prev, dailyUpdate: checked }))
								}
							/>
							<NotificationCheckboxItem
								id="new-event"
								label="New event created"
								checked={notifications.newEvent}
								onCheckedChange={(checked) =>
									setNotifications((prev) => ({ ...prev, newEvent: checked }))
								}
							/>
							<NotificationCheckboxItem
								id="added-team"
								label="When added on new team"
								checked={notifications.addedToTeam}
								onCheckedChange={(checked) =>
									setNotifications((prev) => ({ ...prev, addedToTeam: checked }))
								}
							/>
						</div>
					</div>

					{/* Push notification settings */}
					<div className="space-y-0 border-t border-border pt-8">
						<SettingsToggleItem
							id="mobile-push"
							title="Mobile push notifications"
							description="Receive push notification whenever your organisation requires your attentions"
							checked={pushSettings.mobilePush}
							onCheckedChange={(checked) =>
								setPushSettings((prev) => ({ ...prev, mobilePush: checked }))
							}
						/>
						<SettingsToggleItem
							id="desktop-notification"
							title="Desktop Notification"
							description="Receive desktop notification whenever your organisation requires your attentions"
							checked={pushSettings.desktopNotification}
							onCheckedChange={(checked) =>
								setPushSettings((prev) => ({
									...prev,
									desktopNotification: checked,
								}))
							}
						/>
						<SettingsToggleItem
							id="email-notification"
							title="Email Notification"
							description="Receive email  whenever your organisation requires your attentions"
							checked={pushSettings.emailNotification}
							onCheckedChange={(checked) =>
								setPushSettings((prev) => ({ ...prev, emailNotification: checked }))
							}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
