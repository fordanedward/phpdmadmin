<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Firestore } from 'firebase/firestore';
  import {
    markAllNotificationsRead,
    markNotificationRead,
    subscribeToNotifications
  } from '$lib/chat/service.js';
  import { openChatDrawer } from '$lib/chat/store.js';

  interface CurrentUserLite {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    role?: string;
  }

  export let db: Firestore | null = null;
  export let currentUser: CurrentUserLite | null = null;

  let isOpen = false;
  let notifications: any[] = [];
  let unreadCount = 0;
  let unsubscribe: (() => void) | null = null;

  let activeUserKey: string | null = null;

  const teardown = () => {
    unsubscribe?.();
    unsubscribe = null;
    notifications = [];
    unreadCount = 0;
    activeUserKey = null;
  };

  onMount(() => {
    if (db && currentUser) {
      startListening();
    }
    return teardown;
  });

  $: if (db && currentUser) {
    const nextKey = `${currentUser.uid}-${Boolean(db)}`;
    if (nextKey !== activeUserKey) {
      activeUserKey = nextKey;
      startListening();
    }
  } else if (activeUserKey) {
    teardown();
  }

  function startListening() {
    if (!db || !currentUser) return;
    unsubscribe?.();
    unsubscribe = subscribeToNotifications(db, currentUser.uid, (list: any[]) => {
      notifications = list;
      unreadCount = notifications.filter((n) => !n.read).length;
    });
  }

  async function handleMarkAllRead() {
    if (!db || !currentUser) return;
    try {
      await markAllNotificationsRead(db, currentUser.uid);
    } catch (error) {
      console.warn('Cannot mark notifications as read', error);
    }
  }

  async function handleNotificationClick(notification: any) {
    if (!db || !currentUser) return;
    if (!notification) return;
    try {
      await markNotificationRead(db, notification.id);
    } catch (error) {
      console.warn('Unable to mark notification as read', error);
    }

    // Determine chat type from notification
    const chatType = notification.chatType === 'member' ? 'member' : 'appointment';
    
    openChatDrawer({
      chatType: chatType,
      threadId: notification.threadId,
      appointmentId: notification.appointmentId,
      patientId: notification.patientId || notification.threadId, // For member chats, threadId is the memberId
      recipientId: notification.metadata?.senderId || notification.patientId || notification.threadId,
      appointmentDate: notification.metadata?.appointmentDate,
      appointmentTime: notification.metadata?.appointmentTime,
      patientName: notification.metadata?.patientName || notification.metadata?.senderName,
      source: 'notification-center'
    });
    isOpen = false;
  }

  function formatRelativeTime(timestamp: any) {
    if (!timestamp) return '';
    const date = timestamp.toDate?.() ?? new Date(timestamp);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
</script>

{#if currentUser && db}
  <div class="notification-center">
    <button
      class="bell-button"
      on:click={() => (isOpen = !isOpen)}
      aria-label="Toggle notifications"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2a6 6 0 0 0-6 6v3.382l-.894 4.471A1 1 0 0 0 6.09 17h11.82a1 1 0 0 0 .984-1.147L18 11.382V8a6 6 0 0 0-6-6zm0 20a3 3 0 0 0 2.995-2.824L15 19h-6a3 3 0 0 0 2.824 2.995L12 22z"
        />
      </svg>
      {#if unreadCount > 0}
        <span class="badge" aria-label={`${unreadCount} unread notifications`}>{unreadCount}</span>
      {/if}
    </button>

    {#if isOpen}
      <div class="dropdown" role="menu">
        <div class="dropdown-header">
          <div>
            <h3>Notifications</h3>
            <p>{unreadCount} unread</p>
          </div>
          <button on:click={handleMarkAllRead} disabled={unreadCount === 0}>Mark all read</button>
        </div>

        {#if notifications.length === 0}
          <p class="empty">No notifications yet.</p>
        {:else}
          <ul>
            {#each notifications as notification (notification.id)}
              <li class:unread={!notification.read}>
                <button
                  type="button"
                  class="notification-button"
                  on:click={() => handleNotificationClick(notification)}
                >
                  <div class="content">
                    <p>{notification.metadata?.senderName ?? 'Member'} sent a message.</p>
                    <span class="preview">{notification.message}</span>
                  </div>
                  <span class="time">{formatRelativeTime(notification.createdAt)}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .notification-center {
    position: fixed;
    top: 1rem;
    right: 1.25rem;
    z-index: 1150;
  }

  .bell-button {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: none;
    background: #1d4ed8;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);
  }

  .bell-button svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #ef4444;
    color: #fff;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 999px;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    width: min(320px, 80vw);
    background: #fff;
    border-radius: 0.75rem;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15);
    padding: 0.75rem;
    animation: fadeIn 0.18s ease-out;
  }

  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .dropdown-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #0f172a;
  }

  .dropdown-header p {
    margin: 0;
    color: #64748b;
    font-size: 0.85rem;
  }

  .dropdown-header button {
    border: none;
    background: transparent;
    color: #2563eb;
    font-weight: 600;
    cursor: pointer;
  }

  .dropdown-header button:disabled {
    color: #cbd5f5;
    cursor: not-allowed;
  }

  .empty {
    text-align: center;
    color: #94a3b8;
    margin: 1rem 0;
    font-size: 0.9rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
  }

  li {
    margin: 0;
  }

  .notification-button {
    width: 100%;
    border: none;
    background: transparent;
    padding: 0.65rem;
    border-radius: 0.6rem;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: left;
  }

  li.unread .notification-button {
    background: #eef2ff;
  }

  .notification-button:hover {
    background: #e2e8f0;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .content p {
    margin: 0;
    font-weight: 600;
    color: #0f172a;
    font-size: 0.9rem;
  }

  .preview {
    font-size: 0.85rem;
    color: #475569;
  }

  .time {
    font-size: 0.75rem;
    color: #94a3b8;
    white-space: nowrap;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>

