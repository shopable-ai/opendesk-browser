import {renderMarkdown} from './render.js';
import {STYLE} from './style.js';
import {createLiveReader} from './live.js';
import {markdownFile,isPlainMarkdownMime,READ_PROTOCOL,MAX_BYTES} from './policy.js';

const labels={
  zh:['目录','原文','阅读','实时更新','已更新','检查中','已暂停','后台暂停','读取失败，保留上次内容并重试','请开启扩展的「允许访问文件网址」','文件过大（上限 4 MiB）','复制','已复制','复制失败，已选中代码','外部图片未自动加载','自动','浅色','深色','标准','宽','全宽','无标题'],
  'zh-TW':['目錄','原文','閱讀','即時更新','已更新','檢查中','已暫停','背景暫停','讀取失敗，保留上次內容並重試','請開啟擴充功能的「允許存取檔案網址」','檔案過大（上限 4 MiB）','複製','已複製','複製失敗，已選取程式碼','外部圖片未自動載入','自動','淺色','深色','標準','寬','全寬','無標題'],
  ja:['目次','原文','閲覧','自動更新','更新済み','確認中','一時停止','バックグラウンド停止','読み込み失敗・前の内容を保持して再試行','拡張機能のファイル URL へのアクセスを許可してください','ファイルが大きすぎます（4 MiB）','コピー','コピーしました','コピー失敗・コードを選択しました','外部画像は自動で読み込みません','自動','ライト','ダーク','標準','ワイド','全幅','見出しなし'],
  en:['Contents','Source','Read','Live update','Updated','Checking','Paused','Background paused','Read failed; keeping last content and retrying','Enable Allow access to file URLs in extension details','File too large (4 MiB limit)','Copy','Copied','Copy failed; code selected','External image not loaded','Auto','Light','Dark','Standard','Wide','Full','No headings']
};
function language(value){
  if(/^zh-(?:TW|HK|MO|Hant)/i.test(value))return 'zh-TW';
  if(/^zh/i.test(value))return 'zh';if(/^ja/i.test(value))return 'ja';return 'en';
}
function capture(viewport,article,headings){
  const top=viewport.getBoundingClientRect().top+14;
  let candidate=null,position=-Infinity,below=null,belowPosition=Infinity,section=null;
  for(const node of article.querySelectorAll('[data-odmv-anchor]')){
    const r=node.getBoundingClientRect();
    if(r.bottom<=top)continue;
    if(r.top<=top&&r.top>=position){candidate=node;position=r.top;}
    else if(r.top<belowPosition){below=node;belowPosition=r.top;}
  }
  for(const h of headings)if(h.element.getBoundingClientRect().top<=top+8)section=h;
  const anchor=candidate||below;
  return {key:anchor?.dataset.odmvAnchor,offset:anchor?anchor.getBoundingClientRect().top-top:0,
    section:section?.id,sectionOffset:section?section.element.getBoundingClientRect().top-top:0,pixel:viewport.scrollTop};
}
function restore(viewport,article,headings,snapshot){
  if(!snapshot)return;
  const top=viewport.getBoundingClientRect().top+14;
  const anchor=[...article.querySelectorAll('[data-odmv-anchor]')].find(n=>n.dataset.odmvAnchor===snapshot.key);
  const section=headings.find(h=>h.id===snapshot.section)?.element;
  if(anchor||section){
    const target=anchor||section,offset=anchor?snapshot.offset:snapshot.sectionOffset;
    viewport.scrollTop+=target.getBoundingClientRect().top-top-offset;
  }else viewport.scrollTop=snapshot.pixel;
}

export function mountReader({doc,base,initial=null,read,preview=false,preferences={},savePreferences=()=>{},locale=doc.defaultView.navigator.language}){
  const win=doc.defaultView,L=labels[language(locale)],host=doc.createElement('div');
  host.dataset.odMarkdownViewer='v1';
  const shadow=host.attachShadow({mode:'open'});
  const el=(tag,cls,value)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const style=el('style');style.textContent=STYLE;
  const shell=el('section','shell');shell.lang=language(locale);
  const toolbar=el('header','toolbar'),filename=el('span','filename'),statusNode=el('span','status');
  let name='Markdown';
  try{name=decodeURIComponent(new URL(base).pathname.split('/').at(-1))||name;}catch{}
  filename.textContent=name;filename.title=name;
  statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');
  const controls=el('div','controls');
  function button(label){const b=el('button','',label);b.type='button';return b;}
  const tocToggle=button(L[0]);tocToggle.setAttribute('aria-expanded','true');
  const sourceToggle=button(L[1]);sourceToggle.setAttribute('aria-pressed','false');
  const liveLabel=el('label','',L[3]),liveToggle=el('input');liveToggle.type='checkbox';liveToggle.checked=true;liveLabel.prepend(liveToggle);
  const select=(items,aria)=>{
    const s=el('select');s.setAttribute('aria-label',aria);for(const [value,label] of items){const o=el('option','',label);o.value=value;s.append(o);}return s;
  };
  const theme=select([['auto',L[15]],['light',L[16]],['dark',L[17]]],'Theme');
  const width=select([['920px',L[18]],['1160px',L[19]],['none',L[20]]],'Reading width');
  theme.value=['auto','light','dark'].includes(preferences.theme)?preferences.theme:'auto';
  width.value=['920px','1160px','none'].includes(preferences.width)?preferences.width:'920px';
  const applyPreferences=()=>{shell.dataset.theme=theme.value;shell.style.setProperty('--reading-width',width.value);};
  applyPreferences();
  for(const s of [theme,width])s.addEventListener('change',()=>{applyPreferences();void Promise.resolve(savePreferences({theme:theme.value,width:width.value})).catch(()=>{});});
  controls.append(tocToggle,sourceToggle,liveLabel,theme,width);toolbar.append(filename,statusNode,controls);
  const body=el('div','body'),toc=el('nav','toc');toc.setAttribute('aria-label',L[0]);
  const tocTitle=el('p','toc-title',L[0]),tocLinks=el('div');toc.append(tocTitle,tocLinks);
  const viewport=el('main','viewport'),article=el('article','article'),raw=el('pre','raw');raw.hidden=true;
  viewport.append(article,raw);body.append(toc,viewport);shell.append(toolbar,body);shadow.append(style,shell);
  let headings=[],source='',rawMode=false,tocOpen=true,reading=null,renderCount=0,scrollFrame=0,interaction=0,closed=false,lastStatus=null,rawScroll=0;
  const renderStatus=state=>{
    lastStatus=state;const time=state.last===null?'':new Date(state.last).toLocaleTimeString(locale);
    const message=state.state==='live'?L[4]:state.state==='checking'?L[5]:state.state==='paused'?L[6]:state.state==='hidden'?L[7]:
      state.code==='E_FILE_PERMISSION'?L[9]:state.code==='E_TOO_LARGE'?L[10]:L[8];
    const text=message+(time?' · '+time:'');
    if(statusNode.textContent!==text)statusNode.textContent=text;
    statusNode.dataset.error=String(state.state==='error');
    statusNode.dataset.state=state.state;
    if(state.code)statusNode.title=state.code;else statusNode.removeAttribute('title');
  };
  const copy=async(value,code)=>{
    try{await win.navigator.clipboard.writeText(value);statusNode.textContent=L[12];}
    catch{
      try{const range=doc.createRange();range.selectNodeContents(code);const selection=shadow.getSelection?.()||win.getSelection();selection.removeAllRanges();selection.addRange(range);}catch{}
      statusNode.textContent=L[13];
    }
    win.setTimeout(()=>{if(!closed&&lastStatus)renderStatus(lastStatus);},1800);
  };
  function syncToc(){
    const top=viewport.getBoundingClientRect().top+36;
    let active=headings[0];for(const h of headings){if(h.element.getBoundingClientRect().top<=top)active=h;else break;}
    for(const link of tocLinks.querySelectorAll('a')){
      if(link.dataset.heading===active?.id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
    }
  }
  function jump(id,writeHash=false){
    const h=headings.find(h=>h.id===id);if(!h||rawMode)return false;
    interaction++;viewport.scrollTop+=h.element.getBoundingClientRect().top-viewport.getBoundingClientRect().top-16;
    if(writeHash&&!preview){try{win.history.pushState(null,'','#'+encodeURIComponent(id));}catch{win.location.hash=encodeURIComponent(id);}}
    syncToc();return true;
  }
  function hashJump(){try{if(win.location.hash)jump(decodeURIComponent(win.location.hash.slice(1)));}catch{}}
  function render(next){
    if(new Blob([next]).size>MAX_BYTES)throw Object.assign(Error('File too large'),{code:'E_TOO_LARGE'});
    const snapshot=rawMode?reading:capture(viewport,article,headings);
    const oldRawPixel=viewport.scrollTop;
    const result=renderMarkdown(doc,next,base,{copyLabel:L[11],copy,remoteImageLabel:L[14]});
    // Build off-screen, then commit only the successfully constructed view.
    article.replaceChildren(result.root);headings=result.headings;source=next;raw.textContent=next;
    const links=doc.createDocumentFragment();
    if(!headings.length)links.append(el('p','toc-title',L[21]));
    for(const h of headings){
      const a=el('a','',h.title||h.id);a.href='#'+encodeURIComponent(h.id);a.dataset.heading=h.id;
      a.style.paddingInlineStart=(8+Math.max(0,h.level-1)*11)+'px';
      a.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();jump(h.id,true);});
      links.append(a);
    }
    tocLinks.replaceChildren(links);renderCount++;host.dataset.renderCount=String(renderCount);
    if(rawMode){viewport.scrollTop=oldRawPixel;reading=snapshot;}
    else{
      restore(viewport,article,headings,snapshot);
      if(renderCount===1)hashJump();
      const stamp=interaction;
      // A newly decoded local image can reflow content above the anchor.
      // Only correct while the reader has not interacted since this render.
      const rev=renderCount;
      if(renderCount>1)for(const img of article.querySelectorAll('img')){
        if(!img.complete)img.addEventListener('load',()=>{
          if(!closed&&!rawMode&&stamp===interaction&&rev===renderCount)restore(viewport,article,headings,snapshot);
        },{once:true});
      }
    }
    syncToc();
  }
  article.addEventListener('click',event=>{
    const link=event.target.closest?.('a');
    if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    try{const dest=new URL(link.href),current=new URL(base);
      if(dest.protocol==='file:'&&dest.pathname===current.pathname&&dest.hash){event.preventDefault();jump(decodeURIComponent(dest.hash.slice(1)),true);}
    }catch{}
  });
  function updateToc(){toc.hidden=rawMode||!tocOpen;tocToggle.setAttribute('aria-expanded',String(!toc.hidden));tocToggle.disabled=rawMode;}
  tocToggle.addEventListener('click',()=>{interaction++;const anchor=capture(viewport,article,headings);tocOpen=!tocOpen;updateToc();restore(viewport,article,headings,anchor);});
  sourceToggle.addEventListener('click',()=>{
    interaction++;if(!rawMode){reading=capture(viewport,article,headings);rawMode=true;article.hidden=true;raw.hidden=false;viewport.scrollTop=rawScroll;}
    else {rawScroll=viewport.scrollTop;rawMode=false;article.hidden=false;raw.hidden=true;}
    sourceToggle.textContent=rawMode?L[2]:L[1];sourceToggle.setAttribute('aria-pressed',String(rawMode));updateToc();
    if(!rawMode)restore(viewport,article,headings,reading);syncToc();
  });
  for(const type of ['wheel','pointerdown','touchstart','keydown'])viewport.addEventListener(type,()=>{interaction++;},{passive:true});
  viewport.addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=win.requestAnimationFrame(()=>{scrollFrame=0;if(!rawMode)syncToc();});},{passive:true});
  let bootText=null;
  doc.body.style.margin='0';doc.body.style.overflow='hidden';doc.body.replaceChildren(host);
  if(initial!==null){try{render(initial);bootText=initial;}catch{renderStatus({state:'error',last:null,code:'E_RENDER'});}}
  const reader=createLiveReader({read,render,status:renderStatus,visible:()=>!doc.hidden,initial:bootText});
  liveToggle.addEventListener('change',()=>reader.setEnabled(liveToggle.checked));
  const visibility=()=>doc.hidden?reader.sleep():reader.wake();
  const focus=()=>reader.wake();
  doc.addEventListener('visibilitychange',visibility);win.addEventListener('focus',focus);win.addEventListener('hashchange',hashJump);win.addEventListener('popstate',hashJump);
  const dispose=()=>{closed=true;reader.destroy();if(scrollFrame)win.cancelAnimationFrame(scrollFrame);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('focus',focus);win.removeEventListener('hashchange',hashJump);win.removeEventListener('popstate',hashJump);};
  win.addEventListener('pagehide',event=>{if(event.persisted)reader.sleep();else dispose();});
  win.addEventListener('pageshow',event=>{if(event.persisted)reader.wake();});
  reader.start();
  return {host,reader,dispose,get renderCount(){return renderCount;}};
}
export async function startMarkdownViewer({doc=document,api=chrome}={}){
  const base=markdownFile(doc.location.href);
  if(!base||!isPlainMarkdownMime(doc.contentType)||doc.querySelector('[data-od-markdown-viewer]'))return;
  const pre=doc.body?.querySelector(':scope > pre');
  // Chrome's text document is the only accepted page shape. Never replace HTML.
  if(!pre)return;
  const initial=pre.textContent;
  const key='opendesk.markdown-viewer.preferences.v1';
  let preferences={};
  try{preferences=(await api.storage.local.get(key))[key]||{};}catch{}
  if(!pre.isConnected||doc.querySelector('[data-od-markdown-viewer]'))return;
  mountReader({doc,base,initial,preferences,
    read:()=>api.runtime.sendMessage({protocol:READ_PROTOCOL,type:'read'}),
    savePreferences:value=>api.storage.local.set({[key]:value})});
}
