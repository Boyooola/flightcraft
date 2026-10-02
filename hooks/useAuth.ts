/**
 * Current Play Games player identity.
 *
 * Play Games owns authentication. This module only gives data hooks and
 * Supabase writes access to the verified player ID for the current app session.
 */

let playerId: string | null = null;

export function getPlayerId(): string | null {
  return playerId;
}

export function setPlayerId(value: string | null): void {
  const normalized = value?.trim();
  playerId = normalized || null;
}
