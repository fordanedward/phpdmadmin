<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Firestore } from 'firebase/firestore';
  import { subscribeToMemberChats } from '$lib/chat/service.js';
  import { openChatDrawer } from '$lib/chat/store.js';

  interface CurrentUserLite {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    role?: string;
  }

  export let db: Firestore | null = null;
  export let currentUser: CurrentUserLite | null = null;

  interface MemberChat {
    id: string;
    memberId: string;
    memberName: string;
    lastMessage: string;
    lastMessageTime: any;
    unreadCount: number;
  }

  let memberChats: MemberChat[] = [];
  let isLoading = true;
  let unsubscribe: (() => void) | null = null;
  let searchTerm = '';

  onMount(() => {
    if (db) {
      startListening();
    }
    return () => {
      unsubscribe?.();
    };
  });

  $: if (db && !unsubscribe) {
    startListening();
  } else if (!db && unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    memberChats = [];
    isLoading = true;
  }

  function startListening() {
    if (!db) return;
    unsubscribe?.();
    unsubscribe = subscribeToMemberChats(db, (chats) => {
      memberChats = chats;
      isLoading = false;
    });
  }

  function handleOpenChat(chat: MemberChat) {
    if (!chat.memberId) return;
    openChatDrawer({
      chatType: 'member',
      patientId: chat.memberId,
      recipientId: chat.memberId,
      patientName: chat.memberName,
      recipientName: chat.memberName,
      source: 'member-chats-list'
    });
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

  $: filteredChats = searchTerm.trim()
    ? memberChats.filter(
        (chat) =>
          chat.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          chat.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : memberChats;
</script>

{#if db && currentUser}
  <div class="member-chats-container">
    <div class="header">
      <h2>Member Chats</h2>
      <p class="subtitle">Chat with members who need support</p>
    </div>

    <div class="search-bar">
      <input
        type="text"
        placeholder="Search by member name or message..."
        bind:value={searchTerm}
        class="search-input"
      />
    </div>

    {#if isLoading}
      <div class="loading">Loading member chats...</div>
    {:else if filteredChats.length === 0}
      <div class="empty">
        {#if searchTerm.trim()}
          <p>No chats match your search.</p>
        {:else}
          <p>No member chats yet.</p>
          <p class="empty-subtitle">Members will appear here when they start a conversation.</p>
        {/if}
      </div>
    {:else}
      <div class="chats-list">
        {#each filteredChats as chat (chat.id)}
          <button
            type="button"
            class="chat-item"
            class:unread={chat.unreadCount > 0}
            on:click={() => handleOpenChat(chat)}
          >
            <div class="chat-content">
              <div class="chat-header-row">
                <h3 class="member-name">{chat.memberName}</h3>
                {#if chat.unreadCount > 0}
                  <span class="badge">{chat.unreadCount}</span>
                {/if}
              </div>
              <p class="last-message">{chat.lastMessage || 'No messages yet'}</p>
              <span class="timestamp">{formatRelativeTime(chat.lastMessageTime)}</span>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="chevron"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .member-chats-container {
    background: white;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    max-width: 600px;
    margin: 0 auto;
  }

  .header {
    margin-bottom: 1.5rem;
  }

  .header h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 0.25rem 0;
  }

  .subtitle {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  .search-bar {
    margin-bottom: 1rem;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.95rem;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .loading,
  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: #6b7280;
  }

  .empty-subtitle {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    color: #9ca3af;
  }

  .chats-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .chat-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    width: 100%;
  }

  .chat-item:hover {
    background: #f9fafb;
    border-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .chat-item.unread {
    border-left: 3px solid #2563eb;
    background: #eff6ff;
  }

  .chat-content {
    flex: 1;
    min-width: 0;
  }

  .chat-header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .member-name {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    margin: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    background: #2563eb;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    min-width: 1.25rem;
    text-align: center;
  }

  .last-message {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0.25rem 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timestamp {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .chevron {
    width: 1.25rem;
    height: 1.25rem;
    color: #9ca3af;
    flex-shrink: 0;
    margin-left: 0.75rem;
  }

  @media (max-width: 640px) {
    .member-chats-container {
      padding: 1rem;
    }

    .header h2 {
      font-size: 1.25rem;
    }
  }
</style>

