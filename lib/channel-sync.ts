import type {Channel} from './social';

export type RecentChannelUpdate={channel:Channel;expiresAt:number};
export const CHANNEL_UPDATE_GRACE_MS=120_000;

function validSettings(c:Channel):boolean{ return typeof c.title==='string'&&typeof c.slug==='string'&&typeof c.description==='string'&&typeof c.discussion_enabled==='boolean'&&(c.avatar_path==null||typeof c.avatar_path==='string'); }

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
 for(const [id,edit] of pending){
   if(!edit||!edit.channel||!validSettings(edit.channel)||id!==edit.channel.id||!Number.isFinite(edit.expiresAt)||edit.expiresAt<=now)pending.delete(id);
 }
 return remote.map(channel=>{
   const edit=pending.get(channel.id);
   if(!edit)return channel;
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
