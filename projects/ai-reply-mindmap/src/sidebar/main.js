(() => {
  const bridge=globalThis.OpenDeskTool;
  const model=globalThis.OpenDeskMindmapSelectors;
  const get=id=>document.getElementById(id);
  const fields=get('fields'),form=get('rules'),connection=get('connection'),feedback=get('feedback');
  const inputs=Object.fromEntries(model.fields.map(field=>[field,form.elements.namedItem(field)]));
  const request=(op,payload)=>bridge.request(op,payload);
  let epoch=0,target=null,pending=false,saved=null,proof=null;
  const draft=()=>model.rule(Object.fromEntries(model.fields.map(field=>[field,inputs[field].value])));
  const update=()=>{
    fields.hidden=Boolean(target&&model.sites[target.origin].builtInOnly);
    fields.disabled=!target||pending||fields.hidden;
    get('save').disabled=!proof;
    get('reset').disabled=!saved;
    get('check').disabled=pending;
  };
  const tell=message=>{feedback.textContent=message;};
  function showRules(value){
    for(const field of model.fields){
      inputs[field].value=value?.[field]??'';
      inputs[field].placeholder=target?model.sites[target.origin][field]:'';
    }
    get('mode').textContent=value?'当前已保存自定义规则。':'当前使用内置定位；输入框中的提示只是选择器示例。';
  }
  const invoke=(operation,url,extra)=>request('page.request',{operation,payload:{url,...extra}});
  function message(error,fallback){
    if(error?.code==='E_APP_PAGE_RELOAD_REQUIRED')return '请保存网页草稿，刷新对话后重新检查。';
    if(error?.code==='E_STORAGE_CONFLICT')return '规则已被其他窗口修改。请重新检查后再操作。';
    return fallback;
  }
  async function check({preserve=false}={}){
    const seq=++epoch,old=target;
    target=null;saved=null;proof=null;pending=true;update();
    if(!preserve)tell('');
    connection.textContent='正在检查网页…';
    try{
      const info=await request('currentPage.info',{});
      if(seq!==epoch)return;
      const origin=info?.status==='available'&&model.siteFor(info.url);
      if(!origin){
        showRules(null);
        connection.textContent='请打开 ChatGPT、Gemini 或 DeepSeek 对话。';
        return;
      }
      const result=await invoke('mindmap.status',info.url);
      if(seq!==epoch)return;
      if(result?.origin!==origin||typeof result.reloadNeeded!=='boolean'||!Number.isInteger(result.ready)||
        !Number.isInteger(result.found)||result.ready<0||result.ready>result.found)
        throw Error('页面状态无效');
      saved=result.saved===null?null:model.rule(result.saved);
      target={url:info.url,origin};
      if(!preserve||target.url!==old?.url)showRules(saved);
      connection.textContent=model.sites[origin].name+' · '+(result.ready?'已定位 '+result.ready+' 条可转导图的回复':'暂未定位到可转导图的回复');
      if(model.sites[origin].builtInOnly)tell('DeepSeek 使用内置定位规则。');
      if(result.reloadNeeded)tell('规则已保存。请在合适时刷新当前对话，使规则生效。');
    }catch(error){
      if(seq!==epoch)return;
      connection.textContent=message(error,'无法连接网页。确认应用已安装并允许访问该网站，再重新检查。');
    }finally{
      if(seq===epoch){pending=false;update();}
    }
  }
  async function change(action){
    if(!target||model.sites[target.origin].builtInOnly||pending||action==='save'&&!proof||action==='reset'&&!saved)return;
    let rule;
    try{if(action!=='reset')rule=draft();}
    catch(error){proof=null;update();tell(error.message);return;}
    const seq=epoch,url=target.url,previousProof=proof;
    proof=null;pending=true;update();
    tell(action==='test'?'正在测试定位…':'正在保存…');
    try{
      const result=await invoke('mindmap.'+action,url,action==='reset'?{saved}:{rule,ticket:previousProof?.ticket??null});
      if(seq!==epoch)return;
      if(action==='test'){
        if(result?.status==='ready'&&typeof result.ticket==='string'&&Number.isInteger(result.ready)&&
          Number.isInteger(result.found)&&result.ready>0&&result.ready<=result.found){
          proof={ticket:result.ticket};
          tell('匹配 '+result.found+' 条助手回复，其中 '+result.ready+' 条可转导图。可以保存。');
        }else tell(result?.status==='invalid-css'?'CSS 选择器语法有误。':result?.status==='not-ready'?
          '匹配到回复，但还不能唯一定位正文和操作栏，或回复正在生成。请调整规则后重试。':
          '没有匹配的助手回复。请打开含已完成回复的对话并检查容器选择器。');
      }else{
        if(result?.saved===undefined||typeof result.reloadNeeded!=='boolean')throw Error('保存结果未确认');
        const stored=result.saved===null?null:model.rule(result.saved);
        if(action==='reset'?stored!==null:!model.fields.every(field=>stored?.[field]===rule[field]))
          throw Error('保存结果未确认');
        saved=stored;showRules(saved);
        tell((saved?'规则已保存。':'已恢复默认规则。')+(result.reloadNeeded?'请在合适时刷新当前对话，使规则生效。':''));
      }
    }catch(error){
      if(seq!==epoch)return;
      tell(message(error,action==='test'?'测试失败。请重新检查网页后再试。':'未能确认保存结果。请先重新检查已保存的规则。'));
      if(action!=='test'){target=null;saved=null;}
    }finally{
      if(seq===epoch){pending=false;update();}
    }
  }
  get('test').addEventListener('click',()=>void change('test'));
  form.addEventListener('input',()=>{proof=null;update();tell('修改后请重新测试。');});
  get('save').addEventListener('click',()=>void change('save'));
  get('reset').addEventListener('click',()=>void change('reset'));
  get('check').addEventListener('click',()=>void check());
  const onPageChanged=()=>void check();
  bridge?.root?.addEventListener('opendesk-page-changed',onPageChanged);
  window.addEventListener('pagehide',()=>{
    epoch++;
    bridge?.root?.removeEventListener('opendesk-page-changed',onPageChanged);
  },{once:true});
  void check();
})();
