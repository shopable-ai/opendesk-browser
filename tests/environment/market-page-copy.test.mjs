import test from 'node:test';
import assert from 'node:assert/strict';
import {layout,home,appDetail,installPage,helpPage,collectionDetail,collectionList,installPath} from '../../src/market-site/templates.mjs';

const channel={mode:'development',enabled:true,origin:'http://127.0.0.1:43132',extensionId:'a'.repeat(32)};
const app={id:'opendesk/copy-test',toolId:'copy-test',title:'文案测试',version:'1.2.3',category:'效率',
  summary:'独立应用',description:'固定发行说明',features:['本机使用'],surfaces:['侧栏'],sites:'按需使用',
  capabilities:['storage.local'],sha256:'a'.repeat(64),bytes:123};
const subject={kind:'app',marketId:app.id,version:app.version};
const col={id:'copy-kit',revision:2,title:'固定套装',description:'逐项安装',members:[{id:app.id,version:app.version}]};
const collectionSubject={kind:'collection',collectionId:col.id,revision:col.revision};
const render=(body,extra={})=>layout({title:'市场',description:'安装说明',body,path:'/',channel,...extra});
const main=html=>html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];

test('every site page uses external scripts and has no in-page review container or iframe',()=>{
  const pages=[home([app]),appDetail(app,{current:app,versions:[app]}),installPage(subject,app.title),
    helpPage(channel),collectionList([col]),collectionDetail(col,{releases:[app],current:[app]}),
    installPage(collectionSubject,col.title),'<section><h1>找不到这个页面</h1></section>'];
  for(const body of pages){
    const html=render(body);
    assert.doesNotMatch(html,/page-install-review|在本页审阅|在本页提供安装审阅/);
    assert.equal(main(html),body);
    assert.match(html,/<script type="module" src="\/client.js"><\/script>/);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)|\bonclick=|unsafe-inline|官方应用/);
    assert.doesNotMatch(html,/<iframe\b/);
    assert.match(html,/仅发起安装审阅；应用请在 OpenDesk 侧边栏安装面板 中确认安装/);
    assert.match(html,/打开使用是独立动作；敏感权限仍遵守原有检查/);
    assert.match(html,/套装仍使用原扩展审阅页/);
  }
});

test('single app buttons request external review with separate return/open controls and fixed identity',()=>{
  for(const body of [home([app]),appDetail(app,{current:app,versions:[app]}),installPage(subject,app.title)]){
    const html=render(body,{installSubject:subject});
    assert.match(html,/>安装到OpenDesk<\/button>/);
    assert.match(html,/OpenDesk 侧边栏安装面板 中/);
    assert.match(html,/点击 OpenDesk 工具栏继续安装/);
    assert.match(html,/打开面板不表示已批准/);
    assert.doesNotMatch(html,/在本页审阅|在本页提供安装审阅|官方应用/);
    assert.match(html,/data-return-review hidden>返回同一审阅<\/button>/);
    assert.match(html,/data-open-installed hidden>打开当前安装<\/button>/);
    assert.match(html,/data-subject="\{&quot;kind&quot;:&quot;app&quot;,&quot;marketId&quot;:&quot;opendesk\/copy-test&quot;,&quot;version&quot;:&quot;1\.2\.3&quot;\}"/);
    assert.ok(html.includes('rel="opendesk-install" href="'+channel.origin+installPath(subject)+'"'));
  }
  const detail=render(appDetail(app,{current:app,versions:[app]}));
  assert.match(detail,/版本、来源（Origin）和所需能力/);
  assert.match(detail,/敏感权限与网站访问仍遵守原有检查/);
  assert.match(detail,/从市场独立下载固定版本/);
  assert.match(detail,/制品 SHA-256/);
  const install=render(installPage(subject,app.title));
  assert.match(install,/确认或取消安装；返回网页可核对进度与结果/);
  assert.match(install,/网站不会批准权限，也不会自动运行应用/);
});

test('help distinguishes app review from collection handoff and preserves distribution guidance',()=>{
  const html=render(helpPage(channel),{section:'help',path:'/how-to-install/'});
  assert.doesNotMatch(html,/安装小窗|在 OpenDesk 中审阅安装/);
  assert.match(html,/网页仅发起审阅；在 OpenDesk 侧边栏安装面板 中核对/);
  assert.match(html,/点击 OpenDesk 工具栏继续安装；打开面板不表示已批准/);
  assert.match(html,/版本、来源（Origin）与能力后确认或取消/);
  assert.match(html,/套装仍通过原扩展审阅页逐项确认/);
  assert.match(html,/无需重新编译或安装主扩展/);
  assert.match(html,/结果未知时仅核对状态/);
  assert.match(html,/安装成功以真实本机记录为准/);
  assert.match(html,/刷新、返回页面或重新连接只查询状态，不自动弹窗或安装/);
  assert.match(html,/取消后再次显式安装会发起新审阅/);
  assert.match(html,/敏感权限与网站访问仍遵守原有检查/);
});

test('collection bodies retain their existing review buttons, identity and extension entry',()=>{
  for(const body of [collectionList([col]),collectionDetail(col,{releases:[app],current:[app]}),installPage(collectionSubject,col.title)]){
    const html=render(body,{section:'collections'});
    assert.ok(main(html).startsWith(body),'collection presentation is unchanged');
    assert.doesNotMatch(main(html),/在本页审阅安装|侧边栏安装面板|点击 OpenDesk 工具栏/);
  }
  const html=render(installPage(collectionSubject,col.title),{section:'collections'});
  assert.match(html,/在 OpenDesk 中确认安装/);
  assert.match(html,/&quot;kind&quot;:&quot;collection&quot;/);
  assert.match(html,/>打开 OpenDesk 安装审阅<\/button>/);
  const detail=render(collectionDetail(col,{releases:[app],current:[app]}),{section:'collections'});
  assert.match(detail,/>在 OpenDesk 中审阅套装<\/button>/);
  assert.match(detail,/在扩展中审阅并确认；安装后由你打开。/);
});

test('rendered application content is escaped and never rewritten as installation copy',()=>{
  const summary='安装到 OpenDesk <script>用户提供的说明</script>';
  const html=render(appDetail({...app,summary},{current:app,versions:[app]}));
  assert.ok(html.includes('安装到 OpenDesk &lt;script&gt;用户提供的说明&lt;/script&gt;'));
  assert.doesNotMatch(html,/<script>用户提供的说明/);
  assert.match(html,/>安装到OpenDesk<\/button>/);
});


test('namespace and self-reported publisher never become official certification',()=>{
  const untrusted={...app,id:'opendesk/counter',publisher:'OpenDesk',official:true,verified:true};
  for(const body of [home([untrusted]),appDetail(untrusted,{current:untrusted,versions:[untrusted]})]){
    const html=render(body);
    assert.doesNotMatch(html,/官方应用|官方认证<|<dt>发布者<\/dt><dd>OpenDesk<\/dd>/);
    assert.match(html,/市场发布来源（Origin）：http:\/\/127\.0\.0\.1:43132。来源地址不表示官方认证/);
    assert.match(html,/应用/);
  }
});
