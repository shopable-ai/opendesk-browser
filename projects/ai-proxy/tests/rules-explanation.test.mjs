import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({entryPoints:[new URL('../src/domain/pac.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {explainRulesRoute,compileRulesPac}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const endpoint={id:'proxy',name:'Test',scheme:'https',host:'proxy.example',port:443,sourceId:'manual'};
const rule=(id,domain,priority,extra={})=>({id,domain,priority,enabled:true,includeSubdomains:true,action:'direct',...extra});
const config={schemaVersion:2,sources:[{id:'manual',kind:'manual',displayName:'Manual',trustedByUser:true}],endpoints:[endpoint],profiles:[],selection:{mode:'rules'},managed:false,
  defaultTarget:{action:'endpoint',endpointId:'proxy'},rules:[
    rule('parent','example.com',30),rule('exact','app.example.com',10,{includeSubdomains:false,action:'endpoint',endpointId:'proxy'}),
    rule('disabled','example.com',0,{enabled:false}),rule('b','tie.example',1),rule('a','tie.example',1,{action:'endpoint',endpointId:'proxy'})]};
test('local explanation agrees with the generated PAC for exact, subdomain, priority, disabled, boundary and default',()=>{
 const sandbox={dnsDomainIs:(host,suffix)=>host.endsWith(suffix)};
 runInNewContext(compileRulesPac(config),sandbox);
 for(const [input,id] of [['https://app.example.com/path?secret=discarded','exact'],['sub.app.example.com','parent'],['example.com','parent'],['notexample.com',null],['tie.example','a'],['other.example',null],['APP.EXAMPLE.COM.','exact']]){
   const r=explainRulesRoute(config,input);assert.equal(r.rule?.id??null,id);
   assert.equal(sandbox.FindProxyForURL('https://'+r.host,r.host),r.target.action==='direct'?'DIRECT':'HTTPS proxy.example:443');
   assert.equal(r.host.includes('?'),false);
 }
 const disabled=structuredClone(config);disabled.rules.find(r=>r.id==='parent').enabled=false;
 assert.equal(explainRulesRoute(disabled,'sub.example.com').rule,null);
 disabled.rules.find(r=>r.id==='parent').enabled=true;
 assert.equal(explainRulesRoute(disabled,'sub.example.com').rule.id,'parent');
});
test('explanation is pure and rejects invalid sites without executing PAC or sending requests',()=>{
 const before=JSON.stringify(config);
 for(const input of ['', 'https://user:secret@example.com','ftp://example.com','not a host','127.0.0.1'])assert.throws(()=>explainRulesRoute(config,input));
 explainRulesRoute(config,'example.com');assert.equal(JSON.stringify(config),before);
});
