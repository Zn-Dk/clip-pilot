# GitHub Actions 自动构建 Windows 安装包（Tauri v2）

> 沉淀日期：2026-07-27 ｜ 适用：Tauri React 模板及其派生项目 ｜ 状态：已验证通过（Windows 物理机安装 + greet 测试 OK）

## 一、背景与目标

本项目是 Tauri v2 + React + Vite 桌面应用，需要打出 Windows 安装包供现场测试。但开发机存在两个硬约束：

| 约束 | 说明 |
|---|---|
| 本机 OS 无法做 Tauri 桌面构建 | 开发机是 TencentOS Server 3.2（RHEL 8 系），仓库仅提供 `webkit2gtk3`（webkit2gtk-**4.0** API），而 Tauri v2 需要 `webkit2gtk-4.1`，**桌面端在本机根本无法编译** |
| 无 Windows 构建环境 | Tauri 的 Windows bundle（NSIS `.exe` / WiX `.msi`）依赖 Windows 主机上的 MSVC 工具链 + WebView2，官方不支持 Linux 交叉打包出完整安装包 |

**解法**：用 GitHub Actions 的 `windows-latest` runner 构建。该 runner 预装了 Tauri Windows 构建所需的全部依赖（MSVC Build Tools、WebView2 Runtime），且 **public 仓库免费无限额度**。push 到 main 即自动构建并产出安装包。

## 二、前置条件

1. **GitHub 仓库**
   - **public**：GitHub-hosted standard runner（含 Windows）免费且不限分钟数 —— 推荐
   - private：Free 账户每月 2000 分钟免费，Windows runner 按 **2×** 计费（≈ 1000 分钟 Windows 时长），个人够用
2. 一个本地逻辑能跑通 `pnpm tauri build` 的 Tauri v2 项目
3. ⚠️ **必改**：`src-tauri/tauri.conf.json` 的 `identifier` 不能用默认值 `com.tauri.dev`，必须改成唯一值（如 `com.zndk.tauri-react-example`），否则 bundle 校验直接失败（本项目首次 CI 就因此挂了）

## 三、Workflow 全文

`.github/workflows/build-windows.yml`：

```yaml
name: build-windows

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - name: Install frontend deps
        run: pnpm install --frozen-lockfile
      - name: Build Tauri app (Windows)
        run: pnpm tauri build
      - name: Upload installers
        uses: actions/upload-artifact@v4
        with:
          name: tauri-windows-installers
          path: |
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/msi/*.msi
          if-no-files-found: error
```

## 四、逐段讲解

### 触发条件 `on`
- `push branches:[main]`：推送到 main 分支自动触发
- `workflow_dispatch`：允许在 GitHub 网页 Actions 页手动点 "Run workflow"

### 运行环境 `runs-on: windows-latest`
GitHub 提供的全新 Windows Server 虚拟机，**预装 MSVC 工具链 + WebView2 Runtime**。这是整套方案能绕过本机限制的关键——所有 Tauri Windows 依赖由 runner 现成提供，无需自己安装。

### steps（按顺序）

| step | 作用 |
|---|---|
| `actions/checkout@v4` | 拉取仓库代码到虚拟机 |
| `pnpm/action-setup@v4` | 安装 pnpm（与本地包管理器一致） |
| `actions/setup-node@v4` (node 22 + `cache: pnpm`) | 安装 Node，并按 lockfile 缓存 pnpm 依赖加速后续 |
| `dtolnay/rust-toolchain@stable` | 安装 Rust stable |
| `swatinem/rust-cache@v2` (`workspaces: src-tauri`) | **缓存 cargo 编译产物，加速的关键**。Tauri 的 Rust 依赖树很大，首次全量编译 10–20 分钟，命中缓存后可降到几分钟 |
| `pnpm install --frozen-lockfile` | 装前端依赖（react、@tauri-apps/api、@tauri-apps/cli…） |
| `pnpm tauri build` | **核心一步**，内部串三个动作（见下） |
| `actions/upload-artifact@v4` | 上传产物为 artifact；`if-no-files-found: error` 兜底，没产出就报错让 run 失败，便于排查 |

### `pnpm tauri build` 内部三步

1. **前置构建**：执行 `tauri.conf.json` 里的 `beforeBuildCommand: pnpm build`（= `tsc -b && vite build`）→ 产出 `dist/`
2. **Rust 编译**：`cargo build --release`，用 runner 的 MSVC 工具链编译 Rust 端
3. **打包 bundle**：NSIS 生成 `.exe` 安装包 + WiX 生成 `.msi`，输出到 `src-tauri/target/release/bundle/`

## 五、使用与迭代流程

1. 改代码 → `git push` 到 main（或网页手动 Run workflow）
2. 等待构建（首次 10–20 分钟，有 rust-cache 后几分钟）
3. 打开对应 run 页面，底部 **Artifacts** 下载 `tauri-windows-installers`（zip）
4. 解压得 `*-setup.exe`（NSIS，推荐）/ `*.msi`
5. 在 Windows 机器安装：
   - 需 WebView2 Runtime：Win11 自带；Win10 一般也有，没有时 NSIS 会引导安装
   - 未签名测试包，SmartScreen 可能弹「未知发布者」→「更多信息」→「仍要运行」

## 六、踩坑记录

- **`identifier` 默认值**：`tauri init` 生成 `com.tauri.dev`，bundle 校验要求必须改成唯一值，否则报错 `You must change the bundle identifier ... The default value com.tauri.dev is not allowed`。首次 CI 即因此失败，改 `tauri.conf.json` 后通过。

## 七、进阶优化（可选）

- **避免文档/杂项变更触发构建**：给 `on.push` 加 `paths-ignore`：
  ```yaml
  on:
    push:
      branches: [main]
      paths-ignore: ['**.md', 'docs/**']
  ```
- **产出 Release 而非 artifact**：用 `tauri-apps/tauri-action@v0`，打 tag 自动发 release 并附带安装包，适合正式分发
- **多平台矩阵**：`strategy.matrix` 同时构建 linux/macos（注意 macos runner 计费系数高，private 仓库慎用）
- **代码签名**：配置证书 secret + `tauri-action` 签名参数，消除 SmartScreen 警告
