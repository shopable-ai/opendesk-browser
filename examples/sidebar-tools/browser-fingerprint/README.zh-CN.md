# 浏览器环境检测 R1.5 · A 只读工作版

面向 QA / 电商运营：当前网页检测 → 记录部分证据 → 保存快照 → 历史对照 → 复制/导出 JSON。只有 A 只读功能；B 环境修改实验室和 C Profile/代理/IP/多账号不进入正式产品。

## 核心接口

- browser.page.getContext：可信 Host 复核 HTTP(S) 当前网页，获取 URL/标题及可选文档引用。只持久化 origin/host/title，不保留 URL 查询参数及 opaque TabRef/DocumentRef。
- storage.get/set：独立键 fingerprint.a.history.v1，ETag 条件写入，写后读回才能确认；总历史最多 5 条，但 8 KiB 单项可能提前达到容量上限，绝不悄悄删除。
- clipboard.writeText / file.download：真实用户点击时调用；下载任务 ID 不证明磁盘落盘。

当前 Browser SDK 没有受审的目标网页 JavaScript 环境快照接口。UA、语言、时区、viewport、screen、DPR、UA-CH、Accept-Language、IP、地理位置统一记为 not_exposed。**本版本不是完整的环境指纹采集工具。** 保存前会重复调用 SDK，要求 URL 和 documentRef 匹配；引用不可验证时阻止保存。

旧 od.fingerprint.r13.preview 是离线 B 预设，绝不当作真实 A 证据导入。

## 源文件

- src/main.jsx、src/App.jsx、src/style.css：唯一正式 React 入口、业务 UI。
- src/adapter.js：唯一生产环境 SDK 读数入口，不读取 Side Panel navigator。
- src/model.js：只读证据、身份约束、差异与报告 Schema。
- src/history.js：CAS 写入、容量拒绝、真实读回、未知结果处理。
- preview/react/sdk-preview.js：仅用于离线交互的显式虚拟 Host，不作为实际浏览器数据。
- preview/react/build-preview.mjs：以正式 dist/tool.js 和 CSS 生成可直接打开的自包含 React 预览，校验源码/产物哈希。

## 在具备 node_modules 的实际仓库中

    node --test examples/sidebar-tools/browser-fingerprint/tests/*.test.mjs
    npm --prefix examples/sidebar-tools/browser-fingerprint run build
    npm --prefix examples/sidebar-tools/browser-fingerprint run preview:build
    npm run build:sidebar-tool -- examples/sidebar-tools/browser-fingerprint --out artifacts/sidebar-tools/browser-fingerprint/candidate.opendesk-tool.json

preview/react/index.html 初始为同源 JS 的本地路径入口；成功执行 preview:build 后由生成器覆盖为单文件离线同源预览。需要已构建的 dist/development/sidebar-shared-ui.js。

未加入官方 Catalog、未晋升正式安装 JSON、未执行 Mac Chrome 真实验收。只有 A 真实网页环境检测接口补齐后才能考虑完整功能 GO。
