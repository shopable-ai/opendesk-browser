/**
 * ScrapyJS R2.2 pure, host-independent business contract.
 * JSON Schema is generated from this exported object (not maintained separately).
 * Never interpret a recipe, profile, capability claim or approvalRef as a runtime grant.
 */
export const CONTRACT_VERSION = 'scrapyjs.execution.v1';
export const CONTRACT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://opendesk.ai/contracts/scrapyjs.execution.v1.schema.json",
  "title": "ScrapyJS execution contract v1",
  "description": "Canonical contract source is contracts/execution-v1.mjs. Schema is generated and tested for byte-independent semantic identity.",
  "$defs": {
    "Limits": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "maxPages",
        "maxRequests",
        "maxResponseBytes",
        "maxTotalBytes",
        "deadlineMs",
        "maxRedirects"
      ],
      "properties": {
        "maxPages": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "maxRequests": {
          "type": "integer",
          "minimum": 1,
          "maximum": 200
        },
        "maxResponseBytes": {
          "type": "integer",
          "minimum": 1024,
          "maximum": 1048576
        },
        "maxTotalBytes": {
          "type": "integer",
          "minimum": 1024,
          "maximum": 8388608
        },
        "deadlineMs": {
          "type": "integer",
          "minimum": 1000,
          "maximum": 300000
        },
        "maxRedirects": {
          "type": "integer",
          "minimum": 0,
          "maximum": 5
        }
      }
    },
    "Recipe": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "recipeId",
        "version",
        "sha256",
        "description",
        "target",
        "extraction",
        "limits"
      ],
      "properties": {
        "schemaVersion": {
          "const": "scrapyjs.execution.v1"
        },
        "recipeId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "version": {
          "type": "string",
          "minLength": 1,
          "maxLength": 32,
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "sha256": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[0-9a-f]{64}$"
        },
        "description": {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        "target": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "url",
            "origins",
            "session"
          ],
          "properties": {
            "url": {
              "type": "string",
              "minLength": 1,
              "maxLength": 2048
            },
            "origins": {
              "type": "array",
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 253
              },
              "minItems": 1,
              "maxItems": 1
            },
            "session": {
              "enum": [
                "none",
                "current-tab"
              ]
            }
          }
        },
        "extraction": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "kind",
            "fields"
          ],
          "properties": {
            "kind": {
              "enum": [
                "dom",
                "static-html"
              ]
            },
            "fields": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/ExtractionField"
              },
              "minItems": 1,
              "maxItems": 32
            }
          }
        },
        "limits": {
          "$ref": "#/$defs/Limits"
        }
      }
    },
    "ExtractionField": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "selector",
        "read"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64
        },
        "selector": {
          "type": "string",
          "minLength": 1,
          "maxLength": 1024
        },
        "read": {
          "enum": [
            "text",
            "attribute"
          ]
        },
        "attribute": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64
        }
      }
    },
    "HeaderProfile": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "profileId",
        "version",
        "entries",
        "userAgent"
      ],
      "properties": {
        "schemaVersion": {
          "const": "scrapyjs.execution.v1"
        },
        "profileId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "version": {
          "type": "string",
          "minLength": 1,
          "maxLength": 32,
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "entries": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/HeaderEntry"
          },
          "minItems": 0,
          "maxItems": 32
        },
        "userAgent": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "mode"
          ],
          "properties": {
            "mode": {
              "enum": [
                "inherit",
                "override"
              ]
            },
            "value": {
              "type": "string",
              "minLength": 1,
              "maxLength": 512
            }
          }
        },
        "credentialRef": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        }
      }
    },
    "HeaderEntry": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "value"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "value": {
          "type": "string",
          "minLength": 0,
          "maxLength": 2048
        }
      }
    },
    "NetworkProfile": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "profileId",
        "version",
        "mode"
      ],
      "properties": {
        "schemaVersion": {
          "const": "scrapyjs.execution.v1"
        },
        "profileId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "version": {
          "type": "string",
          "minLength": 1,
          "maxLength": 32,
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "mode": {
          "enum": [
            "browser-current",
            "direct",
            "approved-proxy",
            "cellular"
          ]
        },
        "proxyRef": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        }
      }
    },
    "NodeCapabilities": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "nodeId",
        "kind",
        "availability",
        "evidenceRef",
        "approvedOrigins",
        "supportedExtraction",
        "supportedNetworks",
        "verifiedHeaderNames",
        "javascriptRendering",
        "canOverrideUserAgent",
        "canUseCredentialRefs",
        "canUseCurrentTabSession",
        "enforcesDnsGuard",
        "inspectsRedirects",
        "stopReadback",
        "resultReadback",
        "cellularBindingVerified",
        "egressVerification",
        "maxLimits"
      ],
      "properties": {
        "schemaVersion": {
          "const": "scrapyjs.execution.v1"
        },
        "nodeId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "kind": {
          "enum": [
            "browser-tab",
            "desktop-http",
            "desktop-browser",
            "android-cellular"
          ]
        },
        "availability": {
          "enum": [
            "verified",
            "unverified",
            "offline"
          ]
        },
        "evidenceRef": {
          "type": "string",
          "minLength": 1,
          "maxLength": 256
        },
        "approvedOrigins": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 253
          },
          "minItems": 0,
          "maxItems": 32
        },
        "supportedExtraction": {
          "type": "array",
          "items": {
            "enum": [
              "dom",
              "static-html"
            ]
          },
          "minItems": 0,
          "maxItems": 2
        },
        "supportedNetworks": {
          "type": "array",
          "items": {
            "enum": [
              "browser-current",
              "direct",
              "approved-proxy",
              "cellular"
            ]
          },
          "minItems": 0,
          "maxItems": 4
        },
        "verifiedHeaderNames": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 80
          },
          "minItems": 0,
          "maxItems": 32
        },
        "javascriptRendering": {
          "type": "boolean"
        },
        "canOverrideUserAgent": {
          "type": "boolean"
        },
        "canUseCredentialRefs": {
          "type": "boolean"
        },
        "canUseCurrentTabSession": {
          "type": "boolean"
        },
        "enforcesDnsGuard": {
          "type": "boolean"
        },
        "inspectsRedirects": {
          "type": "boolean"
        },
        "stopReadback": {
          "type": "boolean"
        },
        "resultReadback": {
          "type": "boolean"
        },
        "cellularBindingVerified": {
          "type": "boolean"
        },
        "egressVerification": {
          "type": "boolean"
        },
        "maxLimits": {
          "$ref": "#/$defs/Limits"
        }
      }
    },
    "ExecutionPlan": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "planId",
        "recipeId",
        "recipeVersion",
        "recipeHash",
        "phase",
        "executionKind",
        "nodeId",
        "headerProfileId",
        "headerProfileVersion",
        "networkProfileId",
        "networkProfileVersion",
        "limits",
        "approval"
      ],
      "properties": {
        "schemaVersion": {
          "const": "scrapyjs.execution.v1"
        },
        "planId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "recipeId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "recipeVersion": {
          "type": "string",
          "minLength": 1,
          "maxLength": 32,
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "recipeHash": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[0-9a-f]{64}$"
        },
        "phase": {
          "enum": [
            "trial",
            "full"
          ]
        },
        "executionKind": {
          "enum": [
            "browser-tab",
            "desktop-http",
            "desktop-browser",
            "android-cellular"
          ]
        },
        "nodeId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "headerProfileId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "headerProfileVersion": {
          "type": "string",
          "minLength": 1,
          "maxLength": 32,
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "networkProfileId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "networkProfileVersion": {
          "type": "string",
          "minLength": 1,
          "maxLength": 32,
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "limits": {
          "$ref": "#/$defs/Limits"
        },
        "approval": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "approvalRef",
            "approvedOrigin",
            "executionKind",
            "networkMode",
            "headerProfileId",
            "permissions"
          ],
          "properties": {
            "approvalRef": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128,
              "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
            },
            "approvedOrigin": {
              "type": "string",
              "minLength": 1,
              "maxLength": 253
            },
            "executionKind": {
              "enum": [
                "browser-tab",
                "desktop-http",
                "desktop-browser",
                "android-cellular"
              ]
            },
            "networkMode": {
              "enum": [
                "browser-current",
                "direct",
                "approved-proxy",
                "cellular"
              ]
            },
            "headerProfileId": {
              "type": "string",
              "minLength": 1,
              "maxLength": 128,
              "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
            },
            "permissions": {
              "type": "array",
              "items": {
                "enum": [
                  "read",
                  "session-use",
                  "credential-use",
                  "ua-override",
                  "proxy-use",
                  "cellular-use",
                  "full-run"
                ]
              },
              "minItems": 1,
              "maxItems": 7
            }
          }
        },
        "trialReceiptRef": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        }
      }
    },
    "RunReceipt": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "schemaVersion",
        "runId",
        "planId",
        "recipeHash",
        "nodeId",
        "executionKind",
        "status",
        "stopState",
        "retirementState",
        "startedAt",
        "endedAt",
        "counters",
        "network",
        "result",
        "errorCode",
        "idempotencyKey"
      ],
      "properties": {
        "schemaVersion": {
          "const": "scrapyjs.execution.v1"
        },
        "runId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "planId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "recipeHash": {
          "type": "string",
          "minLength": 1,
          "maxLength": 64,
          "pattern": "^[0-9a-f]{64}$"
        },
        "nodeId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        },
        "executionKind": {
          "enum": [
            "browser-tab",
            "desktop-http",
            "desktop-browser",
            "android-cellular"
          ]
        },
        "status": {
          "enum": [
            "created",
            "awaiting-approval",
            "running",
            "stop-requested",
            "completed",
            "failed",
            "stopped",
            "unknown"
          ]
        },
        "stopState": {
          "enum": [
            "none",
            "requested",
            "accepted",
            "unknown"
          ]
        },
        "retirementState": {
          "enum": [
            "pending",
            "released",
            "unknown"
          ]
        },
        "startedAt": {
          "type": "string",
          "minLength": 1,
          "maxLength": 40
        },
        "endedAt": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            },
            {
              "type": "null"
            }
          ]
        },
        "counters": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "requests",
            "pages",
            "bytes",
            "records"
          ],
          "properties": {
            "requests": {
              "type": "integer",
              "minimum": 0,
              "maximum": 200
            },
            "pages": {
              "type": "integer",
              "minimum": 0,
              "maximum": 100
            },
            "bytes": {
              "type": "integer",
              "minimum": 0,
              "maximum": 8388608
            },
            "records": {
              "type": "integer",
              "minimum": 0,
              "maximum": 100000
            }
          }
        },
        "network": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "expected",
            "observed",
            "egressVerified",
            "evidenceRef"
          ],
          "properties": {
            "expected": {
              "enum": [
                "browser-current",
                "direct",
                "approved-proxy",
                "cellular"
              ]
            },
            "observed": {
              "enum": [
                "browser-current",
                "direct",
                "approved-proxy",
                "cellular",
                "unknown"
              ]
            },
            "egressVerified": {
              "type": "boolean"
            },
            "evidenceRef": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                {
                  "type": "null"
                }
              ]
            }
          }
        },
        "result": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "sha256",
            "readbackVerified",
            "evidenceRef"
          ],
          "properties": {
            "sha256": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 64,
                  "pattern": "^[0-9a-f]{64}$"
                },
                {
                  "type": "null"
                }
              ]
            },
            "readbackVerified": {
              "type": "boolean"
            },
            "evidenceRef": {
              "anyOf": [
                {
                  "type": "string",
                  "minLength": 1,
                  "maxLength": 256
                },
                {
                  "type": "null"
                }
              ]
            }
          }
        },
        "errorCode": {
          "anyOf": [
            {
              "type": "string",
              "minLength": 1,
              "maxLength": 80
            },
            {
              "type": "null"
            }
          ]
        },
        "idempotencyKey": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$"
        }
      }
    }
  }
};
export const EXECUTION_KINDS = Object.freeze(['browser-tab','desktop-http','desktop-browser','android-cellular']);
export const HEADER_CLASSES = Object.freeze({
  configurable: ['accept','accept-language','cache-control','pragma','content-type','x-request-id','x-client-tag','x-* (except spoofing headers)'],
  environmentManaged: ['user-agent','sec-ch-ua','sec-ch-ua-platform','sec-ch-ua-mobile','tls','public-ip','dns'],
  separatelyAuthorized: ['cookie via credentialRef/current-tab session','authorization via credentialRef','userAgent override via verified engine','approved proxy/cellular routing'],
  unsupported: ['host','connection','content-length','transfer-encoding','proxy-authorization','origin','referer','sec-* raw injection','x-forwarded-*','forwarded','set-cookie']
});

export class ContractError extends Error {
  constructor(code, message) { super(message || code); this.name='ContractError'; this.code=code; }
}
const fail=(code,message)=>{throw new ContractError(code,message);};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const bytes=x=>new TextEncoder().encode(x).byteLength;
const schemas=CONTRACT_SCHEMA.$defs;
function check(value, rule, at='root', depth=0) {
  if(depth>16) fail('E_SCHEMA_DEPTH',at);
  if(rule.$ref) return check(value,schemas[rule.$ref.slice('#/$defs/'.length)],at,depth+1);
  if(rule.anyOf) {
    for(const part of rule.anyOf){try{check(value,part,at,depth+1);return;}catch(e){if(!(e instanceof ContractError))throw e;}}
    fail('E_SCHEMA',at+': nullability/type');
  }
  if(Object.hasOwn(rule,'const')&&value!==rule.const)fail('E_SCHEMA',at+': version');
  if(rule.enum&&!rule.enum.includes(value))fail('E_SCHEMA',at+': enum');
  if(rule.type==='null'&&value!==null)fail('E_SCHEMA',at+': null');
  if(rule.type==='string'){
    if(typeof value!=='string'||value.length<(rule.minLength??0)||value.length>(rule.maxLength??Infinity)||
       rule.pattern&&!new RegExp(rule.pattern).test(value))fail('E_SCHEMA',at+': string');
  }
  if(rule.type==='boolean'&&typeof value!=='boolean')fail('E_SCHEMA',at+': boolean');
  if(rule.type==='integer'&&(!Number.isSafeInteger(value)||value<rule.minimum||value>rule.maximum))fail('E_SCHEMA',at+': integer');
  if(rule.type==='array'){
    if(!Array.isArray(value)||value.length<rule.minItems||value.length>rule.maxItems)fail('E_SCHEMA',at+': array');
    value.forEach((x,i)=>check(x,rule.items,at+'['+i+']',depth+1));
  }
  if(rule.type==='object'){
    if(!plain(value))fail('E_SCHEMA',at+': object');
    for(const k of Object.keys(value))if(!Object.hasOwn(rule.properties,k)||['__proto__','prototype','constructor'].includes(k))
      fail('E_SCHEMA',at+': unknown '+k);
    for(const k of rule.required)if(!Object.hasOwn(value,k))fail('E_SCHEMA',at+': missing '+k);
    for(const [k,x] of Object.entries(value))check(x,rule.properties[k],at+'.'+k,depth+1);
  }
  return value;
}
export function validateShape(name,value) {
  if(!Object.hasOwn(schemas,name))fail('E_SCHEMA','Unknown schema');
  return check(value,schemas[name]);
}
const simpleHost = h => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(h)&&h.includes('.')&&
  h.split('.').every(x=>x.length>0&&x.length<=63&&!x.startsWith('-')&&!x.endsWith('-'));
const blockedHost = h => !simpleHost(h)||/^\d+(?:\.\d+){3}$/.test(h)||
  h.endsWith('.local')||h.endsWith('.localhost')||h.endsWith('.internal')||
  h.endsWith('.invalid')||h.endsWith('.test')||h.endsWith('.home.arpa')||
  h.endsWith('.onion')||h==='localhost'||h.includes(':')||h.startsWith('metadata.');
const FIXTURE='http://127.0.0.1:43111';
export function validateOrigin(input,{fixture=false}={}) {
  let u;try{u=new URL(input);}catch{fail('E_ORIGIN','Invalid origin');}
  if(input===FIXTURE&&fixture)return input;
  if(u.protocol!=='https:'||u.username||u.password||u.href!==u.origin+'/'||
     u.origin!==input||blockedHost(u.hostname)||u.port)fail('E_ORIGIN','Public HTTPS origin required');
  return input;
}
export function validateTargetUrl(input,allowedOrigin,{fixture=false}={}) {
  let u;try{u=new URL(input);}catch{fail('E_TARGET','Invalid target URL');}
  validateOrigin(allowedOrigin,{fixture});
  if(u.origin!==allowedOrigin||u.username||u.password||u.hash||
     (!fixture&&u.protocol!=='https:')||u.href.length>2048)
    fail('E_TARGET','Out-of-origin target, credentials, fragment or insecure URL');
  return u.href;
}
export function classifyHeader(name) {
  if(typeof name!=='string')return 'unsupported';
  const n=name.toLowerCase();
  if(['user-agent','sec-ch-ua','sec-ch-ua-mobile','sec-ch-ua-platform'].includes(n))return 'environment-managed';
  if(n==='cookie'||n==='authorization')return 'separately-authorized';
  if(!/^[!#$%&'*+.^_\x60|~0-9a-z-]+$/i.test(n))return 'unsupported';
  if(['accept','accept-language','cache-control','pragma','content-type','x-request-id','x-client-tag'].includes(n))return 'configurable';
  if(n.startsWith('x-')&&!n.startsWith('x-forwarded-')&&!n.startsWith('x-real-')&&!n.startsWith('x-original-')&&
     !n.startsWith('x-proxy-')&&!n.includes('authorization')&&!n.includes('cookie')&&!n.includes('host'))return 'configurable';
  return 'unsupported';
}
export function validateRecipe(recipe) {
  validateShape('Recipe',recipe);
  if(bytes(JSON.stringify(recipe))>16384)fail('E_RECIPE_SIZE');
  if(recipe.target.origins.length!==1)fail('E_ORIGIN','Only one reviewed origin in v1');
  const origin=recipe.target.origins[0];
  // Local fixture stays possible for the legacy browser Task, but must be denied
  // by non-browser node admission later. Not a general SSRF exception.
  validateTargetUrl(recipe.target.url,origin,{fixture:origin===FIXTURE});
  if(recipe.target.session==='current-tab'&&recipe.extraction.kind!=='dom')fail('E_SESSION','Tab session requires DOM mode');
  const names=new Set();
  for(const f of recipe.extraction.fields){
    if(!/^[\p{L}_][\p{L}\p{N}_-]{0,63}$/u.test(f.name)||['__proto__','constructor','prototype'].includes(f.name)||names.has(f.name))
      fail('E_FIELD','Duplicate or unsafe field name');
    names.add(f.name);
    if(/^\s*(?:\/\/|xpath:|javascript:)/i.test(f.selector)||/[\x00-\x1f]/.test(f.selector))
      fail('E_SELECTOR','Only declarative CSS selectors');
    if(f.read==='attribute'&&!f.attribute||f.read==='text'&&f.attribute!==undefined||
       f.attribute!==undefined&&!/^[a-zA-Z_:][a-zA-Z0-9_:.-]{0,63}$/.test(f.attribute))fail('E_FIELD','Invalid attribute extraction');
  }
  limitsCheck(recipe.limits);
  return recipe;
}
function limitsCheck(l) {
  if(l.maxTotalBytes<l.maxResponseBytes||l.maxRequests<l.maxPages)fail('E_LIMITS','Budget is internally inconsistent');
}
export function validateHeaderProfile(profile) {
  validateShape('HeaderProfile',profile);
  const seen=new Set();
  if(profile.entries.reduce((n,e)=>n+bytes(e.name)+bytes(e.value),0)>8192)fail('E_HEADER_SIZE');
  for(const {name,value} of profile.entries){
    if(name!==name.toLowerCase()||classifyHeader(name)!=='configurable'||
       /[\x00-\x1f\x7f]/.test(value)||seen.has(name))fail('E_HEADER','Forbidden, duplicate or unsafe header');
    seen.add(name);
  }
  if(profile.userAgent.mode==='inherit'&&profile.userAgent.value!==undefined||
     profile.userAgent.mode==='override'&&(!profile.userAgent.value||
     /[\r\n\x00-\x1f\x7f]/.test(profile.userAgent.value)))fail('E_HEADER','Invalid User-Agent policy');
  return profile;
}
export function validateNetworkProfile(profile) {
  validateShape('NetworkProfile',profile);
  if((profile.mode==='approved-proxy')!==Boolean(profile.proxyRef))fail('E_NETWORK_PROFILE','Proxy ref must match proxy mode');
  return profile;
}
export function validateNodeCapabilities(node) {
  validateShape('NodeCapabilities',node);
  if(node.approvedOrigins.some(o=>{try{validateOrigin(o,{fixture:node.kind==='browser-tab'});return false;}catch{return true;}})||
     new Set(node.approvedOrigins).size!==node.approvedOrigins.length)fail('E_NODE_ORIGIN');
  if(new Set(node.verifiedHeaderNames).size!==node.verifiedHeaderNames.length||
     node.verifiedHeaderNames.some(n=>n!==n.toLowerCase()||classifyHeader(n)!=='configurable'))
    fail('E_NODE_HEADER');
  if(new Set(node.supportedNetworks).size!==node.supportedNetworks.length||
     new Set(node.supportedExtraction).size!==node.supportedExtraction.length)fail('E_NODE_CAPABILITIES');
  if(['desktop-http','android-cellular'].includes(node.kind)&&
     (node.javascriptRendering||node.supportedExtraction.includes('dom')||node.canUseCurrentTabSession))
     fail('E_NODE_CAPABILITIES','HTTP-only node must not claim DOM/JS session');
  if(node.kind==='browser-tab'&&(node.supportedNetworks.some(n=>n!=='browser-current')||
     node.verifiedHeaderNames.length>0))fail('E_NODE_CAPABILITIES','DOM tab navigation headers are not user configurable');
  if(node.kind==='android-cellular'&&node.supportedNetworks.some(n=>n!=='cellular'))
     fail('E_NODE_CAPABILITIES');
  if(node.availability==='verified'&&!node.evidenceRef)fail('E_NODE_EVIDENCE');
  limitsCheck(node.maxLimits);
  return node;
}
export function validateExecutionPlan(plan) {
  validateShape('ExecutionPlan',plan);
  limitsCheck(plan.limits);
  if(plan.phase==='trial'&&plan.limits.maxPages>3)fail('E_TRIAL_PAGES');
  if(plan.phase==='full'&&(!plan.trialReceiptRef||!plan.approval.permissions.includes('full-run')))
    fail('E_FULL_APPROVAL','Full run needs separate approval and verified trial receipt');
  if(plan.phase==='trial'&&plan.trialReceiptRef!==undefined)fail('E_TRIAL_PAGES','Trial cannot reuse full approval');
  if(new Set(plan.approval.permissions).size!==plan.approval.permissions.length)fail('E_APPROVAL','Repeated permission');
  return plan;
}
function greater(l,c) {return Object.keys(l).filter(k=>l[k]>c[k]);}
function collectPlanIssues({recipe,plan,headers,network,node}) {
  const reasons=[];
  const add=(code,message)=>reasons.push({code,message});
  if(plan.recipeId!==recipe.recipeId||plan.recipeVersion!==recipe.version||plan.recipeHash!==recipe.sha256)add('E_RECIPE_BINDING','Recipe version/hash do not match plan');
  if(plan.headerProfileId!==headers.profileId||plan.headerProfileVersion!==headers.version||
     plan.networkProfileId!==network.profileId||plan.networkProfileVersion!==network.version)add('E_PROFILE_BINDING','Profile snapshot does not match plan');
  if(plan.nodeId!==node.nodeId||plan.executionKind!==node.kind)add('E_NODE_BINDING','Node identity or kind mismatch');
  if(plan.approval.approvedOrigin!==recipe.target.origins[0]||
     plan.approval.executionKind!==plan.executionKind||plan.approval.networkMode!==network.mode||
     plan.approval.headerProfileId!==headers.profileId)add('E_APPROVAL_SCOPE','Approval is for different scope');
  const permissions=new Set(plan.approval.permissions);
  if(!permissions.has('read'))add('E_APPROVAL','Missing read permission');
  if(node.availability!=='verified')add('E_NODE_UNVERIFIED','Node unavailable or capability evidence not verified');
  if(!node.approvedOrigins.includes(recipe.target.origins[0]))add('E_NODE_ORIGIN','Origin is not trusted-node approved');
  if(recipe.target.origins[0]===FIXTURE&&node.kind!=='browser-tab')add('E_PRIVATE_TARGET','Local fixture never leaves original browser Task');
  if(!node.supportedExtraction.includes(recipe.extraction.kind)||
     recipe.extraction.kind==='dom'&&!node.javascriptRendering)add('E_EXTRACTION_UNSUPPORTED','DOM/JS rendering is not available on this engine');
  if(recipe.target.session==='current-tab'&&(!node.canUseCurrentTabSession||!permissions.has('session-use')))
    add('E_SESSION','Current tab login state is not portable to this engine');
  if(!node.supportedNetworks.includes(network.mode)||network.mode==='browser-current'&&node.kind!=='browser-tab'||
     node.kind==='browser-tab'&&network.mode!=='browser-current'||
     node.kind==='android-cellular'&&network.mode!=='cellular')add('E_NETWORK_UNSUPPORTED','Selected network is not available for engine');
  if(network.mode==='approved-proxy'&&!permissions.has('proxy-use'))add('E_PROXY_APPROVAL','Proxy requires separate consent');
  if(network.mode==='cellular'&&(!permissions.has('cellular-use')||!node.cellularBindingVerified||
     !node.egressVerification))add('E_CELLULAR_PROOF','No verified explicit cellular route, egress proof or consent');
  if(headers.entries.some(e=>!node.verifiedHeaderNames.includes(e.name)))add('E_HEADER_UNSUPPORTED','Engine does not attest selected request headers');
  if(headers.userAgent.mode==='override'&&(!permissions.has('ua-override')||!node.canOverrideUserAgent))
    add('E_UA_UNSUPPORTED','User-Agent override needs engine evidence and explicit consent');
  if(headers.credentialRef&&(!node.canUseCredentialRefs||!permissions.has('credential-use')))
    add('E_CREDENTIAL_UNSUPPORTED','Credential ref requires isolated consent; raw Cookie/Authorization forbidden');
  if(!node.enforcesDnsGuard||!node.inspectsRedirects)add('E_SSRF_GUARD','DNS/IP checks and redirect-by-redirect review required');
  if(!node.stopReadback||!node.resultReadback)add('E_RECEIPT','Stop retirement and independent result readback required');
  for(const k of greater(plan.limits,recipe.limits))add('E_RECIPE_LIMIT','Plan exceeds recipe limit: '+k);
  for(const k of greater(plan.limits,node.maxLimits))add('E_NODE_LIMIT','Plan exceeds attested node limit: '+k);
  // Future runtime must additionally validate the real trusted approvalRef, actual DNS,
  // effective redirect chain, budget counters and immutable sha256 before dispatch.
  return reasons;
}
export function evaluateExecution({recipe,plan,headers,network,node}) {
  validateRecipe(recipe);validateExecutionPlan(plan);validateHeaderProfile(headers);
  validateNetworkProfile(network);validateNodeCapabilities(node);
  const reasons=collectPlanIssues({recipe,plan,headers,network,node});
  return {supported:reasons.length===0,reasons};
}
export function assertExecutable(bundle) {
  const result=evaluateExecution(bundle);
  if(!result.supported)fail(result.reasons[0].code,result.reasons.map(x=>x.message).join('; '));
  return result;
}
export function validateRunReceipt(receipt,plan) {
  validateShape('RunReceipt',receipt);
  if(!Number.isFinite(Date.parse(receipt.startedAt))||
     receipt.endedAt!==null&&!Number.isFinite(Date.parse(receipt.endedAt)))fail('E_RECEIPT_DATE');
  if(plan){validateExecutionPlan(plan);
    if(receipt.planId!==plan.planId||receipt.recipeHash!==plan.recipeHash||
       receipt.nodeId!==plan.nodeId||receipt.executionKind!==plan.executionKind||
       receipt.network.expected!==plan.approval.networkMode)fail('E_RECEIPT_BINDING');
    if(greater(receipt.counters,{
      requests:plan.limits.maxRequests,pages:plan.limits.maxPages,
      bytes:plan.limits.maxTotalBytes,records:100000}).length)fail('E_RECEIPT_BUDGET');
  }
  if(receipt.network.egressVerified&&(!receipt.network.evidenceRef||
     receipt.network.observed!==receipt.network.expected))fail('E_EGRESS_PROOF');
  if(receipt.status==='completed'){
    if(receipt.retirementState!=='released'||receipt.endedAt===null||
       !receipt.result.readbackVerified||!receipt.result.sha256||!receipt.result.evidenceRef||
       receipt.errorCode!==null)fail('E_RESULT_UNVERIFIED');
    if(receipt.network.expected==='cellular'&&!receipt.network.egressVerified)fail('E_CELLULAR_PROOF');
  }
  if(receipt.status==='stopped'&&(receipt.stopState!=='accepted'||receipt.retirementState!=='released'))
    fail('E_STOP_UNVERIFIED');
  if(['running','stop-requested','unknown'].includes(receipt.status)&&
     receipt.retirementState==='released')fail('E_RECEIPT_STATUS');
  return receipt;
}
function stable(value) {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function canonicalRecipe(recipe) {
  if(!plain(recipe))fail('E_RECIPE');
  const {sha256,...source}=recipe;
  return stable(source);
}
export async function hashRecipe(recipe,subtle=globalThis.crypto?.subtle) {
  if(!subtle)fail('E_HASH_UNAVAILABLE','Requires SHA-256 from trusted platform crypto');
  const raw=await subtle.digest('SHA-256',new TextEncoder().encode(canonicalRecipe(recipe)));
  return Array.from(new Uint8Array(raw),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function verifyRecipeHash(recipe,subtle) {
  validateRecipe(recipe);
  if((await hashRecipe(recipe,subtle))!==recipe.sha256)fail('E_RECIPE_HASH','Recipe content differs from immutable digest');
  return true;
}
