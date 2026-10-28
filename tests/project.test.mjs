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
 assert.match(shell,/branding\\/ikonosfera-wordmark\\.svg/);
 for(const original of ['nav-chats.webp','nav-contacts.webp','nav-profile.webp','nav-settings.webp'])assert.ok(shell.includes(original));
 assert.match(shell,/listChatPreviews\\(token\\)/);
 assert.match(shell,/chatFilter==='unread'/);
 assert.match(shell,/createMenuOpen/);
 assert.match(shell,/e\\.nativeEvent\\.isComposing/);
 assert.match(inbox,/ik-unread-count/);
 assert.match(inbox,/ik-chat-preview/);
 assert.match(api,/rpc\\/list_chat_previews/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/not \\(\\(select auth\\.uid\\(\\)\\)=any\\(c\\.hidden_for\\)\\)/);
 assert.match(css,/\\.ik-inbox-filters/);
});
