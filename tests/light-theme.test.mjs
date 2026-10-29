import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const theme=read('app/light-telegram-theme.css');
const app=read('components/AppShell.tsx');
const layout=read('app/layout.tsx');
const styles=postcss.parse(theme);

test('all iOS screens use one light theme without changing existing fonts',()=>{
 const globalsAt=layout.indexOf('import "./globals.css"');
 const themeAt=layout.indexOf('import "./light-telegram-theme.css"');
 assert.ok(globalsAt>=0&&themeAt>globalsAt,'light overrides load last');
 const selectors=[];
 styles.walkRules(rule=>selectors.push(rule.selector));
 for(const screen of [
   '.ik-settings-redesign','.ik-profile-redesign','.channel-browser',
   '.contact-search-panel','.telegram-chat-row','.pane-nav','.composer'
 ]){
   assert.ok(selectors.some(selector=>selector.includes(screen)),'missing styling for '+screen);
 }
 assert.ok(!/font-family\s*:/.test(theme),'must preserve existing app fonts');
 assert.ok(!theme.includes('grayscale(1)'),'avatars must remain in full color');
});

test('all direct and group chat histories have solid backgrounds without wallpaper',()=>{
 const rules=[];
 styles.walkRules(rule=>{
   if(rule.selector.includes('.conversation-history'))rules.push(rule);
 });
 const plain=rules.filter(rule=>rule.nodes.some(node=>
   node.type==='decl'&&node.prop==='background-image'&&node.value==='none'&&node.important
 ));
 assert.ok(plain.length>=2,'desktop and mobile chat wallpaper must be disabled');
 assert.ok(plain.some(rule=>rule.selector.includes('.group-view')),'group histories also need plain backgrounds');
 assert.ok(!rules.some(rule=>rule.nodes.some(node=>
   node.type==='decl'&&node.prop==='background-image'&&node.value.includes('url(')
 )),'no background image URL is allowed in a chat history');
 assert.match(theme,/background-color:#f5f7fc!important/);
 assert.match(theme,/\.conversation-history\{\s*background-color:#f5f7fc!important;\s*background-image:none!important;/);
});

test('settings shortcut cards and profile editing are actual accessible actions',()=>{
 assert.match(app,/className="ik-settings-hero-details"/);
 assert.match(app,/className="ik-settings-edit-profile" onClick=\{\(\)=>goToProfile\(userId\)\}/);
 assert.match(app,/className="ik-settings-shortcuts"/);
 assert.match(app,/onClick=\{\(\)=>switchTab\('channels'\)\}/);
 assert.match(app,/onClick=\{\(\)=>goToProfile\(userId\)\}/);
 assert.match(theme,/\.ik-settings-shortcuts>button/);
 assert.match(theme,/\.ik-settings-privacy-group \.ik-privacy-settings/);
 assert.match(theme,/\.ik-settings-privacy-group \.ik-blocklist-toggle/);
});

test('iPhone input stays visible while soft glass tab bar and search use safe sizes',()=>{
 assert.match(theme,/\.pane-nav\{\s*width:calc\(100% - 20px\)!important/);
 assert.match(theme,/margin:0 10px max\(7px,env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.match(theme,/\.composer textarea\{\s*background:#f3f5fa!important;\s*font-size:16px!important/);
 assert.match(theme,/\.pane-search input\{\s*min-height:38px!important/);
 const shell=read('components/AppShell.tsx');
 assert.match(shell,/window\.visualViewport/);
 assert.ok(!layout.includes('maximumScale'));
});

test('profile photo cover is allowed while the actual chat has no photo wallpaper',()=>{
 const profile=read('components/ProfilePanel.tsx');
 assert.match(profile,/className="profile-cover"/);
 assert.match(theme,/\.profile-cover\[style\]/);
 assert.match(theme,/\.ik-profile-redesign \.profile-cover:not\(\[style\]\)/);
 assert.match(theme,/\.conversation-history,\s*\.messenger\.is-authenticated \.group-view \.conversation-history/);
});

test('reference-inspired theme is syntactically valid CSS',()=>{
 assert.ok(styles.nodes.length>5);
 let errors=0;
 styles.walkDecls(decl=>{if(!decl.prop||!decl.value)errors++;});
 assert.equal(errors,0);
});
