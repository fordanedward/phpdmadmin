import { writable } from 'svelte/store';
import type { ChatDrawerContext } from './types.js';

export interface ChatDrawerState {
  open: boolean;
  context: ChatDrawerContext | null;
}

const initialState: ChatDrawerState = {
  open: false,
  context: null
};

const { subscribe, set, update } = writable<ChatDrawerState>(initialState);

export const chatDrawerState = {
  subscribe,
  open(context: ChatDrawerContext) {
    if (!context) return;
    set({ open: true, context });
  },
  close() {
    set(initialState);
  },
  patch(context: Partial<ChatDrawerContext>) {
    update((state) => ({
      open: state.open,
      context: state.context ? { ...state.context, ...context } : { ...context }
    }));
  }
};

export function openChatDrawer(context: ChatDrawerContext) {
  chatDrawerState.open(context);
}

export function closeChatDrawer() {
  chatDrawerState.close();
}

