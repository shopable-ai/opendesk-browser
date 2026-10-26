# 扩展导入审阅：信息层级收敛（2026-10-26）

- Owner / scope: OpenDesk Browser「扩展」安装审阅 UI；仅修改本次列出的五个文件及本记录；主分支 main。
- 原始目标：普通更新先显示产品、版本、权限变化、数据保留和操作；SHA-256、文件路径、规范序列化解释仅在默认收起的技术详情中展示。
- 不变合同：Tool / Page 唯一可信安装器、Host 核验、真实权限请求、二次校验和失败回执；不更改同 ID 替换、权限范围、数据保留规则。
- 风险提示：首次安装显示全部权限；新权限、新网站范围、版本回退和代码异常仍在主审阅中显示；本地安装包保留来源提示。
- 受影响文件：src/ui/sidebar-tools.js、src/ui/sidebar-tools-fields.js、src/ui/react/tabs/tool-host.tsx、src/ui/tool-shell.css、src/ui/extension-center.css。
- 验证：源码一致性检查已进行；真实 Chromium、键盘、移动宽度、构建和现有环境测试均待本地验收，不能标 PASS。
