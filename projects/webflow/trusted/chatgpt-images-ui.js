import {IMAGE_PROTOCOL} from './chatgpt-images.js';

// Packaged first-party settings surface; never loaded into a sandbox tool.
export function initChatGPTImagesUI({doc=document,api=chrome}={}){
  doc.title='OpenDesk · 保存 ChatGPT 生成图片';
  const main=doc.createElement('main');main.className='settings-page';
  main.innerHTML=`<header class="settings-header"><div><h1>保存 ChatGPT 生成图片</h1><p>只处理你选择的完整生成图片。另存为时选择已授权目录和新文件。</p></div></header>
  <section class="settings-card"><h2>1. 选择来源与目标</h2>
  <label>ChatGPT 对话 <select id="image-source" aria-label="ChatGPT 对话"></select></label>
  <button id="image-refresh" class="secondary">刷新列表</button><button id="image-bind">读取完整图片列表</button>
  <p id="image-source-url"></p><label>生成图片 <select id="image-asset" aria-label="生成图片"></select></label>
  <label>已授权目录 <select id="image-workspace" aria-label="已授权目录"></select></label>
  <label>新文件相对路径 <input id="image-path" value="blue-cat.png" aria-label="新文件相对路径"></label>
  <p>仅 PNG/JPEG；不覆盖已有文件，不使用缩略图、截图、SVG 或模型提供的下载地址。</p>
  <button id="image-prepare">审阅以上范围并生成固定请求</button></section>
  <section class="settings-card"><h2>2. 原对话确认请求</h2><textarea id="image-prompt" readonly rows="8" aria-label="完整图片请求提示词"></textarea>
  <button id="image-fill-prompt">填入原对话草稿</button><p>在原对话核对并发送，等待完整回答。草稿回填不会自动发送。</p>
  <button id="image-save">核验模型回复并另存为</button><p>在 Chrome 另存为窗口选择上面的已授权目录，文件名须与相对路径一致。重名时请选择新路径并生成新请求，不替换已有文件。</p></section>
  <section class="settings-card"><h2>3. 核验与结果</h2><label>本页原请求 <select id="image-previous" aria-label="本页原请求"></select></label><button id="image-recover" class="secondary">恢复原请求（只查询）</button><button id="image-check">查询原下载并独立读回</button>
  <button id="image-fill-result">将真实结果填入原对话草稿</button><button id="image-observe" class="secondary">发送后核对送达</button>
  <pre id="image-result" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><p>下载完成且本机文件独立解码通过才显示 saved。超时或刷新后先查原下载，不重新保存。</p></section>
  <p id="image-status" role="status" aria-live="polite"></p><p><a href="settings.html">返回本机连接</a></p>`;
  doc.body.replaceChildren(main);
  const get=id=>doc.getElementById('image-'+id);let binding=null,requestId=null,busy=false;
  async function request(action,extra={}){
    const reply=await api.runtime.sendMessage({protocol:IMAGE_PROTOCOL,action,...extra});
    if(!reply?.ok)throw reply?.error||{message:'未收到可靠响应；请查询原操作，不要重新保存'};
    return reply.data;
  }
  function options(element,rows,value,label){
    element.replaceChildren();
    for(const row of rows){const option=doc.createElement('option');option.value=value(row);option.textContent=label(row);element.append(option);}
  }
  function show(row){
    if(row.prompt)get('prompt').value=row.prompt;
    if(row.request)requestId=row.request.requestId;
    get('result').textContent=JSON.stringify(row,null,2);
    get('status').textContent=row.phase==='verified'?'文件已独立解码核验。'+(row.delivery==='received'?'原对话已收到一次结果。':row.delivery==='draft'?'真实结果仍在原对话草稿，需发送。':'可将真实结果填入原对话草稿。'):'当前状态：'+row.phase;
  }
  function on(id,fn){get(id).addEventListener('click',async event=>{
    if(!event.isTrusted||busy)return;busy=true;get('status').textContent='正在处理…';
    try{await fn();}catch(error){get('status').textContent=(error.code?error.code+' · ':'')+(error.message||'操作失败');}
    finally{busy=false;}
  });}
  async function refresh(){
    const [sources,result,previous]=await Promise.all([request('sources'),request('workspaces'),request('requests')]);
    options(get('source'),sources,row=>row.tabId,row=>(row.title||'ChatGPT')+' · '+row.url);
    options(get('workspace'),result.workspaces,row=>row.workspaceId,row=>row.name+' · '+row.workspaceId);
    options(get('previous'),previous,row=>row.request.requestId,row=>row.request.path+' · '+row.phase+' · '+row.request.requestId);
    get('status').textContent='请选择具体来源、图片和授权目录。';
  }
  on('refresh',refresh);
  on('recover',async()=>show(await request('recover',{requestId:get('previous').value})));
  on('bind',async()=>{binding=await request('bind',{tabId:Number(get('source').value)});
    get('source-url').textContent=binding.source.url;
    options(get('asset'),binding.assets,row=>row.assetKey,row=>row.messageId+' · '+row.assetId+' · '+row.width+'×'+row.height);
    get('status').textContent='已读取完整图片列表；请选择具体图片。';});
  on('prepare',async()=>{if(!binding)throw {message:'先读取具体对话中的完整图片列表'};
    show(await request('prepare',{bindingId:binding.bindingId,assetKey:get('asset').value,workspaceId:get('workspace').value,path:get('path').value}));});
  for(const [id,action] of [['fill-prompt','fillPrompt'],['save','save'],['check','check'],['fill-result','fillResult'],['observe','observe']])
    on(id,async()=>{if(!requestId)throw {message:'请先生成固定请求；未知下载不得改 ID 重试'};show(await request(action,{requestId}));});
  // Opening is read-only: no grant, download or draft insertion.
  refresh().catch(error=>{get('status').textContent=error.message||'请先在本机连接设置中连接 Native。';});
}
