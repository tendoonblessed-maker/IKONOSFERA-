import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {deleteMediaObject,isSafeMediaObjectPath,mediaObjectUrl} from '../lib/media-object-path.ts';

const userId='550e8400-e29b-41d4-a716-446655440000';
const objectId='123e4567-e89b-12d3-a456-426614174000';
const objectPath=extension=>userId+'/'+objectId+'.'+extension;
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('accepts every image, video, audio and document extension used by uploads',()=>{
  for(const extension of ['jpg','png','webp','mp4','webm','mov','mp3','m4a','wav','ogg','pdf','txt','zip','doc','docx','xls','xlsx']){
    assert.equal(isSafeMediaObjectPath(objectPath(extension)),true,extension);
  }
  assert.equal(isSafeMediaObjectPath(objectPath('MP4')),true);
});

test('preserves legacy image paths while still rejecting traversal and unsupported paths',()=>{
  assert.equal(isSafeMediaObjectPath('legacy-user/avatar.old.png'),true);
  assert.equal(isSafeMediaObjectPath('legacy-user/channel-cover.webp'),true);
});

test('rejects traversal, extra segments, query strings and unsupported extensions',()=>{
  for(const path of [
    '',
    userId+'/../'+objectId+'.mp4',
    'legacy-user/../avatar.png',
    userId+'/'+objectId+'.mp4/other',
    userId+'/'+objectId+'.mp4?download=1',
    userId+'%2f..%2f'+objectId+'.mp4',
    '/'+objectPath('mp4'),
    'not-a-uuid/'+objectId+'.mp4',
    userId+'/not-a-uuid.mp4',
    objectPath('svg')
  ]){
    assert.equal(isSafeMediaObjectPath(path),false,path);
  }
});

test('builds a Storage URL for non-image attachments and normalizes the base URL',()=>{
  assert.equal(
    mediaObjectUrl('https://project.supabase.co/',objectPath('mp4')),
    'https://project.supabase.co/storage/v1/object/ikonosfera-media/'+objectPath('mp4')
  );
  assert.equal(
    mediaObjectUrl('https://project.supabase.co///',objectPath('pdf')),
    'https://project.supabase.co/storage/v1/object/ikonosfera-media/'+objectPath('pdf')
  );
});

test('returns null for an empty base URL or an unsafe object path',()=>{
  assert.equal(mediaObjectUrl('',objectPath('mp4')),null);
  assert.equal(mediaObjectUrl('https://project.supabase.co',userId+'/../secret.pdf'),null);
});

test('removeUpload validates all supported media paths instead of image-only URLs',()=>{
  const social=source('lib/social.ts');
  const start=social.indexOf('export async function removeUpload');
  const end=social.indexOf('export async function getFullProfile',start);
  assert.notEqual(start,-1);
  assert.notEqual(end,-1);
  const cleanup=social.slice(start,end);
  assert.match(social,/deleteMediaObject/);
  assert.match(cleanup,/deleteMediaObject\(apiUrl,path,token,publicKey\)/);
  assert.doesNotMatch(cleanup,/imageUrl\(path\)/);
});

test('channel post failure and deletion both keep using the shared cleanup path',()=>{
  const panel=source('components/ChannelsPanel.tsx');
  assert.match(panel,/if\(path\)await removeUpload\(token,path\)\.catch/);
  assert.match(panel,/if\(p\.attachment_path\)await removeUpload\(token,p\.attachment_path\)\.catch/);
});


test('performs an authenticated DELETE for video and document objects',async()=>{
  let request;
  await deleteMediaObject('https://project.supabase.co',objectPath('mp4'),'user-jwt','public-anon-key',async(url,init)=>{
    request={url:String(url),init};
    return new Response(null,{status:204});
  });
  assert.equal(request.url,'https://project.supabase.co/storage/v1/object/ikonosfera-media/'+objectPath('mp4'));
  assert.equal(request.init.method,'DELETE');
  assert.equal(request.init.headers.apikey,'public-anon-key');
  assert.equal(request.init.headers.Authorization,'Bearer user-jwt');
});

test('does not send a request for an unsafe Storage path',async()=>{
  let calls=0;
  await deleteMediaObject('https://project.supabase.co',userId+'/../secret.pdf','jwt','anon',async()=>{
    calls++;
    return new Response(null,{status:204});
  });
  assert.equal(calls,0);
});

test('treats an already-missing Storage object as successful cleanup',async()=>{
  await assert.doesNotReject(deleteMediaObject('https://project.supabase.co',objectPath('pdf'),'jwt','anon',async()=>{
    return new Response(null,{status:404});
  }));
});

test('surfaces Storage authorization errors without hiding the server message',async()=>{
  await assert.rejects(
    deleteMediaObject('https://project.supabase.co',objectPath('webm'),'jwt','anon',async()=>{
      return new Response(JSON.stringify({message:'storage permission denied'}),{
        status:403,headers:{'Content-Type':'application/json'}
      });
    }),
    /storage permission denied/
  );
});

test('propagates network failures so cleanup callers can report them',async()=>{
  await assert.rejects(
    deleteMediaObject('https://project.supabase.co',objectPath('m4a'),'jwt','anon',async()=>{
      throw new Error('network offline');
    }),
    /network offline/
  );
});
