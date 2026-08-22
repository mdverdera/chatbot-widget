import { v4 as uuidv4 } from 'uuid';
import type { Message } from '@/types/widget';

/**
 * Generate a new unique session ID.
 * In Phase 1 the session is ephemeral (in-memory).
 * Phase 2+ can persist this to localStorage / a server session store.
 */
export function createSessionId(): string {
  return uuidv4();
}

/** Build a new Message object for the local message list. */
export function createMessage(
  role: Message['role'],
  content: string,
): Message {
  return {
    id: uuidv4(),
    role,
    content,
    timestamp: Date.now(),
  };
}

/** Format a UNIX ms timestamp to a human-readable HH:MM string. */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}
