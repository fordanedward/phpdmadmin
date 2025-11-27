import { writable } from 'svelte/store';

export interface PopupNotification {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info' | 'warning';
	duration?: number;
	actionLabel?: string;
	actionCallback?: () => void;
}

function createPopupNotificationStore() {
	const { subscribe, set, update } = writable<PopupNotification[]>([]);

	return {
		subscribe,
		addNotification: (
			message: string,
			type: 'success' | 'error' | 'info' | 'warning' = 'info',
			duration = 5000,
			actionLabel?: string,
			actionCallback?: () => void
		) => {
			const id = Math.random().toString(36).substring(2, 11);
			const notification: PopupNotification = {
				id,
				message,
				type,
				duration,
				actionLabel,
				actionCallback
			};

			update((notifications) => [...notifications, notification]);

			// Auto-remove after duration
			if (duration > 0) {
				setTimeout(() => {
					removeNotification(id);
				}, duration);
			}

			return id;
		},
		removeNotification: (id: string) => {
			update((notifications) => notifications.filter((n) => n.id !== id));
		},
		clear: () => {
			set([]);
		}
	};
}

export const popupNotifications = createPopupNotificationStore();

export function addPopupNotification(
	message: string,
	type: 'success' | 'error' | 'info' | 'warning' = 'info',
	duration = 5000,
	actionLabel?: string,
	actionCallback?: () => void
) {
	return popupNotifications.addNotification(message, type, duration, actionLabel, actionCallback);
}

export function removeNotification(id: string) {
	popupNotifications.removeNotification(id);
}

export function clearPopupNotifications() {
	popupNotifications.clear();
}
