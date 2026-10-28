import * as React from 'react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Card,CardContent,IconButton} from '@opendesk/ui';
import {QUEUE_READ,QUEUE_WRITE,QUEUE_COMMANDS} from '../shared/queue-contract.js';

const STATUS_TEXT={
  queued:'待发送',paused:'已暂停',sending:'发送中',unknown:'结果未知',waiting:'等待中'
};
const GLYPHS={
  refresh:'M20 11a8 8 0 0 0-14.5-4.7L3 9m0-5v5h5M4 13a8 8 0 0 0 14.5 4.7L21 15m0 5v-5h-5',
  pause:'M8 5v14M16 5v14',
  resume:'M8 5l11 7-11 7V5Z',
  now:'M12 19V5m-6 6 6-6 6 6M4 20h16',
  edit:'M12 20h9M16 4l4 4-11 11H5v-4L16 4Z',
  remove:'M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5m4-5v5',
  up:'M12 5l-6 6m6-6 6 6M12 5v14',
  down:'M12 19l-6-6m6 6 6-6M12 19V5',
  more:'M5 12h.01M12 12h.01M19 12h.01'
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
  const [openMenu,setOpenMenu]=useState('');
  const menuRef=useRef(null);
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
      const next=await request(QUEUE_READ,{});
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
      setOpenMenu('');
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
  useEffect(()=>{
    if(!openMenu)return;
    const onPointerDown=event=>{
      if(!menuRef.current?.contains(event.target))setOpenMenu('');
    };
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();
        menuRef.current?.querySelector('button')?.focus();
        setOpenMenu('');
      }
    };
    hostRoot.addEventListener('pointerdown',onPointerDown,true);
    hostRoot.addEventListener('keydown',onKeyDown,true);
    return ()=>{
      hostRoot.removeEventListener('pointerdown',onPointerDown,true);
      hostRoot.removeEventListener('keydown',onKeyDown,true);
    };
  },[hostRoot,openMenu]);
  const command=async(name,row,index)=>{
    const snapshot=current.current;
    if(pendingWrite.current||snapshot.status!=='ready'||!row||
      snapshot.phase==='unknown'||!QUEUE_COMMANDS.includes(name))return;
    setOpenMenu('');
    pendingWrite.current=true;setBusy(row.id+':'+name);setNotice('');
    try{
      const result=await request(QUEUE_WRITE,{
        command:name,id:row.id,instance:snapshot.instance,revision:snapshot.revision,
        ...(name==='move'?{index}:{})
      });
      if(!alive.current)return;
      if(result.effect==='applied'){
        apply(result);
      }else{
        apply(result.status==='stale'?{...result,items:result.items||[]}:result);
        setNotice(result.reason||'操作未生效，请核对实际队列');
      }
    }catch(error){
      if(alive.current)setNotice('操作结果未确认：'+errorText(error)+'。请先刷新核对，勿重复操作。');
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
    data.phase==='unknown'?'发送结果未知 · 请核对原对话':
    data.answerGate?'等待回复完成':active?'等待可安全发送':'';
  const unavailable=data.status==='loading'?'正在连接当前对话…':
    data.reason||'请打开 ChatGPT 对话，并确认网页程序已安装和授权。';
  return <main className="send-queue-app" aria-busy={Boolean(busy)}>
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
              const expanded=openMenu===row.id;
              const options=[
                {name:'edit',label:'取回输入框编辑',kind:'edit'},
                {name:'move',label:'上移',kind:'up',index:index-1,disabled:index===0},
                {name:'move',label:'下移',kind:'down',index:index+1,disabled:index===rows.length-1},
                {name:'remove',label:'删除此条',kind:'remove',danger:true}
              ];
              return <Card key={row.id} className={'send-queue-row'+(paused?' is-paused':'')}>
                <CardContent>
                  <div className="send-queue-row-layout">
                    <span className="send-queue-number" aria-label={'第 '+(index+1)+' 条'}>{index+1}</span>
                    <div className="send-queue-row-body">
                      <div className="send-queue-row-head">
                        <span className={'send-queue-item-state state-'+row.state}>{STATUS_TEXT[row.state]||'待发送'}</span>
                        <span className="send-queue-length">{row.length} 字</span>
                      </div>
                      <p className="send-queue-message" title={row.text}>{row.text}</p>
                    </div>
                    <div className="send-queue-primary-actions">
                      <IconButton label={paused?'恢复此条消息':'暂停此条消息'}
                        className="icon-button" disabled={!canAct}
                        onClick={()=>void command(paused?'resume':'pause',row)}>
                        <Glyph kind={paused?'resume':'pause'}/>
                      </IconButton>
                      <IconButton label="提前发送" className="icon-button"
                        disabled={!canAct||paused}
                        onClick={()=>void command('now',row)}><Glyph kind="now"/></IconButton>
                      <div className="send-queue-more-wrap" ref={expanded?menuRef:null}>
                        <IconButton label="更多操作" className="icon-button send-queue-more"
                          aria-expanded={expanded} aria-controls={'send-queue-menu-'+row.id}
                          disabled={!canAct}
                          onClick={()=>setOpenMenu(value=>value===row.id?'':row.id)}>
                          <Glyph kind="more"/>
                        </IconButton>
                        {expanded&&<div className="send-queue-menu" id={'send-queue-menu-'+row.id}
                          role="group" aria-label={'第 '+(index+1)+' 条消息操作'}>
                          {options.map((option,i)=>
                            <button key={option.name+':'+i} type="button"
                              className={'send-queue-menu-action'+(option.danger?' is-danger':'')}
                              disabled={!canAct||option.disabled}
                              onClick={()=>void command(option.name,row,option.index)}>
                              <Glyph kind={option.kind}/><span>{option.label}</span>
                            </button>
                          )}
                        </div>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>;
            })}
          </div>:<div className="send-queue-empty">暂无待发送消息。在 ChatGPT 输入框点击皇冠即可入队。</div>}
      </>:
      <div className="send-queue-empty" role="status">{unavailable}</div>
    }
    {notice&&<p className="send-queue-notice" role="status">{notice}</p>}
  </main>;
}
