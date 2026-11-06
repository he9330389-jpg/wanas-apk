const granted = new Set<string>();

export function grantChatAccess(peerId: string) {
  granted.add(peerId);
}

export function consumeChatAccess(peerId: string) {
  if (!granted.has(peerId)) return false;
  granted.delete(peerId);
  return true;
}
