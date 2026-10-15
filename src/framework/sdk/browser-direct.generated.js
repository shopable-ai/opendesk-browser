// Generated from the pinned, approved Browser SDK matrix. Do not edit.
// Runtime import is a finite allowlist, not a Chrome RPC surface.
export const APPROVED_BROWSER_DIRECT_BINDINGS=Object.freeze([
  {
    "operation": "browser.i18n.detectLanguage",
    "mode": "DIRECT",
    "nativeApi": "chrome.i18n.detectLanguage",
    "parameters": [
      {
        "name": "text",
        "type": "string",
        "optional": false
      }
    ],
    "requiredCapabilities": [
      "browser.i18n"
    ],
    "requiredChromePermissions": [],
    "supportedContexts": [
      "sidebar-tool"
    ],
    "requiresUserGesture": false,
    "siteScope": "none",
    "effectClass": "read",
    "riskLevel": "low",
    "lifecycle": "request",
    "maxRequestBytes": 12000,
    "maxResponseBytes": 12000,
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "maxLength": 4096
        }
      },
      "required": [
        "text"
      ],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "isReliable": {
          "type": "boolean"
        },
        "languages": {
          "type": "array",
          "maxItems": 64,
          "items": {
            "type": "object",
            "properties": {
              "language": {
                "type": "string",
                "maxLength": 64
              },
              "percentage": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100
              }
            },
            "required": [
              "language",
              "percentage"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "isReliable",
        "languages"
      ],
      "additionalProperties": false
    },
    "minChrome": 138
  },
  {
    "operation": "browser.i18n.getAcceptLanguages",
    "mode": "DIRECT",
    "nativeApi": "chrome.i18n.getAcceptLanguages",
    "parameters": [],
    "requiredCapabilities": [
      "browser.i18n"
    ],
    "requiredChromePermissions": [],
    "supportedContexts": [
      "sidebar-tool"
    ],
    "requiresUserGesture": false,
    "siteScope": "none",
    "effectClass": "read",
    "riskLevel": "low",
    "lifecycle": "request",
    "maxRequestBytes": 1024,
    "maxResponseBytes": 8192,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "array",
      "maxItems": 64,
      "items": {
        "type": "string",
        "maxLength": 64
      }
    },
    "minChrome": 138
  },
  {
    "operation": "browser.runtime.getPlatformInfo",
    "mode": "DIRECT",
    "nativeApi": "chrome.runtime.getPlatformInfo",
    "parameters": [],
    "requiredCapabilities": [
      "browser.runtime"
    ],
    "requiredChromePermissions": [],
    "supportedContexts": [
      "sidebar-tool"
    ],
    "requiresUserGesture": false,
    "siteScope": "none",
    "effectClass": "read",
    "riskLevel": "low",
    "lifecycle": "request",
    "maxRequestBytes": 1024,
    "maxResponseBytes": 1024,
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "os": {
          "type": "string",
          "maxLength": 32
        },
        "arch": {
          "type": "string",
          "maxLength": 32
        },
        "nacl_arch": {
          "type": "string",
          "maxLength": 32
        }
      },
      "required": [
        "os",
        "arch"
      ],
      "additionalProperties": false
    },
    "minChrome": 138
  }
]);
