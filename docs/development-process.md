# boduan-tracker 单一生产开发流程

本文件是唯一开发与发布流程来源。README 只保存稳定边界，handoff 只保存已验证的当前生产状态。旧六文档、`CONTEXT.md`、逐任务环境巡检和多轮发布探针均已退出流程。

## 一、每个任务只走一条路径

1. 复用本会话已经完成的仓库同步、文档读取和环境结论，不重复接手仪式。
2. 先按实际风险明确选择 `DOCS / FAST / FULL`，不按文件数量判断。
3. 定位目标后一次完成同批编辑；不在原因未确认时先发布猜测性修复。
4. 开发中只做必要诊断；最终只运行一次对应 gate。
5. 需要视觉证据时，在最终状态只验收一次受影响页面。
6. 用户明确要求上线后，只提交一次、推送一次、运行一次发布等待器。

改动范围扩大时升级 tier 并补充尚未执行的检查；同一 diff 已通过的步骤不得重复。gate 后若 diff 又变化，旧 gate 失效，对最终 diff 重新运行一次即可。

## 二、执行时间目标

这些目标用于暴露流程异常，不允许通过删除安全门禁来达成：

| 任务 | 正常目标 |
| --- | --- |
| 精确的小型 UI / 文案，本地完成 | `3–5 分钟` |
| UI 加一次最终 Simulator 截图 | `5–8 分钟` |
| UI、最终截图并完成上线核验 | `6–10 分钟` |
| 多页面或需要一次视觉修正的布局 | `10–15 分钟` |

- 预计超过 `10 分钟`时，先说明具体卡点和下一步，不得无状态地继续消耗时间。
- Simulator、依赖、权限或外部平台出现异常时先报告异常，不得用重复 sleep、重建设备或高频探针掩盖问题。
- `scripts/run-gate.mjs` 会打印每个步骤和总耗时；慢点必须依据该计时判断，不能把完整任务耗时归因于几秒钟的测试。

## 三、DOCS：纯 Markdown

仅当 diff 全部为 Markdown 时使用：

```bash
npm run check:docs
```

它只执行三份权威文档结构检查和 Markdown whitespace check。纯文档不运行 build、全量测试、Vercel、生产接口或 Simulator。

## 四、FAST：默认快速通道

只要不命中 FULL 条件，就走 FAST：

- 中英文系统文案、图标、颜色、字号、字重、边框、间距、宽高和对齐。
- 仅影响呈现的展开、收起、Tab、弹窗开关、焦点、按压态、动画、loading、空状态和错误状态。
- 页面内非金融的过滤、排序、格式化、校验提示或 view-model 小修复。
- 不改变 callback、payload、目标表、user scope 或保存/删除语义的表单展示与反馈。
- 行为不变且影响封闭的局部重构、性能优化和测试补充。

最终 gate：

```bash
npm run check:fast
```

存在直接相关测试时，将它们接入同一次 gate，不再先后重复执行：

```bash
npm run check:fast -- tests/<相关测试>.test.js
```

FAST 依次执行最多一次定向测试、字号门禁、production build 和 whitespace check；本地同一 diff 修改权威文档时，再自动补一次 docs consistency。它不运行全量测试、audit、RLS、401、marker、环境巡检或无关 smoke。

## 五、FULL：高风险完整门禁

以下任一项必须 FULL：

- Auth、session、token、CORS/origin、登录、注册、找回密码、邀请码或管理员能力。
- RLS、`auth.uid()`、`user_id`、跨用户隔离、grant/revoke、policy、trigger、function、schema、migration 或生产数据修复。
- 正式交易、波段/摊薄 scope、持仓、现金流、收益、排名、QQQ、汇率、快照、ledger revision/hash/CAS。
- API contract、handler/runtime、provider、服务端网络、行情 freshness/fallback、symbol normalization、realtime relay 或 secret。
- 数据库读写、query shape、data source、导入/导出/恢复、持久化结构、账户切换缓存或跨模块共享状态。
- Cron、service role、目标交易日、publication marker、批处理、并发、幂等性或锁顺序。
- 路由结果、PWA lifecycle、service worker、offline/cache、resume/focus/pageshow/visibility 恢复逻辑。
- 依赖、lockfile、Vite/build、GitHub Actions、Vercel 配置、环境变量或无法证明影响封闭的大型重构。

最终 gate：

```bash
npm run check:full
```

FULL 依次执行一次完整测试（其中包含字号门禁）、production build 和 whitespace check；本地同一 diff 修改权威文档时，再自动补一次 docs consistency。开发中可以为定位单独运行受影响测试，但稳定后不得反复运行 FULL。

按实际影响只追加一项专项验证：

| 实际影响 | 唯一必要追加项 |
| --- | --- |
| quote / earnings 鉴权或 handler | 对应 endpoint 定向测试及一次未登录 `401` |
| RLS / schema / grant / user scope | `npm run verify:rls:rest`；必要时 metadata 与双用户隔离 |
| 交易 / 收益 / 快照 / Cron / 比赛 | 对应幂等性测试及部署后聚合只读回查 |
| PWA lifecycle / cache / service worker | 已安装 iOS Home Screen PWA 的受影响路径 |
| 依赖 / lockfile | `npm run audit` |
| 纯服务端 FULL | 不做 Simulator 截图 |

生产 migration、backfill、删除、覆盖或其他写操作仍必须取得用户明确授权；执行前只读确认精确目标，执行后做隐私安全的聚合 postflight，并说明回滚或 forward-fix。

## 六、视觉验收只做最终一轮

- 纯文案、颜色、图标和简单样式不默认截图；用户要求截图时纳入同一任务，不等待再次提醒。
- 复用已经启动的 Vite 服务和 QA Simulator；固定使用 `127.0.0.1` / localhost，不为普通页面反复创建新设备。
- 普通布局通过本机真实 Xcode iOS Simulator Safari 验收；PWA lifecycle、缓存、resume 和实时恢复必须使用已安装的 Home Screen PWA。
- 一次只截图受影响页面和必要的窄宽度边界；不对无关页面或每个中间 patch 重复截图。
- 不得仅为截图临时改写 Auth、路由或产品逻辑。确需新增稳定 preview fixture 时，把它作为正式可测试的开发基础设施单独实现。
- 桌面浏览器、响应式视口、Codex 内置浏览器和伪造 iOS 状态栏不能冒充 iOS 证据。

## 七、发布只调用一次等待器

用户明确要求“上线/部署”后：

1. 确认最终 diff 只包含目标改动，且对应 gate 已通过。
2. 使用项目 SSH key 提交并推送 GitHub `main`；不得直接改 Vercel。
3. 按本次 tier 只调用一次：

```bash
npm run release:verify -- docs <commit>
npm run release:verify -- fast <commit>
npm run release:verify -- full <commit>
```

等待器最长等待 `180 秒`：

- `docs` 只等待精确 commit 的 Docs workflow，不等待 Vercel、不访问生产。
- `fast/full` 等待精确 commit 的 CI 和 Vercel；若提交也修改文档，同时等待 Docs。
- missing、queued、pending 和 in-progress 都属于 WAIT，不因平台尚未登记而误报失败。
- CI/Vercel ready 前不访问生产；ready 后只读取一次生产首页和静态入口。
- 通用等待器不再固定探测 quote/earnings；FULL 只按上一节补唯一相关 smoke。

禁止在等待器外继续运行第二次发布校验、手写 `gh run list`、多轮 `curl` 或循环生产探针。terminal failure 或超时应直接报告真实状态。

GitHub CI 复用同一个 `check:full`，Docs workflow 复用同一个 `check:docs`；连续推送只保留同分支最新任务，避免旧任务继续占用资源。

## 八、版本与文档只在有意义时更新

- `README.md`：仅稳定架构、安全、环境或产品硬规则改变时更新。
- 本文件：仅 tier、gate、视觉或发布规则改变时更新。
- `docs/handoff.md`：仅明确交接或已验证生产基准、风险、下一步发生变化时更新。
- 纯文档、内部重构、无用户感知修复和部署证据不升设置页版本、不写应用内 changelog。
- 值得用户看到的一批功能发布才更新 `src/lib/releaseMeta.js` 和 `src/lib/settingsChangelog.js`；设置页从单一 release metadata 读取版本，不再同步多份硬编码。
- 历史只由 Git、Actions/Vercel 和 changelog 数据保存；测试只验证 changelog 结构，不逐字锁定数百条历史文案。

## 九、诊断工具不是门禁

以下命令只在首次新工作区、换机或明确故障时运行一次，不属于 DOCS/FAST/FULL：

```bash
npm run doctor:workspace
npm run doctor:toolchain
npm run doctor:env
npm run setup:local-env
```

连续任务不得重复运行。普通 UI、逻辑修改和 GitHub 自动部署不需要 Vercel CLI link。

## 十、已删除的旧流程不得恢复

- 不再使用模糊的 `npm run check` 隐式 FULL。
- 不再使用 Chrome blank-screen smoke 代替 iOS 验收。
- 不再使用瞬时失败的 `verify:deploy-status`。
- 不再每个任务运行 workspace/toolchain/local-env/Vercel link。
- 不再每个小 UI 升版本、写 changelog、更新 handoff 或另开 docs-only 提交。
- 不再逐字断言历史 changelog，也不恢复 `CONTEXT.md` 或退休文档。
- 不再为四行 UI 改动启动无收益的等待任务、重复 Simulator 或重复 gate。

任何测试、build、gate、专项 smoke 或发布等待器失败时停止上线；发现 secret、跨用户风险、生产与 GitHub 不一致或需要线上手改代码时立即停止并先修复。
