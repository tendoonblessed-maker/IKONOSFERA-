import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/network-status.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
function load(){
 const exports={};
 vm.runInNewContext(compiled,{exports},{timeout:2000,filename:'network-status.cjs'});
 return exports.watchNetworkStatus;
}
function target(){
 const listeners=new Map();
 return {
  addEventListener(type,listener){
   if(!listeners.has(type))listeners.set(type,new Set());
   listeners.get(type).add(listener);
  },
  removeEventListener(type,listener){listeners.get(type)?.delete(listener);},
  emit(type){for(const listener of [...(listeners.get(type)??[])])listener({type});},
  count(type){return listeners.get(type)?.size??0;}
 };
}

test('group connectivity hint refreshes on online, offline and mobile resume events',()=>{
 const win=target(),doc=target(),values=[];
 let online=true;
 const navigatorRef={get onLine(){return online;}};
 const stop=load()(value=>values.push(value),win,doc,navigatorRef);
 assert.deepEqual(values,[true]);

 online=false;win.emit('offline');
 online=true;win.emit('online');
 online=false;doc.emit('visibilitychange');
 online=true;win.emit('pageshow');
 assert.deepEqual(values,[true,false,true,false,true]);

 assert.equal(win.count('online'),1);
 assert.equal(win.count('offline'),1);
 assert.equal(win.count('pageshow'),1);
 assert.equal(doc.count('visibilitychange'),1);
 stop();
});

test('group connectivity listeners are removed idempotently on unmount',()=>{
 const win=target(),doc=target(),values=[];
 let online=true;
 const navigatorRef={get onLine(){return online;}};
 const stop=load()(value=>values.push(value),win,doc,navigatorRef);
 stop();stop();
 for(const event of ['online','offline','pageshow'])assert.equal(win.count(event),0);
 assert.equal(doc.count('visibilitychange'),0);
 online=false;
 win.emit('offline');win.emit('pageshow');doc.emit('visibilitychange');
 assert.deepEqual(values,[true],'a disposed panel cannot receive queued lifecycle updates');
});


test('AppShell refreshes the direct-chat offline banner and composer on visibility resume',()=>{
 const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
 assert.ok(shell.includes("import {watchNetworkStatus} from '@/lib/network-status';"));
 assert.match(shell,/useEffect\(\(\)=>watchNetworkStatus\(online=>\{/);
 assert.match(shell,/setNetworkOnline\(online\)/);
 assert.doesNotMatch(shell,/window\.addEventListener\('online',update\)/);
});

test('GroupPanel uses the shared network lifecycle helper for its offline composer state',()=>{
 const panel=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/import \{watchNetworkStatus\} from '@\/lib\/network-status'/);
 assert.match(panel,/useEffect\(\(\)=>watchNetworkStatus\(setOnline\),\[\]\)/);
 assert.doesNotMatch(panel,/window\.addEventListener\('online',update\)/);
});
