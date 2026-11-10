/** Bounded pagination contract for private-chat full-history search.
 * The database RPC accepts offsets up to 600 and returns one extra row to
 * tell the client whether another 30-result page exists.
 */
export const DIRECT_MESSAGE_SEARCH_PAGE_SIZE=30;
export const DIRECT_MESSAGE_SEARCH_MAX_OFFSET=600;
export const DIRECT_MESSAGE_SEARCH_MAX_RESULTS=DIRECT_MESSAGE_SEARCH_MAX_OFFSET+DIRECT_MESSAGE_SEARCH_PAGE_SIZE;

export type DirectMessageSearchPageState={hasMore:boolean;limitReached:boolean};

export function getDirectMessageSearchPageState(offset:number,matchCount:number):DirectMessageSearchPageState{
 const safeOffset=Number.isFinite(offset)?Math.max(0,Math.floor(offset)):0;
 const safeCount=Number.isFinite(matchCount)?Math.max(0,Math.floor(matchCount)):0;
 const hasExtra=safeCount>DIRECT_MESSAGE_SEARCH_PAGE_SIZE;
 return {
  hasMore:hasExtra&&safeOffset<DIRECT_MESSAGE_SEARCH_MAX_OFFSET,
  limitReached:hasExtra&&safeOffset>=DIRECT_MESSAGE_SEARCH_MAX_OFFSET
 };
}
