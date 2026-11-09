// Web Flow Markdown inputs are untrusted data, never execution authority.
(function(global){
  'use strict';
  const HEADER='<!-- webflow-todo:v1 -->', NAMES=['输入','任务','产出','验收'];
  const RULES=['auto:sum-count-marker:v1','auto:doubled-marker:v1'];
  function bad(code,message,line){throw Object.assign(new Error(message+(line?'（第 '+line+' 行）':'')),{code,line:line||null});}
  function deepFreeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(deepFreeze);Object.freeze(x);}return x;}
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
  function parse(text){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>65536)bad('E_MD_SIZE','MD 必须是不超过 64 KiB 的文本');
    const lines=text.replace(/^\uFEFF/u,'').replace(/\r\n?/gu,'\n').split('\n');
    const first=lines.findIndex(x=>x.trim());
    if(first<0||lines[first].trim()!==HEADER)bad('E_MD_FORMAT','首个非空行必须为 webflow-todo:v1 标记',first+1);
    let title='',goal='',area=null,field=null,fence=null,goalSeen=false;
    const tasks=[],ids=new Map();
    const put=(line,n)=>{
      if(area==='goal')goal+=line+'\n';
      else if(area&&field)area.fields[field]+=line+'\n';
      else if(line.trim())bad('E_MD_FORMAT','正文必须归属目标或任务字段',n);
    };
    for(let i=first+1;i<lines.length;i++){
      const line=lines[i],n=i+1,open=/^ {0,3}(\x60{3,}|~{3,})/u.exec(line);
      if(fence){
        if(open&&open[1][0]===fence.c&&open[1].length>=fence.n&&line.slice(open[0].length).trim()==='')fence=null;
        put(line,n);continue;
      }
      if(open){fence={c:open[1][0],n:open[1].length,line:n};put(line,n);continue;}
      const h=/^ {0,3}(#{1,3})[ \t]+(.+?)[ \t]*$/u.exec(line);
      if(!h){put(line,n);continue;}
      const level=h[1].length,heading=h[2].replace(/[ \t]+#+[ \t]*$/u,'').trim();
      if(level===1){
        if(title||area||!heading)bad('E_MD_FORMAT','一级标题必须唯一且在目标之前',n);
        title=heading;
      }else if(level===2){
        if(!title)bad('E_MD_FORMAT','先写队列名称',n);
        if(heading==='目标'){
          if(goalSeen||tasks.length)bad('E_MD_FORMAT','目标只能出现一次且在任务之前',n);
          goalSeen=true;area='goal';field=null;
        }else{
          const m=/^(T\d{2})[ \t]+(\S.*)$/u.exec(heading);
          if(!m)bad('E_MD_FORMAT','二级标题必须是目标或 T01 任务名称',n);
          if(!goal.trim())bad('E_MD_REQUIRED','任务前缺少目标内容',n);
          if(ids.has(m[1]))bad('E_MD_DUPLICATE',m[1]+' 重复，首次位于第 '+ids.get(m[1])+' 行',n);
          if(tasks.length>=16)bad('E_MD_LIMIT','任务数量超过 16',n);
          ids.set(m[1],n);area={id:m[1],title:m[2],line:n,fields:{}};tasks.push(area);field=null;
        }
      }else{
        if(!area||area==='goal'||!NAMES.includes(heading))bad('E_MD_FORMAT','只允许输入、任务、产出、验收四个字段',n);
        if(Object.hasOwn(area.fields,heading))bad('E_MD_DUPLICATE',area.id+' 重复字段 '+heading,n);
        area.fields[heading]='';field=heading;
      }
    }
    if(fence)bad('E_MD_FORMAT','代码围栏没有关闭',fence.line);
    if(!title||!goal.trim()||!tasks.length)bad('E_MD_REQUIRED','缺少标题、目标或任务');
    for(const t of tasks){
      for(const key of NAMES){
        if(!t.fields[key]?.trim())bad('E_MD_REQUIRED',t.id+' 缺少字段 '+key,t.line);
        t.fields[key]=t.fields[key].trim();
      }
      t.acceptance=t.fields['验收'];
      if(!RULES.includes(t.acceptance)&&!/^manual:[^\n]{3,200}$/u.test(t.acceptance))
        bad('E_MD_ACCEPTANCE',t.id+' 验收必须是已实现的 auto 规则或明确的 manual: 项',t.line);
    }
    return deepFreeze({format:'webflow-todo:v1',title,goal:goal.trim(),tasks});
  }
  function githubRaw(source){
    if(typeof source!=='string'||source.length>1500||/%(?:2e|2f|5c)|\\|[\u0000-\u001f]/iu.test(source))
      bad('E_MD_SOURCE','不接受该 GitHub 链接');
    let url;try{url=new URL(source);}catch{bad('E_MD_SOURCE','无效的 GitHub 链接');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)bad('E_MD_SOURCE','只允许纯 HTTPS 文件链接');
    let a=url.pathname.split('/').slice(1);
    if(url.hostname==='github.com'){
      if(a.length<5||a[2]!=='blob')bad('E_MD_SOURCE','GitHub 链接必须指向 blob 文件');
      a=[a[0],a[1],a[3],...a.slice(4)];
    }else if(url.hostname!=='raw.githubusercontent.com')bad('E_MD_SOURCE','只允许 GitHub 公开源文件');
    if(a.length<4||a.some(x=>!x||x==='.'||x==='..'||!/^[a-z0-9._-]+$/iu.test(x))||!a.at(-1).endsWith('.md'))
      bad('E_MD_SOURCE','MD 路径或版本无效');
    return 'https://raw.githubusercontent.com/'+a.join('/');
  }
  async function sha(text,digest){
    const doDigest=digest||global.crypto?.subtle?.digest?.bind(global.crypto.subtle,'SHA-256');
    if(typeof doDigest!=='function')bad('E_MD_DIGEST','SHA-256 不可用，不能固定版本');
    const bytes=new TextEncoder().encode(text),result=await doDigest(bytes);
    const b=Object.prototype.toString.call(result)==='[object ArrayBuffer]'?new Uint8Array(result):
      ArrayBuffer.isView(result)?new Uint8Array(result.buffer,result.byteOffset,result.byteLength):null;
    if(!b||b.length!==32)bad('E_MD_DIGEST','摘要回执错误');
    return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function readGithub(source,{fetcher=global.fetch,digest}={}){
    const url=githubRaw(source);
    if(typeof fetcher!=='function')bad('E_MD_FETCH','当前入口没有公开 GitHub 读取通道');
    let r;try{r=await fetcher(url,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store'});}
    catch{bad('E_MD_FETCH','远程读取失败，可能是网络或沙箱 CSP 阻止；绝不回退内置样例');}
    if(r?.status===401||r?.status===403)bad('E_MD_AUTH','私有仓库需要单独授权通道');
    if(!r?.ok||typeof r.text!=='function')bad('E_MD_FETCH','文件读取失败 HTTP '+(r?.status??'?')+'，可能不存在或无权访问');
    const content=await r.text(),workflow=parse(content),version=await sha(content,digest);
    return deepFreeze({source,url,content,version,workflow});
  }
  function spec(w){
    if(!object(w)||w.tasks?.length!==2||w.tasks[0]?.id!=='T01'||w.tasks[1]?.id!=='T02'||
       w.tasks[0].acceptance!==RULES[0]||w.tasks[1].acceptance!==RULES[1])
      bad('E_DEMO_SCHEMA','演示只接受求和 T01 → 翻倍 T02');
    const a=/^numbers:\s*\[([0-9,\s]+)\]$/u.exec(w.tasks[0].fields['输入']);
    const b=/^artifact:\s*T01\s*\nmultiplier:\s*([1-9]\d*)$/u.exec(w.tasks[1].fields['输入']);
    if(!a||!b)bad('E_DEMO_SCHEMA','T02 必须只接收 T01 成果引用和倍数');
    const tokens=a[1].split(',').map(x=>x.trim());
    if(tokens.length<1||tokens.length>20||tokens.some(x=>!/^(0|[1-9]\d*)$/u.test(x)))
      bad('E_DEMO_SCHEMA','数字数组格式不正确');
    const numbers=tokens.map(Number),multiplier=Number(b[1]),sum=numbers.reduce((x,y)=>x+y,0);
    if(!Number.isSafeInteger(multiplier)||multiplier>100||numbers.some(x=>!Number.isSafeInteger(x))||
      !Number.isSafeInteger(sum*multiplier))bad('E_DEMO_SCHEMA','输入超过安全计算范围');
    return deepFreeze({numbers,multiplier});
  }
  function context(w,c){
    spec(w);
    if(typeof c?.marker!=='string'||!/^[a-z0-9-]{16,80}$/iu.test(c.marker)||
      !/^[a-f0-9]{64}$/u.test(c.version||''))bad('E_DEMO_CONTEXT','缺少本轮随机标记或冻结版本');
  }
  function marker(){
    if(typeof global.crypto?.randomUUID!=='function')bad('E_DEMO_CONTEXT','需要安全随机标记');
    return global.crypto.randomUUID();
  }
  const fields=(a,keys)=>object(a)&&Object.keys(a).length===keys.length&&keys.every(x=>Object.hasOwn(a,x));
  const equal=(a,b)=>{
    if(a===b)return true;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>equal(x,b[i]));
    return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&
      Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
  };
  function verifyT01(w,c,a){
    context(w,c);const values=spec(w).numbers;
    if(!fields(a,['sum','count','marker','inputVersion'])||!Number.isSafeInteger(a.sum)||
       a.sum!==values.reduce((x,y)=>x+y,0)||a.count!==values.length||
       a.marker!==c.marker||a.inputVersion!==c.version)
      bad('E_DEMO_ACCEPTANCE','T01 成果未通过独立验收');
    return true;
  }
  function readback(w,c,saved,read){
    verifyT01(w,c,saved);
    if(!equal(saved,read))bad('E_DEMO_READBACK','T01 保存与独立读回不一致');
    verifyT01(w,c,read);return read;
  }
  function verifyT02(w,c,saved,read,a){
    const upstream=readback(w,c,saved,read);
    if(!fields(a,['doubled','marker','inputVersion'])||!Number.isSafeInteger(a.doubled)||
       a.doubled!==upstream.sum*spec(w).multiplier||a.marker!==c.marker||a.inputVersion!==c.version)
       bad('E_DEMO_ACCEPTANCE','T02 成果未通过独立验收');
    return true;
  }
  function promptT01(w,c){
    context(w,c);
    return '总目标：'+w.goal+'\n任务 T01：'+w.tasks[0].fields['任务']+
      '\n输入：'+JSON.stringify(spec(w).numbers)+'\n随机交接标记：'+c.marker+'\n输入版本：'+c.version+
      '\n只输出 JSON {sum,count,marker,inputVersion}。不要声明已保存、已验收。';
  }
  function promptT02(w,c,saved,read){
    const prior=readback(w,c,saved,read);
    return '总目标：'+w.goal+'\n任务 T02：'+w.tasks[1].fields['任务']+
      '\n已保存并独立读回的 T01 成果内容：'+JSON.stringify(prior)+
      '\n倍数：'+spec(w).multiplier+
      '\n只输出 JSON {doubled,marker,inputVersion}。不要声明已保存、已验收。';
  }
  global.OpenDeskMdWorkflow=Object.freeze({parse,githubRaw,sha,readGithub,spec,context,marker,
    verifyT01,readback,verifyT02,promptT01,promptT02});
})(globalThis);
