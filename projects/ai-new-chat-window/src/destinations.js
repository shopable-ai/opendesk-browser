// Only fixed, origin-scoped destinations; never guess a current chat's project.
// Extend with a reviewed provider adapter instead of granting all websites.
export const PROVIDERS=Object.freeze({
  'https://chatgpt.com':Object.freeze({id:'chatgpt',newPath:'/'}),
  'https://claude.ai':Object.freeze({id:'claude',newPath:'/new'}),
  'https://chat.deepseek.com':Object.freeze({id:'deepseek',newPath:'/'}),
  'https://gemini.google.com':Object.freeze({id:'gemini',newPath:'/app'})
});
export const PAGE_MATCHES=Object.freeze(Object.keys(PROVIDERS).map(origin=>origin+'/*'));

export function providerFor(href){
  try{
    const url=new URL(href);
    if(url.username||url.password||url.protocol!=='https:')return null;
    return PROVIDERS[url.origin]||null;
  }catch{return null;}
}

// OpenAI and Claude have URL-addressable project landing pages.
// A /c/<conversation-id> path carries no reliable project identity.
export function projectDestination(href,pageHref){
  let url,page;
  try{url=new URL(href,pageHref);page=new URL(pageHref);}catch{return null;}
  if(!providerFor(page.href)||url.origin!==page.origin||
     url.username||url.password||url.protocol!=='https:')return null;
  if(page.origin==='https://chatgpt.com'&&(typeof href!=='string'||!href.trim()||/^[?#]/.test(href.trim())))return null;
  let pathname=url.pathname.replace(/\/+$/,'');
  if(page.origin==='https://chatgpt.com'&&
     /^\/g\/g-p-[a-fA-F0-9]{32}(?:-[a-zA-Z0-9_-]{1,95})?\/project$/.test(pathname))
    return {url:url.origin+pathname,kind:'project',provider:'chatgpt'};
  if(page.origin==='https://claude.ai'&&
     /^\/project\/[a-fA-F0-9-]{20,64}$/.test(pathname))
    return {url:url.origin+pathname,kind:'project',provider:'claude'};
  return null;
}

// User-observed DOM/route sample: project:g-p-<32 hex> -> /g/g-p-.../project.
// The landing page's empty composer and real project attribution still need QA.
export function chatGPTProjectDestination(containerId,pageHref,projectHref=null){
  if(providerFor(pageHref)?.id!=='chatgpt')return null;
  const id=/^project:(g-p-[a-fA-F0-9]{32})$/.exec(containerId||'')?.[1];
  if(!id)return null;
  if(projectHref===null)return projectDestination('/g/'+id+'/project',pageHref);
  const linked=projectDestination(projectHref,pageHref);
  if(!linked)return null;
  const linkedId=new URL(linked.url).pathname.split('/')[2];
  return linkedId===id||linkedId.startsWith(id+'-')?linked:null;
}

export function newChatDestination(pageHref,{projectHref=null,fromProjectPage=false}={}){
  let page;
  try{page=new URL(pageHref);}catch{return null;}
  const provider=providerFor(page.href);
  if(!provider)return null;
  if(projectHref!==null)return projectDestination(projectHref,page.href);
  if(fromProjectPage)return projectDestination(page.href,page.href);
  return {url:page.origin+provider.newPath,kind:'ordinary',provider:provider.id};
}

// A synchronous trusted click requests an independent tab/window; browser UI
// decides the result. noopener deliberately provides no success handle.
export function requestNewChat(win,destination,{mode=destination?.provider==='chatgpt'?'tab':'window'}={}){
  if(!destination||!['ordinary','project'].includes(destination.kind)||
     !['window','tab'].includes(mode)||typeof win?.open!=='function')return false;
  const expected=newChatDestination(destination.url);
  const project=destination.kind==='project'?projectDestination(destination.url,destination.url):null;
  if(!expected||expected.provider!==destination.provider||
     (destination.kind==='project'&&(!project||destination.provider==='chatgpt'&&project.url!==destination.url))||
     (destination.kind==='ordinary'&&expected.url!==destination.url))return false;
  const features=mode==='window'?
    'noopener,noreferrer,popup=yes,width=1240,height=860':'noopener,noreferrer';
  win.open(destination.url,'_blank',features);
  // Return means "requested"; popup blockers may prevent the actual window.
  return true;
}
