import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { DeviceEventEmitter, Platform } from "react-native";

export type ConversationPreference = {
  pinned?: boolean;
  archived?: boolean;
  locked?: boolean;
  muted?: boolean;
  hideActivity?: boolean;
  hideTyping?: boolean;
  readReceipts?: boolean;
  /** حفظ الصور الواردة تلقائيًا في معرض الهاتف */
  autoSaveMedia?: boolean;
};

export type MessageGlobalPreferences = {
  hideActivity: boolean;
  hideTyping: boolean;
  readReceipts: boolean;
  notifications: boolean;
  sounds: boolean;
  appLock: boolean;
};

export type ScheduledMessage = {
  localId: string;
  recipientId: string;
  body: string;
  mediaType: string | null;
  mediaUrl: string | null;
  scheduledAt: string;
  disappearAfter: string | null;
};

export type MessageLocalState = {
  conversations: Record<string, ConversationPreference>;
  global: MessageGlobalPreferences;
  hiddenMessageIds: string[];
  savedMessageIds: string[];
  scheduledMessages: ScheduledMessage[];
};

const DEFAULTS: MessageLocalState = {
  conversations: {},
  global: {
    hideActivity: false,
    hideTyping: false,
    readReceipts: true,
    notifications: true,
    sounds: true,
    appLock: false,
  },
  hiddenMessageIds: [],
  savedMessageIds: [],
  scheduledMessages: [],
};

function storageKey(userId: string) {
  return `wanas-messaging-v1:${userId}`;
}

function scheduleKey(userId: string) {
  return `wanas-messaging-scheduled-v1:${userId}`;
}

const queues = new Map<string, Promise<unknown>>();

function freshDefaults(): MessageLocalState {
  return {
    ...DEFAULTS,
    conversations: {},
    global: { ...DEFAULTS.global },
    hiddenMessageIds: [],
    savedMessageIds: [],
    scheduledMessages: [],
  };
}

export async function loadMessageState(userId: string): Promise<MessageLocalState> {
  try {
    const [raw, scheduleRaw] = await Promise.all([
      AsyncStorage.getItem(storageKey(userId)),
      Platform.OS === "web" ? Promise.resolve(null) : SecureStore.getItemAsync(scheduleKey(userId)),
    ]);
    if (!raw) return freshDefaults();
    const parsed = JSON.parse(raw) as Partial<MessageLocalState>;
    let securedSchedules: ScheduledMessage[] | null = null;
    if (scheduleRaw) {
      try { securedSchedules = JSON.parse(scheduleRaw) as ScheduledMessage[]; } catch { securedSchedules = []; }
    }
    return {
      ...DEFAULTS,
      ...parsed,
      conversations: parsed.conversations ?? {},
      global: { ...DEFAULTS.global, ...(parsed.global ?? {}) },
      hiddenMessageIds: parsed.hiddenMessageIds ?? [],
      savedMessageIds: parsed.savedMessageIds ?? [],
      scheduledMessages: securedSchedules ?? parsed.scheduledMessages ?? [],
    };
  } catch {
    return freshDefaults();
  }
}

export async function updateMessageState(
  userId: string,
  update: (current: MessageLocalState) => MessageLocalState,
): Promise<MessageLocalState> {
  const key = storageKey(userId);
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(async () => {
    const current = await loadMessageState(userId);
    const value = update(current);
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } else {
      const { scheduledMessages, ...plainState } = value;
      await Promise.all([
        AsyncStorage.setItem(key, JSON.stringify({ ...plainState, scheduledMessages: [] })),
        SecureStore.setItemAsync(scheduleKey(userId), JSON.stringify(scheduledMessages)),
      ]);
    }
    DeviceEventEmitter.emit("wanas:messaging-state", { userId });
    return value;
  });
  queues.set(key, next);
  try {
    return await next;
  } finally {
    if (queues.get(key) === next) queues.delete(key);
  }
}

export function withConversation(
  state: MessageLocalState,
  peerId: string,
  patch: ConversationPreference,
): MessageLocalState {
  return {
    ...state,
    conversations: {
      ...state.conversations,
      [peerId]: { ...(state.conversations[peerId] ?? {}), ...patch },
    },
  };
}
