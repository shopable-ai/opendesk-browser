// Scoped to Time Review export URLs issued by this extension. Never rename
// unrelated browser, user, or other tool downloads.
export const TIME_REVIEW_DOWNLOAD_HINTS='opendesk.time-review.download-hints.v1';
const TTL_MS=120000;
const MAX_PENDING=64;
const FORMATS={json:'application/json',csv:'text/csv'};
const error=(message)=>Object.assign(new Error(message),{code:'E_TIME_EXPORT_NAME'});
export async function prepareTimeReviewDownload(api,file,{at=Date.now(),id=globalThis.crypto.randomUUID()}={}){
  const ext=file.name==='time-review.json'?'json':file.name==='time-review.csv'?'csv':null;
  if(!ext||typeof file.text!=='string')throw error('时间记录导出格式无效');
  const saved=await api.storage.session.get(TIME_REVIEW_DOWNLOAD_HINTS);
  const raw=saved[TIME_REVIEW_DOWNLOAD_HINTS],pending={};
  if(raw&&typeof raw==='object'&&!Array.isArray(raw))
    for(const [ticket,entry] of Object.entries(raw))
      if(entry&&entry.expires>at&&entry.expires<=at+TTL_MS&&
        (entry.name==='time-review.json'||entry.name==='time-review.csv'))
        pending[ticket]=entry;
  if(Object.keys(pending).length>=MAX_PENDING)throw error('短时间内导出请求过多，请稍后重试');
  pending[id]={name:file.name,expires:at+TTL_MS};
  // Session-only intent contains a random ticket and fixed filename, never
  // exported website data. Worker restart retains it; browser restart clears it.
  await api.storage.session.set({[TIME_REVIEW_DOWNLOAD_HINTS]:pending});
  return {url:'data:'+FORMATS[ext]+';name='+file.name+';od-export-id='+id+';charset=utf-8,'+encodeURIComponent(file.text),
    filename:file.name,saveAs:false,conflictAction:'uniquify'};
}
export function registerTimeReviewFilenameResolver(api,{now=Date.now}={}){
  const event=api.downloads?.onDeterminingFilename;
  if(!event?.addListener)return ()=>{};
  const onFilename=(item,suggest)=>{
    // Do not intercept other extensions, ordinary user downloads or even
    // OpenDesk's other export tools. Chrome keeps their normal filename.
    if(item?.byExtensionId!==api.runtime.id||typeof item.url!=='string')return false;
    const match=/^data:(application\/json|text\/csv);name=(time-review\.(json|csv));od-export-id=([0-9a-f-]{36});charset=utf-8,/.exec(item.url);
    if(!match||FORMATS[match[3]]!==match[1])return false;
    void Promise.resolve().then(async()=>{
      const saved=await api.storage.session.get(TIME_REVIEW_DOWNLOAD_HINTS);
      const pending=saved[TIME_REVIEW_DOWNLOAD_HINTS];
      const intent=pending&&Object.hasOwn(pending,match[4])?pending[match[4]]:null;
      return intent?.name===match[2]&&Number.isSafeInteger(intent.expires)&&intent.expires>now()?match[2]:null;
    }).then(name=>name?suggest({filename:name,conflictAction:'uniquify'}):suggest(),()=>suggest());
    // Chrome requires true for an asynchronous suggest callback.
    return true;
  };
  event.addListener(onFilename);
  return ()=>event.removeListener(onFilename);
}
