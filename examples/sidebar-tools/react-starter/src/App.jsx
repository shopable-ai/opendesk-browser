import React,{useEffect,useState} from 'react';
import ActivityChart from './ActivityChart.jsx';

export default function App({request}){
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(true);
  const [status,setStatus]=useState('');

  useEffect(()=>{
    let active=true;
    request('storage.get',{key:'note'}).then(data=>{
      if(active){setNote(typeof data.value==='string'?data.value:'');setBusy(false);}
    },error=>{
      if(active){setStatus('读取失败：'+String(error.message||error));setBusy(false);}
    });
    return ()=>{active=false;};
  },[request]);

  async function save(){
    setBusy(true);
    setStatus('正在保存…');
    try {
      await request('storage.set',{key:'note',value:note});
      setStatus('已保存');
    } catch(error){
      setStatus('保存失败：'+String(error.message||error));
    } finally {
      setBusy(false);
    }
  }

  return <main className="tool-app">
    <section className="note-panel" aria-labelledby="react-note-heading">
      <h1 id="react-note-heading">React 笔记</h1>
      <p className="intro">React 组件与第三方图表库均随工具本地打包；只有点击保存才写入笔记。</p>
      <label className="field-label" htmlFor="note">笔记内容</label>
      <textarea id="note" value={note} onChange={event=>setNote(event.target.value)}
        placeholder="记录想法…" disabled={busy}/>
      <div className="note-actions">
        <button className="primary-button" type="button" onClick={save} disabled={busy}>
          {busy?'请稍候…':'保存笔记'}
        </button>
        {status?<span className="note-status" role="status" aria-live="polite">{status}</span>:null}
      </div>
    </section>
    <ActivityChart/>
  </main>;
}
