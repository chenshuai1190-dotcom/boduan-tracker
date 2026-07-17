# boduan-tracker 极简生产开发流程

本文件是唯一流程来源。README 只放稳定边界，handoff 只放当前状态，不再复制流程。

## 基本原则

- GitHub `main` 是唯一代码源头；禁止直接修改 Vercel 或其他线上代码。
- 只分 `FAST` 和 `FULL`。默认先判断是否触及高风险边界，不按文件数量或“看起来像前端”判断。
- 同一会话已同步仓库、工具链正常时，不重复 fetch、workspace、toolchain、local-env 或线上巡检。
- 小改动不强制建分支、开 PR、升版本、写 changelog 或更新 handoff。用户明确要求上线时，验证通过后可直接提交并推送 `main`。
- 改动范围扩大时只补缺失门禁，不重复已经通过的检查。

## FAST：默认快速通道

只要不命中下一节的 FULL 条件，就走 FAST。

### 可以直接快速上线

- 文档、注释、拼写、标点和排版。
- 中英文系统文案、图标、颜色、字号、字重、边框、间距、宽高和对齐。
- 组件内只影响呈现的展开/收起、页签、弹窗开关、焦点、按压态、动画、loading、空状态和错误状态。
- 页面内非金融的过滤、排序、格式化、校验提示或 view-model 小修复。
- 现有 owner-scoped CRUD 表单的展示、校验提示和提交反馈修复，前提是不改变 callback、payload、目标表、user scope 或保存/删除语义。
- 行为不变的局部重构、性能优化和测试补充。

### FAST 最低验证

纯 Markdown：

```bash
git status --short
git diff HEAD --check
```

改到三份权威文档的结构、设置页版本或 handoff 当前状态时再运行：

```bash
npm run check:docs
```

展示代码、组件局部逻辑或普通修复：

```bash
node --test tests/<直接相关测试>.test.js   # 有直接相关测试时运行
npm run check:fast
```

FAST 本地明确不要求：全量 `npm test`、audit、toolchain、local-env、RLS、401、marker 回查、全库文档扫描或手工开发日志。代码推送后仍由 GitHub CI 统一跑一次全量测试、build 和 high-level audit，本地不重复。

纯文案、颜色、图标和简单样式不要求制作截图。需要制作或交付静态 HTML、页面截图作为视觉确认时，必须通过 localhost 在本机真实 Xcode iOS Simulator 的 Safari 中打开并截图；桌面浏览器、Codex 内置浏览器、响应式视口以及手工伪造的 iOS 状态栏都不能作为截图证据。不要求无关页面和重复截图。

### FAST 上线

用户明确要求“上线/部署”后：

1. 确认 diff 只包含目标改动。
2. 提交并使用项目 SSH key 推送 `main`。
3. 代码变更只运行一次 `npm run verify:deploy-status -- <commit>`。
4. 纯 Markdown 不运行 deploy-status，也不等待 Vercel；GitHub Docs workflow 的轻量检查足够。

FAST 不因“要上生产”自动升级 FULL。

## FULL：必须完整验证

出现以下任一项才进入 FULL：

- Auth、session、token、CORS/origin、登录、注册、找回密码、邀请码或管理员能力。
- RLS、`auth.uid()`、`user_id`、跨用户隔离、grant/revoke、policy、trigger、function、schema、migration 或生产数据修复。
- 正式交易、波段/摊薄 scope、持仓、现金流、收益、排名、QQQ、汇率、快照、ledger revision/hash/CAS。
- API contract、handler/runtime 语义、provider、服务端网络请求、行情 freshness/fallback、symbol normalization、realtime relay 或 secret 使用；API 文件里的纯注释仍可走 FAST。
- 数据库读写、query shape、data source、导入/导出/恢复，以及保存/删除/提交/同步结果、持久化结构、跨模块共享状态、账户切换缓存或可恢复状态。
- Cron、service role、目标交易日、publication marker、批处理、并发、幂等性或锁顺序。
- 路由结果、PWA 生命周期、service worker、offline/cache version、resume/focus/pageshow/visibility 恢复逻辑。
- 依赖、lockfile、Vite/build、GitHub Actions、Vercel 配置或环境变量。
- 大范围共享组件/工具重构，无法通过定向测试证明影响封闭。

### FULL 本地门禁

开发过程中可按需先跑 `node --test tests/<受影响测试>.test.js` 快速定位；最终门禁只需：

```bash
npm run check:full
```

`check:full` 包含完整测试、production build 和 whitespace check。依赖未变化时，本地不重复 CI 的 audit；只有首次工作区、换机或工具异常时再运行 `npm run verify:toolchain`，只有任务确实需要真实环境时再运行 `npm run verify:local-env`。

### FULL 按影响追加，不做无关检查

| 实际影响 | 追加验证 |
| --- | --- |
| quote / earnings 鉴权或 handler | 对应未登录 `401` 与 endpoint 定向测试 |
| RLS / schema / grant / user scope | `npm run verify:rls:rest`；必要时 metadata 与双用户隔离 |
| 交易账本 / 收益 / 快照 / Cron / 比赛 | 对应定向测试、幂等性和部署后聚合只读回查 |
| PWA lifecycle / cache / service worker | iOS 主屏 PWA 受影响路径 |
| 依赖 / lockfile | 额外运行 `npm run audit`；无需 RLS/marker |
| 纯服务端 FULL | 不做无关 Simulator 截图 |

数据库 migration、backfill、删除、覆盖或生产写操作仍需要用户明确授权；必须先只读确认精确目标，执行后做聚合 postflight，并说明回滚。

### FULL 上线

1. 本地门禁与受影响专项检查通过。
2. 提交并使用项目 SSH key 推送 GitHub `main`；大范围或难回滚改动再使用分支/PR，不把 PR 变成所有小改的仪式。
3. 等待代码 CI 和 Vercel success。
4. 运行一次 `npm run verify:deploy-status -- <commit>`，再补唯一必要的任务专项 smoke。

## 文档与版本策略

只维护三份权威文档，而且一次改动通常只更新其中一份：

- `README.md`：仅当稳定架构、安全边界、环境或产品硬规则改变。
- `docs/development-process.md`：仅当 FAST/FULL 或发布规则改变。
- `docs/handoff.md`：仅在明确交接、当前生产基准/风险/下一步发生实质变化时。

不再维护 `docs/development-log.md`、`docs/security-hardening.md` 或 `docs/architecture-security-audit.md`。历史由 Git、Actions/Vercel 和设置页 changelog 保存。

以下情况不升设置页版本、不写应用内 changelog：纯文档、注释、内部重构、无用户感知的修复、单纯部署证据。只有值得用户看到的功能或行为发布才批量升版本并更新 `src/lib/settingsChangelog.js`；不要求每个微小提交都升版本。

## Git 与部署

首次开始或远端可能变化时：

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes" git fetch origin
git checkout main
git pull --ff-only origin main
git status --short --branch
```

推送：

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes" \
  git push git@github.com:chenshuai1190-dotcom/boduan-tracker.git main
```

不要改用 HTTPS token，也不要把 SSH 命令使用错误误报成仓库权限问题。

## 立即停止或升级

- FAST diff 出现 API、持久化、业务回调、金融计算、共享状态、安全或配置：立即升级 FULL。
- 任何已运行的测试、build、audit、docs check 或专项 smoke 失败：停止上线。
- 发现 secret、跨用户读写风险、生产与 GitHub 不一致、需要线上手改代码：停止并先修复。
- 不确定是否会改变财务结果或用户数据边界：按 FULL 处理。
