// Run with real browser DOM/Selection/Range; these are component checks, not a
// claim about the user's installed extension or ChatGPT conversation.
export async function runMenuSelectionBrowserCases({cloneVisibleSelection,domToMarkdown,createMenuSelectionSnapshot,tool}){
  const root=document.createElement('article');document.body.append(root);
  const results=[];
  const check=(name,actual,expected)=>{
    if(actual!==expected)throw Error(name+'\nexpected '+JSON.stringify(expected)+'\nactual '+JSON.stringify(actual));
    results.push(name);
  };
  const select=(start,from,end=start,to=start.textContent.length)=>{
    const range=document.createRange();range.setStart(start,from);range.setEnd(end,to);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    return range;
  };
  const convert=range=>domToMarkdown(cloneVisibleSelection(range,document,window),'https://example.com/post');
  try{
    root.innerHTML='<p>UNSELECTED BEFORE</p><h2>Before Title After</h2><p>UNSELECTED AFTER</p>';
    check('partial heading retains level and selected characters',convert(select(root.querySelector('h2').firstChild,7,undefined,12)),'## Title\n');
    root.innerHTML='<p>before <strong>bold</strong> after <a href="/link">label</a><code>value()</code></p>';
    check('partial emphasis',convert(select(root.querySelector('strong').firstChild,1,undefined,3)),'**ol**\n');
    check('partial link',convert(select(root.querySelector('a').firstChild,0)),'[label](https://example.com/link)\n');
    check('partial inline code',convert(select(root.querySelector('code').firstChild,0)),'`value()`\n');
    root.innerHTML='<ol start="3"><li>NOT SELECTED</li><li>Selected item</li><li>NOT SELECTED EITHER</li></ol>';
    check('partial ordered item keeps number',convert(select(root.querySelectorAll('li')[1].firstChild,0,undefined,8)),'4. Selected\n');
    root.innerHTML='<p>OUTSIDE</p><h2>Heading</h2><ul><li>Alpha<ul><li>Nested</li></ul></li><li>Beta</li></ul><ol start="3"><li>Third<ul><li>Child</li></ul></li></ol><p>AFTER</p>';
    check('cross-block heading and mixed nested lists',convert(select(root.querySelector('h2').firstChild,0,root.querySelector('ol ul li').firstChild,5)),
      '## Heading\n\n- Alpha\n  - Nested\n- Beta\n\n3. Third\n   - Child\n');
    root.innerHTML='<p>Outside</p><h3>Start here</h3><p>End here and exclude</p><p>Outside too</p>';
    check('cross-block partial endpoints',convert(select(root.querySelector('h3').firstChild,6,root.querySelectorAll('p')[1].firstChild,8)),
      '### here\n\nEnd here\n');
    root.innerHTML='<p>Visible <span style="display:none">SECRET</span><button>CONTROL</button><span aria-hidden="true">HIDDEN</span>end</p>';
    const range=document.createRange();range.selectNodeContents(root.querySelector('p'));
    check('hidden text and page controls excluded',convert(range),'Visible end\n');
    root.innerHTML='<blockquote><p>Quoted text</p></blockquote><pre><code class="language-js">const value = 42;\n</code></pre>';
    check('partial quote',convert(select(root.querySelector('p').firstChild,0)),'> Quoted text\n');
    check('partial fenced code retains language',convert(select(root.querySelector('code').firstChild,0)),
      '```js\nconst value = 42;\n```\n');

    root.innerHTML='<h2>Frozen heading</h2><p>Different after focus</p>';
    select(root.querySelector('h2').firstChild,0);
    let now=1000,timer,clears=0;
    const fakeWindow={document,getSelection:()=>window.getSelection(),
      getComputedStyle:window.getComputedStyle.bind(window),location:{href:'https://example.com/post'}};
    const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path}};
    const owner={id:'test',url:api.runtime.getURL('sw.js')};
    const cache=createMenuSelectionSnapshot({window:fakeWindow,api,clock:{now:()=>now},
      setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{clears++;}});
    const request=id=>({protocol:'opendesk.browser.menu-selection.v1',snapshotId:id,
      url:fakeWindow.location.href,selection:'Frozen heading'});
    let id=cache.capture();
    check('snapshot is opaque',typeof id,'string');
    select(root.querySelector('p').firstChild,0);
    check('foreign sender cannot read',cache.receive(request(id),{...owner,id:'foreign'}),null);
    check('page sender cannot read',cache.receive(request(id),{...owner,tab:{id:1}}),null);
    check('wrong snapshot cannot read',cache.receive(request('wrong'),owner),null);
    check('focus change preserves original snapshot',cache.receive(request(id),owner)?.markdown,'## Frozen heading\n');
    check('snapshot consumed once',cache.receive(request(id),owner),null);
    select(root.querySelector('h2').firstChild,0);id=cache.capture();
    check('native text mismatch rejects snapshot',cache.receive({...request(id),selection:'Different'},owner),null);
    check('mismatch cannot be retried',cache.receive(request(id),owner),null);
    id=cache.capture();now+=60000;
    check('snapshot expires',cache.receive(request(id),owner),null);
    id=cache.capture();fakeWindow.location.href='https://example.com/new';
    check('navigation rejects snapshot',cache.receive({...request(id),url:'https://example.com/post'},owner),null);
    fakeWindow.location.href='https://example.com/post';id=cache.capture();timer();
    check('timer clears snapshot',cache.receive(request(id),owner),null);
    id=cache.capture();cache.clear();
    check('pagehide clears snapshot',cache.receive(request(id),owner),null);
    check('timers cleaned',clears>0,true);
    if(tool){
      root.innerHTML='<p>NEVER SELECT THIS</p><h2>Saved heading</h2><ol start="3"><li>Parent<ul><li>Nested</li></ul></li></ol><p>NEVER SELECT THIS EITHER</p>';
      const selectedRange=select(root.querySelector('h2').firstChild,0,root.querySelector('ul li').firstChild,6);
      const selectedText=window.getSelection().toString(),markdown=convert(selectedRange);
      let stored=null,revision=0,writes=0;
      const etag=()=>revision.toString(16).padStart(64,'0');
      const request=async(operation,args)=>{
        if(operation==='currentPage.info')return {status:'unavailable'};
        if(operation==='storage.get')return {value:structuredClone(stored),etag:etag()};
        if(operation==='storage.set'){
          check('CAS uses current revision',args.ifMatch,etag());
          stored=structuredClone(args.value);revision++;writes++;return {saved:true,etag:etag()};
        }
        if(operation==='clip.selection')return {markdown:convert(selectedRange),source:'https://example.com/post',title:'Example',site:'example.com'};
        throw Error('Unexpected component operation '+operation);
      };
      const hosts=[];
      const mount=()=>{
        const host=document.createElement('section');host.innerHTML=tool.html;document.body.append(host);hosts.push(host);
        host.querySelector('#clip-meta').value='none';
        const global={OpenDeskTool:{root:host,request},OpenDeskSDK:{browser:{launch:{consume:async()=>({
          toolId:'web-markdown-clipper',actionId:'save-selection',selection:selectedText,selectionMarkdown:markdown,
          source:{url:'https://example.com/post'},expiresAt:Date.now()+60000})}}}};
        new Function('globalThis',tool.notes)(global);
        new Function('globalThis',tool.main)(global);
        return host;
      };
      const settle=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await Promise.resolve();}throw Error('Component did not settle');};
      try{
        let host=mount();
        await settle(()=>!host.querySelector('#clip-save').disabled);
        check('real selection reaches Markdown editor',host.querySelector('#clip-source').value,markdown);
        check('real heading reaches semantic preview',host.querySelector('#clip-preview h2')?.textContent,'Saved heading');
        check('real nested list reaches semantic preview',host.querySelector('#clip-preview ol[start="3"] > li > ul > li')?.textContent,'Nested');
        check('right-click does not silently save',writes,0);
        host.querySelector('#clip-save').click();await settle(()=>stored?.items?.length===1);
        await settle(()=>host.querySelector('#clip-status').textContent.includes('已保存'));
        check('saved real selection keeps Markdown',stored.items[0].body,markdown);
        host.remove();host=mount();
        host.querySelector('#clip-my-notes').click();
        await settle(()=>!!host.querySelector('.clip-note-open'));
        host.querySelector('.clip-note-open').click();
        check('reopened saved selection keeps Markdown',host.querySelector('#clip-note-body').value,markdown);
        check('unselected conversation is absent',stored.items[0].body.includes('NEVER SELECT'),false);
        host.querySelector('[data-clip-mode="selection"]').click();host.querySelector('#clip-fetch').click();
        await settle(()=>host.querySelector('#clip-status').textContent.startsWith('已提取'));
        check('direct extraction uses the same selection Markdown',host.querySelector('#clip-source').value,markdown);
      }finally{hosts.forEach(host=>host.remove());}
    }
    return {status:'PASS',cases:results};
  }finally{window.getSelection().removeAllRanges();root.remove();}
}
