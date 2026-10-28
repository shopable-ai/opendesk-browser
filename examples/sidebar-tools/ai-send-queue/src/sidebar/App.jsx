import * as React from 'react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Card,CardContent,IconButton} from '@opendesk/ui';

const STATUS_TEXT={
  queued:'待发送',paused:'此条已暂停',sending:'发送中',unknown:'结果未知',waiting:'等待中'
};
const GLYPHS={
  refresh:'M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5',
  pause:'M8 5v14M16 5v14',
  resume:'M8 5l11 7-11 7V5Z',
  now:'M12 19V5m-6 6 6-6 6 6M4 20h16',
  edit:'M12 20h9M16 4l4 4-11 11H5v-4L16 4Z',
  remove:'M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5m4-5v5',
  up:'M12 5l-6 6m6-6 6 6M12 5v14',
  down:'M12 19l-6-6m6 6 6-6M12 19V5'
};
function Glyph({kind}){
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round"><path d={GLYPHS[kind]}/></svg>;
}
const empty={status:'loading',items:[]};
const errorText=error=>String(error?.message||'网页能力尚未就绪').slice(0,180);
function newer(previous,next){
  if(next?.status!=='ready')return next;
  if(previous?.status==='ready'&&
    previous.target?.documentId===next.target?.documentId&&
    previous.instance===next.instance&&previous.revision>next.revision)return previous;
  return next;
}

export default function App({request,hostRoot}){
  const [data,setData]=useState(empty);
  const [busy,setBusy]=useState('');
  const [notice,setNotice]=useState('');
  const [details,setDetails]=useState(false);
  const alive=useRef(false),pendingRead=useRef(false),pendingWrite=useRef(false),epoch=useRef(0);
  const current=useRef(empty);
  const apply=useCallback(next=>{
    setData(previous=>{
      const chosen=newer(previous,next);
      current.current=chosen;
      return chosen;
    });
  },[]);
  const refresh=useCallback(async()=>{
    if(!alive.current||pendingRead.current)return;
    pendingRead.current=true;
    const generation=epoch.current;
    try{
      const next=await request('sendQueue.snapshot',{});
      if(alive.current&&generation===epoch.current)apply(next);
    }catch(error){
      if(alive.current&&generation===epoch.current)
        apply({status:'unavailable',reason:errorText(error),items:[]});
    }finally{pendingRead.current=false;}
  },[request,apply]);
  useEffect(()=>{
    alive.current=true;
    const onPageChange=()=>{
      epoch.current++;
      apply(empty);
      void refresh();
    };
    hostRoot.addEventListener('opendesk-page-changed',onPageChange);
    void refresh();
    const timer=setInterval(()=>void refresh(),1000);
    return ()=>{
      alive.current=false;epoch.current++;
      clearInterval(timer);
      hostRoot.removeEventListener('opendesk-page-changed',onPageChange);
    };
  },[hostRoot,refresh,apply]);
  const command=async(name,row,index)=>{
    const snapshot=current.current;
    if(pendingWrite.current||snapshot.status!=='ready'||!row||
      snapshot.phase==='unknown')return;
    pendingWrite.current=true;setBusy(row.id+':'+name);setNotice('');
    try{
      const result=await request('sendQueue.command',{
        command:name,id:row.id,instance:snapshot.instance,revision:snapshot.revision,
        ...(name==='move'?{index}:{})
      });
      if(!alive.current)return;
      if(result.effect==='applied'){
        apply(result);
      }else{
        apply(result.status==='stale'?{...result,items:result.items||[]}:result);
        setNotice(result.reason||'操作未生效，已保留原队列');
      }
    }catch(error){
      if(alive.current)setNotice('操作结果需要核对：'+errorText(error)+'。不要重复点击，请先刷新。');
    }finally{
      pendingWrite.current=false;
      if(alive.current){setBusy('');void refresh();}
    }
  };
  const ready=data?.status==='ready';
  const disabled=Boolean(busy)||data.phase==='unknown';
  const rows=ready?data.items||[]:[];
  const active=rows.filter(row=>row.state!=='paused').length;
  const waiting=data.phase==='sending'?'正在发送':
    data.phase==='unknown'?'结果未知，请核对原对话':
    data.answerGate?'等待当前回复完成':active?'等待满足原生发送条件':'';
  return <main className="send-queue-app">
    <header className="send-queue-head">
      <div className="send-queue-context">
        <div className="send-queue-origin">ChatGPT · 当前对话</div>
        <div className="send-queue-route" title={ready?data.route||'':data.reason||''}>
          {ready?(data.route||'当前会话'):'等待识别网页'}
        </div>
      </div>
      <IconButton label="刷新实际网页队列" className="icon-button"
        disabled={Boolean(busy)} onClick={()=>void refresh()}><Glyph kind="refresh"/></IconButton>
    </header>
    {ready?
      <>
        <div className="send-queue-summary" aria-live="polite">
          <span>{rows.length} 条待处理</span>
          {waiting&&<span className={'send-queue-phase'+(data.phase==='unknown'?' is-unknown':'')}>{waiting}</span>}
        </div>
        {rows.length?
          <div className="send-queue-list">
            {rows.map((row,index)=>{
              const isSending=data.inFlight?.id===row.id||
                ['sending','unknown','waiting'].includes(row.state);
              const canAct=!disabled&&!isSending;
              const paused=row.state==='paused';
              return <Card key={row.id} className={'send-queue-row'+(paused?' is-paused':'')}>
                <CardContent>
                  <div className="send-queue-row-head">
                    <span className="send-queue-number">{index+1}</span>
                    <span className="send-queue-item-state">{STATUS_TEXT[row.state]||'待发送'}</span>
                    <span className="send-queue-length">{row.length} 字</span>
                  </div>
                  <p className="send-queue-message" title={row.text}>{row.text}</p>
                  <div className="send-queue-actions">
                    <IconButton label={paused?'恢复此条消息':'暂停此条消息'}
                      className="icon-button" disabled={!canAct}
                      onClick={()=>void command(paused?'resume':'pause',row)}>
                      <Glyph kind={paused?'resume':'pause'}/>
                    </IconButton>
                    <IconButton label="提前发送" className="icon-button"
                      disabled={!canAct||paused}
                      onClick={()=>void command('now',row)}><Glyph kind="now"/></IconButton>
                    <IconButton label="取回 ChatGPT 原生输入框编辑" className="icon-button"
                      disabled={!canAct} onClick={()=>void command('edit',row)}><Glyph kind="edit"/></IconButton>
                    <IconButton label="上移" className="icon-button"
                      disabled={!canAct||index===0}
                      onClick={()=>void command('move',row,index-1)}><Glyph kind="up"/></IconButton>
                    <IconButton label="下移" className="icon-button"
                      disabled={!canAct||index===rows.length-1}
                      onClick={()=>void command('move',row,index+1)}><Glyph kind="down"/></IconButton>
                    <span className="send-queue-action-space"/>
                    <IconButton label="删除此条消息" className="icon-button od-icon-button--danger"
                      disabled={!canAct} onClick={()=>void command('remove',row)}><Glyph kind="remove"/></IconButton>
                  </div>
                </CardContent>
              </Card>;
            })}
          </div>:<div className="send-queue-empty">当前对话没有待发送消息。请在 ChatGPT 输入框使用金冠按钮入队。</div>}
      </>:
      <div className="send-queue-empty" role="status">{data.status==='loading'?
        '正在读取当前网页队列…':
        data.reason||'无法连接网页队列。请检查 ChatGPT、Page 安装及授权。'}</div>
    }
    {notice&&<p className="send-queue-notice" role="status">{notice}</p>}
    <footer className="send-queue-footer">
      <button className="send-queue-detail-trigger" type="button"
        aria-expanded={details} onClick={()=>setDetails(value=>!value)}>
        {details?'收起运行说明':'运行说明'}
      </button>
      {details&&<p className="send-queue-footnote">队列只存于当前网页内存。刷新网页会清空队列；
        关闭侧栏不会停止网页发送。单条暂停不会影响其他消息。</p>}
    </footer>
  </main>;
}
