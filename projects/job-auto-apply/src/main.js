(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  if(!tool?.root||typeof tool.request!=='function')return;
  const {root,request}=tool;
  const el=id=>root.querySelector('#'+id);
  const DEFAULT={
    roles:'Android,前端,全栈',cities:'',salary:0,exclude:'培训,外包,驻场',
    skills:'',excludeHeadhunters:true,excludeContacted:true,
    template:'您好，我关注到贵司的{岗位}岗位，希望进一步了解具体职责和团队要求，方便沟通吗？'
  };
  const VALID_ETAG=/^[a-f0-9]{64}$/;
  const MAX_QUEUE=24;
  let prefs={...DEFAULT},prefsEtag='',queue=[],queueEtag='',jobs=[],view='jobs';
  let busy=false,ready=false,closed=false,dirty=false,scanId=0,reviewJob=null;
  let scanInFlight=false,writeLocked=false;
  const normalizeId=value=>{const id=trim(value,105).replace(/\.html$/i,'');return /^[a-z0-9_-]{6,100}$/i.test(id)?id:'';};
  const tokens=value=>String(value||'').split(/[\s,，、;；|]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const trim=(value,size=120)=>String(value??'').trim().slice(0,size);
  const display=(message='',kind='info')=>{el('ja-status').textContent=message;el('ja-status').dataset.state=kind;};
  const getPrefs=()=>({
    roles:trim(el('ja-roles').value,160),cities:trim(el('ja-cities').value,120),
    salary:Number(el('ja-salary').value)||0,exclude:trim(el('ja-exclude').value,200),
    skills:trim(el('ja-skills').value,200),
    excludeHeadhunters:el('ja-headhunters').checked,excludeContacted:el('ja-contacted').checked,
    template:trim(el('ja-template').value,500)
  });
  const fillPrefs=()=>{for(const [field,id] of Object.entries({
    roles:'ja-roles',cities:'ja-cities',salary:'ja-salary',exclude:'ja-exclude',
    skills:'ja-skills',template:'ja-template'
  }))el(id).value=prefs[field];
    el('ja-headhunters').checked=prefs.excludeHeadhunters!==false;
    el('ja-contacted').checked=prefs.excludeContacted!==false;
  };
  function evaluate(job,policy){
    const title=trim(job.title).toLowerCase(),all=[job.title,job.company,job.description,job.location].join(' ').toLowerCase();
    const reasons=[],reject=[],uncertain=[];
    if(policy.excludeContacted!==false&&job.contactState==='already_contacted')reject.push('页面标注已沟通，默认避免再次联系');
    if(policy.excludeHeadhunters!==false&&job.recruiterType==='headhunter')reject.push('页面明确标注猎头');
    const excluded=tokens(policy.exclude).find(word=>all.includes(word));
    if(excluded)reject.push('命中排除词：'+excluded);
    const roles=tokens(policy.roles);
    if(roles.length&& !roles.some(word=>title.includes(word)))reject.push('职位名称不符合意向岗位');
    else reasons.push('岗位名称符合意向');
    const cities=tokens(policy.cities);
    if(cities.length&&job.location&&!cities.some(word=>String(job.location).toLowerCase().includes(word)))
      reject.push('城市不在意向范围');
    if(cities.length&&!job.location)uncertain.push('职位城市未知');
    const skills=tokens(policy.skills).filter(word=>all.includes(word));
    if(skills.length)reasons.push('匹配技能：'+skills.slice(0,3).join('、'));
    const salary=String(job.salary||'').match(/(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)\s*[kK]/);
    if(policy.salary>0&&salary&&Number(salary[2])<policy.salary)reject.push('薪资上限低于最低期望');
    else if(policy.salary>0&&!salary)uncertain.push('薪资范围无法识别');
    else if(salary)reasons.push('薪资范围已识别');
    if(!job.id)uncertain.push('缺少稳定职位 ID，禁止加入待审队列');
    if(!job.experience)uncertain.push('经验要求未识别');
    if(!job.education)uncertain.push('学历要求未识别');
    if(job.descriptionScope!=='full_jd')uncertain.push('仅有职位卡片摘要，完整 JD 未核实');
    if(!job.activity)uncertain.push('HR 活跃度未识别');
    const score=reject.length?0:Math.min(100,55+(roles.length?20:0)+Math.min(3,skills.length)*5+
      (cities.length&&job.location?5:0)+(salary?5:0));
    return {score,rejected:reject.length>0,needsReview:uncertain.length>0,
      reasons:[...reject,...reasons,...uncertain.map(x=>'待核实：'+x)],skills:skills.slice(0,3)};
  }
  function node(tag,cls,value){
    const n=root.ownerDocument.createElement(tag);
    if(cls)n.className=cls;
    if(value!==undefined)n.textContent=value;
    return n;
  }
  function makeButton(label,action,primary=false){
    const b=node('button','od-button '+(primary?'od-button--primary':'od-button--secondary'),label);
    b.type='button';b.disabled=busy||!ready;b.addEventListener('click',action);return b;
  }
  function renderCard(job,fromQueue=false){
    const match=evaluate(job,prefs),card=node('article','ja-job');
    const head=node('div','ja-job-head');
    head.append(node('span','ja-job-title',job.title||'未识别职位'));
    head.append(node('span','ja-score',match.rejected?'排除':match.needsReview?match.score+' 分 · 待核实':match.score+' 分'));
    card.append(head,node('div','ja-meta',[job.company,job.salary,job.location].filter(Boolean).join(' · ')||'信息待核对'));
    const facts=[job.experience,job.education,job.recruiter&&'招聘者：'+job.recruiter,job.activity&&'活跃：'+job.activity]
      .filter(Boolean).join(' · ');
    if(facts)card.append(node('div','ja-meta',facts));
    const list=node('ul','ja-reasons');
    for(const reason of match.reasons.slice(0,5))list.append(node('li','',reason));
    card.append(list);
    const actions=node('div','ja-actions');
    if(!fromQueue&&!match.rejected&&job.id){
      const saved=queue.some(x=>normalizeId(x.id)===normalizeId(job.id));
      const add=makeButton(saved?'已在待审清单':'加入待审核',()=>void enqueue(job));
      add.disabled=saved||busy||!ready||writeLocked;actions.append(add);
    }
    if(!match.rejected&&job.id){
      actions.append(makeButton('准备沟通草稿',()=>openDraft(job),true));
    }
    if(fromQueue){const remove=makeButton('移出清单',()=>void removeJob(job.id));remove.disabled=writeLocked||busy||!ready;actions.append(remove);}
    card.append(actions);return card;
  }
  function render(){
    for(const key of ['jobs','queue','settings']){
      el('ja-'+key).hidden=view!==key;
      const b=root.querySelector('[data-view="'+key+'"]');
      if(view===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      b.disabled=busy||!ready;
    }
    el('ja-queue-count').textContent=String(queue.length);
    el('ja-scan').disabled=busy||!ready;
    el('ja-save-prefs').disabled=busy||!ready||!dirty||writeLocked;
    el('ja-scan-count').textContent=jobs.length?jobs.length+' 条已读取':'尚无结果';
    const container=el('ja-list');container.replaceChildren();
    const filtered=[...jobs].map(job=>({job,rank:evaluate(job,prefs)}))
      .sort((a,b)=>Number(a.rank.rejected)-Number(b.rank.rejected)||b.rank.score-a.rank.score);
    for(const {job} of filtered)container.append(renderCard(job));
    el('ja-jobs-empty').hidden=jobs.length>0;
    const history=el('ja-queue-list');history.replaceChildren();
    for(const job of queue)history.append(renderCard(job,true));
    el('ja-queue-empty').hidden=queue.length>0;
    if(reviewJob&&queue.every(x=>x.id!==reviewJob.id)&&!jobs.some(x=>x.id===reviewJob.id)){
      reviewJob=null;el('ja-review').hidden=true;
    }
    tool.setState?.({dirty,busy});
  }
  async function load(){
    try{
      const [p,q]=await Promise.all([
        request('storage.get',{key:'preferences',withEtag:true}),
        request('storage.get',{key:'review-queue',withEtag:true})
      ]);
      if(!VALID_ETAG.test(p?.etag)||!VALID_ETAG.test(q?.etag))throw Error('当前 Host 不支持安全存储版本');
      if(p.value!==null&&(!p.value||typeof p.value!=='object'||Array.isArray(p.value)))
        throw Error('匹配规则数据不合法，已拒绝覆盖');
      if(q.value!==null&&(!Array.isArray(q.value)||q.value.length>MAX_QUEUE||
        !q.value.every(x=>typeof x?.id==='string'&&typeof x?.title==='string')))
        throw Error('待审核清单数据不合法，已拒绝覆盖');
      prefs={...DEFAULT,...(p.value||{})};
      queue=(q.value||[]).map(item=>({...item,...normalize(item),addedAt:item.addedAt,status:item.status||'pending_review'}));
      if(queue.some(item=>!item.id))throw Error('存在无法验证身份的历史岗位，请先备份并核对数据');
      prefsEtag=p.etag;queueEtag=q.etag;
      fillPrefs();ready=true;display('已加载本地偏好。打开 BOSS 职位列表后点击扫描。');
    }catch(error){display('初始化失败：'+trim(error.message,160),'error');}
    render();
  }
  async function savePrefs(){
    if(!ready||busy||!dirty||writeLocked)return;
    const next=getPrefs();
    if(next.salary<0||next.salary>200||!Number.isInteger(next.salary)){
      display('最低月薪必须是 0–200 的整数','error');return;
    }
    busy=true;render();
    try{
      const result=await request('storage.set',{key:'preferences',value:next,ifMatch:prefsEtag});
      if(result?.saved!==true||!VALID_ETAG.test(result.etag))throw Error('保存回执不完整');
      prefs=next;prefsEtag=result.etag;dirty=JSON.stringify(getPrefs())!==JSON.stringify(next);
      display('匹配规则已保存','success');
    }catch(error){writeLocked=true;display('保存失败或结果未知。当前会话已锁定写入；重新打开应用核对数据后再操作：'+trim(error.message,100),'error');}
    finally{busy=false;render();}
  }
  async function persistQueue(next){
    if(busy||!ready||writeLocked)return;
    if(next.length>MAX_QUEUE){display('待审清单已满，请先移除旧岗位，不会自动丢弃','error');return;}
    const bytes=new TextEncoder().encode(JSON.stringify(next)).byteLength;
    if(bytes>7500){display('本地清单超出存储额度，请先移除旧岗位','error');return;}
    busy=true;render();
    try{
      const result=await request('storage.set',{key:'review-queue',value:next,ifMatch:queueEtag});
      if(result?.saved!==true||!VALID_ETAG.test(result.etag))throw Error('保存回执不完整');
      queue=next;queueEtag=result.etag;display('待审核清单已保存；尚未发送任何沟通消息','success');
    }catch(error){writeLocked=true;display('清单写入失败或结果未知，当前会话已锁定写入。重新打开应用核对：'+trim(error.message,100),'error');}
    finally{busy=false;render();}
  }
  function normalize(job){
    if(!job||typeof job!=='object')return null;
    return {id:normalizeId(job.id),title:trim(job.title,110),company:trim(job.company,100),
      salary:trim(job.salary,50),location:trim(job.location,80),
      description:trim(job.description,220),url:trim(job.url,350),
      descriptionScope:job.descriptionScope==='full_jd'?'full_jd':'card_summary',
      experience:trim(job.experience,40),education:trim(job.education,40),
      recruiter:trim(job.recruiter,80),activity:trim(job.activity,70),
      recruiterType:job.recruiterType==='headhunter'?'headhunter':'unknown',
      contactState:job.contactState==='already_contacted'?'already_contacted':'unknown'};
  }
  async function scan(){
    if(!ready||busy)return;
    const generation=++scanId;busy=true;scanInFlight=true;render();display('正在读取当前已授权页面的职位卡片…');
    try{
      const result=await request('page.request',{operation:'jobs.scan',payload:{limit:60}});
      if(closed||generation!==scanId)return;
      if(result?.source!=='boss-zhipin-dom-r2'||!Array.isArray(result.jobs))throw Error('网页扫描回执无效');
      jobs=result.jobs.slice(0,60).map(normalize).filter(x=>x?.title);
      const stable=jobs.filter(x=>x.id).length;
      display(jobs.length?'已读取 '+jobs.length+' 条职位（'+stable+' 条有稳定 ID）；完整 JD 与 HR 活跃度需人工核实。':
        '当前页面没有识别到职位卡片，可能尚未加载或页面结构已变化。',jobs.length?'success':'error');
    }catch(error){
      if(!closed&&generation===scanId){
        jobs=[];display('扫描未完成：'+trim(error.message,180)+
          '。请核对网站授权、当前页面及刷新要求；未执行投递。','error');
      }
    }finally{if(!closed&&generation===scanId){busy=false;scanInFlight=false;render();}}
  }
  async function enqueue(job){
    if(!job.id||queue.some(x=>x.id===job.id)||evaluate(job,prefs).rejected)return;
    const record={...normalize(job),addedAt:Date.now(),status:'pending_review'};
    await persistQueue([record,...queue]);
  }
  async function removeJob(id){await persistQueue(queue.filter(x=>x.id!==id));}
  function openDraft(job){
    if(!ready||busy||!job.id)return;
    reviewJob=job;
    const skills=evaluate(job,prefs).skills.join('、')||trim(prefs.skills,80);
    if(!skills&&String(prefs.template).includes('{技能}')){
      display('未填写可核对的本人技能，已去掉模板中的技能占位；请手工确认其他事实。','warning');
    }
    const draft=String(prefs.template||DEFAULT.template)
      .replace(/\{岗位\}/g,job.title).replace(/\{公司\}/g,job.company||'贵司')
      .replace(/\{技能\}/g,skills||'（请填写已确认的本人技能）');
    el('ja-review-title').textContent='沟通草稿 · '+job.title;
    el('ja-draft').value=draft;
    el('ja-review').hidden=false;
    el('ja-review').scrollIntoView?.({block:'nearest'});
    el('ja-draft').focus();
    display('请人工核对话术中的个人经历与职位事实。没有自动发送。');
  }
  async function copyDraft(){
    if(!ready||busy||!reviewJob)return;
    const text=trim(el('ja-draft').value,800);
    if(!text){display('请先填写沟通草稿','error');return;}
    busy=true;render();
    try{await request('clipboard.writeText',{text});display('草稿已复制；未发送。请在网站内自行核对并决定是否发送。','success');}
    catch(error){display('复制失败：'+trim(error.message,150),'error');}
    finally{busy=false;render();}
  }
  root.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    if(!ready||busy)return;view=button.dataset.view;el('ja-review').hidden=true;reviewJob=null;render();
  }));
  el('ja-prefs').addEventListener('input',()=>{dirty=true;render();});
  el('ja-prefs').addEventListener('submit',event=>{event.preventDefault();void savePrefs();});
  el('ja-scan').addEventListener('click',()=>void scan());
  el('ja-copy').addEventListener('click',()=>void copyDraft());
  el('ja-close-review').addEventListener('click',()=>{reviewJob=null;el('ja-review').hidden=true;});
  root.addEventListener('opendesk-page-changed',()=>{scanId++;if(scanInFlight){busy=false;scanInFlight=false;}jobs=[];reviewJob=null;
    el('ja-review').hidden=true;display('页面已切换。请在目标页面重新扫描，旧职位快照已失效。');render();});
  tool.onDispose?.(()=>{closed=true;scanId++;});
  void load();
})();
