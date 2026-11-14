import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeveloperAIPrompt} from '../../src/ui/developer-ai-prompt.js';
import {BROWSER_PUBLIC_CONFIG} from '../../src/config/browser-config.js';

const locales={'zh-CN':'我的需求：',en:'My requirement:',ja:'私の要望：','zh-TW':'我的需求：'};
const modes=['controller','page','react','vue','local'];
const links=prompt=>prompt.match(/https:\/\/[^\s]+/g)||[];

test('all modes, editions and locales produce standalone instructions with an appendable goal',()=>{
  for(const [locale,ending] of Object.entries(locales))for(const mode of modes)
    for(const edition of ['standard','developer','unknown']){
      const prompt=createDeveloperAIPrompt({mode,edition},{locale});
      assert.ok(prompt.endsWith(ending));
      assert.ok(prompt.includes(`mode=${mode}; edition=${edition}`));
      for(const contract of ['Controller','Page','Sidebar','JSX/SFC','Developer','Standard','Node','React.createElement','Vue.h','SDK/Host','Stop','npm/CDN'])
        assert.ok(prompt.includes(contract),`${locale}/${mode}: ${contract}`);
      assert.ok(links(prompt).length>=6);
    }
});

test('execution worlds and matching examples follow the explicit mode',()=>{
  const expected={controller:['受控 Worker','page/Locator','async function main()'],page:['Page USER_SCRIPT','不是 MAIN','document'],react:['React：网页 Page','默认导出组件','JSX'],vue:['Vue：网页 Page','默认导出组件','SFC']};
  for(const [mode,phrases] of Object.entries(expected)){
    const prompt=createDeveloperAIPrompt({mode});
    for(const phrase of phrases)assert.ok(prompt.includes(phrase));
    const ref=BROWSER_PUBLIC_CONFIG.navigation.developerReferences[mode];
    assert.ok(links(prompt).includes(ref.help));
    assert.ok(links(prompt).includes(ref.examples));
    for(const other of Object.keys(expected).filter(other=>other!==mode))
      assert.ok(!links(prompt).includes(BROWSER_PUBLIC_CONFIG.navigation.developerReferences[other].examples));
  }
  assert.ok(createDeveloperAIPrompt({mode:'react'}).includes('#react-network-import-example'));
});

test('local kind determines the documented route without claiming directory access or connection',()=>{
  for(const projectSelected of [false,true])for(const runtimeKind of ['controller','page-userscript','sidebar-tool','unknown']){
    const prompt=createDeveloperAIPrompt({mode:'local',runtimeKind,projectSelected});
    assert.ok(prompt.includes(`runtimeKind=${runtimeKind}`));
    assert.ok(prompt.includes(projectSelected?'已选择项目':'未选择项目'));
    assert.ok(prompt.includes('实际路径、连接、授权仍未知'));
    assert.ok(prompt.includes(BROWSER_PUBLIC_CONFIG.navigation.developerGuides.localSidebarProject));
    assert.ok(prompt.includes(BROWSER_PUBLIC_CONFIG.navigation.developerGuides.completeProject));
    if(runtimeKind==='sidebar-tool'){
      for(const phrase of ['tool.config.json','OpenDeskTool.root/request','在侧栏调试','不要写成 opendesk.project.v1'])assert.ok(prompt.includes(phrase));
      assert.ok(!prompt.includes('运行本地项目'));
      assert.ok(prompt.includes(BROWSER_PUBLIC_CONFIG.navigation.developerGuides.sidebarExample));
    }else if(runtimeKind==='unknown')assert.ok(prompt.includes('未确认前不选运行/安装入口'));
    else{
      assert.ok(prompt.includes('运行本地项目'));
      assert.ok(prompt.includes(runtimeKind==='controller'?'本地 Controller':'Page 预览'));
    }
  }
});

test('only explicit booleans affect project and artifact instructions',()=>{
  const baseline=createDeveloperAIPrompt({mode:'page'});
  assert.ok(!baseline.includes('只读产物'));
  assert.ok(!baseline.includes('已选择项目'));
  assert.ok(createDeveloperAIPrompt({readOnly:true}).includes('回到原项目源码修改'));
  assert.ok(createDeveloperAIPrompt({readOnly:false}).includes('可编辑'));
  for(const value of ['true',1,null,{},[]])assert.equal(createDeveloperAIPrompt({mode:'page',readOnly:value,projectSelected:value}),baseline);
});

test('privacy allowlist never serializes source, paths, URLs, status, IDs or unknown properties',()=>{
  const extra=Object.fromEntries(['source','path','url','status','id','tabId','projectId','connection','permissions','goal'].map(key=>[key,'PRIVATE-SENTINEL']));
  const withSecret=values=>Object.defineProperty({...extra,...values},'secret',
    {enumerable:true,get(){throw Error('must not read unknown props');}});
  for(const mode of modes){
    assert.equal(createDeveloperAIPrompt(withSecret({mode})),createDeveloperAIPrompt({mode}));
    for(const key of ['mode','edition','runtimeKind']){
      const prompt=createDeveloperAIPrompt(withSecret({mode:'local',[key]:'PRIVATE-SENTINEL'}));
      assert.ok(!prompt.includes('PRIVATE-SENTINEL'));
    }
  }
  assert.equal(createDeveloperAIPrompt({mode:'page',runtimeKind:'sidebar-tool'}),createDeveloperAIPrompt({mode:'page'}));
  assert.equal(createDeveloperAIPrompt(Object.create({mode:'react',readOnly:true})),createDeveloperAIPrompt());
  assert.equal(createDeveloperAIPrompt(null),createDeveloperAIPrompt());
});

test('links use only validated config and never synthesize fallback URLs',()=>{
  const changed=structuredClone(BROWSER_PUBLIC_CONFIG);
  for(const [key] of Object.entries(changed.navigation.developerGuides))changed.navigation.developerGuides[key]=`https://reference.vendor.test/${key}`;
  for(const [mode,ref] of Object.entries(changed.navigation.developerReferences))for(const key of Object.keys(ref))ref[key]=`https://reference.vendor.test/${mode}/${key}`;
  for(const mode of modes){
    const prompt=createDeveloperAIPrompt({mode},{config:changed});
    assert.ok(links(prompt).every(link=>link.startsWith('https://reference.vendor.test/')));
    assert.ok(!prompt.includes('github.com'));
  }
  for(const config of [null,{},[],{...changed,secret:true}])for(const mode of modes){
    const prompt=createDeveloperAIPrompt({mode},{config});
    assert.deepEqual(links(prompt),[]);
    assert.ok(prompt.includes('不猜测链接或 API'));
    assert.ok(prompt.endsWith('我的需求：'));
  }
});

test('Chinese authoring instructions retain autonomous preparation, ownership, effect and secret safeguards',()=>{
  const prompt=createDeveloperAIPrompt({mode:'controller'});
  for(const phrase of ['无需拥有 Browser 仓库','不默认修改框架 src/','业务源码和测试归原项目','主动完成已授权、可逆','不只列命令','保留他人改动','定向测试','完整代码或文件','未验证','保存、编译、准备不等于运行、安装或发布','用户实际授权范围和原审批链','已有授权无需重复确认','不自动批准或扩权','撤权立即停止','不自动重放','不索取或收集密钥','不假造 API'])assert.ok(prompt.includes(phrase),phrase);
  assert.ok(prompt.length<2600,`concise prompt: ${prompt.length} characters`);
  assert.equal(createDeveloperAIPrompt({}, {locale:'fr'}),createDeveloperAIPrompt());
  assert.equal(createDeveloperAIPrompt({}, {locale:'toString'}),createDeveloperAIPrompt());
});

test('every localized local kind preserves explicit context and its own entry contract',()=>{
  for(const [locale,ending] of Object.entries(locales))
    for(const runtimeKind of ['controller','page-userscript','sidebar-tool','unknown'])
      for(const readOnly of [false,true])for(const projectSelected of [false,true]){
        const prompt=createDeveloperAIPrompt({mode:'local',runtimeKind,readOnly,projectSelected},{locale});
        assert.ok(prompt.endsWith(ending));
        assert.ok(prompt.includes(`runtimeKind=${runtimeKind}`));
        assert.notEqual(prompt,createDeveloperAIPrompt({mode:'local',runtimeKind,readOnly:!readOnly,projectSelected},{locale}));
        assert.notEqual(prompt,createDeveloperAIPrompt({mode:'local',runtimeKind,readOnly,projectSelected:!projectSelected},{locale}));
        if(runtimeKind==='sidebar-tool')assert.ok(prompt.includes('tool.config.json')&&prompt.includes('OpenDeskTool.root/request'));
        if(runtimeKind==='controller'||runtimeKind==='page-userscript')assert.ok(prompt.includes('package.json.opendesk'));
        if(runtimeKind==='page-userscript')assert.ok(prompt.includes('pageRules'));
      }
});

test('localized minimum environment steps follow the selected mode without unrelated setup',()=>{
  const expected={
    'zh-CN':{prefix:'最小环境：',direct:['实际 edition','Controller/Page','目标站点权限','用户脚本许可','无需额外 Node'],component:['实际 Developer 浏览器 JSX/SFC 编译器','Standard','Node 准备/预编译','Direct runtime'],local:['原项目 package.json/lock','Node 与包管理器版本','已安装 OpenDesk CLI 版本','分别核实 Native','源码 Provider','前者不证明后者','复用已有 watcher','已授权目录','不重复启动']},
    en:{prefix:'Minimum environment:',direct:['Browser edition','Controller/Page','target-site permissions','user-script permission','no extra Node'],component:['actual Developer browser JSX/SFC compiler','Standard','Node preparation/precompilation','Direct runtime'],local:['original package.json/lock','Node and package-manager versions','installed OpenDesk CLI version','Native pairing/connection separately','source Provider','one does not prove the other','Reuse the existing watcher','authorized directory','without duplicate starts']},
    ja:{prefix:'最小環境：',direct:['実際の edition','Controller/Page','対象サイトの権限','ユーザースクリプト許可','追加 Node','不要'],component:['実際の Developer ブラウザ JSX/SFC コンパイラ','Standard','Node 準備・事前コンパイル','Direct runtime'],local:['元の package.json/lock','Node・パッケージ管理ツールのバージョン','OpenDesk CLI バージョン','Native','ソース Provider','別々に確認','一方で他方を証明しない','既存 watcher を再利用','許可済みディレクトリ','重複起動しない']},
    'zh-TW':{prefix:'最小環境：',direct:['實際 edition','Controller/Page','目標網站權限','使用者指令碼許可','無需額外 Node'],component:['實際 Developer 瀏覽器 JSX/SFC 編譯器','Standard','Node 準備/預編譯','Direct runtime'],local:['原專案 package.json/lock','Node 與套件管理器版本','已安裝 OpenDesk CLI 版本','分別核實 Native','原始碼 Provider','前者不證明後者','重用既有 watcher','已授權目錄','不重複啟動']}
  };
  for(const [locale,copy] of Object.entries(expected))for(const mode of modes){
    const type=mode==='local'?'local':['react','vue'].includes(mode)?'component':'direct';
    const prompt=createDeveloperAIPrompt({mode},{locale});
    const step=prompt.split('\n\n').find(part=>part.startsWith(copy.prefix));
    assert.ok(step,`${locale}/${mode}: environment step`);
    for(const phrase of copy[type])assert.ok(step.includes(phrase),`${locale}/${mode}: ${phrase}`);
    assert.equal(step.includes('opendesk browser dev .'),mode==='local');
    assert.equal(step.includes('watcher'),mode==='local');
    assert.equal(step.includes('Provider'),mode==='local');
    assert.ok(!step.includes('https://'),'environment steps must not synthesize links');
  }
  const unknown=createDeveloperAIPrompt({}, {config:null});
  assert.ok(unknown.includes('先只读识别实际模式与 edition'));
  assert.deepEqual(links(unknown),[]);
});

test('all locales actively prepare missing tools, automate local tests and preserve original approval scope',()=>{
  const expected={
    'zh-CN':['官方公开文档主动完成普通、可逆','不做全机诊断','不只交付命令清单','关键目标信息缺失、需凭据、确实缺授权或涉及破坏性操作','自动执行普通本地','无需额外通用确认','用户实际授权范围和原审批链','已有授权无需重复确认','撤权立即停止','不自动重放'],
    en:['actively perform ordinary reversible','official public docs','not full-machine diagnosis or a command list alone','critical missing goal information, credentials, genuinely missing authorization or destructive operations','automatically run ordinary local','without extra generic confirmation','actual authorized scope and original approval chains','Do not reconfirm existing authorization','Stop on revocation','never automatically replay'],
    ja:['公式公開文書に従い、通常の可逆な導入・準備を自ら実施','全マシン診断やコマンド一覧だけ','重要な目的情報・認証情報の不足、実際の許可不足、破壊的操作','ローカル構文・依存確認と対象テストを自動実施','追加の一律確認は求めない','実際の許可範囲と元の承認経路','既存の許可を再確認せず','撤回時は停止','自動再実行しない'],
    'zh-TW':['官方公開文件主動完成普通、可逆','不做全機診斷','不只交付命令清單','關鍵目標資訊缺失、需憑證、確實缺授權或涉及破壞性操作','自動執行普通本機','無需額外通用確認','使用者實際授權範圍和原審批鏈','既有授權無需重複確認','撤權立即停止','不自動重播']
  };
  for(const [locale,phrases] of Object.entries(expected))for(const mode of modes){
    const prompt=createDeveloperAIPrompt({mode},{locale});
    for(const phrase of phrases)assert.ok(prompt.includes(phrase),`${locale}/${mode}: ${phrase}`);
  }
  assert.ok(!createDeveloperAIPrompt().includes('创作需求当成执行许可'));
});
