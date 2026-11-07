import * as React from 'react';
import {Button} from '@opendesk/ui';
import {createLocalRunnerClient,isRunSettled} from './local-runner-client.js';
import {structureInputHash,validateStructure} from './capture-structure.js';

// The original runner owns the read. Its pointer never replaces collection data.
export default function CaptureStructure({binding,visible,disabled,prepare,onSample,onBusy}){
  const [client]=React.useState(()=>createLocalRunnerClient((op,args)=>globalThis.OpenDeskTool.request(op,args),
    {stateKey:'local-structure-state',modes:['structure']}));
  const [view,setView]=React.useState({run:null,pointer:null}),[working,setWorking]=React.useState(false);
  const [ready,setReady]=React.useState(false),[message,setMessage]=React.useState('');
  const current=React.useRef(binding);current.current=binding;
  const alive=React.useRef(true),operating=React.useRef(false),sequence=React.useRef(0);
  const shown=React.useRef(visible),delivery=React.useRef(null);
  if(shown.current!==visible){
    shown.current=visible;
    // Hiding this workspace does not unmount it. Retire the click immediately;
    // reopening cannot revive a start or sample delivery awaiting a receipt.
    if(!visible){++sequence.current;delivery.current=null;}
  }
  const active=Boolean(view.pointer&&!isRunSettled(view.run));
  React.useEffect(()=>{onBusy(working||active);},[working,active,onBusy]);
  function sync(){if(alive.current)setView({run:client.snapshot,pointer:client.pointer});}
  async function adopt(inputBinding,operation=sequence.current){
    const run=client.snapshot;
    if(!run||!isRunSettled(run))return;
    if(run.status!=='completed')throw Error(run.errors.map(x=>typeof x==='string'?x:x.code+': '+x.message).join('；')||'网页结构读取已停止。');
    const assertSnapshot=()=>{
      if(!alive.current||!shown.current||sequence.current!==operation||current.current!==inputBinding||client.pointer?.runId!==run.runId)
        throw Error('输入已变化或原结构任务已被替换，旧结构未采用；请重新读取。');
    };
    const hash=await structureInputHash(inputBinding);
    assertSnapshot();
    const target=prepare(),config={...target,inputHash:hash};
    const reply=await client.records(0,1);
    assertSnapshot();
    const sample={...validateStructure(run,reply,config),requestedUrl:run.config.url,runId:run.runId,requestId:run.requestId,configHash:run.configHash};
    onSample(sample,inputBinding);
    setMessage(sample.truncated?'已读取当前网页的有限结构，部分内容已省略；未发送 AI。':'已读取当前网页结构；未发送 AI。');
  }
  async function action(kind){
    if(operating.current)return;
    operating.current=true;setWorking(true);setMessage('');
    const inputBinding=current.current,operation=++sequence.current;
    delivery.current=kind==='stop'?null:{inputBinding,operation};
    const assertCurrent=()=>{if(!alive.current||!shown.current||sequence.current!==operation||current.current!==inputBinding)throw Error('输入或界面已变化，未创建新结构任务。');};
    try{
      if(kind==='start'){
        const config={...prepare(),inputHash:await structureInputHash(inputBinding)};
        assertCurrent();
        await client.start({requestId:crypto.randomUUID(),mode:'structure',config,previewPages:1,assertCurrent});
      }else if(kind==='stop')await client.stop();
      else await client.restore();
      if(kind!=='stop')await adopt(inputBinding,operation);
    }catch(error){if(alive.current)setMessage(error.message);}
    finally{operating.current=false;if(alive.current){sync();setWorking(false);}}
  }
  React.useEffect(()=>{
    alive.current=true;
    client.restore().catch(error=>{if(alive.current)setMessage(error.message);}).finally(()=>{if(alive.current){sync();setReady(true);}});
    return()=>{alive.current=false;++sequence.current;};
  },[client]);
  React.useEffect(()=>{
    if(!active||!visible)return;
    let disposed=false,reading=false;
    const timer=setInterval(async()=>{
      if(disposed||reading||operating.current)return;
      reading=true;const pending=delivery.current,operation=sequence.current;
      try{await client.refresh();if(!disposed&&alive.current){sync();if(pending&&pending.operation===sequence.current)await adopt(pending.inputBinding,pending.operation);}}
      catch(error){if(!disposed&&alive.current&&operation===sequence.current)setMessage(error.message);}
      finally{reading=false;}
    },1500);
    return()=>{disposed=true;clearInterval(timer);};
  },[active,client,binding,visible]);
  return <div className="runner-card" aria-label="读取公开网页结构">
    <div className="toolbar"><Button id="capture-read-structure" disabled={disabled||!ready||working||active} onClick={()=>action('start')}>读取网页结构</Button>
      {view.pointer&&<Button id="capture-structure-recover" disabled={working} onClick={()=>action('read')}>查询原结构任务</Button>}
      {active&&<Button id="capture-structure-stop" disabled={working} onClick={()=>action('stop')}>停止读取</Button>}</div>
    <p className="secondary">只读取一页公开静态内容，遵守网站限制；不会登录或发送 AI。</p>
    <p id="capture-structure-status" role="status">{working?'正在读取或核对原结构任务…':active?'原结构任务尚未确认退出；仅查询或停止，不重复创建。':message||'填写网址和需求后读取，无需粘贴 HTML。'}</p>
  </div>;
}
