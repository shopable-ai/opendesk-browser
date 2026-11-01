import * as React from 'react';
import {Button,IconButton,Textarea} from '@opendesk/ui';
import {valueText,columnKind,resultKeys,pageRows,resultIdentity,resultFeedback} from './results-model.js';
import ColumnSettings from './ColumnSettings.jsx';
import FieldOrder from './FieldOrder.jsx';
import './results.css';

function DownloadIcon(){return <svg className="scrapy-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" strokeLinecap="round" strokeLinejoin="round"/></svg>;}

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
    <div className="toolbar"><h2 className="od-page-title" id="record-detail-title">第 {index+1} 条 · 完整记录</h2><Button base="aria" autoFocus onClick={onClose}>关闭详情</Button></div>
    <label className="od-field-label" htmlFor="record-detail-text">完整 JSON（可选中文字复制）</label>
    <Textarea className="od-field scrapy-code" id="record-detail-text" readOnly value={text} rows={Math.min(16,Math.max(5,text.split('\n').length+1))} spellCheck={false}/>
    <Button base="aria" disabled={copying} onClick={copyRecord}>{copying?'正在复制…':'复制完整记录'}</Button>
    <p role="status">{copy}</p>
  </dialog>;
}

function ResultView({state,busy,app,displayKeys,onOrderChange,columnsLocked,active}) {
  const rows=Array.isArray(state.result?.data)?state.result.data:[];
  const feedback=resultFeedback(state,busy);
  const keys=resultKeys(rows);
  const [page,setPage]=React.useState(0);
  const [settingsOpen,setSettingsOpen]=React.useState(false);
  const [displayOpen,setDisplayOpen]=React.useState(false);
  const displayEntry=React.useRef(null),displayHeading=React.useRef(null);
  function closeDisplay(){setDisplayOpen(false);requestAnimationFrame(()=>displayEntry.current?.focus({preventScroll:true}));}
  React.useEffect(()=>{if(displayOpen&&active)displayHeading.current?.focus({preventScroll:true});},[displayOpen,active]);
  const [names,setNames]=React.useState({});
  const csvKeys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  const csvLabels=csvKeys.map(key=>(Object.hasOwn(names,key)?names[key].normalize('NFC').trim():'')||key);
  const duplicate=new Set(csvLabels).size!==csvLabels.length;
  function openSettings(){setNames({...state.config?.output?.fieldNames});setDownloadError('');setSettingsOpen(true);}
  const settingsEntry=React.useRef(null),settingsHeading=React.useRef(null);
  function closeSettings(){setSettingsOpen(false);requestAnimationFrame(()=>settingsEntry.current?.focus({preventScroll:true}));}
  React.useEffect(()=>{if(settingsOpen&&active)settingsHeading.current?.focus({preventScroll:true});},[settingsOpen,active]);
  const [detail,setDetail]=React.useState(null);
  const [downloading,setDownloading]=React.useState('');
  const downloadLock=React.useRef(false);
  const [downloadError,setDownloadError]=React.useState('');

  const columns=(displayKeys||keys).filter(key=>keys.includes(key)).map(key=>({key,label:key}));
  const slice=pageRows(rows,page);
  const summary=React.useRef(null);
  const activeDetail=detail && detail.text===JSON.stringify(rows[detail.index],null,2)?detail:null;
  React.useEffect(()=>{if(detail&&!activeDetail)setDetail(null);},[detail,activeDetail]);
  async function download(format,output){
    if(downloadLock.current)return;
    downloadLock.current=true;setDownloading(format);setDownloadError('');
    try{if(format==='csv')await app.download('csv',output);else await app.download();}
    catch(error){setDownloadError(error.message||'下载失败');}
    finally{downloadLock.current=false;setDownloading('');}
  }
  function turn(next){setPage(next);summary.current?.focus();}
  return <div className="scrapy-results">
    <div className="toolbar"><h2 className="od-page-title" id="result-heading">采集结果</h2><p ref={summary} tabIndex={-1} id="record-summary" className="secondary result-count" role="status">{state.result==null?'尚无记录':`共 ${rows.length} 条记录`}{rows.length>0?` · 显示 ${slice.start+1}–${slice.start+slice.rows.length} 条`:''}</p></div>
    {state.runProfile?.config&&JSON.stringify({...state.runProfile.config,output:undefined})!==JSON.stringify({...state.config,output:undefined})&&<p className="od-note secondary">结果来自上次运行；当前规则已有更改。</p>}
    <div className="result-tools" hidden={state.result==null}><div id="export-actions" className="toolbar" role="group" aria-label="下载完整采集结果">
      <Button base="aria" id="download-csv" aria-label="下载完整原始结果 CSV" disabled={!rows.length||Boolean(downloading)} onClick={()=>download('csv')}><DownloadIcon/>CSV</Button>
      <Button base="aria" id="download-json" aria-label="下载完整原始结果 JSON" disabled={Boolean(downloading)} onClick={()=>download('json')}><DownloadIcon/>JSON</Button>
      {rows.length>0&&keys.length>0&&<Button base="aria" id="edit-result-columns" ref={displayEntry} variant="quiet" aria-expanded={displayOpen} aria-controls={displayOpen?'result-display-settings':undefined} disabled={columnsLocked} onClick={()=>displayOpen?closeDisplay():setDisplayOpen(true)}>显示设置</Button>}
      {rows.length>0&&keys.length>0&&<Button base="aria" id="custom-csv" ref={settingsEntry} variant="quiet" aria-expanded={settingsOpen} aria-controls={settingsOpen?'custom-csv-settings':undefined} disabled={columnsLocked||Boolean(downloading)} onClick={()=>settingsOpen?closeSettings():openSettings()}><DownloadIcon/>自定义 CSV 表头</Button>}
    </div>
    {(downloading||downloadError||state.notice||state.error)&&<p className="scrapy-download-status" role={downloadError||state.error?'alert':'status'}>{downloading?'正在请求下载…':downloadError||state.error||state.notice}</p>}</div>
    {displayOpen&&rows.length>0&&<section id="result-display-settings" className="csv-export-settings" aria-labelledby="display-settings-heading" onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();event.stopPropagation();closeDisplay();}}}>
      <div className="toolbar"><h3 id="display-settings-heading" ref={displayHeading} tabIndex={-1}>显示设置</h3><Button base="aria" id="close-result-display" variant="quiet" onClick={closeDisplay}>完成</Button></div>
      <p className="secondary">拖动调整当前表格列顺序。仅本次使用，下载保留原始字段顺序。</p>
      <FieldOrder id="result-column-list" keys={columns.map(column=>column.key)} label="调整显示顺序：" locked={columnsLocked} active={active&&displayOpen} onOrderChange={onOrderChange}/>
      <Button base="aria" id="reset-result-order" variant="quiet" disabled={columnsLocked} onClick={()=>onOrderChange([])}>恢复默认顺序</Button>
    </section>}
    {settingsOpen&&rows.length>0&&<section id="custom-csv-settings" className="csv-export-settings" aria-labelledby="csv-settings-heading" onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();event.stopPropagation();closeSettings();}}}>
      <h3 id="csv-settings-heading" tabIndex={-1} ref={settingsHeading}>自定义 CSV 表头</h3>
      <p className="secondary">本次下载使用以下名称；只修改 CSV 第一行，数据内容和 JSON 保留原字段。</p>
      <ColumnSettings keys={csvKeys} names={names} onNamesChange={setNames} locked={columnsLocked||Boolean(downloading)}/>
      <div className="toolbar"><Button base="aria" id="download-custom-csv" variant="primary" disabled={columnsLocked||Boolean(downloading)||duplicate} onClick={()=>download('csv',{fieldNames:names})}><DownloadIcon/>下载 CSV</Button><Button base="aria" id="cancel-custom-csv" variant="quiet" disabled={Boolean(downloading)} onClick={closeSettings}>取消</Button></div>
      <p className="secondary">常用名称可在「采集规则 → CSV 表头」中预设并保存。</p>
    </section>}
    <p id="table-help" className="od-note secondary" hidden={!rows.length}>ⓘ 查看完整记录 · 下载保留全部原始数据</p>
    <div id="result-empty" className="empty-state" data-state={feedback.kind} role={feedback.kind==='error'?'alert':'status'} hidden={rows.length>0}>
      {['error','blocked'].includes(feedback.kind)?<svg className="empty-illustration" width="40" height="34" viewBox="0 0 40 34" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 4a2.3 2.3 0 0 1 4 0l15 25a2 2 0 0 1-2 3H5a2 2 0 0 1-2-3Z"/><path d="M20 12v9m0 4v1" strokeWidth="2" strokeLinecap="round"/></svg>:<svg className="empty-illustration" width="40" height="34" viewBox="0 0 56 48" fill="none" aria-hidden="true"><rect x="5" y="5" width="46" height="37" rx="6" stroke="currentColor" strokeWidth="1.5"/><path d="M5 17h46M20 17v25M32 17v25M5 29h46" stroke="currentColor" strokeWidth="1.5"/><path d="M12 11h3m6 0h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
      <strong>{feedback.heading}</strong>
      <p>{feedback.kind==='initial'?'点击开始采集，查看并下载记录。':feedback.message}</p>
    </div>
    {busy&&rows.length>0&&<p role="status">正在采集，当前显示已返回记录。</p>}
    {state.error&&rows.length>0&&<p role="alert" className="error">{state.error}</p>}
    <div id="record-scroll" className="table-scroll" data-fit={columns.length<=2&&!columns.some(column=>['url','description'].includes(columnKind(column.key)))} tabIndex={0} role="region" aria-label="采集记录，更多字段可横向滚动" aria-describedby="table-help" hidden={!rows.length}><table id="record-table"><caption className="sr-only">采集记录预览，第 {slice.page+1} / {slice.pages} 页</caption><thead><tr><th scope="col" className="scrapy-record-action"><span className="sr-only">完整记录</span></th>{columns.map(column=><th key={column.key} scope="col" className={'scrapy-col-'+columnKind(column.key)}>{column.key}</th>)}</tr></thead><tbody>{slice.rows.map((row,offset)=>{const index=slice.start+offset;return <tr key={index}><td className="scrapy-record-action"><IconButton label={'打开第 '+(index+1)+' 条完整记录'} title={'查看第 '+(index+1)+' 条完整记录'} onClick={event=>setDetail({index,text:JSON.stringify(row,null,2),origin:event.currentTarget})}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg></IconButton></td>{columns.map(column=>{const text=valueText(row?.[column.key]);return <td key={column.key} className={'scrapy-col-'+columnKind(column.key)}><span className={'scrapy-cell'+(text===''?' scrapy-empty':'')}>{!Object.hasOwn(row,column.key)?'（缺失）':row[column.key]===null?'（null）':text===''?'（空）':text}</span></td>;})}</tr>;})}</tbody></table></div>
    {rows.length>0&&slice.pages>1&&<nav className="toolbar" aria-label="记录分页"><Button base="aria" disabled={slice.page===0} onClick={()=>turn(slice.page-1)}>上一页</Button><span>第 {slice.page+1} / {slice.pages} 页</span><Button base="aria" disabled={slice.page===slice.pages-1} onClick={()=>turn(slice.page+1)}>下一页</Button></nav>}
    {activeDetail&&<RecordDetails key={activeDetail.index} {...activeDetail} onClose={()=>setDetail(null)}/>}
    <details id="run-details" className="od-disclosure od-disclosure--flat"><summary>运行详情与原始结果</summary>
      <div className="disclosure-body">
      <p id="run-profile" className="od-note secondary" hidden={!state.runProfile}>{state.runProfile?'本次运行配置：'+state.runProfile.name:''}{state.runProfile?.url&&' · '+state.runProfile.url}{state.runProfile?.startedAt&&' · '+new Date(state.runProfile.startedAt).toLocaleTimeString()}</p>
      <Button base="aria" id="refresh-run" disabled={!state.clientRequestId||state.retired} onClick={()=>app.refresh()}>刷新状态</Button>
      <dl className="status-grid"><dt>宿主</dt><dd id="host-status">{state.host}</dd><dt>引擎</dt><dd id="engine-status">{state.engine}</dd><dt>停止受理</dt><dd id="stop-status">{state.stopAccepted?'已受理':state.stopRequested?'已请求，等待确认':'未请求'}</dd><dt>实例退休</dt><dd id="retired-status">{state.retired?'已确认退休':busy?'尚未确认':'尚无运行'}</dd></dl>
      <pre id="result" tabIndex={0} aria-label="任务原始结果">{state.snapshot?JSON.stringify(state.snapshot,null,2):'尚无结果'}</pre>
      </div></details>
  </div>;
}

export default function Results({state,busy,app,displayKeys,onOrderChange,columnsLocked,active}) {
  return <ResultView key={resultIdentity(state)} state={state} busy={busy} app={app} displayKeys={displayKeys} onOrderChange={onOrderChange} columnsLocked={columnsLocked} active={active}/>;
}
