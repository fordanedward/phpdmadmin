<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Firestore } from 'firebase/firestore';
  import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
  import { openChatDrawer } from '$lib/chat/store.js';
  import { addPopupNotification } from '$lib/popupNotificationStore.js';

  interface CurrentUserLite {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    role?: string;
  }

  export let db: Firestore | null = null;
  export let currentUser: CurrentUserLite | null = null;

  interface PatientProfile {
    id: string;
    name: string;
    lastName: string;
    email: string;
    age?: number;
  }

  interface MemberChatData {
    lastMessage: string;
    lastMessageTime: any;
    unreadCount: number;
  }

  interface MemberDisplay {
    id: string;
    memberId: string;
    memberName: string;
    memberEmail: string;
    lastMessage: string;
    lastMessageTime: any;
    unreadCount: number;
    hasChat: boolean;
  }

  let allMembers: MemberDisplay[] = [];
  let isLoading = true;
  let unsubscribeProfiles: (() => void) | null = null;
  let unsubscribeChats: (() => void) | null = null;
  let searchTerm = '';

  let patientProfiles: PatientProfile[] = [];
  let chatDataMap: Map<string, MemberChatData> = new Map();
  let lastMessageTimestamps: Map<string, number> = new Map();

  onMount(() => {
    if (db) {
      startListening();
    }
    return () => {
      unsubscribeProfiles?.();
      unsubscribeChats?.();
    };
  });

  $: if (db && !unsubscribeProfiles) {
    startListening();
  } else if (!db && unsubscribeProfiles) {
    unsubscribeProfiles?.();
    unsubscribeChats?.();
    unsubscribeProfiles = null;
    unsubscribeChats = null;
    allMembers = [];
    isLoading = true;
  }

  async function startListening() {
    if (!db) return;
    isLoading = true;

    try {
      // Subscribe to all patient profiles
      const profilesRef = collection(db, 'patientProfiles');
      unsubscribeProfiles = onSnapshot(profilesRef, (snapshot) => {
        patientProfiles = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || '',
            lastName: data.lastName || '',
            email: data.email || '',
            age: data.age || 0
          } as PatientProfile;
        });
        mergeData();
      });

      // Subscribe to chat data
      const chatsRef = collection(db, 'chats');
      const chatsQuery = query(chatsRef, orderBy('lastMessageTime', 'desc'));
      unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const memberId = doc.id;
          const newMessageTime = data.lastMessageTime?.toMillis?.() || Date.now();
          const oldMessageTime = lastMessageTimestamps.get(memberId);

          // Check if this is a new message (not initial load)
          if (oldMessageTime && newMessageTime > oldMessageTime) {
            // Find member name for notification
            const member = patientProfiles.find(p => p.id === memberId);
            const memberName = member ? `${member.name} ${member.lastName}`.trim() : 'A member';
            
            // Show popup notification
            addPopupNotification(
              `New message from ${memberName}: "${data.lastMessage?.substring(0, 50)}${(data.lastMessage?.length || 0) > 50 ? '...' : ''}"`,
              'info',
              5000
            );
          }

          // Update timestamp for this member
          lastMessageTimestamps.set(memberId, newMessageTime);
          
          // Update chat data
          chatDataMap.set(memberId, {
            lastMessage: data.lastMessage || '',
            lastMessageTime: data.lastMessageTime,
            unreadCount: data.unreadCount || 0
          });
        });
        mergeData();
      });

    } catch (error) {
      console.error('Error loading member data:', error);
      isLoading = false;
    }
  }

  function mergeData() {
    const merged: MemberDisplay[] = patientProfiles.map(profile => {
      const chatData = chatDataMap.get(profile.id);
      const fullName = `${profile.name} ${profile.lastName}`.trim() || 'Unknown Member';
      
      return {
        id: profile.id,
        memberId: profile.id,
        memberName: fullName,
        memberEmail: profile.email,
        lastMessage: chatData?.lastMessage || '',
        lastMessageTime: chatData?.lastMessageTime || null,
        unreadCount: chatData?.unreadCount || 0,
        hasChat: !!chatData
      };
    });

    // Sort: unread first, then by last message time, then alphabetically
    merged.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      
      if (a.lastMessageTime && b.lastMessageTime) {
        const timeA = a.lastMessageTime.toDate?.() ?? new Date(a.lastMessageTime);
        const timeB = b.lastMessageTime.toDate?.() ?? new Date(b.lastMessageTime);
        return timeB.getTime() - timeA.getTime();
      }
      
      if (a.lastMessageTime && !b.lastMessageTime) return -1;
      if (!a.lastMessageTime && b.lastMessageTime) return 1;
      
      return a.memberName.localeCompare(b.memberName);
    });

    allMembers = merged;
    isLoading = false;
  }

  function handleOpenChat(member: MemberDisplay) {
    if (!member.memberId) return;
    openChatDrawer({
      chatType: 'member',
      patientId: member.memberId,
      recipientId: member.memberId,
      patientName: member.memberName,
      recipientName: member.memberName,
      patientEmail: member.memberEmail,
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

  $: filteredMembers = searchTerm.trim()
    ? allMembers.filter(
        (member) =>
          member.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.memberEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : allMembers;
</script>

{#if db && currentUser}
  <div class="member-chats-container">
    <div class="header">
      <div class="header-icon">
        <svg xmlns="http://www.w3.org/2000/svg" class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
        </svg>
      </div>
      <div class="header-text">
        <h2>Member Chats</h2>
        <p class="subtitle">{filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}</p>
      </div>
    </div>

    <div class="search-bar">
      <svg xmlns="http://www.w3.org/2000/svg" class="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        placeholder="Search members..."
        bind:value={searchTerm}
        class="search-input"
      />
    </div>

    {#if isLoading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading members...</p>
      </div>
    {:else if filteredMembers.length === 0}
      <div class="empty">
        <svg xmlns="http://www.w3.org/2000/svg" class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {#if searchTerm.trim()}
          <p class="empty-title">No members found</p>
          <p class="empty-subtitle">Try a different search term</p>
        {:else}
          <p class="empty-title">No members yet</p>
          <p class="empty-subtitle">Members will appear here once they register</p>
        {/if}
      </div>
    {:else}
      <div class="chats-list">
        {#each filteredMembers as member (member.id)}
          <button
            type="button"
            class="chat-item"
            class:unread={member.unreadCount > 0}
            class:no-chat={!member.hasChat}
            on:click={() => handleOpenChat(member)}
          >
            <div class="member-avatar">
              <div class="avatar-circle">
                {member.memberName.charAt(0).toUpperCase()}
              </div>
              {#if member.unreadCount > 0}
                <span class="online-indicator"></span>
              {/if}
            </div>
            <div class="chat-content">
              <div class="chat-header-row">
                <h3 class="member-name">{member.memberName}</h3>
                {#if member.lastMessageTime}
                  <span class="timestamp">{formatRelativeTime(member.lastMessageTime)}</span>
                {/if}
              </div>
              <div class="message-preview-row">
                {#if member.lastMessage}
                  <p class="last-message" class:unread-message={member.unreadCount > 0}>
                    {member.lastMessage}
                  </p>
                {:else}
                  <p class="last-message no-message">Click to start a conversation</p>
                {/if}
                <div class="badges">
                  {#if member.unreadCount > 0}
                    <span class="badge">{member.unreadCount}</span>
                  {/if}
                  {#if !member.hasChat}
                    <span class="new-badge">New</span>
                  {/if}
                </div>
              </div>
            </div>
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
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 600px;
    max-height: 70vh;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(135deg, #1e3a66 0%, #1e3a66 100%);
    color: white;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .header-icon .icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .header-text {
    flex: 1;
  }

  .header h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    color: white;
  }

  .header .subtitle {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.85);
    margin: 0.125rem 0 0 0;
  }

  .search-bar {
    position: relative;
    padding: 1rem 1.5rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .search-icon {
    position: absolute;
    left: 2rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1.125rem;
    height: 1.125rem;
    color: #9ca3af;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 0.625rem 0.875rem 0.625rem 2.5rem;
    border: 1px solid #d1d5db;
    border-radius: 1.5rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: #6b7280;
    flex: 1;
  }

  .spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 3px solid #e5e7eb;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    text-align: center;
    flex: 1;
  }

  .empty-icon {
    width: 4rem;
    height: 4rem;
    color: #d1d5db;
    margin-bottom: 1rem;
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
    margin: 0 0 0.5rem 0;
  }

  .empty-subtitle {
    font-size: 0.875rem;
    color: #9ca3af;
    margin: 0;
  }

  .chats-list {
    flex: 1;
    overflow-y: auto;
    background: white;
  }

  .chats-list::-webkit-scrollbar {
    width: 6px;
  }

  .chats-list::-webkit-scrollbar-thumb {
    background-color: #d1d5db;
    border-radius: 3px;
  }

  .chats-list::-webkit-scrollbar-track {
    background-color: #f9fafb;
  }

  .chat-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border: none;
    border-bottom: 1px solid #f3f4f6;
    background: white;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
    position: relative;
  }

  .chat-item:hover {
    background: #f9fafb;
  }

  .chat-item:active {
    background: #f3f4f6;
  }

  .chat-item.unread {
    background: #eff6ff;
    border-left: 3px solid #2563eb;
  }

  .chat-item.unread:hover {
    background: #dbeafe;
  }

  .chat-item.no-chat {
    background: #f0fdf4;
    border-left: 3px solid #10b981;
  }

  .chat-item.no-chat:hover {
    background: #dcfce7;
  }

  .member-avatar {
    position: relative;
    flex-shrink: 0;
  }

  .avatar-circle {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background: linear-gradient(135deg, #1e3a66 0%, #1e3a66 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .online-indicator {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 0.75rem;
    height: 0.75rem;
    background: #10b981;
    border: 2px solid white;
    border-radius: 50%;
  }

  .chat-content {
    flex: 1;
    min-width: 0;
  }

  .chat-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.375rem;
  }

  .member-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #111827;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timestamp {
    font-size: 0.75rem;
    color: #9ca3af;
    flex-shrink: 0;
  }

  .message-preview-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .last-message {
    font-size: 0.8125rem;
    color: #6b7280;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .last-message.unread-message {
    color: #374151;
    font-weight: 600;
  }

  .last-message.no-message {
    font-style: italic;
    color: #9ca3af;
    font-weight: 400;
  }

  .badges {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .badge {
    background: #2563eb;
    color: white;
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    min-width: 1.25rem;
    text-align: center;
    line-height: 1.2;
  }

  .new-badge {
    background: #10b981;
    color: white;
    font-size: 0.625rem;
    font-weight: 700;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    line-height: 1.2;
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .member-chats-container {
      height: auto;
      max-height: none;
    }

    .header {
      padding: 1rem;
    }

    .header-icon {
      width: 2rem;
      height: 2rem;
    }

    .header-icon .icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .header h2 {
      font-size: 1.125rem;
    }

    .search-bar {
      padding: 0.75rem 1rem;
    }

    .chat-item {
      padding: 0.875rem 1rem;
      gap: 0.75rem;
    }

    .avatar-circle {
      width: 2.5rem;
      height: 2.5rem;
      font-size: 1rem;
    }

    .member-name {
      font-size: 0.875rem;
    }

    .last-message {
      font-size: 0.75rem;
    }

    .chats-list {
      max-height: 500px;
    }
  }
</style>

