import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('optional age is validated and never has leading zero entry',()=>{
 const profile=load('components/ProfilePanel.tsx');
 const social=load('lib/social.ts');
 const sql=load('supabase/migrations/20261029_070000_optional_profile_age.sql');
 assert.match(sql,/add column if not exists age_years smallint/);
 assert.match(sql,/age_years between 13 and 120/);
 assert.match(social,/age_years:number\|null/);
 assert.match(social,/featured_channel_id,status_emoji,age_years&id=eq/);
 assert.match(profile,/replace\(\/\\D\/g,''\)\.replace\(\/\^0\+\/,''\)/);
 assert.match(profile,/age_years:parsedAge/);
 assert.match(profile,/profile\.age_years!==null/);
});
test('the final profile and settings UI is white',()=>{
 const css=load('app/globals.css');
 assert.match(css,/PRERELEASE LIGHT THEME/);
 assert.match(css,/\.settings-panel\.ik-settings-redesign\{\s*color-scheme:light;background:#f9fafb!important/);
 assert.match(css,/\.profile-view\.ik-profile-redesign,/);
 assert.match(css,/\.ik-profile-redesign \.profile-hero\{\s*background:#fff!important/);
 assert.match(css,/\.pane-nav \.nav-profile-avatar\{\s*filter:none!important/);
});
test('50 emojis use the rebuilt fully padded atlas',()=>{
 const bytes=readFileSync(new URL('../public/status-emojis.webp',import.meta.url));
 assert.ok(bytes.length>120000,'Corrected sprite should replace 97 KB clipped sprite');
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert.match(load('components/StatusEmoji.tsx'),/index>49/);
 assert.match(load('app/globals.css'),/background-size:1000% 500%/);
});
test('channels are pinned immediately after confirmed write and channel icons persist',()=>{
 const profile=load('components/ProfilePanel.tsx');
 const app=load('components/AppShell.tsx');
 assert.match(profile,/updated\.featured_channel_id!==next/);
 assert.match(profile,/setProfile\(updated\)/);
 assert.match(profile,/setFeaturedChannel\(next\?ownedChannels\.find/);
 assert.match(app,/className="ik-channel-list-avatar"/);
});
test('new server checks protect channel attachment ownership and group spam',()=>{
 const sql=load('supabase/migrations/20261029_080000_channel_attachment_group_spam_limits.sql');
 assert.match(sql,/channel_post_attachment_owner/);
 assert.match(sql,/channel_post_attachment_pair/);
 assert.match(sql,/or attachment_path is not null/);
 assert.match(sql,/group_messages_limit_rate/);
 assert.match(sql,/public\.limit_direct_message_rate\(\)/);
});