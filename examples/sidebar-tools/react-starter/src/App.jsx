import React,{useEffect,useState} from 'react';
export default function App({request}){
  const [note,setNote]=useState(''),[busy,setBusy]=useState(true),[status,setStatus]=useState('');
  useEffect(()=>{
    let active=true;
    request('storage.get',{key:'note'}).then(data=>{
      if(active){setNote(typeof data.value==='string'?data.value:'');setBusy(false);}
    },error=>{if(active){setStatus(String(error.message||error));setBusy(false);}});
    return ()=>{active=false;};
  },[request]);
  async function save(){
    setBusy(true);setStatus('正在保存…');
    try{await request('storage.set',{key:'note',value:note});setStatus('已保存');}
    catch(error){setStatus(String(error.message||error));}
    finally{setBusy(false);}
  }
  return <main className="tool-app"><h1>React 笔记</h1>
    <p>在侧栏或标签页使用同一个安装包；打开时只读取，写入需要点击。</p>
    <label htmlFor="note">笔记</label>
    <textarea id="note" value={note} onChange={event=>setNote(event.target.value)} disabled={busy}/>
    <button type="button" onClick={save} disabled={busy}>保存</button>
    <p role="status" aria-live="polite">{status}</p></main>;
}
