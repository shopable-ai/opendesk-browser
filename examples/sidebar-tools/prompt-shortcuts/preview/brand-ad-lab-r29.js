/* OpenDesk Prompt Shortcuts R2.9: an offline presentation catalogue, never an ad network.
   Format definitions are independent from placements. All mock ad nodes remain owned by R2.8.
   No network, storage, permissions, remote code, telemetry, or real webpage access. */
(function () {
  'use strict';
  const bridge=window.OpenDeskR27Bridge,lab=window.OpenDeskR28;
  if(!bridge||!lab){console.error('R2.9 requires the preserved R2.7/R2.8 previews');return;}
  const $=id=>document.getElementById(id);
  const langs=['zh','en','ja'];
  const i=()=>Math.max(0,langs.indexOf(bridge.state.lang));
  const tr=a=>a[i()]||a[0];
  const make=(tag,cls,text)=>{
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    return n;
  };
  const copy={
    zh:{title:'01 · 广告展示形式图鉴',subtitle:'先看广告长什么样，再决定放在哪里。所有品牌和合作内容都是虚构样例。',
      map:'02 · 35 个位置可视化地图',mapHelp:'每个位置都能选择并定位到独立侧边栏、快捷栏或虚构网页。触摸和键盘均可操作。',
      selection:'03 · 位置适配与风险',anchor:'页面锚点',suitable:'适配形式',fit:'与当前形式',good:'匹配',bad:'不推荐组合',
      ideal:'理想尺寸',narrow:'窄屏',action:'悬浮 / 点击 / 关闭',purpose:'商业目的',risk:'产品风险',
      ux:'UX 影响',share:'截图价值',confusion:'内容混淆',policy:'商店风险',dismiss:'单独关闭',
      review:'后续审查',yes:'可',no:'不适用',only:'仅虚构网页',own:'自有 UI 候选',high:'高',
      mid:'中',low:'低',critical:'极高',allowed:'经过专项审查后考虑',reject:'不建议正式上线',
      sketch:'样式示意',sponsor:'赞助 · 虚构',demo:'离线模拟',recruit:'合作展示位',
      summary:'截图方案：',brand:'品牌类',sponsors:'赞助类',cards:'卡片类',business:'商业展示类',
      narrowBlock:'窄屏不展示此位置的广告，保留输入和正文操作。',caution:'在第三方网页内容中模拟，绝非上线许可。',
      help:'点击热区查看说明；独立 × 关闭当前广告，恢复按钮可以再次显示。',jump:'查看模拟页面 ↓'},
    en:{title:'01 · Ad format gallery',subtitle:'Inspect the format first, then experiment with a placement. All sponsors are fictional.',
      map:'02 · Visual map of 35 placements',mapHelp:'Choose a position to reveal its mapped interface anchor. Mouse, keyboard and touch work.',
      selection:'03 · Placement fit & risk',anchor:'Visual anchor',suitable:'Supported formats',fit:'Current format',good:'Suitable',bad:'Not recommended',
      ideal:'Ideal size',narrow:'Narrow screens',action:'Hover / click / close',purpose:'Purpose',risk:'Risk',
      ux:'UX impact',share:'Screenshot value',confusion:'Site confusion',policy:'Store policy risk',dismiss:'Dismissible',
      review:'Review decision',yes:'Yes',no:'Not an ad',only:'Fictional web mock only',own:'Own-UI candidate',high:'High',
      mid:'Medium',low:'Low',critical:'Critical',allowed:'Review before release',reject:'Not for production',
      sketch:'Visual sample',sponsor:'Sponsored · Fictional',demo:'Offline mock',recruit:'Available sponsor slot',
      summary:'Screenshot preset:',brand:'Brand',sponsors:'Sponsorship',cards:'Cards',business:'Commercial formats',
      narrowBlock:'Hide the ad on narrow mock pages; keep draft and messages usable.',caution:'Mock third-party content only. This is not an approval to deploy.',
      help:'Click a hotspot for details, use its own × to dismiss, and Restore to bring it back.',jump:'View mock page ↓'},
    ja:{title:'01 · 広告表示形式ギャラリー',subtitle:'形式を確認してから配置を選びます。協賛ブランドはすべて架空です。',
      map:'02 · 35 箇所の配置マップ',mapHelp:'選ぶと模擬画面上の対応箇所が表示されます。キーボードとタッチに対応。',
      selection:'03 · 配置とリスク',anchor:'画面上の場所',suitable:'対応する形式',fit:'選択した形式',good:'適合',bad:'推奨しない',
      ideal:'適切なサイズ',narrow:'狭い画面',action:'ホバー / クリック / 閉じる',purpose:'利用目的',risk:'リスク',
      ux:'UX 影響',share:'共有画面での露出',confusion:'サイトとの混同',policy:'ストア審査リスク',dismiss:'個別に閉じる',
      review:'今後の検討',yes:'可能',no:'広告ではない',only:'架空ページのみ',own:'拡張の UI 候補',high:'高',
      mid:'中',low:'低',critical:'非常に高い',allowed:'公開前に審査',reject:'製品化は非推奨',
      sketch:'見本',sponsor:'協賛 · 架空',demo:'オフライン模擬',recruit:'協賛募集中',
      summary:'撮影プリセット：',brand:'ブランド',sponsors:'協賛',cards:'カード',business:'商業形式',
      narrowBlock:'狭い画面では広告を非表示にし、入力欄を優先します。',caution:'架空の第三者ページのみ。実装許可ではありません。',
      help:'表示位置をクリックすると説明、× で個別に閉じ、復元で再表示します。',jump:'模擬ページを見る ↓'}
  };
  const T=k=>(copy[bridge.state.lang]||copy.zh)[k]||k;
  // Format metadata, NOT placement/rendering logic. R2.8 owns actual ad instances.
  // [id, family, ideal size, narrow behavior, gesture, business purpose, main risk]
  const specs=[
    ['brand-logo','brand','36 × 36','恒定小标识','Hover→介绍；点击→详情；品牌不关闭','品牌来源识别','不应冒充目标网站'],
    ['brand-hover','brand','180 × 88','浮层适配可滚动','Focus / Hover 展示；Escape 关闭','品牌说明','品牌弹窗与提示词混淆'],
    ['brand-attribution','brand','160 × 24','单行截断','点击来源说明；品牌不关闭','来源署名','可能抢占提示词阅读空间'],
    ['icon','sponsors','34 × 34','仅保留一个图标','点击详情；× 独立关闭','极简赞助','与快捷按钮视觉混淆'],
    ['text','sponsors','240 × 28','文本自动换行','点击详情；× 独立关闭','文字赞助','广告标识不清'],
    ['icon-text','sponsors','240 × 44','图标可隐藏','点击详情；× 独立关闭','轻量合作展示','误触与视觉密度'],
    ['hover-card','sponsors','220 × 104','移动端改点击打开','Focus / Hover / 点击；× 关闭','合作预览','悬浮层侵扰'],
    ['expand-card','sponsors','260 × 116','详情在对话框中打开','点击打开详情；Escape 关闭','招商信息','可能与主任务争焦点'],
    ['landscape','cards','280 × 88','一列自适应','点击介绍；× 关闭','横向赞助卡','占用列表纵向空间'],
    ['vertical','cards','180 × 150','窄屏收成横卡','点击介绍；× 关闭','竖向品牌卡','窄屏占位过高'],
    ['mini','cards','2 × 140 × 62','320px 单列降级','单卡关闭 / 恢复','双列微型广告','信息难以辨认'],
    ['hero','cards','280 × 120 + 2 小卡','单列按顺序排布','每张卡单独关闭','主合作 + 多客户','广告过多挤压提示词'],
    ['recruit','business','280 × 88','只在招商模式显示','点击合作说明；× 关闭','未售库存招商','误向普通用户显示空位'],
    ['self','business','260 × 82','压缩为文字自推','点击合作说明；× 关闭','官方功能推广','模糊工具与广告边界'],
    ['event','business','300 × 64','一行静态活动','点击合作说明；× 关闭','静态活动横幅','可能制造虚假限时感'],
    ['directory','business','260 × 94','列表式轻量推荐','点击合作说明；× 关闭','工具目录推荐','不能伪造自然排名'],
    ['affiliate','business','280 × 85','仅说明不投放','只阅读合作模型','联盟合作模型研究','禁止偷偷改链或跟踪']
  ];
  // Compact user-facing metadata in all three languages: narrow, gesture, purpose, risk.
  const localized={
    'brand-logo':{en:['Tiny fixed mark','Hover to learn; tap for details; mark stays','Brand origin','Must not impersonate the website'],ja:['小型の固定マーク','ホバー・タップで説明、マークは常設','ブランドの出典','サイトのマークと誤認される恐れ']},
    'brand-hover':{en:['Popover adapts','Hover / focus / Escape closes','Brand introduction','May obscure prompt controls'],ja:['ポップを調整','ホバー・フォーカス・Escで閉じる','ブランド紹介','プロンプト操作を妨げる恐れ']},
    'brand-attribution':{en:['Single-line truncation','Open identity details','Source attribution','Competes with prompt text'],ja:['一行を省略','出典の詳細を表示','出典の明示','プロンプト本文を圧迫']},
    'icon':{en:['Keep one icon','Details on click; close individually','Minimal sponsor','Could look like a shortcut'],ja:['アイコン1つ','クリックで詳細、個別に閉じる','最小協賛','ショートカットと混同']},
    'text':{en:['Wrap gracefully','Details and separate dismissal','Text sponsorship','Disclosure can be too subtle'],ja:['自然に改行','説明と個別の閉じる操作','テキスト協賛','広告表示が目立たない']},
    'icon-text':{en:['Drop icon if needed','Click details; dismiss','Compact partnership','Density and stray taps'],ja:['必要ならアイコン省略','詳細を開き個別に閉じる','小型協賛','密度と誤操作']},
    'hover-card':{en:['Tap opens on touch','Hover / focus / click / dismiss','Partner preview','Intrusive popover'],ja:['タッチはタップで開く','ホバー・フォーカス・タップ','協賛プレビュー','ポップの割り込み']},
    'expand-card':{en:['Open details in dialog','Click details; Escape closes','Partnership details','Takes focus from main task'],ja:['詳細はダイアログ','タップで開きEscで閉じる','協賛の説明','主な作業から焦点を奪う']},
    'landscape':{en:['One responsive column','Open details / dismiss','Horizontal sponsor card','Consumes list height'],ja:['レスポンシブな1列','詳細を表示・閉じる','横長カード','一覧の高さを消費']},
    'vertical':{en:['Convert to horizontal','Open details / dismiss','Vertical brand card','Tall on small screens'],ja:['横長に切り替え','詳細を表示・閉じる','縦長カード','小画面では縦に長い']},
    'mini':{en:['Stack on 320px','Dismiss each card','Two small cards','Hard to read at scale'],ja:['320pxでは縦並び','カードごとに閉じる','2列の小型カード','文字が小さくなる']},
    'hero':{en:['Stack large then small','Each card closes separately','Lead sponsor plus minis','Displaces prompt list'],ja:['大カードと小カードを縦並び','各カードを個別に閉じる','主要協賛と小型枠','一覧を圧迫']},
    'recruit':{en:['Sales mode only','Partner details / dismiss','Unsold inventory','Must stay hidden to users'],ja:['営業モード限定','協賛説明・閉じる','未販売枠','一般利用者に出さない']},
    'self':{en:['Collapse to one line','Open product introduction','First-party recommendation','Blurs tool / ad roles'],ja:['1行の紹介に縮小','自社機能の説明を開く','自社機能紹介','機能と広告の境界が曖昧']},
    'event':{en:['Single static row','Details / dismiss','Mock event banner','Must not fake urgency'],ja:['静的な1行','詳細・閉じる','模擬イベントバナー','偽の緊急感は禁止']},
    'directory':{en:['Compact list style','Details / dismiss','Tool directory','No fabricated ranking'],ja:['小さな一覧','詳細・閉じる','ツール目録','架空の順位を避ける']},
    'affiliate':{en:['Explanation only','Read-only; no tracking','Affiliate model research','No silent link changes'],ja:['説明のみ','読み取り専用・追跡なし','成果報酬モデルの研究','黙ってリンクを変えない']}
  };
  const localizedField=(format,key)=>{
    if(i()===0||key==='ideal')return format[key];
    const fields=['narrow','action','purpose','risk'],part=localized[format.id]?.[bridge.state.lang];
    return part?.[fields.indexOf(key)]||format[key];
  };
  const formats=Object.fromEntries(specs.map(a=>[a[0],{id:a[0],family:a[1],ideal:a[2],narrow:a[3],action:a[4],purpose:a[5],risk:a[6]}]));
  const nameById=Object.fromEntries(lab.layoutOpts.map(([key,names])=>[key,names]));
  const fmtName=id=>tr(nameById[id]||[id,id,id]);
  // Each position is anchored to one UI element; the N/C selectors target fictional DOM only.
  const anchor={
    B01:'#r28Brand',B02:'#r28Brand → #r28Pop',B03:'#r28Sponsor',B04:'#r28Sponsor → #r28Pop',
    B05:'#r28Sponsor → #r28Dialog',B06:'#r28TipExtra',B07:'#r28TipExtra',B08:'.tip-brand',
    S01:'#r28SlotS01',S02:'#r28SlotS02',S03:'#r28SlotS03',S04:'#r28SlotS04',
    S05:'#r28SlotS05',S06:'#r28SlotS06',S07:'#r28SlotS07',S08:'#r28SlotS08'
  };
  for(const g of ['N','C'])for(let n=1;n<=(g==='N'?12:7);n++){
    const id=g+String(n).padStart(2,'0');
    anchor[id]='[data-spot="'+id+'"]';
  }
  const typeSets={
    brand:['brand-logo','brand-hover','brand-attribution'],
    icon:['icon','icon-text','hover-card','expand-card'],
    prompt:['text','icon-text','hover-card','expand-card'],
    panel:['text','icon-text','landscape','vertical','mini','hero','recruit','self','event','directory','affiliate'],
    footer:['text','icon-text','brand-attribution'],
    form:['text','icon-text','landscape','self'],
    empty:['recruit','self','directory'],
    settings:['brand-attribution','self','directory','affiliate'],
    web:['icon','text','icon-text','landscape','vertical','mini','hero','recruit','event','directory']
  };
  const compatible=id=>{
    if(['B01','B02','B08'].includes(id))return typeSets.brand;
    if(['B03','B04','B05'].includes(id))return typeSets.icon;
    if(['B06','B07'].includes(id))return typeSets.prompt;
    if(id==='S03')return typeSets.footer;
    if(['S04','S05'].includes(id))return typeSets.form;
    if(id==='S06')return typeSets.empty;
    if(id==='S07')return typeSets.settings;
    if(id.startsWith('S'))return typeSets.panel;
    return typeSets.web;
  };
  const meta=Object.fromEntries(Object.values(lab.positions).map(p=>{
    const web=p.group==='N'||p.group==='C';
    const intrusive=web||p.id==='B07'||p.id==='C06';
    const narrowBad=['N05','N07','N08','N11','N12','C01','C02','C06','S03'].includes(p.id);
    return [p.id,{
      ...p,anchor:anchor[p.id],formats:compatible(p.id),
      ux:p.id==='C06'?'critical':intrusive?'high':p.risk==='low'?'low':'mid',
      share:['B01','B02','B03','B08','S02','N03','N04','N05','N08'].includes(p.id)?'high':'mid',
      narrow:narrowBad?'restricted':'responsive',confusion:web?'high':p.id==='B03'?'mid':'low',
      policy:web?'critical':p.brand?'low':p.risk,
      dismissible:!p.brand,simulatedOnly:web,review:!web&&!['B07','B06'].includes(p.id)
    }];
  }));
  if(Object.keys(meta).length!==35||Object.keys(formats).length!==17)throw Error('R2.9 registry mismatch');
  const gallery=make('section','r29-gallery');gallery.id='r29Gallery';
  const head=make('div','r29-heading');head.append(make('h2',''),make('p',''));
  gallery.append(head,make('div','r29-formats'));gallery.setAttribute('aria-label','17 demo ad formats');
  $('r28Controls').insertAdjacentElement('beforebegin',gallery);
  const map=make('section','r29-map');map.id='r29Map';
  const mapHead=make('div','r29-heading');mapHead.append(make('h2',''),make('p',''));
  map.append(mapHead,make('div','r29-map-groups'));
  $('r28Controls').insertAdjacentElement('afterend',map);
  const info=make('section','r29-detail');info.id='r29Detail';
  const h2=make('h2');h2.id='r29SelectionTitle';
  const description=make('div','r29-detail-grid');description.id='r29DetailGrid';
  const note=make('p','r29-policy-note');note.id='r29DetailNote';
  info.append(h2,description,note);
  map.insertAdjacentElement('afterend',info);
  const presetInfo=make('p','r29-preset-status');presetInfo.id='r29PresetStatus';
  $('r28Presets').insertAdjacentElement('afterend',presetInfo);
  const jump=make('button','r29-jump');jump.type='button';jump.id='r29Jump';
  jump.addEventListener('click',()=>document.querySelector('main.stage').scrollIntoView({behavior:'smooth',block:'start'}));
  $('r28Current').closest('.r28-summary').append(jump);
  let lastLang='';
  function formatVisual(id){
    const sample=make('div','r29-sample');
    sample.dataset.format=id;
    const mark=make('span','r29-sample-mark',id.startsWith('brand-')||id==='self'?'OD':id==='event'?'EV':id==='directory'?'DX':id==='affiliate'?'↗':'+');
    const txt=make('span','r29-sample-text',id==='recruit'?T('recruit'):id.startsWith('brand-')?'OpenDesk':id==='affiliate'?'CPM / CPC / CPA':id==='event'?'Productivity Week':id==='directory'?'Tools · Picks':'FlowNest');
    sample.append(mark,txt);
    if(id==='hero'){
      const stack=make('span','r29-sample-stack');
      stack.append(make('i'),make('i'));sample.append(stack);
    }
    if(id==='mini'){
      const pair=make('span','r29-sample-pair');
      pair.append(make('i'),make('i'));sample.append(pair);
    }
    if(id==='expand-card')sample.append(make('span','r29-sample-extra','↗'));
    if(id==='hover-card')sample.append(make('span','r29-sample-extra','⌁'));
    if(id==='directory')sample.append(make('span','r29-sample-extra','☷'));
    return sample;
  }
  function buildGallery(){
    const root=gallery.querySelector('.r29-formats');root.replaceChildren();
    for(const family of ['brand','sponsors','cards','business']){
      const section=make('section','r29-family');
      const heading=make('h3','',T(family));section.append(heading);
      const group=make('div','r29-format-grid');
      for(const fmt of specs.filter(f=>f[1]===family)){
        const spec=formats[fmt[0]];
        const b=make('button','r29-format-card');b.type='button';b.dataset.format=spec.id;
        b.append(make('strong','',fmtName(spec.id)),formatVisual(spec.id));
        const hint=make('span','r29-format-descriptor',T('ideal')+': '+spec.ideal+' · '+localizedField(spec,'purpose'));
        const methods=make('span','r29-format-methods',localizedField(spec,'narrow')+' · '+localizedField(spec,'action'));
        const risk=make('span','r29-format-risk',T('risk')+': '+localizedField(spec,'risk'));
        b.append(hint,methods,risk);
        b.addEventListener('click',()=>{lab.state.active=true;lab.state.layout=spec.id;lab.state.preset='';bridge.state.format='logo';bridge.state.placement='A1';bridge.render();});
        group.append(b);
      }
      section.append(group);root.append(section);
    }
  }
  function buildMap(){
    const root=map.querySelector('.r29-map-groups');root.replaceChildren();
    for(const g of ['B','S','N','C']){
      const section=make('section','r29-placement-family');
      const count=Object.values(meta).filter(m=>m.group===g).length;
      section.append(make('h3','',g+' · '+count));
      const group=make('div','r29-placement-grid');
      for(const m of Object.values(meta).filter(p=>p.group===g)){
        const button=make('button','r29-placement');button.type='button';button.dataset.place=m.id;
        button.append(make('b','',m.id),make('span','',m.names[i()]));
        if(m.simulatedOnly)button.append(make('small','',T('only')));
        button.addEventListener('click',()=>lab.choose(m.id));
        group.append(button);
      }
      section.append(group);root.append(section);
    }
  }
  function metric(label,value){
    const cell=make('div','r29-metric');
    cell.append(make('small','',label),make('span','',value));return cell;
  }
  function renderSelection(){
    const s=lab.state,m=meta[s.id],format=formats[s.layout];
    h2.textContent=T('selection')+' · '+m.id+' · '+m.names[i()];
    description.replaceChildren();
    const riskName=v=>T(v==='restricted'?'high':v==='responsive'?'low':v);
    const supported=m.formats.includes(s.layout);
    const narrowText=m.narrow==='restricted'?T('narrowBlock'):localizedField(format,'narrow');
    description.append(
      metric(T('anchor'),m.anchor),
      metric(T('suitable'),m.formats.map(fmtName).join(' · ')),
      metric(T('fit'),fmtName(s.layout)+' — '+T(supported?'good':'bad')),
      metric(T('ideal'),format.ideal),
      metric(T('narrow'),narrowText),
      metric(T('action'),localizedField(format,'action')),
      metric(T('purpose'),localizedField(format,'purpose')),
      metric(T('risk'),localizedField(format,'risk')),
      metric(T('ux'),riskName(m.ux)),
      metric(T('share'),riskName(m.share)),
      metric(T('confusion'),riskName(m.confusion)),
      metric(T('policy'),riskName(m.policy)),
      metric(T('dismiss'),m.dismissible?T('yes'):T('no')),
      metric(T('review'),m.simulatedOnly?T('reject'):T('allowed'))
    );
    note.textContent=m.simulatedOnly?T('caution'):T('help');
    note.dataset.highRisk=String(m.simulatedOnly||!supported);
    const presetText=s.preset==='brand'||s.preset==='sponsor'||s.preset==='hover'||s.preset==='sidebar'||s.preset==='newads'||s.preset==='compare'||s.preset==='off'?s.preset:'custom';
    presetInfo.textContent=T('summary')+' '+presetText+' · '+s.scene+' · '+s.id+' · '+fmtName(s.layout)+' · '+s.sold+'/3 · '+s.mode;
  }
  function render(){
    if(bridge.state.lang!==lastLang){
      lastLang=bridge.state.lang;
      gallery.querySelector('h2').textContent=T('title');
      gallery.querySelector('p').textContent=T('subtitle');
      mapHead.querySelector('h2').textContent=T('map');
      mapHead.querySelector('p').textContent=T('mapHelp');
      buildGallery();buildMap();
    }
    jump.textContent=T('jump');
    gallery.querySelectorAll('[data-format]').forEach(el=>{
      if(el.matches('button'))el.setAttribute('aria-pressed',String(el.dataset.format===lab.state.layout));
    });
    map.querySelectorAll('[data-place]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.place===lab.state.id)));
    renderSelection();
  }
  const prior=lab.sync;
  lab.sync=()=>{prior();render();};
  lab.R29={formats,meta,render};
  render();
})();
