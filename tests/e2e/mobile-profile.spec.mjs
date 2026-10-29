import {test,expect} from '@playwright/test';

const USER='01b96821-bd71-40d0-8b64-2a7f5e8e2391';
const PARTNER='bfda0b6f-9d7c-4096-a929-2971358e587a';
const CHANNEL='b11d8c04-23ce-4cff-856b-193ab4536021';
const CHAT='af65d75e-9be4-4a90-b247-34d644c15def';
const AVATAR=USER+'/a45d88d3-7dd3-4d34-88fa-7192966bb7e0.jpg';
const SECOND_AVATAR=USER+'/41161e7c-7a16-422e-97be-128459fe4587.jpg';
const profile={id:USER,username:'tester',display_name:'Test User',avatar_path:AVATAR,
 cover_path:null,bio:'Test profile',featured_channel_id:CHANNEL,status_emoji:18,age_years:null};
const partner={id:PARTNER,username:'friend',display_name:'Друг',avatar_path:null,status_emoji:null};
const baseChannel={id:CHANNEL,owner_id:USER,title:'Тестовый канал',slug:'testing',
 description:'',avatar_path:SECOND_AVATAR,discussion_enabled:false,created_at:'2026-10-29T00:00:00Z'};
const gifPixel=Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64');

async function setup(page,options={}){
 const {chat=false,stories=true,delayMessages=false}=options;
 profile.age_years=null;profile.featured_channel_id=CHANNEL;
 let channel={...baseChannel};
 let edited=false;
 const requests=[];
 await page.addInitScript(()=>{
  localStorage.setItem('ikonosfera-session-v1',JSON.stringify({
   access_token:'fake-e2e-token',refresh_token:'fake-e2e-refresh',
   expires_at:Math.floor(Date.now()/1000)+3600
  }));
 });
 await page.route('https://example.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const method=request.method();
  requests.push(path+' '+method);
  if(path.includes('/storage/v1/object/public/')){
   await route.fulfill({status:200,body:gifPixel,contentType:'image/gif'});
   return;
  }
  let response=[];
  if(path==='/auth/v1/user'){
   response={id:USER,email:'tester@example.com',is_anonymous:false};
  }else if(path==='/rest/v1/profiles'){
   if(method==='PATCH')Object.assign(profile,JSON.parse(request.postData()||'{}'));
   response=url.searchParams.toString().includes(PARTNER)?[partner]:[profile];
  }else if(path==='/rest/v1/channels'){
   if(method==='PATCH'){
    const fields=JSON.parse(request.postData()||'{}');
    channel={...channel,...fields};edited=true;
   }
   response=[channel];
  }else if(path==='/rest/v1/stories'){
   response=stories?[{id:'8bad3e8c-79ef-4ca4-8c04-2aaf66da098b',
    user_id:USER,image_path:AVATAR,caption:'',created_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+3600000).toISOString()}]:[];
  }else if(path==='/rest/v1/rpc/list_active_chats'){
   response=chat?[{id:CHAT,user_a:USER,user_b:PARTNER,pinned_for:[],
    hidden_for:[],created_at:'2026-10-29T00:00:00Z'}]:[];
  }else if(path==='/rest/v1/rpc/list_chat_previews'){
   response=chat?[{chat_id:CHAT,last_body:'Привет!',last_created_at:'2026-10-29T00:00:00Z',
    last_media_type:null,last_sender_id:PARTNER,unread_count:1}]:[];
  }else if(path==='/rest/v1/messages'){
   if(delayMessages)await new Promise(resolve=>setTimeout(resolve,1150));
   response=[{id:'7a7aca22-0629-4a1e-b83b-56cda41cbb7c',chat_id:CHAT,
    sender_id:PARTNER,body:'Привет!',created_at:'2026-10-29T00:00:00Z',
    media_path:null,media_type:null,read_at:null,edited_at:null,deleted_for:[],deleted_for_everyone:false}];
  }else if(path==='/rest/v1/rpc/channel_subscriber_counts'){
   response=[{channel_id:CHANNEL,subscribers:1}];
  }else if(path==='/rest/v1/user_activity'){
   response=[{visibility:'approximate'}];
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 return {requests,getChannel:()=>channel,wasEdited:()=>edited};
}
async function enterSettings(page){
 await page.goto('/');
 const nav=page.getByRole('button',{name:'Настройки',exact:true});
 await expect(nav).toBeVisible();
 await nav.click();
 await expect(page.locator('.ik-settings-redesign')).toBeVisible();
}

test('Settings scroll independently and never push bottom navigation offscreen',async({page},testInfo)=>{
 await setup(page);
 await enterSettings(page);
 const panel=page.locator('.ik-settings-redesign');
 const dimensions=await panel.evaluate(el=>({client:el.clientHeight,total:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
 expect(dimensions.overflow).toBe('auto');
 expect(dimensions.total).toBeGreaterThan(dimensions.client);
 await panel.evaluate(el=>el.scrollTop=el.scrollHeight);
 await expect(page.getByRole('button',{name:'Выйти из аккаунта'})).toBeInViewport();
 const navBounds=await page.locator('.pane-nav').boundingBox();
 const viewport=page.viewportSize();
 expect(navBounds).not.toBeNull();
 expect(navBounds.y+navBounds.height).toBeLessThanOrEqual(viewport.height+2);
 await expect(page.locator('.ik-settings-hero-avatar img')).toBeVisible();
 const filter=await page.locator('.pane-nav .nav-profile-avatar').evaluate(el=>getComputedStyle(el).filter);
 expect(filter).toBe('none');
 const color=await panel.evaluate(el=>getComputedStyle(el).backgroundColor);
 expect(color).toBe('rgb(249, 250, 251)');
});

test('Channels preserve uploaded avatar and show description immediately after save',async({page})=>{
 const fake=await setup(page);
 await page.goto('/');
 await page.getByRole('button',{name:'Каналы',exact:true}).click();
 const avatar=page.locator('.channel-list-icon .ik-channel-list-avatar');
 await expect(avatar).toBeVisible();
 await expect(avatar).toHaveAttribute('src',new RegExp('ikonosfera-media'));
 await page.locator('.channel-row-open').first().click();
 await expect(page.locator('.channel-emblem .ik-channel-avatar-img')).toBeVisible();
 await page.getByRole('button',{name:/Настроить канал/}).click();
 await page.getByLabel('Описание',{exact:true}).fill('Новое описание, отображается сразу');
 await page.getByRole('button',{name:'Сохранить изменения'}).click();
 await expect(page.locator('.channel-description')).toHaveText('Новое описание, отображается сразу');
 expect(fake.wasEdited()).toBe(true);
});

test('Profile photo edit opens chooser without opening the story viewer',async({page})=>{
 await setup(page);
 await enterSettings(page);
 await page.getByRole('button',{name:'Открыть мой профиль'}).click();
 await expect(page.locator('.ik-profile-redesign .profile-identity h1')).toHaveText('Test User');
 const [chooser]=await Promise.all([
  page.waitForEvent('filechooser'),
  page.locator('.profile-avatar-camera').click()
 ]);
 expect(chooser).toBeTruthy();
 await expect(page.locator('.story-viewer')).toHaveCount(0);
 await page.getByRole('button',{name:/Фотографии/}).click();
 await expect(page.locator('.ik-profile-content-tabs button.selected')).toContainText('Фотографии');
 await page.getByRole('button',{name:/Истории/}).click();
 await expect(page.locator('.ik-profile-content-tabs button.selected')).toContainText('Истории');
 await expect(page.locator('.profile-featured-channel')).toBeVisible();
});

test('Chat loading skeleton transitions to messages with visible composer',async({page})=>{
 await setup(page,{chat:true,delayMessages:true});
 await page.goto('/');
 await expect(page.locator('.telegram-chat-row')).toBeVisible();
 await page.locator('.telegram-chat-row').first().click();
 await expect(page.locator('.ik-chat-loading')).toBeVisible();
 await expect(page.locator('.conversation-blank')).toHaveCount(0);
 await expect(page.getByText('Привет!',{exact:true}).last()).toBeVisible();
 const composer=page.locator('.composer textarea');
 await expect(composer).toBeVisible();
 const viewport=page.viewportSize(),rect=await composer.boundingBox();
 expect(rect).not.toBeNull();
 expect(rect.y+rect.height).toBeLessThanOrEqual(viewport.height+2);
 await composer.click();
 const zoom=await page.evaluate(()=>window.visualViewport?.scale??1);
 expect(zoom).toBeGreaterThanOrEqual(0.99);
 expect(zoom).toBeLessThanOrEqual(1.01);
});


test('Profile has white UI, 50 complete emoji figures and optional age without leading zero',async({page})=>{
 await setup(page);
 await enterSettings(page);
 await page.getByRole('button',{name:'Открыть мой профиль'}).click();
 const sheet=page.locator('.ik-profile-redesign');
 await expect(sheet).toBeVisible();
 const color=await sheet.evaluate(el=>getComputedStyle(el).backgroundColor);
 expect(color).toBe('rgb(249, 250, 251)');
 const atlas=await page.evaluate(async()=>{
  const asset=new Image();
  asset.src='/status-emojis.webp';
  await asset.decode();
  return [asset.naturalWidth,asset.naturalHeight];
 });
 expect(atlas).toEqual([800,500]);
 await page.getByRole('button',{name:/Изменить профиль/}).click();
 const age=page.getByPlaceholder('Например, 18');
 await age.fill('065');
 await expect(age).toHaveValue('65');
 await age.fill('18');
 await page.getByRole('button',{name:'Сохранить изменения'}).click();
 await expect(page.locator('.ik-profile-age')).toHaveText('Возраст: 18');
});
test('Featured channel can be detached and attached again in a real UI flow',async({page})=>{
 await setup(page);
 await enterSettings(page);
 await page.getByRole('button',{name:'Открыть мой профиль'}).click();
 await expect(page.locator('.profile-featured-channel')).toBeVisible();
 await page.getByRole('button',{name:'Изменить закреплённый канал'}).click();
 await page.locator('#ik-profile-channel-choice').selectOption('');
 await page.getByRole('button',{name:'Сохранить канал'}).click();
 await expect(page.locator('.profile-featured-channel')).toHaveCount(0);
 await page.getByRole('button',{name:'+ Прикрепить канал'}).click();
 await page.locator('#ik-profile-channel-choice').selectOption(CHANNEL);
 await page.getByRole('button',{name:'Сохранить канал'}).click();
 await expect(page.locator('.profile-featured-channel')).toContainText('Тестовый канал');
});
