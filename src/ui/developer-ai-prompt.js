import {BROWSER_PUBLIC_CONFIG,resolveBrowserPublicConfig} from '../config/browser-config.js';

// One content schema and one assembly path for every locale. No editor/source data is copied.
const CONTENT={
  'zh-CN':{
    intro:'请根据末尾需求，为普通 OpenDesk Browser 作者完成可用实现；无需拥有 Browser 仓库或安装维护者 Skill。先读下列公开文档和对应示例，按真实能力工作。',
    context:'已知上下文', unknown:'未知', selected:'已选择项目', unselected:'未选择项目', readOnly:'只读产物：回到原项目源码修改、重新准备，不编辑生成物。', editable:'编辑状态：可编辑。',
    worlds:{controller:'Controller：受控 Worker，使用 page/Locator；无网页 document。单文件 async function main()，多文件 ESM 默认导出 main。',page:'Page USER_SCRIPT：在获准网页文档中使用 document；无 Controller page/params/axiosx，不是 MAIN。',react:'React：网页 Page 受管 UI，默认导出组件；JSX 需编译，不是 Controller 或侧栏应用。',vue:'Vue：网页 Page 受管 UI，默认导出组件；SFC 需编译，不是 Controller 或侧栏应用。',local:'本地项目：先核实原项目声明，再决定运行世界，不按文件名推断。',unknown:'当前模式未知：先按目标区分 Controller 自动化、Page 网页增强与 Sidebar 侧栏应用。'},
    local:{controller:'本地 Controller：复用原 package.json.opendesk 项目及已授权目录连接；开发 → 本地项目 → 运行本地项目。', 'page-userscript':'本地 Page USER_SCRIPT：复用原 package.json.opendesk/pageRules；开发 → 本地项目 → 运行本地项目，走 Page 预览；安装另行审阅。','sidebar-tool':'本地 Sidebar Tool：复用原 tool.config.json 和沙箱 OpenDeskTool.root/request；开发 → 本地项目 → 在侧栏调试，打包后在扩展审阅安装；不要写成 opendesk.project.v1 的 runtimeKind。',unknown:'本地类型未知：先查看获准项目的 README/配置，识别 Controller、Page 或 Sidebar，未确认前不选运行/安装入口。'},
    localTruth:'选择项目不证明目录、连接或权限有效；实际路径、连接、授权仍未知，按真实回执核实，不编造已接入或成功。',
    environment:{
      direct:'最小环境：核对已有 Browser 的实际 edition、Controller/Page 执行世界及目标站点权限；Page 还需用户脚本许可。直接 JS 无需额外 Node 或本地服务。',
      component:'最小环境：核实实际 Developer 浏览器 JSX/SFC 编译器；Standard 核对本地 Node 准备/预编译路径，或选无需编译的 Direct runtime；不把原始 JSX/SFC 当普通 JS。',
      local:'最小环境：检查原项目 package.json/lock、所需 Node 与包管理器版本、已安装 OpenDesk CLI 版本；分别核实 Native 配对/连接与源码 Provider 在线状态，前者不证明后者。复用已有 watcher，仅按需在已授权目录用公开命令 opendesk browser dev . 准备，不重复启动。',
      unknown:'最小环境：先只读识别实际模式与 edition，再按对应公开入口准备，不预装整套工具链。'
    },
    prepare:'缺工具时按官方公开文档主动完成普通、可逆的安装与准备，复用现有环境；只处理当前入口所需项，不做全机诊断，不只交付命令清单。',
    compiler:'Developer 支持浏览器内单组件 JSX/SFC 编译；Standard 无此编译器，可用 Node 本地准备/预编译，或 React.createElement / Vue.h 的 Direct JS 与固定 runtime。edition 未知先核实，不强制切版本。',
    workflow:'先确认末尾目标，区分 Controller 自动化、Page 网页增强和 Sidebar 侧栏应用，复用正确现有项目和依赖，保留他人改动；无项目才在用户工作区建立最小独立项目。不要求克隆 Browser 仓库，不默认修改框架 src/ 或搭建第二套 SDK/Host。业务源码和测试归原项目。主动完成已授权、可逆的环境检查、依赖准备和实现，不只列命令让用户执行；复用已有连接/服务，不覆盖或停止其他任务。仅在关键目标信息缺失、需凭据、确实缺授权或涉及破坏性操作时询问。',
    verify:'完成最小实现，自动执行普通本地语法/依赖检查与定向测试，无需额外通用确认。交付完整代码或文件、准备/使用步骤、改动及实际验证结果，区分未验证与成功。',
    safety:'保存、编译、准备不等于运行、安装或发布；真实网页/网络副作用、试运行、侧栏调试、安装与权限操作按用户实际授权范围和原审批链执行，已有授权无需重复确认，不自动批准或扩权。撤权立即停止；断线、超时或副作用未知时只读查原结果，不自动重放，Stop 不保证回滚。',
    api:'仅用公开已实现 SDK/运行时和各世界真实全局，不假造 API、Chrome 特权或任意 npm/CDN 可用性；缺能力报告具体阻塞。不索取或收集密钥、令牌、Cookie、密码等秘密。',
    docs:'公开参考（文档语言以链接为准）', unavailable:'公开参考配置不可用；仅依据可核实的官方公开文档，不猜测链接或 API，无法核实的能力标记未验证。', requirement:'我的需求：'
  },
  en:{
    intro:'Implement the goal appended below for an ordinary OpenDesk Browser author. Owning the Browser repository or installing maintainer skills is unnecessary. Read the public docs and matching examples below; use actual supported capabilities.',
    context:'Known context',unknown:'unknown',selected:'project selected',unselected:'no project selected',readOnly:'Read-only artifact: edit the original project source and prepare again; do not edit generated output.',editable:'Editor: editable.',
    worlds:{controller:'Controller: controlled Worker with page/Locator, no website document. Single-file async function main(); multi-file ESM exports main by default.',page:'Page USER_SCRIPT: document in the authorized webpage; no Controller page/params/axiosx; not MAIN.',react:'React: managed Page UI with a default component export. JSX requires compilation; this is neither Controller nor Sidebar.',vue:'Vue: managed Page UI with a default component export. SFC requires compilation; this is neither Controller nor Sidebar.',local:'Local project: verify its original declarations before choosing a runtime; do not infer from filenames.',unknown:'Unknown mode: first distinguish Controller automation, Page enhancement and Sidebar applications from the goal.'},
    local:{controller:'Local Controller: reuse the original package.json.opendesk project and authorized directory connection; Develop → Local project → Run local project.','page-userscript':'Local Page USER_SCRIPT: reuse original package.json.opendesk/pageRules; Develop → Local project → Run local project uses Page preview; installation needs separate review.','sidebar-tool':'Local Sidebar Tool: reuse tool.config.json and sandbox OpenDeskTool.root/request; Develop → Local project → Debug in sidebar; package then review installation in Extensions. Do not declare this as an opendesk.project.v1 runtimeKind.',unknown:'Local type unknown: inspect the authorized project README/config to distinguish Controller, Page or Sidebar before choosing execution/installation.'},
    localTruth:'Project selection proves neither directory access, connection nor permission. Actual path, connection and grants remain unknown; verify real receipts, never claim a connection or success without evidence.',
    environment:{
      direct:'Minimum environment: verify the existing Browser edition, Controller/Page world and target-site permissions; Page also needs user-script permission. Direct JS needs no extra Node or local service.',
      component:'Minimum environment: verify the actual Developer browser JSX/SFC compiler; for Standard verify local Node preparation/precompilation or choose the compiler-free Direct runtime. Never treat raw JSX/SFC as plain JS.',
      local:'Minimum environment: check the original package.json/lock, required Node and package-manager versions, and installed OpenDesk CLI version. Verify Native pairing/connection separately from source Provider availability; one does not prove the other. Reuse the existing watcher; only as needed prepare an authorized directory with the documented opendesk browser dev . command, without duplicate starts.',
      unknown:'Minimum environment: identify the actual mode and edition read-only, then prepare its documented route; do not preinstall an entire toolchain.'
    },
    prepare:'For missing tools, actively perform ordinary reversible installation and preparation through official public docs, reusing the existing environment. Address only the current entry requirements, not full-machine diagnosis or a command list alone.',
    compiler:'Developer provides browser compilation for single-component JSX/SFC. Standard has no such compiler: use local Node preparation/precompilation or React.createElement / Vue.h Direct JS with the fixed runtime. Verify an unknown edition; do not require switching editions.',
    workflow:'Confirm the appended goal; distinguish Controller automation, Page enhancement and Sidebar applications, then reuse the correct project and dependencies and preserve concurrent edits. Create a minimal independent project in the user workspace only if none exists. Do not require cloning Browser or modifying framework src/ by default, or build another SDK/Host. Business source and tests belong to their project. Perform authorized reversible environment checks, dependency preparation and implementation yourself, rather than only listing commands. Reuse existing connections/services; do not overwrite or stop other tasks. Ask only for critical missing goal information, credentials, genuinely missing authorization or destructive operations.',
    verify:'Implement the smallest working change; automatically run ordinary local syntax/dependency checks and targeted tests without extra generic confirmation. Deliver complete code/files, preparation/use steps, changes and actual verification results; mark unverified behavior explicitly.',
    safety:'Saving, compiling and preparing are not running, installing or publishing. Real web/network effects, trial runs, sidebar debugging, installation and permissions follow the user’s actual authorized scope and original approval chains. Do not reconfirm existing authorization or auto-approve or expand permissions. Stop on revocation. On disconnection, timeout or unknown effects, query the original result read-only and never automatically replay; Stop does not guarantee rollback.',
    api:'Use only documented implemented SDK/runtime capabilities and actual globals per world. Never invent APIs, Chrome privileges or arbitrary npm/CDN support; report concrete capability blockers. Do not request or collect secrets such as keys, tokens, cookies or passwords.',
    docs:'Public references (document language follows the links)',unavailable:'Public reference config unavailable: use only verifiable official public docs; do not guess links or APIs, and mark unverifiable capabilities as unverified.',requirement:'My requirement:'
  },
  ja:{
    intro:'末尾の要望に基づき、一般の OpenDesk Browser 作者向けに実装してください。Browser リポジトリや保守者 Skill の導入は不要です。以下の公開文書と対応例を読み、実在する機能を使ってください。',
    context:'既知の状況',unknown:'不明',selected:'プロジェクト選択済み',unselected:'プロジェクト未選択',readOnly:'読み取り専用の成果物：元のプロジェクトのソースを修正して再準備し、生成物は編集しない。',editable:'編集可能。',
    worlds:{controller:'Controller：制御された Worker の page/Locator を使用。Web の document はない。単一ファイルは async function main()、複数ファイル ESM は main をデフォルト export。',page:'Page USER_SCRIPT：許可された Web 文書の document を使用。Controller の page/params/axiosx はなく、MAIN でもない。',react:'React：管理された Page UI、コンポーネントをデフォルト export。JSX はコンパイルが必要。Controller や Sidebar ではない。',vue:'Vue：管理された Page UI、コンポーネントをデフォルト export。SFC はコンパイルが必要。Controller や Sidebar ではない。',local:'ローカルプロジェクト：元の宣言を確認して実行環境を選ぶ。ファイル名で推測しない。',unknown:'モード不明：目的から Controller 自動化、Page 拡張、Sidebar アプリを区別する。'},
    local:{controller:'ローカル Controller：元の package.json.opendesk と許可済みディレクトリ接続を再利用。開発 → ローカルプロジェクト → ローカルプロジェクトを実行。','page-userscript':'ローカル Page USER_SCRIPT：元の package.json.opendesk/pageRules を再利用。開発 → ローカルプロジェクト → ローカルプロジェクトを実行で Page プレビュー。インストールは別途審査。','sidebar-tool':'ローカル Sidebar Tool：元の tool.config.json とサンドボックス OpenDeskTool.root/request を再利用。開発 → ローカルプロジェクト → サイドバーでデバッグ。パッケージ化後に拡張でインストール審査。opendesk.project.v1 の runtimeKind にしない。',unknown:'ローカル種別不明：許可された README/設定を確認し Controller、Page、Sidebar を識別するまで、実行・インストール経路を決めない。'},
    localTruth:'選択済みでもディレクトリ、接続、権限の証明にはならない。実際のパス、接続、許可は不明。実際の応答で確認し、接続や成功を捏造しない。',
    environment:{
      direct:'最小環境：既存 Browser の実際の edition、Controller/Page の実行環境、対象サイトの権限を確認。Page はユーザースクリプト許可も必要。直接 JS に追加 Node やローカルサービスは不要。',
      component:'最小環境：実際の Developer ブラウザ JSX/SFC コンパイラを確認。Standard はローカル Node 準備・事前コンパイル経路、またはコンパイル不要の Direct runtime を選ぶ。生の JSX/SFC を通常 JS としない。',
      local:'最小環境：元の package.json/lock、必要な Node・パッケージ管理ツールのバージョン、導入済み OpenDesk CLI バージョンを確認。Native のペアリング・接続とソース Provider の稼働状態は別々に確認し、一方で他方を証明しない。既存 watcher を再利用し、必要な場合だけ許可済みディレクトリで公開コマンド opendesk browser dev . により準備し、重複起動しない。',
      unknown:'最小環境：実際のモードと edition を読み取りで識別して対応する公開経路を準備し、全ツールチェーンを先に導入しない。'
    },
    prepare:'不足ツールは公式公開文書に従い、通常の可逆な導入・準備を自ら実施して既存環境を再利用する。現在の入口に必要な範囲に絞り、全マシン診断やコマンド一覧だけの引き渡しはしない。',
    compiler:'Developer はブラウザ内の単一 JSX/SFC コンポーネントのコンパイルに対応。Standard は非対応：Node ローカル準備・事前コンパイル、または React.createElement / Vue.h の Direct JS と固定 runtime を使う。edition 不明なら確認し、変更を強制しない。',
    workflow:'末尾の目的を確認し、Controller 自動化・Page 拡張・Sidebar アプリを区別し、正しい既存プロジェクト・依存関係を再利用して並行変更を保持する。既存がない場合だけユーザーの作業領域に最小の独立プロジェクトを作る。Browser の clone、保守者の環境、通常のフレームワーク src/ 修正や別 SDK/Host を要求しない。業務ソースとテストは元のプロジェクトに置く。許可済みで可逆な環境確認・依存準備・実装を自ら行い、コマンド一覧だけ渡さない。既存の接続・サービスを再利用し、他のタスクを上書き・停止しない。重要な目的情報・認証情報の不足、実際の許可不足、破壊的操作の場合だけ質問する。',
    verify:'最小実装後、通常のローカル構文・依存確認と対象テストを自動実施し、追加の一律確認は求めない。完全なコード・ファイル、準備・使用手順、変更点と実測結果を渡し、未検証を明記する。',
    safety:'保存・コンパイル・準備は実行・インストール・公開ではない。実際の Web/ネットワークへの作用、試運転、サイドバーデバッグ、インストール・権限操作はユーザーの実際の許可範囲と元の承認経路に従う。既存の許可を再確認せず、権限を自動承認・拡大しない。撤回時は停止。切断・タイムアウト・作用不明時は元の結果を読み取りで確認し、自動再実行しない。Stop は取り消しを保証しない。',
    api:'公開された実装済み SDK/runtime と各環境の実際のグローバルだけを使う。API、Chrome 特権、任意の npm/CDN 対応を捏造せず、不足機能は具体的に報告する。鍵・トークン・Cookie・パスワードなどの秘密を要求・収集しない。',
    docs:'公開参考（文書の言語はリンク先に従う）',unavailable:'公開参考設定が利用不可。確認できる公式公開文書のみを使い、リンクや API を推測せず、確認できない機能は未検証とする。',requirement:'私の要望：'
  },
  'zh-TW':{
    intro:'請根據末尾需求，為一般 OpenDesk Browser 作者完成可用實作；不需擁有 Browser 儲存庫或安裝維護者 Skill。先讀下列公開文件與對應範例，按真實能力工作。',
    context:'已知情境',unknown:'未知',selected:'已選擇專案',unselected:'未選擇專案',readOnly:'唯讀產物：回到原專案原始碼修改、重新準備，不編輯生成物。',editable:'編輯狀態：可編輯。',
    worlds:{controller:'Controller：受控 Worker，使用 page/Locator；無網頁 document。單檔 async function main()，多檔 ESM 預設匯出 main。',page:'Page USER_SCRIPT：在獲准網頁文件中使用 document；無 Controller page/params/axiosx，不是 MAIN。',react:'React：網頁 Page 受管 UI，預設匯出元件；JSX 需編譯，不是 Controller 或側欄應用。',vue:'Vue：網頁 Page 受管 UI，預設匯出元件；SFC 需編譯，不是 Controller 或側欄應用。',local:'本機專案：先核實原專案宣告，再決定執行環境，不按檔名推斷。',unknown:'目前模式未知：先按目標區分 Controller 自動化、Page 網頁增強與 Sidebar 側欄應用。'},
    local:{controller:'本機 Controller：重用原 package.json.opendesk 專案與已授權目錄連線；開發 → 本機專案 → 執行本機專案。','page-userscript':'本機 Page USER_SCRIPT：重用原 package.json.opendesk/pageRules；開發 → 本機專案 → 執行本機專案，走 Page 預覽；安裝另行審閱。','sidebar-tool':'本機 Sidebar Tool：重用原 tool.config.json 與沙箱 OpenDeskTool.root/request；開發 → 本機專案 → 在側欄偵錯，打包後在擴充功能審閱安裝；不要寫成 opendesk.project.v1 的 runtimeKind。',unknown:'本機類型未知：先查看獲准專案的 README/設定，識別 Controller、Page 或 Sidebar，未確認前不選執行/安裝入口。'},
    localTruth:'選擇專案不證明目錄、連線或權限有效；實際路徑、連線、授權仍未知，按真實回執核實，不編造已連線或成功。',
    environment:{
      direct:'最小環境：核對既有 Browser 的實際 edition、Controller/Page 執行環境與目標網站權限；Page 還需使用者指令碼許可。直接 JS 無需額外 Node 或本機服務。',
      component:'最小環境：核實實際 Developer 瀏覽器 JSX/SFC 編譯器；Standard 核對本機 Node 準備/預編譯路徑，或選無需編譯的 Direct runtime；不把原始 JSX/SFC 當普通 JS。',
      local:'最小環境：檢查原專案 package.json/lock、所需 Node 與套件管理器版本、已安裝 OpenDesk CLI 版本；分別核實 Native 配對/連線與原始碼 Provider 上線狀態，前者不證明後者。重用既有 watcher，僅按需在已授權目錄用公開命令 opendesk browser dev . 準備，不重複啟動。',
      unknown:'最小環境：先唯讀識別實際模式與 edition，再按對應公開入口準備，不預裝整套工具鏈。'
    },
    prepare:'缺工具時按官方公開文件主動完成普通、可逆的安裝與準備，重用既有環境；只處理目前入口所需項，不做全機診斷，不只交付命令清單。',
    compiler:'Developer 支援瀏覽器內單元件 JSX/SFC 編譯；Standard 無此編譯器，可用 Node 本機準備/預編譯，或 React.createElement / Vue.h 的 Direct JS 與固定 runtime。edition 未知先核實，不強制切換版本。',
    workflow:'先確認末尾目標，區分 Controller 自動化、Page 網頁增強與 Sidebar 側欄應用，重用正確既有專案與依賴，保留他人變更；無專案才在使用者工作區建立最小獨立專案。不要求 clone Browser 儲存庫，不預設修改框架 src/ 或建立第二套 SDK/Host。業務原始碼與測試歸原專案。主動完成已授權、可逆的環境檢查、依賴準備與實作，不只列命令讓使用者執行；重用既有連線/服務，不覆寫或停止其他任務。僅在關鍵目標資訊缺失、需憑證、確實缺授權或涉及破壞性操作時詢問。',
    verify:'完成最小實作，自動執行普通本機語法/依賴檢查與定向測試，無需額外通用確認。交付完整程式碼或檔案、準備/使用步驟、變更與實際驗證結果，區分未驗證與成功。',
    safety:'儲存、編譯、準備不等於執行、安裝或發佈；真實網頁/網路副作用、試執行、側欄偵錯、安裝與權限操作按使用者實際授權範圍和原審批鏈執行，既有授權無需重複確認，不自動批准或擴權。撤權立即停止；斷線、逾時或副作用未知時唯讀查原結果，不自動重播，Stop 不保證回復。',
    api:'僅用公開已實作 SDK/runtime 與各環境真實全域，不假造 API、Chrome 特權或任意 npm/CDN 可用性；缺能力報告具體阻塞。不索取或收集金鑰、權杖、Cookie、密碼等秘密。',
    docs:'公開參考（文件語言以連結為準）',unavailable:'公開參考設定無法使用；僅依據可核實的官方公開文件，不猜測連結或 API，無法核實的能力標記未驗證。',requirement:'我的需求：'
  }
};
const ownEnum=(object,key,allowed,fallback)=>Object.hasOwn(object,key)&&allowed.includes(object[key])?object[key]:fallback;
const ownBoolean=(object,key)=>Object.hasOwn(object,key)&&typeof object[key]==='boolean'?object[key]:undefined;

/** Returns a standalone authoring prompt. Deliberately excludes source, identity and environment details. */
export function createDeveloperAIPrompt(context={}, {config=BROWSER_PUBLIC_CONFIG,locale='zh-CN'}={}){
  const input=context&&typeof context==='object'?context:{};
  const copy=Object.hasOwn(CONTENT,locale)?CONTENT[locale]:CONTENT['zh-CN'];
  const mode=ownEnum(input,'mode',['controller','page','react','vue','local'],'unknown');
  const edition=ownEnum(input,'edition',['standard','developer','unknown'],'unknown');
  const kind=mode==='local'?ownEnum(input,'runtimeKind',['controller','page-userscript','sidebar-tool','unknown'],'unknown'):null;
  const selected=ownBoolean(input,'projectSelected');
  const readOnly=ownBoolean(input,'readOnly');
  const lines=[copy.intro,`${copy.context}: mode=${mode}; edition=${edition}; ${selected===undefined?copy.unknown:selected?copy.selected:copy.unselected}.`,copy.worlds[mode]];
  if(readOnly!==undefined)lines.push(readOnly?copy.readOnly:copy.editable);
  if(mode==='local')lines.push(`runtimeKind=${kind}. ${copy.local[kind]}`,copy.localTruth);
  const environment=mode==='local'?'local':mode==='react'||mode==='vue'?'component':mode==='controller'||mode==='page'?'direct':'unknown';
  lines.push(copy.environment[environment],copy.prepare,copy.compiler,copy.workflow,copy.verify,copy.safety,copy.api);
  const resolved=resolveBrowserPublicConfig(config);
  if(resolved){
    const {developerGuides:guides,developerReferences:references}=resolved.navigation;
    const keys=['apiIndex','typeSelection','runtime','dependencies'];
    if(mode==='local')keys.push('localSidebarProject','completeProject');
    if(mode==='local'&&(kind==='sidebar-tool'||kind==='unknown'))keys.push('sidebarTool','sidebarExample');
    const referenceMode=mode==='local'?({'controller':'controller','page-userscript':'page'})[kind]:mode;
    const links=keys.map(key=>`${key}: ${guides[key]}`);
    if(references[referenceMode])links.push(`API: ${references[referenceMode].help}`,`Example: ${references[referenceMode].examples}`);
    lines.push(copy.docs+'\n'+links.join('\n'));
  }else lines.push(copy.unavailable);
  lines.push(copy.requirement);
  return lines.join('\n\n');
}
