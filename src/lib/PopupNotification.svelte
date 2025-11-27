<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { popupNotifications, removeNotification } from './popupNotificationStore.js';

	interface NotificationItem {
		id: string;
		message: string;
		type: 'success' | 'error' | 'info' | 'warning';
		duration?: number;
	}

	let activeNotifications: NotificationItem[] = [];

	onMount(() => {
		const unsubscribe = popupNotifications.subscribe((notifications: NotificationItem[]) => {
			activeNotifications = notifications;
		});

		return unsubscribe;
	});

	function handleDismiss(notificationId: string) {
		removeNotification(notificationId);
	}

	function handleClick(notificationId: string) {
		handleDismiss(notificationId);
	}
</script>

<div class="popup-notification-container">
	{#each activeNotifications as notification (notification.id)}
		<div
			class="popup-notification {notification.type}"
			in:slide={{ duration: 300, axis: 'x' }}
			out:slide={{ duration: 300, axis: 'x' }}
			role="button"
			tabindex="0"
			aria-live="polite"
			on:click={() => handleClick(notification.id)}
			on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick(notification.id)}
		>
			<div class="notification-content">
				<div class="notification-icon">
					{#if notification.type === 'success'}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					{:else if notification.type === 'error'}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					{:else if notification.type === 'warning'}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 1.677A9 9 0 1121 12a.75.75 0 00-1.5 0M15 12.75h.008v.008H15v-.008z" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					{/if}
				</div>
				<div class="notification-message">
					{notification.message}
				</div>
				<button class="notification-close" on:click|stopPropagation={() => handleDismiss(notification.id)} aria-label="Close notification">
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="notification-progress" style="--duration: {(notification.duration || 5000) / 1000}s"></div>
		</div>
	{/each}
</div>

<style>
	.popup-notification-container {
		position: fixed;
		bottom: 2rem;
		right: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		z-index: 9999;
		pointer-events: none;
	}

	.popup-notification {
		min-width: 300px;
		max-width: 450px;
		border-radius: 0.5rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
		overflow: hidden;
		pointer-events: auto;
		cursor: pointer;
		animation: slideIn 0.3s ease-out;
		outline: none;
	}

	.popup-notification:focus {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.notification-content {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background-color: white;
	}

	.notification-icon {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.notification-icon svg {
		width: 100%;
		height: 100%;
	}

	.popup-notification.success .notification-icon {
		color: #10b981;
	}

	.popup-notification.error .notification-icon {
		color: #ef4444;
	}

	.popup-notification.warning .notification-icon {
		color: #f59e0b;
	}

	.popup-notification.info .notification-icon {
		color: #3b82f6;
	}

	.notification-message {
		flex-grow: 1;
		color: #1f2937;
		font-size: 0.95rem;
		line-height: 1.4;
		word-break: break-word;
	}

	.notification-close {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: #9ca3af;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s ease;
	}

	.notification-close:hover {
		color: #4b5563;
	}

	.notification-close svg {
		width: 100%;
		height: 100%;
	}

	.notification-progress {
		height: 3px;
		background: linear-gradient(90deg, currentColor 0%, transparent 100%);
		animation: progressBar var(--duration, 5s) linear forwards;
	}

	.popup-notification.success .notification-progress {
		color: #10b981;
	}

	.popup-notification.error .notification-progress {
		color: #ef4444;
	}

	.popup-notification.warning .notification-progress {
		color: #f59e0b;
	}

	.popup-notification.info .notification-progress {
		color: #3b82f6;
	}

	@keyframes progressBar {
		from {
			width: 100%;
		}
		to {
			width: 0%;
		}
	}

	@media (max-width: 640px) {
		.popup-notification-container {
			bottom: 1rem;
			right: 1rem;
			left: 1rem;
		}

		.popup-notification {
			min-width: auto;
			max-width: 100%;
		}
	}
</style>
