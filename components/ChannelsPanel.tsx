'use client';
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { listProfiles, type Profile } from "@/lib/supabase-rest";
import {
 addPostComment, deletePost, editChannelPost, manageChannelComment, imageUrl, listChannelPosts, listPostComments, listPostReactions, setPostReaction, REACTION_EMOJIS, publishPost,
 removeUpload, uploadChannelAttachment,
 type Channel, type ChannelPost, type PostComment, type PostReaction, type ReactionEmoji
} from "@/lib/social";

type Props={token:string;userId:string;channel:Channel;onBack:()=>void;onShowProfile:(id:string)=>void;subscribed:boolean;onToggleSubscribe:()=>void;onMessageAuthor:()=>void};
const readable=(e:unknown)=>e instanceof Error?e.message:"Ошибка соединения";
const formattedDate=(s:string)=>new Date(s).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});

export default function ChannelsPanel({token,userId,channel,onBack,onShowProfile,subscribed,onToggleSubscribe,onMessageAuthor}:Props){
 const mine=channel.owner_id===userId;
 const [posts,setPosts]=useState<ChannelPost[]>([]);
 const [reactions,setReactions]=useState<PostReaction[]>([]);
 const [reactionPicker,setReactionPicker]=useState<string|null>(null);
 const [body,setBody]=useState("");const [file,setFile]=useState<File|null>(null);
 const [openComments,setOpenComments]=useState<string|null>(null);
 const [comments,setComments]=useState<PostComment[]>([]);
 const [authors,setAuthors]=useState<Record<string,Profile>>({});
 const [commentDraft,setCommentDraft]=useState("");
 const [editingPostId,setEditingPostId]=useState<string|null>(null);
 const [editingCommentId,setEditingCommentId]=useState<string|null>(null);
 const [editingBody,setEditingBody]=useState("");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const reload=useCallback(async()=>{const list=await listChannelPosts(token,channel.id);setPosts(list);setReactions(await listPostReactions(token,list.map(p=>p.id)));},[token,channel.id]);
 async function react(postId:string,emoji:ReactionEmoji){
  if(busy)return;setBusy(true);setError("");
  const mine=reactions.find(r=>r.post_id===postId&&r.user_id===userId);
  try{await setPostReaction(token,userId,postId,mine?.emoji===emoji?null:emoji);
   setReactions(await listPostReactions(token,posts.map(p=>p.id)));setReactionPicker(null);
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 useEffect(()=>{void reload().catch(e=>setError(readable(e)));setOpenComments(null);setComments([]);setBody("");setFile(null);},[reload]);
 async function showComments(postId:string){
  if(openComments===postId){setOpenComments(null);return;}
  setError("");
  try{
   const list=await listPostComments(token,postId);setComments(list);setOpenComments(postId);
   const ids=Array.from(new Set(list.map(c=>c.author_id)));
   const people=await listProfiles(token,ids);
   setAuthors(Object.fromEntries(people.map(p=>[p.id,p])));
  }catch(e){setError(readable(e));}
 }
 async function post(e:FormEvent){
  e.preventDefault();if(!mine||busy||(!body.trim()&&!file))return;
  setBusy(true);setError("");setNotice("");
  let path:string|null=null;
  try{
   const attachment=file?await uploadChannelAttachment(token,userId,file):null;
   path=attachment?.path??null;
   try{await publishPost(token,userId,channel.id,body,null,attachment);}
   catch(e){if(path)await removeUpload(token,path).catch(()=>{});throw e;}
   setBody("");setFile(null);await reload();setNotice("Пост опубликован.");
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function writeComment(e:FormEvent){
  e.preventDefault();if(!openComments||!commentDraft.trim()||busy)return;
  setBusy(true);setError("");
  try{
   await addPostComment(token,openComments,userId,commentDraft);
   setCommentDraft("");
   const list=await listPostComments(token,openComments);
   setComments(list);
   if(!authors[userId]){const mine=await listProfiles(token,[userId]);if(mine[0])setAuthors(prev=>({...prev,[userId]:mine[0]}));}
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function savePostEdit(id:string){
  if(!mine||busy)return;setBusy(true);setError("");
  try{await editChannelPost(token,id,editingBody);setEditingPostId(null);await reload();}
  catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function saveCommentEdit(id:string){
  if(busy)return;setBusy(true);setError("");
  try{await manageChannelComment(token,id,"edit",editingBody);setEditingCommentId(null);
   if(openComments)setComments(await listPostComments(token,openComments));
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function erasePost(p:ChannelPost){
  if(!mine||busy||!window.confirm("Удалить этот пост?"))return;
  setBusy(true);setError("");
  try{await deletePost(token,p.id);if(p.image_path)await removeUpload(token,p.image_path).catch(()=>{});if(p.attachment_path)await removeUpload(token,p.attachment_path).catch(()=>{});await reload();setNotice("Пост удалён.");}
  catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function eraseComment(c:PostComment){
  if((c.author_id!==userId&&!mine)||busy)return;
  setBusy(true);
  try{await manageChannelComment(token,c.id,"delete");setComments(old=>old.filter(x=>x.id!==c.id));}
  catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 return <section className="channel-view">
  <header className="channel-topbar"><button type="button" className="profile-back" onClick={onBack} aria-label="Назад">‹ <span>Назад</span></button>
   <div className="channel-top-title"><strong>{channel.title}</strong><small>@{channel.slug}</small></div>
   <button type="button" className="channel-owner-link" onClick={()=>onShowProfile(channel.owner_id)}>Автор</button></header>
  <div className="channel-feed">
   <div className="channel-cover-card"><div className="channel-emblem">#</div><h1>{channel.title}</h1><p>@{channel.slug}</p>
    {channel.description&&<p className="channel-description">{channel.description}</p>}
    <span>Канал IKONOSFERA</span><div className="channel-cover-actions">
    {!mine&&<button type="button" className="accent-button" onClick={onToggleSubscribe}>{subscribed?"Отписаться":"Подписаться"}</button>}
    {!mine&&<button type="button" className="secondary-action" onClick={onMessageAuthor}>Написать автору</button>}
    </div></div>
   {mine&&<form className="channel-compose" onSubmit={post}>
     <h2>Новая публикация</h2>
     <textarea rows={4} maxLength={4000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Напиши что-нибудь подписчикам…"/>
     <div className="channel-compose-actions"><label className="profile-action">+ Прикрепить файл<input aria-label="Вложение к посту" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <button type="submit" className="accent-button" disabled={busy||(!body.trim()&&!file)}>Опубликовать</button></div>
     {file&&<p className="channel-file-selected">{file.name} <button type="button" onClick={()=>setFile(null)}>Убрать</button></p>}
   </form>}
   <div className="channel-section-heading">Публикации</div>
   {posts.length===0&&<div className="channel-empty">Публикаций пока нет.</div>}
   {posts.map(post=><article className="channel-post" key={post.id}>
    <div className="channel-post-meta"><span className="channel-post-icon">#</span><strong>{channel.title}</strong><time dateTime={post.created_at}>{formattedDate(post.created_at)}</time></div>
    {editingPostId===post.id?<form className="channel-inline-editor" onSubmit={e=>{e.preventDefault();void savePostEdit(post.id);}}><textarea value={editingBody} maxLength={4000} onChange={e=>setEditingBody(e.target.value)}/><button type="submit">Сохранить</button><button type="button" onClick={()=>setEditingPostId(null)}>Отмена</button></form>:post.body&&<p className="channel-post-body">{post.body}</p>}
    {imageUrl(post.image_path)&&<img className="channel-post-image" src={imageUrl(post.image_path)||""} alt="Изображение к публикации"/>}
    {post.attachment_path&&post.attachment_type==="image"&&<img className="channel-post-image" src={imageUrl(post.attachment_path)||""} alt="Фото к посту"/>}
    {post.attachment_path&&post.attachment_type==="video"&&<video className="channel-post-video" src={imageUrl(post.attachment_path)||""} controls playsInline preload="metadata"/>}
    {post.attachment_path&&post.attachment_type==="audio"&&<audio className="channel-post-audio" src={imageUrl(post.attachment_path)||""} controls preload="metadata"/>}
    {post.attachment_path&&post.attachment_type==="file"&&<a className="channel-file-link" href={imageUrl(post.attachment_path)||"#"} target="_blank" rel="noreferrer" download>📎 Скачать вложение</a>}
    <div className="reaction-bar channel-reaction-bar">
     {REACTION_EMOJIS.filter(emoji=>reactions.some(r=>r.post_id===post.id&&r.emoji===emoji)).map(emoji=><button type="button" key={emoji} className={"reaction-pill"+(reactions.some(r=>r.post_id===post.id&&r.user_id===userId&&r.emoji===emoji)?" mine":"")} disabled={busy} onClick={()=>void react(post.id,emoji)}>{emoji} <span>{reactions.filter(r=>r.post_id===post.id&&r.emoji===emoji).length}</span></button>)}
     <button type="button" className="reaction-add" onClick={()=>setReactionPicker(reactionPicker===post.id?null:post.id)} aria-label="Поставить реакцию">☺ +</button>
     {reactionPicker===post.id&&<div className="reaction-picker">{REACTION_EMOJIS.map(emoji=><button key={emoji} type="button" disabled={busy} onClick={()=>void react(post.id,emoji)} aria-label={"Реакция "+emoji}>{emoji}</button>)}</div>}
    </div>
    <div className="channel-post-actions"><button type="button" onClick={()=>void showComments(post.id)}>{openComments===post.id?"Скрыть комментарии":"Комментарии"}</button>
    {mine&&<button type="button" disabled={busy} onClick={()=>{setEditingPostId(post.id);setEditingBody(post.body);}}>Редактировать</button>}{mine&&<button type="button" disabled={busy} onClick={()=>void erasePost(post)}>Удалить пост</button>}</div>
    {openComments===post.id&&<div className="channel-comments">
       {comments.length===0?<p className="channel-no-comments">Будь первым, кто оставит комментарий.</p>:
        comments.map(comment=><div className="channel-comment" key={comment.id}><div className="channel-comment-head"><button type="button" onClick={()=>onShowProfile(comment.author_id)}>{authors[comment.author_id]?.display_name||"Пользователь"}</button><time dateTime={comment.created_at}>{formattedDate(comment.created_at)}</time></div>{editingCommentId===comment.id?<form className="channel-inline-editor" onSubmit={e=>{e.preventDefault();void saveCommentEdit(comment.id);}}><input value={editingBody} maxLength={1500} onChange={e=>setEditingBody(e.target.value)}/><button type="submit">Сохранить</button><button type="button" onClick={()=>setEditingCommentId(null)}>Отмена</button></form>:<p>{comment.body}</p>}
        {comment.author_id===userId&&<button className="channel-delete-comment" type="button" onClick={()=>{setEditingCommentId(comment.id);setEditingBody(comment.body);}}>Редактировать</button>}{(comment.author_id===userId||mine)&&<button className="channel-delete-comment" disabled={busy} onClick={()=>void eraseComment(comment)} type="button">Удалить</button>}</div>)}
       <form className="channel-comment-form" onSubmit={writeComment}><input aria-label="Написать комментарий" maxLength={1500} placeholder="Написать комментарий…" value={commentDraft} onChange={e=>setCommentDraft(e.target.value)}/><button type="submit" className="accent-button" disabled={busy||!commentDraft.trim()}>➤</button></form>
      </div>}
   </article>)}
   {(error||notice)&&<p role="status" className={error?"profile-error":"profile-success"}>{error||notice}</p>}
  </div>
 </section>;
}
