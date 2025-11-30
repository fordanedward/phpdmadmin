<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Firestore } from 'firebase/firestore';
  import { chatDrawerState, closeChatDrawer } from '$lib/chat/store.js';
  import type { ChatDrawerState } from '$lib/chat/store.js';
  import {
    ensureThread,
    markThreadRead,
    sendChatMessage,
    subscribeToMessages
  } from '$lib/chat/service.js';
  import type {
    ChatDrawerContext,
    ChatMessage,
    ChatSenderInfo,
    ChatThreadMetadata
  } from '$lib/chat/types.js';

  interface CurrentUserLite {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    role?: string;
  }

  export let db: Firestore | null = null;
  export let currentUser: CurrentUserLite | null = null;

  let drawerOpen = false;
  let context: ChatDrawerContext | null = null;
  let thread: ChatThreadMetadata | null = null;
  let messages: ChatMessage[] = [];
  let messageInput = '';
  let isLoading = false;
  let initKey: string | null = null;
  let messagesUnsubscribe: (() => void) | null = null;
  let messagesContainer: HTMLElement | null = null;

  const unsubscribeDrawer = chatDrawerState.subscribe((state: ChatDrawerState) => {
    drawerOpen = state.open;
    context = state.context;
    const newKey = getContextKey(context);
    if (drawerOpen && newKey && newKey !== initKey) {
      initKey = newKey;
      initializeThread();
    }
    if (!drawerOpen) {
      teardown();
    }
  });

  onDestroy(() => {
    unsubscribeDrawer();
    teardown();
  });

  function getContextKey(ctx: ChatDrawerContext | null) {
    if (!ctx) return null;
    const chatType = ctx.chatType ?? 'appointment';
    if (chatType === 'member') {
      return `member|${ctx.patientId ?? ctx.recipientId ?? ctx.threadId ?? ''}`;
    }
    return `${ctx.threadId ?? ''}|${ctx.appointmentId ?? ''}|${ctx.patientId ?? ''}`;
  }

  async function initializeThread() {
    if (!drawerOpen || !db || !currentUser || !context) return;
    isLoading = true;
    try {
      const sender: ChatSenderInfo = {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || 'You',
        email: currentUser.email,
        role: (currentUser.role as any) ?? 'userSecretary'
      };
      const ensuredThread = await ensureThread(db, context, sender);
      thread = ensuredThread;
      subscribeToThreadMessages();
      const chatType = ensuredThread.chatType ?? context.chatType ?? 'appointment';
      await markThreadRead(db, ensuredThread.id, currentUser.uid, chatType);
    } catch (error) {
      console.error('Failed to initialize chat thread:', error);
    } finally {
      isLoading = false;
    }
  }

  function subscribeToThreadMessages() {
    if (!thread || !db || !currentUser) return;
    messagesUnsubscribe?.();
    const chatType = thread.chatType ?? context?.chatType ?? 'appointment';
    messagesUnsubscribe = subscribeToMessages(db, thread.id, async (list: ChatMessage[]) => {
      // Normalize messages to have both text and message fields
      messages = list.map((msg) => ({
        ...msg,
        text: msg.text || msg.message || '',
        message: msg.message || msg.text || ''
      })).reverse(); // Reverse to show oldest first, but load from most recent
      try {
        await markThreadRead(db, thread!.id, currentUser.uid, chatType);
      } catch (error) {
        console.warn('Unable to mark messages as read', error);
      }
      // Auto-scroll to bottom when messages change
      scrollToBottom();
    }, chatType);
  }

  function scrollToBottom() {
    if (messagesContainer) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 0);
    }
  }

  async function handleSendMessage() {
    if (!thread || !db || !currentUser || !context) return;
    const trimmed = messageInput.trim();
    if (!trimmed) return;
    try {
      const sender: ChatSenderInfo = {
        uid: currentUser.uid,
        name: currentUser.displayName || currentUser.email || 'You',
        email: currentUser.email,
        role: (currentUser.role as any) ?? 'userSecretary'
      };
      await sendChatMessage(db, thread, trimmed, sender, context);
      messageInput = '';
    } catch (error) {
      console.error('Failed to send chat message:', error);
    }
  }

  function teardown() {
    messagesUnsubscribe?.();
    messagesUnsubscribe = null;
    messages = [];
    thread = null;
    initKey = null;
    messageInput = '';
  }

  function formatTimestamp(value: ChatMessage['sentAt']) {
    if (!value) return '';
    const date = value instanceof Date ? value : value.toDate?.() ?? new Date();
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  $: partner = (() => {
    if (!thread || !currentUser) return null;
    
    // For member chats, use memberId/memberName
    if (thread.chatType === 'member') {
      return {
        id: thread.memberId || thread.id,
        name: thread.memberName || context?.patientName || context?.recipientName || 'Member'
      };
    }
    
    // For appointment chats, find partner from participants
    const partnerId = thread.participants?.find(
      (participantId: string) => participantId !== currentUser.uid
    );
    if (!partnerId) return null;
    return thread.participantProfiles?.[partnerId] ?? {
      id: partnerId,
      name: context?.patientName || context?.recipientName || 'Member'
    };
  })();
</script>

{#if drawerOpen}
  <div class="chat-overlay" role="dialog" aria-label="Appointment chat drawer">
    <div class="chat-panel">
      <header>
        <div>
          <p class="label">Chatting with</p>
          <h2>{partner?.name ?? 'Member'}</h2>
          {#if thread?.chatType === 'member'}
            <p class="meta">General Support Chat</p>
          {:else if thread?.appointmentMeta}
            <p class="meta">
              Appointment {thread.appointmentMeta.date ?? context?.appointmentDate ?? ''} ·
              {thread.appointmentMeta.time ?? context?.appointmentTime ?? ''}
            </p>
          {/if}
        </div>
        <button class="close-btn" on:click={closeChatDrawer} aria-label="Close chat drawer">
          ×
        </button>
      </header>

      <section class="messages" bind:this={messagesContainer} aria-live="polite">
        {#if isLoading}
          <div class="loading">Loading conversation…</div>
        {:else if messages.length === 0}
          <div class="empty">
            <p>No messages yet. Start the conversation to remind this member about their appointment.</p>
          </div>
        {:else}
          {#each messages as msg (msg.id)}
            <div class:mine={msg.senderId === currentUser?.uid} class="bubble">
              <div class="bubble-meta">
                <span class="sender">{msg.senderId === currentUser?.uid ? 'You' : msg.senderName}</span>
                <span class="time">{formatTimestamp(msg.sentAt || msg.timestamp)}</span>
              </div>
              <p>{msg.text || msg.message}</p>
            </div>
          {/each}
        {/if}
      </section>

      <form
        class="composer"
        on:submit|preventDefault={handleSendMessage}
        aria-label="Send chat message"
      >
        <textarea
          placeholder="Type a reminder or follow-up message…"
          bind:value={messageInput}
          rows="2"
          on:keydown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSendMessage();
            }
          }}
        ></textarea>
        <button type="submit" disabled={!messageInput.trim()}>Send</button>
      </form>
    </div>
  </div>
{/if}

<style>
  .chat-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    justify-content: flex-end;
    z-index: 1200;
  }

  .chat-panel {
    width: min(420px, 90vw);
    background: #fff;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: -2px 0 12px rgba(0, 0, 0, 0.15);
    animation: slideIn 0.25s ease-out;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(135deg, #1e3a66 0%, #1e3a66 100%);
    color: white;
  }

  header h2 {
    font-size: 1.15rem;
    font-weight: 700;
    color: white;
    margin: 0.15rem 0 0 0;
  }

  header .label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.75);
    margin: 0;
  }

  header .meta {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.85);
    margin: 0.25rem 0 0 0;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.15);
    border: none;
    font-size: 1.5rem;
    color: white;
    cursor: pointer;
    line-height: 1;
    width: 32px;
    height: 32px;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .messages::-webkit-scrollbar {
    width: 6px;
  }

  .messages::-webkit-scrollbar-thumb {
    background-color: #cbd5e1;
    border-radius: 3px;
  }

  .messages::-webkit-scrollbar-track {
    background-color: #f1f5f9;
  }

  .loading,
  .empty {
    margin: auto;
    text-align: center;
    color: #64748b;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .bubble {
    display: flex;
    flex-direction: column;
    max-width: 80%;
    padding: 0.85rem 1rem;
    background: white;
    border-radius: 1rem;
    align-self: flex-start;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    border: 1px solid #e2e8f0;
  }

  .bubble.mine {
    align-self: flex-end;
    background: linear-gradient(135deg, #1e3a66 0%, #1e3a66 100%);
    color: white;
    border: none;
    box-shadow: 0 2px 4px rgba(30, 58, 102, 0.15);
  }

  .bubble-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    margin-bottom: 0.4rem;
    opacity: 0.85;
    gap: 0.5rem;
  }

  .bubble.mine .bubble-meta {
    color: rgba(255, 255, 255, 0.85);
  }

  .bubble p {
    margin: 0;
    line-height: 1.4;
    word-break: break-word;
  }

  .composer {
    padding: 1rem 1.25rem;
    border-top: 1px solid #e2e8f0;
    background: white;
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  textarea {
    flex: 1;
    min-width: 200px;
    border: 1px solid #cbd5e1;
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    resize: none;
    font-size: 0.95rem;
    font-family: inherit;
    background: #f8fafc;
    color: #0f172a;
    transition: all 0.2s ease;
  }

  textarea:focus {
    outline: none;
    border-color: #1e3a66;
    background: white;
    box-shadow: 0 0 0 3px rgba(30, 58, 102, 0.1);
  }

  textarea::placeholder {
    color: #94a3b8;
  }

  button[type='submit'] {
    background: linear-gradient(135deg, #1e3a66 0%, #1e3a66 100%);
    color: white;
    border: none;
    border-radius: 0.75rem;
    padding: 0.75rem 1.5rem;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 2px 4px rgba(30, 58, 102, 0.15);
  }

  button[type='submit']:hover:not(:disabled) {
    background: linear-gradient(135deg, #142a47 0%, #142a47 100%);
    box-shadow: 0 4px 8px rgba(30, 58, 102, 0.25);
    transform: translateY(-1px);
  }

  button[type='submit']:disabled {
    background: #cbd5e1;
    cursor: not-allowed;
    box-shadow: none;
  }

  @keyframes slideIn {
    from {
      transform: translateX(30px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @media (max-width: 480px) {
    .chat-panel {
      width: 100%;
    }

    header {
      padding: 1rem 1.25rem;
    }

    header h2 {
      font-size: 1rem;
    }

    .messages {
      padding: 1rem;
    }

    .bubble {
      max-width: 90%;
    }

    .composer {
      flex-direction: column;
      padding: 0.875rem 1rem;
      gap: 0.5rem;
      align-items: stretch;
    }

    textarea {
      min-width: unset;
      width: 100%;
    }

    button[type='submit'] {
      width: 100%;
      justify-content: center;
    }
  }
</style>

