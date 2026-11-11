# Web Flow 图文 / 视频自动化 · 本地技术 Demo

> 状态：**源码已写入 main；Node / Chromium / 正式安装 / 真实业务发布均 NOT_TESTED**（截至 2026-11-10，当前连接无法启动本地 CodexPro 工作区）。这不是已安装 Web Flow Task，不会自动向真实媒体平台发布文章。

## 1. 功能与限制

**新增主路径：用户无需复制 Base64。** 在可信扩展设置页保存真实 PNG → 获得 `assetId` → 关闭并重开 Side Panel → 以原已验证、已审阅 `media.read` 权限的安装任务执行 `page.uploadAsset` → 网页独立哈希实际 File → 只保存本地草稿。具体步骤见 [R1/R2 媒体桥与本地验收](../../docs/media-bridge-r1.zh-CN.md)。

本地演示页能填写文章标题与正文、逐张选择 1–3 张图片、可选一段 MP4/WebM 小视频，预览选择结果并通过 IndexedDB 保存正文和 File/Blob 二进制。刷新后会恢复保存记录和媒体预览，出于浏览器安全设计不会恢复文件选择框状态。

Controller 演示脚本能自动填写正文、逐张触发图片上传并确认网页提示；默认**仅保存本地草稿**。可选 publish-demo 只更改本地 IndexedDB 的演示状态，不会向外部网站发送内容。

当前 Controller 单文件传输上限 1 MiB（1048576 字节），任务参数还有额外预算。当前只支持单选的 input type=file；新增素材引用只针对已授权的本地 PNG（≤1 MiB），不支持生产级大图/视频、云存储或真实网站发布。不要为了演示扩大统一资源上限。

## 2. 启动本地页面

在仓库根目录运行：

~~~sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory projects/webflow/demos/article-media
~~~

在装有 OpenDesk Browser 的 Chrome 打开：

http://127.0.0.1:43111/article-editor.html

先手动填写标题和正文，选择一张图片，点击「保存草稿到本地」；刷新页面验证实际保存记录与媒体预览。

## 3. 执行 Controller 草稿

1. 打开 OpenDesk 顶部「开发」，选择 Controller 草稿；复制同目录 [article-publish.controller.js](article-publish.controller.js) 代码（不是 Page USER_SCRIPT）。
2. 绑定本地 article-editor.html 标签页，检查目标 URL 和网站权限，显式点击「运行」。
3. 可选输入参数：

~~~json
{
  "title": "OpenDesk 图文自动发布测试",
  "body": "这是一段自动填写并保存的文章正文。",
  "action": "draft"
}
~~~

未传 images 且未传 assetId 时，旧演示脚本使用内置微小 PNG。下列 DataURL 是历史兼容技术测试，不是新增素材仓库的使用方式。要测试自己的小图片，可将真实文件编码为 DataURL 并放在 images 数组中，结构例如：

~~~json
{
  "title": "测试标题",
  "body": "测试正文",
  "action": "draft",
  "images": [
    {
      "name": "cover.png",
      "type": "image/png",
      "dataUrl": "data:image/png;base64,替换成真实小图的合法Base64"
    }
  ]
}
~~~

可选视频结构为 video:{name:"clip.webm",type:"video/webm",dataUrl:"data:video/webm;base64,真实数据"}，但常规视频会超过现有单文件上限或参数预算。这仅用于极小文件的技术兼容性验证，生产媒体不可放入普通任务 JSON。

4. 验证 Controller 实际 Run/Result、资源释放、页面保存状态、刷新后 IndexedDB 的持久记录。结果 UNKNOWN 时只读查询原 runId，不能盲目重放有副作用的上传或发布。

可额外传入 action="publish-demo" 和 confirmDemoPublish=true 验证本地演示发布状态，但其结果始终是 externalPublished:false，不代表任何外部平台发布成功。

## 4. 架构复用与权限边界

- src/framework/ChromePage.js 的 page.uploadFile(css,data,metadata?) 现支持明确的文件名与 MIME，逐级传至 src/scripting/packaged/registry.js 创建原名 File；旧两参数调用仍为 filename.jpg 和 image/jpeg。
- 允许 image/jpeg、image/png、image/webp、image/gif、video/mp4、video/webm，并校验扩展名和 MIME 一致。此时没有多选 input、远程任意扩权、SVG 或执行任意站点上传。
- 复用原 Authority → RunHost → Worker / Page Session → Durable Result；没有建立第二套 Runner、Installer、Task Catalog，也没有修改当前 Web Flow 固定 delegatedTasks 和任务候选五字段协议。
- 真实生产媒体流程需要可信的用户文件选择、持久媒体引用、内容哈希/尺寸/MIME 校验、受控分块上传、目标网页独立收件回执、进度/取消/清理与未知结果对账；不能把本机绝对路径或完整 Base64 放入 AI 任务参数。上传脚本 completed 不等于文章成功发布。
- 对真实平台开发之前，先固定对应编辑页 URL、账号权限、富文本编辑器结构、保存草稿/发布按钮与网站结果标志，再通过既有任务发布与安装审阅链关联 Web Flow。需要扩大 SDK 能力时记录可重现的跨业务通用缺口，再交平台 owner 实施。

## 5. 定向验证

~~~sh
node --test tests/environment/controller-media-upload.test.mjs
node --check src/framework/control/value.js
node --check src/framework/ChromePage.js
node --check src/framework/control/native-driver.js
node --check src/scripting/packaged/registry.js
node --check projects/webflow/demos/article-media/article-publish.controller.js
~~~

测试覆盖：MIME 与文件名匹配、旧 JPEG 兼容、超过 1 MiB 拒绝、DataURL 分块、URL 元数据透传、实际 File 元数据及 DOM change。**当前测试尚未执行，不可写 PASS**。

下一步的真实闭环：指定一个有授权的目标平台及编辑页面，先实现一篇文章、一张图、保存草稿并读回，再加多图与小视频。正式发布需要额外明确操作与平台成功证据。
