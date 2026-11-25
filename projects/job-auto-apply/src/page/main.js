import {createPageUI} from '@opendesk/ui';

// Read-only DOM adapter. No network hooks, account credentials, clicks, form writes or sends.
const CARD_SELECTOR='.job-card-wrapper, .job-card-box, li.job-card-box, .job-list-box .job-card, [data-job-id]';
const JOB_ID=/^[a-z0-9_-]{6,100}$/i;
const clean=(value,limit=160)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,limit);
function read(card,selector,max=120){return clean(card.querySelector(selector)?.textContent,max);}
function scan(limit=60){
  const max=Math.min(60,Math.max(1,Number(limit)||60));
  const cards=[...document.querySelectorAll(CARD_SELECTOR)].slice(0,240);
  const jobs=[],seen=new Set();let missingIdentity=0,duplicates=0;
  for(const card of cards){
    if(jobs.length>=max)break;
    const title=read(card,'.job-name,.job-title,.job-card-left .job-name',110);
    if(!title)continue;
    const link=card.querySelector('a[href*="/job_detail/"]');
    const rawUrl=link?.href||'';
    let url='',id='';
    try{
      const u=new URL(rawUrl,location.href);
      if(u.protocol==='https:'&&u.hostname==='www.zhipin.com'&&u.pathname.startsWith('/job_detail/')){
        id=clean(u.pathname.match(/^\/job_detail\/([^/]+)/)?.[1],100).replace(/\.html$/i,'');
        if(!JOB_ID.test(id))id='';
        url=u.origin+u.pathname;
      }
    }catch{/* A missing or invalid link is not a confirmed job identity. */}
    if(!id){
      const attr=clean(card.getAttribute('data-job-id')||card.dataset?.jobId,100);
      if(JOB_ID.test(attr.replace(/\.html$/i,'')))id=attr.replace(/\.html$/i,'');
    }
    if(id&&seen.has(id)){duplicates++;continue;}
    if(!id)missingIdentity++;
    if(id)seen.add(id);
    const info=read(card,'.job-info,.tag-list,.job-card-tags',180);
    const recruiterLabel=read(card,'.boss-info-attr,.boss-title,.recruiter-label',80);
    const contactLabel=read(card,'.btn-startchat,.start-chat-btn,.job-card-btn',50);
    jobs.push({
      id,title,url,identitySource:id?(url?'url':'card_attribute'):'unverified',
      company:read(card,'.company-name,.company-text,.company-info .name',100),
      salary:read(card,'.salary,.job-salary,.job-salary-wrap',50),
      location:read(card,'.job-area,.job-area-wrapper,.job-card-left .job-area',80),
      description:read(card,'.job-card-footer,.job-info,.job-tag,.tag-list',220),
      descriptionScope:'card_summary',
      experience:clean(info.match(/经验不限|应届(?:生)?|\d+\s*[-~–]\s*\d+\s*年|\d+\s*年(?:以上|以下)?/)?.[0],40),
      education:clean(info.match(/博士|硕士|本科|大专|中专|高中|学历不限/)?.[0],40),
      recruiter:read(card,'.boss-name,.job-card-right .boss-name,.recruiter-name',80),
      activity:read(card,'.boss-active-time,.active-time',70),
      recruiterType:/猎头/.test(recruiterLabel)?'headhunter':'unknown',
      contactState:/继续沟通|已沟通/.test(contactLabel)?'already_contacted':'unknown'
    });
  }
  return {source:'boss-zhipin-dom-r2',site:'www.zhipin.com',
    sourceUrl:location.origin+location.pathname,scannedAt:Date.now(),
    inspected:cards.length,missingIdentity,duplicates,jobs,diagnostic:cards.length===0?'NO_CARDS_FOUND':
      jobs.length===0?'NO_TITLES_FOUND':missingIdentity===jobs.length?'NO_STABLE_IDS':'OK'};
}
export default async function main(){
  if(window.top!==window)return {state:'skipped_frame'};
  const owner=createPageUI({id:'app.job-auto-apply',baseStyles:false});
  owner.host.style.setProperty('display','none','important');
  let disposed=false,off=null,cancelPending=null;
  const close=()=>{disposed=true;cancelPending?.();try{off?.();}catch{/* only our own listener */}};
  owner.onDispose(close);
  try{
    const bridge=globalThis.OpenDeskAppPage;
    if(!bridge||typeof bridge.onRequest!=='function')throw Error('APP_PAGE_BRIDGE_UNAVAILABLE');
    // Wait briefly only when a user requests a scan before asynchronous list paint.
    const awaitInitialCards=()=>new Promise(resolve=>{
      if(disposed||document.querySelector?.(CARD_SELECTOR)||typeof MutationObserver==='undefined'){
        resolve();return;
      }
      let settled=false,observer=null,timer=null;
      const finish=()=>{
        if(settled)return;
        settled=true;observer?.disconnect();clearTimeout(timer);cancelPending=null;resolve();
      };
      cancelPending=finish;
      observer=new MutationObserver(()=>{if(document.querySelector(CARD_SELECTOR))finish();});
      observer.observe(document.documentElement||document,{childList:true,subtree:true});
      timer=setTimeout(finish,1400);
    });
    off=bridge.onRequest(async ({operation,payload})=>{
      if(disposed)throw Error('PAGE_MODULE_DISPOSED');
      if(location.hostname!=='www.zhipin.com'||!location.pathname.startsWith('/web/geek/job'))
        throw Error('请打开 BOSS 直聘求职者职位搜索列表');
      if(operation!=='jobs.scan')throw Error('UNSUPPORTED_OPERATION');
      if(payload&&(!Number.isInteger(payload.limit)||payload.limit<1||payload.limit>60))
        throw Error('INVALID_SCAN_LIMIT');
      const scannedPage=location.href;
      await awaitInitialCards();
      if(disposed)throw Error('PAGE_MODULE_DISPOSED');
      if(location.href!==scannedPage)throw Error('PAGE_CHANGED_DURING_SCAN');
      return scan(payload?.limit||60);
    });
    return {state:'ready',adapter:'boss-zhipin-dom-r2'};
  }catch(error){owner.destroy();throw error;}
}
