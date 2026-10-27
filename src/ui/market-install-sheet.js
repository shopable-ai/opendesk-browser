import {createMarketInstallReview} from '../marketplace/install.js';
import {requestPendingMarketReviews,claimMarketReview} from '../marketplace/panel.js';
import {MARKET_INTENTS_STORE} from '../marketplace/intent.js';
import {MARKET_OPERATIONS_STORE} from './sidebar-tools/installation.js';

// Presentation coordinator on the existing trusted Root. No navigation or
// sandbox disposal occurs when review is opened, deferred, or dismissed.
export function createMarketInstallSheet({api,view,canAutoOpen=()=>false,hasOtherReview=()=>false,
  assertCanInstall=()=>{},openInstalledApp}={}){
  let closed=false,current=null,currentId=null,refreshing=false,again=false,opening=null,activeTicket=null;
  const deferred=new Set();
  const error=problem=>view.setMarketInstall({error:problem?.message||'暂时无法核对市场安装交接。'});
  async function refresh(){
    if(closed)return;
    if(refreshing){again=true;return;}
    refreshing=true;
    try{
      const pending=await requestPendingMarketReviews(api);
      if(closed)return;
      view.setMarketInstall({error:''});
      if(!current&&!opening&&!hasOtherReview()&&canAutoOpen()){
        const next=pending.find(row=>!deferred.has(row.reviewId));
        if(next){
          // Do not flash a second entry button while the native claim loads.
          view.setMarketInstall({pending:[]});
          await open(next.reviewId,{automatic:true});
        }
      }
      if(!closed)view.setMarketInstall({pending});
    }catch(problem){if(!closed)error(problem);}
    finally{refreshing=false;if(again){again=false;void refresh();}}
  }
  async function open(reviewId,{automatic=false}={}){
    if(closed||opening||current)return;
    if(hasOtherReview()){
      view.setMarketInstall({error:'请先完成或关闭当前安装审阅；市场请求已保留。'});return;
    }
    const ticket={};opening=ticket;
    try{
      await claimMarketReview(api,reviewId);
      if(closed)return;
      // The user may have opened a local import or started editing while the
      // browser-owned handoff was being checked. Keep that current UI intact.
      if(hasOtherReview()||automatic&&!canAutoOpen())return;
      activeTicket=ticket;
      currentId=reviewId;
      current=createMarketInstallReview({api,reviewId,
        assertCanInstall,
        onChange:review=>{if(!closed&&activeTicket===ticket)view.setMarketInstall({review,error:''});},
        onClose:()=>{
          if(closed||activeTicket!==ticket)return;
          deferred.add(reviewId);current?.dispose();current=null;currentId=null;
          activeTicket=null;if(opening===ticket)opening=null;
          view.setMarketInstall({review:null});void refresh();
        },
        openInstalledApp});
      view.setMarketInstall({review:current.getSnapshot(),error:''});
      // Loading belongs to this review instance, not the global open lock.
      // Closing a slow download must allow another pending review immediately.
      if(opening===ticket)opening=null;
      // Candidate loading must not hold the pending-list refresh lock. Closing
      // a slow sheet keeps all other requests reachable immediately.
      void current.ready.catch(problem=>{if(!closed&&activeTicket===ticket)error(problem);});
    }catch(problem){if(!closed)error(problem);}
    finally{if(opening===ticket)opening=null;}
  }
  const actions={open,refresh,act:id=>current?.act(id),dismiss:()=>current?.dismiss()};
  view.connectMarketInstall(actions);
  const changed=(changes,area)=>{
    if(area==='local'&&(Object.hasOwn(changes,MARKET_INTENTS_STORE)||Object.hasOwn(changes,MARKET_OPERATIONS_STORE)))void refresh();
  };
  api.storage.onChanged.addListener(changed);
  void refresh();
  return {refresh,dispose(){closed=true;current?.dispose();current=null;activeTicket=null;opening=null;
    api.storage.onChanged.removeListener(changed);view.connectMarketInstall(null);}};
}
