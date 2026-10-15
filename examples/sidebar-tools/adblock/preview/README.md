# AdBlock R1 原始交互预览 · 设计基准（已由用户确认）

本目录的 `adblock-r1-interactive-preview.html` **原样保存用户于 2026-10-15 提供并确认的 AdBlock R1 交互原型**，不是 CI 生成的验收模拟器，也不是 Chrome 中安装的正式广告拦截界面。

- **唯一原始设计文件：** `preview/adblock-r1-interactive-preview.html`
- **原始文件 SHA-256：** `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`
- **原始文件 Git Blob SHA：** `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`
- **文件大小：** 23,624 bytes
- **用途：** 视觉设计基准、原型交互与未来正式 UI 差异评审。
- **内容：** 蓝色盾牌、全局保护、当前网站、演示计数、预置过滤规则、网站例外/恢复、设置页、右侧场景切换及深浅色原型演示。数据仅为浏览器本地模拟，不产生 Chrome DNR 或网络拦截效果。

## 不得混淆的两个文件

| 文件 | 角色 | 规则 |
| --- | --- | --- |
| **`preview/adblock-r1-interactive-preview.html`** | 用户确认的**原始设计基准** | 除非用户再次确认，不修改其内容，不用生成器覆盖；保持字节级原样 |
| `../adblock-r1-interactive-preview.html` | 正式宿主及工具源码生成的**离线验收预览** | 由现有 `scripts/preview/build-preview.mjs` 生成，源代码变化时可按现有契约更新 |

**注意：** 两者名字相同但语义不同。不得以生成的验收预览替换本目录的原始设计文件；也不得将原型中的演示计数、localStorage、深色切换等功能冒充真实 AdBlock 功能。正式产品仍必须通过授权、可信宿主、DNR 规则和网络原始证据验收。

生成正式来源驱动预览时，`--out` **只能明确指定扩展根目录文件**，不要指定到此 `preview/` 目录：

```sh
node scripts/preview/build-preview.mjs --tool adblock --surface side-panel --scenario success --theme light --width 360 --out examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html
```

对照正式产品 UI 时以这里的原始设计为用户批准的视觉与信息架构基线，同时保留 Chrome 原生权限、宿主与沙箱的真实安全边界；需要偏离原稿的技术原因应在工作流中注明并经确认。
