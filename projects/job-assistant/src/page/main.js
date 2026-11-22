import {createPageUI} from '@opendesk/ui';

// Read-only DOM adapter. No network hooks, account credentials, clicks, form writes or sends.
const CARD_SELECTOR='.job-card-wrapper, .job-card-box, .job-list-box .job-card, [data-job-id]';
const clean=(value,limit=160)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,limit);
function read(card,selector,max=120){return clean(card.querySelector(selector)?.textContent,max);}
function scan(limit=60){
  const max=Math.min(60,Math.max(1,Number(limit)||60));
  const cards=[...document.querySelectorAll(CARD_SELECTOR)].slice(0,240);
  const jobs=[],seen=new Set();
  for(const card of cards){
    if(jobs.length>=max)break;
    const title=read(card,'.job-name,.job-title,.job-card-left .job-name',110);
    if(!title)continue;
    const link=card.querySelector('a[href*="/job_detail/"]');
    const rawUrl=link?.href||'';
    let url='',id='';
    try{
      const u=new URL(rawUrl,location.href);
      if(u.hostname==='www.zhipin.com'&&u.pathname.startsWith('/job_detail/')){
        id=clean(u.pathname.match(/^\/job_detail\/([^/]+)/)?.[1],100);
        url=u.origin+u.pathname;
      }
    }catch{/* A missing or invalid link is not a confirmed job identity. */}
    if(!id){
      const attr=clean(card.getAttribute('data-job-id')||card.dataset?.jobId,100);
      if(/^[a-z0-9_-]{6,100}$/i.test(attr))id=attr;
    }
    if(id&&seen.has(id))continue;
    if(id)seen.add(id);
    jobs.push({
      id,title,url,
      company:read(card,'.company-name,.company-text,.company-info .name',100),
      salary:read(card,'.salary,.job-salary,.job-salary-wrap',50),
      location:read(card,'.job-area,.job-area-wrapper,.job-card-left .job-area',80),
      description:read(card,'.job-card-footer,.job-info,.job-tag,.tag-list',220)
    });
  }
  return {source:'boss-zhipin-dom-r1',site:'www.zhipin.com',
    sourceUrl:location.origin+location.pathname,scannedAt:Date.now(),
    inspected:cards.length,jobs,diagnostic:cards.length===0?'NO_CARDS_FOUND':
      jobs.length===0?'NO_TITLES_FOUND':'OK'};
}
export default async function main(){
  if(window.top!==window)return {state:'skipped_frame'};
  const owner=createPageUI({id:'app.job-assistant',baseStyles:false});
  owner.host.style.setProperty('display','none','important');
  let disposed=false,off=null;
  const close=()=>{disposed=true;try{off?.();}catch{/* only our own listener */}};
  owner.onDispose(close);
  try{
    const bridge=globalThis.OpenDeskAppPage;
    if(!bridge||typeof bridge.onRequest!=='function')throw Error('APP_PAGE_BRIDGE_UNAVAILABLE');
    off=bridge.onRequest(async ({operation,payload})=>{
      if(disposed)throw Error('PAGE_MODULE_DISPOSED');
      if(location.hostname!=='www.zhipin.com'||!location.pathname.startsWith('/web/geek/job'))
        throw Error('请打开 BOSS 直聘求职者职位搜索列表');
      if(operation!=='jobs.scan')throw Error('UNSUPPORTED_OPERATION');
      if(payload&&(!Number.isInteger(payload.limit)||payload.limit<1||payload.limit>60))
        throw Error('INVALID_SCAN_LIMIT');
      return scan(payload?.limit||60);
    });
    return {state:'ready',adapter:'boss-zhipin-dom-r1'};
  }catch(error){owner.destroy();throw error;}
}
