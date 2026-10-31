// Offline service boundary only, excluded from production imports and any installable JSON.
export function createPreviewBoundary(scenario='success') {
 const copy=v=>structuredClone(v),fail=(code,message)=>{throw Object.assign(Error('离线模拟 · '+message),{code});};
 const empty={schemaVersion:2,sources:[{id:'manual',kind:'manual',displayName:'手动创建',trustedByUser:true}],endpoints:[],profiles:[],rules:[],defaultTarget:{action:'direct'},selection:{mode:'profile'},managed:false};
 const config=copy(empty);
 if(scenario!=='empty'){
  config.endpoints=[{id:'work',name:'工作代理',scheme:'https',host:'proxy.example.com',port:443,sourceId:'manual'},{id:'local',name:'本地客户端',scheme:'http',host:'127.0.0.1',port:7890,sourceId:'local-local'},{id:'backup',name:'备用 SOCKS',scheme:'socks5',host:'gateway.example.com',port:1080,sourceId:'manual'}];
  config.sources.push({id:'local-local',kind:'local-client',displayName:'本地客户端',trustedByUser:true},{id:'subscription-demo',kind:'subscription',displayName:'示例订阅（未同步）',originHost:'provider.example.com',format:'auto',syncStatus:'not-synced',trustedByUser:true});
  config.profiles=config.endpoints.map(e=>({id:'profile-'+e.id,name:e.name,kind:'endpoint',endpointId:e.id,sourceId:e.sourceId}));
  config.profiles.push({id:'pac-demo',name:'PAC 示例',kind:'pac-inline',sourceId:'manual',pacText:'function FindProxyForURL(url,host) { return "DIRECT"; }'});
  config.rules=[{id:'rule-docs',domain:'example.com',includeSubdomains:true,priority:10,enabled:true,action:'endpoint',endpointId:'work'},{id:'rule-local',domain:'example.org',includeSubdomains:false,priority:20,enabled:true,action:'direct'}];
  config.selection={mode:'rules'};
 }
 let value=copy(config),revision=1;
 const prefs=new Map();
 let status={state:'disabled',permission:true,control:'controllable_by_this_extension',canStop:false,reason:null};
 if(scenario==='conflict')status={...status,state:'conflict',control:'controlled_by_other_extensions',reason:'离线模拟：其他扩展持有控制权'};
 if(scenario==='revoked')status={...status,state:'unavailable',permission:false,control:'unknown',reason:'离线模拟：授权已撤销'};
 function guard(){if(scenario==='error')fail('E_PREVIEW_FAILURE','服务读取失败');if(scenario==='revoked')fail('E_REVOKED','授权已撤销');}
 const service={preview:true,
  async load(){return {config:copy(value),etag:String(revision)};},
  async save(next,etag){if(etag!==String(revision))fail('E_CONFLICT','配置已改变');value=copy(next);return String(++revision);},
  async status(){if(scenario==='error')fail('E_PREVIEW_FAILURE','服务状态读取失败');return copy(status);},
  async apply(){guard();if(scenario==='permission-denied')fail('E_PERMISSION_DENIED','用户拒绝权限审阅');if(scenario==='conflict')return copy(status);status={...status,state:'enabled',control:'controlled_by_this_extension',canStop:true};return copy(status);},
  async stop(){guard();if(scenario==='permission-denied')fail('E_PERMISSION_DENIED','用户拒绝权限审阅');if(scenario==='conflict')return copy(status);status={...status,state:'disabled',control:'controllable_by_this_extension',canStop:false};return copy(status);}
 };
 return Object.freeze({service,read:async key=>copy(prefs.get(key)),write:async(key,value)=>{prefs.set(key,copy(value));}});
}
