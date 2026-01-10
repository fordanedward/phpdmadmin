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
        <div class="input-wrapper">
          <textarea
            placeholder="Type your message"
            bind:value={messageInput}
            rows="1"
            on:keydown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSendMessage();
              }
            }}
            on:input={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          ></textarea>
          <button type="submit" disabled={!messageInput.trim()} aria-label="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" class="send-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
            </svg>
          </button>
        </div>
        <p class="helper-text">Enter to send • Shift+Enter for new line</p>
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
    width: min(650px, 95vw);
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
    padding: 1.5rem 2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(135deg, #1e3a66 0%, #1e3a66 100%);
    color: white;
  }

  header h2 {
    font-size: 1.35rem;
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
    padding: 1.5rem 2rem;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
    max-width: 75%;
    padding: 1rem 1.25rem;
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
    font-size: 0.95rem;
    line-height: 1.6;
    word-break: break-word;
  }

  .composer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #e2e8f0;
    background: white;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-wrapper {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    width: 100%;
  }

  textarea {
    flex: 1;
    width: 100%;
    min-height: 48px;
    max-height: 120px;
    border: 1.5px solid #cbd5e1;
    border-radius: 1.5rem;
    padding: 0.75rem 1rem;
    resize: none;
    font-size: 0.9375rem;
    font-family: inherit;
    background: white;
    color: #0f172a;
    transition: all 0.2s ease;
    line-height: 1.5;
    overflow-y: auto;
    word-wrap: break-word;
    overflow-wrap: break-word;
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
    padding: 0;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(30, 58, 102, 0.2);
    width: 48px;
    height: 48px;
  }

  .send-icon {
    width: 20px;
    height: 20px;
    transition: transform 0.2s ease;
  }

  .helper-text {
    font-size: 0.75rem;
    color: #9ca3af;
    margin: 0;
    padding-left: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .helper-text::before {
    content: 'ⓘ';
    font-size: 0.875rem;
    opacity: 0.8;
  }

  button[type='submit']:hover:not(:disabled) {
    background: linear-gradient(135deg, #142a47 0%, #142a47 100%);
    box-shadow: 0 4px 10px rgba(30, 58, 102, 0.3);
    transform: scale(1.05);
  }

  button[type='submit']:hover:not(:disabled) .send-icon {
    transform: translateX(2px);
  }

  button[type='submit']:disabled {
    background: #cbd5e1;
    cursor: not-allowed;
    box-shadow: none;
    opacity: 0.6;
  }

  button[type='submit']:active:not(:disabled) {
    transform: scale(0.95);
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
      padding: 0.875rem 1rem;
    }

    .input-wrapper {
      gap: 0.5rem;
    }

    .helper-text {
      font-size: 0.7rem;
    }

    button[type='submit'] {
      width: 44px;
      height: 44px;
    }

    .send-icon {
      width: 18px;
      height: 18px;
    }
  }
</style>

