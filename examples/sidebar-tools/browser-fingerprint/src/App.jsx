import * as React from 'react';
import {Card,CardContent,Button,IconButton} from '@opendesk/ui';
import {FIELD_DEFINITIONS,makeReading,sameRuntimeTarget,
  snapshotFromReading,compareSnapshots,reportJson} from './model.js';
import {readHistory,saveSnapshot,deleteSnapshot} from './history.js';

const stamp=()=>new Date().toISOString();
const ident=()=>globalThis.crypto?.randomUUID?.()||
  ('fp-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const errorLabel=error=>{
  const labels={
    E_STORAGE_CONFLICT:'历史已被其他窗口更新，请重新读取；本次没有覆盖。',
    E_OUTCOME_UNKNOWN:'写入结果未知，必须重新读取核对，不能直接重试。',
    E_HISTORY_LIMIT:'已达本地存储上限，请导出并删除旧快照。',
    E_NO_TARGET:'当前网页不可用；请切换到普通 HTTP(S) 页面。',
    E_CONTEXT:'当前网页身份已失效，请重新检测。'
  };
  return labels[error?.code]||String(error?.message||error||'操作失败').slice(0,200);
};
function Glyph({name}){
  return <svg viewBox="0 0 24 24" width="17" height="17"
    fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name==='refresh'?<><path d="M20 11a8 8 0 0 0-14-5L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14 5l3-3"/><path d="M21 20v-5h-5"/></>:null}
    {name==='save'?<><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>:null}
    {name==='trash'?<><path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6m4-6v6"/></>:null}
    {name==='copy'?<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/></>:null}
    {name==='download'?<><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></>:null}
  </svg>;
}
const display=value=>value===null||value===undefined?'—':
  typeof value==='string'?value:JSON.stringify(value);
const stateName={same:'一致',changed:'变化',unverifiable:'无法验证',
  'source-different':'来源不同'};
const stampText=date=>{
  const n=Date.parse(date);
  return Number.isFinite(n)?new Date(n).toLocaleString('zh-CN'):'时间未知';
};
function FieldList({reading}){
  return <div className="fp-fields">
    {FIELD_DEFINITIONS.map(def=>{
      const item=reading?.fields?.find(x=>x.key===def.key);
      return <div className="fp-field" key={def.key}>
        <div className="fp-field-head"><strong>{def.label}</strong>
          <span className={'fp-status '+(item?.status==='available'?'fp-ok':'fp-unknown')}>
            {item?.status==='available'?'已读取':'不可验证'}</span></div>
        <div className="fp-value">{item?.status==='available'?display(item.value):'—'}</div>
        <div className="fp-source">{(item?.source==='host'?'可信 Host · 当前网页':item?.source==='page-js'?'目标网页 JS · 未开放':item?.source)||'尚未检测'}
          {item?.reason?' · '+(item.reason==='E_SDK'?'没有公开采集接口':item.reason):''}</div>
      </div>;
    })}
  </div>;
}
function Comparison({a,b}){
  if(!a||!b)return <p className="fp-empty">请从历史记录中选择两份快照。</p>;
  const rows=compareSnapshots(a,b);
  return <div className="fp-diff">
    {rows.map(row=><div className="fp-diff-row" key={row.key}>
      <div className="fp-field-head"><strong>{row.label}</strong>
        <span className={'fp-status fp-'+row.state}>{stateName[row.state]}</span></div>
      <div className="fp-compare-values">
        <div><small>基准</small><span>{row.left.status==='available'?display(row.left.value):'不可验证'}</span></div>
        <div><small>对照</small><span>{row.right.status==='available'?display(row.right.value):'不可验证'}</span></div>
      </div>
      {row.state==='source-different'?<p className="fp-source">采集来源不同，不宜直接比较</p>:null}
    </div>)}
  </div>;
}
export default function App({adapter,preview=false}){
  const [view,setView]=React.useState('detect');
  const [reading,setReading]=React.useState(null);
  const [history,setHistory]=React.useState([]);
  const [leftId,setLeftId]=React.useState('');
  const [rightId,setRightId]=React.useState('');
  const [busy,setBusy]=React.useState('');
  const [notice,setNotice]=React.useState({type:'info',text:'点击“检测”读取当前网页可信上下文。'});
  const revision=React.useRef(0),active=React.useRef(true);
  const operation=React.useRef(null); // guard before React state is committed
  React.useEffect(()=>{
    active.current=true;
    let alive=true;
    const seq=++revision.current;
    operation.current={seq,name:'history'};
    setBusy('history');
    readHistory(adapter.request).then(({history:row})=>{
      if(!alive||!active.current||revision.current!==seq)return;
      setHistory(row.items);
      setLeftId(row.items[0]?.id||'');
      setRightId(row.items[1]?.id||'');
      setNotice({type:'info',text:row.items.length?'已从本地存储读回历史。':'尚无已保存的快照。'});
    }).catch(error=>{
      if(alive&&active.current&&revision.current===seq)
        setNotice({type:'error',text:'历史读取失败：'+errorLabel(error)});
    }).finally(()=>{
      if(operation.current?.seq===seq)operation.current=null;
      if(alive&&revision.current===seq)setBusy('');
    });
    return ()=>{alive=false;active.current=false;revision.current++;};
  },[adapter]);
  const safeSet=(seq,fn)=>{if(active.current&&revision.current===seq)fn();};
  const begin=name=>{
    if(!active.current||operation.current)return null;
    const seq=++revision.current;
    operation.current={seq,name};
    setBusy(name);
    return seq;
  };
  const finish=seq=>{
    if(operation.current?.seq!==seq)return;
    operation.current=null;
    safeSet(seq,()=>setBusy(''));
  };
  const navigate=next=>{
    setView(next);
    // Switching tabs must not discard a pending storage result.
    if(next==='history'&&!operation.current)void refreshHistory();
  };
  async function refreshHistory(){
    const seq=begin('history');if(seq===null)return;
    try{
      const {history:row}=await readHistory(adapter.request);
      safeSet(seq,()=>{
        setHistory(row.items);
        setLeftId(current=>row.items.some(s=>s.id===current)?current:(row.items[0]?.id||''));
        setRightId(current=>row.items.some(s=>s.id===current)?current:(row.items[1]?.id||''));
        setNotice({type:'info',text:'历史已读回：'+row.items.length+' 条。'});
      });
    }catch(error){safeSet(seq,()=>setNotice({type:'error',text:errorLabel(error)}));}
    finally{finish(seq);}
  }
  async function detect(){
    const seq=begin('detect');if(seq===null)return;
    setReading(null);
    setNotice({type:'info',text:'正在通过可信 SDK 核验网页…'});
    try{
      const ctx=await adapter.context();
      const item=makeReading(ctx,{id:ident(),at:stamp(),preview});
      if(item.volatile.documentRef&&
        !sameRuntimeTarget(item,await adapter.context()))
        throw Object.assign(Error('检测期间网页身份发生变化，请重新检测'),{code:'E_CONTEXT'});
      safeSet(seq,()=>{
        setReading(item);
        setNotice({type:'warning',text:item.volatile.documentRef?
          '已读取 Host 页面字段；目标网页 JS 环境字段未开放，检测为部分完成。':
          '已读取部分页面字段，但缺少稳定文档引用，不能保存；请检查 SDK 支持。'});
      });
    }catch(error){safeSet(seq,()=>setNotice({type:'error',text:errorLabel(error)}));}
    finally{finish(seq);}
  }
  async function save(){
    if(!reading)return;
    const seq=begin('save');if(seq===null)return;
    try{
      const before=await adapter.context();
      if(!sameRuntimeTarget(reading,before))
        throw Object.assign(Error('网页可能已导航，或 SDK 未提供稳定的文档身份；拒绝保存旧读数'),{code:'E_CONTEXT'});
      const snapshot=snapshotFromReading(reading);
      const items=await saveSnapshot(adapter.request,snapshot);
      // Recheck identity after the write. The saved snapshot always belongs to
      // the original reading, never to any subsequent navigation.
      let same=false;
      try{same=sameRuntimeTarget(reading,await adapter.context());}catch{same=false;}
      safeSet(seq,()=>{
        setHistory(items);
        if(!same)setReading(null);
        setLeftId(snapshot.id);
        setRightId(items.find(row=>row.id!==snapshot.id)?.id||'');
        setNotice({type:same?'success':'warning',
          text:same?'部分证据已持久化并读回（环境字段仍不可用）。':
            '写入与读回已完成，但网页身份已变化；请重新检测，勿把旧快照当作新网页。'});
      });
    }catch(error){safeSet(seq,()=>{
      if(error?.code==='E_CONTEXT')setReading(null);
      setNotice({type:'error',text:errorLabel(error)});
    });}
    finally{finish(seq);}
  }
  async function remove(id){
    const seq=begin('delete');if(seq===null)return;
    try{
      const items=await deleteSnapshot(adapter.request,id);
      safeSet(seq,()=>{
        setHistory(items);
        if(leftId===id)setLeftId(items[0]?.id||'');
        if(rightId===id)setRightId(items[1]?.id||'');
        setNotice({type:'success',text:'已删除选中记录，并重新读回确认。'});
      });
    }catch(error){safeSet(seq,()=>setNotice({type:'error',text:errorLabel(error)}));}
    finally{finish(seq);}
  }
  const a=history.find(x=>x.id===leftId)||null;
  const b=leftId===rightId?null:history.find(x=>x.id===rightId)||null;
  async function output(kind){
    if(!a)return;
    const seq=begin(kind);if(seq===null)return;
    try{
      const text=reportJson(a,b,stamp());
      const result=kind==='copy'
        ?await adapter.request('clipboard.writeText',{text})
        :await adapter.request('file.download',{text,filename:'browser-fingerprint-qa.json'});
      if(kind==='copy'&&result?.copied!==true)
        throw Error('复制未收到可信成功回执');
      if(kind==='download'&&!Number.isInteger(result?.downloadId))
        throw Error('下载没有返回有效任务 ID');
      safeSet(seq,()=>setNotice({type:'success',text:kind==='copy'?
        '报告已复制。':preview?'离线预览已触发下载，不代表 Chrome Host 受理。':'Chrome 已受理文件下载，但尚不能证明真实落盘。'}));
    }catch(error){safeSet(seq,()=>setNotice({type:'error',text:errorLabel(error)}));}
    finally{finish(seq);}
  }
  return <main className="fp-app">
    <nav className="fp-tabs" aria-label="浏览器环境检测视图">
      {['detect','compare','history'].map((id,i)=>
        <button key={id} type="button" className={view===id?'active':''}
          aria-current={view===id?'page':undefined} onClick={()=>navigate(id)}>
          {['检测','对比','历史'][i]}</button>)}
    </nav>
    {preview?<p className="fp-preview-note">演示模式：SDK 为离线测试替身，非真实网页读数，记录仅用于预览。</p>:null}
    {notice.text?<p className={'fp-notice fp-'+notice.type} role="status" aria-live="polite">{notice.text}</p>:null}
    {view==='detect'?<>
      <Card><CardContent className="fp-card">
        <div className="fp-section-head"><strong>当前环境</strong><span className="fp-caption">{reading?.target.host||'尚未检测'}</span></div>
        <p className="fp-secondary">只读取经 Host 核验的当前网页上下文。不会修改 UA、时区、IP、代理或 Cookie。</p>
        <div className="fp-actions">
          <Button variant="primary" disabled={!!busy} onClick={()=>void detect()}>
            <Glyph name="refresh"/>检测当前网页</Button>
          <Button variant="secondary" disabled={!!busy||!reading?.volatile?.documentRef} onClick={()=>void save()}>
            <Glyph name="save"/>保存部分证据</Button>
        </div>
        {reading?<div className="fp-proof">
          <span>采集于 {stampText(reading.capturedAt)}</span>
          <span>{reading.target.identityLevel==='document-ref-observed'?'收到文档引用':'文档身份不可验证'}</span>
          <span>状态：部分完成</span>
        </div>:<p className="fp-empty">点击检测后显示每项真实来源与不可用原因。</p>}
      </CardContent></Card>
      <Card><CardContent className="fp-card"><strong>字段与来源</strong>
        <FieldList reading={reading}/>
      </CardContent></Card>
    </>:null}
    {view==='compare'?<>
      <Card><CardContent className="fp-card">
        <strong>选择两次记录</strong>
        <div className="fp-selects">
          <label>基准<select value={leftId} onChange={e=>setLeftId(e.target.value)}>
            <option value="">选择快照</option>
            {history.map(s=><option key={s.id} value={s.id}>{s.target.host+' · '+stampText(s.capturedAt)}</option>)}
          </select></label>
          <label>对照<select value={rightId} onChange={e=>setRightId(e.target.value)}>
            <option value="">选择快照</option>
            {history.map(s=><option key={s.id} value={s.id}>{s.target.host+' · '+stampText(s.capturedAt)}</option>)}
          </select></label>
        </div>
        {a&&b?<p className="fp-secondary">环境字段无法验证时，不会计入“一致”。</p>:null}
        <div className="fp-actions">
          <Button variant="secondary" disabled={!!busy||!a} onClick={()=>void output('copy')}>
            <Glyph name="copy"/>复制报告</Button>
          <Button variant="secondary" disabled={!!busy||!a} onClick={()=>void output('download')}>
            <Glyph name="download"/>导出 JSON</Button>
        </div>
      </CardContent></Card>
      <Card><CardContent className="fp-card"><strong>逐字段差异</strong>
        <Comparison a={a} b={b}/></CardContent></Card>
    </>:null}
    {view==='history'?<Card><CardContent className="fp-card">
      <div className="fp-section-head"><strong>本地历史（{history.length} / 5）</strong>
        <IconButton label="重新读取历史" title="刷新" disabled={!!busy}
          onClick={()=>void refreshHistory()}><Glyph name="refresh"/></IconButton></div>
      {!history.length?<p className="fp-empty">暂无快照。检测后保存部分证据即可开始对比。</p>:null}
      {history.map(s=><div className="fp-history-item" key={s.id}>
        <div className="fp-history-main"><strong>{s.target.host}</strong>
          <span>{stampText(s.capturedAt)} · {s.mode==='PREVIEW'?'演示':'部分证据'}</span></div>
        <div className="fp-history-actions">
          <button type="button" disabled={!!busy} onClick={()=>{
            setLeftId(s.id);setView('compare');}}>基准</button>
          <button type="button" disabled={!!busy} onClick={()=>{
            setRightId(s.id);setView('compare');}}>对照</button>
          <IconButton label={'删除 '+s.target.host+' 的快照'} title="删除" disabled={!!busy}
            onClick={()=>void remove(s.id)}><Glyph name="trash"/></IconButton>
        </div>
      </div>)}
      <p className="fp-secondary">每条历史都经过条件写入与读回校验；已达容量时不会悄悄清理旧项。</p>
    </CardContent></Card>:null}
  </main>;
}
