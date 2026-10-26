// R6.1: a single read-only <link rel="opendesk-install" href="..."> per top document.
// External webpages cannot approve an install, supply executable code or call a Host.
import {validateMarketSubject,marketError} from './intent.js';

export const OPENDESK_INSTALL_REL='opendesk-install';
const fail=(code,message)=>marketError(code,message);
const fixedPath=/^\/install\/(opendesk\/[a-z][a-z0-9-]{1,39})\/versions\/((?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5}))\/$/;

export function validateDeclaredMarketInstall(href,pageUrl,channel,releases){
  if(channel?.enabled!==true||typeof channel.origin!=='string')
    throw fail('E_CHANNEL_DISABLED','当前未配置受信任的网页安装来源。开发版请检查通道，正式版需要 HTTPS 发行来源。');
  let page,install;
  try{page=new URL(pageUrl);install=new URL(href,page);}catch{
    throw fail('E_DISCOVERY_URL','当前网页的安装声明地址无效。');
  }
  if(!['http:','https:'].includes(page.protocol)||page.username||page.password)
    throw fail('E_DISCOVERY_PAGE','仅允许识别当前普通 HTTP(S) 网页。');
  if(typeof href!=='string'||!href.length||href.length>2048||
    !['http:','https:'].includes(install.protocol)||install.username||install.password||
    install.hash||install.search||install.origin!==channel.origin)
    throw fail('E_DISCOVERY_ORIGIN','安装声明必须指向已配置的受信任市场来源，不允许查询参数、片段或其他地址。');
  const matched=fixedPath.exec(install.pathname);
  if(!matched)
    throw fail('E_DISCOVERY_PATH','安装声明必须指向固定官方应用版本，不接受任意包或下载地址。');
  const subject=validateMarketSubject({kind:'app',marketId:matched[1],version:matched[2]});
  if(!Array.isArray(releases))
    throw fail('E_DISCOVERY_CATALOG','官方发行目录不可用，无法核验安装声明。');
  const release=releases.find(row=>row?.id===subject.marketId&&row?.version===subject.version);
  if(!release||release.kind!=='sidebar-tool'||release.toolId!==subject.marketId.slice('opendesk/'.length))
    throw fail('E_DISCOVERY_RELEASE','该固定应用版本未随当前 OpenDesk 发行，无法从此网页安装。');
  return Object.freeze({subject,release,href:install.href,pageOrigin:page.origin});
}

// Serialized into the pinned Chrome ISOLATED top document: only rel and href,
// never page text, cookies, scripts or network requests.
export function captureDeclaredMarketLinks(){
  const links=[];
  // An incomplete rel declaration still counts. Otherwise a second link
  // without href would be silently ignored instead of rejected as ambiguous.
  for(const node of document.querySelectorAll('link[rel]')){
    if(!node.relList?.contains('opendesk-install'))continue;
    links.push(node.getAttribute('href'));
    if(links.length>=3)break;
  }
  return {documentUrl:location.href,links};
}
export async function discoverCurrentPageMarketInstall({api,currentPageTarget,channel,releases,target:initialTarget=null}){
  if(!api?.scripting?.executeScript||!currentPageTarget?.capture||!currentPageTarget?.revalidate)
    throw fail('E_DISCOVERY_UNAVAILABLE','当前扩展无法读取活动网页的安装声明。');
  if(channel?.enabled!==true)
    throw fail('E_CHANNEL_DISABLED','当前 OpenDesk 尚未启用受信任网页安装通道。');
  if(!initialTarget)await currentPageTarget.ready;
  const target=initialTarget||currentPageTarget.capture();
  // Caller may freeze the document at the actual click, before loading the
  // channel/catalog. Fail instead of silently discovering a later active tab.
  if(initialTarget)await currentPageTarget.revalidate(target);
  let executions;
  try{
    executions=await api.scripting.executeScript({
      target:{tabId:target.tabId,documentIds:[target.documentId]},
      world:'ISOLATED',func:captureDeclaredMarketLinks
    });
  }catch{
    throw fail('E_DISCOVERY_UNAVAILABLE','无法读取当前顶层网页。请核对网页和权限后主动重试。');
  }
  await currentPageTarget.revalidate(target);
  if(!Array.isArray(executions)||executions.length!==1||
    executions[0]?.frameId!==0||executions[0].documentId!==target.documentId||
    executions[0].result?.documentUrl!==target.url||
    !Array.isArray(executions[0].result.links))
    throw fail('E_DISCOVERY_DOCUMENT','当前网页文档身份未得到核对，请重新检测。');
  const links=executions[0].result.links;
  if(links.length===0)throw fail('E_DISCOVERY_MISSING','当前网页未声明 OpenDesk 可安装应用。');
  if(links.length!==1||typeof links[0]!=='string')
    throw fail('E_DISCOVERY_AMBIGUOUS','当前网页有多个或无效的安装声明，不能自动选择一个应用。');
  return Object.freeze({...validateDeclaredMarketInstall(links[0],target.url,channel,releases),target});
}
