# Quick Notes React 热更新开发指南：在 VS Code 保存，在 Chrome 侧栏看到变化

更新日期：2026-10-29

开发一个侧栏小应用，最直接的体验应该是：打开自己的 React 文件，修改一处文字，按下 Cmd+S，然后在 Chrome 侧栏看到变化。Quick Notes React 已经可以通过现有本地调试流程完成这件事，不需要每次重新导入应用包。

本文从一次文字修改开始，说明如何使用、保存后发生了什么，以及没有 OpenDesk Browser 源码时，哪些步骤已经可用。

## 先了解本文中的“热更新”

这里的热更新是“保存源码后，成功编译的界面自动更新到侧栏”。应用经过 Vite 编译，OpenDesk 发布并验证一份新的本地快照，再安全替换应用 iframe。

因此，这条链路使用的是编译产物和快照更新，并非直接打开 Vite HTTP 开发服务器，也不提供 React Fast Refresh 的内存状态保留保证。若笔记里还有未保存的编辑，界面更新会先等待，避免替换时丢失草稿。

## 开始前准备什么

这篇文章使用的项目是 [Quick Notes React](../examples/sidebar-tools/quick-notes-react/README.md)，位于：

```text
examples/sidebar-tools/quick-notes-react/
```

你需要：

- VS Code，或其他可以编辑 JSX 的编辑器。
- Node.js 22.12 或更高版本，以及 npm。
- 支持本地 Sidebar App 调试和共享 React 运行时的 OpenDesk Browser，以及配套 Native。
- 已通过原 Native Workspace 连接的应用目录；首次连接时按现有界面完成目录访问授权。
- 应用编译监听和预览快照监听。这两个监听通常由 AI 或维护者准备；已经运行时直接复用。

**目前，应用可以独立编译，但预览监听和打包工具仍依赖 Browser 仓库。** 如果你只有应用源码，可以先看后面的“没有 Browser 源码时怎么办”，不要把下面的仓库命令理解为安装扩展后自动具备的工具。

## 第一步：准备两个监听

以下命令在 **OpenDesk Browser 仓库根目录**执行。先检查是否已有监听；只启动缺少的那一个，不重复启动。

新环境第一次准备应用编译依赖时，执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund \
  --prefix examples/sidebar-tools/quick-notes-react
```

已有正常运行的开发环境无需为阅读本文重新安装依赖。

在终端一启动应用编译：

```sh
npm run watch --prefix examples/sidebar-tools/quick-notes-react
```

在终端二启动快照监听：

```sh
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react
```

两个终端保持运行。第一个将 JSX/CSS 编译到应用自己的 `dist/`，第二个检查完成的编译结果并发布供 Native 读取的快照。

这两条命令都不会覆盖 Browser 的 `dist/development`。维护 Browser 本身使用的 `npm run dev` 是另一条开发链，不需要为了修改一处应用文字重新启动它或重建整个扩展。

## 第二步：打开真实侧栏调试

在 Chrome 中进入：

```text
OpenDesk → 开发 → 本地项目 → quick-notes-react → 在侧栏调试
```

如果项目尚未连接，先通过原 Native Workspace 连接正确的应用目录。如果之前点过“停止调试”，重新从这个入口打开即可。

应用会显示在真实 Side Panel 中。点击“在侧栏调试”后，可以使用本应用声明范围内的存储读写，无需再批准一次“隔离存储调试”。退出时使用“停止调试”。

“只读预览”适合查看界面；本文需要体验笔记保存时，使用的是“在侧栏调试”入口。

## 第三步：改一处文字，保存并观察

在 VS Code 打开应用目录。若已安装 `code` 命令，可在仓库根执行：

```sh
code --new-window examples/sidebar-tools/quick-notes-react \
  --goto examples/sidebar-tools/quick-notes-react/src/App.jsx:261
```

行号仅用于辅助定位，以搜索 `我的笔记` 为准。常用文件如下：

| 文件 | 负责什么 |
| --- | --- |
| [src/App.jsx](../examples/sidebar-tools/quick-notes-react/src/App.jsx) | 应用界面、事件和 SDK 调用，是修改 UI 的主要入口 |
| [src/style.css](../examples/sidebar-tools/quick-notes-react/src/style.css) | 本应用自己的布局和样式 |
| [src/main.jsx](../examples/sidebar-tools/quick-notes-react/src/main.jsx) | 创建 React 根、连接 SDK、退出时清理 |
| [tool.config.json](../examples/sidebar-tools/quick-notes-react/tool.config.json) | 应用 ID、能力和编译产物入口 |
| [vite.config.mjs](../examples/sidebar-tools/quick-notes-react/vite.config.mjs) | JSX/CSS 编译配置和完成回执 |

在 `src/App.jsx` 中找到笔记编辑器的标签：

```jsx
<label className="od-field-label" htmlFor="note-text">我的笔记</label>
```

把文字改成：

```jsx
<label className="od-field-label" htmlFor="note-text">我的笔记 · 手动修改</label>
```

然后进行一次完整观察：

1. 在 VS Code 按 **Cmd+S**；Windows/Linux 使用 Ctrl+S。
2. 等应用编译和快照发布完成。
3. 在 Chrome 侧栏确认标签已显示“我的笔记 · 手动修改”。
4. 若想恢复，把文字改回并保存，观察侧栏再次更新。

如果当前标签已有你自己的修改，直接以现有文字为起点，不必先恢复成示例。此操作只改应用源码中的标签，不需要更改应用 ID、能力或版本，也不需要重复安装、导入或刷新 Chrome。

注意区分两个保存动作：**编辑器中的 Cmd+S 保存源码；笔记输入框中的保存操作保存应用数据。** 若笔记尚未保存，先保存笔记或按应用原有操作结束编辑，再等待界面替换。

文字修改成功后，可以继续在 `src/style.css` 中调整本应用的布局。先做一处小改动并观察，便于判断是哪次保存带来了变化。

## 保存以后，界面为什么会变化

这条流程可以按下面的顺序理解：

```text
在编辑器保存 App.jsx / style.css
  ↓
Vite watch 编译应用，生成 JS、CSS 和 build-ready.json
  ↓
stage watcher 校验源码与编译产物，发布不可变快照
  ↓
Native 按已授权的项目目录读取快照
  ↓
原有 Host 复核来源和调试会话，重新挂载受限 iframe
  ↓
新界面通过 OpenDeskTool.request 调用公开 SDK
```

`build-ready.json` 是一次完成编译的回执，记录对应源码和产物的信息。stage watcher 只有在这些内容匹配时才发布快照，避免把编译中的半成品或过期产物显示成新版。

Native 负责读取已授权目录；Host 负责核验当前应用和调试会话。应用依旧在自己的沙箱中运行，保存文件不会让它获得任意 Chrome 或本机文件权限，也不会自动重放任务和网站操作。

编译失败时，系统保留上一份成功画面。要判断更新成功，应以侧栏实际出现的新文字为准，不能只看终端输出或快照摘要变化。

## 调试笔记会影响正式安装版吗

本地调试数据与正式安装版分开；即使应用 ID 相同，也不会借用已安装应用的数据和权限。直接进入调试后可测试笔记读取与保存，隔离在系统内部完成，不增加第二次存储批准。

开发数据属于浏览器 session 中的隔离数据，适合功能调试。扩展重载或调试会话失效后，不应假设原 iframe 内存和开发数据仍会保留；重要笔记应另行保存。

点击“停止调试”会结束当前调试。重新进入仍使用原入口；断连、授权失效或保存结果未知时，先核对状态，不自动重试可能已经发生的写入。

## 保存后没变化，先检查什么

| 现象 | 优先检查 |
| --- | --- |
| 编辑器改了文字，终端没有编译输出 | 文件是否已保存，是否编辑了当前连接项目的文件，Vite watch 是否仍在运行 |
| Vite 报语法错误 | 修复这次 JSX/CSS 改动并保存；编译成功前保留旧画面是正常行为 |
| 编译成功，侧栏仍显示旧文字 | 是否有未保存笔记；stage watcher 是否运行；当前调试是否连接正确目录 |
| 之前看得到，现在侧栏调试已结束 | 是否点过“停止调试”、关闭 Workspace，或发生 Native 断连；从原入口重新打开 |
| 界面能看，但无法保存笔记 | 是否进入了只读预览；需要保存时改从“在侧栏调试”进入，并查看实际错误 |

先看当前应用的编译输出，以及原宿主提供的错误和开发信息。定位到具体阻塞后再修复，无需先重新安装扩展、清除数据或运行整组测试。

如果监听是你本次自行启动的，不再开发时可在对应终端按 Ctrl+C 结束。由维护者或其他会话共用的监听，交由其管理。

## 修改共享组件时，有什么不同

Quick Notes React 使用的 `Button`、`IconButton`、`Card` 和 `CardContent` 来自 `@opendesk/ui`；React 和这些共享组件由 OpenDesk 现有运行时提供。

修改自己的文案和布局，继续编辑应用目录中的文件。修改 Browser 提供的共享组件则属于 Browser 维护工作，可能触发扩展安全重载，重载后需要重新进入调试，不能按普通应用快照更新来保证内存状态保留。

普通应用作者不需要为了调整自己的 UI 去修改 Browser 共享组件或宿主代码。

## 没有 Browser 源码时怎么办

运行已安装应用和开发应用源码是两类使用场景。目前的可用范围如下：

| 你想做什么 | 当前是否需要 Browser 仓库 |
| --- | --- |
| 安装、打开已生成的 Quick Notes React 包，调用其支持的 SDK | 不需要；使用支持该运行时的 OpenDesk，经过原安装审阅 |
| 编辑和编译自己拿到的 Quick Notes React 应用源码 | 不需要；应用已有自己的固定 Vite 和锁文件 |
| 持续发布快照，让真实侧栏随保存更新 | 仍需现有仓库中的 stage/watch 工具及配套 Native |
| 生成正式安装包 | 仍需现有仓库打包器 |

只有应用目录时，可以在该目录执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
# 持续开发时使用；已有监听则直接复用。
npm run watch
```

它们生成应用自己的 `dist/tool.js`、`dist/tool.css` 和完成回执，无需 Browser 的 `node_modules`。React 和 `@opendesk/ui` 仍由 OpenDesk 宿主提供，这些产物不能直接作为普通网页打开。

维护者协助调试时，应用目录可以放在仓库外。维护者让现有 `watch-sidebar-tool.mjs` 指向该目录，你通过原 Native 界面连接并授权目录后进入侧栏调试即可。

尚未独立交付的是 stage/watch/打包工具及它们需要的固定校验和样式资源。当前没有已发布的独立 npm CLI，不能宣称“只下载应用目录就能完成全部流程”。下一步是复用原工具链提供可独立分发的开发工具，继续使用现有 Native、Host 和安装机制。

## 本地调试完成以后

保存源码产生的是开发快照，不会更新已正式安装的应用包。需要把修改长期安装或分享给别人时，再按原有打包流程准备同 ID 的新版本，通过“扩展”中的安装审阅完成更新。更新前保留旧数据，不必先卸载。

2026-10-29 已有真实 Chrome 侧栏的文字更新、基本笔记读写与共享组件更新记录；应用在仓库外的独立编译、watch 更新和原 stager 接受外部项目也已验证。这些记录对应各自的开发步骤，不代表所有 SDK、正式安装升级或生产发布均已通过。

进一步阅读：

- [Quick Notes React 项目说明](../examples/sidebar-tools/quick-notes-react/README.md)
- [Sidebar Tool 统一开发规范](../docs/api/sidebar-tool-development.zh-CN.md)
- [Sidebar Tool API 参考](../docs/api/sidebar-tools.zh-CN.md)
- [普通用户的扩展应用开发与更新流程](../docs/product/extension-app-user-workflow.zh-CN.md)
