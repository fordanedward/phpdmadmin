import type { Timestamp } from 'firebase/firestore';

export type ChatParticipantRole =
  | 'userAdmin'
  | 'userSecretary'
  | 'userDentist'
  | 'userPatient'
  | 'system'
  | 'unknown';

export interface ChatParticipantProfile {
  id: string;
  name: string;
  email?: string | null;
  role?: ChatParticipantRole | string;
  avatarUrl?: string | null;
}

export interface ChatThreadMetadata {
  id: string;
  chatType?: ChatType;
  appointmentId?: string;
  patientId?: string;
  memberId?: string; // For member chats
  memberName?: string; // For member chats
  participants: string[];
  participantProfiles?: Record<string, ChatParticipantProfile>;
  appointmentMeta?: {
    date?: string;
    time?: string;
    service?: string;
  };
  lastMessage?: string;
  lastSenderId?: string;
  lastMessageAt?: Timestamp | Date | null;
  lastMessageTime?: Timestamp | Date | null; // For member chats (alias for lastMessageAt)
  unreadCount?: Record<string, number> | number; // number for member chats
}

export interface ChatMessage {
  id: string;
  text?: string; // For appointment chats
  message?: string; // For member chats (alias for text)
  senderId: string;
  senderName: string;
  senderRole?: ChatParticipantRole | string | 'member' | 'admin';
  sentAt?: Timestamp | Date;
  timestamp?: Timestamp | Date; // For member chats (alias for sentAt)
  readBy?: string[];
  read?: boolean; // For member chats
}

export type ChatType = 'appointment' | 'member';

export interface ChatDrawerContext {
  chatType?: ChatType; // 'appointment' or 'member' (defaults to 'appointment')
  appointmentId?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  appointmentService?: string;
  patientId?: string;
  patientName?: string;
  patientEmail?: string;
  threadId?: string;
  recipientId?: string;
  recipientName?: string;
  source?: 'appointment-card' | 'notification-center' | 'dashboard' | 'manual' | 'member-chats-list';
}

export interface ChatSenderInfo {
  uid: string;
  name: string;
  email?: string | null;
  role?: ChatParticipantRole | string;
}

