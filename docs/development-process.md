# Development Process

本文件是 `boduan-tracker` 的正式开发流程。交接给任何新工程师或 AI 代理时,必须先阅读并遵守本文。

## Source of Truth

- 代码唯一源头: GitHub 仓库 `chenshuai1190-dotcom/boduan-tracker`
- 生产环境: Vercel `https://boduan-tracker.vercel.app`
- 数据库: Supabase,结构和 RLS 以 `supabase/rls.sql` 及线上 Supabase 项目为准
- 安全基线: `docs/security-hardening.md`
- 更新记录: `docs/development-log.md`
- 交接入口和当前状态快照: `docs/handoff.md`

不要把 Vercel 控制台、腾讯云控制台、服务器临时文件或浏览器在线编辑当作代码源头。所有可维护的代码改动都必须回到 GitHub。

`docs/handoff.md` 是给下一位接手工程师或 AI 代理使用的产品交接入口,不是 `docs/development-log.md` 的替代品。它必须保持一眼可接手:当前生产状态、关键 commit、设置页版本、Vercel 部署、线上验证、读文档顺序、硬规则、产品规则、代码地图、主要风险和下一步优先级都应从这里快速同步。

## Required Workflow

1. **开始前同步仓库**
   - 从 GitHub 当前 `main` 开始。
   - 运行 `git status --short --branch`,确认工作树状态。
   - 首次接手、换机、工具链异常或部署前环境不确定时,先运行 `npm run verify:toolchain`,确认 `node/npm/gh/vercel/rg/jq/git/ssh/curl`、GitHub CLI 登录、Vercel CLI 登录和项目 SSH key 都可用。
   - 先读 `docs/handoff.md`,再阅读 `README.md`、本文件、`docs/development-log.md` 和与任务相关的代码。

2. **创建明确范围的分支**
   - 常规格式: `codex/<short-task-name>`。
   - 优先通过 PR 合并。
   - 如果 GitHub 权限暂时无法开 PR,只有在用户明确授权后,才允许验证通过后快进 `main`。

3. **本地实现**
   - 小步修改,避免顺手重构无关代码。
   - 不提交真实 `.env`、API token、截图中的密钥或 Supabase service role key。
   - 前端密钥只能使用公开 anon key;付费行情 token 必须只放在服务端环境变量 `EODHD_API_KEY`。
   - 定时任务、全账户批处理、邀请码等服务端管理流只能读取服务端环境变量;`SUPABASE_SERVICE_ROLE_KEY` 和 `CRON_SECRET` 的真实值绝不能写入前端 `VITE_` 变量、日志、截图、测试夹具或仓库文件。
   - 所有用户主动提交类操作(新增、保存、删除、同步、导入、导出等)必须在请求期间禁用重复提交,并在完成后给出明确成功或失败反馈;不能静默完成后让用户猜结果。
   - 除非确实没有可维护替代方案,不要使用浏览器或系统原生交互控件承载核心体验,尤其不要使用 `alert`、`confirm`、`prompt`、浏览器原生表单校验弹窗或未定制的原生选择器。提示、确认、选择、编辑、筛选等产品交互默认用应用内自定义弹窗、抽屉、菜单、toast 或受控组件实现,并按当前深色设计系统适配移动端。
   - 修改 UI 或功能时,凡是涉及用户可见系统文案,必须同步简体中文和 English 两套显示:更新 `src/lib/i18n.js` 的对应 key、组件里的 fallback 文案、空状态/按钮/弹窗/错误提示/设置页更新日志文案,并补充测试或 build marker 证明中英文都进包。只翻译系统文案,用户自己写的目标箴言、心得、复盘、备注、日志、账户名等内容必须保持原文。
   - 交易页工具账本必须保持边界清晰:正式交易/当日订单/持仓只能写 `stock_trades`;波段记录只写旧账本 `trades`;摊薄成本只写 `cost_basis_trades`。如果复用弹窗或保存函数,必须用显式 scope 分流,并在提交确认文案里说明写入范围。波段记录和摊薄成本这类独立小工具提交前必须弹确认框并加提交锁,防止重复提交或串入主账本。
   - 移动端弹层里的 `date`、`number`、`text` 等原生输入控件必须显式限制 `w-full max-w-full min-w-0 box-border`;日期框还应使用 `appearance-none`/`WebkitAppearance: 'none'` 或等效约束,避免 iOS/Safari 原生日期控件按自身最小宽度把底部抽屉撑出屏幕。涉及输入框布局时必须按 390px 左右移动端宽度核对不溢出。
   - 添加/修改/删除/确认类弹窗打开后必须锁定背景页面滚动;移动端不能允许遮罩背后的页面跟随手势移动。优先使用记录 `scrollY` + `body { position: fixed; overflow: hidden; width: 100%; top: -scrollY }` 的方式,关闭弹窗后恢复原位置。表单类弹窗默认居中自适应,不要无故贴底。
   - 视觉字重默认使用正常字重;除页面标题、重要模块标题和确有层级需要的标题外,普通文本、股票代码、数字、按钮、列表行和订单记录不要使用 `font-bold`、`font-semibold`、`font-black` 或等效加粗样式。

4. **分层验证**
   - 每次改动先判定风险档位,再选择验证强度。不要把纯文档回填和高风险运行时代码改动混成同一流程;也不要为了省时间把运行时代码误判成 docs-only。

   - **A. Runtime deploy / 常规运行时代码改动**
     - 适用范围: 修改 `src/`、`api/`、`tests/`、`public/`、`package*.json`、Vite/Tailwind/build 配置、PWA 资源、用户可见 UI/文案,或任何会改变生产 bundle、serverless 行为、测试边界的内容。
     - 必跑:

     ```bash
     npm run verify:toolchain
     npm test
     npm run build
     npm audit --audit-level=moderate
     git diff --check
     ```

   - **B. Docs-only evidence / 纯文档和部署证据回填**
     - 适用范围: 只修改 `docs/` 中的交接、流程、日志或部署证据,且不改变应用源码、依赖、测试、配置、环境变量、PWA 资源或 CI/Vercel 行为。
     - 可跳过 `npm test`、`npm run build` 和 `npm audit`,因为运行时代码没有变化;日志里必须明确本轮是 docs-only,并引用最近一次 runtime deploy 已通过的测试/构建/audit 结果。
     - 必跑:

     ```bash
     npm run verify:docs-consistency
     git diff --check
     git diff --stat
     ```

     - `npm run verify:docs-consistency` 只读取当前状态区、最近日志条目、可转发交接块和设置页版本/更新日志,输出 PASS/FAIL 摘要;不要对整份长日志做无边界 `rg -n` 后贴出大量历史命中。
     - 如果本轮改动的文档面超出脚本覆盖范围,再补充少量 `sed -n` 定位抽查;仍不要打印长历史日志。
     - 如果 docs-only 用来回填刚完成的生产部署,必须运行 `npm run verify:deploy-status -- <commit>`,验证对应 GitHub/Vercel status、生产入口和基础鉴权 smoke;额外任务 marker 仍只输出摘要,不要打印 minified bundle。

   - **C. Sensitive change / 生产敏感改动**
     - 适用范围: auth、RLS、Supabase 策略、`/api/quote`、`/api/earnings-calendar`、行情 relay、交易主账本、收益快照、全账户 cron、付费行情 token、环境变量、安全文档或任何可能影响跨用户数据边界的改动。
     - 先完整执行 A 档验证,再按影响面补充:
       - `/api/quote` 未登录必须返回 `401`。
       - `/api/earnings-calendar` 未登录必须返回 `401`。
       - RLS 外部暴露复核运行 `npm run verify:rls:rest`。
       - 数据库/RLS 改动必须说明 Supabase SQL 执行状态。
       - 安全边界改动必须有对应测试或线上 smoke 覆盖。
     - 生产敏感改动不能降级到 docs-only;如果判断不确定,按 C 档处理。

   - 涉及线上行为但不属于 C 档时,按任务补充目标验证。例如登录页和已登录页面 smoke check、生产 marker、Vite chunk 输出、首页 preload 状态等。
   - 涉及 UI、移动端布局、弹窗、字号、图标、颜色或交互位置的改动,必须先做本地视觉截图给用户确认:
     - 优先使用 `390x844` 左右的手机视口和当前任务入口,必要时补充桌面视口。
     - 截图保存到本机固定预览目录 `~/Desktop/boduan-previews/`,文件名写清页面、目标和版本,方便用户在电脑上直接打开。
     - 同时在聊天窗口用绝对路径 Markdown 图片转发截图,格式示例: `![交易页预览](/Users/chenshuaishuai/Desktop/boduan-previews/example.png)`。
     - 如果 Codex 客户端或手机端未渲染本地图片,立即 `open` 桌面预览文件,并在回复中给出绝对路径;不能只描述“已截图”。
     - 截图前确认画面里没有 token、`.env`、Supabase service role key、付费 API key 或其它敏感信息。

5. **必须更新开发日志**
   - 每次代码、配置、部署、安全或文档改动,都必须在同一个提交中更新 `docs/development-log.md`。
   - 每次改进收尾时,必须同步核对所有记录面,避免版本、commit、部署、验证和线上状态互相不一致。核对方式按风险档位执行:runtime/sensitive 改动至少检查 `docs/development-log.md`、`docs/handoff.md`、`README.md`、`docs/security-hardening.md`、`docs/architecture-security-audit.md` 和设置页更新日志/版本号;docs-only 只需定向检查当前状态区、最近日志条目和可转发交接块。若某个文件不需要改,在日志或交接说明中明确原因。
   - `docs/handoff.md` 在以下任一情况必须同步更新:当前 `main`/关键 commit/部署状态/线上验证变化,设置页版本变化,产品规则或用户可见流程变化,安全边界/环境变量/Supabase/Vercel 配置变化,代码地图或主要风险变化,下一步优先级或可转发交接话术变化。
   - 用户可见更新必须同时更新设置页更新日志和版本号;产品状态、部署状态、安全基线或交接规则变化,必须同步更新对应文档,不能只改其中一个记录文件。
   - 日志必须包含:
     - 日期和时区
     - 背景/问题
     - workflow tier: `runtime` / `docs-only` / `sensitive`
     - 核心改动
     - 关键文件
     - 验证命令和结果
     - commit hash;如果日志和改动在同一提交中,先写 `same commit`,最终交接消息必须给出实际 hash
     - 部署状态
     - 线上验证
     - 回滚方式或后续风险

6. **提交和推送**
   - commit message 用动词开头,说明实际行为。
   - 推送分支后优先开 PR。
   - 合并或快进 `main` 前必须确认构建和必要验证通过。
   - 用户没有明确要求“只本地实现/暂不部署”时,完成改动并验证通过后必须继续推进到 GitHub `main`,触发生产自动部署。
   - 本仓库推送、部署重试、`fetch`、`ls-remote`、刷新 `origin/main` 等所有远端 Git 操作,默认都必须显式使用项目 SSH key 和 `git@github.com:chenshuai1190-dotcom/boduan-tracker.git`。不要用 HTTPS `origin` 作为省事路径;如果 `origin` 仍是 HTTPS,也不要直接运行 `git push origin main`。
   - 如果 `git push origin main` 走 HTTPS 时报 `could not read Username for 'https://github.com': Device not configured`,不要误判为仓库无权限;本机该项目已有 SSH key `~/.ssh/boduan_tracker_github`,应使用:

     ```bash
     GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes" git push git@github.com:chenshuai1190-dotcom/boduan-tracker.git main
     ```

   - 如果远端检查、`ls-remote`、`fetch` 或 `status` 辅助命令出现 `Permission denied (publickey)`、`could not read Username`、`Device not configured` 或本地 `origin/main` 未刷新,先判定为“命令没有按本仓库 SSH 准则执行”,立即用同一个 `GIT_SSH_COMMAND` 和 `git@github.com:...` 重跑;不得把这类错误写成用户权限不足或部署阻塞。
   - 推送后如本地 `origin/main` 仍未刷新,用同一个 SSH key fetch: `GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes" git fetch git@github.com:chenshuai1190-dotcom/boduan-tracker.git main:refs/remotes/origin/main`。

7. **Vercel 自动部署**
   - `main` 更新后由 Vercel 自动部署。
   - 这是每次完成可部署改动后的默认收尾动作;不能停在“已实现但未部署”状态。
   - 不在 Vercel 控制台直接改源码。
   - 环境变量只在 Vercel/Supabase 后台配置,不写进仓库。
   - 如果 Vercel 对运行时代码提交返回 `Deployment rate limited — retry in 24 hours` 或长时间没有创建 production deployment,不能停在“已推送但未上线”。应先把真实失败状态写入 `docs/development-log.md`,然后创建一个明确的部署重试提交,通过项目 SSH key 推送到 GitHub `main`,并继续轮询 Vercel 到 `success` 或再次确认真实阻塞。部署重试提交不要使用 `[skip ci]`,除非它只是成功上线后的纯文档证据记录。
   - 如果用户明确要求“部署”“再次部署”或“走 ssh”,必须优先执行上面的 SSH 推送/重试流程,不得改用 HTTPS、不得把第一次 Vercel rate limit 当作最终完成状态。
   - 如果 GitHub、CI、Vercel 或权限问题导致无法部署,必须在最终交接中明确说明阻塞原因和当前 commit。
   - docs-only 提交触发 Vercel 后,只需确认 Vercel status 到 `success`、生产入口未异常切换、关键鉴权 smoke 仍符合预期;不需要因这次 docs-only 再重复 runtime 测试/构建/audit。
   - 标准部署状态检查命令:

     ```bash
     npm run verify:deploy-status -- <commit>
     ```

     该脚本通过 `gh` 查询 GitHub Actions 和 Vercel commit status,再检查生产入口、未登录 `/api/quote?symbols=VIX` 和 `/api/earnings-calendar?symbols=NVDA` 是否仍返回 `401`。脚本只输出短摘要,不要再手写长 `curl` / `gh api` JSON 并粘贴大段结果。

8. **生产验证和交接**
   - 部署完成后验证生产 URL。
   - 默认先跑 `npm run verify:deploy-status -- <commit>`,再按任务补充具体生产 marker。
   - 把线上验证结果写入 `docs/development-log.md`。
   - 最终交接必须说明:
     - 本轮 workflow tier
     - 当前 commit
     - GitHub Actions 状态
     - Vercel 生产状态
     - 已跑过的验证
     - 未解决风险和下一步建议

## Stop Rules

遇到以下情况必须暂停发布,先修正或让用户决策:

- `npm run build` 失败
- `npm test` 失败
- `npm audit` 出现生产依赖高风险漏洞
- 发现真实 token、密钥或敏感 URL 被写入仓库
- `/api/quote` 未登录不再返回 `401`
- 线上行为和 GitHub `main` 不一致
- 需要在 Vercel/腾讯云控制台手改代码才能生效
- 数据库策略不确定,可能造成跨用户读写
- docs-only 过程中发现源码、配置、依赖、测试或生产行为也被改动,必须升级到 runtime 或 sensitive 档并补跑对应验证

## Log Template

复制以下模板追加到 `docs/development-log.md`:

```markdown
### YYYY-MM-DD - <short title>

- Commit: `<hash>` or `same commit`
- Background:
- Workflow tier: `runtime` / `docs-only` / `sensitive`
- Changes:
- Key files:
- Validation:
  - Runtime: `npm test` / `npm run build` / `npm audit --audit-level=moderate` / `git diff --check`
  - Tooling/deploy: `npm run verify:toolchain` / `npm run verify:deploy-status -- <commit>`
  - Docs-only: `npm run verify:docs-consistency` / `git diff --check` / `git diff --stat`
  - Sensitive: runtime checks plus affected API/RLS/security smoke
  - Other checks:
- Deployment:
- Production verification:
- Rollback:
- Follow-up:
```
