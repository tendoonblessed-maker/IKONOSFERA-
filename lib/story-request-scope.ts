/**
 * Prevent asynchronous story work started for one account from updating a
 * StoriesStrip that now belongs to another account or a newer request.
 */
export function isCurrentStoryRequest(
  requestOwnerId: string,
  activeOwnerId: string,
  requestId: number,
  latestRequestId: number
): boolean {
  return Boolean(requestOwnerId)
    && requestOwnerId === activeOwnerId
    && requestId === latestRequestId;
}
