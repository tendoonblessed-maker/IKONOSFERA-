/**
 * React identity for local-only bot state. A new account or bot must receive
 * a fresh component instance so in-memory answers and dates cannot bleed
 * across account switches on shared devices.
 */
export function botPanelKey(userId:string,bot:string):string{
  return userId+':'+bot;
}
