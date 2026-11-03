# Cookie Editor · R3.1 最小分享 Relay

本目录是独立局域网分享服务，不新建 Cookie Editor UI，也不扩大 Browser Runtime。保存邀请元数据、接收设备公钥与短期密文，**不保存明文 Cookie**。

## 用户入口与服务维护边界（2026-11-01）

**普通使用不应要求用户生成、安装或手动信任 HTTPS 证书。** 分享服务的部署、域名与有效 TLS 证书由服务维护者负责。已部署服务应使用两端浏览器默认信任的有效 HTTPS 证书；HTTPS 校验和端到端设备配对、加密及认证领取仍然保留，不改为明文 LAN HTTP，也不绕过浏览器安全校验。

当前实现已有 Relay 与分享/领取入口，但尚未接入默认可用的正式分享服务；创建表单仍需要服务地址。因此当前不能宣称普通用户已可直接跨设备分享。此前私网 IP、自签名证书及手动信任是临时双机测试环境的操作历史，不是用户操作步骤，也不证明必须由用户安装证书才能使用产品。后续应先补齐正式可用的服务接入，再验证真实产品流程；服务部署不应转嫁给接收方。

## 创建响应丢失恢复（当前源码，原生未验收）

发送端先在原 Foundation 事务中持久保存随机 `operationRef`、管理密钥和固定创建正文，再发送一次 `POST /v1/invites`。正文携带 `operationRef`，密钥仅通过原 `x-opendesk-invite-manager` 请求头传递。Relay 在同一 SQLite 事务中保存邀请及创建关联；同一关联、密钥和正文重复到达只返回原邀请，不重置领取次数、到期或撤销状态，正文变化拒绝 `E_CREATE_CONFLICT`。

丢失响应后，只使用 `GET /v1/invite-creations/:operationRef` 与原管理请求头对账。GET 返回原邀请元数据和 URL，不返回管理密钥、配对公钥或密文；只有 ref 无法取得回执。没有匹配回执仍保留未知状态，不能据此重新 POST。客户端/Relay 重启后沿原关联继续；会话领取回执未知的既有防重领围栏保持。

升级顺序是先更新 Relay，再沿原安装和安全刷新链配套更新工具界面与经来源审查的固定 SW。本机 `shareList` 在新固定后台返回 `creationRecoveryVersion: 1` 与 `pendingInvitations` 数组；新界面必须同时确认这两项才允许创建。原 `invitations` 数组继续只包含完整邀请元数据，旧界面不会收到缺少 `invite` 的 pending；新界面合并两组记录显示。旧后台的空列表不能证明不存在 pending，因此新界面先安装时仍拒绝新建，现有邀请可继续查看。该标志只描述本机创建恢复实现，不授予权限，也不证明远端 Relay、HTTPS 或真实网站已经通过。新增表不改写历史邀请；历史未携带关联的 UNKNOWN 创建无法事后恢复，不补造关联、不清 pending、不换 ID 重发。当前定向测试使用临时 SQLite、真实独立 Node 子进程重启和虚构数据；测试 PASS 不代表现用服务、Chrome、双机领取或真实网站登录已通过。

## 启动与验证

要求 Node >=22.13（推荐 Node 24），使用内置 `node:sqlite`，不要求 npm 下载依赖。

```bash
mkdir -p .local
SHARE_BIND_HOST=127.0.0.1 SHARE_PORT=8713 \
SHARE_PUBLIC_ORIGIN=http://localhost:8713 \
SHARE_DATABASE="$PWD/.local/cookie-share.sqlite" \
node services/cookie-share-relay/server.mjs

node --test services/cookie-share-relay/server.test.mjs
```

以下为服务维护者的部署说明。本地 HTTP 仅允许 localhost/127.0.0.1，用于开发。实际 LAN 必须在可信 HTTPS 反向代理后提供，配置 `SHARE_PUBLIC_ORIGIN=https://实际可信主机名`，使用两端浏览器默认信任的有效 TLS 证书，不要求用户额外安装证书。服务强制绑定 loopback（127.0.0.1、::1 或 localhost），仅由同机 HTTPS 反向代理向局域网提供服务；不要关闭证书验证、直接暴露公网、打印 Cookie 或管理密钥。由反向代理限制局域网来源、增加速率限制与访问认证。数据库及 WAL/SHM 不应提交。

## 路由

- `POST /v1/invites`：创建配置或会话邀请，有效期 5 分钟至 7 天，配置领取次数 1–10、会话领取最多 1 次，响应包含仅发送方保管的 `managerSecret` 和真实邀请 URL。
- `GET /v1/invite-creations/:operationRef`：原管理密钥授权的只读创建回执，保留终态，不创建或领取。
- `GET /v1/invites/:id`：查询公开且经过字段限制的账号配置。
- `POST /v1/invites/:id/claim`：配置领取直接原子计数；会话领取必须有设备签名。
- `POST /v1/invites/:id/pair`：接受设备发送 ECDH P-256 / ECDSA P-256 公钥。
- `GET /v1/invites/:id/pairs`：需管理密钥，返回配对公钥和状态。
- `POST /v1/invites/:id/deliver`：需管理密钥，接收密文与发送方临时 ECDH 公钥，绝不接收明文。
- `POST /v1/invites/:id/challenge`：生成 60 秒有效质询。
- `POST /v1/invites/:id/claim`：设备对 `opendesk-cookie-share:v1:<id>:<requestId>:<challenge>` 签名后，单次原子领取密文信封。
- `POST /v1/invites/:id/revoke`：管理密钥撤销并清空待领取密文。
- `GET /i/:id`：静态引导页，指导接收端在目标网站的「Cookie Editor → 账号 → 领取分享配置」中粘贴链接。具体已安装版本、包摘要和配套固定后台以 Cookie Editor 当前原生证据为准，不能以源码或本页作为安装证明。页面本身不执行 Cookie 读写，也不会自动登录。

服务在启动、每次请求和每分钟定时清理已过期/撤销/领取完毕的密文及配对公钥。跨设备必须先人工核对设备指纹，再由可信 Host 完成 ECDH 加密、Cookie Store/Partition 映射、原始会话保护与网站独立登录验证。**服务器接口测试通过不代表浏览器接线或真实登录已通过。** 当前固定账号服务通过原 `src/platform/storage/device-keys.js` 连接设备键存储，运行时缺少该能力仍拒绝 `E_SHARE_DEVICE_KEY_STORAGE_REQUIRED`；SOURCE_WIRED 不等于真实双机已通过，不能改用明文或导出私钥规避。配置候选、既有回归失败和真实双设备缺口见 [Cookie Editor 当前状态](../../examples/sidebar-tools/cookie-editor/README.zh-CN.md)。对不允许会话移交的网站，只能领取配置并通过网站正常登录。
