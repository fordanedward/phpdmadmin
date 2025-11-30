import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentReference,
  type Firestore,
  type QueryConstraint
} from 'firebase/firestore';
import type {
  ChatDrawerContext,
  ChatMessage,
  ChatSenderInfo,
  ChatThreadMetadata
} from './types.js';

export const CHAT_COLLECTION = 'appointmentChats';
export const MEMBER_CHAT_COLLECTION = 'chats';
export const CHAT_MESSAGES_SUBCOLLECTION = 'messages';
export const NOTIFICATIONS_COLLECTION = 'notifications';

export function buildThreadId(appointmentId?: string, patientId?: string) {
  if (!appointmentId || !patientId) {
    throw new Error('Missing appointmentId or patientId for chat thread.');
  }
  return `${appointmentId}_${patientId}`;
}

function getThreadRef(db: Firestore, threadId: string): DocumentReference {
  return doc(db, CHAT_COLLECTION, threadId);
}

export async function ensureThread(
  db: Firestore,
  context: ChatDrawerContext,
  sender: ChatSenderInfo
): Promise<ChatThreadMetadata> {
  const chatType = context.chatType ?? 'appointment';

  // Handle member chat structure
  if (chatType === 'member') {
    if (!context.patientId && !context.recipientId) {
      throw new Error('Member chat requires patientId or recipientId.');
    }
    const memberId = context.patientId || context.recipientId!;
    const chatRef = doc(db, MEMBER_CHAT_COLLECTION, memberId);
    const snapshot = await getDoc(chatRef);

    if (!snapshot.exists()) {
      const memberName = context.patientName || context.recipientName || 'Member';
      await setDoc(chatRef, {
        memberId: memberId,
        memberName: memberName,
        createdAt: serverTimestamp(),
        lastMessage: '',
        lastMessageTime: serverTimestamp(),
        unreadCount: 0
      });
    }

    const chatData = (await getDoc(chatRef)).data() ?? {};
    return {
      id: memberId,
      chatType: 'member',
      memberId: memberId,
      memberName: chatData.memberName || context.patientName || context.recipientName || 'Member',
      participants: [memberId, sender.uid],
      participantProfiles: {
        [memberId]: {
          id: memberId,
          name: chatData.memberName || context.patientName || context.recipientName || 'Member',
          email: context.patientEmail ?? null,
          role: 'userPatient'
        },
        [sender.uid]: {
          id: sender.uid,
          name: sender.name,
          email: sender.email ?? null,
          role: sender.role ?? 'userSecretary'
        }
      },
      lastMessage: chatData.lastMessage ?? '',
      lastMessageAt: chatData.lastMessageTime ?? null,
      unreadCount: chatData.unreadCount ?? 0
    };
  }

  // Handle appointment chat structure (existing logic)
  if (!context.appointmentId && !context.threadId) {
    throw new Error('Appointment chat requires appointmentId or threadId.');
  }

  let threadId = context.threadId;
  if (!threadId) {
    threadId = buildThreadId(context.appointmentId, context.patientId);
  }

  const threadRef = getThreadRef(db, threadId);
  const snapshot = await getDoc(threadRef);

  const participantProfiles = {
    ...(snapshot.data()?.participantProfiles ?? {}),
    [sender.uid]: {
      id: sender.uid,
      name: sender.name,
      email: sender.email ?? null,
      role: sender.role ?? 'unknown'
    }
  };

  if (context.patientId) {
    participantProfiles[context.patientId] = {
      id: context.patientId,
      name: context.patientName ?? snapshot.data()?.participantProfiles?.[context.patientId]?.name ?? 'Member',
      email:
        context.patientEmail ??
        snapshot.data()?.participantProfiles?.[context.patientId]?.email ??
        null,
      role:
        snapshot.data()?.participantProfiles?.[context.patientId]?.role ??
        'userPatient'
    };
  }

  if (!snapshot.exists()) {
    await setDoc(
      threadRef,
      {
        appointmentId: context.appointmentId ?? null,
        patientId: context.patientId ?? null,
        participants: Array.from(
          new Set(
            [sender.uid, context.patientId, context.recipientId]
              .filter(Boolean)
              .map(String)
          )
        ),
        participantProfiles,
        appointmentMeta: {
          date: context.appointmentDate ?? null,
          time: context.appointmentTime ?? null,
          service: context.appointmentService ?? null
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: '',
        lastSenderId: '',
        lastMessageAt: null,
        unreadCount: {}
      },
      { merge: true }
    );
  } else {
    await updateDoc(threadRef, {
      participantProfiles,
      appointmentMeta: {
        ...snapshot.data()?.appointmentMeta,
        date: context.appointmentDate ?? snapshot.data()?.appointmentMeta?.date ?? null,
        time: context.appointmentTime ?? snapshot.data()?.appointmentMeta?.time ?? null,
        service: context.appointmentService ?? snapshot.data()?.appointmentMeta?.service ?? null
      }
    });
  }

  const updatedSnapshot = await getDoc(threadRef);
  const threadData = updatedSnapshot.data() ?? {};
  return {
    id: threadId,
    chatType: 'appointment',
    ...(threadData as Omit<ChatThreadMetadata, 'id' | 'chatType'>)
  };
}

export function subscribeToMessages(
  db: Firestore,
  threadId: string,
  callback: (messages: ChatMessage[]) => void,
  chatType: 'appointment' | 'member' = 'appointment'
) {
  let messagesRef: ReturnType<typeof collection>;
  let messagesQuery: ReturnType<typeof query>;

  if (chatType === 'member') {
    // Member chat: chats/{memberId}/messages
    messagesRef = collection(db, MEMBER_CHAT_COLLECTION, threadId, CHAT_MESSAGES_SUBCOLLECTION);
    messagesQuery = query(messagesRef, orderBy('timestamp', 'desc'));
  } else {
    // Appointment chat: appointmentChats/{threadId}/messages
    messagesRef = collection(db, CHAT_COLLECTION, threadId, CHAT_MESSAGES_SUBCOLLECTION);
    messagesQuery = query(messagesRef, orderBy('sentAt', 'desc'));
  }

  return onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      // Normalize message format
      return {
        id: docSnap.id,
        text: data.text || data.message || '',
        message: data.message || data.text || '',
        senderId: data.senderId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        sentAt: data.sentAt || data.timestamp,
        timestamp: data.timestamp || data.sentAt,
        readBy: data.readBy || [],
        read: data.read ?? false
      };
    }) as ChatMessage[];
    callback(messages);
  });
}

export function subscribeToNotifications(
  db: Firestore,
  userId: string,
  callback: (notificationDocs: any[]) => void
) {
  const notificationsRef = collection(db, NOTIFICATIONS_COLLECTION);
  const notificationsQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(notificationsQuery, (snapshot) => {
    callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
  });
}

export async function markThreadRead(
  db: Firestore,
  threadId: string,
  userId: string,
  chatType: 'appointment' | 'member' = 'appointment'
) {
  if (chatType === 'member') {
    // For member chats, mark admin messages as read
    const messagesRef = collection(db, MEMBER_CHAT_COLLECTION, threadId, CHAT_MESSAGES_SUBCOLLECTION);
    const unreadQuery = query(
      messagesRef,
      where('senderRole', '==', 'admin'),
      where('read', '==', false),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(unreadQuery);
    const updates = snapshot.docs.map((docSnap) =>
      updateDoc(docSnap.ref, { read: true })
    );
    await Promise.all(updates);

    // Reset unread count
    const chatRef = doc(db, MEMBER_CHAT_COLLECTION, threadId);
    await updateDoc(chatRef, { unreadCount: 0 });
  } else {
    const threadRef = getThreadRef(db, threadId);
    await updateDoc(threadRef, {
      [`unreadCount.${userId}`]: 0,
      updatedAt: serverTimestamp()
    });
  }
}

export async function sendChatMessage(
  db: Firestore,
  thread: ChatThreadMetadata,
  messageText: string,
  sender: ChatSenderInfo,
  context: ChatDrawerContext
) {
  if (!thread?.id) throw new Error('Cannot send message without thread id.');
  const trimmed = messageText.trim();
  if (!trimmed) return;

  const chatType = thread.chatType ?? context.chatType ?? 'appointment';

  if (chatType === 'member') {
    // Member chat structure
    const messagesRef = collection(db, MEMBER_CHAT_COLLECTION, thread.id, CHAT_MESSAGES_SUBCOLLECTION);
    await addDoc(messagesRef, {
      senderId: sender.uid,
      senderName: sender.name,
      senderRole: 'admin', // Admin sending to member
      message: trimmed,
      timestamp: serverTimestamp(),
      read: false
    });

    const chatRef = doc(db, MEMBER_CHAT_COLLECTION, thread.id);
    await updateDoc(chatRef, {
      lastMessage: trimmed,
      lastMessageTime: serverTimestamp(),
      unreadCount: increment(1) // Increment for member
    });

    // Create notification for member
    const memberId = thread.memberId || thread.id;
    await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
      userId: memberId,
      type: 'chat',
      message: trimmed,
      threadId: thread.id,
      chatType: 'member',
      createdAt: serverTimestamp(),
      read: false,
      metadata: {
        senderName: sender.name,
        senderId: sender.uid,
        patientName: thread.memberName || context.patientName || 'Member'
      }
    });
  } else {
    // Appointment chat structure (existing logic)
    const messagesRef = collection(db, CHAT_COLLECTION, thread.id, CHAT_MESSAGES_SUBCOLLECTION);
    await addDoc(messagesRef, {
      text: trimmed,
      senderId: sender.uid,
      senderName: sender.name,
      senderRole: sender.role ?? 'unknown',
      sentAt: serverTimestamp(),
      readBy: [sender.uid]
    });

    const threadRef = getThreadRef(db, thread.id);
    await updateDoc(threadRef, {
      lastMessage: trimmed,
      lastSenderId: sender.uid,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      [`unreadCount.${sender.uid}`]: 0
    });

    const recipientId =
      context.recipientId ||
      context.patientId ||
      thread.participants?.find((participantId: string) => participantId !== sender.uid);

    if (recipientId) {
      await updateDoc(threadRef, {
        [`unreadCount.${recipientId}`]: increment(1)
      });

      await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
        userId: recipientId,
        type: 'chat',
        message: trimmed,
        threadId: thread.id,
        appointmentId: thread.appointmentId ?? context.appointmentId ?? null,
        patientId: thread.patientId ?? context.patientId ?? null,
        createdAt: serverTimestamp(),
        read: false,
        metadata: {
          senderName: sender.name,
          senderId: sender.uid,
          appointmentDate: context.appointmentDate ?? thread.appointmentMeta?.date ?? null,
          appointmentTime: context.appointmentTime ?? thread.appointmentMeta?.time ?? null,
          patientName:
            context.patientName ??
            (thread.patientId ? thread.participantProfiles?.[thread.patientId]?.name : null) ??
            null
        }
      });
    }
  }
}

export async function markNotificationRead(db: Firestore, notificationId: string) {
  const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  await updateDoc(notificationRef, {
    read: true
  });
}

export async function markAllNotificationsRead(db: Firestore, userId: string) {
  const notificationsRef = collection(db, NOTIFICATIONS_COLLECTION);

  const constraints: QueryConstraint[] = [where('userId', '==', userId), where('read', '==', false)];
  const notificationsQuery = query(notificationsRef, ...constraints);
  const snapshot = await getDocs(notificationsQuery);

  const updates = snapshot.docs.map((docSnap) =>
    updateDoc(doc(db, NOTIFICATIONS_COLLECTION, docSnap.id), { read: true })
  );
  await Promise.all(updates);
}

// Get all member chats for admin view
export function subscribeToMemberChats(
  db: Firestore,
  callback: (chats: Array<{ id: string; memberId: string; memberName: string; lastMessage: string; lastMessageTime: any; unreadCount: number }>) => void
) {
  const chatsRef = collection(db, MEMBER_CHAT_COLLECTION);
  const chatsQuery = query(chatsRef, orderBy('lastMessageTime', 'desc'));
  return onSnapshot(chatsQuery, (snapshot) => {
    const chats = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        memberId: data.memberId || docSnap.id,
        memberName: data.memberName || 'Member',
        lastMessage: data.lastMessage || '',
        lastMessageTime: data.lastMessageTime,
        unreadCount: data.unreadCount || 0
      };
    });
    callback(chats);
  });
}

