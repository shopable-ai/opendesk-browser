import {createElement as h,useEffect,useState} from 'react';

// The framework supplies React/ReactDOM; declared optional libraries expose
// axios + queryString only inside the authenticated USER_SCRIPT world.
// All user UI is managed by @opendesk/ui, including root.unmount() on Stop.
const css={
  panel:{font:'13px/1.5 system-ui,sans-serif',color:'#1b2c49',background:'#fff',
    width:'310px',maxWidth:'calc(100vw - 24px)',padding:'16px',border:'1px solid #dce5f4',
    borderRadius:'12px',boxShadow:'0 12px 36px #20345c33'},
  title:{fontSize:'15px',margin:'0 0 8px'},
  state:{fontSize:'12px',overflowWrap:'anywhere',margin:'6px 0'}
};
export default function App(){
  const [data,setData]=useState({stage:'loading',httpStatus:null,tag:'OpenDesk',html:false});
  useEffect(()=>{
    const abort=new AbortController();
    const params=queryString.parse('tag=OpenDesk&source=page-react');
    axios.get('/demo-form.html',{params,signal:abort.signal,responseType:'text',timeout:10000,
      withCredentials:false}).then(reply=>{
      if(!abort.signal.aborted)
        setData({stage:'loaded',httpStatus:reply.status,tag:String(params.tag),html:/<html/i.test(reply.data)});
    }).catch(error=>{
      if(!abort.signal.aborted)setData(prev=>({...prev,stage:'error: '+String(error?.message||error).slice(0,120)}));
    });
    // Existing managed UI root.unmount() invokes this abort on Stop.
    return ()=>abort.abort();
  },[]);
  return h('section',{'data-opendesk-example':'react-axios-query',style:css.panel,'aria-label':'多库 React 受管网页示例'},
    h('h2',{style:css.title},'OpenDesk React · Axios · query-string'),
    h('p',{style:css.state,'data-opendesk-state':data.stage},'请求状态：'+data.stage),
    h('p',{style:css.state},'请求参数：'+data.tag),
    h('p',{style:css.state},'HTTP：'+(data.httpStatus??'—')+' · HTML：'+data.html),
    h('p',{style:css.state},'在开发面板点击停止，撤销 React UI 和未完成请求。')
  );
}
