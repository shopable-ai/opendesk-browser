import * as React from 'react';
import {Button} from '@opendesk/ui';
import {valueText,columnKind,kindLabels,resultKeys,pageRows,resultIdentity,emptyMessage} from './results-model.js';
import './results.css';

function RecordDetails({text,index,onClose,origin}) {
  const dialog=React.useRef(null);
  const alive=React.useRef(true);
  const [copy,setCopy]=React.useState('');
  const [copying,setCopying]=React.useState(false);
  React.useEffect(()=>{
    alive.current=true;
    dialog.current.showModal();
    return ()=>{alive.current=false;if(origin?.isConnected)origin.focus();};
  },[origin]);
  async function copyRecord(){
    setCopying(true);
    try{
      if(!globalThis.OpenDeskTool?.request)throw Error('当前环境未提供复制服务');
      if(new TextEncoder().encode(text).length>150000)throw Error('完整记录超过复制服务上限，请选中文字手动复制');
      const receipt=await globalThis.OpenDeskTool.request('browser.clipboard.writeText',{text});
      if(receipt?.copied!==true)throw Error('复制未确认，请选中文字手动复制');
      if(alive.current)setCopy('已复制完整记录');
    }catch(error){if(alive.current)setCopy('复制失败：'+error.message+'。可选中下方文本手动复制。');}
    finally{if(alive.current)setCopying(false);}
  }
  return <dialog className="scrapy-results-dialog" ref={dialog} aria-labelledby="record-detail-title" onCancel={event=>{event.preventDefault();onClose();}} onClose={onClose}>
    <div className="toolbar"><h2 id="record-detail-title">第 {index+1} 条 · 完整记录</h2><Button autoFocus onClick={onClose}>关闭详情</Button></div>
    <label htmlFor="record-detail-text">完整 JSON（可选中文字复制）</label>
    <textarea id="record-detail-text" readOnly value={text} rows={16} spellCheck={false}/>
    <Button disabled={copying} onClick={copyRecord}>{copying?'正在复制…':'复制完整记录'}</Button>
    <p role="status">{copy}</p>
  </dialog>;
}

function ResultView({state,busy,app}) {
  const rows=Array.isArray(state.result?.data)?state.result.data:[];
  const keys=resultKeys(rows);
  const [preferences,setPreferences]=React.useState([]);
  const [page,setPage]=React.useState(0);
  const [detail,setDetail]=React.useState(null);
  const available=[...preferences.filter(column=>keys.includes(column.key)),...keys.filter(key=>!preferences.some(column=>column.key===key)).map(key=>({key,label:key,visible:true}))];
  const columns=available.filter(column=>column.visible);
  const slice=pageRows(rows,page);
  const summary=React.useRef(null);
  const activeDetail=detail && detail.text===JSON.stringify(rows[detail.index],null,2)?detail:null;
  React.useEffect(()=>{if(detail&&!activeDetail)setDetail(null);},[detail,activeDetail]);
  function change(key,patch){setPreferences(available.map(column=>column.key===key?{...column,...patch}:column));}
  function move(key,direction){const next=[...available],index=next.findIndex(column=>column.key===key);[next[index],next[index+direction]]=[next[index+direction],next[index]];setPreferences(next);}
  function turn(next){setPage(next);summary.current?.focus();}
  return <div className="scrapy-results">
    <div className="toolbar"><h2 id="result-heading">采集结果</h2><p ref={summary} tabIndex={-1} id="record-summary" className="secondary" role="status">{state.result==null?'尚无记录':`共 ${rows.length} 条记录`}{rows.length>0?` · 显示 ${slice.start+1}–${slice.start+slice.rows.length} 条`:''}</p></div>
    <p id="run-profile" className="secondary">{state.runProfile?'本次运行配置：'+state.runProfile.name:'尚无运行'}{state.runProfile?.url&&' · '+state.runProfile.url}{state.runProfile?.startedAt&&' · '+new Date(state.runProfile.startedAt).toLocaleTimeString()}</p>
    {state.runProfile?.config&&JSON.stringify(state.runProfile.config)!==JSON.stringify(state.config)&&<p className="secondary">结果来自上次运行；当前规则已有更改。</p>}
    <div id="export-actions" className="toolbar" role="group" aria-label="导出采集结果" hidden={state.result==null}><Button id="download-csv" disabled={!Array.isArray(state.result?.data)} onClick={()=>app.download('csv')}>下载 CSV</Button><Button id="download-json" onClick={()=>app.download()}>下载完整 JSON</Button></div>
    {keys.length>0&&<details className="flat"><summary>显示列 · {columns.length} / {keys.length}</summary><p className="secondary">列设置仅影响预览；下载保留全部原始字段与记录。</p><Button onClick={()=>setPreferences([])}>恢复默认列</Button><ol className="scrapy-column-list">{available.map((column,index)=><li key={column.key}>
      <label className="check"><input type="checkbox" checked={column.visible} onChange={event=>change(column.key,{visible:event.target.checked})}/>{column.key} <span className="scrapy-kind">{kindLabels[columnKind(column.key)]}</span></label>
      <label>显示名称<input value={column.label} aria-label={column.key+' 显示名称'} onChange={event=>change(column.key,{label:event.target.value})}/></label>
      <div className="toolbar"><Button disabled={index===0} aria-label={'上移 '+column.key} onClick={()=>move(column.key,-1)}>上移</Button><Button disabled={index===available.length-1} aria-label={'下移 '+column.key} onClick={()=>move(column.key,1)}>下移</Button></div>
    </li>)}</ol></details>}
    <p id="table-help" className="secondary" hidden={!rows.length}>单元格显示两行摘要；打开记录详情查看并复制完整值。左右滚动查看其他列。</p>
    <p id="result-empty" className="empty-state" role="status" hidden={rows.length>0}>{emptyMessage(state,busy)}</p>
    {busy&&rows.length>0&&<p role="status">正在采集，当前显示已返回记录。</p>}
    {state.error&&<p role="alert" className="error">{state.error}</p>}
    <div id="record-scroll" className="table-scroll" tabIndex={0} role="region" aria-label="采集记录，更多字段可横向滚动" aria-describedby="table-help" hidden={!rows.length}><table id="record-table"><caption className="sr-only">采集记录预览，第 {slice.page+1} / {slice.pages} 页</caption><thead><tr><th scope="col" className="scrapy-record-action">记录</th>{columns.map(column=><th key={column.key} scope="col" className={'scrapy-col-'+columnKind(column.key)}>{column.label.trim()||column.key}{column.label.trim()!==column.key&&<span className="scrapy-kind">{column.key}</span>}<span className="scrapy-kind">{kindLabels[columnKind(column.key)]}</span></th>)}</tr></thead><tbody>{slice.rows.map((row,offset)=>{const index=slice.start+offset;return <tr key={index}><td className="scrapy-record-action"><Button aria-label={'打开第 '+(index+1)+' 条完整记录'} onClick={event=>setDetail({index,text:JSON.stringify(row,null,2),origin:event.currentTarget})}>详情 {index+1}</Button></td>{columns.map(column=>{const text=valueText(row?.[column.key]);return <td key={column.key} className={'scrapy-col-'+columnKind(column.key)}><span className={'scrapy-cell'+(text===''?' scrapy-empty':'')}>{!Object.hasOwn(row,column.key)?'（缺失）':row[column.key]===null?'（null）':text===''?'（空）':text}</span></td>;})}</tr>;})}</tbody></table></div>
    {rows.length>0&&<nav className="toolbar" aria-label="记录分页"><Button disabled={slice.page===0} onClick={()=>turn(slice.page-1)}>上一页</Button><span>第 {slice.page+1} / {slice.pages} 页</span><Button disabled={slice.page===slice.pages-1} onClick={()=>turn(slice.page+1)}>下一页</Button></nav>}
    {activeDetail&&<RecordDetails key={activeDetail.index} {...activeDetail} onClose={()=>setDetail(null)}/>}
    <details id="run-details" className="flat"><summary>运行详情与原始结果</summary><Button id="refresh-run" disabled={!state.clientRequestId||state.retired} onClick={()=>app.refresh()}>刷新状态</Button>
      <dl className="status-grid"><dt>宿主</dt><dd id="host-status">{state.host}</dd><dt>引擎</dt><dd id="engine-status">{state.engine}</dd><dt>停止受理</dt><dd id="stop-status">{state.stopAccepted?'已受理':state.stopRequested?'已请求，等待确认':'未请求'}</dd><dt>实例退休</dt><dd id="retired-status">{state.retired?'已确认退休':busy?'尚未确认':'尚无运行'}</dd></dl>
      <pre id="result" tabIndex={0} aria-label="任务原始结果">{state.snapshot?JSON.stringify(state.snapshot,null,2):'尚无结果'}</pre>
    </details>
  </div>;
}

export default function Results({state,busy,app}) {
  return <ResultView key={resultIdentity(state)} state={state} busy={busy} app={app}/>;
}
