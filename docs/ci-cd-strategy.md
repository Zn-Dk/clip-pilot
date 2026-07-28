# CI/CD 触发策略：构建自动、发布人工

> 沉淀日期：2026-07-27 ｜ 适用：Tauri React 模板及其派生项目
> 配套：`github-actions-windows.md` / `github-actions-android.md`

## 一、核心结论

**构建（CI）自动跑，发布（CD）人工控——两者分离。** 这是业界标准的 CI/CD 分离，也是本项目两条流水线的触发设计依据。

## 二、触发方式选型（为什么这么选）

| 方式 | 是否采用 | 原因 |
|---|---|---|
| **push 自动触发** | ✅ 构建默认 | CI 的本质是"每次变更自动验证"；手动易忘，失去 CI 意义 |
| **workflow_dispatch 手动** | ✅ 备用 / 发布用 | 留给需要人工确认的操作（发布、按需单独跑某条） |
| **commit message + if** | ❌ 不用 | 靠 magic string（如 `[android]`）驱动触发是反模式，不可靠、易忘；除 GitHub 内置 `[skip ci]` 外正常项目基本不用 |
| **paths / paths-ignore** | ✅ 辅助 | 改文档 / README 不触发构建 |
| **concurrency** | ✅ 辅助 | 同分支连续 push 自动取消旧 run 只跑最新——比手动更智能地防浪费 |

### 为什么不是"纯手动 dispatch"？

纯手动适合**发布/部署**这类需人工确认的重操作，不适合**日常构建**。且本项目是 public 仓库，GitHub Actions **免费无限**，"省额度"不构成手动的理由（那是 private 2000 分钟/月才需操心的）。防浪费的正确做法是 `concurrency` + `paths-ignore`，而不是把构建也手动化。

## 三、CI 与 CD 的分离

| | CI（持续集成） | CD（持续交付/发布） |
|---|---|---|
| 干什么 | 验证"代码能构建、没破" | 把产物**推向环境**（灰度→生产） |
| 触发 | 每次 push 自动，无人值守 | 人工 / 定时 / 固定窗口，要把关 |
| 频率 | 高 | 低（按发布节奏） |
| 失败代价 | 低（重新 push） | 高（影响线上），需人工卡 |

**"Release 人工控制、不影响构建"** 就是这条边界：构建归构建（自动），发布归发布（人工）。

## 四、空跑 → 灰度 → 上线（CD 渐进式交付）

线上项目发布节奏固定，典型三段式，GitHub Actions 原生机制可落地：

- **空跑 dry-run**：`workflow_dispatch` + `inputs.env=dry-run`，跑完打包+签名全流程但**跳过真正上传/发布**，验证发布流程本身
- **灰度 staging/canary**：`env=staging`，发灰度渠道（Android 走 Play internal/alpha track，Windows 发内部白名单）
- **上线 prod**：`env=prod`，全量
- **人工卡点**：GitHub **Environments**（Settings → Environments → 建 staging/prod → 配 Required reviewers），workflow 里 `environment: prod` 到达即**暂停等审批**，批了才继续
- **固定发布窗口**：`on: push: tags: ['v*']`，发版日打 tag 触发

## 五、本项目当前触发配置

```
build-android / build-windows  →  CI：push 自动 + paths-ignore + concurrency（保留 dispatch 备用）
release-*（将来）               →  CD：workflow_dispatch(env) 或 tag + environments 审批
```

当前 build 两条 workflow 的 `on` + `concurrency`：

```yaml
on:
  push:
    branches: [main]
    paths-ignore: ['**.md', 'docs/**']
  workflow_dispatch:   # 手动备用入口

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

> build-android 的 dispatch 还带 `inputs.mode`（all/debug/release）；push 触发时该值为空 → 前置 setup job 默认按 all 输出 matrix（debug+release 都构建）。

## 六、踩坑补充

- **GitHub job 级 `if` 在 matrix 展开前评估，不能引用 `matrix` 上下文**（dispatch 报 422 "Unrecognized named-value: matrix"）。解法：前置 setup job 按 inputs 输出动态 matrix，主 job `matrix: fromJSON(needs.setup.outputs.matrix)`。
- **workflow_dispatch 的 inputs 在非 dispatch 触发（如 push）时为空字符串**（default 不生效），动态 matrix 需兼容空值（push → 默认 all）。
