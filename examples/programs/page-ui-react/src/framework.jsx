import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';

function Widget({onToggle}){
  const [message,setMessage]=useState('加载中…'),[active,setActive]=useState(false);
  useEffect(()=>{setMessage('已就绪');},[]);
  function act(){
    try{const result=onToggle();setActive(result.active);setMessage(result.message);}
    catch(error){setMessage('操作失败：'+String(error?.message||error));}
  }
  return <section className="r241-card" aria-label="OpenDesk React 网页工具">
    <strong>React · 网页增强</strong>
    <p>仅修改标准测试段落；再次点击撤销。</p>
    <button type="button" onClick={act}>{active?'撤销标记':'高亮段落'}</button>
    <span role="status" aria-live="polite">{message}</span>
  </section>;
}
export function mountReact(container,props){
  const root=createRoot(container);root.render(<Widget {...props}/>);return root;
}
