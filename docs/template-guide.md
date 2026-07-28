# 模板使用清单

## 1. 创建仓库

在 GitHub 模板仓库页面点击 **Use this template → Create a new repository**。新仓库会获得独立 Git 历史，不会继续跟踪模板仓库。

## 2. 必改配置

以项目 `ClipPilot`、仓库 `clip-pilot` 为例：

| 文件 | 修改项 | 示例值 |
|---|---|---|
| `package.json` | `name` | `clip-pilot` |
| `src-tauri/tauri.conf.json` | `productName` | `ClipPilot` |
| `src-tauri/tauri.conf.json` | `identifier` | `com.zndk.clip_pilot` |
| `src-tauri/tauri.conf.json` | `app.windows[0].title` | `ClipPilot` |
| `index.html` | `<title>` | `ClipPilot` |
| `src-tauri/Cargo.toml` | `[package].name`（可选） | `clip_pilot` |

`identifier` 是 Android application id 和桌面应用身份的一部分，必须唯一；不要使用 Tauri 默认的 `com.tauri.dev`。

## 3. 保留或替换的示例代码

- `src/App.tsx` 的 `greet` 是最小 Rust ↔ React 桥接示例，可以作为验证基建的保留代码，也可以在业务页面完成后删除。
- `src-tauri/src/lib.rs` 的 `is_dev_mode` 用 Rust 的 `debug_assertions` 区分 debug/release；如果业务不需要开发标识，可删除命令与前端悬浮标。
- `.github/workflows/` 通常直接保留。artifact 名称会自动使用 `${{ github.event.repository.name }}`，无需手改。

## 4. Android 签名边界

模板的 release workflow 默认把 release APK 绑定到 debug signing，仅为 demo 实机测试服务。它不是生产签名，不能用于 Play 发布或长期升级链路。

正式项目应：

1. 本地生成并离线备份正式 keystore。
2. 将 keystore base64、密码和 alias 放进 GitHub Secrets。
3. 修改 Android workflow 的 signing step，禁止把私钥提交到仓库。
4. 对外发布前通过 staging / production 环境审批。

## 5. 第一次验证

```bash
pnpm install
pnpm build
```

然后 push 到 `main`：

- Windows workflow 产出 `.exe` / `.msi`。
- Android workflow 并行产出 `debug` / `release` 两个 arm64 APK artifact。
- 纯 `.md` 和 `docs/` 变更不会触发构建。
