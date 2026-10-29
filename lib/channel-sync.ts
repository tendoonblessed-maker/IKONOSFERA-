import type {Channel} from './social';

export type RecentChannelUpdate={channel:Channel;expiresAt:number};
export const CHANNEL_UPDATE_GRACE_MS=120_000;

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
 const visible=new Set(remote.map(channel=>channel.id));
 for(const [id,edit] of pending){
   if(edit.expiresAt<=now||!visible.has(id)&&edit.expiresAt<=now)pending.delete(id);
 }
 return remote.map(channel=>{
   const edit=pending.get(channel.id);
   if(!edit)return channel;
   if(matchesServer(channel,edit.channel)){
     pending.delete(channel.id);
     return channel;
   }
   return {...channel,...edit.channel};
 });
}
