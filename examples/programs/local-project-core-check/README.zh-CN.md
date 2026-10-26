# 本地项目核心测试

这是独立的只读 Controller 项目。入口 `src/main.js` 读取网页标题和 h1；`src/version.js` 决定返回的 v1/v2 文案。无 npm 依赖、不填写表单、不安装任务。当前源码为 v2。

## 六步操作

1. 保留现有开发 watcher 和 43111 服务，打开 `http://127.0.0.1:43111/demo-form.html`，点击 Chrome 工具栏 OpenDesk 图标，进入「开发」。
2. 目录来源离线时，在仓库根目录执行 `opendesk-dev --read-only examples/programs/local-project-core-check`，保留该终端；返回 HTTP demo，刷新「已授权本地项目」，选择 `local-project-core-check`。CLI 额外打开的文件工作区不是运行目标。
3. 项目参数填 `{}`，点击「运行本地项目」。预期返回 `message: 本地项目核心测试 v2`、当前 title、`heading: Browser Test Lab`，状态为已完成且资源已释放。
4. 修改并保存 `src/version.js` 中的版本文案。保存只准备源码，旧结果仍属于旧 run；再次明确点击运行后，新文案才出现。
5. 「运行结果 → 运行记录与技术信息」选择旧 run，点击「查看选中任务」，可查原结果。短停止测试可用参数 `{"waitMs":10000}`，运行后点击停止，预期已停止且资源已释放，运行按钮恢复；随后将参数恢复为 `{}`。
6. 「结果下载与任务查询」输入准确 runId 并查询，再选择同一 runId 的持久结果下载 JSON。查历史不会执行脚本。

## 2026-10-26 实测

环境：日常 Chrome，`dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，Native allowed_origins 匹配。观察到持续开发客户端连接，构建指纹 `c4ea54ad7250`；这只绑定当时的运行环境，后续并行开发更新会重建 Host。

| 操作 | 实际记录 |
| --- | --- |
| 明确运行 v1 | `44adf321-9272-431f-b8e4-3f103cbcf46a`，返回 v1，completed/released |
| 保存 v2、不运行 | 页面继续显示 v1 的原结果，没有自动业务执行 |
| 明确运行 v2 | `dab3483d-e0e9-4a7d-af18-5a4315f3eed4`，返回 v2，completed/released |
| v2 后查看 v1 | 仍显示 v1 原文案和原始快照身份 |
| 首次 Stop | `0b58d123-2c41-4ce8-a74b-f6e17d439d94`，已停止但收尾未及时恢复；正常关闭并重开本任务侧栏后显示 released。原因未确诊，不计为直接 Stop 完整通过 |
| 恢复后定向复验 Stop | `2df1f844-5243-4c34-b615-c19ca4c0f465`，已停止、资源已释放，运行按钮恢复 |

v1 冻结 SHA：`f28e57fe7561381924a65abf3936e9d8a50c7015c8a467543ab6c692e0cc6103`。
v2 冻结 SHA：`b7f51b7f3f591fb260b2e232c7e4a626c37262e9110e921309ae41fc2752a77b`。

原云端写入只查历史：taskId `cloud-write-20261026-0102`，runId `990d259a-f9b3-4697-ac14-9cceee3f6a6c`，resultId `52181ad5-d54a-43b5-b5a1-c6c496df1599`，返回 `{matched:true,value:"OpenDesk 云端闭环 1026"}`。下载在 `/Users/shopme/Downloads/result-990d259a-f9b3-4697-ac14-9cceee3f6a6c.json`。恢复 run `1a1905ad-78ec-4995-b21b-e2d8cc501968` 是另一条记录；本次未重放写入或恢复。

Tunnel 的两轮新只读标题已分别完成并 released；仅使用固定入口 manage.py 启停，正常停止确认无所属实例，再重启复读。技术证据在仓库临时目录 `artifacts/local-project-tunnel-core-20261026/`；最新固定身份及当前运行状态以本机 `prepared.json` 和 manage.py status 为准，历史成功不能保证重建后的 Host 身份仍有效。

本项目通过 authoring schema 与语法检查，且上述核心链在真实 Chrome 执行。保存为任务、正式安装及关闭 CLI 后的安装复用均为 NOT_TESTED；本次运行不等于安装。未开展 production、全矩阵或评分验收。
