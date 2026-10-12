import {capturePage} from '../../../packages/features/page-qa/capture.js';
import {analyzeSnapshot} from '../../../packages/features/page-qa/a11y.js';
import {highlightPageElement} from '../../../packages/features/page-qa/highlight.js';
import {PAGE_QA_PRODUCT_ID,PAGE_QA_VERSION} from '../../../packages/features/page-qa/identity.js';
import {loadOnlyWarnings,saveOnlyWarnings} from '../../../packages/features/page-qa/settings.js';
import './popup.css';

const element=id=>document.getElementById(id);
const inspectButton=element('inspect');
const exportButton=element('export');
const results=element('results');
const status=element('status');
const summary=element('summary');
const issuesList=element('issues');
const locatorList=element('locators');
const filter=element('only-warnings');
let lastReport=null,lastTabId=null;

function say(message){status.textContent=message;}
function permittedUrl(value) {
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.origin+url.pathname:null;}
  catch{return null;}
}
async function activeTab(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!Number.isInteger(tab?.id)||!permittedUrl(tab.url))
    throw Error('当前页面不可检查。请打开普通 HTTP(S) 网页后重试。');
  return tab;
}
function line(tag,value) {
  const node=document.createElement(tag);
  node.textContent=value;
  return node;
}
async function focus(issue) {
  try {
    const tab=await activeTab();
    if(tab.id!==lastTabId||permittedUrl(tab.url)!==lastReport?.page.url)
      throw Error('页面已切换，请重新检查后定位。');
    const response=await chrome.scripting.executeScript({
      target:{tabId:tab.id},
      func:highlightPageElement,
      args:[{selector:issue.selector,expectedUrl:lastReport.page.url,tag:issue.tag}]
    });
    const outcome=response?.[0]?.result;
    if(!outcome?.ok)throw Error(outcome?.reason||'定位失败，请重新检查。');
    say('已在当前页面临时标记该元素。');
  }catch(error){say(String(error?.message||error));}
}
function render() {
  issuesList.replaceChildren();
  locatorList.replaceChildren();
  if(!lastReport)return;
  const {stats,issues,sampleLocators}=lastReport;
  const visible=filter.checked?issues.filter(item=>item.severity==='warning'):issues;
  summary.textContent=stats.inspected+' 个元素已检查，'+stats.warnings+' 个重点问题，'+issues.length+
    ' 条提示'+(stats.truncated?'（页面过大，仅检查前 1500 个目标元素）':'')+
    (stats.excess?'，另有 '+stats.excess+' 条超出报告上限':'')+'。';
  if(!visible.length)issuesList.append(line('li','当前筛选条件下暂无问题。'));
  for(const issue of visible){
    const item=document.createElement('li');
    item.className='qa-issue';
    const head=document.createElement('div');head.className='qa-issue-header';
    const title=line('strong',issue.code+' · '+(issue.severity==='warning'?'重点':'建议'));
    title.className=issue.severity==='warning'?'qa-warning':'qa-notice';
    head.append(title);
    if(issue.selector){
      const button=line('button','定位');button.type='button';button.className='qa-focus';
      button.addEventListener('click',()=>focus(issue));head.append(button);
    }
    item.append(head,line('p',issue.message));
    if(issue.selector)item.append(line('code',issue.selector));
    issuesList.append(item);
  }
  if(!sampleLocators.length)locatorList.append(line('li','未找到支持的 DOM 节点。'));
  for(const sample of sampleLocators){
    const item=document.createElement('li');
    item.append(line('code',sample.tag+'  '+sample.selector));
    locatorList.append(item);
  }
}
async function inspect() {
  inspectButton.disabled=true;exportButton.disabled=true;lastReport=null;lastTabId=null;
  results.hidden=true;say('正在检查当前页面…');
  try{
    const tab=await activeTab();
    const [{result:snapshot}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:capturePage});
    if(!snapshot||snapshot.page.url!==permittedUrl(tab.url))
      throw Error('页面在检查期间已变化，请重新检查。');
    const report=analyzeSnapshot(snapshot);
    lastReport={...report,productId:PAGE_QA_PRODUCT_ID,version:PAGE_QA_VERSION,generatedAt:new Date().toISOString()};
    lastTabId=tab.id;
    render();results.hidden=false;exportButton.disabled=false;
    say('检查完成。报告仅保存在当前弹窗内。');
  }catch(error){
    say('检查失败：'+String(error?.message||error));
  }finally{inspectButton.disabled=false;}
}
function exportReport() {
  if(!lastReport)return;
  const blob=new Blob([JSON.stringify(lastReport,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='page-qa-report.json';anchor.hidden=true;
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
inspectButton.addEventListener('click',inspect);
exportButton.addEventListener('click',exportReport);
filter.addEventListener('change',()=>{
  render();
  saveOnlyWarnings(filter.checked).catch(()=>say('筛选偏好未能保存，本次仍可使用。'));
});
loadOnlyWarnings().then(value=>{
  filter.checked=value;render();
}).catch(()=>say('无法读取本地偏好；仍可检查页面。'));
