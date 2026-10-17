// OpenDesk Browser Developer Preview R2.5: source-only regression gates.
// Run: node --test prototypes/sidebar/develop/preview-contract.test.mjs
// Layout geometry and native Chrome require separate browser evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('./index.html', import.meta.url),'utf8');
const css=html.match(/<style>([\s\S]+?)<\/style>/)?.[1]??'';
const occurrences=(needle,inText=html)=>inText.split(needle).length-1;

function auditParams(source=html){
 const start=source.indexOf('id="params-fold"');
 assert.ok(start>=0,'参数区未找到');
 const part=source.slice(start,source.indexOf('</details>',start));
 assert.ok(part.includes('summary-label">运行参数</span>'),'参数折叠项只出现一次标题');
 assert.ok(part.includes('summary-end">可选</span>'),'可选状态单独显示');
 assert.ok(!part.includes('summary-label">参数 JSON'),'不得恢复重复的技术标题');
 assert.ok(!part.includes('summary-end">{'),'标题不得重复展示 JSON 内容');
 assert.ok(part.includes('class="sr-only" for="params-editor"'),'必须有可访问但不重复显示的标签');
 assert.ok(part.includes('id="params-error" role="alert" hidden'),'参数错误必须就地反馈');
}

test('参数区：一处可见标题和一份可编辑 JSON',()=>auditParams());
test('负向对照：重新插入重复标题会被检测',()=>{
 const bad=html.replace('summary-label">运行参数</span>','summary-label">参数 JSON（可选）</span>');
 assert.throws(()=>auditParams(bad));
});
test('设计 Token 只有一个定义源，无层层叠加的历史补丁',()=>{
 assert.equal(occurrences(':root{',css),1);
 for(const name of ['.viewport{','.fold>summary{']) assert.equal(occurrences(name,css),1,name);
 assert.equal(occurrences('.page-head{',css),0,'不再为重复标题保留样式规则');
 assert.doesNotMatch(css,/R2\.1 UX audit|PREVIOUS_SPACING_OVERRIDE_R21/);
});
test('节奏：说明4、相关控件8、独立章节16，编辑器默认164',()=>{
 assert.match(css,/--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px/);
 assert.match(css,/\.viewport\{[^}]*padding:var\(--space-3\) 11px var\(--space-4\)/);
 assert.match(css,/\.section\{margin:0 0 var\(--space-4\)/);
 assert.match(css,/\.editor-code-group\{display:grid;gap:var\(--space-1\)/);
 assert.match(css,/#history-fold\{margin-top:var\(--space-2\)/);
 assert.match(css,/\.drawer-scroll\{[^}]*gap:var\(--space-4\)/);
 assert.match(css,/\.code-editor\{[^}]*height:164px;min-height:140px;max-height:none/);
});
test('核心功能节点不因视觉简化被删除',()=>{
 for(const id of ['code-editor','params-editor','local-project-select','local-source-file','page-fold','page-install','page-toggle','page-uninstall','version-fold','task-fold','history-fold','advanced-fold','diagnostics-fold','health-fold','sdk-drawer','approve','revoke','run-btn','stop-btn','save-btn']){
  assert.ok(html.includes('id="'+id+'"'),'丢失 '+id);
 }
});
test('语言与运行世界区分：JS / React / Vue、任务 / 网页',()=>{
 for(const name of ['javascript','react','vue']) assert.ok(html.includes('data-framework="'+name+'"'));
 for(const name of ['controller','page']) assert.ok(html.includes('<option value="'+name+'">'));
});
test('代码编辑器、抽屉保留 Escape 键盘退出',()=>{
 assert.ok(html.includes("if(event.key==='Escape'){editorExitTab=true;return;}"));
 assert.ok(html.includes('按 Escape 后再按 Tab 可离开编辑框'));
 assert.ok(html.includes("ev.key==='Escape'"));
 assert.ok(html.includes('state.originalFocus'));
});
test('本预览不使用远程代码，不冒充原生授权',()=>{
 assert.doesNotMatch(html,/<script[^>]+src=/i);
 assert.doesNotMatch(html,/<link[^>]+https?:/i);
 assert.ok(html.includes('PREVIEW_ONLY'));
 assert.ok(html.includes('真实授权需核验 Chrome 权限'));
});

test('页头去重、编辑器尺寸和预览辅助菜单',()=>{
 assert.doesNotMatch(html,/<div class="page-head">/);
 assert.doesNotMatch(html,/<h2>运行目标<\/h2>/);
 assert.match(html,/<main class="viewport"[^>]*aria-label="开发工作区"/);
 assert.match(html,/<span id="target-kind" hidden><\/span>/);
 assert.doesNotMatch(html,/<div class="preview-footer">/);
 assert.match(html,/<section class="preview-help" id="preview-help"[^>]* hidden>/);
 assert.match(html,/id="preview-more"[^>]*aria-expanded="false"/);
 assert.match(html,/id="try-cross"/);
 assert.match(html,/id="sdk-inspect-inline"/);
});

test('本地项目：运行成功才出现正确安装动作',()=>{
 assert.match(html, /id="local-toggle"/);
 assert.match(html, /id="local-install-review"[^>]*hidden/);
 assert.match(html, /id="local-install-confirm"/);
 assert.match(html, /id="local-installed-open"[^>]*hidden/);
 assert.match(html, /const localProofCurrent=\(\)=>/);
 assert.match(html, /state\.localVerified=\{project:key,runId:run\.runId,documentId:docId\(\)/);
 assert.match(html, /resetLocalProof\(\)/);
 assert.match(html, /\$\('save-btn'\)\.hidden=state\.local&&!ready/);
 assert.match(html, /\$\('save-btn'\)\.addEventListener\('click',\(\)=>state\.local\?openLocalReview\(false\):saveVersion\(\)\)/);
 assert.doesNotMatch(html, /id="local-install-review" hidden><svg/);
});
test('不同安装目标复用原 Task / Page 分类，不可视为通用 Sidebar Tool 转换',()=>{
 assert.match(html, /localKind\(\)==='page-userscript'\?'扩展 → 网页增强':'我的 → 自动化任务'/);
 assert.match(html, /'安装网页增强':'保存为任务'/);
});
test('安装审阅：名称、版本、站点、重复执行风险、取消与更新状态',()=>{
 for(const id of ['local-install-name','local-install-version','local-review-origin','local-review-warning','local-review-error','local-install-confirm','local-install-cancel','local-review-close','local-installed-open'])
  assert.ok(html.includes('id="'+id+'"'),'本地安装审阅缺失 '+id);
 assert.match(html, /正式安装会再次执行冻结的网页程序/);
 assert.match(html, /还须具备真实页面操作的原生回执/);
 assert.match(html, /请先运行最新版本/);
 assert.match(html, /当前原型会话的安装记录/);
 assert.match(html, /localInstalled:Object\.create\(null\)/);
 assert.match(html, /view\.scrollTop\+=rect\.top-bounds\.top-12/);
 assert.match(html, /id="simulate-local-edit"/);
});
