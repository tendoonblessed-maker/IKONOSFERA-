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

test('HTTP(S) candidates nested immediately after another URI scheme remain plain text',()=>{
 for(const input of [
  'javascript:https://evil.example/path',
  'mailto:www.example.com',
  'custom+scheme.1:https://evil.example/path'
 ]){
  assert.equal(links(input).length,0,'a nested URL must not become a misleading clickable target');
  assert.equal(reconstructed(input),input,'the original message must remain unchanged');
 }
 const ordinary='Ссылка: https://example.com/path';
 assert.deepEqual(links(ordinary),[
  {text:'https://example.com/path',href:'https://example.com/path'}
 ]);
 assert.equal(reconstructed(ordinary),ordinary);
});

test('trailing punctuation, Russian quotes and balanced parentheses do not corrupt URL or text',()=>{
 const input='Смотри (https://example.com/wiki/Function_(math)), потом www.example.com/test!?';
 assert.deepEqual(links(input),[
  {text:'https://example.com/wiki/Function_(math)',href:'https://example.com/wiki/Function_(math)'},
  {text:'www.example.com/test',href:'https://www.example.com/test'}
 ]);
 assert.equal(reconstructed(input),input);
 assert.deepEqual(links('«https://example.com/test»'),[
  {text:'https://example.com/test',href:'https://example.com/test'}
 ],'closing quotation marks should never become part of the link');
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


test('invisible formatting and bidi controls never create deceptive clickable URLs',()=>{
 for(const input of [
  'https://example.com/\u202Ecom.evil',
  'https://exa\u200Bmple.com/path',
  'www.example.com/\u2066hidden\u2069',
  'https://example.com/\u00ADdownload',
  'https://example.com/\u200Dfile',
  'https://example.com/\u061Cpath'
 ]){
  const text=input;
  assert.equal(links(text).length,0,'formatting controls must not produce clickable links');
  assert.equal(reconstructed(text),text,'original chat text must remain unchanged');
 }
});

test('raw backslashes and invisible ASCII controls cannot silently rewrite clickable URLs',()=>{
 for(const text of [
  'https://trusted.example\\@evil.example/path',
  'www.trusted.example\\admin',
  'https://trusted.example/\u0000hidden',
  'https://trusted.example/\u001fhidden',
  'https://trusted.example/\u007fhidden'
 ]){
  assert.equal(links(text).length,0,'ambiguous URL must not be clickable');
  assert.equal(reconstructed(text),text,'preserve original message characters');
 }
});

test('ambiguous URLs do not block nearby valid links or encoded path characters',()=>{
 const input='https://trusted.example\\@evil.example и https://trusted.example/ok';
 assert.deepEqual(links(input),[{text:'https://trusted.example/ok',href:'https://trusted.example/ok'}]);
 assert.equal(reconstructed(input),input);
 const encoded='https://trusted.example/path%5Cname';
 assert.deepEqual(links(encoded),[{text:encoded,href:encoded}]);
});

test('all Unicode format, default-ignorable and control characters stay non-clickable',()=>{
 for(const text of [
  'https://example.com/\u206Ahidden',
  'https://example.com/\u206Fhidden',
  'https://example.com/\u{E0001}\u{E0061}hidden',
  'https://example.com/\u034Fhidden',
  'https://example.com/\uFE0Fhidden',
  'https://example.com/\u0085hidden',
  'https://example.com/\uFFF9hidden'
 ]){
  assert.equal(links(text).length,0,'invisible or control code point must not create a link');
  assert.equal(reconstructed(text),text,'the original message must remain byte-for-byte equivalent');
 }
 const encoded='https://example.com/path%E2%80%8Bname';
 assert.deepEqual(links(encoded),[{text:encoded,href:encoded}],
  'visible percent-encoded characters remain supported');
 assert.equal(reconstructed(encoded),encoded);
});

test('normal Unicode chat links remain clickable',()=>{
 const text='https://example.com/привет';
 assert.deepEqual(links(text),[{text,href:'https://example.com/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82'}]);
 assert.equal(reconstructed(text),text);
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


test('internationalized hostnames stay plain to prevent IDN homograph links',()=>{
 for(const text of [
  'https://раураl.com/path',
  'https://пример.рф',
  'www.пример.рф/help',
  'https://xn--l-7sba6dbr.com/path',
  'https://xn--e1afmkfd.xn--p1ai/'
 ]){
  assert.equal(links(text).length,0,'IDN hostname must not be rendered as an unverified clickable label');
  assert.equal(reconstructed(text),text,'the original hostname must remain visible and unchanged');
 }
 const unicodePath='https://example.com/привет';
 assert.deepEqual(links(unicodePath),[
  {text:unicodePath,href:'https://example.com/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82'}
 ],'Unicode path segments on an ASCII hostname remain supported');
 assert.equal(reconstructed(unicodePath),unicodePath);
});
