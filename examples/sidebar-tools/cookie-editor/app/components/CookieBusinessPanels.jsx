import * as React from 'react';

// Product-owned presentation translated from preview/cookie-editor.html.
// All enterprise figures are marked fictional and never impersonate SDK data.
// Never pass raw Cookies, password, session tokens or vault secrets to these panels.
const enterpriseFeatures=[
  ['部门与项目分组','把企业已有的账号资源按团队整理，快速了解归属和负责人。','users'],
  ['已授权入口快速使用','减少重复查找和切换；每个人只使用自己有权限的账号与工作区。','refresh'],
  ['席位、用量与成本概览','有官方数据时展示席位和预算；没有数据的服务保持「未接入」。','clock']
];
const customFeatures=[
  ['一个工作入口，覆盖更多任务','把获授权的 AI 工具用于内容整理、资料分析、问答和重复工作，降低操作成本。'],
  ['多账号与团队灵活管理','不同部门、项目快速找到对应工作区；归属清晰，不依赖共享密码。'],
  ['看清额度与使用效果','汇总合法可用的席位、预算与使用数据，无法获取的额度不猜测。'],
  ['符合企业自己的工作方式','先解决少量高频任务，不另外建立审批或 OA 系统。']
];
const sampleUsage=[
  {name:'ChatGPT · 运营团队',value:'6 / 10 席位',current:6,total:10,note:'已分配席位 · 非对话次数额度'},
  {name:'ChatGPT · 设计团队',value:'3 / 8 席位',current:3,total:8,note:'已分配席位 · 非对话次数额度'},
  {name:'AI API · 客服项目',value:'¥1,280 / ¥2,000',current:1280,total:2000,note:'预算消耗模拟数据'}
];
const channels=[
  {id:'telegram',name:'Telegram',tag:'行业资讯与交流',info:'讨论 AI 工具使用、行业信息和资源线索。'},
  {id:'discord',name:'Discord',tag:'开发者与工作流',info:'讨论 AI 工程化、自动化工作流程和实践经验。'},
  {id:'wechat',name:'微信',tag:'中文交流与合作',info:'讨论企业使用经验、商务合作及其他信息。'}
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
    {items.map(([title,detail],i)=><article className="cookie-business-feature" key={title}>
      <span className="cookie-business-symbol" aria-hidden="true">{i+1}</span>
      <div><strong>{title}</strong><p>{detail}</p></div>
    </article>)}
  </div>;
}
export function CookieEnterprisePanel({previewMode=false,onCustomize=()=>{}}){
  return <Page id="enterprise"><div className="cookie-business-content">
    <Hero eyebrow="ENTERPRISE · 企业工作区" title="让团队 AI 账号更好管理">
      集中查看企业已有的 AI 工作区、部门席位与预算概况。让成员更快找到获授权的入口，
      减少人工统计、反复询问和账号维护成本。
    </Hero>
    <h3>团队常见场景</h3><FeatureList items={enterpriseFeatures}/>
    <div className="cookie-business-heading"><h3>企业资源概览</h3>
      <small>{previewMode?'虚构示例 · 非实时':'尚未接入企业数据'}</small>
    </div>
    {previewMode?<div className="cookie-business-usage" aria-label="虚构企业席位与预算数据">
      {sampleUsage.map(item=><article className="cookie-business-usage-row" key={item.name}>
        <div><strong>{item.name}</strong><strong>{item.value}</strong></div>
        <small>{item.note}</small>
        <progress value={item.current} max={item.total} aria-label={item.name+'模拟占用比例'}/>
      </article>)}
      <p>示例席位、预算不代表 ChatGPT 对话次数额度。真实数据需企业授权和官方接口。</p>
    </div>:<p className="cookie-business-muted">
      尚未接入真实企业账号、席位或使用额度。需要由组织授权并使用服务商支持的正式接口。
    </p>}
    <section className="cookie-business-callout">
      <strong>需要更多企业席位？</strong>
      <p>优先使用服务商官方订阅渠道。定制的工作流程可独立咨询，不引入审批系统。</p>
      <div className="cookie-business-actions">
        <a href="https://chatgpt.com/pricing/" target="_blank" rel="noopener noreferrer"
          className="od-button od-button--secondary">官方会员 / 席位</a>
        <button type="button" className="od-button od-button--quiet" onClick={onCustomize}>了解企业定制</button>
      </div>
    </section>
  </div></Page>;
}
export function CookieCustomizePanel({onCommunity=()=>{}}){
  const [contactOpen,setContactOpen]=React.useState(false);
  const [need,setNeed]=React.useState('一套 AI 资源覆盖更多工作场景');
  const [note,setNote]=React.useState('');
  const [brief,setBrief]=React.useState('');
  const prepare=()=>setBrief(
    ['OpenDesk Browser · 企业 AI 定制需求',
     '需求方向：'+need,
     '场景说明：'+(note.trim()||'待沟通'),
     '要求：基于现有正式授权的 AI 工具和账号资源，降低日常切换、维护与人工重复操作成本。',
     '备注：不包含账号密码、Cookie 或其他登录凭据。'].join('\n'));
  return <Page id="custom"><div className="cookie-business-content">
    <Hero eyebrow="CUSTOM · 企业 AI 定制" title="同一批 AI 资源，创造更多工作价值">
      让企业已有的合法授权 AI 资源用于内容创作、知识问答、客服辅助、研发和办公，
      减少重复复制、频繁切换与人工维护，让每一份 AI 投入发挥更大价值。
    </Hero>
    <section className="cookie-business-callout">
      <strong>按团队需求配置 AI 工作方式</strong>
      <p>沟通账号归属、任务场景、成本与实施范围。</p>
      <button type="button" className="od-button od-button--primary"
        aria-expanded={contactOpen} aria-controls="cookie-business-contact"
        onClick={()=>setContactOpen(value=>!value)}>
        {contactOpen?'收起联系方式':'联系定制'}</button>
      {contactOpen&&<div id="cookie-business-contact" className="cookie-business-contact">
        <strong>定制联系方式 · 待公布</strong>
        <p>真实商务邮箱与社群号尚未配置，不虚构联系方式。可先生成需求摘要。</p>
        <button className="od-button od-button--secondary" type="button" onClick={onCommunity}>查看社群渠道</button>
      </div>}
    </section>
    <h3>为企业解决什么问题</h3><FeatureList items={customFeatures}/>
    <section className="cookie-business-callout">
      <strong>可以从哪些场景起步？</strong>
      <p>例如客服知识问答、运营内容整理、研发 AI 辅助；从一个真实场景逐步增加。</p>
    </section>
    <section className="cookie-business-inquiry" aria-label="企业定制需求意向">
      <h3>说说你最想节省的工作</h3>
      <p>不需要注册或审批，生成说明即可用于人工沟通。</p>
      <label>最关注的方向
        <select className="od-field" value={need} onChange={e=>{setNeed(e.target.value);setBrief('');}}>
          {['一套 AI 资源覆盖更多工作场景','企业多账号与团队使用入口',
            'AI 用量、席位与预算可视化','云端与本地 AI 工作流程']
            .map(option=><option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label>你的场景（选填）
        <textarea className="od-field" maxLength={300} value={note}
          placeholder="例如：让运营团队更高效使用现有 AI 工具。请勿填写账号密码或 Cookie。"
          onChange={e=>{setNote(e.target.value);setBrief('');}}/>
      </label>
      <button type="button" className="od-button od-button--primary" onClick={prepare}>生成需求说明</button>
      {brief&&<label>需求摘要（可手动复制）
        <textarea className="od-field" readOnly value={brief} rows={6}
          onFocus={e=>e.target.select()}/>
      </label>}
      <small>文字仅在当前页面生成，不会自动发送或创建工单。</small>
    </section>
    <details className="cookie-business-disclosure"><summary>可讨论的工具与数据边界</summary>
      <p>OpenCodex、Headroom、云端 AI、本地模型等是可讨论的方向，不表示已经集成或承诺兼容。
        所有账号使用仍需遵守平台授权、企业数据政策和席位规则。</p>
    </details>
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
      {channels.map(channel=><article className="cookie-business-channel" key={channel.id}>
        <div className="cookie-business-channel-top">
          <span className="cookie-business-avatar" aria-hidden="true">{channel.name.slice(0,1)}</span>
          <div><strong>{channel.name}</strong><small>{channel.tag}</small></div>
          <small>待公布</small>
        </div>
        <p>{channel.info}</p>
        <button type="button" className="od-button od-button--quiet"
          aria-expanded={expanded===channel.id}
          onClick={()=>setExpanded(expanded===channel.id?'':channel.id)}>
          {expanded===channel.id?'收起':'查看入口'}
        </button>
        {expanded===channel.id&&<p className="cookie-business-muted">
          真实邀请链接或联系方式尚未公布。上线后直接提供对应外部入口，无需在扩展里注册或发帖。
        </p>}
      </article>)}
    </div>
    <p className="cookie-business-muted">
      外部社群中的资讯和合作机会需自行核验；OpenDesk 不托管交易，也不提供登录凭据买卖渠道。
    </p>
  </div></Page>;
}
