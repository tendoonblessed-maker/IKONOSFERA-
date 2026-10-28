import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
const load=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('PWA supports Android and iPhone',()=>{const m=JSON.parse(load('public/manifest.webmanifest'));assert.equal(m.display,'standalone');assert.equal(m.start_url,'/');for(const i of m.icons) assert.ok(existsSync(new URL(`../public/${i.src.slice(1)}`,import.meta.url)));});
test('original specification preserved and pivot documented',()=>{assert.ok(load('docs/SPEC.md').includes('Мессенджер для людей'));assert.ok(load('PROJECT_NOTES.md').includes('мессенджера'));});
test('messages use authenticated backend; no fake chat data',()=>{assert.match(load('lib/supabase-rest.ts'),/\/rest\/v1\/messages\?select=/);assert.match(load('lib/supabase-rest.ts'),/Bearer/);assert.ok(!/mockMessages|fakeSend|seedMessages/.test(load('components/AppShell.tsx')));});
test('SQL restricts messages with RLS',()=>{const sql=load('supabase/migrations/20261028_120000_direct_messages.sql');for(const name of ['profiles','chats','chat_members','messages'])assert.ok(sql.includes(`alter table public.${name} enable row level security;`));assert.ok(sql.includes('public.is_chat_member(chat_id)'));assert.ok(!sql.includes('on public.messages for update'));});
test('service worker never caches private messages',()=>{const sw=load('public/sw.js');assert.match(sw,/request\.mode !== "navigate"/);assert.ok(!sw.includes('cache.put(request'));});
test('mobile safe area + reduced motion',()=>{const css=load('app/globals.css');assert.ok(css.includes('safe-area-inset-top'));assert.ok(css.includes('safe-area-inset-bottom'));assert.ok(css.includes('prefers-reduced-motion:reduce'));});

test('invite URL passes initial username into messenger UI',()=>{const route=load('app/u/[username]/page.tsx');const ui=load('components/AppShell.tsx');assert.ok(route.includes('initialUsername={username'));assert.ok(ui.includes('initialUsername?: string'));});
test('API permissions limit write actions',()=>{const sql=load('supabase/migrations/20261028_120000_direct_messages.sql');assert.ok(sql.includes('grant insert on public.messages to authenticated'));assert.ok(sql.includes('grant update (username, display_name) on public.profiles to authenticated'));assert.ok(!sql.includes('grant insert on public.chats to authenticated'));});

test('temporary test account uses authenticated Supabase session, not mock messages',()=>{const api=load('lib/supabase-rest.ts');const ui=load('components/AppShell.tsx');assert.match(api,/createTemporaryAccount/);assert.match(api,/\/auth\/v1\/signup/);assert.match(ui,/beginTemporaryAccount/);assert.match(ui,/восстановить его нельзя/);});

test('white edition has monochrome UI, original wordmark and light PWA chrome',()=>{const css=load('app/globals.css');const shell=load('components/AppShell.tsx');const layout=load('app/layout.tsx');const manifest=JSON.parse(load('public/manifest.webmanifest'));assert.match(css,/color-scheme: light/);assert.match(css,/--bg:#ffffff/);assert.match(shell,/branding\/ikonosfera.svg/);assert.match(shell,/branding\/ikonosfera-wordmark.svg/);assert.match(layout,/statusBarStyle: "default"/);assert.equal(manifest.theme_color,'#ffffff');for(const img of ['ikonosfera.svg','ikonosfera-wordmark.svg'])assert.ok(existsSync(new URL('../public/branding/'+img,import.meta.url)));});

test('white offline fallback and refreshed service worker cache',()=>{const offline=load('public/offline.html');const sw=load('public/sw.js');assert.ok(offline.includes('background:#fff;color:#111111'));assert.ok(offline.includes('/branding/ikonosfera.svg'));assert.ok(sw.includes('ikonosfera-shell-v4'));});

test('social schema protects photo uploads, stories, channels, posts and comments',()=>{
 const sql=load('supabase/migrations/20261028_130000_social_profiles_channels.sql');
 for(const table of ['profile_photos','stories','channels','channel_posts','channel_comments'])
   assert.ok(sql.includes('alter table public.'+table+' enable row level security;'));
 assert.match(sql,/stories_read_active_or_own/);
 assert.match(sql,/channel_posts_create_owner/);
 assert.match(sql,/channel_comments_create_own/);
 assert.match(sql,/storage.foldername\(name\)/);
 assert.match(sql,/3145728/);
});
test('profile editor uses real signed-in upload API',()=>{
 const ui=load('components/ProfilePanel.tsx'),backend=load('lib/social.ts');
 for(const word of ['avatar','cover','story','photo'])assert.ok(ui.includes(word));
 assert.match(backend,/\/storage\/v1\/object\/ikonosfera-media\//);
 assert.match(backend,/Bearer/);
 assert.match(ui,/uploadPhoto\(/);
});
test('channel posts and comments persist through Supabase',()=>{
 const ui=load('components/ChannelsPanel.tsx'),backend=load('lib/social.ts');
 for(const word of ['publishPost','addPostComment','listPostComments'])assert.ok(ui.includes(word)&&backend.includes(word));
});
test('channels require explicit opt-in and separate discovery from subscriptions',()=>{
 const sql=load('supabase/migrations/20261028_140000_subscriptions_and_short_usernames.sql');
 const ui=load('components/AppShell.tsx');
 const api=load('lib/social.ts');
 assert.match(sql,/channel_subscriptions/);
 assert.match(sql,/channel_subscriptions_join_self/);
 assert.match(ui,/Мои каналы/);
 assert.match(ui,/Рекомендации/);
 assert.match(ui,/subscribeChannel/);
 assert.match(ui,/unsubscribeChannel/);
 assert.match(api,/listMySubscriptions/);
});
test('removed mascot does not appear in the UI',()=>{
 assert.ok(!existsSync(new URL('../components/SleepyPixelCat.tsx',import.meta.url)));
 assert.ok(!load('components/AppShell.tsx').includes('SleepyPixelCat'));
});
test('profile messaging and shorter generated usernames',()=>{
 const profile=load('components/ProfilePanel.tsx');
 const sql=load('supabase/migrations/20261028_140000_subscriptions_and_short_usernames.sql');
 assert.match(profile,/Написать сообщение/);
 assert.match(profile,/Юзернейм/);
 assert.match(sql,/profile.*nextval/);
});
test('email authentication accepts magic link or one-time code',()=>{
 const api=load('lib/supabase-rest.ts');
 const ui=load('components/AppShell.tsx');
 assert.match(api,/consumeEmailLinkSession/);
 assert.match(api,/verifyEmailCode/);
 assert.match(ui,/Sign in/);
});

test('Windows guest screen hides pre-login messenger sidebar',()=>{const css=load('app/globals.css');const ui=load('components/AppShell.tsx');assert.match(ui,/is-guest/);assert.match(css,/\.messenger\.is-guest \.chats-pane\{display:none!important\}/);assert.match(css,/\.messenger\.is-guest \.conversation-pane/);assert.match(ui,/Your sign-in link/);assert.match(ui,/Sign in/);});

test('pre-release sign-in directs users to Sign in link and never asks for a code',()=>{
 const ui=load('components/AppShell.tsx');
 assert.match(ui,/Получить ссылку для входа/);
 assert.match(ui,/Нажми синюю ссылку/);
 assert.match(ui,/Your sign-in link/);
 assert.ok(!ui.includes('Получить код'));
 assert.ok(!ui.includes('Код из письма'));
 assert.ok(!ui.includes('confirmCode'));
});
test('guest UI occupies full viewport while the messenger waits for authentication',()=>{
 const ui=load('components/AppShell.tsx'),css=load('app/globals.css');
 assert.match(ui,/is-guest/);
 assert.match(css,/\.messenger\.is-guest \.chats-pane\{display:none!important\}/);
 assert.match(css,/\.messenger\.is-guest \.conversation-placeholder\{overflow:hidden/);
 assert.match(ui,/Больше чем просто мессенджер/);
});
test('no pixel cat remains in the active interface or styles',()=>{
 assert.ok(!load('components/AppShell.tsx').includes('SleepyPixelCat'));
 assert.ok(!load('app/globals.css').includes('pixel-cat-button'));
});
test('message/chat actions open contextual menus, not a stack of destructive buttons',()=>{
 const ui=load('components/AppShell.tsx'), inbox=load('components/ChatInboxRow.tsx');
 assert.match(inbox,/chat-row-menu/);
 assert.match(ui,/message-menu/);
 assert.match(ui,/settings-edit-button/);
});


test('opening a direct conversation keeps an empty draft visible only to its initiator',()=>{
 const sql=load('supabase/migrations/20261028_250000_direct_chat_draft_visibility.sql');
 const shell=load('components/AppShell.tsx');
 assert.match(sql,/alter table public\.chats add column if not exists draft_for uuid\[\]/);
 assert.match(sql,/update public\.chats set draft_for=array_append\(draft_for,caller\)/);
 assert.match(sql,/auth\.uid\(\)=any\(c\.draft_for\)/);
 assert.match(sql,/exists\(select 1 from public\.messages/);
 assert.match(sql,/grant execute on function public\.start_direct_chat\(text\) to authenticated/);
 assert.match(shell,/await startDirectChat\(session\.access_token/);
 assert.match(shell,/await refresh\(session\.access_token,userId,id\)/);
});


test('Direct messages have a content-sized bubble and separate reaction controls',()=>{
 const shell=load('components/AppShell.tsx');
 const css=load('app/globals.css');
 assert.match(shell,/className={`chat-message-row/);
 assert.match(shell,/className="chat-message-tools"/);
 assert.match(css,/\.conversation-history>\.chat-message-row>\.bubble\{/);
 assert.match(css,/width:fit-content;min-width:0/);
 assert.match(css,/\.chat-list \.chat-item>\.contact-info/);
 assert.match(css,/\.chat-list \.chat-row-wrap>\.chat-item/);
});


test('Telegram-inspired inbox keeps IKONOSFERA branding and supplies private previews',()=>{
 const shell=load('components/AppShell.tsx');
 const inbox=load('components/ChatInboxRow.tsx');
 const api=load('lib/supabase-rest.ts');
 const sql=load('supabase/migrations/20261028_260000_chat_previews.sql');
 const css=load('app/globals.css');
 assert.ok(shell.includes('/branding/ikonosfera-wordmark.svg'));
 for(const original of ['nav-chats.webp','nav-contacts.webp','nav-profile.webp','nav-settings.webp'])
   assert.ok(existsSync(new URL('../public/'+original,import.meta.url)));
 for(const tab of ['Контакты','Каналы','Чаты','Настройки'])assert.ok(shell.includes('aria-label="'+tab+'"'));
 assert.ok(shell.includes('listChatPreviews(token)'));
 assert.ok(shell.includes("chatFilter==='unread'"));
 assert.ok(shell.includes('createMenuOpen'));
 assert.ok(shell.includes('e.nativeEvent.isComposing'));
 assert.ok(inbox.includes('ik-unread-count'));
 assert.ok(inbox.includes('ik-chat-preview'));
 assert.ok(api.includes('/rest/v1/rpc/list_chat_previews'));
 assert.ok(sql.includes('security invoker'));
 assert.ok(sql.includes('not ((select auth.uid())=any(c.hidden_for))'));
 assert.ok(css.includes('.ik-inbox-filters'));
});


test('Presence statuses hide exact timestamps unless users opt in',()=>{
 const sql=load('supabase/migrations/20261028_270000_presence_and_subscriber_counts.sql');
 const activity=load('lib/activity.ts');
 const shell=load('components/AppShell.tsx');
 const profile=load('components/ProfilePanel.tsx');
 assert.match(sql,/visibility text not null default 'approximate'/);
 assert.match(sql,/user_activity_self_read/);
 assert.match(sql,/case when a.visibility='exact' then a.last_seen_at else null end/);
 assert.match(sql,/revoke all on public.user_activity from anon,authenticated/);
 assert.match(sql,/revoke all on function public.get_user_activity/);
 assert.match(activity,/activityLabel/);
 assert.match(shell,/changeActivityVisibility/);
 assert.match(shell,/Время последнего посещения/);
 assert.match(profile,/getUserActivities/);
});
test('Channels expose subscriber totals without private subscriber identities',()=>{
 const sql=load('supabase/migrations/20261028_270000_presence_and_subscriber_counts.sql');
 const panel=load('components/ChannelsPanel.tsx');
 const shell=load('components/AppShell.tsx');
 assert.match(sql,/returns table\(channel_id uuid,subscribers bigint\)/);
 assert.match(sql,/count\(\*\) from public.channel_subscriptions/);
 assert.match(panel,/subscriberCount/);
 assert.match(shell,/getChannelSubscriberCounts/);
});
test('Group members list is accessible from the chat heading and cannot be accessed outside RLS',()=>{
 const panel=load('components/GroupPanel.tsx');
 const shell=load('components/AppShell.tsx');
 const sql=load('supabase/migrations/20261028_230000_group_chats.sql');
 assert.match(panel,/setMembersOpen\(true\)/);
 assert.match(panel,/aria-label="Участники группы"/);
 assert.match(panel,/group\.owner_id/);
 assert.match(panel,/onShowProfile/);
 assert.match(shell,/onShowProfile=\{id=>/);
 assert.match(sql,/group_member_read/);
});
test('Sharing the messenger copies a clean URL without tracking markers',()=>{
 const shell=load('components/AppShell.tsx');
 assert.ok(shell.includes("window.location.origin+'/'"));
 assert.match(shell,/copyCleanLink/);
});


test('Group inbox previews and unread counts remain scoped to group members',()=>{
 const sql=load('supabase/migrations/20261028_280000_group_inbox.sql');
 const shell=load('components/AppShell.tsx');
 const group=load('components/GroupPanel.tsx');
 const row=load('components/GroupInboxRow.tsx');
 assert.match(sql,/security invoker/);
 assert.match(sql,/where msg.group_id=g.id and msg.sender_id/);
 assert.match(sql,/me.user_id=\(select auth.uid\(\)\)/);
 assert.match(sql,/group_member_update_own_read_cursor/);
 assert.match(shell,/listGroupOverviews/);
 assert.match(row,/ik-unread-count/);
 assert.match(group,/markGroupRead/);
});


test('Chat inbox rows stay horizontal on iPhone and desktop instead of stacking centrally',()=>{
 const css=load('app/globals.css');
 const component=load('components/ChatInboxRow.tsx');
 assert.match(css,/\.chat-row-wrap\{display:flex;flex-direction:row;/);
 assert.match(css,/\.messenger\.is-authenticated \.chat-list \.chat-row-wrap\{display:flex;flex-direction:row;justify-content:flex-start/);
 assert.match(css,/\.messenger\.is-authenticated \.chat-list \.telegram-chat-row\{display:flex;flex-direction:row;justify-content:flex-start/);
 assert.match(css,/\.messenger\.is-authenticated \.chat-list \.chat-row-wrap\{flex-direction:row;width:calc\(100% - 12px\)/);
 assert.match(component,/className=\{'chat-row-wrap ik-inbox-row'/);
 assert.match(component,/className="contact-info"/);
 assert.match(component,/className="ik-chat-meta"/);
});


test('Telegram-like layout retains IKONOSFERA assets and sorts personal and group chats together',()=>{
 const shell=load('components/AppShell.tsx');
 const css=load('app/globals.css');
 assert.ok(shell.includes('/branding/ikonosfera-wordmark.svg'));
 for(const asset of ['nav-chats.webp','nav-contacts.webp','nav-profile.webp','nav-settings.webp'])assert.ok(existsSync(new URL('../public/'+asset,import.meta.url)));
 assert.match(shell,/className="pane-nav"/);
 assert.match(shell,/ik-contact-person/);
 assert.match(shell,/kind:'chat' as const/);
 assert.match(shell,/kind:'group' as const/);
 assert.match(shell,/Number\(b.pinned\)-Number\(a.pinned\)/);
 assert.match(shell,/chatFilter==='private'/);
 assert.match(shell,/chatFilter==='groups'/);
 assert.match(shell,/chatFilter==='unread'/);
 assert.ok(shell.indexOf('<StoriesStrip')<shell.indexOf('ref={searchInputRef}'));
 assert.match(css,/\.messenger\.is-authenticated \.chat-list \.chat-row-wrap\{/);
 assert.match(css,/\.messenger\.is-authenticated \.chat-list \.telegram-chat-row\{/);
 assert.match(css,/\.messenger\.is-authenticated \.pane-nav \.nav-art\{/);
});
test('Chat dates and accessible conversation actions mimic familiar messenger workflow',()=>{
 const shell=load('components/AppShell.tsx');
 const css=load('app/globals.css');
 assert.ok(shell.includes('dayLabel(message.created_at)'));
 assert.ok(shell.includes('ik-chat-day-separator'));
 assert.ok(shell.includes('ik-conversation-more'));
 assert.ok(shell.includes('aria-label="Действия с чатом"'));
 assert.ok(shell.includes('chatAction(active.chat.id'));
 assert.ok(css.includes('.ik-chat-day-separator'));
 assert.ok(css.includes('.ik-conversation-more-menu'));
 assert.ok(css.includes('prefers-reduced-motion:reduce'));
});


test('Chat search and multi-select are accessible and do not change backend permissions',()=>{
 const shell=load('components/AppShell.tsx');
 const css=load('app/globals.css');
 assert.ok(shell.includes('searchInConversation'));
 assert.ok(shell.includes('messageSearch'));
 assert.ok(shell.includes('Поиск сообщений в текущем чате'));
 assert.ok(shell.includes('selectedMessages'));
 assert.ok(shell.includes('navigator.clipboard.writeText'));
 assert.ok(shell.includes('setMessageMenuId(message.id)'));
 assert.ok(shell.includes('Выбрать сообщение'));
 assert.ok(!shell.includes('aria-pressed={selectedMessages.includes(message.id)}'));
 assert.ok(css.includes('.ik-conversation-search'));
 assert.ok(css.includes('.ik-selection-toolbar'));
});

test('monochrome iPhone refresh keeps functional navigation and edit actions',()=>{
 const shell=load('components/AppShell.tsx'),css=load('app/globals.css');
 assert.match(shell,/contactPeople\.filter\(/);
 assert.match(shell,/ik-contact-lookup/);
 assert.match(shell,/selectedChatIds/);
 assert.match(shell,/applyBulkChatAction/);
 assert.match(shell,/markChatRead\(session\.access_token,id\)/);
 assert.match(css,/ik-ios-canvas/);
 assert.match(css,/story-viewer-close svg/);
 assert.match(css,/max-width:800px/);
});
test('life bot allows blank age while editing and validates before persistence',()=>{
 const source=load('components/BotsPanel.tsx');
 assert.match(source,/useState\("85"\)/);
 assert.match(source,/!years\.trim\(\)/);
 assert.match(source,/Number\.isInteger\(yearsNumber\)/);
 assert.match(source,/inputMode="numeric"/);
 assert.ok(!source.includes('setYears(Number(e.target.value))'));
});
test('story close controls use symmetrical SVG instead of glyph x',()=>{
 const stories=load('components/StoriesStrip.tsx'),profile=load('components/ProfilePanel.tsx');
 for(const source of [stories,profile]){
   assert.match(source,/className="story-viewer-close"/);
   assert.match(source,/viewBox="0 0 24 24"/);
   assert.match(source,/M6 6l12 12M18 6L6 18/);
 }
});

test('featured channel can be pinned independently and visitors see only the channel card',()=>{
 const ui=load('components/ProfilePanel.tsx');
 const api=load('lib/social.ts');
 const migration=load('supabase/migrations/20261029_010000_allow_featured_channel_update.sql');
 assert.match(migration,/grant update \(featured_channel_id\) on public\.profiles to authenticated/);
 assert.match(ui,/async function pinChannel\(\)/);
 assert.match(ui,/getChannelById\(token,p\.featured_channel_id\)/);
 assert.match(ui,/featuredChannel&&<button type="button" className="profile-featured-channel"/);
 assert.match(ui,/mine&&!visitorPreview&&<div className="ik-profile-pin-area"/);
 assert.ok(!ui.includes('<h2>Мой канал</h2>'));
 assert.ok(!ui.includes('<p>Закреплён в профиле</p>'));
 assert.match(api,/export async function getChannelById/);
 assert.match(api,/avatar_path/);
});


test('contacts are persisted per user and can be managed from chat or contacts',()=>{
 const shell=load('components/AppShell.tsx');
 const inbox=load('components/ChatInboxRow.tsx');
 const api=load('lib/contacts.ts');
 const sql=load('supabase/migrations/20261029_020000_persistent_contacts_blocklist_chat_cleanup.sql');
 for(const action of ['listSavedContacts','addSavedContact','removeSavedContact','listBlockedUsers','addBlockedUser','removeBlockedUser'])
   assert.ok(api.includes('function '+action+'('));
 assert.match(shell,/toggleSavedContact\(person:Profile\)/);
 assert.match(shell,/listSavedContacts\(token,id\)/);
 assert.match(shell,/const contactPeople=useMemo\(\(\)=>\[\.\.\.savedContacts\]/);
 assert.match(inbox,/Добавить в контакты/);
 assert.match(inbox,/Удалить из контактов/);
 assert.match(sql,/create table if not exists public\.user_contacts/);
 assert.match(sql,/owner_id = \(select auth\.uid\(\)\)/);
 assert.match(sql,/user_contacts_pair_pk primary key/);
});
test('blocklist is private and blocks delivery server-side for text and files',()=>{
 const shell=load('components/AppShell.tsx'),sql=load('supabase/migrations/20261029_020000_persistent_contacts_blocklist_chat_cleanup.sql');
 assert.match(sql,/create table if not exists public\.user_blocks/);
 assert.match(sql,/create trigger enforce_direct_message_blocks before insert on public\.messages/);
 assert.match(sql,/b\.owner_id = recipient and b\.blocked_id = new\.sender_id/);
 assert.match(sql,/revoke all on function public\.enforce_direct_message_blocks\(\) from public, anon, authenticated/);
 assert.match(shell,/className="ik-blocklist-settings"/);
 assert.match(shell,/Разблокировать/);
 assert.match(shell,/disabled=\{sending\|\|activePartnerBlocked\}/);
});
test('chat removal for me erases own history without deleting recipient data',()=>{
 const sql=load('supabase/migrations/20261029_020000_persistent_contacts_blocklist_chat_cleanup.sql');
 const shell=load('components/AppShell.tsx');
 const api=load('lib/supabase-rest.ts');
 assert.match(sql,/p_action = 'delete_for_me'/);
 assert.match(sql,/update public\.messages set deleted_for = array_append/);
 assert.match(sql,/update public\.chats/);
 assert.match(sql,/p_action = 'delete_everyone'/);
 assert.match(shell,/Удалить только у себя/);
 assert.match(shell,/Удалить у обоих/);
 assert.match(api,/"delete_self"/);
});
test('mobile message actions open a viewport-bound action sheet with no extra tick icon',()=>{
 const shell=load('components/AppShell.tsx'),css=load('app/globals.css');
 assert.match(shell,/className="ik-message-menu-backdrop"/);
 assert.match(shell,/className="ik-message-menu-sheet"/);
 assert.match(shell,/className="ik-message-menu-toggle"/);
 assert.ok(!shell.includes('className={"ik-select-message"'));
 assert.match(css,/\.ik-message-menu-backdrop\{/);
 assert.match(css,/position:fixed;inset:0;z-index:3000/);
 assert.match(css,/\.ik-message-menu-sheet\{/);
 assert.match(css,/align-items:flex-end/);
});

test('deleted chat returns on a new message without exposing deleted history',()=>{
 const sql=load('supabase/migrations/20261029_021000_reopen_deleted_chat_on_new_message.sql');
 assert.match(sql,/create trigger reopen_chat_after_new_message after insert on public\.messages/);
 assert.match(sql,/update public\.chats c/);
 assert.match(sql,/array_remove\(array_remove\(c\.hidden_for,c\.user_a\),c\.user_b\)/);
 assert.ok(!sql.includes('deleted_for ='));
});

test('own story add badge uses centered vector icon on iPhone',()=>{
 const story=load('components/StoriesStrip.tsx'),css=load('app/globals.css');
 assert.match(story,/className="home-story-plus" aria-hidden="true"/);
 assert.match(story,/M10 4v12M4 10h12/);
 assert.match(css,/\.home-story-item \.home-story-plus\{/);
 assert.match(css,/display:flex;align-items:center;justify-content:center/);
 assert.match(css,/\.home-story-item \.home-story-plus svg/);
});
test('story timeline fills before advancing, both in chat and profile',()=>{
 const story=load('components/StoriesStrip.tsx'),profile=load('components/ProfilePanel.tsx');
 const clock=load('lib/use-story-progress.ts'),css=load('app/globals.css');
 assert.match(story,/useStoryProgress\(activeStoryId/);
 assert.match(profile,/useStoryProgress\(activeStory\?\.id/);
 assert.ok(!story.includes('setTimeout(()=>{'));
 assert.ok(!profile.includes('setTimeout(()=>setStoryIndex('));
 assert.match(clock,/STORY_DURATION_MS=6000/);
 assert.match(clock,/requestAnimationFrame\(tick\)/);
 assert.match(clock,/pausedRef\.current/);
 assert.match(clock,/callbackRef\.current\(\)/);
 assert.match(css,/span\.playing\.story-progress-fill/);
 assert.match(css,/animation:none!important/);
});

test('profile direct-message controls respect the personal blacklist',()=>{
 const shell=load('components/AppShell.tsx'),profile=load('components/ProfilePanel.tsx');
 assert.match(profile,/isBlocked\?:boolean/);
 assert.match(profile,/onBlockUser\?:\(targetId:string\)=>void/);
 assert.match(profile,/disabled=\{isBlocked\}/);
 assert.match(shell,/onBlockUser=\{id=>void toggleProfileBlock\(id\)\}/);
});
