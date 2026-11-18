/** A React key that isolates transient bot state by account and selected bot. */
export function botPanelInstanceKey(userId, bot) {
  return `bot:${userId}:${bot}`;
}
