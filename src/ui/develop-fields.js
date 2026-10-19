// Initial UI values only. Runtime authority remains in the existing editor controllers.
export const DEVELOPER_FIELDS = {
  "workbench-develop": {
    "tag": "div",
    "className": "od-page",
    "hidden": true,
    "dataset": {
      "workbenchPage": "develop"
    }
  },
  "developer-source-switch": {
    "tag": "div",
    "className": "developer-source-switch od-toolbar od-page-head",
    "dataset": {
      "mode": "manual"
    }
  },
  "developer-source-title": {
    "tag": "span",
    "className": "od-page-title",
    "textContent": "直接编辑"
  },
  "program-new-script": {
    "tag": "button",
    "type": "button",
    "title": "新建 JavaScript 草稿（退出当前只读源码视图）",
    "hidden": true,
    "className": "od-icon-button"
  },
  "local-project-mode": {
    "tag": "input",
    "type": "checkbox"
  },
  "developer-target-detail": {
    "tag": "details",
    "className": "od-disclosure"
  },
  "script-current-page-host": {
    "tag": "span",
    "title": "当前活动网页",
    "textContent": "正在识别…"
  },
  "script-current-page-status": {
    "tag": "span",
    "dataset": {
      "state": "resolving"
    },
    "textContent": "检查中"
  },
  "script-current-page-title": {
    "tag": "p",
    "className": "page-title",
    "textContent": "正在识别…"
  },
  "script-current-page-url": {
    "tag": "p",
    "className": "identity"
  },
  "local-project-tools": {
    "tag": "section",
    "className": "local-project-tools",
    "hidden": true
  },
  "local-project-intro": {
    "tag": "p",
    "className": "local-project-intro od-note",
    "textContent": "选择已授权项目，可运行或核对安装；复用历史验证必须匹配当前源码、网页与持久回执。"
  },
  "local-project-select": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "选择已授权项目",
        ""
      ]
    ],
    "value": ""
  },
  "local-project-refresh": {
    "tag": "button",
    "type": "button",
    "className": "od-icon-button",
    "title": "刷新已授权本地项目"
  },
  "local-project-status": {
    "tag": "p"
  },
  "local-install-review": {
    "tag": "section",
    "className": "local-install-review od-surface",
    "hidden": true
  },
  "local-install-summary": {
    "tag": "p",
    "className": "hint"
  },
  "local-install-title": {
    "tag": "input",
    "type": "text",
    "className": "od-field"
  },
  "local-install-version": {
    "tag": "input",
    "type": "text",
    "className": "od-field"
  },
  "local-install-warning": {
    "tag": "p",
    "className": "hint"
  },
  "local-install-confirm": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button",
    "textContent": "确认安装固定版本"
  },
  "local-install-cancel": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "取消"
  },
  "local-install-status": {
    "tag": "p"
  },
  "local-project-diagnostics": {
    "tag": "p",
    "textContent": "正在核对 Native 和源码 Provider。"
  },
  "local-project-recovery": {
    "tag": "div",
    "className": "local-project-recovery",
    "hidden": true
  },
  "local-project-connect": {
    "tag": "button",
    "className": "local-project-connect od-button od-button--secondary",
    "type": "button",
    "textContent": "连接本机 OpenDesk ↗"
  },
  "local-project-guide": {
    "tag": "details",
    "className": "local-project-guide od-disclosure od-disclosure--info"
  },
  "local-project-guide-open": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "查看首次配置命令和示例 ↗"
  },
  "local-project-params-tools": {
    "tag": "details",
    "hidden": true,
    "className": "od-disclosure"
  },
  "local-project-params": {
    "tag": "textarea",
    "className": "od-field",
    "value": "{}"
  },
  "manual-source-editor": {
    "tag": "div"
  },
  "program-source-info": {
    "tag": "p",
    "className": "identity od-technical",
    "hidden": true
  },
  "program-source-toolbar": {
    "tag": "div",
    "className": "program-source-toolbar od-toolbar",
    "hidden": true
  },
  "program-source-files": {
    "tag": "select",
    "hidden": true,
    "className": "od-field",
    "options": [],
    "value": ""
  },
  "page-component-editor-tools": {
    "tag": "div",
    "className": "od-toolbar"
  },
  "page-component-framework": {
    "tag": "fieldset"
  },
  "page-component-javascript": {
    "tag": "input",
    "type": "radio",
    "name": "page-component-choice",
    "value": "javascript",
    "checked": true
  },
  "page-component-react": {
    "tag": "input",
    "type": "radio",
    "name": "page-component-choice",
    "value": "react"
  },
  "page-component-vue": {
    "tag": "input",
    "type": "radio",
    "name": "page-component-choice",
    "value": "vue"
  },
  "script-javascript-world-row": {
    "tag": "div",
    "className": "od-toolbar"
  },
  "script-javascript-world": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "Controller · 自动化 API",
        "controller"
      ],
      [
        "Page · 当前网页 DOM",
        "page"
      ]
    ],
    "value": "controller"
  },
  "developer-source-label": {
    "tag": "label",
    "className": "visually-hidden",
    "textContent": "JavaScript、React JSX 或 Vue SFC 源码编辑器"
  },
  "script-source": {
    "tag": "textarea",
    "className": "od-field",
    "value": "async function main() {\n  return {title: await page.title(), url: await page.url(), value: params.value};\n}"
  },
  "page-component-hint": {
    "tag": "p",
    "className": "hint",
    "textContent": "保存草稿不会运行网页"
  },
  "page-dependency-panel": {
    "tag": "details",
    "className": "od-stack od-disclosure od-disclosure--flat",
    "hidden": true
  },
  "page-dependency-status": {
    "tag": "p",
    "textContent": "点击运行会自动固定安全依赖；这里仅显示高级详情。"
  },
  "page-dependency-list": {
    "tag": "div",
    "className": "od-stack"
  },
  "page-dependency-lock": {
    "tag": "select",
    "hidden": true,
    "className": "od-field",
    "options": [],
    "value": ""
  },
  "page-dependency-prepare": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "获取并检查依赖（不执行）"
  },
  "page-dependency-review": {
    "tag": "details",
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "page-dependency-review-list": {
    "tag": "div",
    "className": "od-stack"
  },
  "page-dependency-approve": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "批准当前程序的固定 SHA 锁（不运行）"
  },
  "page-component-remote": {
    "tag": "section",
    "className": "od-stack",
    "hidden": true
  },
  "page-component-remote-status": {
    "tag": "p"
  },
  "page-component-remote-sources": {
    "tag": "pre",
    "hidden": true
  },
  "page-component-remote-lock": {
    "tag": "select",
    "hidden": true,
    "className": "od-field",
    "options": [
      [
        "选择固定依赖版本",
        ""
      ]
    ],
    "value": ""
  },
  "page-component-remote-prepare": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "检查依赖"
  },
  "page-component-remote-cancel": {
    "tag": "button",
    "type": "button",
    "hidden": true,
    "className": "od-button od-button--secondary",
    "textContent": "取消准备"
  },
  "page-component-remote-details": {
    "tag": "details",
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "page-component-remote-detail-body": {
    "tag": "pre"
  },
  "program-generated": {
    "tag": "details",
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "program-generated-source": {
    "tag": "pre"
  },
  "manual-project-params-tools": {
    "tag": "details",
    "className": "developer-params od-disclosure"
  },
  "script-params": {
    "tag": "textarea",
    "className": "od-field",
    "value": "{\"value\":0}"
  },
  "tool-diagnostics": {
    "tag": "details",
    "className": "od-disclosure"
  },
  "scraping-panel": {
    "tag": "section",
    "hidden": true
  },
  "developer-sdk-diagnostics": {
    "tag": "details",
    "className": "od-disclosure od-disclosure--flat"
  },
  "sdk-title": {
    "tag": "summary",
    "textContent": "网页 SDK 授权管理"
  },
  "sdk-tab": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "请选择具体网页",
        ""
      ]
    ],
    "value": ""
  },
  "sdk-refresh": {
    "tag": "button",
    "className": "od-button od-button--secondary",
    "textContent": "刷新网页列表"
  },
  "sdk-document": {
    "tag": "select",
    "disabled": true,
    "className": "od-field",
    "options": [
      [
        "先选择网页，再选择文档",
        ""
      ]
    ],
    "value": ""
  },
  "sdk-capabilities": {
    "tag": "fieldset"
  },
  "sdk-target-origins": {
    "tag": "textarea",
    "className": "od-field",
    "value": ""
  },
  "sdk-target-help": {
    "tag": "p",
    "textContent": "留空仅允许来源同源；这里是完整的新范围，不与旧授权自动合并。协议、主机和有效端口精确匹配；不能填写账户、路径、查询或通配符。回环与局域网也须明确列出。原生权限可能覆盖更多端口，但不会扩大应用授权；此检查不是 DNS 重绑定防护。"
  },
  "sdk-approval-preview": {
    "tag": "pre",
    "className": "od-result"
  },
  "sdk-install": {
    "tag": "button",
    "disabled": true,
    "className": "od-button",
    "textContent": "明确批准此快照并安装 SDK"
  },
  "sdk-inspect": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "只读查询当前授权"
  },
  "sdk-revoke": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--danger",
    "textContent": "撤销已确认授权"
  },
  "sdk-status": {
    "tag": "p",
    "dataset": {
      "state": "idle"
    },
    "textContent": "请选择网页、文档和服务"
  },
  "sdk-result": {
    "tag": "pre",
    "className": "od-result"
  },
  "developer-health-diagnostics": {
    "tag": "details",
    "className": "od-disclosure od-disclosure--flat"
  },
  "health-title": {
    "tag": "summary",
    "textContent": "目标健康检查"
  },
  "target-url": {
    "tag": "input",
    "type": "url",
    "className": "od-field"
  },
  "create-target": {
    "tag": "button",
    "className": "od-button",
    "textContent": "授权并创建检查页"
  },
  "check-source": {
    "tag": "button",
    "className": "od-button od-button--secondary",
    "textContent": "检查原页面"
  },
  "check-target": {
    "tag": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "检查已绑定文档"
  },
  "status": {
    "tag": "p",
    "textContent": "环境入口已加载"
  },
  "health-result": {
    "tag": "pre",
    "className": "od-result"
  },
  "developer-run-feedback": {
    "tag": "p",
    "className": "developer-run-feedback"
  },
  "script-status": {
    "tag": "span",
    "dataset": {
      "state": "loading"
    },
    "textContent": "正在连接公共运行入口…"
  },
  "script-task-status": {
    "tag": "span",
    "className": "developer-task-status",
    "hidden": true
  },
  "script-user-scripts-recovery": {
    "tag": "div",
    "className": "developer-execution-help od-alert od-alert--warning",
    "hidden": true,
    "dataset": {
      "state": "blocked"
    }
  },
  "script-user-scripts-recovery-status": {
    "tag": "p"
  },
  "script-user-scripts-settings": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "打开扩展设置"
  },
  "script-user-scripts-check": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "重新检测"
  },
  "developer-results-panel": {
    "tag": "details",
    "className": "developer-results od-disclosure"
  },
  "script-result-kind": {
    "tag": "span",
    "className": "hint",
    "textContent": "尚无结果"
  },
  "script-copy-feedback": {
    "tag": "span",
    "className": "od-note",
    "hidden": true
  },
  "script-copy-result": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-icon-button",
    "title": "复制运行结果"
  },
  "script-result": {
    "tag": "pre",
    "className": "od-result",
    "textContent": "尚无结果"
  },
  "script-history-panel": {
    "tag": "details",
    "className": "result-history od-disclosure od-disclosure--flat"
  },
  "script-history-hint": {
    "tag": "p",
    "className": "hint",
    "textContent": "仅刷新已有记录，不会重新运行脚本。"
  },
  "script-read": {
    "tag": "button",
    "type": "button",
    "className": "od-icon-button",
    "title": "刷新运行历史"
  },
  "script-history-run": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "选择历史任务",
        ""
      ]
    ],
    "value": ""
  },
  "script-history-open": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "查看选中任务"
  },
  "script-history": {
    "tag": "pre",
    "className": "od-result",
    "textContent": "正在读取…"
  },
  "script-run-id": {
    "tag": "input",
    "className": "od-field"
  },
  "script-read-run": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "查询任务"
  },
  "script-download-result": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "请选择要下载的结果",
        ""
      ]
    ],
    "value": ""
  },
  "script-download": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "下载结果 JSON"
  },
  "script-download-status": {
    "tag": "p",
    "className": "hint",
    "textContent": "结果下载保留类型信息，包括 undefined。"
  },
  "developer-run-technical": {
    "tag": "details",
    "className": "developer-run-technical od-disclosure"
  },
  "script-task-id": {
    "tag": "p",
    "className": "identity",
    "textContent": "尚未运行"
  },
  "script-running-target": {
    "tag": "p",
    "className": "identity",
    "dataset": {
      "state": "idle"
    },
    "textContent": "运行目标：尚未建立"
  },
  "script-task-version": {
    "tag": "p",
    "className": "identity"
  },
  "developer-program-management": {
    "tag": "details",
    "className": "od-disclosure"
  },
  "script-version-identity": {
    "tag": "details",
    "className": "od-disclosure"
  },
  "script-id": {
    "tag": "input",
    "value": "my-script",
    "className": "od-field"
  },
  "script-revision": {
    "tag": "input",
    "type": "number",
    "className": "od-field"
  },
  "script-load": {
    "tag": "button",
    "className": "od-button od-button--secondary",
    "textContent": "加载版本"
  },
  "page-preview-tools": {
    "tag": "details",
    "className": "od-disclosure"
  },
  "page-preview-mode-title": {
    "tag": "summary",
    "textContent": "网页 JavaScript 试运行"
  },
  "page-preview-mode-hint": {
    "tag": "p",
    "className": "hint",
    "textContent": "直接使用上方 JavaScript 源码操作当前网页 DOM；可写 async function main() 返回结果，也可直接编写顶层语句。不要求特殊脚本声明；运行前仍需网站授权。"
  },
  "page-preview-run": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "hidden": true,
    "className": "od-button",
    "textContent": "在当前网页试运行"
  },
  "page-component-status": {
    "tag": "p",
    "hidden": true
  },
  "page-preview-status": {
    "tag": "p",
    "hidden": true,
    "textContent": "请先确认当前网页可用；试运行不会保存版本或安装任务。"
  },
  "page-preview-result": {
    "tag": "pre",
    "className": "od-result",
    "hidden": true,
    "textContent": "尚未运行"
  },
  "page-preview-technical-panel": {
    "tag": "details",
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "page-preview-technical": {
    "tag": "pre"
  },
  "page-candidate-save": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "保存网页脚本版本"
  },
  "page-candidate-status": {
    "tag": "p",
    "textContent": "尚未保存网页脚本候选。"
  },
  "page-program-list": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "正在读取…",
        ""
      ]
    ],
    "value": ""
  },
  "page-program-detail": {
    "tag": "pre",
    "className": "od-result",
    "textContent": "尚未读取。"
  },
  "page-program-load": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "加载源码"
  },
  "page-program-verify": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "验证冻结版本"
  },
  "page-program-install": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button",
    "textContent": "安装自动运行"
  },
  "page-program-toggle": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "停用自动运行"
  },
  "page-program-restore": {
    "tag": "button",
    "type": "button",
    "hidden": true,
    "className": "od-button od-button--secondary",
    "textContent": "恢复访问"
  },
  "page-program-uninstall": {
    "tag": "button",
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--danger",
    "textContent": "卸载程序"
  },
  "page-program-refresh": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "刷新状态"
  },
  "page-program-status": {
    "tag": "p",
    "textContent": "正式安装支持顶层网页与 document-idle；停用不会撤销已有网页效果。效果未知时不自动重放。"
  },
  "script-library-tools": {
    "tag": "details",
    "className": "od-disclosure"
  },
  "script-list": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "正在读取已保存脚本…",
        ""
      ]
    ],
    "value": ""
  },
  "script-list-refresh": {
    "tag": "button",
    "className": "od-button od-button--secondary",
    "textContent": "刷新"
  },
  "script-list-load": {
    "tag": "button",
    "className": "od-button od-button--secondary",
    "textContent": "加载最新"
  },
  "script-version": {
    "tag": "p",
    "textContent": "尚未保存"
  },
  "script-save-version": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "保存 Controller 固定版本"
  },
  "task-package-dev": {
    "tag": "details",
    "className": "od-disclosure od-disclosure--flat"
  },
  "task-dev-id": {
    "tag": "input",
    "value": "my-first-task",
    "className": "od-field"
  },
  "task-dev-version": {
    "tag": "input",
    "value": "1.0.0",
    "className": "od-field"
  },
  "task-dev-title": {
    "tag": "input",
    "value": "我的第一个任务",
    "className": "od-field"
  },
  "task-dev-description": {
    "tag": "input",
    "value": "运行当前网页的自动化脚本",
    "className": "od-field"
  },
  "task-dev-author": {
    "tag": "input",
    "value": "local-developer",
    "className": "od-field"
  },
  "task-dev-schema": {
    "tag": "textarea",
    "className": "od-field",
    "value": "{\"type\":\"object\",\"properties\":{},\"required\":[],\"additionalProperties\":false}"
  },
  "task-create-candidate": {
    "tag": "button",
    "type": "button",
    "className": "od-button",
    "textContent": "保存为待验证任务候选"
  },
  "task-dev-status": {
    "tag": "p",
    "textContent": "候选需要真实运行验证后才能安装"
  },
  "script-advanced": {
    "tag": "details",
    "className": "od-disclosure"
  },
  "site-access": {
    "tag": "details",
    "className": "site-access-panel od-disclosure od-disclosure--flat"
  },
  "site-access-status": {
    "tag": "p",
    "dataset": {
      "state": "checking"
    },
    "textContent": "正在查询 Chrome 网站权限…"
  },
  "site-access-grant": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "恢复全部网站访问"
  },
  "site-access-refresh": {
    "tag": "button",
    "type": "button",
    "className": "od-button od-button--secondary",
    "textContent": "刷新授权状态"
  },
  "script-target-mode": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "当前网页（默认）",
        "current"
      ],
      [
        "创建隔离网页（高级）",
        "owned"
      ],
      [
        "手动选择精确文档（高级）",
        "borrowed"
      ]
    ],
    "value": "current"
  },
  "script-owned-url": {
    "tag": "input",
    "type": "url",
    "disabled": true,
    "className": "od-field"
  },
  "script-tab": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "请选择具体网页",
        ""
      ]
    ],
    "value": ""
  },
  "script-refresh": {
    "tag": "button",
    "className": "od-button od-button--secondary",
    "textContent": "刷新网页列表"
  },
  "script-document": {
    "tag": "select",
    "className": "od-field",
    "options": [
      [
        "请选择当前精确文档",
        ""
      ]
    ],
    "value": ""
  },
  "script-allow-cookies": {
    "tag": "input",
    "type": "checkbox"
  },
  "script-delete": {
    "tag": "button",
    "disabled": true,
    "className": "od-button od-button--danger",
    "textContent": "删除脚本"
  },
  "script-current-page-debug": {
    "tag": "pre"
  },
  "develop-dock": {
    "tag": "div",
    "className": "dock-actions",
    "hidden": true
  },
  "script-run": {
    "tag": "button",
    "className": "od-button",
    "disabled": true,
    "textContent": "运行草稿"
  },
  "script-save": {
    "tag": "button",
    "className": "od-button od-button--secondary",
    "textContent": "保存版本"
  },
  "script-stop": {
    "tag": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "停止"
  }
};
