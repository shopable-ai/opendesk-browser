# Cookie Editor · R3.1 最小分享 Relay

本目录是独立局域网分享服务，不新建 Cookie Editor UI，也不扩大 Browser Runtime。保存邀请元数据、接收设备公钥与短期密文，**不保存明文 Cookie**。

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

本地 HTTP 仅允许 localhost/127.0.0.1，用于开发。实际 LAN 必须在可信 HTTPS 反向代理后提供，配置 `SHARE_PUBLIC_ORIGIN=https://实际可信主机名`，并让两端设备信任 TLS 证书。服务默认仅绑定 loopback；不要关闭证书验证、直接暴露公网、打印 Cookie 或管理密钥。由反向代理限制局域网来源、增加速率限制与访问认证。数据库及 WAL/SHM 不应提交。

## 路由

- `POST /v1/invites`：创建配置或会话邀请，响应包含仅发送方保管的 `managerSecret` 和真实邀请 URL。
- `GET /v1/invites/:id`：查询公开且经过字段限制的账号配置。
- `POST /v1/invites/:id/claim`：配置领取直接原子计数；会话领取必须有设备签名。
- `POST /v1/invites/:id/pair`：接受设备发送 ECDH P-256 / ECDSA P-256 公钥。
- `GET /v1/invites/:id/pairs`：需管理密钥，返回配对公钥和状态。
- `POST /v1/invites/:id/deliver`：需管理密钥，接收密文与发送方临时 ECDH 公钥，绝不接收明文。
- `POST /v1/invites/:id/challenge`：生成 60 秒有效质询。
- `POST /v1/invites/:id/claim`：设备对 `opendesk-cookie-share:v1:<id>:<requestId>:<challenge>` 签名后，单次原子领取密文信封。
- `POST /v1/invites/:id/revoke`：管理密钥撤销并清空待领取密文。
- `GET /i/:id`：引导在 OpenDesk 扩展中领取，页面本身不执行 Cookie 读写。

跨设备必须先人工核对设备指纹，再由可信 Host 完成 ECDH 加密、Cookie Store/Partition 映射、原始会话保护与网站独立登录验证。**服务器接口测试通过不代表浏览器接线或真实登录已通过。** 生产会话分享还需验证接收端身份绑定、加密数据完整性及真实双设备流程。对不允许会话移交的网站，只能领取配置并通过网站正常登录。
