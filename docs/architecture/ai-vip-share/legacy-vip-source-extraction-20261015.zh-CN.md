# 旧版 VIP 激活通用代码提取：WebAppVip + CSDN Adapter（历史事实）

> **LEGACY_SOURCE_FACTS_ONLY / READ_ONLY / NOT A PRODUCTION PROVIDER CONTRACT**
>
> 目的：把两个早期 JS 中真正已有的、可泛化的功能提炼为可追溯函数合同、调用链、字段及剪裁代码片段；记录旧实现缺陷。**这不是在新框架里重新引入这些代码，不是对任何历史服务在线性的确认。**
>
> 日期：2026-10-15；原版快照目前保存在 `shopable-ai/opendesk-browser` 的 `docs/contracts/source-snapshots/` 下；早期仓库为 `todo-user` 系列。源码快照不可改、不可删除。实际新架构采用规则见 [现代 R5.2 采纳矩阵](../../framework/workstreams/ai-vip-share-r52-legacy-adoption-and-plan-20261015.md)。

## 1. 证据范围、准确路径和版本

| 源码 | Git blob SHA（读取时） | 主要用途 |
| --- | --- | --- |
| [`scrapyJsChrome/assets/app_script/app_vip_base.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/scrapyJsChrome/assets/app_script/app_vip_base.js) | `e4d8763d534e712576cfb0ec8c071d0e3233d670`；388 行 | 历史通用 `WebAppVip` 会员业务类 |
| [`scrapyJsChrome/assets/app_script/app_csdn.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/scrapyJsChrome/assets/app_script/app_csdn.js) | `2bfc2af26ca1052375d16924b5424a482e71afd9`；149 行 | CSDN 的实例级网站适配 |
| [`todo-src-bex/src-bex/controller/csdn.ts`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/todo-src-bex/src-bex/controller/csdn.ts) | `4fa1fb8f3616563e20ad8f8832fbf160f78a54c6` | 另一旧版的 CSDN HTTP 访问与 `vipLogin` |
| [`todo-src-bex/src-bex/background.ts`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts) | `e136fcba73ad49dbf3b89bf732d61cbc18cb9755` | BEX 桥的激活消费端、旧存储、脚本执行 |
| [`todo-src-bex/src-bex/assets/js/controller/csdn.js`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/todo-src-bex/src-bex/assets/js/controller/csdn.js) | `fed6dfa8a2daba419ec205b89fd4486568eb4c65` | 更早的 `vipcode` URL / 登录 / DOM 逻辑 |

**注意两个家族不是同一份实现：** `scrapyJsChrome` 的 `app_vip_base.js` 是“通用类 + 单站实例覆盖”的更成熟历史业务抽象；`todo-src-bex` 的 `csdn.ts/background.ts/csdn.js` 是另一条 Quasar BEX 后台桥流程，不能把两套签名拼成一份经过运行验证的现代 API。

## 2. 两个 JS 已经形成的真正通用模式

`app_vip_base.js` 的通用主体控制初始化、URL/兑换意图、会话恢复、旧卡密服务调用、时效、通知与历史缓存。`app_csdn.js` 通过实例方法赋值覆盖 CSDN 登录判断与界面挂接：

```text
WebAppVip("csdn.net")                  通用类 + appname
  ├─ initApp()                          依次执行数据、界面、事件、业务
  ├─ initData()                         旧 deviceCode/fingerprint
  ├─ initLogic()
  │    ├─ checkSetting()               旧 URL proxy 参数（高风险；不迁）
  │    ├─ checkRelogin()               缓存 vipcode 的自动登录/退出避环
  │    ├─ checkLogin()                 URL vipcode/name → doVipLogin
  │    └─ initCustomLogout()           可被平台覆盖的钩子
  ├─ doVipLogin()                       cardonce/use → 处理服务响应
  ├─ initPluginStatus()                 仅状态 UI/通知
  └─ doCustomLogout()/cookieDelete()   旧 Cookie 清理（不迁）
app_csdn.js
  ├─ appVip.isLogined = ...              CSDN 登录判断覆盖
  ├─ appVip.initCustomLogout = ...       CSDN 退出按钮覆盖
  ├─ appVip.initCustomRelogin = ...      声明了覆盖，但有缺陷且未见调用
  └─ appVip.initApp()                   实际启动入口
```

这里的“可泛化”**只是旧类实现复用的业务模式**。不是允许把 CSDN Cookie/远程脚本封装为通用安全 SDK。

## 3. 函数级提取：`app_vip_base.js`

| 行号 / 函数 | 源码已经表达的功能 | 提取出的通用需求 | 旧行为限制 |
| --- | --- | --- | --- |
| L6–10 `constructor(url)` | `this.url`、`appname` | 业务/站点标识 | 对域名直接字符串截取，不是可信 origin 验证 |
| L13–27 `initApp()` | `location.hostname.includes`，依序 `initData/initView/initEvent/initLogic` | 单一启动生命周期及钩子次序 | 子串匹配可误中相似主机，等待/错误集中吞掉 |
| L29–38 `initData()` | `AppStorage.deviceCode`、指纹、站点 localStorage | 设备/安装状态恢复需求 | 浏览器指纹、重复缓存身份不满足现代隔离 |
| L40–51 `initView/initEvent/initLogic` | 默认空事件钩子；调用设置、恢复、新码、退出 UI | 共享流程 + 平台行为覆写 | `initCustomRelogin` **没有**在 `initLogic` 里调用 |
| L52–70 `checkSetting()` | 从 `proxy` 和 `redirect` URL 参数生成并执行脚本、跳转 | 曾尝试通过链接设置网络 | **高风险，不应迁移** |
| L72–106 `checkRelogin()` | 检查新码、当前登录状态、退出 60s 窗口、旧码重新登录 | 授权会话恢复，避免用户主动退出后自动回登 | 依赖本地原始码，60s 只是客户端启发式 |
| L108–150 `checkLogin()` | 从页面 URL 查 `vipcode` 和 `name`，然后调用 `doVipLogin` | 链接驱动的兑换意图入口 | 对整个 query 预先 decode；greedy 正则回退；日志记录 voucher |
| L153–170 `initPluginStatus()` | 显示“近期登录”通知 | 登录状态/反馈 | 本地 `dologintime` 不证明服务端身份 |
| L172–176 `initCustomLogout/initCustomRelogin/isLogined` | 平台可覆盖的空方法 | 独立适配器挂钩 | `initCustomRelogin` 仅占位，实际启动链未调用 |
| L178–307 `doVipLogin(...)` | 后台 HTTP 卡密请求、旧成功响应处理、时效和缓存、执行返回脚本 | 消费意图、使用记录、到期时间、重登恢复 | GET 可能有消费副作用；缺现代预检/幂等/账本；执行服务端 JS |
| L308–325 `doCustomLogout/cookieDelete` | 构造脚本调用 Cookie 清理和网页重载 | 用户主动退出的生命周期需求 | 直接操作第三方 Cookie 与执行脚本 |
| L327–385 `saveDevInfo` | 读取目标站 Cookie 并上传、保存开发环境选择 | 历史调试场景 | **高敏感数据路径，不应进入 AI VIP Share** |

### 3.1 源码节选 A：通用生命周期（删去原有延时与异常包装）

以下是**按原函数结构裁剪**的短摘录，不是完整文件或可运行生产代码：

```js
class WebAppVip {
  constructor(url) {
    this.url = url;
    this.appname = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
  async initLogic() {
    await this.checkSetting();
    await this.checkRelogin();
    await this.checkLogin();
    await this.initCustomLogout();
  }
}
```

代码位置：[`app_vip_base.js#L4-L51`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/scrapyJsChrome/assets/app_script/app_vip_base.js#L4-L51)。唯一值得提炼的工程思想是**“共性流程固定，目标站实现小钩子”**；不是旧域名校验、全局变量与脚本执行合同。

### 3.2 源码节选 B：卡密请求格式（历史事实，**禁止作为现代预检调用**）

```js
let api = '/open/operate/cardonce/use';
let res = await axiosx.get(api, {
  params: { code, deviceCode, type: "chrome", url }
}).then(res => res.data);
```

位置：[`app_vip_base.js#L211-L245`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/scrapyJsChrome/assets/app_script/app_vip_base.js#L211-L245)。旧调用成功条件 `res.code === 1000`；旧 `res.data` 读出 `scripts`、`isused`、`allowed`、`expireAt`、`value`、`createTime`、`updateTime`。**不能证明此接口现在在线、没有副作用或返回新的 SKU/权益协议。**

### 3.3 URL、重登与历史缓存

- `checkLogin`：`URLSearchParams` 优先读 `vipcode`，额外读取 `name`；历史实现也尝试用 `/vipcode=(.*)/` 抓取；发现兑换码直接请求登录，没有新产品所需“核对账号 + SKU → 用户二次确认”。
- `checkRelogin`：若 URL 看似带有新的 `vipcode`，退出旧码恢复；若认为已登录，退出；若距离显式退出不到 60 秒则不恢复；否则使用原 `vipcode` 再次调用 `doVipLogin`。
- `doVipLogin`：本地 `dologintime` 用约 10 秒的节流规避页面循环；`vipcode_` + `appname`、`loginInfos`、`cardcode_` + 原始 code、`cardcode_<code>_expire` 被持久化或读取。**这些不是账号级服务端兑换账本，更不能直接迁移成新存储键。**
- `expireAt`：旧源码读取 `expireAt/createTime/updateTime` 后使用本机 `new Date()` 判剩余天数。临近到期时还将分钟数拼到服务端脚本之前执行。因此能抽取的只是“时间型权益与已使用时间”的需求，不能继承过期算法。
- 注释声称“重定向删除 `vipcode`”；`checkLogin` 的所读代码里**并没有对应清除链接参数的确定实现**。不能把注释当作 URL 凭据清理的验收事实。

## 4. 函数级提取：`app_csdn.js`

| 行号 / 段 | 当前源码职责 | 真实问题 / 可借鉴边界 |
| --- | --- | --- |
| L3–11 | 检查 `WebAppVip` 存在；`new WebAppVip("csdn.net")` | 用同一个类复用多站点生命周期，是可参考的抽象 |
| L31–43 `isLogined` | 执行后台 Cookie 获取脚本，约 100ms 后取 `AppLocal.csdnCookie`，POST 到 `/app/operate/csdn/username`，据 nickName 判断登录 | 依赖第三方 Cookie，等待是时间猜测；不可用于 OpenDesk 认证 |
| L52–89 `initCustomLogout` | 替换 CSDN 自带退出 DOM 并加 click | 平台 UI 差异应留在受控 Adapter；不应修改第三方 Cookie |
| L92–111 `initCustomRelogin` | 试图增添“修复登录”按钮 | **存在相反的空值条件及未定义 `newButton`**；不能称作可工作的已接线功能 |
| L114–139 `doCustomLogoutBefore` | 用 Cookie UI 错误推断状态并计数/按日期清零 | 函数声明存在，但本文件**未见绑定到实际 logout 调用链**；不应认定生效 |
| L141–145 `check2CreateNotify` | 限定 CSDN VIP 页面才发通知 | 辅助函数存在，不代表由启动链调用 |
| L147 | `appVip.initApp()` | 实际明确的调用入口 |

### 4.1 源码节选 C：平台覆盖的抽象轮廓

这是将 [`app_csdn.js#L10-L147`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/scrapyJsChrome/assets/app_script/app_csdn.js#L10-L147) 中危险业务体省略后的**结构摘录**，不完整、不可直接运行：

```js
var appVip = new WebAppVip("csdn.net");
appVip.isLogined = async () => { /* CSDN Cookie/HTTP 逻辑已省略 */ };
appVip.initCustomLogout = async () => { /* CSDN DOM 修改已省略 */ };
appVip.initCustomRelogin = async () => { /* 原实现有缺陷且未见调用 */ };
appVip.initApp();
```

关键模式：**一份通用生命周期，按网站替换一小部分判断/界面行为**。现代版本只有在平台确有不同合同且已审核时才允许受限适配器，不准把上述 Cookie/执行能力带入宿主 SDK。

## 5. 历史服务端响应字段：只保留语义线索

| 历史字段 | 在旧端读出 / 处理 | 现代产品应核对的语义 |
| --- | --- | --- |
| `code` / `message` | `code==1000` 认成功；其他提示报错 | 正式服务必须提供有版本和身份约束的错误码；不能旧码硬编码成功 |
| `isused` | 已使用则展示使用时间及到期时间 | “这个口令是否已使用”≠“此账号是否已获权益”；应查账本 |
| `allowed` / `value` | 旧端解构读取，但这两 JS 中并未清楚地作为支付/额度入账证据 | 不推断会员等级、SKU、剩余额度或付费成功 |
| `createTime` | 卡密创建/有效期辅助 | 服务端定义的签发/生效/交易时间需要明确合同 |
| `updateTime` | 已使用时间提示、历史保存 | 服务端账本的消费时间/最后状态更新时间需明确 |
| `expireAt` | 本地计算及提示，追加执行脚本的时效控制 | 服务端权威到期时间，规范化 epoch/时区、结合 `serverNow` |
| `scripts[]` / `content` / `encode` | 接收、Base64 解码并调用 `executeScript` | **只记录风险；现代 Provider 必须结构化返回权益，拒绝远程代码** |

未在源文件看到 `SKU ID`、`accountRef`、`previewId`、`idempotencyKey`、`redemptionId`、`ticket consumed` 等满足当前 R5.2 的服务端契约证据；不能因字段“像”就脑补。

## 6. 与旧 `src-bex` CSDN 的异同，避免误接错层

- [`controller/csdn.ts#L24-L28`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/todo-src-bex/src-bex/controller/csdn.ts#L24-L28) 的 `csdnApp.vipLogin(code)` 使用绝对 `https://api.todo6.com/open/operate/cardonce/use` 与 `code/type/encode`，**并未定义第二个 `deviceCode` 入参**。
- [`background.ts#L160-L244`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts#L160-L244) 的旧 BEX 代码尝试传 `csdnApp.vipLogin(code, deviceCode)`，但前者签名仅收 `code`；**不能把此旧链证明为可靠设备绑定**。
- `background.ts` 在成功时也读取 `scripts`，保存 `csdn_vipcode` / `cardcode_<code>`，执行脚本、产生页面通知。实际内容与 `WebAppVip` 不是同一个稳定服务合同。
- [`src-bex/assets/js/controller/csdn.js#L269-L334`](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/contracts/source-snapshots/todo-src-bex/src-bex/assets/js/controller/csdn.js#L269-L334) 已有 `vipcode` URL 路径，调用 BEX 事件桥；该文件 L416–453 的某些 `axiosx` 后备代码在提前 `return` 后不可达，**不可算真实执行入口**。
- 另有 [旧 BEX 真实调用链分析](../../browser-framework/legacy-src-bex-framework.md)，具体说明 `axiosx` 的后台 GET/POST/PUT/DELETE、事件关联和错误吞没。可用来了解历史交互，不可取代现有 `OpenDeskSDK.browser` 与批准的 Network Driver。

## 7. 安全/正确性禁迁清单（静态源码证据）

| 旧问题 | 来源 | 新版硬边界 |
| --- | --- | --- |
| `hostname.includes`，未做精确域名后缀边界 | `app_vip_base.js` L13–16 | 批准 origin/URL 解析，不靠子串 |
| `vipcode` 在 URL、console、localStorage | L108–147 / L178–235 / L276–290 | 短效一次性 ticket；明文 voucher 不长存、不日志 |
| 用 GET 调用 `/cardonce/use` | L215–223 | 不能充当预检；正式消费须幂等 POST 与账号/服务端账本 |
| 远程 `scripts` 内容直接执行 | L237–295 / 旧 BEX background | 禁止 eval、远程脚本注入、权限突破 |
| URL `proxy` 触发 `settingProxy(...)`，无批准跳转约束 | L52–70 | 代理仅已批准可信 Host 单按钮与所有权/STOP |
| 用网站 Cookie 判身份、主动删 Cookie、上传 Cookie | `app_csdn.js` L31–43；`app_vip_base.js` L308–385 | 不读取第三方 AI 网站 Cookie 作为商业认证；不上传 |
| 本地指纹标识设备 | `app_vip_base.js` L29–37 | 宿主受控安装身份/批准账号会话 |
| 客户端“登录时间”节流与过期计算 | L72–106 / L200–274 | 只能防 UI 循环，不能替代服务端时效/撤权 |
| `initCustomRelogin` 的反向判断和未定义变量 | `app_csdn.js` L92–111 | 标记历史 BUG；不能机械迁移 |
| `doCustomLogoutBefore` 定义但未调用 | `app_csdn.js` L114–139 | 标记未接线；不能用代码存在冒充功能 |

## 8. 提取成“通用业务能力”的最终清单

按**用户需求**而非按旧函数名确立可迁能力：

1. **受控生命周期**：初始化 → 验证账号 → 读取权益 → 恢复交易状态 → 用户操作；目标网站差异只在明确必要时以 Adapter 显式隔离。
2. **链接意图解析**：识别激活入口，但消费者必须验证短效 ticket、目标工具/安装、账号与用户确认。
3. **登录状态恢复**：尊重主动登出与撤权、不依赖网页 Cookie、禁止刷新时重复兑换。
4. **服务器可信卡密/商品/权益读取**：预检与消费区分；幂等确认与服务器账本；历史 `isused` 只能作为需求线索。
5. **权益时间与额度**：使用服务器定义的时间和 SKU/额度规范，不继承旧客户端过期运算。
6. **用户可理解的状态反馈**：未登录、已验证、过期、已使用、未知效果、权限不足、网络失败、人工恢复。
7. **最小非敏感恢复记录**：和正式 `toolId/packageHash/installEpoch/accountRef` 绑定，有 TTL、退出/升级/卸载失效机制；不保存 voucher、ticket 或 Cookie。
8. **第三方平台适配思路**：只复用旧“通用流程 + 特殊平台小钩子”的设计原则，不延续全域 Chrome 权限、页面注入、Cookie 上传或动态脚本执行。

**这些是提取出的设计需求，不是已经完成的当前 SDK 方法。** 正式源码归属和剩余实施顺序见 [R5.2 现代采纳方案](../../framework/workstreams/ai-vip-share-r52-legacy-adoption-and-plan-20261015.md)；不要以更多历史代码复制取代真实业务闭环。
