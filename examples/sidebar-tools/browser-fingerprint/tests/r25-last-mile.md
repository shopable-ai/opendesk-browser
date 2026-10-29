# Browser Fingerprint R2.5 — 德国恢复归因与最小修复

2026-10-29；产品版本维持 0.2.2；正式安装 JSON 仍为 0.2.1，未晋升。

## 当前证据与原因

- 基线 `d69aa8ff2e9f0b35d08e409a37554dfa6ab79d02`；后续 main `37f3c3b5915371093faf0ee255cdba583134c6f5` 已修正 React 报告等待条件，无须重做安装、React 或美国预设。
- [原 R2.4](https://github.com/shopable-ai/opendesk-browser/actions/runs/40897606912) 和 [等待报告后的 R2.4](https://github.com/shopable-ai/opendesk-browser/actions/runs/40899487111) 均失败于德国恢复。后者的稳定报告已挂载，语言行的 baseline / expected / observed 为 `en-US / en-US / de-DE`，status=mismatch，source=page-runtime；UA、UA-CH、时区和 viewport 一致。HTTP Accept-Language 无可信网络采集，地理位置未支持，公网 IP 不在范围内。
- 原独立观察器只读取 `navigator.language`，显示 `en-US`；生产 Host 读取 `navigator.languages`，仍为 `['de-DE']`。本机 macOS / CFT 155.0.8059.39 以相同生产驱动、MAIN 读回和“先 scalar、后 array”顺序复现；相反顺序会掩盖问题。故为真实缓存残留，而非产品应该忽略的字段或 React 假阴性。
- Chromium 的 [language 缓存实现](https://github.com/chromium/chromium/blob/f043649a0ef1fd96e48d56ddbfc8a4a99aa2ca37/third_party/blink/renderer/core/frame/navigator_language.cc#L39-L97) 与 [CachedAttribute](https://github.com/chromium/chromium/blob/f043649a0ef1fd96e48d56ddbfc8a4a99aa2ca37/third_party/blink/renderer/core/frame/navigator_language.idl#L7-L9) 解释了 scalar 读回更新 dirty 标记但 JS array 仍旧的路径。仅清空 UA override 后再 detach 的实验仍失败。
- `App.jsx` 在同步分类后写记录、随后挂载字段报告；旧证据中的 `NO_INDEPENDENT_READBACK` 是过早读取报告，37f 已处理。分类不依赖记录写入结果，不能用记录错误解释 language mismatch。
- 记录写入存在独立的键顺序误报：Chrome storage 可能重排对象键，而工具用原始 JSON 字符串比较。改为递归排序对象键，数组顺序、内容、CAS 和未知写入不重放仍保留。

## 修改与定向验证

- `src/platform/chrome/browser-fingerprint.js`：只有确实尝试语言覆盖的 Session，在 detach 前以原始非空 UA / languages 设置覆盖，使用生产 MAIN reader 刷新语言数组，然后 detach。重置或读回失败仍返回 unknown；不会重试原生操作，不注入 navigator 属性补丁。
- `src/presets.js`：存储提交后按对象内容核对，修复对象键重排误报。
- `tests/r21.test.mjs`、`tests/r22.test.mjs`：23 项通过；包括重排对象键、真实值改变、数组顺序、ack 丢失不重放、语言缓存和重置失败仍解除 debugger。
- `tests/native-r23-driver.mjs`：在真实 macOS CFT 155 增加 scalar-first 独立数组回读，美国与德国两 Session 均 PASS；属于 **CHROMIUM_NATIVE_DRIVER**，不是正式安装或 MAC_CHROME 全链验收。
- `tests/installed-r24.mjs`：正式安装验收的独立观察器也读取并断言完整 languages 数组，继承 37f 的稳定报告等待。
- React/Vite 同源构建与 0.2.2 临时候选构建通过；候选 88673 bytes。未覆盖正式 JSON。

原始证据保留在忽略目录 `artifacts/fingerprint-r25/`；生产驱动最终证据为 `artifacts/sidebar-tools/browser-fingerprint/chrome-native-r23/evidence.json`。后续 CI、预览、Mac 安装和生命周期结果须以实际新证据补充；不得把这些局部 PASS 等同发行门禁通过。
