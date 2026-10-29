import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {splitChatLinks} from '../lib/chat-links.ts';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const links=body=>splitChatLinks(body).filter(part=>part.href);
const reconstructed=body=>splitChatLinks(body).map(part=>part.text).join('');

test('links are found in personal/group plain text with safe HTTP(S) targets',()=>{
 const text='Привет! https://example.com/a?x=1&y=2 и www.openai.com/docs.';
 assert.deepEqual(links(text),[
  {text:'https://example.com/a?x=1&y=2',href:'https://example.com/a?x=1&y=2'},
  {text:'www.openai.com/docs',href:'https://www.openai.com/docs'}
 ]);
 assert.equal(reconstructed(text),text);
 assert.deepEqual(links('HTTP://EXAMPLE.COM/path'),[
  {text:'HTTP://EXAMPLE.COM/path',href:'http://example.com/path'}
 ]);
});

test('message text is preserved exactly including code, markup, newlines and ampersands',()=>{
 for(const text of [
  'a < b && c > d',
  'use <div title="hello"> & </div> literally',
  '<script>alert("hello")</script>',
  'if (x < 10) {\n  return x;\n}',
  'hey\u200bthere\n\nhttps://docs.example.org?q=a%20b',
  'https://example.org/has?x=1&y=2\nследующая строка'
 ]){
  assert.equal(reconstructed(text),text);
 }
});

test('JS, data, file, ftp and non-URL strings are never auto-linked',()=>{
 const input="javascript:alert(1) data:text/html,x file:///etc/passwd ftp://example.org <a href='javascript:bad'>hi</a> example.com";
 assert.equal(links(input).length,0);
 assert.equal(reconstructed(input),input);
});

test('trailing punctuation, Russian quotes and balanced parentheses do not corrupt URL or text',()=>{
 const input='Смотри (https://example.com/wiki/Function_(math)), потом www.example.com/test!?';
 assert.deepEqual(links(input),[
  {text:'https://example.com/wiki/Function_(math)',href:'https://example.com/wiki/Function_(math)'},
  {text:'www.example.com/test',href:'https://www.example.com/test'}
 ]);
 assert.equal(reconstructed(input),input);
 assert.deepEqual(links('«https://example.com/test»'),[
  {text:'https://example.com/test»',href:'https://example.com/test%C2%BB'}
 ],'quote inside URL should be handled as harmless encoded value, never markup');
});

test('embedded domain fragments, email addresses, credentials and malformed URLs remain plain',()=>{
 for(const input of [
  'mywww.example.com',
  'foo@www.example.org',
  'https://user:pass@example.com/path',
  'http://',
  'www.',
  'https://',
  'https://example.com/'+('a'.repeat(2050))
 ]) {
  assert.equal(links(input).length,0,input);
  assert.equal(reconstructed(input),input);
 }
});

test('URLs in multiple lines are independent with no global-regex state leak',()=>{
 const a='https://first.example';
 const b='https://second.example';
 assert.equal(links(a).length,1);
 assert.equal(links(b).length,1);
 assert.equal(links(a).length,1);
 assert.deepEqual(links('\nhttps://first.example\n\nhttps://second.example\n').map(x=>x.text),[a,b]);
});

test('link count is bounded while the remaining text stays intact',()=>{
 const text=Array.from({length:75},(_,i)=>'https://example.org/a'+i).join(' ');
 assert.equal(links(text).length,40);
 assert.equal(reconstructed(text),text);
});

test('React rendering uses escaped text and safe external links instead of HTML injection',()=>{
 const ui=source('components/ChatMessageText.tsx');
 const dm=source('components/AppShell.tsx');
 const groups=source('components/GroupPanel.tsx');
 const css=source('app/globals.css');
 assert.match(ui,/splitChatLinks\(text\)\.map/);
 assert.match(ui,/href=\{part\.href\}/);
 assert.match(ui,/target="_blank"/);
 assert.match(ui,/rel="noopener noreferrer nofollow ugc"/);
 assert.match(ui,/event\.stopPropagation\(\)/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|innerHTML|document\.createElement/);
 assert.match(dm,/<ChatMessageText text=\{message\.body\}\/>/);
 assert.match(groups,/<ChatMessageText text=\{m\.body\}\/>/);
 assert.match(css,/\.ik-message-rich-text\{/);
 assert.match(css,/white-space:pre-wrap/);
 assert.match(css,/overflow-wrap:anywhere/);
});
