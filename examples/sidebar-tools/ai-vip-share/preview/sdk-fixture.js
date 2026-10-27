// Isolated, non-network, non-Chrome SDK Fixture for the production React App.
// The installed JSON never imports or packages this module.
const ORIGIN='http://127.0.0.1:7898';
const SITE=ORIGIN+'/session/';
const DOMAIN_LIST=['chatgpt.com','openai.com','claude.ai','anthropic.com',
  'gemini.google.com','generativelanguage.googleapis.com','perplexity.ai'];
const clone=value=>value===undefined?undefined:structuredClone(value);
const access=()=>({type:'feature',status:'active',title:'AI 网站访问',
  featureId:'local-managed-proxy',detail:'需单独启用网站访问连接'});
const time=()=>({type:'time',status:'active',title:'AI 会员体验权益',
  expiresAt:Date.now()+28*86400000});
const quota=()=>({type:'quota',status:'active',title:'可用额度',
  remaining:80,total:120,unit:'次'});
const scope=()=>[{name:'demo-session',path:'/'},{name:'demo-nonce',path:'/'}];
const idle=()=>({state:'disabled',control:'controllable_by_this_extension',
  permission:true,canStop:false,reason:null});
const owned=()=>({state:'enabled',control:'controlled_by_this_extension',
  permission:true,canStop:true,reason:null});
const fakeHash=value=>{
  // A fixture-only 64-hex CAS token, NOT a security or production ETag.
  const s=JSON.stringify(value),a=[2166136261,5381,3735928559,1640531527];
  for(const char of s)for(let i=0;i<a.length;i++)
    a[i]=Math.imul(a[i]^(char.charCodeAt(0)+i*17),16777619)>>>0;
  return [...a,...a].map(x=>x.toString(16).padStart(8,'0')).join('');
};
export function installPreviewFixture(root){
  // Only the preview owns this scenario selector. The installed package
  // cannot import this file, enable localhost or obtain a developmentProfile.
  const scene=new URL(location.href).searchParams.get('scene');
  const offline=scene==='offline',serviceError=scene==='error';
  const values=new Map();
  if(!offline)values.set('aiVipLocalDevelopmentR136',{schemaVersion:1,enabled:true});
  let granted=!['redeem','offline','guest'].includes(scene),assigned='A',serial=0,lastReceipt=null;
  let proxyState=idle(),proxyScenario='disabled',stopResolve=null;
  const devProfile=Object.freeze({endpoint:{scheme:'http',host:'127.0.0.1',port:7897},
    domains:[...DOMAIN_LIST]});
  const store=async(op,args)=>{
    if(op==='currentPage.info')return {status:'unavailable'};
    if(!args||typeof args.key!=='string')throw Error('E_FIXTURE_STORAGE');
    const before=values.has(args.key)?values.get(args.key):null;
    if(op==='storage.get')return {value:clone(before),etag:fakeHash(before)};
    if(op!=='storage.set'||args.ifMatch!==fakeHash(before))throw Error('E_FIXTURE_CAS');
    values.set(args.key,clone(args.value));
    return {saved:true};
  };
  const member=()=>({
    schemaVersion:1,serverNow:Date.now(),
    account:scene==='guest'?{state:'guest'}:
      {state:'bound',id:'preview-member',displayNameMasked:'vip***@example.test'},
    entitlements:scene==='guest'?[]:scene==='expired'?[{...time(),
      status:'expired',expiresAt:Date.now()-86400000}]:
      granted?(scene==='quota'?[quota(),access()]:[time(),quota(),access()]):[],
    redemptions:granted?[{redemptionId:'demo-r1',skuTitle:'AI 会员体验权益',
      redeemedAt:Date.now()-1000,status:'redeemed',idempotencyKey:'preview-only'}]:[],
    ...(granted&&['redeem','session'].includes(scene)?
      {sharedAccounts:{schemaVersion:1,companyId:'preview-company',
        assignedAccountId:'account-'+assigned,redemptionId:'demo-r1',
        accounts:[{id:'account-'+assigned,label:'已获授权的网站会话',
          targetUrl:SITE,cookieScope:scope()}]}}:{})
  });
  const api={
    network:{request:async({method,url,data})=>{
      if(typeof url!=='string'||!url.startsWith(ORIGIN+'/api/'))
        throw Error('E_PREVIEW_NO_EXTERNAL_NETWORK');
      if(method==='GET'&&url===ORIGIN+'/api/member'){
        if(serviceError)throw Error('E_PREVIEW_SERVICE_UNAVAILABLE');
        return {status:200,data:member()};
      }
      if(method==='POST'&&url===ORIGIN+'/api/preview'){
        if(data?.code!=='DEMO-VIP-01')throw Error('E_PREVIEW_CODE');
        return {status:200,data:{previewId:'preview-v1',accountId:'preview-member',
          skuTitle:'AI 会员体验权益',grantSummary:'确认后领取网站访问权益',
          voucherPreviewMasked:'DEMO-****-01',expiresAt:Date.now()+120000}};
      }
      if(method==='POST'&&url===ORIGIN+'/api/redeem'){
        if(data?.accountId!=='preview-member'||data?.previewId!=='preview-v1'||
          typeof data.idempotencyKey!=='string')throw Error('E_PREVIEW_INTENT');
        granted=true;
        lastReceipt={status:'redeemed',accountId:'preview-member',
          idempotencyKey:data.idempotencyKey,redemptionId:'demo-r1',
          redeemedAt:Date.now(),grantedEntitlements:[time(),quota(),access()]};
        return {status:200,data:lastReceipt};
      }
      if(method==='POST'&&url===ORIGIN+'/api/status'&&data?.operation==='sharedSession'){
        if(!granted||data.accountId!=='preview-member'||data.redemptionId!=='demo-r1')
          throw Error('E_PREVIEW_NO_ASSIGNMENT');
        return {status:200,data:{schemaVersion:1,accountId:'preview-member',
          sharedAccountId:'account-'+assigned,redemptionId:'demo-r1',requestId:data.requestId,
          serverNow:Date.now(),cookieDelivery:{schemaVersion:1,
            deliveryId:'demo-delivery-'+(++serial),targetUrl:SITE,
            expiresAt:Date.now()+120000,
            cookies:[{name:'demo-session',value:'fixture-'+assigned,path:'/'},
              {name:'demo-nonce',value:'preview',path:'/'}]}}};
      }
      if(method==='POST'&&url===ORIGIN+'/api/status'&&data?.idempotencyKey&&lastReceipt)
        return {status:200,data:lastReceipt};
      throw Error('E_PREVIEW_UNSUPPORTED_REQUEST');
    }},
    cookies:{setMany:async({url,cookies})=>{
      if(url!==SITE||!Array.isArray(cookies)||cookies.length!==2)
        throw Error('E_PREVIEW_INVALID_DELIVERY');
      const outcome=preview.cookieOutcome;
      if(outcome==='unknown')return {saved:1,verified:0,
        results:[{index:0,saved:true,verified:false,code:'E_OUTCOME_UNKNOWN'}],stopped:true};
      if(outcome==='partial')return {saved:1,verified:1,
        results:[{index:0,saved:true,verified:true},
          {index:1,saved:false,verified:false,code:'E_SITE_GRANT_REQUIRED'}],stopped:true};
      return {saved:2,verified:2,
        results:[{index:0,saved:true,verified:true},
          {index:1,saved:true,verified:true}]};
    }},
    proxy:{managed:{
      getStatus:async()=>({...clone(proxyState),
        ...(offline?{}:{developmentProfile:clone(devProfile)})}),
      requestEnable:async()=>{
        if(proxyScenario==='conflict')throw Error('E_PREVIEW_OWNER');
        proxyState=owned();return clone(proxyState);
      },
      requestDisable:async()=>{
        if(proxyScenario==='pending')return new Promise(resolve=>{stopResolve=resolve;});
        proxyState=idle();return clone(proxyState);
      }
    }},
    tabs:{create:async({url})=>{
      if(url!==SITE)throw Error('E_PREVIEW_UNAPPROVED_TAB');
      // No tab is created; this is a safe preview receipt.
      return {tabRef:'fixture-only',preview:true};
    }}
  };
  const preview={
    cookieOutcome:'success',
    activate(){granted=true;},
    switchAccount(){assigned=assigned==='A'?'B':'A';return assigned;},
    setProxyScenario(scene){
      proxyScenario=scene;
      proxyState=scene==='enabled'||scene==='pending'?owned():
        scene==='conflict'?{state:'conflict',control:'controlled_by_other_extensions',
          permission:true,canStop:false,reason:null}:idle();
    },
    releaseStop(){proxyScenario='disabled';proxyState=idle();
      const done=stopResolve;stopResolve=null;done?.(clone(proxyState));}
  };
  globalThis.OpenDeskTool=Object.freeze({root,request:store,setState:()=>{}});
  globalThis.OpenDeskSDK=Object.freeze({browser:api});
  return preview;
}
