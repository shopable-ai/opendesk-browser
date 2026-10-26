import {buildCleanupPrompt,parseManualResult} from './model.js';
// Same UI for the actual Page Program and the explicitly labeled offline fixture.
const el=(d,tag,cls,text)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const btn=(d,text,cls='')=>{const b=el(d,'button',cls,text);b.type='button';return b};
const field=(d,name,rows,placeholder)=>{const label=el(d,'label','vc-field');
 const title=el(d,'span','vc-label',name),area=el(d,'textarea','vc-input');
 area.rows=rows;area.placeholder=placeholder;label.append(title,area);return {label,area}};
export function mountCleanupWidget({owner,site,doc=document,win=window}){
 const shell=el(doc,'div','vc-shell'),trigger=btn(doc,'整理文字','vc-trigger');
 trigger.setAttribute('aria-expanded','false');
 const panel=el(doc,'section','vc-panel');panel.hidden=true;
 const heading=el(doc,'div','vc-heading'),close=btn(doc,'×','vc-close');
 close.setAttribute('aria-label','收起');heading.append(el(doc,'strong','vc-title','语音文字整理'),close);
 const subtitle=el(doc,'p','vc-subtitle','官网辅助模式 · 不自动发送、不调用独立 API');
 const original=field(doc,'待整理原文',3,'先读取当前草稿，或输入语音识别文字');
 const terms=field(doc,'术语参考（每行一条）',2,'扣得克斯 → Codex\n欧喷德斯克 → OpenDesk\n瑞爱克特 → React');
 const capture=btn(doc,'读取草稿'),prepare=btn(doc,'生成整理请求','vc-primary');
 const prompt=field(doc,'整理请求（只读）',3,'复制到官网个性化临时对话手动发送');prompt.area.readOnly=true;
 const copyPrompt=btn(doc,'复制请求');
 const guide=el(doc,'p','vc-guide','需要用户在官网对话中手动发送请求。没有自动模型调用或后台抓取。');
 const result=field(doc,'整理结果（手动粘贴与编辑）',4,'粘贴 JSON 或已人工核对的纯文本');
 const accept=btn(doc,'确认结果'),fill=btn(doc,'填入原输入框','vc-primary');
 const copyResult=btn(doc,'复制结果'),cancel=btn(doc,'取消本次');
 const row1=el(doc,'div','vc-actions'),row2=el(doc,'div','vc-actions');
 row1.append(capture,prepare);row2.append(accept,fill,copyResult,cancel);
 const status=el(doc,'p','vc-status','尚未建立任务');status.setAttribute('role','status');
 const note=el(doc,'p','vc-note','原草稿变化、编辑器切换、输入法组合时拒绝覆盖；只填入，不发送。');
 panel.append(heading,subtitle,original.label,terms.label,row1,prompt.label,copyPrompt,
   guide,result.label,row2,status,note);shell.append(trigger,panel);owner.content.append(shell);
 let binding=null,requestId=null,accepted=null,attempted=false,unknown=false,busy=false,composing=false;
 const message=(value,error=false)=>{status.textContent=value;status.classList.toggle('vc-error',error)};
 const refresh=()=>{
   const ready=!!requestId&&!attempted&&!unknown&&!busy;
   capture.disabled=busy||unknown;prepare.disabled=busy||unknown;
   copyPrompt.disabled=!requestId||busy;accept.disabled=!ready;
   fill.disabled=!ready||!accepted;copyResult.disabled=!result.area.value||busy;
   cancel.disabled=busy||(!requestId&&!binding&&!result.area.value);
   original.area.disabled=busy||unknown;terms.area.disabled=busy||unknown;result.area.disabled=busy||unknown;
 };
 const invalidate=()=>{
   requestId=null;accepted=null;attempted=false;
   prompt.area.value='';result.area.value='';
   message('原文或术语已变更，需要生成新的整理请求');refresh();
 };
 const bind=()=>{
   const found=site.capture();
   if(!found.ok){message(found.reason||'无法绑定官网草稿',true);return false}
   binding=found.binding;original.area.value=binding.draft;invalidate();
   message(binding.draft?'已绑定当前原草稿，不会在整理时修改它':'已绑定当前空输入框，可编辑上方原文');
   return true;
 };
 const copy=async(text,area)=>{
   try{await win.navigator.clipboard.writeText(text);return true}
   catch{area.focus();area.select();try{return doc.execCommand('copy')===true}catch{return false}}
 };
 owner.on(doc,'compositionstart',()=>{composing=true},true);
 owner.on(doc,'compositionend',()=>{composing=false},true);
 owner.on(trigger,'click',()=>{panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden))});
 owner.on(close,'click',()=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus()});
 owner.on(capture,'click',bind);
 owner.on(original.area,'input',invalidate);
 owner.on(terms.area,'input',invalidate);
 owner.on(result.area,'input',()=>{accepted=null;refresh()});
 owner.on(prepare,'click',()=>{
   try{
     if(!binding){
       // Preparing directly after typing in the floating panel must not erase
       // manually provided text with an empty website draft.
       const typed=original.area.value;
       if(!bind())return;
       if(typed)original.area.value=typed;
     }
     if(unknown)throw new Error('本页存在未知写入结果，请人工核对并刷新');
     if(typeof win.crypto?.randomUUID!=='function')throw new Error('无法创建安全任务标识');
     requestId=win.crypto.randomUUID();
     prompt.area.value=buildCleanupPrompt({requestId,original:original.area.value,terms:terms.area.value});
     result.area.value='';accepted=null;attempted=false;
     message('USER_ACTION_REQUIRED：请求已生成，尚未调用 ChatGPT。请复制并手动发送');
   }catch(e){requestId=null;prompt.area.value='';message(e.message||'生成失败',true)}
   refresh();
 });
 owner.on(copyPrompt,'click',async()=>{const ok=await copy(prompt.area.value,prompt.area);
   message(ok?'请求已复制，请在官网临时对话手动发送':'复制失败，请手动选择文字',!ok)});
 owner.on(accept,'click',()=>{
   if(!requestId||attempted)return;
   try{
     const parsed=parseManualResult(result.area.value,requestId);
     accepted=parsed.text;result.area.value=parsed.text;
     message(parsed.kind==='manual-json'?
       '人工提供的 JSON 任务 ID 匹配；未证实官方插件回传':
       '手动确认纯文本；来源和任务身份未经自动验证');
   }catch(e){accepted=null;message(e.message||'结果不合法',true)}
   refresh();
 });
 owner.on(fill,'click',async()=>{
   if(!binding||!accepted||attempted||unknown||busy||!requestId)return;
   const gate=site.check(binding,()=>composing);
   if(!gate.ok){message(gate.reason||'草稿冲突，禁止覆盖',true);return}
   busy=true;attempted=true;refresh();message('正在写入并读回官网输入框…');
   try{
     const r=await site.fill(binding,accepted,()=>composing);
     if(r.ok&&r.filled&&r.readBackVerified&&r.sent===false)
       message('已填入并独立读回；未自动发送，AI 结果来源仍为手动提供');
     else{if(r.outcome==='OUTCOME_UNKNOWN')unknown=true;
       message((r.reason||'未能验证写入')+(unknown?'；禁止本页重复写入':''),true)}
   }catch{unknown=true;message('写入结果未知，请核对官网草稿，本页禁止重试',true)}
   finally{busy=false;refresh()}
 });
 owner.on(copyResult,'click',async()=>{const ok=await copy(accepted||result.area.value,result.area);
   message(ok?'结果已复制':'复制失败，请手动复制',!ok)});
 owner.on(cancel,'click',()=>{
   binding=null;requestId=null;accepted=null;attempted=false;
   prompt.area.value='';result.area.value='';
   message(unknown?'已取消；本页仍有未知写入结果，须检查并刷新':'已取消，官网草稿未被主动清空',unknown);
   refresh();
 });
 refresh();
 return {status:'assisted',mode:'USER_ACTION_REQUIRED',source:'manual-only'};
}
