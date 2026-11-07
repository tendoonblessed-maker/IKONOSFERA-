/**
 * Split activity lookups into bounded RPC requests. The server function accepts
 * at most 100 user IDs; silently truncating the contact list hides presence for
 * everyone after the first batch.
 */
export const USER_ACTIVITY_BATCH_SIZE=100;
const UUID=/^[0-9a-f-]{36}$/i;

export function chunkUserActivityIds(ids:string[],batchSize=USER_ACTIVITY_BATCH_SIZE):string[][]{
 const unique=new Map<string,string>();
 for(const id of ids){
  if(!UUID.test(id))continue;
  const normalized=id.toLowerCase();
  if(!unique.has(normalized))unique.set(normalized,id);
 }
 const size=Number.isSafeInteger(batchSize)&&batchSize>0
  ?Math.min(batchSize,USER_ACTIVITY_BATCH_SIZE)
  :USER_ACTIVITY_BATCH_SIZE;
 const values=Array.from(unique.values());
 const batches:string[][]=[];
 for(let offset=0;offset<values.length;offset+=size){
  batches.push(values.slice(offset,offset+size));
 }
 return batches;
}
