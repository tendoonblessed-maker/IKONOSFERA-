/** Prevent malformed IDs from becoming PostgREST filters or write payloads. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function assertValidUserId(id:string):void{
 if(!UUID.test(id))throw Error('Некорректный идентификатор пользователя.');
}

/** PostgreSQL UUIDs are case-insensitive; self-actions must be too. */
export function assertDifferentUser(ownerId:string,otherId:string,kind:'contact'|'block'):void{
 assertValidUserId(ownerId);
 assertValidUserId(otherId);
 if(ownerId.toLowerCase()===otherId.toLowerCase())
  throw Error(kind==='contact'?'Нельзя добавить себя в контакты.':'Нельзя заблокировать себя.');
}
