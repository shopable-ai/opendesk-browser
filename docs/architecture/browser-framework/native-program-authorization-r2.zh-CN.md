# OpenDesk 原生程序与能力授权 R2

2026-10-10。定位：普通 JavaScript / 本地项目 / 浏览器自动化框架，而不是仅支持 `@grant none` 的旧脚本管理器复制品。

**状态：本轮实施原生 Page 程序的源码、运行设置分离；程序私有服务桥、统一能力确认界面尚未交付。** 本文同时列出目标设计和已经接入的范围，不能将设计表中的能力当作当前已实现 API。

## 一、用户应该怎样使用

普通用户直接写 JavaScript，或打开自己的多文件项目。修改网页界面时选择页内程序；操作多个网页时使用现有 Controller / ChromePage。程序不需要先补 `==UserScript==`、`@match` 或 `@grant none`，也不需要先给整个网站安装独立网页 SDK。

当前可运行的页内程序示例：

```js
async function main() {
  return {
    title: document.title,
    headings: document.querySelectorAll('h1').length
  };
}
```

运行位置、自动运行条件和权限是单独的程序设置，不注入用户源码。框架预装的纯计算库可直接提供给相应运行环境；加载库本身不等于批准网络、Cookie 或 Native 能力。

目标授权交互应是一个简明的程序摘要，例如：

> 订单助手 · 固定版本 r3
>
> 可以读取并修改 shop.example 的网页；向 api.example 发送已批准范围内的请求；读写本程序自己的数据。
>
> 未申请 Cookie、其他网站控制权和本机服务。
>
> 仅此次运行 / 批准此固定版本 / 取消。

以上是交互设计，不是已完成界面。同一固定版本、相同范围内重复运行不反复申请；增加能力、站点或更换源码/依赖快照时重新确认。拒绝新范围不能自动停掉原已批准版本，也不能把原授权转给新字节。开发便利模式只能绑定明确项目、会话和能力上限；「本地文件」或「AI 写的」都不是全部权限的理由。

## 二、四个独立维度

| 维度 | 解决什么问题 | 不应决定什么 |
| --- | --- | --- |
| 源码格式 | 普通 JS、ESM 构建产物、旧 UserScript 兼容导入 | 不能因为出现某个注释就获权 |
| 执行环境 | Controller Worker 或 Chrome 页内隔离环境 | `USER_SCRIPT` 不等于只能提供 DOM 功能 |
| 运行条件 | 在哪里、何时、哪些 frame 自动运行 | 网页匹配 pattern 不是网络代理授权 |
| 能力授权 | 某个程序版本现在可以调用哪些宿主服务 | 不能继承扩展 Manifest 中全部权限 |

`USER_SCRIPT` 是 Chrome 原生 API 的执行环境，不是油猴专有格式。Chrome userScripts 支持专门的扩展消息通道。保留隔离是为了避免页面脚本直接读写程序内部状态，并非以油猴规则限定 OpenDesk。是否开放 MAIN 兼容执行必须独立审查；不能把敏感通道、令牌和宿主对象暴露给 MAIN。

旧 `@grant`、`@connect` 等只应作为兼容输入，转换为原生能力需求后再由用户批准。暂未实现的 GM 方法仍应在兼容层明确报错；简单删掉检查会让脚本跑到一半失败，或产生假授权，并不算兼容实现。

## 三、同一权限内核，不另造执行器

```text
普通 JS / 项目 -> 固定程序描述与源码、依赖快照 -> 用户批准
                                              |
Controller 上下文 -----------------------------|
Page 私有上下文（待接入）------------------------|
                                              v
                                   现有 Authority / Broker
                                   校验主体、能力、对象、期限
                                              |
                           现有 Network / Storage / Chrome / Native 服务

网站主动接入 -> 独立网页 SDK -> 单独文档级主体 -> 同一底层服务
```

复用现有 Task、RunHost、commandJournal、frameworkKV、结果及未知副作用处理。不新增第二套权限数据库、网络实现或运行器。实际执行至少同时满足：浏览器允许扩展访问；用户允许此程序版本调用；当前执行身份、文档和授权仍有效。

| 产品能力 | 授权设计 | 禁止的捷径 |
| --- | --- | --- |
| 网页 DOM / UI | 当前明确页面，或经批准的自动运行规则 | 把隔离环境说成无风险沙箱 |
| HTTP / axiosx | 精确目标 origin、操作范围、凭据策略；复用 Network Service | 使用 `<all_urls>` 代替程序批准；失败后回退 fetch 冒充成功 |
| 程序存储 | 稳定安装身份的私有命名空间，授权另绑定具体版本和运行实例 | 所有程序共享网页 origin 存储；凭自报 programId 切换空间 |
| 跨标签自动化 | 目标创建、附着、导航和对象归属均由 Controller/Authority 校验 | 任意 tabId 或新网站自动接管 |
| Cookie / 凭据 | 独立敏感批准，限制站点和读写用途 | 因扩展已经有 cookies 权限就自动授予程序 |
| 下载 / 剪贴板 / Native | 分项确认、对象范围、保留副作用回执 | 直接开放任意 chrome.*、本机路径或系统命令 |

网页本身的 DOM 和网络渠道不受应用 Broker 完全控制。给页内程序 DOM 权限就有读取敏感网页内容和修改业务状态的风险，不能宣传为防数据泄露沙箱。

## 四、程序私有 SDK 与独立网页 SDK 不能混用

独立网页 SDK 授权的是整个当前网页文档，同页其他 JavaScript 也可能使用公开接口。它适用于网站主动接入，不是普通 OpenDesk 程序的授权前置步骤。

Page 程序需要宿主网络、存储等功能时，应接入现有 Authority 下的私有程序上下文，而不是给网页的 MAIN world 安装一个公开通行证。该接入**尚未在本轮实现**。验收条件如下：

- 可信执行器绑定固定版本、sourceHash、依赖锁、实际 tab/frame/document、执行实例和撤销代次。
- 采用 userScripts 专用消息入口并核验 Chrome sender。不能假定消息中的 worldId/programId/hash 是可信身份，也不能假定 Chrome MessageSender 已提供可鉴别程序的 worldId。
- 每个程序执行世界持有独立私有通道或授权随机量；不可经 DOM、CustomEvent、页面可读 storage、MAIN 或独立网页 SDK 公开。通道证明必须与原生 sender 和 Authority 中的实例同时匹配。
- 撤权、程序禁用/更新、文档消失和执行结束后，原实例不得再调用服务；后台中断时不能恢复无法证明的授权，更不能自动重放未知副作用。
- 继续复用 `axiosx` 等既有外观和服务，不为了授权改造修改 Playwright 风格 API。未接入的能力显示「尚未支持」，不是「授权后可用」。

## 五、本轮已实施的正式代码

此前 `page-candidate-source.js` 会把普通源码改成带 `==UserScript==`、`@match`、`@noframes` 的文件；`dependency-manager.js` 保存阶段又强制依赖这些注释。这是实际的格式耦合，不是浏览器要求。

本轮改为：

1. `src/ui/page-candidate-source.js` 保存原始字节，运行范围作为独立 `pageRules` 提交；R2 原候选的默认范围从用户已试运行的网页提出，不把它当作批准。
2. `src/scripting/user-scripts/page-program-rules.js` 校验原生运行设置，拒绝权限字段混入、重复/稀疏/超预算规则，以及与旧声明冲突的设置。
3. `dependency-manager.js` 在首次 await 前复制完整请求；无旧头部的程序走原生设置，旧格式仍需通过兼容检查；同一版本不能被新范围覆写。
4. `page-program-contract.js` 使用同一原生规则合同，不再拼出虚构的 UserScript 注释来校验设置；保留既有格式及数据身份，不迁移或篡改历史记录。
5. `src/ui/script-editor.js` 移除「保存后添加注释导致源码 hash 改变」的提示，并保留真实导入 URL；声明、验证、安装仍分别处理。

不改变 Manifest、不自动授权网页 SDK、不添加 GM 特权、不新建执行器。普通程序的 sourceHash 与试运行字节保持一致；pageRules 改变时 manifestHash 仍改变。正式安装仍需原有固定版本验证及明确安装，不拿 sourceHash 一致替代安装批准。当前自动安装仍受顶层文档和 document_idle 驱动限制。

后续 main `92ddeeb` 将新普通 JS／未声明 `@match` 的默认匹配改为全部 HTTP(S) 网站（`*://*/*`）；显式规则及旧安装仍保持原固定范围。该默认只描述新候选的调度范围，须在安装面板显示并明确确认，不能自动扩大已有安装权限。[R3.1 工作流](../../framework/workstreams/install-once-authorization-r31.md) 保存后续授权复用、停用／撤销和重启的独立证据；这些结果不改写本 R2 原候选的历史验收身份，程序私有特权桥仍未接入。

## 六、验收与未完成项

定向测试入口：`.github/workflows/native-page-program-r2.yml`。它运行原生保存、旧格式兼容、依赖锁、安装和 Sidebar 组件测试，以及源码检查、开发包构建；并不打开真实 Chrome。结果和实际候选身份保存在 `docs/framework/workstreams/native-program-authorization-r2.md`。

真实 Chrome 验收还需覆盖：普通 JS 试运行→保存→安装→下一次匹配网页执行；旧已安装版本不受影响；撤权/导航/重启；Page 私有桥的跨程序伪造和令牌泄露。最后两项只有私有桥真正接入后才能关闭。加载已保存源码时，后续新版本的运行范围仍须明确核对，不能默认继承为授权。

95+ 是统一能力模型和真实验收的目标，不是根据组件测试数量推导的结论。原聊天的「设计 96 分」不作为独立专家验收证据。高权限绕过、旧授权复活、未知效果重放或错误成功提示均是否决项。

## 官方机制依据

- Chrome userScripts：https://developer.chrome.com/docs/extensions/reference/api/userScripts
- Chrome 隔离环境：https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts

R1 文档 `userscript-sdk-authorization-r1.zh-CN.md` 保留为文档级 SDK 查询/撤销子系统记录；原生程序总体方向以本 R2 为准。
