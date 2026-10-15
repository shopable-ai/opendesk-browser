// Generated from the pinned approved Browser SDK matrix. Do not edit.
// Trusted-service metadata only; original Host/Driver remains authoritative.
export const APPROVED_BROWSER_SCOPED_BINDINGS=Object.freeze([
  {
    "operation": "browser.storage.local.keys",
    "mode": "TRUSTED_SERVICE",
    "mappingKind": "EXISTING_SERVICE",
    "requiredCapabilities": [
      "browser.storage"
    ],
    "requiredChromePermissions": [
      "storage"
    ],
    "supportedContexts": [
      "sidebar-tool"
    ],
    "requiresUserGesture": false,
    "siteScope": "owner toolId + packageHash + installEpoch, own namespace only",
    "effectClass": "read",
    "riskLevel": "low",
    "lifecycle": "request / owned opaque Ref; fail closed after revoke/restart when applicable",
    "maxRequestBytes": 12000,
    "maxResponseBytes": 12000,
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {},
      "required": []
    },
    "outputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "keys": {
          "type": "array",
          "items": {
            "type": "string",
            "maxLength": 128,
            "pattern": "^[A-Za-z][A-Za-z0-9._-]{0,127}$"
          },
          "maxItems": 32
        }
      },
      "required": [
        "keys"
      ]
    },
    "minChrome": 138
  },
  {
    "operation": "browser.tabs.create",
    "mode": "TRUSTED_SERVICE",
    "mappingKind": "SCOPED",
    "requiredCapabilities": [
      "browser.tabs"
    ],
    "requiredChromePermissions": [],
    "supportedContexts": [
      "sidebar-tool"
    ],
    "requiresUserGesture": true,
    "siteScope": "explicit-url",
    "effectClass": "write",
    "riskLevel": "medium",
    "lifecycle": "request",
    "maxRequestBytes": 12000,
    "maxResponseBytes": 12000,
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "url": {
          "type": "string",
          "maxLength": 2048,
          "pattern": "^https?://"
        }
      },
      "required": [
        "url"
      ]
    },
    "outputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "tabRef": {
          "type": "string",
          "maxLength": 160,
          "pattern": "^[A-Za-z0-9_-]{16,160}$"
        }
      },
      "required": [
        "tabRef"
      ]
    },
    "minChrome": 138
  },
  {
    "operation": "browser.tabs.getOwned",
    "mode": "TRUSTED_SERVICE",
    "mappingKind": "SCOPED",
    "requiredCapabilities": [
      "browser.tabs"
    ],
    "requiredChromePermissions": [
      "tabs",
      "webNavigation"
    ],
    "supportedContexts": [
      "sidebar-tool"
    ],
    "requiresUserGesture": false,
    "siteScope": "tab-ref",
    "effectClass": "read",
    "riskLevel": "medium",
    "lifecycle": "request",
    "maxRequestBytes": 12000,
    "maxResponseBytes": 12000,
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "tabRef": {
          "type": "string",
          "maxLength": 160,
          "pattern": "^[A-Za-z0-9_-]{16,160}$"
        }
      },
      "required": [
        "tabRef"
      ]
    },
    "outputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "tabRef": {
          "type": "string",
          "maxLength": 160,
          "pattern": "^[A-Za-z0-9_-]{16,160}$"
        },
        "url": {
          "type": "string",
          "maxLength": 2048,
          "pattern": "^https?://"
        },
        "origin": {
          "type": "string",
          "maxLength": 2048,
          "pattern": "^https?://"
        },
        "expiresAt": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "tabRef",
        "url",
        "origin",
        "expiresAt"
      ]
    },
    "minChrome": 138
  }
]);
