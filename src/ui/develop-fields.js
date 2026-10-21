// Initial UI values only. Runtime authority remains in the existing editor controllers.
export const DEVELOPER_FIELDS = {
  "workbench-develop": {
    "className": "od-page",
    "hidden": true,
    "dataset": {
      "workbenchPage": "develop"
    }
  },
  "developer-source-switch": {
    "dataset": {
      "mode": "manual"
    }
  },
  "developer-source-title": {
    "textContent": "直接编辑"
  },
  "program-new-script": {
    "hidden": true,
    "className": "od-icon-button"
  },
  "local-project-mode": {
    "type": "checkbox"
  },
  "developer-target-detail": {
    "className": "od-disclosure"
  },
  "script-current-page-host": {
    "textContent": "正在识别…"
  },
  "script-current-page-status": {
    "dataset": {
      "state": "resolving"
    },
    "textContent": "检查中"
  },
  "script-current-page-title": {
    "textContent": "正在识别…"
  },
  "script-current-page-url": {
    "className": "identity"
  },
  "local-project-tools": {
    "hidden": true
  },
  "local-project-select": {
    "options": [
      [
        "选择已授权项目",
        ""
      ]
    ],
    "value": ""
  },
  "local-project-refresh": {
    "title": "刷新已授权本地项目"
  },
  "local-project-status": {},
  "local-install-review": {
    "hidden": true
  },
  "local-install-summary": {
    "className": "hint"
  },
  "local-install-title": {
    "className": "od-field"
  },
  "local-install-version": {
    "className": "od-field"
  },
  "local-install-warning": {
    "className": "hint"
  },
  "local-install-confirm": {
    "disabled": true,
    "textContent": "确认安装固定版本"
  },
  "local-install-cancel": {
    "textContent": "取消"
  },
  "local-install-status": {},
  "local-project-diagnostics": {
    "textContent": "正在核对 Native 和源码 Provider。"
  },
  "local-project-recovery": {
    "hidden": true
  },
  "local-project-connect": {
    "textContent": "连接本机 OpenDesk ↗"
  },
  "local-project-guide": {
    "className": "local-project-guide od-disclosure od-disclosure--info"
  },
  "local-project-guide-open": {
    "textContent": "查看首次配置命令和示例 ↗"
  },
  "local-project-params-tools": {
    "hidden": true,
    "className": "od-disclosure"
  },
  "local-project-params": {
    "value": "{}"
  },
  "manual-source-editor": {},
  "program-source-info": {
    "hidden": true
  },
  "program-source-toolbar": {
    "hidden": true
  },
  "program-source-files": {
    "hidden": true,
    "options": [],
    "value": ""
  },
  "page-component-editor-tools": {
    "className": "od-toolbar"
  },
  "page-component-framework": {},
  "page-component-javascript": {
    "name": "page-component-choice",
    "value": "javascript",
    "checked": true
  },
  "page-component-react": {
    "name": "page-component-choice",
    "value": "react"
  },
  "page-component-vue": {
    "name": "page-component-choice",
    "value": "vue"
  },
  "script-javascript-world-row": {
    "className": "od-toolbar"
  },
  "script-javascript-world": {
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
    "textContent": "JavaScript、React JSX 或 Vue SFC 源码编辑器"
  },
  "script-source": {
    "value": ""
  },
  "page-component-hint": {
    "textContent": "编辑源码不会自动执行，点击运行才会执行"
  },
  "page-dependency-panel": {
    "className": "od-stack od-disclosure od-disclosure--flat",
    "hidden": true
  },
  "page-dependency-status": {
    "textContent": "点击运行会自动固定安全依赖；这里仅显示高级详情。"
  },
  "page-dependency-list": {
    "className": "od-stack"
  },
  "page-dependency-lock": {
    "hidden": true,
    "className": "od-field",
    "options": [],
    "value": ""
  },
  "page-dependency-prepare": {
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "获取并检查依赖（不执行）"
  },
  "page-dependency-review": {
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "page-dependency-review-list": {
    "className": "od-stack"
  },
  "page-dependency-approve": {
    "type": "button",
    "disabled": true,
    "className": "od-button od-button--secondary",
    "textContent": "批准当前程序的固定 SHA 锁（不运行）"
  },
  "page-component-remote": {
    "hidden": true
  },
  "page-component-remote-status": {},
  "page-component-remote-sources": {
    "hidden": true
  },
  "page-component-remote-lock": {
    "hidden": true,
    "options": [
      [
        "选择固定依赖版本",
        ""
      ]
    ],
    "value": ""
  },
  "page-component-remote-prepare": {
    "textContent": "检查依赖"
  },
  "page-component-remote-cancel": {
    "hidden": true,
    "textContent": "取消准备"
  },
  "page-component-remote-details": {
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "page-component-remote-detail-body": {},
  "program-generated": {
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "program-generated-source": {},
  "manual-project-params-tools": {
    "className": "developer-params od-disclosure"
  },
  "script-params": {
    "value": "{\"value\":0}"
  },
  "tool-diagnostics": {
    "className": "od-disclosure"
  },
  "developer-sdk-diagnostics": {
    "className": "od-disclosure od-disclosure--flat"
  },
  "sdk-tab": {
    "options": [
      [
        "请选择具体网页",
        ""
      ]
    ],
    "value": ""
  },
  "sdk-refresh": {
    "textContent": "刷新网页列表"
  },
  "sdk-document": {
    "disabled": true,
    "options": [
      [
        "先选择网页，再选择文档",
        ""
      ]
    ],
    "value": ""
  },
  "sdk-capabilities": {},
  "sdk-target-origins": {
    "value": ""
  },
  "sdk-approval-preview": {
    "className": "od-result"
  },
  "sdk-install": {
    "disabled": true,
    "textContent": "明确批准此快照并安装 SDK"
  },
  "sdk-inspect": {
    "disabled": true,
    "textContent": "只读查询当前授权"
  },
  "sdk-revoke": {
    "disabled": true,
    "textContent": "撤销已确认授权"
  },
  "sdk-status": {
    "dataset": {
      "state": "idle"
    },
    "textContent": "请选择网页、文档和服务"
  },
  "sdk-result": {
    "className": "od-result"
  },
  "developer-health-diagnostics": {
    "className": "od-disclosure od-disclosure--flat"
  },
  "target-url": {
    "className": "od-field"
  },
  "create-target": {
    "textContent": "授权并创建检查页"
  },
  "check-source": {
    "textContent": "检查原页面"
  },
  "check-target": {
    "disabled": true,
    "textContent": "检查已绑定文档"
  },
  "status": {
    "textContent": "环境入口已加载"
  },
  "health-result": {
    "className": "od-result"
  },
  "developer-run-feedback": {
    "className": "developer-run-feedback"
  },
  "script-status": {
    "dataset": {
      "state": "loading"
    },
    "textContent": "正在连接公共运行入口…"
  },
  "script-task-status": {
    "hidden": true
  },
  "script-user-scripts-recovery": {
    "hidden": true,
    "dataset": {
      "state": "blocked"
    }
  },
  "script-user-scripts-recovery-status": {},
  "script-user-scripts-settings": {
    "textContent": "打开扩展设置"
  },
  "script-user-scripts-check": {
    "textContent": "重新检测"
  },
  "developer-results-panel": {
    "className": "developer-results od-disclosure"
  },
  "script-result-kind": {
    "textContent": "尚无结果"
  },
  "script-copy-feedback": {
    "hidden": true
  },
  "script-copy-result": {
    "disabled": true,
    "title": "复制运行结果"
  },
  "script-result": {
    "textContent": "尚无结果"
  },
  "script-history-panel": {
    "className": "result-history od-disclosure od-disclosure--flat"
  },
  "script-read": {
    "title": "刷新运行历史"
  },
  "script-history-run": {
    "options": [
      [
        "选择历史任务",
        ""
      ]
    ],
    "value": ""
  },
  "script-history-open": {
    "disabled": true,
    "textContent": "查看选中任务"
  },
  "script-history": {
    "textContent": "正在读取…"
  },
  "script-run-id": {
    "className": "od-field"
  },
  "script-read-run": {
    "textContent": "查询任务"
  },
  "script-download-result": {
    "options": [
      [
        "请选择要下载的结果",
        ""
      ]
    ],
    "value": ""
  },
  "script-download": {
    "disabled": true,
    "textContent": "下载结果 JSON"
  },
  "script-download-status": {
    "textContent": "结果下载保留类型信息，包括 undefined。"
  },
  "developer-run-technical": {
    "className": "developer-run-technical od-disclosure"
  },
  "script-task-id": {
    "textContent": "尚未运行"
  },
  "script-running-target": {
    "dataset": {
      "state": "idle"
    },
    "textContent": "运行目标：尚未建立"
  },
  "script-task-version": {
    "className": "identity"
  },
  "developer-program-management": {
    "className": "od-disclosure"
  },
  "script-version-identity": {
    "className": "developer-management-section"
  },
  "script-id": {
    "value": "my-script",
    "className": "od-field"
  },
  "script-revision": {
    "className": "od-field"
  },
  "script-load": {
    "textContent": "加载版本"
  },
  "page-preview-tools": {
    "className": "developer-management-section",
    "hidden": true
  },
  "page-preview-mode-title": {
    "textContent": "网页 JavaScript 试运行"
  },
  "page-preview-mode-hint": {
    "textContent": "直接使用上方 JavaScript 源码操作当前网页 DOM；可写 async function main() 返回结果，也可直接编写顶层语句。不要求特殊脚本声明；运行前仍需网站授权。"
  },
  "page-component-status": {
    "hidden": true
  },
  "page-preview-status": {
    "hidden": true,
    "textContent": "请先确认当前网页可用；试运行不会保存版本或安装任务。"
  },
  "page-preview-technical-panel": {
    "hidden": true,
    "className": "od-disclosure od-disclosure--flat"
  },
  "page-preview-technical": {},
  "page-candidate-save": {
    "disabled": true,
    "textContent": "保存网页脚本版本"
  },
  "page-candidate-status": {
    "textContent": "尚未保存网页脚本候选。"
  },
  "page-program-list": {
    "options": [
      [
        "正在读取…",
        ""
      ]
    ],
    "value": ""
  },
  "page-program-detail": {
    "textContent": "尚未读取。"
  },
  "page-program-load": {
    "disabled": true,
    "textContent": "加载源码"
  },
  "page-program-verify": {
    "disabled": true,
    "textContent": "验证冻结版本"
  },
  "page-program-install": {
    "disabled": true,
    "textContent": "安装自动运行"
  },
  "page-program-toggle": {
    "disabled": true,
    "textContent": "停用自动运行"
  },
  "page-program-restore": {
    "hidden": true,
    "textContent": "恢复访问"
  },
  "page-program-uninstall": {
    "disabled": true,
    "textContent": "卸载程序"
  },
  "page-program-refresh": {
    "textContent": "刷新状态"
  },
  "page-program-status": {
    "textContent": "正式安装支持顶层网页与 document-idle；停用不会撤销已有网页效果。效果未知时不自动重放。"
  },
  "script-library-tools": {
    "className": "developer-management-section"
  },
  "script-list": {
    "options": [
      [
        "正在读取已保存脚本…",
        ""
      ]
    ],
    "value": ""
  },
  "script-list-refresh": {
    "textContent": "刷新"
  },
  "script-list-load": {
    "textContent": "加载最新"
  },
  "script-version": {
    "textContent": "尚未保存"
  },
  "script-save-version": {
    "textContent": "保存 Controller 固定版本"
  },
  "task-package-dev": {
    "className": "od-disclosure od-disclosure--flat"
  },
  "task-dev-id": {
    "value": "my-first-task",
    "className": "od-field"
  },
  "task-dev-version": {
    "value": "1.0.0",
    "className": "od-field"
  },
  "task-dev-title": {
    "value": "我的第一个任务",
    "className": "od-field"
  },
  "task-dev-description": {
    "value": "运行当前网页的自动化脚本",
    "className": "od-field"
  },
  "task-dev-author": {
    "value": "local-developer",
    "className": "od-field"
  },
  "task-dev-schema": {
    "value": "{\"type\":\"object\",\"properties\":{},\"required\":[],\"additionalProperties\":false}"
  },
  "task-create-candidate": {
    "textContent": "保存为待验证任务候选"
  },
  "task-dev-status": {
    "textContent": "候选需要真实运行验证后才能安装"
  },
  "script-advanced": {
    "className": "od-disclosure"
  },
  "site-access": {
    "className": "site-access-panel od-disclosure od-disclosure--flat"
  },
  "site-access-status": {
    "dataset": {
      "state": "checking"
    },
    "textContent": "正在查询 Chrome 网站权限…"
  },
  "site-access-grant": {
    "textContent": "恢复全部网站访问"
  },
  "site-access-refresh": {
    "textContent": "刷新授权状态"
  },
  "script-allow-cookies": {
    "type": "checkbox"
  },
  "script-delete": {
    "disabled": true,
    "textContent": "删除脚本"
  },
  "script-current-page-debug": {},
  "develop-dock": {
    "className": "dock-actions",
    "hidden": true
  },
  "script-run": {
    "disabled": true,
    "textContent": "运行"
  },
  "script-save": {
    "textContent": "保存版本"
  },
  "script-stop": {
    "disabled": true,
    "textContent": "停止"
  }
};
