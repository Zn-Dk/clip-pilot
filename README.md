# ClipPilot

一个本地优先的剪贴板与提示词工作区，使用 Tauri v2 + React + Vite 构建，同时支持 Windows 与 Android。

## MVP 能力

- 保存普通文本片段和提示词
- 搜索、收藏、编辑、删除
- 读取系统剪贴板并保存
- 一键复制到系统剪贴板
- 本地快捷处理：去首尾空格、格式化 JSON、大小写转换
- `localStorage` 本地持久化，无登录、无后端、无外部 API key
- debug 构建显示 `DEV_MODE` 标识，release 构建隐藏

## 技术栈

- React 19 + TypeScript + Vite 8
- Tauri v2 + Rust
- `@tauri-apps/plugin-clipboard-manager`
- pnpm
- GitHub Actions：Windows 安装包、Android arm64 debug/release APK

## 本地开发

```bash
pnpm install
pnpm dev       # 浏览器预览 UI
pnpm build     # 类型检查 + Vite 构建
pnpm tauri dev # Tauri 桌面窗口，需要系统依赖
```

浏览器预览时，系统剪贴板优先使用浏览器 API；Tauri 桌面或 Android 运行时使用 clipboard-manager 插件。

## CI 构建

push 到 `main` 会自动构建：

- Windows：`clip-pilot-windows-installers`
- Android：`clip-pilot-android-apk-debug` 与 `clip-pilot-android-apk-release`

Android workflow 在 CI 内生成 `gen/android`，只编译 arm64。当前 release 为 demo 配置，复用 debug 签名以便实机测试；正式分发前需要改为正式 keystore + GitHub Secrets。

详细的模板、Windows、Android 和 CI/CD 说明见 `docs/`。
