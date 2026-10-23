// Product-owned pure mutation rules migrated from the legacy privileged
// Focus service. The new Controller uses these functions in the app sandbox;
// no Chrome APIs, installer, Host authority or DNR commands are present here.
import {emptyFocus,focusSite,focusSiteScopesValid,focusSchedule} from './model.js';
import {FOCUS_MAX_SITES,focusHost,focusError} from './policy.js';
import {FOCUS_DEFAULT_GROUP,FOCUS_DEFAULT_MINUTES} from './catalog.js';
const hasOnly=(payload,names)=>payload&&typeof payload==='object'&&!Array.isArray(payload)&&
  Object.keys(payload).sort().join(',')===names.slice().sort().join(',');
const requirePayload=(value,names)=>{if(!hasOnly(value,names))
  throw focusError('专注设置参数不完整或无效');};
export function mutateFocusModel(state,operation,payload,at,defaultMinutes=FOCUS_DEFAULT_MINUTES){
    if(operation==='focus.enable'){
      requirePayload(payload,[]);
      state.enabled=true;
    }else if(operation==='focus.disable'){
      requirePayload(payload,[]);
      // Pausing all restrictions is not permission revocation.
      // Preserve the signed authorization so a later resume needs no Chrome prompt.
      state.enabled=false;state.checkpoint=null;state.focusUntil=null;
    }else if(operation==='focus.site.put'){
      requirePayload(payload,['site']);
      const raw=payload.site;if(!raw||typeof raw.host!=='string')throw focusError('请提供域名和额度');
      const site=focusSite({...raw,host:focusHost(raw.host)});
      if(site.group===FOCUS_DEFAULT_GROUP&&!Object.hasOwn(state.groups,FOCUS_DEFAULT_GROUP))
        state.groups[FOCUS_DEFAULT_GROUP]=defaultMinutes;
      if(site.group&&!Object.hasOwn(state.groups,site.group))throw focusError('请先创建共享额度组');
      const index=state.sites.findIndex(row=>row.host===site.host);
      if(index<0){if(state.sites.length>=FOCUS_MAX_SITES)throw focusError('最多可添加 60 个网站');state.sites.push(site);}
      else state.sites[index]=site;
      if(!focusSiteScopesValid(state.sites))
        throw focusError('包含子域名的父网站覆盖了精确子网站：请将子网站设为“包含子域名”，再保存','E_FOCUS_SCOPE_OVERLAP');
    }else if(operation==='focus.site.remove'){
      requirePayload(payload,['host']);
      const host=focusHost(payload.host);
      if(!host)throw focusError('域名无效');
      state.sites=state.sites.filter(row=>row.host!==host);
      delete state.usage['s:'+host];
    }else if(operation==='focus.group.put'){
      requirePayload(payload,['id','minutes']);
      const {id,minutes}=payload;
      if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,23}$/.test(id)||
        !Number.isInteger(minutes)||minutes<1||minutes>1440||
        (!Object.hasOwn(state.groups,id)&&Object.keys(state.groups).length>=20))
        throw focusError('共享额度组 ID 或分钟数无效');
      state.groups[id]=minutes;
    }else if(operation==='focus.group.remove'){
      requirePayload(payload,['id']);
      if(typeof payload.id!=='string'||!/^[a-z][a-z0-9-]{0,23}$/.test(payload.id)||
         state.sites.some(row=>row.group===payload.id))
        throw focusError('先解除网站与额度组的关联');
      delete state.groups[payload.id];delete state.usage['g:'+payload.id];
    }else if(operation==='focus.schedule.set'){
      requirePayload(payload,['schedule']);
      state.schedule=focusSchedule(payload.schedule);
    }else if(operation==='focus.whitelist.set'){
      requirePayload(payload,['hosts']);
      if(!Array.isArray(payload.hosts)||payload.hosts.length>50)
        throw focusError('白名单最多 50 个域名');
      const hosts=payload.hosts.map(focusHost);
      if(hosts.some(host=>!host)||new Set(hosts).size!==hosts.length)
        throw focusError('白名单域名重复或无效');
      state.whitelist=hosts;
    }else if(operation==='focus.session.start'){
      requirePayload(payload,['minutes']);
      if(!state.enabled)throw focusError('请先从可信设置开启网站限制','E_FOCUS_NOT_ENABLED');
      if(!Number.isInteger(payload.minutes)||payload.minutes<1||payload.minutes>240)
        throw focusError('专注时长必须在 1–240 分钟之间');
      state.focusUntil=at+payload.minutes*60000;
    }else if(operation==='focus.session.stop'){
      requirePayload(payload,[]);
      state.focusUntil=null;
    }else if(operation==='focus.clear'){
      requirePayload(payload,['confirm']);
      if(payload.confirm!==true)throw focusError('清空本机专注数据需要确认','E_FOCUS_CONFIRM');
      return emptyFocus(at);
    }else if(operation!=='focus.status')throw focusError('不支持的专注操作');
    if(!['focus.status','focus.enable','focus.disable'].includes(operation)){
      state.notices.revision++;
      state.notices.budgetMs=null;state.notices.thresholds=[];
    }
    return state;
  }
