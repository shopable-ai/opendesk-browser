import {READ_PROTOCOL,MAX_BYTES,markdownFile} from './policy.js';
const failure=code=>({ok:false,code});
export async function readSenderMarkdown({api,sender,message,fetchFile=fetch,timeout=6000}){
  // Reject arbitrary paths, extensions pages, subframes and non-current documents.
  if(message?.protocol!==READ_PROTOCOL||message?.type!=='read'||
     Object.keys(message).length!==2||sender?.id!==api.runtime.id||sender.frameId!==0||
     !Number.isSafeInteger(sender.tab?.id)||sender.tab.incognito||
     typeof sender.documentId!=='string'||(sender.documentLifecycle&&sender.documentLifecycle!=='active'))
    return failure('E_SENDER');
  const url=markdownFile(sender.url);
  if(!url||markdownFile(sender.tab.url)!==url)return failure('E_SENDER');
  const allowed=()=>new Promise(resolve=>api.extension.isAllowedFileSchemeAccess(resolve));
  const current=async()=>{
    const frame=await api.webNavigation.getFrame({tabId:sender.tab.id,frameId:0});
    return frame?.documentId===sender.documentId&&markdownFile(frame.url)===url&&
      (!frame.documentLifecycle||frame.documentLifecycle==='active');
  };
  const controller=new AbortController();
  let timer;
  try{
    if(!await allowed())return failure('E_FILE_PERMISSION');
    if(!await current())return failure('E_DOCUMENT_CHANGED');
    // Query only the fetch URL, never the visible document URL. This follows
    // the established Chrome local-file autoreload cache-busting technique.
    const requestUrl=new URL(url);
    requestUrl.searchParams.set('odmv',String(Date.now()));
    timer=setTimeout(()=>controller.abort(),timeout);
    const response=await fetchFile(requestUrl.href,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
    if(!response.ok)return failure('E_READ');
    const size=Number(response.headers.get('content-length'));
    if(size>MAX_BYTES)return failure('E_TOO_LARGE');
    const reader=response.body?.getReader();
    if(!reader)return failure('E_READ');
    let bytes=0,text='';const decoder=new TextDecoder('utf-8');
    try{
      for(;;){
        const {value,done}=await reader.read();if(done)break;
        bytes+=value.byteLength;
        if(bytes>MAX_BYTES){await reader.cancel();return failure('E_TOO_LARGE');}
        text+=decoder.decode(value,{stream:true});
      }
      text+=decoder.decode();
    }finally{reader.releaseLock();}
    // Recheck permission and Document identity after asynchronous I/O.
    if(!await allowed())return failure('E_FILE_PERMISSION');
    if(!await current())return failure('E_DOCUMENT_CHANGED');
    return {ok:true,text};
  }catch{return failure(controller.signal.aborted?'E_TIMEOUT':'E_READ');}
  finally{clearTimeout(timer);controller.abort();}
}
export function handleMarkdownViewerRead({api,message,sender,respond}){
  if(message?.protocol!==READ_PROTOCOL)return false;
  void readSenderMarkdown({api,message,sender}).then(respond,()=>respond(failure('E_READ')));
  return true;
}
