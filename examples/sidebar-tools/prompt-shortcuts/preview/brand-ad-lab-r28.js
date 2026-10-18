/* OpenDesk Prompt Shortcuts R2.8 — local mock only. No network, storage, SDK or site injection. */
(function () {
  'use strict';
  const old = window.OpenDeskR27Bridge;
  if (!old) { console.error('R2.8 preview requires the R2.7 bridge'); return; }
  const $ = id => document.getElementById(id);
  const LANGS = ['zh', 'en', 'ja'];
  const words = {
    zh: {
      heading:'R2.8 · 35 个品牌与广告候选位置',hint:'离线模拟网页 · 所有合作品牌为虚构样例 · 不向第三方网站注入',
      group:'候选位置组',scene:'网页场景',inventory:'已售卡片',mode:'广告库存模式',layout:'展示形式',prompts:'提示词数量',boundaries:'显示位置边界',
      new:'新对话',short:'短对话',long:'长对话',user:'普通用户 · 未售不显示',sales:'招商预览 · 未售有虚线',
      presets:'截图布局',brand:'① 品牌传播',sponsor:'② 极简赞助',hover:'③ 悬浮招商',sidebar:'④ 侧边栏商业化',newads:'⑤ 新对话留白',compare:'⑥ 多位置对比',off:'完全关闭广告',
      restore:'恢复广告',dismiss:'关闭广告',recruit:'合作展示位',fiction:'虚构样例',demo:'广告 · 原型模拟',partner:'赞助 · 虚构示例',official:'OpenDesk 官方推广示意',view:'合作说明',
      noSponsor:'暂无赞助：普通用户看不到空占位',brandDetails:'OD 为实验性标识，常驻提示词栏顶部。并非正式品牌资产。',railIntro:'OpenDesk · Prompt Shortcuts：保存常用提示词并插入草稿。此为独立原型。',
      sponsorDetails:'FlowNest 为虚构品牌，没有真实商业合作；未配置链接、投放或跟踪。',
      policy:'政策判断',riskLow:'低',riskMid:'中',riskHigh:'高',riskCritical:'极高',impact:'UX 影响',share:'截图传播',effort:'成本',narrow:'窄屏',confusion:'网页混淆',ownUI:'扩展自有界面',review:'合规复审',close:'可关闭',
      recommended:'值得审查',notRecommended:'不推荐正式上线',firstParty:'可在自有 UI 评审',simOnly:'仅虚构网页中的风险模拟',safe:'低干扰',crowded:'可能干扰任务',blocked:'强干扰',great:'高',medium:'中',low:'低',poor:'差',yes:'是',no:'否',conditional:'有条件',
      explain:'点击 35 个位置或模拟网页热区，定位并观察广告。B01/B02/B08 是品牌位，不列入第三方广告库存。N/C 组只供风险实验。',
      newGreeting:'有什么可以帮你？',mockSite:'虚构聊天界面 · 广告不属于网站内容',userMessage:'请帮我整理这段话的核心观点。',assistantMessage:'可以先归纳三条要点，再写一段简洁摘要。这里展示的是虚构对话内容。',typing:'已保留草稿与输入操作，不会自动发送',
      selected:'当前位置',brandSlot:'品牌展示 · 非广告库存',sold:'已售',scenarioN:'新对话候选',scenarioC:'已有对话候选',
      clickZone:'点击区域体验广告',detailsTitle:'广告与招商说明 · 仅本地原型',detailsClose:'关闭',legacy:'R2.7 原有 A1–A10 独立实验（保留原交互）',
      riskHint:'这些候选位置属于第三方网页注入高风险设想，正式扩展不予实施。',noData:'不采集提示词内容、浏览事件、曝光、点击或转化。'
    },
    en: {
      heading:'R2.8 · 35 brand and ad placements',hint:'Offline mock only · Fictional sponsors · No third-party injection',
      group:'Placement group',scene:'Page scene',inventory:'Sold cards',mode:'Inventory mode',layout:'Card format',prompts:'Prompt count',boundaries:'Show placement bounds',
      new:'New conversation',short:'Short conversation',long:'Long conversation',user:'User · unsold slots hidden',sales:'Sales preview · empty slots outlined',
      presets:'Screenshot layouts',brand:'① Brand',sponsor:'② Minimal sponsor',hover:'③ Tooltip sponsor',sidebar:'④ Panel inventory',newads:'⑤ New page whitespace',compare:'⑥ Compare placements',off:'Hide all ads',
      restore:'Restore ads',dismiss:'Hide ad',recruit:'Available sponsor slot',fiction:'Fictional sample',demo:'Ad · Mock only',partner:'Sponsored · Fictional',official:'OpenDesk first-party demo',view:'Partner details',
      noSponsor:'No sponsor: unsold slots hidden for users',brandDetails:'OD is an experimental mark at the top of the rail, not an approved logo.',railIntro:'OpenDesk · Prompt Shortcuts: reuse prompts in a draft. Prototype only.',
      sponsorDetails:'FlowNest is entirely fictitious; no live relationship, links, delivery or tracking.',
      policy:'Policy assessment',riskLow:'Low',riskMid:'Medium',riskHigh:'High',riskCritical:'Critical',impact:'UX impact',share:'Screenshot value',effort:'Effort',narrow:'Narrow UI',confusion:'Site confusion',ownUI:'In extension UI',review:'Further review',close:'Dismissible',
      recommended:'Review candidate',notRecommended:'Do not ship',firstParty:'Review inside own UI',simOnly:'High-risk mock-page only',safe:'Low interruption',crowded:'May distract',blocked:'Strong interruption',great:'High',medium:'Medium',low:'Low',poor:'Poor',yes:'Yes',no:'No',conditional:'Conditional',
      explain:'Click any of the 35 candidates or page hotspots. B01/B02/B08 are branding, not ad inventory. N/C are risk-only mockups.',
      newGreeting:'How can I help?',mockSite:'Fictional chat page · Ads are not site content',userMessage:'Help organize the key ideas in this note.',assistantMessage:'We can identify three points and write a concise summary. This is entirely fictional chat.',typing:'Draft stays editable. Nothing is sent.',
      selected:'Selected position',brandSlot:'Branding · Not inventory',sold:'Sold',scenarioN:'New conversation',scenarioC:'Existing conversation',
      clickZone:'Select to preview',detailsTitle:'Partnership preview · Offline only',detailsClose:'Close',legacy:'Original R2.7 A1–A10 controls (retained)',
      riskHint:'Third-party webpage placements are high-risk mock concepts only, not approved for production.',noData:'No prompts, browsing events, impressions, clicks or conversions collected.'
    },
    ja: {
      heading:'R2.8 · 35 箇所のブランド・広告候補',hint:'オフライン試作 · 架空のスポンサー · 実サイトには挿入しません',
      group:'配置グループ',scene:'画面シーン',inventory:'販売済みカード',mode:'枠の表示',layout:'カード形式',prompts:'プロンプト数',boundaries:'候補の境界を表示',
      new:'新しい会話',short:'短い会話',long:'長い会話',user:'通常表示 · 空枠を隠す',sales:'営業プレビュー · 空枠を表示',
      presets:'スクリーンショット用配置',brand:'① ブランド',sponsor:'② 小型スポンサー',hover:'③ ポップアップ協賛',sidebar:'④ サイドバー広告',newads:'⑤ 空白領域',compare:'⑥ 複数配置',off:'広告をすべて非表示',
      restore:'広告を復元',dismiss:'広告を閉じる',recruit:'協賛枠募集中',fiction:'架空サンプル',demo:'広告 · 模擬',partner:'スポンサー · 架空',official:'OpenDesk 自社紹介の例',view:'協賛の説明',
      noSponsor:'スポンサーなし：通常モードでは空枠を隠します',brandDetails:'OD は実験用マークです。ボタン列の上部に常駐し、正式ロゴではありません。',railIntro:'OpenDesk · Prompt Shortcuts：文章を下書きに挿入できる試作品です。',
      sponsorDetails:'FlowNest は架空のブランドです。実際の契約・リンク・計測はありません。',
      policy:'ポリシー評価',riskLow:'低',riskMid:'中',riskHigh:'高',riskCritical:'極高',impact:'UX影響',share:'画面共有',effort:'開発負荷',narrow:'狭い画面',confusion:'サイト混同',ownUI:'拡張UI',review:'再審査',close:'非表示',
      recommended:'審査候補',notRecommended:'公開非推奨',firstParty:'自社UI内で審査',simOnly:'模擬サイト限定',safe:'影響小',crowded:'作業を妨害',blocked:'強い妨害',great:'高',medium:'中',low:'低',poor:'低',yes:'はい',no:'いいえ',conditional:'条件付き',
      explain:'35 箇所の候補や画面上のエリアを押して表示します。B01/B02/B08 はブランド表示で広告枠ではありません。N/C は危険性を検討するだけです。',
      newGreeting:'何をお手伝いしましょうか？',mockSite:'架空のチャット画面 · サイト側の広告ではありません',userMessage:'この文章の要点をまとめてください。',assistantMessage:'要点を三つ抽出し、簡潔な要約を作成します。これは架空の会話です。',typing:'下書きのみ。自動送信はありません。',
      selected:'選択中',brandSlot:'ブランド表示 · 広告枠ではありません',sold:'販売済み',scenarioN:'新規会話',scenarioC:'既存会話',
      clickZone:'押して配置を確認',detailsTitle:'協賛の説明 · オフラインのみ',detailsClose:'閉じる',legacy:'既存 R2.7 A1–A10 の操作（保持）',
      riskHint:'第三者サイトへの広告挿入は高リスクの模擬案です。正式版には実装しません。',noData:'プロンプト・閲覧・表示・クリック・成果のデータは収集しません。'
    }
  };
  // id, Chinese, English, Japanese, qualitative risk (low|mid|high|critical).
  const raw = [
    ['B01','按钮栏常驻 OD Logo','Permanent OD rail logo','常設 OD ロゴ','low'],
    ['B02','Logo 悬浮品牌介绍','Logo hover identity','ロゴの紹介ポップ','low'],
    ['B03','按钮栏底部赞助图标','Rail sponsor icon','ボタン下の協賛','mid'],
    ['B04','赞助图标悬浮卡','Sponsor icon hover card','協賛のホバーカード','mid'],
    ['B05','赞助图标展开卡','Sponsor icon detail card','協賛の詳細カード','mid'],
    ['B06','提示词正文下文字广告','Text ad beneath prompt','本文下の文字広告','mid'],
    ['B07','悬浮窗口下半部图文广告','Tooltip graphic ad','ポップ下の画像広告','high'],
    ['B08','悬浮底部 OD 署名','Tooltip OD attribution','ポップ下の OD 署名','low'],
    ['S01','列表底部单广告卡','One panel sponsor card','一覧下の協賛1件','low'],
    ['S02','列表底部多广告卡','Multiple panel sponsor cards','一覧下の複数協賛','mid'],
    ['S03','侧边栏固定页脚','Panel pinned footer','サイドバー固定フッター','mid'],
    ['S04','新建表单下方','Under new-prompt form','新規フォーム下','mid'],
    ['S05','编辑表单下方','Under edit-prompt form','編集フォーム下','mid'],
    ['S06','提示词列表空状态','Empty prompt list','プロンプトの空状態','low'],
    ['S07','工具设置与介绍','Settings and about','ツールの設定・紹介','low'],
    ['S08','列表短时的空白区域','Whitespace under short list','短い一覧の余白','mid'],
    ['N01','模拟网页顶部导航下','Below mock page header','模擬ページの上部','high'],
    ['N02','中央问候语上方','Above central greeting','挨拶の上','high'],
    ['N03','问候语与输入框之间','Between greeting and composer','挨拶と入力欄の間','high'],
    ['N04','输入框正下方','Immediately below composer','入力欄の直下','high'],
    ['N05','输入框右侧空白','Right of composer','入力欄の右側','high'],
    ['N06','模拟网页右下角','Mock page bottom right','画面右下','high'],
    ['N07','内容区左侧空白','Left whitespace','本文の左余白','high'],
    ['N08','内容区右侧空白','Right whitespace','本文の右余白','high'],
    ['N09','快捷栏附近空白','Near shortcut rail','ショートカット付近','high'],
    ['N10','模拟页面底部','Mock page bottom','模擬ページの下部','high'],
    ['N11','宽屏中央左右侧','Wide-screen side whitespace','ワイド画面の両側','high'],
    ['N12','新会话空状态背景','New chat empty background','新規画面の背景','high'],
    ['C01','消息正文左侧','Left of messages','メッセージの左','high'],
    ['C02','消息正文右侧','Right of messages','メッセージの右','high'],
    ['C03','已有对话输入框上方','Above chat composer','既存会話の入力欄上','high'],
    ['C04','已有对话输入框下方','Below chat composer','既存会話の入力欄下','high'],
    ['C05','最后一条回答后','After final answer','最後の回答の後','high'],
    ['C06','两条对话消息之间','Between messages','会話メッセージ間','critical'],
    ['C07','滚动到底部后留白','End-of-scroll whitespace','スクロール末尾の余白','high']
  ];
  const positions = Object.fromEntries(raw.map(x => [x[0], {id:x[0], names:x.slice(1,4), risk:x[4], group:x[0][0], brand:['B01','B02','B08'].includes(x[0])}]));
  const groupNames = {B:['快捷按钮 × 悬浮窗','Rail × Tooltip','ボタン × ポップ'],S:['独立侧边栏','Side Panel','サイドバー'],N:['新对话空白区','New Chat Whitespace','新規会話の余白'],C:['已有对话','Existing Chat','既存会話']};
  const fakePrompts = {
    zh:[['润','润色文字','请润色下面的文字，保持原意，给出三条修改建议。'],['译','翻译','请将以下文字翻译成流畅的中文，并保留术语和格式。'],['总','总结','请用三条关键要点概括以下内容。'],['写','写作','请为以下想法整理一段清晰而自然的文字。']],
    en:[['P','Polish','Polish this text while preserving its meaning.'],['T','Translate','Translate this text while preserving structure and terms.'],['S','Summarize','Summarize this text into three key points.'],['W','Write','Draft a clear, natural paragraph from this idea.']],
    ja:[['推','推敲','意味を保ったまま自然な文章に推敲してください。'],['訳','翻訳','専門用語と形式を維持して翻訳してください。'],['要','要約','要点を三つに要約してください。'],['書','執筆','このアイデアから自然で明快な文章を書いてください。']]
  };
  const state = {group:'B',id:'B01',scene:'new',mode:'user',sold:0,layout:'landscape',prompts:4,boundaries:true,active:true,preset:'brand',extra:null,formMode:'new',closeRail:false,closedCards:new Set(),closedWeb:new Set(),closedTip:new Set(),pop:''};
  const T = key => (words[old.state.lang] || words.zh)[key] || key;
  const idx = () => Math.max(0, LANGS.indexOf(old.state.lang));
  const name = id => positions[id].names[idx()];
  const labelGroup = g => groupNames[g][idx()];
  const make = (tag,cls,txt) => {const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
  const entry = (key, text) => '<span data-r28-t="'+key+'">'+text+'</span>';
  const layoutOpts = [
    ['brand-logo',['常驻 OD Logo','Permanent OD mark','常設 OD ロゴ']],['brand-hover',['Logo 品牌介绍','Brand hover','ブランド紹介']],['brand-attribution',['极小品牌署名','Tiny attribution','小さな署名']],
    ['icon',['单赞助图标','Sponsor icon','協賛アイコン']],['text',['单行文字赞助','Sponsor text','協賛テキスト']],['icon-text',['图标 + 文字','Icon + text','アイコン + 文字']],['hover-card',['Hover 合作卡','Hover card','ホバーカード']],['expand-card',['点击展开详情','Expandable details','詳細を展開']],
    ['landscape',['横向图文','Horizontal card','横型カード']],['vertical',['竖向品牌卡','Vertical brand','縦型ブランド']],
    ['mini',['双列迷你','Two-column mini','二列ミニ']],['hero',['大卡 + 两小卡','Hero + two mini','大1 + 小2']],
    ['recruit',['空白招商','Recruitment','協賛募集中']],['self',['官方自推广','First-party promotion','自社紹介']],['event',['活动横幅','Event banner','イベントバナー']],['directory',['工具目录推荐','Tool recommendation','ツール推薦']],['affiliate',['联盟模型说明','Affiliate explainer','アフィリエイト説明']]
  ];
  const root = make('section','r28-controls');root.id='r28Controls';root.setAttribute('aria-label','35 placements');
  root.innerHTML =
    '<h2 data-r28-t="heading"></h2><p class="r28-sub" data-r28-t="hint"></p>'+
    '<div class="r28-line"><div class="r28-field narrow"><span data-r28-t="group"></span><div id="r28Groups" class="r28-groups"></div></div>'+
    '<label class="r28-field"><span data-r28-t="scene"></span><select id="r28Scene"></select></label>'+
    '<label class="r28-field"><span data-r28-t="inventory"></span><select id="r28Sold"></select></label>'+
    '<label class="r28-field"><span data-r28-t="mode"></span><select id="r28Mode"></select></label>'+
    '<label class="r28-field"><span data-r28-t="layout"></span><select id="r28Layout"></select></label>'+
    '<label class="r28-field narrow"><span data-r28-t="prompts"></span><select id="r28PromptCount"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>'+
    '<label class="r28-check"><input id="r28Bounds" type="checkbox" checked><span data-r28-t="boundaries"></span></label></div>'+
    '<div class="r28-presets" id="r28Presets"></div>'+
    '<div class="r28-summary"><strong id="r28Current"></strong><span id="r28Risk" class="r28-pill"></span><span id="r28Scope" class="r28-pill"></span>'+
    '<button id="r28Restore" type="button" data-r28-t="restore"></button><button id="r28Dismiss" type="button" data-r28-t="dismiss"></button></div>'+
    '<p class="r28-note" data-r28-t="explain"></p><div class="r28-points" id="r28Points" role="group" aria-label="35 candidate placements"></div>'+
    '<p class="r28-note" id="r28Announcement" role="status" aria-live="polite"></p>';
  document.querySelector('.control-panel').insertAdjacentElement('afterend',root);

  const legacy = make('details','r28-legacy');
  const legacyTitle = make('summary','',T('legacy'));legacy.append(legacyTitle);
  const oldControls = document.querySelector('.control-panel .controls');
  const oldSelectFields = [oldControls.querySelector('#placement').closest('.control'),oldControls.querySelector('#format').closest('.control')];
  oldSelectFields.forEach(x => legacy.append(x));
  legacy.append(document.querySelector('.control-panel .scenarios'),$('stateSummary'));
  root.insertAdjacentElement('afterend',legacy);

  const index = make('section','r28-index');index.setAttribute('aria-label','Qualitative comparison for 35 placements');
  index.innerHTML='<h2 data-r28-t="policy"></h2><p class="r28-sub" data-r28-t="noData"></p>'+
    '<div class="table-scroll"><table><thead><tr id="r28TableHead"></tr></thead><tbody id="r28Table"></tbody></table></div>'+
    '<p class="r28-note" data-r28-t="riskHint"></p>';
  document.querySelector('main.stage').insertAdjacentElement('afterend',index);

  const dialog=make('dialog');dialog.id='r28Dialog';dialog.setAttribute('aria-labelledby','r28DialogTitle');
  dialog.innerHTML='<h2 id="r28DialogTitle"></h2><p id="r28DialogCopy"></p><p id="r28DialogScope" class="r28-risk-banner"></p><div class="r28-modal-actions"><button id="r28DialogClose" type="button"></button></div>';
  document.body.append(dialog);
  let focusBack=null;
  const openDialog = kind => {
    focusBack=document.activeElement;
    $('r28DialogTitle').textContent=kind==='brand'?'OpenDesk · Prompt Shortcuts':T('detailsTitle');
    $('r28DialogCopy').textContent=kind==='brand'?T('brandDetails')+' '+T('railIntro'):T('sponsorDetails');
    $('r28DialogScope').textContent=positions[state.id].group==='N'||positions[state.id].group==='C'?T('riskHint'):T('noData');
    $('r28DialogClose').textContent=T('detailsClose');
    if(!dialog.open && typeof dialog.showModal==='function')dialog.showModal();
  };
  $('r28DialogClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(focusBack?.isConnected)focusBack.focus();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){state.pop='';hidePop();if(dialog.open){dialog.close();e.stopPropagation();}}
  });

  const site=document.querySelector('.sim-site'),siteBody=$('siteBody');
  const compose=document.querySelector('.sim-site > .site-compose');
  const page=make('section','r28-page');page.id='r28Page';
  siteBody.append(page);
  const rail=$('rail'),originalShortcut=$('shortcut');
  const brand=make('button','r28-mark','OD');brand.id='r28Brand';brand.type='button';
  brand.addEventListener('mouseenter',()=>showPop('brand'));brand.addEventListener('focus',()=>showPop('brand'));
  brand.addEventListener('mouseleave',hidePop);brand.addEventListener('click',()=>openDialog('brand'));
  rail.insertBefore(brand,originalShortcut);
  const extraButtons=[];
  for(let i=1;i<4;i++){
    const b=make('button','r28-shortcut','');b.type='button';
    b.addEventListener('click',()=>appendDraft(i));
    b.addEventListener('mouseenter',()=>{old.state.tipOpen=true;old.render();});
    extraButtons.push(b);rail.insertBefore(b,$('railSponsor'));
  }
  const separator=make('span','r28-rail-divider');separator.setAttribute('aria-hidden','true');rail.append(separator);
  const railAd=make('button','r28-rail-sponsor','✦');railAd.id='r28Sponsor';railAd.type='button';
  railAd.addEventListener('mouseenter',()=>showPop('sponsor'));railAd.addEventListener('focus',()=>showPop('sponsor'));
  railAd.addEventListener('mouseleave',hidePop);
  railAd.addEventListener('click',()=>openDialog('sponsor'));
  rail.append(railAd);
  const railClose=make('button','r29-rail-close','×');railClose.type='button';
  railClose.setAttribute('aria-label',T('dismiss')+' · '+T('partner'));
  railClose.addEventListener('click',()=>{state.closeRail=true;hidePop(true);sync();$('r28Restore').focus();});
  rail.append(railClose);
  const pop=make('div','r28-rail-pop');pop.id='r28Pop';pop.hidden=true;pop.setAttribute('role','status');
  rail.append(pop);

  const tipExtra=make('div','r28-tip-extra');tipExtra.id='r28TipExtra';
  $('tipSponsor').insertAdjacentElement('afterend',tipExtra);
  const slots={};
  for(const [id,parent] of [['S01',$('listView')],['S02',$('listView')],['S04',$('editView')],['S05',$('editView')],['S06',$('emptyView')],['S07',$('settingsView')],['S08',document.querySelector('.panel-scroll')]]) {
    const target=make('div','r28-panel-slot');target.id='r28Slot'+id;target.dataset.spot=id;parent.append(target);slots[id]=target;
  }
  slots.S08.addEventListener('click',e=>{if(e.target.closest('.r28-hint-card'))choose('S08');});
  slots.S03=make('span','r28-panel-footer-slot');slots.S03.id='r28SlotS03';slots.S03.dataset.spot='S03';
  document.querySelector('.panel-footer').append(slots.S03);

  let popTimer=null;
  function showPop(kind) {
    clearTimeout(popTimer);
    if(!state.active)return;
    if(kind==='sponsor'&&railAd.hidden)return;
    state.pop=kind;
    const title=kind==='brand'?'OpenDesk · Prompt Shortcuts':T('partner');
    pop.replaceChildren(make('strong','',title),make('p','',kind==='brand'?T('railIntro'):T('sponsorDetails')));
    const b=make('button','',T('view'));b.type='button';b.addEventListener('click',()=>openDialog(kind));pop.append(b);
    pop.hidden=false;pop.style.top=kind==='brand'?'0px':Math.max(0,railAd.offsetTop-18)+'px';
  }
  function hidePop(immediate=false){
    clearTimeout(popTimer);
    if(immediate){pop.hidden=true;state.pop='';return;}
    popTimer=setTimeout(()=>{if(!pop.matches(':hover')&&!pop.contains(document.activeElement)){pop.hidden=true;state.pop='';}},140);
  }
  pop.addEventListener('mouseenter',()=>clearTimeout(popTimer));
  pop.addEventListener('mouseleave',()=>hidePop());
  pop.addEventListener('focusout',()=>hidePop());
  function appendDraft(i) {
    const d=$('draft'),content=fakePrompts[old.state.lang][i][2];
    d.value+= (d.value && !d.value.endsWith('\n')?'\n':'') + content;
    d.dispatchEvent(new Event('input',{bubbles:true}));d.focus();$('r28Announcement').textContent=T('typing');
  }
  function updateRail() {
    const prompts=fakePrompts[old.state.lang];
    brand.title=T('brandDetails');brand.setAttribute('aria-label','OpenDesk · '+T('brandDetails'));
    originalShortcut.textContent=prompts[0][0];originalShortcut.hidden=state.active&&state.prompts<1;
    extraButtons.forEach((b,i)=>{b.textContent=prompts[i+1][0];b.title=prompts[i+1][1];b.setAttribute('aria-label',prompts[i+1][1]);b.hidden=!state.active||state.prompts<i+2;});
    railAd.title=T('partner');railAd.setAttribute('aria-label',T('partner')+' · '+T('view'));
    const show=state.active&&old.state.enabled&&!state.closeRail&&(state.sold>0||state.mode==='sales')&&state.preset!=='brand';
    railAd.hidden=!show;separator.hidden=!show;railClose.hidden=!show;
    railClose.setAttribute('aria-label',T('dismiss')+' · '+T('partner'));
    brand.dataset.r28Current=state.active&&['B01','B02'].includes(state.id)?'true':'false';
    railAd.dataset.r28Current=state.active&&['B03','B04','B05'].includes(state.id)?'true':'false';
    $('tip').hidden=state.active?!(old.state.tipOpen||['B06','B07','B08'].includes(state.id)):!old.state.tipOpen;
    if(state.active&&state.id==='B02')showPop('brand');
    else if(state.active&&['B04','B05'].includes(state.id)&&show)showPop('sponsor');
    else if(state.pop)hidePop();
  }
  function adCard(index,unsold,asButton,layoutOverride) {
    const unit=make(asButton?'button':'div','r28-demo-ad');
    if(asButton){unit.type='button';unit.addEventListener('click',()=>openDialog(unsold?'sponsor':index===-1?'brand':'sponsor'));}
    const layout=layoutOverride||state.layout;
    unit.dataset.layout=['icon','text','vertical','mini','brand-logo','brand-hover','brand-attribution','icon-text','hover-card','expand-card','event','directory','affiliate'].includes(layout)?layout:'landscape';
    if(unsold)unit.dataset.unsold='true';
    const firstParty=layout==='self'||layout.startsWith('brand-');
    const icon=make('span','r28-ad-icon',unsold?'+':firstParty?'OD':layout==='event'?'EV':layout==='directory'?'DX':layout==='affiliate'?'↗':'FN');
    const copy=make('span','r28-ad-copy');
    copy.append(make('strong','',unsold?T('recruit'):firstParty?layout==='brand-attribution'?'OpenDesk · Prompt Shortcuts':T('official'):layout==='event'?(['模拟效率活动','Demo productivity event','模擬イベント'][idx()]):layout==='directory'?(['工具精选 · 虚构示例','Tool picks · Fictional','ツール紹介 · 架空'][idx()]):layout==='affiliate'?(['联盟合作说明 · 不跟踪','Affiliate model · No tracking','アフィリエイト解説'][idx()]):'FlowNest · '+T('fiction')));
    copy.append(make('small','',unsold?'ID '+(index+1)+' · '+T('view'):firstParty?T('brandSlot'):T('partner')+' · '+T('demo')));
    unit.append(icon,copy);
    if(layout==='text')unit.dataset.layout='text';
    return unit;
  }
  function renderInventory(){
    for(const id of ['S01','S02','S04','S05','S06','S07','S08','S03']){slots[id].replaceChildren();delete slots[id].dataset.r28Current;}
    if(!state.active||!old.state.enabled)return;
    const view=old.state.view;
    const formTitle=$('editView').querySelector('h2');
    formTitle.textContent=state.formMode==='new'?(['新建提示词','New prompt','新規プロンプト'][idx()]):(['编辑提示词','Edit prompt','プロンプトを編集'][idx()]);
    $('editView').dataset.r29Form=state.formMode;
    const groupView=view==='edit'?'S04':view==='empty'?'S06':view==='settings'?'S07':'S02';
    const showCards=state.sold>0||state.mode==='sales';
    if(view==='list'){
      const holder=state.id==='S01'?slots.S01:slots.S02;
      if(showCards) {
        const row=make('div','r28-card-row');row.append(make('strong','',T('sold')+' '+state.sold+'/3'));
        const close=make('button','',T('dismiss'));close.type='button';close.addEventListener('click',()=>{for(let i=0;i<3;i++)state.closedCards.add(i);sync();$('r28Restore').focus();});
        row.append(close);holder.append(row);
        const list=make('div','r28-inventory');list.dataset.layout=state.layout==='mini'?'mini':state.layout==='hero'?'hero':'standard';
        const max=state.id==='S01' ? 1:3;
        for(let i=0;i<max;i++){
          if(i>=state.sold&&state.mode==='user')continue;
          if(state.closedCards.has(i))continue;
          const item=make('div','r28-panel-slot');
          item.append(adCard(i,i>=state.sold,true,i>0&&state.layout==='hero'?'mini':state.layout));
          {const closeCard=make('button','', '×');closeCard.type='button';closeCard.className='r28-dismiss-card';closeCard.setAttribute('aria-label',T('dismiss')+' '+(i+1));closeCard.addEventListener('click',()=>{state.closedCards.add(i);sync();});item.append(closeCard);}
          list.append(item);
        }
        if(list.childElementCount)holder.append(list);else holder.replaceChildren();
      }
      if(state.id==='S08'||state.group==='S'&&state.boundaries){
        slots.S08.append(make('div','r28-hint-card',name('S08')+' · '+T('clickZone')));

      }
    }else if(showCards){
      const target=state.id==='S05'?'S05':groupView;
      const holder=slots[target];
      if(!state.closedCards.has(0))holder.append(adCard(0,state.sold===0,true));
    }
    if(state.id==='S03'||(state.group==='S'&&state.boundaries)){
      const button=make('button','', 'S03 · '+T('partner'));button.type='button';button.addEventListener('click',()=>choose('S03'));slots.S03.append(button);
    }
    for(const id of ['S01','S02','S03','S04','S05','S06','S07','S08']){
      if(state.id===id&&slots[id])slots[id].dataset.r28Current='true';
    }
  }
  function zone(id,extraClass) {
    // A wrapper owns two sibling buttons: the placement trigger and its independent dismissal.
    // Never nest the close button inside a button; keyboard and touch need separate focus targets.
    const wrap=make('div','r28-zone'+(extraClass?' '+extraClass:''));wrap.dataset.spot=id;
    const trigger=make('button','r29-zone-trigger');trigger.type='button';
    trigger.addEventListener('click',()=>{if(state.id===id)openDialog('sponsor');else choose(id);});
    wrap.append(trigger);return wrap;
  }
  const abs=(id,cls) => zone(id,(cls||'')+' r28-abs');
  function createWeb(){
    const draft=$('draft'),hadDraftFocus=document.activeElement===draft;
    const selection=hadDraftFocus?[draft.selectionStart,draft.selectionEnd]:null;
    if(!state.active){site.dataset.r28Legacy='true';page.hidden=true;site.insertBefore(compose,$('bottomSponsor'));return;}
    site.dataset.r28Legacy='false';page.hidden=false;
    page.replaceChildren();
    page.append(make('span','r28-mock-meta',T('mockSite')));
    if(state.scene==='new'){
      const center=make('section','r28-center');
      center.append(zone('N02','r28-inline-spot'));
      center.append(make('h2','',T('newGreeting')));
      center.append(zone('N03','r28-inline-spot'));
      center.append(compose);
      center.append(zone('N04','r28-inline-spot'));
      page.append(center);
      for(const id of ['N01','N05','N06','N07','N08','N09','N10','N11','N12'])page.append(abs(id));
    }else{
      const wrap=make('div','r28-pseudo-website');
      const scroll=make('div','r28-chat-scroll');scroll.setAttribute('aria-label',T('scenarioC'));
      const paragraphs=state.scene==='long'?13:3;
      for(let i=0;i<paragraphs;i++){
        scroll.append(make('p','r28-human',T('userMessage')));
        if(i===1)scroll.append(zone('C06','r28-in-chat'));
        scroll.append(make('p','r28-answer',T('assistantMessage')+(state.scene==='long'?'\n'+T('assistantMessage'):'') ));
      }
      scroll.append(zone('C05','r28-in-chat'));
      wrap.append(scroll);
      if(state.scene==='long'&&state.id==='C05')scroll.scrollTop=scroll.scrollHeight;
      const foot=make('div','r28-convo-foot');
      foot.append(zone('C03','r28-inline-spot'),compose,zone('C04','r28-inline-spot'));
      wrap.append(foot);
      page.append(wrap,zone('C01','r28-convo-abs'),zone('C02','r28-convo-abs'),zone('C07','r28-convo-abs'));
      page.querySelectorAll('.r28-convo-abs').forEach(b=>b.classList.add('r28-zone'));
    }
    for(const b of page.querySelectorAll('[data-spot]')) {
      const id=b.dataset.spot;
      const selected=state.id===id||state.extra===id;
      b.dataset.r28Current=String(selected);
      b.dataset.r29Dismissed=String(state.closedWeb.has(id)||!old.state.enabled);
      b.dataset.r28Hidden=String(!selected&&(!state.boundaries||state.group!==id[0]));
      b.setAttribute('role','group');b.setAttribute('aria-label',id+' · '+name(id));
      const trigger=b.querySelector('.r29-zone-trigger');
      trigger.setAttribute('aria-label',id+' · '+name(id));trigger.setAttribute('aria-pressed',String(selected));
      const marker=make('b','',id),label=make('span','',name(id));
      trigger.append(marker,label);
      const showAd=old.state.enabled&&!state.closedWeb.has(id)&&(state.sold>0||state.mode==='sales');
      if(selected&&showAd){
        const art=make('span','r28-selected-art');
        const restricted=window.OpenDeskR28?.R29?.meta?.[id]?.narrow==='restricted'
          ||['N05','N07','N08','N11','N12','C01','C02','C06'].includes(id);
        if(site.clientWidth<720&&restricted){
          art.append(make('span','r28-risk-banner',T('riskHint')));
        }else if(id==='C06')art.append(make('span','r28-risk-banner',T('blocked')+' · '+T('notRecommended')));
        else art.append(adCard(0,state.sold===0,false,state.layout));
        trigger.append(art);
        const dismiss=make('button','r29-spot-dismiss','×');dismiss.type='button';
        dismiss.setAttribute('aria-label',T('dismiss')+' · '+id);
        dismiss.addEventListener('click',()=>{state.closedWeb.add(id);sync();$('r28Restore').focus();});
        b.append(dismiss);
      }
    }
    // Reusing the same textarea must not destroy an in-progress draft or caret.
    if(hadDraftFocus){draft.focus();try{draft.setSelectionRange(...selection);}catch{/* no selection support */}}
  }
  function renderTip() {
    tipExtra.replaceChildren();delete tipExtra.dataset.r28Current;delete document.querySelector('.tip-brand').dataset.r28Current;
    if(!state.active)return;
    if(state.id==='B08')document.querySelector('.tip-brand').dataset.r28Current='true';
    if(!old.state.enabled)return;
    if(state.id==='B06'||state.id==='B07'){
      tipExtra.dataset.r28Current='true';
      if(state.sold===0&&state.mode==='user')return;
      if(state.closedTip.has(state.id))return;
      if(!old.state.long){
        const item=make('div','r29-tip-ad');item.append(adCard(0,state.sold===0,false,state.id==='B06'?'text':state.layout));
        const close=make('button','r29-tip-dismiss','×');close.type='button';
        close.setAttribute('aria-label',T('dismiss')+' · '+state.id);
        close.addEventListener('click',()=>{state.closedTip.add(state.id);sync();$('r28Restore').focus();});
        item.append(close);tipExtra.append(item);
      }else tipExtra.append(make('span','r28-corner-note',old.state.lang==='zh'?'长正文优先 · 广告让位':old.state.lang==='ja'?'長文優先：広告を非表示':'Long prompt first · ad hidden'));
    }
  }
  const choose=(id,extra=null) => {
    state.active=true;state.id=id;state.group=id[0];state.extra=extra;state.preset='';
    if(state.group==='N')state.scene='new';
    if(state.group==='C'&&state.scene==='new')state.scene='short';
    if(state.group==='S'){if(id==='S04')state.formMode='new';if(id==='S05')state.formMode='edit';}
    if(state.group==='S')old.state.view=id==='S04'||id==='S05'?'edit':id==='S06'?'empty':id==='S07'?'settings':'list';
    else if(state.prompts!==0)old.state.view='list';
    old.state.format='logo';old.state.placement='A1';
    old.state.tipOpen=['B06','B07','B08'].includes(id);
    // Selecting a location must NEVER fabricate a sold sponsor. Zero sold stays zero.
    old.render();$('r28Announcement').textContent=id+' · '+name(id)+(state.group==='N'||state.group==='C'?' · '+T('riskHint'):'');
  };
  function preset(key) {
    state.preset=key;state.active=true;state.extra=null;state.closedCards.clear();state.closedWeb.clear();state.closedTip.clear();state.closeRail=false;old.state.enabled=true;old.state.long=false;
    if(key==='brand')Object.assign(state,{id:'B01',group:'B',scene:'new',mode:'user',sold:0,layout:'landscape',prompts:4});
    if(key==='sponsor')Object.assign(state,{id:'B03',group:'B',scene:'new',mode:'user',sold:1,layout:'icon',prompts:4});
    if(key==='hover')Object.assign(state,{id:'B07',group:'B',scene:'short',mode:'user',sold:1,layout:'landscape',prompts:4});
    if(key==='sidebar')Object.assign(state,{id:'S02',group:'S',scene:'new',mode:'sales',sold:3,layout:'hero',prompts:4});
    if(key==='newads')Object.assign(state,{id:'N03',group:'N',scene:'new',mode:'sales',sold:1,layout:'landscape',prompts:4,extra:'N04'});
    if(key==='compare')Object.assign(state,{id:'N08',group:'N',scene:'new',mode:'sales',sold:2,layout:'mini',prompts:4});
    if(key==='off')Object.assign(state,{id:'B01',group:'B',scene:'new',mode:'user',sold:0,layout:'landscape',prompts:4});
    if(key==='off')old.state.enabled=false;
    old.state.view=state.id==='S02'?'list':'list';old.state.tipOpen=key==='hover';
    old.state.placement='A1';old.state.format='logo';old.render();
  }
  function fillOptions(id,items,value){
    const el=$(id);el.replaceChildren();
    for(const [v,t] of items){const o=make('option','',t);o.value=v;el.append(o);}
    el.value=String(value);
  }
  function renderControls(){
    for(const el of root.querySelectorAll('[data-r28-t]'))el.textContent=T(el.dataset.r28T);
    for(const el of index.querySelectorAll('[data-r28-t]'))el.textContent=T(el.dataset.r28T);
    legacyTitle.textContent=T('legacy');
    const group=$('r28Groups');group.replaceChildren();
    for(const g of ['B','S','N','C']){
      const b=make('button','',g+' · '+labelGroup(g));b.type='button';b.setAttribute('aria-pressed',String(g===state.group));b.addEventListener('click',()=>choose(raw.find(x=>x[0][0]===g)[0]));group.append(b);
    }
    fillOptions('r28Scene',[['new',T('new')],['short',T('short')],['long',T('long')]],state.scene);
    fillOptions('r28Sold',[0,1,2,3].map(n=>[n,n+'/3']),state.sold);
    fillOptions('r28Mode',[['user',T('user')],['sales',T('sales')]],state.mode);
    fillOptions('r28Layout',layoutOpts.map(x=>[x[0],x[1][idx()]]),state.layout);
    $('r28PromptCount').value=String(state.prompts);$('r28Bounds').checked=state.boundaries;
    const presets=$('r28Presets');presets.replaceChildren();
    for(const key of ['brand','sponsor','hover','sidebar','newads','compare','off']){
      const b=make('button','',T(key));b.type='button';b.setAttribute('aria-pressed',String(state.preset===key));b.addEventListener('click',()=>preset(key));presets.append(b);
    }
    $('r28Current').textContent=T('selected')+': '+state.id+' · '+name(state.id);
    $('r28Risk').dataset.risk=positions[state.id].risk;
    $('r28Risk').textContent=T('policy')+': '+T({low:'riskLow',mid:'riskMid',high:'riskHigh',critical:'riskCritical'}[positions[state.id].risk]);
    $('r28Scope').textContent=positions[state.id].brand?T('brandSlot'):(state.group==='B'||state.group==='S'?T('firstParty'):T('simOnly'));
    const list=$('r28Points');list.replaceChildren();
    for(const p of raw.filter(x=>x[0][0]===state.group)){
      const id=p[0],b=make('button','r28-point');b.type='button';
      const code=make('b','',id);b.append(code,make('span','',name(id)));b.setAttribute('aria-pressed',String(state.id===id));b.addEventListener('click',()=>choose(id));list.append(b);
    }
  }
  function qualitative(id) {
    const p=positions[id],third=p.group==='N'||p.group==='C';
    return [id+' · '+name(id),
      T(id==='C06'?'blocked':p.risk==='high'?'crowded':'safe'),
      T(['B01','B02','B03','B08','N03','N04','N05','N08','S02'].includes(id)?'great':'medium'),
      T(third?'great':p.group==='B'?'low':'medium'),
      T(third?'poor':p.group==='B'?'medium':'great'),
      T(third?'great':'low'),
      T({low:'riskLow',mid:'riskMid',high:'riskHigh',critical:'riskCritical'}[p.risk]),
      T(third?'no':'yes'),
      T(third?'notRecommended':'recommended'),
      p.brand?T('brandSlot'):T('yes')];
  }
  function renderTable(){
    const keys=['selected','impact','share','effort','narrow','confusion','policy','ownUI','review','close'];
    const head=$('r28TableHead');head.replaceChildren(...keys.map(x=>make('th','',T(x))));
    const body=$('r28Table');body.replaceChildren();
    for(const row of raw){
      const id=row[0],tr=make('tr');tr.dataset.current=String(id===state.id);tr.tabIndex=0;
      for(const text of qualitative(id))tr.append(make('td','',text));
      tr.addEventListener('click',()=>choose(id));
      tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(id);}});
      body.append(tr);
    }
  }
  function sync() {
    renderControls();updateRail();renderInventory();createWeb();renderTip();renderTable();
    if(!state.active){
      $('r28Current').textContent='R2.7 · '+old.state.placement;
      $('r28Scope').textContent=T('legacy');
    }
    if(!old.state.enabled)hidePop();
  }
  for(const [id,key,transform] of [
    ['r28Scene','scene',v=>v],['r28Sold','sold',v=>Number(v)],['r28Mode','mode',v=>v],
    ['r28Layout','layout',v=>v],['r28PromptCount','prompts',v=>Number(v)]
  ])$(id).addEventListener('change',e=>{
    state[key]=transform(e.target.value);state.preset='';
    if(key==='scene'){
      if(state.scene==='new'&&state.group==='C'){state.id='N03';state.group='N';}
      if(state.scene!=='new'&&state.group==='N'){state.id='C03';state.group='C';}
    }
    if(key==='prompts'){old.state.view=state.prompts===0?'empty':'list';}
    if(state.active&&old.state.format!=='logo'){old.state.format='logo';old.state.placement='A1';}
    old.state.tipOpen=['B06','B07','B08'].includes(state.id);
    old.render();
  });
  $('r28Bounds').addEventListener('change',e=>{state.boundaries=e.target.checked;sync();});
  $('r28Dismiss').addEventListener('click',()=>{old.state.enabled=false;old.render();});
  $('r28Restore').addEventListener('click',()=>{old.state.enabled=true;state.closedCards.clear();state.closedWeb.clear();state.closedTip.clear();state.closeRail=false;old.render();});
  for(const id of ['showEdit','addFirst'])$(id).addEventListener('click',()=>{
    state.formMode='new';if(state.group==='S'){state.id='S04';old.render();}
  });
  $('resetAds').addEventListener('click',()=>{state.closedCards.clear();state.closedWeb.clear();state.closedTip.clear();state.closeRail=false;sync();});
  for(const el of [$('placement'),$('format'),...document.querySelectorAll('.preset')]){
    el.addEventListener(el.tagName==='SELECT'?'change':'click',()=>{state.active=false;state.preset='';hidePop();sync();});
  }
  window.OpenDeskR28={sync,choose,preset,positions,state,layoutOpts};
  preset('brand');
})();
