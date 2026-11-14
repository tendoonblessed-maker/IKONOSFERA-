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
  {text:'HTTP://EXAMPLE.COM/path',href:'http://example.com/path',displayText:'http://example.com/path'}
 ]);
});


test('rendered link labels use the canonical host, IPv6 form and effective port',()=>{
 const cases=[
  ['HTTPS://EXAMPLE.COM:443/path','https://example.com/path','https://example.com/path'],
  ['http://EXAMPLE.COM:80/path','http://example.com/path','http://example.com/path'],
  ['https://[2001:0DB8:0:0:0:0:0:1]:443/status','https://[2001:db8::1]/status','https://[2001:db8::1]/status'],
  ['https://EXAMPLE.COM:8443/path','https://example.com:8443/path','https://example.com:8443/path'],
  ['www.EXAMPLE.COM/help','www.example.com/help','https://www.example.com/help']
 ];
 for(const [input,displayText,href] of cases){
  assert.deepEqual(links(input),[{text:input,href,displayText}],
   'the visible label must use the canonical destination authority: '+input);
  assert.equal(reconstructed(input),input,'source message text must remain unchanged');
 }
 for(const input of ['https://example.com./path','www.example.com./help']){
  assert.equal(links(input).length,0,'a trailing-dot hostname stays literal until its display semantics are explicit');
  assert.equal(reconstructed(input),input);
 }
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
 assert.match(ui,/part\.displayText\?\?part\.text/);
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



test('Unicode and percent-encoded hostnames stay plain when WHATWG URL normalizes them',()=>{
 for(const text of [
  'https://example\u3002com/path',
  'https://example\uFF0Ecom/path',
  'https://example\uFF61com/path',
  'https://\uFF45xample.com/path',
  'https://%65xample.com/path',
  'https://%77ww.example.com/path'
 ]){
  assert.equal(links(text).length,0,'a normalized or encoded raw hostname must not become a misleading link');
  assert.equal(reconstructed(text),text,'the original hostname must remain unchanged');
 }
 const ipv6='https://[2001:db8::1]:8443/status';
 assert.deepEqual(links(ipv6),[{text:ipv6,href:ipv6}],
  'ASCII IPv6 literals and explicit ports remain supported');
 const unicodePath='https://example.com/привет';
 assert.deepEqual(links(unicodePath),[
  {text:unicodePath,href:'https://example.com/%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82'}
 ],'Unicode path segments on an ASCII hostname remain supported');
 assert.equal(reconstructed(unicodePath),unicodePath);
});

 
test('non-canonical IPv4 spellings stay literal instead of hiding the normalized destination',()=>{
 for(const text of [
  'http://127.1/path',
  'http://0177.0.0.1/path',
  'http://0x7f000001/path',
  'http://2130706433/path',
  'http://127.000.000.001/path'
 ]){
  assert.equal(links(text).length,0,'legacy IPv4 notation must not become a misleading clickable link');
  assert.equal(reconstructed(text),text,'the original host spelling must remain unchanged');
 }
 const canonical='https://192.168.1.10:8443/status';
 assert.deepEqual(links(canonical),[{text:canonical,href:canonical}],
  'canonical dotted-decimal IPv4 addresses remain supported');
 const ipv6='https://[2001:db8::1]:8443/status';
 assert.deepEqual(links(ipv6),[{text:ipv6,href:ipv6}],
  'the existing bracketed IPv6 support remains unchanged');
});


test('chat links reject ambiguous ports, user-info delimiters and IPv6 zone identifiers',()=>{
 for(const text of [
  'https://example.com:/path',
  'https://example.com:00080/path',
  'https://example.com:000443/path',
  'https://example.com:00000/path',
  'https://example.com:65536/path',
  'https://example.com:999999/path',
  'https://example.com:+80/path',
  'https://example.com:-1/path',
  'https://example.com:80:90/path',
  'https://example.com:80abc/path',
  'https://@example.com/path',
  'https://example.com@evil.example/path',
  'https://[fe80::1%25eth0]/path',
  'https://[fe80::1%25eth0]:8443/path',
  'https://[fe80::1%eth0]/path',
  'https://[2001:db8::1]garbage/path',
  'https://[2001:db8::1]:/path',
  'https://[2001:db8::1]:0008443/path',
  'https://[2001:db8::1]:65536/path'
 ]){
  assert.equal(links(text).length,0,'ambiguous authority must stay plain text: '+text);
  assert.equal(reconstructed(text),text,'the original chat text must remain unchanged');
 }
});

test('canonical decimal ports and bracketed IPv6 literals remain clickable',()=>{
 const accepted=[
  'https://example.com:0/path',
  'https://example.com:1/path',
  'https://example.com:80/path',
  'https://example.com:443/path',
  'https://example.com:65535/path',
  'https://[2001:db8::1]/status',
  'https://[2001:db8::1]:8443/status'
 ];
 for(const text of accepted){
  assert.equal(links(text).length,1,'canonical authority should remain supported: '+text);
  assert.equal(reconstructed(text),text);
 }
 assert.deepEqual(links('https://example.com:443/path'),[
  {text:'https://example.com:443/path',href:'https://example.com/path',displayText:'https://example.com/path'}
 ],'WHATWG default-port normalization preserves the same HTTPS destination');
 assert.deepEqual(links('http://example.com:80/path'),[
  {text:'http://example.com:80/path',href:'http://example.com/path',displayText:'http://example.com/path'}
 ],'WHATWG default-port normalization preserves the same HTTP destination');
});

test('IPv4-mapped IPv6 literals stay plain when WHATWG rewrites the embedded IPv4',()=>{
 for(const text of [
  'https://[::ffff:127.0.0.1]/admin',
  'https://[::ffff:192.168.1.10]:8443/status',
  'https://[0:0:0:0:0:ffff:127.0.0.1]/admin',
  'https://[::ffff:7f00:1]/admin',
  'https://[0:0:0:0:0:ffff:7f00:1]/admin'
 ]){
  assert.equal(links(text).length,0,'IPv4-mapped IPv6 must not conceal its embedded IPv4: '+text);
  assert.equal(reconstructed(text),text,'the original chat text must remain unchanged');
 }
 const ordinary='https://[2001:db8::1]:8443/status';
 assert.deepEqual(links(ordinary),[{text:ordinary,href:ordinary}],
  'ordinary IPv6 literals remain clickable');
 assert.equal(reconstructed(ordinary),ordinary);
});

test('mixed ASCII and Unicode authority delimiters stay literal',()=>{
 for(const text of [
  'https://раypal.example/path',
  'https://sub.пример.example/path',
  'https://example\uFF0Fcom/path',
  'https://example\u2215com/path',
  'https://example\u2044com/path',
  'https://example\uFF1A443.com/path',
  'https://example\uFF20evil.example/path'
 ]){
  assert.equal(links(text).length,0,'mixed or non-standard authority must remain plain: '+text);
  assert.equal(reconstructed(text),text,'the original chat text must remain unchanged');
 }
 const ordinary='https://example.com/путь';
 assert.equal(links(ordinary).length,1,'Unicode path text on an ASCII host remains supported');
 assert.equal(reconstructed(ordinary),ordinary);
});

test('IPv6 literals with dotted-decimal IPv4 tails stay literal after WHATWG normalization',()=>{
 for(const text of [
  'https://[::192.0.2.1]/path',
  'https://[2001:db8::192.0.2.1]/path',
  'https://[64:ff9b::192.0.2.1]/path',
  'https://[::ffff:192.0.2.1]/path'
 ]){
  assert.equal(links(text).length,0,'a dotted IPv4 tail must not be silently rewritten inside IPv6: '+text);
  assert.equal(reconstructed(text),text,'the original IPv6 spelling must remain visible');
 }
 const canonicalHex='https://[2001:db8::c000:201]:8443/status';
 assert.deepEqual(links(canonicalHex),[{text:canonicalHex,href:canonicalHex}],
  'unambiguous hexadecimal IPv6 literals remain clickable');
 assert.equal(reconstructed(canonicalHex),canonicalHex);
});

test('chat links reject literal and percent-encoded dot segments normalized by WHATWG URL',()=>{
 for(const text of [
  'https://example.com/public/../account',
  'https://example.com/./account',
  'https://example.com/%2e%2e/account',
  'https://example.com/.%2e/account',
  'https://example.com/%2e./account',
  'https://example.com/public/%2E%2e/account',
  'https://example.com/public/..'
 ]){
  assert.equal(links(text).length,0,'a normalized path must not be displayed as a different clickable path: '+text);
  assert.equal(reconstructed(text),text,'the original message text must remain unchanged');
 }
});

test('query strings and double-encoded path text are not mistaken for URL dot segments',()=>{
 for(const text of [
  'https://example.com/search?next=/../account',
  'https://example.com/%252e%252e/account'
 ]){
  assert.equal(links(text).length,1,'only path segments normalized by WHATWG should be rejected: '+text);
  assert.equal(reconstructed(text),text);
 }
});

test('terminal dot path segments are not stripped as sentence punctuation',()=>{
 for(const text of [
  'https://example.com/.',
  'https://example.com/public/..',
  'https://example.com/public/..,',
  'www.example.com/public/..'
 ]){
  assert.equal(links(text).length,0,'a terminal dot segment must remain visible to URL validation: '+text);
  assert.equal(reconstructed(text),text,'the original message text must remain unchanged');
 }
 const sentence='Read https://example.com/path.';
 assert.deepEqual(links(sentence),[
  {text:'https://example.com/path',href:'https://example.com/path'}
 ],'ordinary sentence punctuation should still be excluded from the link');
 assert.equal(reconstructed(sentence),sentence);
});
