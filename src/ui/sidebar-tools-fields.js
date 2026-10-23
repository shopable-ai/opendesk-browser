// Explicit presentation defaults from the existing trusted tool host. No DOM nodes.
export const SIDEBAR_TOOL_FIELDS = {
  "sidebar-tool-back": {
    "title": "返回工具列表",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "attributes": {
      "aria-label": "返回自定义工具列表"
    }
  },
  "sidebar-tool-display": {
    "hidden": true,
    "className": "sidebar-tool-display",
    "attributes": {
      "aria-label": "当前工具界面"
    }
  },
  "sidebar-tool-status": {
    "hidden": true,
    "textContent": "",
    "className": "sidebar-tool-status",
    "attributes": {
      "aria-live": "polite"
    }
  },
  "sidebar-tool-file": {
    "textContent": "",
    "type": "file",
    "attributes": {
      "aria-describedby": "sidebar-tool-file-error"
    }
  },
  "sidebar-tool-import-trigger": {
    "title": "导入本地工具文件",
    "className": "od-icon-button",
    "type": "button",
    "attributes": {
      "aria-label": "导入工具文件",
      "aria-expanded": "false",
      "aria-controls": "sidebar-tool-import"
    }
  },
  "sidebar-tool-import": {
    "hidden": true,
    "className": "sidebar-tool-import od-surface"
  },
  "sidebar-tool-import-close": {
    "title": "取消导入",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "attributes": {
      "aria-label": "取消导入"
    }
  },
  "sidebar-tool-preview": {
    "hidden": true,
    "className": "sidebar-tool-preview"
  },
  "sidebar-tool-preview-title": {
    "textContent": ""
  },
  "sidebar-tool-preview-version": {
    "textContent": ""
  },
  "sidebar-tool-preview-description": {
    "textContent": ""
  },
  "sidebar-tool-preview-capabilities": {
    "textContent": ""
  },
  "sidebar-tool-preview-file": {
    "textContent": "",
    "className": "sidebar-tool-preview-file"
  },
  "sidebar-tool-install": {
    "disabled": true,
    "textContent": "确认安装",
    "className": "od-button",
    "type": "button"
  },
  "sidebar-tool-remove": {
    "disabled": true,
    "title": "卸载工具及本地数据",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "attributes": {
      "aria-label": "卸载当前工具及本地数据"
    }
  },
  "sidebar-tool-inline-remove": {
    "hidden": true,
    "className": "sidebar-tool-inline-remove od-surface",
    "attributes": {
      "aria-label": "卸载工具确认"
    }
  },
  "sidebar-tool-inline-remove-text": {
    "textContent": ""
  },
  "sidebar-tool-inline-remove-confirm": {
    "textContent": "确认卸载并删除数据",
    "className": "od-button",
    "type": "button"
  },
  "sidebar-tool-inline-remove-cancel": {
    "textContent": "取消",
    "className": "od-button od-button--secondary",
    "type": "button"
  },
  "sidebar-tool-file-error": {
    "hidden": true,
    "textContent": "",
    "className": "sidebar-tool-file-error"
  },
  "sidebar-tool-update": {
    "hidden": true,
    "className": "sidebar-tool-update od-surface"
  },
  "sidebar-tool-update-versions": {
    "textContent": ""
  },
  "sidebar-tool-update-capabilities": {
    "textContent": ""
  },
  "sidebar-tool-update-warning": {
    "hidden": true,
    "textContent": "",
    "className": "sidebar-tool-update-warning"
  },
  "sidebar-tool-title": {
    "textContent": "",
    "className": "od-page-title"
  },
  "sidebar-tool-primary-action": {
    "hidden": true,
    "title": "",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "data": {"action": ""},
    "attributes": {"aria-label": "当前页面操作"}
  },
  "sidebar-tool-secondary-action": {
    "hidden": true,
    "title": "",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "data": {"action": ""},
    "attributes": {"aria-label": "更多操作", "aria-haspopup": "true", "aria-expanded": "false"}
  },
  "sidebar-tool-open-tab": {
    "disabled": true,
    "title": "在新标签页打开",
    "className": "od-button od-button--secondary sidebar-tool-settings-open-tab",
    "type": "button",
    "attributes": {
      "aria-label": "在新标签页打开当前工具"
    }
  },
  "sidebar-tool-action-review": {
    "hidden": true,
    "className": "sidebar-tool-action-review od-surface",
    "attributes": {
      "aria-label": "确认当前工具操作"
    }
  },
  "sidebar-tool-action-summary": {
    "textContent": ""
  },
  "sidebar-tool-action-continue": {
    "textContent": "继续",
    "className": "od-button",
    "type": "button"
  },
  "sidebar-tool-action-cancel": {
    "textContent": "取消",
    "className": "od-button od-button--secondary",
    "type": "button"
  },
  "page-install-import-status": {
    "hidden": true,
    "textContent": "",
    "attributes": {
      "aria-live": "polite"
    }
  },
  "page-install-import-receipt": {
    "hidden": true,
    "className": "od-disclosure"
  },
  "page-install-import-receipt-text": {
    "textContent": ""
  },
  "sidebar-tool-settings-open": {
    "hidden": true,
    "title": "工具设置",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "attributes": {
      "aria-label": "工具设置",
      "aria-controls": "sidebar-tool-settings-view",
      "aria-expanded": "false"
    }
  },
  "sidebar-tool-settings-view": {
    "hidden": true,
    "className": "sidebar-tool-settings-view od-surface",
    "attributes": {
      "aria-label": "工具设置"
    }
  },
  "sidebar-tool-toc-language": {
    "hidden": true,
    "className": "sidebar-toc-settings-row"
  },
  "sidebar-tool-toc-language-select": {
    "className": "od-field",
    "attributes": {
      "aria-label": "界面语言"
    },
    "options": [
      {
        "value": "zh-CN",
        "label": "简体中文"
      },
      {
        "value": "en",
        "label": "English"
      }
    ],
    "value": "zh-CN"
  },
  "sidebar-tool-context-menu": {
    "hidden": true,
    "title": "为当前网站启用右键菜单",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "attributes": {
      "aria-label": "为当前网站启用右键菜单",
      "aria-pressed": "false"
    }
  },
  "sidebar-tool-settings-scope": {
    "hidden": true,
    "textContent": "只设置本页",
    "className": "od-button od-button--secondary",
    "type": "button"
  },
  "sidebar-tool-enable": {
    "textContent": "停用工具",
    "className": "od-button od-button--secondary ps-host-switch",
    "type": "button",
    "attributes": {
      "aria-pressed": "true"
    }
  },
  "sidebar-tool-enable-hint": {
    "textContent": "",
    "className": "sidebar-toc-settings-hint"
  },
  "sidebar-tool-prompt-native-row": {
    "hidden": true,
    "className": "sidebar-toc-settings-row sidebar-tool-prompt-native"
  },
  "sidebar-tool-prompt-native-action": {
    "textContent": "启用右键",
    "className": "od-button od-button--secondary ps-host-switch",
    "type": "button",
    "attributes": {
      "aria-pressed": "false"
    }
  },
  "sidebar-tool-prompt-web-row": {
    "hidden": true,
    "className": "sidebar-toc-settings-row sidebar-tool-prompt-native"
  },
  "sidebar-tool-prompt-web-action": {
    "disabled": true,
    "textContent": "",
    "className": "ps-host-switch",
    "type": "button",
    "attributes": {
      "aria-label": "网页快捷按钮",
      "aria-checked": "true"
    }
  },
  "sidebar-tool-prompt-enable-label": {
    "textContent": "工具启停",
    "attributes": {
      "data-toc-host-text": "toggleHeading"
    }
  },
  "sidebar-tool-prompt-enable-description": {
    "hidden": true,
    "textContent": "停用后提示词仍保留"
  },
  "sidebar-tool-launch": {
    "hidden": true,
    "textContent": "打开工具",
    "className": "od-button",
    "type": "button"
  },
  "sidebar-tool-visibility": {
    "hidden": true,
    "title": "显示或隐藏此网站的悬浮目录",
    "className": "sidebar-tool-icon-action od-icon-button",
    "type": "button",
    "attributes": {
      "aria-label": "显示或隐藏此网站的悬浮目录",
      "aria-pressed": "true"
    }
  },
  "sidebar-tool-visibility-settings": {
    "hidden": true
  },
  "sidebar-tool-page-exceptions": {
    "hidden": true
  },
  "sidebar-tool-retired-draft": {
    "hidden": true,
    "className": "sidebar-tool-settings-view od-surface",
    "attributes": {
      "aria-label": "停用前的草稿"
    }
  },
  "sidebar-tool-retired-draft-text": {
    "readOnly": true,
    "textContent": "",
    "className": "od-field",
    "attributes": {
      "aria-label": "可复制的草稿副本"
    }
  },
  "sidebar-tool-retired-draft-dismiss": {
    "textContent": "清除草稿副本",
    "className": "od-button",
    "type": "button"
  },
  "sidebar-tool-settings-scope-label": {
    "textContent": "当前网站可用性",
    "className": "sidebar-toc-settings-caption"
  },
  "sidebar-tool-settings-target": {
    "textContent": "请选择适用网页"
  },
  "sidebar-tool-settings-allow": {
    "textContent": "恢复当前网站",
    "className": "od-button od-button--secondary",
    "type": "button",
    "attributes": {
      "aria-pressed": "false"
    }
  },
  "sidebar-tool-settings-deny": {
    "textContent": "停用当前网站",
    "className": "od-button od-button--danger",
    "type": "button",
    "attributes": {
      "aria-pressed": "false"
    }
  },
  "sidebar-tool-settings-hint": {
    "textContent": "",
    "className": "sidebar-toc-settings-hint"
  },
  "sidebar-tool-settings-site-visibility": {
    "textContent": "隐藏",
    "className": "sidebar-toc-visibility-toggle",
    "type": "button"
  },
  "sidebar-tool-settings-page-visibility": {
    "textContent": "隐藏",
    "className": "sidebar-toc-visibility-toggle",
    "type": "button"
  },
  "sidebar-tool-settings-sites": {
    "textContent": "",
    "className": "sidebar-toc-settings-entries"
  },
  "sidebar-tool-settings-pages": {
    "textContent": "",
    "className": "sidebar-toc-settings-entries"
  },
  "sidebar-tool-settings-sites-title": {
    "textContent": "已授权的网站",
    "className": "sidebar-toc-settings-title"
  },
  "sidebar-tool-readonly-banner": {
    "hidden": true,
    "textContent": "开发只读预览 · 未安装。模拟读取仅返回空值；禁止写入、发送消息、控制网页或运行任务。需要正式使用时，请另行审阅并安装工具包。",
    "className": "sidebar-tool-status",
    "attributes": {
      "data-state": "readonly"
    }
  },
  "sidebar-tool-cookie-permissions": {},
  "sidebar-tool-cookie-heading": {},
  "sidebar-tool-cookie-target": {},
  "sidebar-tool-cookie-help": {},
  "sidebar-tool-cookie-first-use": {},
  "sidebar-tool-cookie-site-toggle": {},
  "sidebar-tool-cookie-values-toggle": { "hidden": true },
  "sidebar-tool-cookie-other-sites": {},
  "sidebar-tool-bookmark-permissions": {},
  "sidebar-tool-bookmark-heading": {},
  "sidebar-tool-bookmark-info": {},
  "sidebar-tool-bookmark-grant": {},
  "sidebar-tool-generic-site-binary": {
    "className": "sidebar-toc-settings-binary",
    "attributes": {
      "aria-label": "当前网站授权"
    }
  },
  "sidebar-tool-generic-site-scope": {
    "className": "sidebar-toc-settings-scope"
  },
  "sidebar-tool-generic-site-advanced": {
    "open": true,
    "className": "sidebar-toc-advanced od-disclosure od-disclosure--flat"
  },
  "sidebar-tool-official-catalog": {
    "textContent": "",
    "attributes": {
      "aria-label": "官方工具发现结果"
    }
  }
};

export const SIDEBAR_TOOL_LABELS = {
  "languageLabel": "界面语言",
  "toggleHeading": "工具启停",
  "overlayHeading": "网页悬浮目录外观",
  "websiteHeading": "此网站",
  "pageHeading": "仅此页面",
  "overlayHint": "网站可用且工具启用时显示；隐藏只影响网页悬浮目录，Side Panel 目录仍可使用。两级隐藏规则都恢复后才显示。",
  "advancedHeading": "已有授权与页面例外",
  "exceptionsHeading": "阅读目录已排除的页面"
};
