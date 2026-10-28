import * as React from 'react';
import {CookieIcon} from './CookieEditorView.jsx';

// Product-owned presentation translated from preview/cookie-editor.html.
// All enterprise figures are marked fictional and never impersonate SDK data.
// Never pass raw Cookies, password, session tokens or vault secrets to these panels.
const enterpriseFeatures=[
  ['部门与项目分组','把企业已有的账号资源按团队整理，快速了解归属和负责人。','users'],
  ['已授权入口快速使用','减少重复查找和切换；每个人只使用自己有权限的账号与工作区。','refresh'],
  ['席位、用量与成本概览','有官方数据时展示席位和预算；没有数据的服务保持「未接入」。','clock']
];
const customFeatures=[
  ['一个工作入口，覆盖更多任务','把获授权的 AI 工具用于内容整理、资料分析、问答和重复工作，降低操作成本。','share'],
  ['多账号与团队灵活管理','不同部门、项目快速找到对应工作区；归属清晰，不依赖共享密码。','users'],
  ['看清额度与使用效果','汇总合法可用的席位、预算与使用数据，无法获取的额度不猜测。','clock'],
  ['符合企业自己的工作方式','先解决少量高频任务，不另外建立审批或 OA 系统。','settings']
];
const sampleUsage=[
  {name:'ChatGPT · 运营团队',value:'6 / 10 席位',current:6,total:10,note:'已分配席位 · 非对话次数额度'},
  {name:'ChatGPT · 设计团队',value:'3 / 8 席位',current:3,total:8,note:'已分配席位 · 非对话次数额度'},
  {name:'AI API · 客服项目',value:'¥1,280 / ¥2,000',current:1280,total:2000,note:'预算消耗模拟数据'}
];
const channels=[
  {id:'telegram',name:'Telegram',tag:'行业信息 · 资源交流',info:'交流 AI 产品动态、合规资源线索及行业经验。'},
  {id:'discord',name:'Discord',tag:'开发实践 · 技术协作',info:'讨论自动化方案、扩展开发及工具使用。'},
  {id:'wechat',name:'微信',tag:'中文社群 · 商务交流',info:'交流企业需求、产品实践与业务合作信息。'}
];
function Page({id,children}){
  return <section className="cookie-business-panel cookie-account-page od-surface"
    id={'cookie-product-panel-'+id} role="tabpanel"
    aria-labelledby={'cookie-product-tab-'+id}>{children}</section>;
}
function Hero({eyebrow,title,children}){
  return <header className="cookie-business-hero">
    <small>{eyebrow}</small><h2>{title}</h2><p>{children}</p>
  </header>;
}
function FeatureList({items}){
  return <div className="cookie-business-features">
    {items.map(([title,detail,icon])=><article className="cookie-business-feature" key={title}>
      <span className="cookie-business-symbol" aria-hidden="true"><CookieIcon name={icon||'settings'}/></span>
      <div><strong>{title}</strong><p>{detail}</p></div>
    </article>)}
  </div>;
}
export function CookieEnterprisePanel({onCustomize=()=>{}}){
  return <Page id="enterprise"><div className="cookie-business-content">
    <Hero eyebrow="ENTERPRISE · 企业工作区" title="让团队 AI 账号更好管理">
      集中查看企业已有的 AI 工作区、部门席位与预算概况。让成员更快找到获授权的入口，
      减少人工统计、反复询问和账号维护成本。
    </Hero>
    <div className="cookie-business-heading"><h3>团队常见场景</h3></div>
    <FeatureList items={enterpriseFeatures}/>
    <div className="cookie-business-heading"><h3>企业资源概览</h3>
      <small>虚构示例 · 非实时</small>
    </div>
    <div className="cookie-business-usage" aria-label="虚构企业席位与预算数据" aria-describedby="cookie-enterprise-data-note">
      {sampleUsage.map(item=><article className="cookie-business-usage-row" key={item.name}>
        <div className="cookie-business-usage-line"><strong>{item.name}</strong>
          <span className="cookie-business-usage-value">{item.value}</span></div>
        <small>{item.note}</small>
        <progress value={item.current} max={item.total} aria-label={item.name+'模拟占用比例'}/>
      </article>)}
      <article className="cookie-business-usage-row">
        <div className="cookie-business-usage-line"><strong>其他 AI 服务 · 研发团队</strong>
          <span className="cookie-business-usage-value">未接入</span></div>
        <small>暂无可用管理数据</small>
        <div className="cookie-business-usage-empty" aria-label="未接入管理数据"/>
      </article>
    </div>
    <p className="cookie-business-muted" id="cookie-enterprise-data-note">
      示例席位和预算数据不代表 ChatGPT 的消息额度。真实数据取决于企业授权和服务商开放的接口。
    </p>
    <section className="cookie-business-callout">
      <strong>需要更多企业席位？</strong>
      <p>优先使用服务商官方订阅渠道。定制的工作流程可独立咨询，不引入审批系统。</p>
      <div className="cookie-business-actions">
        <a href="https://chatgpt.com/pricing/" target="_blank" rel="noopener noreferrer"
          className="od-button od-button--secondary">官方会员 / 席位</a>
        <button type="button" className="od-button od-button--quiet" onClick={onCustomize}>了解企业定制</button>
      </div>
    </section>
    <p className="cookie-business-muted">目前仅为企业功能布局演示，未接入真实企业账号、后台或用量数据。</p>
  </div></Page>;
}
export function CookieCustomizePanel({onCommunity=()=>{},draft,onDraftChange,onCopyBrief,previewMode=false}){
  const [contactOpen,setContactOpen]=React.useState(false);
  const [copyStatus,setCopyStatus]=React.useState('');
  const [copying,setCopying]=React.useState(false);
  const copyInFlight=React.useRef(false);
  const {need,note,brief}=draft;
  const updateDraft=patch=>{setCopyStatus('');onDraftChange(previous=>({...previous,...patch}));};
  const prepare=()=>updateDraft({brief:
    ['OpenDesk Browser · 企业 AI 定制需求',
     '需求方向：'+need,
     '场景说明：'+(note.trim()||'待沟通'),
     '要求：基于现有正式授权的 AI 工具和账号资源，降低日常切换、维护与人工重复操作成本。',
     '备注：请勿在场景说明中填写账号密码、Cookie 或其他登录凭据。'].join('\n')});
  const copyBrief=async()=>{
    if(copyInFlight.current||!brief)return;
    copyInFlight.current=true;setCopying(true);setCopyStatus('');
    try{
      const receipt=await onCopyBrief(brief);
      if(receipt?.copied!==true)throw Error('E_COPY_UNCONFIRMED');
      setCopyStatus(previewMode?'预览模拟：需求说明已交给模拟剪贴板。':'需求说明已复制。');
    }catch{setCopyStatus('复制未确认，请从下方摘要手动复制。');}
    finally{copyInFlight.current=false;setCopying(false);}
  };
  return <Page id="custom"><div className="cookie-business-content">
    <Hero eyebrow="CUSTOM · 企业 AI 定制" title="同一批 AI 资源，创造更多工作价值">
      让企业已有的合法授权 AI 资源用于内容创作、知识问答、客服辅助、研发和办公，
      减少重复复制、频繁切换与人工维护，让每一份 AI 投入发挥更大价值。
    </Hero>
    <section className="cookie-business-callout cookie-business-contact-strip">
      <div><strong>按团队需求配置 AI 工作方式</strong>
        <p>沟通账号归属、任务场景、成本与实施范围。</p></div>
      <button type="button" className="od-button od-button--primary cookie-button--compact"
        aria-expanded={contactOpen} aria-controls="cookie-business-contact"
        onClick={()=>setContactOpen(value=>!value)}>
        {contactOpen?'收起':'联系定制'}<CookieIcon name="right"/></button>
      {contactOpen&&<div id="cookie-business-contact" className="cookie-business-contact">
        <strong>定制联系方式 · 待公布</strong>
        <p>真实商务邮箱与社群号尚未配置，不虚构联系方式。可先生成需求摘要。</p>
        <button className="od-button od-button--quiet cookie-button--compact" type="button" onClick={onCommunity}>查看社群渠道<CookieIcon name="right"/></button>
      </div>}
    </section>
    <div className="cookie-business-heading"><h3>为企业解决什么问题</h3></div>
    <FeatureList items={customFeatures}/>
    <section className="cookie-business-callout">
      <strong>可以从哪些场景起步？</strong>
      <p>例如客服知识问答、运营内容整理、研发 AI 辅助；从一个真实场景逐步增加。</p>
    </section>
    <section className="cookie-business-inquiry" aria-label="企业定制需求意向">
      <h3>说说你最想节省的工作</h3>
      <p>不需要注册或审批，生成说明即可用于人工沟通。</p>
      <label>最关注的方向
        <select className="od-field" value={need} onChange={e=>updateDraft({need:e.target.value,brief:''})}>
          {[
            ['一套 AI 资源覆盖更多工作场景','一套 AI 资源做更多事'],
            ['企业多账号与团队使用入口','多账号与团队使用'],
            ['AI 用量、席位与预算可视化','用量与成本概览'],
            ['云端与本地 AI 工作流程','云端 / 本地 AI 工作流']
          ].map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>你的场景（选填）
        <textarea className="od-field" maxLength={300} value={note}
          placeholder="例如：让运营团队更高效使用现有 AI 工具。请勿填写账号密码或 Cookie。"
          onChange={e=>updateDraft({note:e.target.value,brief:''})}/>
      </label>
      <button type="button" className="od-button od-button--primary cookie-button--compact" onClick={prepare}>生成需求说明</button>
      {brief&&<><label>需求摘要（可手动复制）
        <textarea className="od-field" readOnly value={brief} rows={6} aria-label="需求摘要（可手动复制）"
          onFocus={e=>e.target.select()}/>
      </label><button type="button" className="od-button od-button--secondary cookie-button--compact"
        disabled={copying} onClick={()=>void copyBrief()}>复制定制需求<CookieIcon name="copy"/></button></>}
      {copyStatus&&<p role="status">{copyStatus}</p>}
      <small>文字仅在当前页面生成，不会自动发送或创建工单。</small>
    </section>
    <details className="cookie-business-disclosure"><summary>可讨论的工具与数据边界</summary>
      <p>OpenCodex、Headroom、云端 AI、本地模型等是可讨论的方向，不表示已经集成或承诺兼容。
        所有账号使用仍需遵守平台授权、企业数据政策和席位规则。</p>
    </details>
    <p className="cookie-business-muted">定制页为方案介绍与本机需求草稿，实际产品能力、接入方式、报价与交付需另行确认。</p>
  </div></Page>;
}
export function CookieCommunityPanel(){
  const [expanded,setExpanded]=React.useState('');
  return <Page id="circle"><div className="cookie-business-content">
    <Hero eyebrow="CIRCLE · 外部社群" title="加入圈子，发现更多价值信息">
      Telegram、Discord、微信等外部社群可讨论 AI 使用经验、行业信息与合作线索。
      扩展不承载站内聊天、话题发布或交易。
    </Hero>
    <div className="cookie-business-features">
      {channels.map(channel=><article className="cookie-business-channel" key={channel.id} aria-label={channel.name}>
        <div className="cookie-business-channel-top">
          <span className="cookie-business-avatar" aria-hidden="true">{channel.name.slice(0,1)}</span>
          <div><strong>{channel.name}</strong><small>{channel.tag}</small></div>
          <small className="cookie-business-channel-status">待公布</small>
        </div>
        <p>{channel.info}</p>
        <button type="button" className="od-button od-button--secondary cookie-button--compact"
          aria-expanded={expanded===channel.id}
          aria-label={channel.name+' · '+(expanded===channel.id?'收起入口':'查看入口')}
          aria-controls={'cookie-community-'+channel.id}
          onClick={()=>setExpanded(expanded===channel.id?'':channel.id)}>
          {expanded===channel.id?'收起':'查看入口'}<CookieIcon name={expanded===channel.id?'chevron':'right'}/>
        </button>
        {expanded===channel.id&&<p id={'cookie-community-'+channel.id} className="cookie-business-channel-detail">
          {channel.name} 的真实邀请链接或联系方式尚未公布。上线后直接提供对应外部入口，无需在扩展里注册或发帖。
        </p>}
      </article>)}
    </div>
    <section className="cookie-business-callout cookie-business-circle-note">
      <strong>信息在社群中交流</strong>
      <p>外部社群中的资讯和合作机会需自行核验；OpenDesk 不托管交易，也不提供登录凭据买卖渠道。</p>
    </section>
    <p className="cookie-business-muted">本页为社群入口占位。群组链接与微信联系方式尚未配置，不代表已经有真实社群或客服。</p>
  </div></Page>;
}


// External official subscription links only. No purchase, resale or payment workflow.
const officialServices=Object.freeze([
  {name:'ChatGPT',initial:'G',desc:'通用办公、写作与编程',url:'https://chatgpt.com/pricing/'},
  {name:'Claude',initial:'C',desc:'长文与研发协作',url:'https://claude.com/pricing'},
  {name:'Gemini',initial:'✦',desc:'Google AI 工具',url:'https://one.google.com/about/'},
  {name:'Grok',initial:'X',desc:'信息与研究辅助',url:'https://x.ai/pricing'},
  {name:'Perplexity',initial:'P',desc:'搜索与研究',url:'https://www.perplexity.ai/pro'}
]);
export function CookieMembershipRecommendations({origin=''}) {
  const [expanded,setExpanded]=React.useState(false);
  let currentHost='';
  try{currentHost=new URL(origin).hostname;}catch{}
  const isChatGPT=currentHost==='chatgpt.com'||currentHost.endsWith('.chatgpt.com');
  return <section className="cookie-business-membership" aria-label="官方会员与同类 AI 推荐">
    <div className="cookie-business-membership-header">
      <div><strong>会员订阅</strong><p>
        {isChatGPT?'当前 ChatGPT 网站的官方会员与同类 AI 服务。':
          '以 ChatGPT 为例展示可用的官方会员推荐。'}
      </p></div>
      <button type="button" className="od-button od-button--primary cookie-button--compact"
        aria-expanded={expanded} aria-controls="cookie-membership-services"
        onClick={()=>setExpanded(value=>!value)}>
        {expanded?'收起':'购买会员'}<CookieIcon name={expanded?'chevron':'right'}/></button>
    </div>
    {expanded&&<div id="cookie-membership-services" className="cookie-business-membership-list">
      <small>官方会员与同类推荐 · 外部订阅，不在扩展付款</small>
      {officialServices.map(service=><article className="cookie-business-membership-row" key={service.name}>
        <span className="cookie-business-avatar" aria-hidden="true">{service.initial}</span>
        <div><strong>{service.name}{isChatGPT&&service.name==='ChatGPT'?' · 当前网站':''}</strong>
          <small>{service.desc}</small></div>
        <a href={service.url} target="_blank" rel="noopener noreferrer"
          className="od-button od-button--quiet" aria-label={'前往 '+service.name+' 官方会员页面'}>官网</a>
      </article>)}
      <p>仅连接服务商官方页面，价格和权益以官网为准。不出售账号、密码、Cookie 或共享席位。</p>
    </div>}
  </section>;
}
