export type ChannelSendLease = symbol;
export type ChannelSendGate = {
  acquire(): ChannelSendLease | null;
  release(lease: ChannelSendLease): boolean;
};
export function isLatestChannelCommentRequest(
  requestId: number,
  latestRequestId: number,
  requestOwnerId: string,
  activeOwnerId: string,
  requestChannelId: string,
  activeChannelId: string,
  requestPostId: string,
  activePostId: string | null
): boolean;
export function createChannelSendGate(): ChannelSendGate;
