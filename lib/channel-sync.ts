import type {Channel} from './social';

export type RecentChannelUpdate={channel:Channel;expiresAt:number};
export const CHANNEL_UPDATE_GRACE_MS=120_000;

// Channel identities are UUIDs. A merely non-empty identifier can still be
// malformed and must never be used to project cached settings onto a row.
const CHANNEL_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validIdentity(id:unknown):id is string{return typeof id==='string'&&CHANNEL_UUID.test(id);}

function validSettings(c:Channel):boolean{ return validIdentity(c.id)&&validIdentity(c.owner_id)&&typeof c.title==='string'&&typeof c.slug==='string'&&typeof c.description==='string'&&typeof c.discussion_enabled==='boolean'&&(c.avatar_path==null||typeof c.avatar_path==='string'); }

function matchesServer(record:Channel,expected:Channel):boolean{
 return record.avatar_path===expected.avatar_path
   &&record.title===expected.title
   &&record.slug===expected.slug
   &&record.description===expected.description
   &&record.discussion_enabled===expected.discussion_enabled;
}

/**
 * A channels-list request can start before an avatar/settings PATCH and return
 * after it. Keep the *confirmed* PATCH response visible until a subsequent
 * server snapshot matches it. Nothing is persisted across accounts or reloads.
 *
 * Mutates only the local pending map; never modifies server channel objects.
 */
export function reconcileRecentChannelUpdates(
 remote:Channel[],
 pending:Map<string,RecentChannelUpdate>,
 now=Date.now()
):Channel[]{
 // Treat an invalid injected clock as a failed cache guard, not as permission
 // to keep stale optimistic edits visible indefinitely.
 if(!Number.isFinite(now)){
   pending.clear();
   return remote;
 }
 // Duplicate server identities are ambiguous: never project a cached edit onto either entry.
 const counts=new Map<string,number>();
 for(const channel of remote){
   if(channel&&validIdentity(channel.id)){
     const identity=channel.id.toLowerCase();
     counts.set(identity,(counts.get(identity)||0)+1);
   }
 }
 // UUIDs are case-insensitive even if the API returns mixed-case strings.
 // Remove every pending spelling of an ambiguous identity.
 for(const [id,count] of counts){
   if(count>1)for(const key of pending.keys()){
     if(validIdentity(key)&&key.toLowerCase()===id)pending.delete(key);
   }
 }
 for(const [id,edit] of pending){
   if(!edit||!edit.channel||!validSettings(edit.channel)||id!==edit.channel.id||!Number.isFinite(edit.expiresAt)||edit.expiresAt<=now||edit.expiresAt>now+CHANNEL_UPDATE_GRACE_MS)pending.delete(id);
 }
 return remote.map(channel=>{
   // A malformed list entry must not crash rendering or receive cached edits.
   // Preserve the response unchanged and let the caller handle invalid data.
   if(!channel||!validIdentity(channel.id))return channel;
   // A corrupt server settings record must not be disguised by cached edits.
   // Keep it unchanged for the caller's validation and drop the local override.
   if(!validSettings(channel)){
     pending.delete(channel.id);
     return channel;
   }
   const edit=pending.get(channel.id);
   if(!edit)return channel;
   // Never overlay a pending edit when the server's ownership identity is
   // missing or malformed. The authoritative record must remain untouched.
   if(typeof channel.owner_id!=='string'||!channel.owner_id.trim()){
     pending.delete(channel.id);
     return channel;
   }
   // A stale or incorrectly keyed pending record must never decorate another channel.
   if(edit.channel.id!==channel.id){
     pending.delete(channel.id);
     return channel;
   }
   // A channel may have changed owners while an older settings request was in flight.
   // Never project that owner's pending edits onto the newly owned channel.
   if(channel.owner_id!==edit.channel.owner_id){
     pending.delete(channel.id);
     return channel;
   }
   if(matchesServer(channel,edit.channel)){
     pending.delete(channel.id);
     return channel;
   }
   // The PATCH confirms editable settings only. A delayed list response may
   // contain newer server-owned metadata (owner, creation date, identity);
   // never replace those fields with an older PATCH snapshot.
   return {
     ...channel,
     title:edit.channel.title,
     slug:edit.channel.slug,
     description:edit.channel.description,
     discussion_enabled:edit.channel.discussion_enabled,
     avatar_path:edit.channel.avatar_path
   };
 });
}
