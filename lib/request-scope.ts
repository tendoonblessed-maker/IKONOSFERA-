export type RequestScope=Readonly<{
 groupId:string;
 userId:string;
 token:string;
}>;

/**
 * A request may update a mounted view only while both its generation and
 * conversation identity remain current. Generations also reject an old
 * request if the user navigates away and then returns to the same chat.
 */
export function isCurrentRequest(
 requestId:number,
 currentRequestId:number,
 requestScope:RequestScope,
 currentScope:RequestScope
):boolean{
 return requestId===currentRequestId
  &&requestScope.groupId===currentScope.groupId
  &&requestScope.userId===currentScope.userId
  &&requestScope.token===currentScope.token;
}
