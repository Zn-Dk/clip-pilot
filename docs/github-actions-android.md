# GitHub Actions 自动构建 Android APK（Tauri v2）

> 沉淀日期：2026-07-27 ｜ 适用：Tauri React 模板及其派生项目 ｜ 状态：已验证通过（debug/release arm64 APK 均可构建）
> 桌面端方案见同目录 `github-actions-windows.md`

## 一、背景与架构

目标：Tauri v2 项目打 Android APK。开发机（TencentOS Server 3.2 / RHEL 8 系）无任何 Android 工具链，**全流程放 CI，本地零环境**。

**核心架构**：`src-tauri/gen/android`（gradle 工程）在 CI 里用 `tauri android init` **临时生成、不提交仓库**。仓库只放源码 + workflow。

为什么可行：`ubuntu-latest` runner **预装 Android SDK + JDK**，正好满足 `android init` 的环境探测（本机跑 init 报缺 Java/SDK，正是因为没有这套预装）。

**计费**：`ubuntu-latest`（Linux）计费系数 **1×**（Windows 2×、macOS 10×，最省）；public 仓库免费无限。**纯构建不发布 Play Store，无任何 Play 相关费用**（不需 Play Console 服务账号 / 上架签名）。

## 二、前置条件

1. GitHub 仓库（public 推荐，免费无限）
2. `tauri.conf.json` 的 `identifier` 已改唯一值（非默认 `com.tauri.dev`）
3. 本地**无需**安装 JDK / SDK / NDK —— 全部 CI 提供

## 三、Workflow 全文

`.github/workflows/build-android.yml`：

```yaml
name: build-android

on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'
      - 'docs/**'
  workflow_dispatch:

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17' }
      # 安装 Rust 工具链并加入 Android 交叉编译目标
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi
      # ubuntu-latest 预装 Android SDK（$ANDROID_HOME），补装 NDK
      - name: Install Android NDK
        run: |
          SDK="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
          SDKMGR=$(ls -d "$SDK"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1)
          yes | "$SDKMGR" --licenses >/dev/null 2>&1 || true
          "$SDKMGR" --install "ndk;27.0.12077973" "cmake;3.22.1"
          echo "NDK_HOME=$SDK/ndk/27.0.12077973" >> "$GITHUB_ENV"
          echo "ANDROID_NDK_HOME=$SDK/ndk/27.0.12077973" >> "$GITHUB_ENV"
      - uses: swatinem/rust-cache@v2
        with: { workspaces: src-tauri }
      - name: Install frontend deps
        run: pnpm install --frozen-lockfile
      - name: Init Android project   # CI 内生成 gen/android，不提交
        run: pnpm tauri android init
      - name: Build Android APK      # debug 包，debug keystore 自动签名
        run: pnpm tauri android build --apk --debug
      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: tauri-android-apk
          path: src-tauri/gen/android/app/build/outputs/apk/**/*.apk
          if-no-files-found: error
```

## 四、踩坑记录

| 坑 | 现象 | 解决 |
|---|---|---|
| `sdkmanager` 不在 PATH | `sdkmanager: command not found`（exit 127） | ubuntu-latest 预装 SDK 但 sdkmanager 在 `$ANDROID_HOME/cmdline-tools/*/bin/` 下，用完整路径调用；装组件前先 `yes \| sdkmanager --licenses` |
| `tauri android init` 需要 SDK | 本机报 `Android SDK not found` / `Java not found` | 不用在本地跑——CI runner 预装 SDK+JDK，init 放 CI 即可 |
| NDK 缺失 | Tauri Android 编译需要 NDK | `sdkmanager --install "ndk;27.0.12077973"` 并设 `NDK_HOME` |

## 五、产物与安装

- artifact `tauri-android-apk`，debug 包已用 debug keystore 自动签名，可直接装机
- `adb install xxx.apk`，或拷到手机点安装（需允许"未知来源"）

## 六、体积优化（debug 包为何 114MB）

debug 包大是因为**默认编全部 ABI + 保留符号 + 未混淆压缩**。瘦身手段：

| 手段 | 效果 | 用法 |
|---|---|---|
| 只编主流 ABI | arm64 一个包，体积砍半以上 | `tauri android build --apk --debug --target aarch64` |
| 按 ABI 拆分 | 每个 ABI 一个独立小包 | gradle `splits.abi` 或 Tauri `--split-per-abi` |
| release 模式 | R8/ProGuard 混淆压缩 + Rust release 优化，可降到 20–30MB | `tauri android build --apk`（不带 `--debug`） |

## 七、debug + release 并行产出（prod 常规做法）

生产环境通常**两类包并行出**：

- **debug 包**：每次 push 自动出，debug keystore 签名 → 内部/现场测试
- **release 包**：R8 混淆压缩 + 正式 keystore 签名 → 对外分发/上架

**并行方式**：用 `strategy.matrix` 让两个 job 在不同 runner 上同时跑（比单 job 串行两次编译快，因为 release 要用 release profile 重编 Rust）：

```yaml
jobs:
  build-android:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        mode: [debug, release]
    steps:
      # ...（前置步骤同上单 ABI 可只留 aarch64）
      - name: Build Android APK
        run: |
          if [ "${{ matrix.mode }}" = "debug" ]; then
            pnpm tauri android build --apk --debug --target aarch64
          else
            pnpm tauri android build --apk --target aarch64   # release
          fi
      - uses: actions/upload-artifact@v4
        with:
          name: tauri-android-apk-${{ matrix.mode }}
          path: src-tauri/gen/android/app/build/outputs/apk/**/*.apk
```

**release 签名**（debug 不需要，release 必须）：生成正式 keystore → base64 存 GitHub Secrets（`ANDROID_KEYSTORE_BASE64` 等）→ workflow 解码 + 在 `tauri.conf.json` / gradle `signingConfigs` 引用。涉及私钥，需自行生成并妥善保管。

## 八、区分 Android / Windows 构建（条件触发）

两条流水线共享同一套源码（`src/`、`src-tauri/`），改业务代码时两者**都该**重建。真正的"区分触发"诉求一般是**避免无谓同跑**，可选方案：

| 方案 | 触发逻辑 | 适用 |
|---|---|---|
| **paths-ignore**（已做） | 排除 `**.md`/`docs/**`，改文档不触发 | 基础优化 |
| **commit message 关键词** | job 加 `if: contains(github.event.head_commit.message, '[android]')` | 想在 commit 里控制跑哪条 |
| **workflow_dispatch + inputs** | 手动点 Run，下拉选 android/windows/all | 按需手动触发，最省 |
| **分支 / tag** | `android` 分支跑 android、打 tag 跑 release | 有明确分支/发布模型时 |

`workflow_dispatch + inputs` 示例：

```yaml
on:
  workflow_dispatch:
    inputs:
      target:
        type: choice
        options: [all, android, windows]
        default: all

jobs:
  build-android:
    if: ${{ inputs.target == 'all' || inputs.target == 'android' }}
    # ...
```

> 注：`paths` 难以按"这是 android 改动还是 windows 改动"区分，因为二者依赖同一套源码——所以推荐用 **commit message 关键词** 或 **手动 dispatch**，而非 paths。
