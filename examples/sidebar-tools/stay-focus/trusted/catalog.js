// A single audited, offline classification authority. No page title or
// self-reported metadata can silently enlarge the site's blocking scope.
import {hostnameMatches} from './policy.js';
export const FOCUS_DEFAULT_GROUP='entertainment';
export const FOCUS_DEFAULT_MINUTES=30;
export const FOCUS_CATALOG=Object.freeze([
  {host:'youtube.com',name:'YouTube',category:'视频娱乐',auto:true,quick:true},
  {host:'bilibili.com',name:'哔哩哔哩',category:'视频娱乐',auto:true,quick:true},
  {host:'tiktok.com',name:'TikTok',category:'短视频',auto:true,quick:true},
  {host:'douyin.com',name:'抖音',category:'短视频',auto:true,quick:false},
  {host:'instagram.com',name:'Instagram',category:'社交娱乐',auto:true,quick:true},
  {host:'reddit.com',name:'Reddit',category:'社交娱乐',auto:true,quick:false},
  {host:'x.com',name:'X',category:'社交娱乐',auto:true,quick:false},
  {host:'weibo.com',name:'微博',category:'社交娱乐',auto:true,quick:false},
  {host:'netflix.com',name:'Netflix',category:'影视娱乐',auto:true,quick:false},
  {host:'twitch.tv',name:'Twitch',category:'直播娱乐',auto:true,quick:false},
  {host:'roblox.com',name:'Roblox',category:'游戏',auto:true,quick:false},
  {host:'github.com',name:'GitHub',category:'工作/开发',auto:false,quick:false},
  {host:'stackoverflow.com',name:'Stack Overflow',category:'工作/开发',auto:false,quick:false},
  {host:'docs.google.com',name:'Google Docs',category:'工作',auto:false,quick:false},
  {host:'wikipedia.org',name:'Wikipedia',category:'学习',auto:false,quick:false},
  {host:'coursera.org',name:'Coursera',category:'学习',auto:false,quick:false}
].map(row=>Object.freeze({...row,minutes:row.auto?FOCUS_DEFAULT_MINUTES:0})));
export function focusCatalogMatch(host){
  if(typeof host!=='string')return null;
  return FOCUS_CATALOG.find(row=>hostnameMatches(host,row.host,true))||null;
}
// Package-owned, code-free website recommendations. These can change with a
// JSON-only same-ID upgrade on an unchanged Browser build. Nothing is installed
// in DNR or copied into a user's policy before an explicit confirmed site.put.
export function focusCatalogForPackage(tool){
  const rows=tool?.backgroundPolicy?.kind==='site-budget.v1'?tool.backgroundPolicy.suggestions:[];
  if(!rows.length)return FOCUS_CATALOG;
  const additions=new Map(rows.map(row=>[row.host,{
    host:row.host,name:row.name,category:row.category,auto:false,quick:row.quick,
    minutes:row.suggestLimit?FOCUS_DEFAULT_MINUTES:0
  }]));
  const base=FOCUS_CATALOG.map(row=>{
    const candidate=additions.get(row.host);
    if(!candidate)return row;
    additions.delete(row.host);
    return Object.freeze({...row,name:candidate.name,category:candidate.category,
      quick:candidate.quick,minutes:candidate.minutes});
  });
  return Object.freeze([...base,...[...additions.values()].map(row=>Object.freeze(row))]);
}
export function focusDefaultSites(){
  return FOCUS_CATALOG.filter(row=>row.auto).map(row=>({
    host:row.host,subdomains:true,enabled:true,mode:'limit',
    minutes:FOCUS_DEFAULT_MINUTES,group:FOCUS_DEFAULT_GROUP
  }));
}
