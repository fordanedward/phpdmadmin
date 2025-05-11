import { writable } from 'svelte/store';

export const notification = writable({
  message: '',
  type: 'info' as 'success' | 'error' | 'info',
  show: false
});

export function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
  notification.set({ message, type, show: true });
  setTimeout(() => notification.set({ message: '', type, show: false }), 3000);
}