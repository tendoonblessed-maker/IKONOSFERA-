const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Fail closed when a comment read no longer belongs to the visible context.
 * @param {number} requestId
 * @param {number} latestRequestId
 * @param {string} requestOwnerId
 * @param {string} activeOwnerId
 * @param {string} requestChannelId
 * @param {string} activeChannelId
 * @param {string} requestPostId
 * @param {string|null} activePostId
 * @returns {boolean}
 */
export function isLatestChannelCommentRequest(requestId,latestRequestId,requestOwnerId,activeOwnerId,requestChannelId,activeChannelId,requestPostId,activePostId){
 return Number.isSafeInteger(requestId)&&requestId>0&&requestId===latestRequestId
  &&UUID.test(requestOwnerId)&&UUID.test(activeOwnerId)&&requestOwnerId.toLowerCase()===activeOwnerId.toLowerCase()
  &&UUID.test(requestChannelId)&&UUID.test(activeChannelId)&&requestChannelId.toLowerCase()===activeChannelId.toLowerCase()
  &&UUID.test(requestPostId)&&typeof activePostId==='string'&&UUID.test(activePostId)&&requestPostId.toLowerCase()===activePostId.toLowerCase();
}

/** Synchronous single-flight gate for channel send actions. */
export function createChannelSendGate(){
 let active=null;
 return {
  acquire(){if(active)return null;const lease=Symbol('channel-send');active=lease;return lease;},
  release(lease){if(active!==lease)return false;active=null;return true;}
 };
}
