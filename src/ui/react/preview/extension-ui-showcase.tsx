import * as React from 'react';
import {
  Button as AriaButton,Checkbox,Dialog,DialogTrigger,Menu,MenuItem,MenuTrigger,
  Popover,Radio,RadioGroup,Tooltip,TooltipTrigger
} from 'react-aria-components';
import {Button,IconButton} from '../components/ui/button.tsx';
import {Switch} from '../components/ui/switch.tsx';
import {Card,CardContent} from '../components/ui/card.tsx';
import {UninstallDialog} from '../tabs/tools.tsx';
import './extension-ui-showcase.css';

// A production-React preview consumer only. The single mountSidebarApp React root owns
// the portal; this module never mounts a root, writes Host state or requests permissions.
const tabs=[{id:'controls',label:'选择与输入'},{id:'layers',label:'菜单与浮层'},{id:'states',label:'状态与恢复'}];
const svg=<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
  <circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>;

function Section({title,children}){
  return <Card className="od-demo-section"><CardContent>
    <h3>{title}</h3>{children}
  </CardContent></Card>;
}
function Row({name,forId,children,hint}){
  return <div className="od-demo-field-row">
    <label htmlFor={forId} className="od-field-label">{name}</label>
    <div className="od-demo-field-value">{children}
      {hint&&<p className="od-field-help">{hint}</p>}
    </div>
  </div>;
}

export function createExtensionUiShowcase(){return <ExtensionUiShowcase/>;}

export default function ExtensionUiShowcase(){
  const [tab,setTab]=React.useState('controls');
  const [enabled,setEnabled]=React.useState(true);
  const [selected,setSelected]=React.useState(['chat','clipboard']);
  const [radio,setRadio]=React.useState('safe');
  const [segment,setSegment]=React.useState('compact');
  const [lang,setLang]=React.useState('zh-CN');
  const [search,setSearch]=React.useState('');
  const [url,setUrl]=React.useState('https://example.com');
  const [password,setPassword]=React.useState('demo-password');
  const [visible,setVisible]=React.useState(false);
  const [count,setCount]=React.useState(10);
  const [draft,setDraft]=React.useState('可编辑的工具描述');
  const [file,setFile]=React.useState('');
  const [notice,setNotice]=React.useState('所有操作只修改当前预览内存。');
  const [sheet,setSheet]=React.useState(false),[dialog,setDialog]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [uncertain,setUncertain]=React.useState(false);
  const [committed,setCommitted]=React.useState(false);
  const inputId=React.useId(),searchId=React.useId(),urlId=React.useId();
  const pwdId=React.useId(),countId=React.useId(),textId=React.useId();
  const fileId=React.useId(),languageId=React.useId();
  const chooseTab=(next,focus=false)=>{
    setTab(next);
    if(focus)requestAnimationFrame(()=>document.querySelector('[data-od-showcase-tab="'+next+'"]')?.focus({preventScroll:true}));
  };
  const onTabsKeyDown=e=>{
    const idx=tabs.findIndex(item=>item.id===tab);
    const next=e.key==='ArrowRight'?(idx+1)%tabs.length:
      e.key==='ArrowLeft'?(idx+tabs.length-1)%tabs.length:
      e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;
    if(next<0)return;
    e.preventDefault();chooseTab(tabs[next].id,true);
  };
  const handleSave=e=>{
    e.preventDefault();
    if(!draft.trim()){setNotice('请输入描述后再保存；未修改正式设置。');setCommitted(false);return;}
    setCommitted(true);setNotice('预览内存已保存；未写入 Chrome 或 Host。');
  };
  const copy=async()=>{
    try{await navigator.clipboard.writeText(url);
      setNotice('已复制到系统剪贴板（仅输入示例）。');}
    catch{setNotice('离线文件未获得剪贴板权限：可在输入框内手动复制。');}
  };
  return <div className="od-demo-gallery" aria-label="OpenDesk React 组件与交互预览">
    <header className="od-demo-header">
      <div><strong>扩展 UI 组件规范</strong><p>正式 React 组件 · 内存交互 · 不调用真实 Host</p></div>
      <span className="od-demo-proof">UI_PREVIEW_ONLY</span>
    </header>
    <div role="tablist" aria-label="组件场景" className="od-demo-tabs" onKeyDown={onTabsKeyDown}>
      {tabs.map(item=><button type="button" role="tab" key={item.id}
        data-od-showcase-tab={item.id} id={'od-demo-tab-'+item.id}
        tabIndex={tab===item.id?0:-1} aria-selected={tab===item.id}
        aria-controls={'od-demo-panel-'+item.id}
        onClick={()=>chooseTab(item.id)}>{item.label}</button>)}
    </div>
    <main id={'od-demo-panel-'+tab} role="tabpanel" aria-labelledby={'od-demo-tab-'+tab}
      className="od-demo-body">
    {tab==='controls'&&<>
      <Section title="操作按钮">
        <div className="od-demo-actions">
          <Button variant="primary" onClick={()=>setNotice('主要操作已在预览内执行。')}>主要操作</Button>
          <Button variant="secondary" onClick={()=>setNotice('次要操作已在预览内执行。')}>次要操作</Button>
          <Button variant="quiet" onClick={()=>setNotice('轻量操作已在预览内执行。')}>轻量</Button>
          <Button variant="danger" onClick={()=>setDialog(true)}>危险操作…</Button>
          <Button disabled>已禁用</Button>
          <IconButton label="清空搜索" disabled={!search} onClick={()=>setSearch('')}>{svg}</IconButton>
        </div>
      </Section>
      <Section title="选择控件">
        <div className="od-demo-setting-row"><span>自动启用</span><Switch isSelected={enabled} onChange={setEnabled}>启用</Switch></div>
        <fieldset className="od-demo-fieldset"><legend>独立功能 · 复选</legend>
          {['chat','clipboard','history'].map(value=><Checkbox key={value} className="od-demo-check"
            isSelected={selected.includes(value)}
            onChange={yes=>setSelected(prev=>yes?[...new Set([...prev,value])]:prev.filter(v=>v!==value))}>
            {({isSelected})=><><span aria-hidden="true" className="od-demo-check-square">{isSelected?'✓':''}</span>
              {{chat:'对话',clipboard:'剪贴板',history:'历史记录'}[value]}</>}
          </Checkbox>)}
        </fieldset>
        <fieldset className="od-demo-fieldset"><legend>操作方式 · 单选</legend>
          <RadioGroup value={radio} onChange={setRadio} className="od-demo-radio-group"
            aria-label="操作方式">
            <Radio value="safe">需确认</Radio><Radio value="direct">立即执行</Radio>
          </RadioGroup>
        </fieldset>
        <fieldset className="od-demo-fieldset"><legend>表单密度 · 分段选择</legend>
          <RadioGroup value={segment} onChange={setSegment} className="od-demo-segmented"
            aria-label="表单密度">
            <Radio value="compact">紧凑</Radio><Radio value="relaxed">宽松</Radio>
          </RadioGroup>
        </fieldset>
        <Row name="界面语言" forId={languageId}><select id={languageId} className="od-field"
          value={lang} onChange={e=>setLang(e.currentTarget.value)}>
          <option value="zh-CN">简体中文</option><option value="en">English</option>
          <option value="ja">日本語</option></select></Row>
      </Section>
      <Section title="紧凑表单与组合输入">
        <form onSubmit={handleSave} className="od-demo-form" noValidate>
          <Row name="搜索" forId={searchId}><div className="od-input-group">
            <span aria-hidden="true" className="od-input-prefix">{svg}</span>
            <input id={searchId} className="od-field" type="search" value={search}
              onChange={e=>setSearch(e.currentTarget.value)} placeholder="搜索工具" />
            <button type="button" className="od-input-action" disabled={!search}
              aria-label="清空搜索" onClick={()=>setSearch('')}>×</button>
          </div></Row>
          <Row name="链接" forId={urlId}><div className="od-input-group">
            <span className="od-input-prefix">URL</span>
            <input id={urlId} className="od-field" type="url" value={url}
              onChange={e=>setUrl(e.currentTarget.value)} required/>
            <button type="button" className="od-input-action" onClick={copy}
              aria-label="复制链接" title="复制链接">复制</button>
          </div></Row>
          <Row name="密码" forId={pwdId}><div className="od-input-group">
            <span aria-hidden="true" className="od-input-prefix">••</span>
            <input id={pwdId} type={visible?'text':'password'} className="od-field"
              value={password} onChange={e=>setPassword(e.currentTarget.value)}/>
            <button type="button" className="od-input-action" aria-label={visible?'隐藏密码':'显示密码'}
              aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?'隐藏':'显示'}</button>
          </div></Row>
          <Row name="最大条数" forId={countId}><div className="od-input-group">
            <button className="od-input-action" type="button" aria-label="减少一条"
              disabled={count<=1} onClick={()=>setCount(c=>Math.max(1,c-1))}>−</button>
            <input id={countId} className="od-field" type="number" min="1" max="100" step="1"
              value={count} onChange={e=>setCount(Number(e.currentTarget.value))}/>
            <span className="od-input-suffix">条</span>
            <button className="od-input-action" type="button" aria-label="增加一条"
              disabled={count>=100} onClick={()=>setCount(c=>Math.min(100,c+1))}>+</button>
          </div></Row>
          <Row name="描述（必填）" forId={textId}
            hint={draft.length+'/160 字符 · '+(draft.length>160?'超出长度限制':'演示输入不持久保存')}>
            <textarea id={textId} rows={3} maxLength={180} aria-invalid={!draft.trim()||draft.length>160}
              className="od-field" value={draft} onChange={e=>{setDraft(e.currentTarget.value);setCommitted(false);}}/>
            {(!draft.trim()||draft.length>160)&&<p className="od-field-error" role="alert">描述必须为 1–160 字符。</p>}
          </Row>
          <Row name="导入文件（演示）" forId={fileId}>
            <input id={fileId} className="od-field" type="file" accept=".json,application/json"
              onChange={e=>{const next=e.currentTarget.files?.[0];setFile(next?next.name+' · '+next.size+' B':'');}}/>
            {file&&<p className="od-field-help">{file} · 仅显示文件信息，不安装</p>}
          </Row>
          <div className="od-demo-actions od-demo-form-actions">
            <Button variant="primary" type="submit" disabled={!draft.trim()||draft.length>160}>保存预览</Button>
            <Button onClick={()=>{setDraft('可编辑的工具描述');setCommitted(false);setNotice('已恢复演示默认值。');}}>取消更改</Button>
            {committed&&<span className="od-note">预览内存已保存</span>}
          </div>
        </form>
      </Section>
    </>}
    {tab==='layers'&&<>
      <Section title="操作菜单与轻量浮层">
        <div className="od-demo-actions">
          <MenuTrigger>
            <AriaButton className="od-button od-button--secondary">操作菜单 ▾</AriaButton>
            <Popover className="od-demo-floating">
              <Menu aria-label="示例操作" onAction={key=>setNotice('预览菜单操作：'+key)}>
                <MenuItem id="edit">编辑</MenuItem><MenuItem id="copy">复制</MenuItem>
                <MenuItem id="export">导出</MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
          <DialogTrigger>
            <AriaButton className="od-button od-button--secondary">Popover 配置</AriaButton>
            <Popover className="od-demo-floating">
              <Dialog aria-label="轻量配置" className="od-demo-popover-dialog">
                <strong>快速配置</strong><p className="od-note">使用 React Aria 的焦点与 Escape 行为。</p>
                <Switch isSelected={enabled} onChange={setEnabled}>启用示例</Switch>
                <AriaButton className="od-button od-button--quiet" slot="close">关闭</AriaButton>
              </Dialog>
            </Popover>
          </DialogTrigger>
          <TooltipTrigger>
            <AriaButton className="od-button od-button--quiet">键盘提示</AriaButton>
            <Tooltip className="od-demo-tooltip">可通过聚焦或悬停查看提示</Tooltip>
          </TooltipTrigger>
          <Button onClick={()=>setSheet(true)}>打开 Drawer / Sheet</Button>
          <Button variant="danger" onClick={()=>setDialog(true)}>打开 AlertDialog</Button>
        </div>
      </Section>
      <Section title="Disclosure 与 Tabs">
        <details className="od-disclosure od-disclosure--flat"><summary>高级设置</summary>
          <p className="od-note">使用原生 details/summary，支持键盘与点击切换。</p>
          <Switch isSelected={enabled} onChange={setEnabled}>演示开关</Switch>
        </details>
        <p className="od-note">顶部的场景切换为真实 Tab/Tabpanel，支持左右方向键、Home、End。</p>
      </Section>
    </>}
    {tab==='states'&&<>
      <Section title="真实可重现的预览状态">
        <div className="od-demo-actions">
          <Button disabled={busy} onClick={()=>{setBusy(true);setNotice('演示状态：处理中，不代表 Host 请求。');}}>开始处理中</Button>
          <Button disabled={!busy} onClick={()=>{setBusy(false);setNotice('演示状态结束。');}}>结束演示</Button>
          <Button disabled={uncertain} onClick={()=>{setUncertain(true);setNotice('演示结果未知：禁止自动重复提交。');}}>模拟结果未知</Button>
          <Button disabled={!uncertain} onClick={()=>{setUncertain(false);setNotice('仅清除了演示状态，没有真正核对 Chrome 存储。');}}>手动核对演示</Button>
          <Button onClick={()=>{setNotice('预览校验失败：请输入完整描述后再提交。');setTab('controls');}}>查看表单错误</Button>
        </div>
        {busy&&<p role="status" className="od-demo-inline-status">处理中（演示）</p>}
        {uncertain&&<p role="alert" className="od-demo-inline-status">结果未知 · 真实产品需先读回，不自动重试写入</p>}
        {!busy&&!uncertain&&<p className="od-note">当前没有未确认的预览操作。</p>}
      </Section>
      <Section title="空态与错误恢复">
        <div className="od-demo-empty">暂无演示条目</div>
        <Button onClick={()=>setNotice('演示重试已执行，没有访问 Host。')}>重试演示</Button>
      </Section>
    </>}
    </main>
    <footer className="od-demo-feedback" role="status" aria-live="polite">{notice}</footer>
    <UninstallDialog open={sheet} title="抽屉式资源管理（演示）" onCancel={()=>setSheet(false)}
      cancelLabel="关闭抽屉" panelClassName="od-demo-drawer">
      <p>此处沿用正式 React Dialog 焦点管理。正式语言包操作在「语言与翻译」页面完成。</p>
      <Row name="界面语言" forId={inputId}><select id={inputId} className="od-field"
        value={lang} onChange={e=>setLang(e.currentTarget.value)}>
        <option value="zh-CN">简体中文</option><option value="en">English</option><option value="ja">日本語</option>
      </select></Row>
      <div className="od-demo-actions"><Button data-uninstall-cancel="true" onClick={()=>setSheet(false)}>关闭</Button></div>
    </UninstallDialog>
    <UninstallDialog open={dialog} title="删除演示数据？" onCancel={()=>setDialog(false)}
      description="此操作只重置当前组件演示中的输入，不删除真实工具或数据。"
      cancelLabel="取消删除演示数据">
      <div className="od-demo-actions">
        <Button data-uninstall-cancel="true" onClick={()=>setDialog(false)}>取消</Button>
        <Button variant="danger" onClick={()=>{setDialog(false);setDraft('');setCommitted(false);setNotice('已清空演示草稿，未访问 Host。');}}>确认清空演示</Button>
      </div>
    </UninstallDialog>
  </div>;
}
