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
   - 先读 `docs/handoff.md`,再阅读 `README.md`、本文件、`docs/development-log.md` 和与任务相关的代码。

2. **创建明确范围的分支**
   - 常规格式: `codex/<short-task-name>`。
   - 优先通过 PR 合并。
   - 如果 GitHub 权限暂时无法开 PR,只有在用户明确授权后,才允许验证通过后快进 `main`。

3. **本地实现**
   - 小步修改,避免顺手重构无关代码。
   - 不提交真实 `.env`、API token、截图中的密钥或 Supabase service role key。
   - 前端密钥只能使用公开 anon key;付费行情 token 必须只放在服务端环境变量 `EODHD_API_KEY`。
   - 所有用户主动提交类操作(新增、保存、删除、同步、导入、导出等)必须在请求期间禁用重复提交,并在完成后给出明确成功或失败反馈;不能静默完成后让用户猜结果。
   - 除非确实没有可维护替代方案,不要使用浏览器或系统原生交互控件承载核心体验,尤其不要使用 `alert`、`confirm`、`prompt`、浏览器原生表单校验弹窗或未定制的原生选择器。提示、确认、选择、编辑、筛选等产品交互默认用应用内自定义弹窗、抽屉、菜单、toast 或受控组件实现,并按当前深色设计系统适配移动端。
   - 修改 UI 或功能时,凡是涉及用户可见系统文案,必须同步简体中文和 English 两套显示:更新 `src/lib/i18n.js` 的对应 key、组件里的 fallback 文案、空状态/按钮/弹窗/错误提示/设置页更新日志文案,并补充测试或 build marker 证明中英文都进包。只翻译系统文案,用户自己写的目标箴言、心得、复盘、备注、日志、账户名等内容必须保持原文。
   - 交易页工具账本必须保持边界清晰:正式交易/当日订单/持仓只能写 `stock_trades`;波段记录只写旧账本 `trades`;摊薄成本只写 `cost_basis_trades`。如果复用弹窗或保存函数,必须用显式 scope 分流,并在提交确认文案里说明写入范围。波段记录和摊薄成本这类独立小工具提交前必须弹确认框并加提交锁,防止重复提交或串入主账本。
   - 移动端弹层里的 `date`、`number`、`text` 等原生输入控件必须显式限制 `w-full max-w-full min-w-0 box-border`;日期框还应使用 `appearance-none`/`WebkitAppearance: 'none'` 或等效约束,避免 iOS/Safari 原生日期控件按自身最小宽度把底部抽屉撑出屏幕。涉及输入框布局时必须按 390px 左右移动端宽度核对不溢出。
   - 添加/修改/删除/确认类弹窗打开后必须锁定背景页面滚动;移动端不能允许遮罩背后的页面跟随手势移动。优先使用记录 `scrollY` + `body { position: fixed; overflow: hidden; width: 100%; top: -scrollY }` 的方式,关闭弹窗后恢复原位置。表单类弹窗默认居中自适应,不要无故贴底。
   - 视觉字重默认使用正常字重;除页面标题、重要模块标题和确有层级需要的标题外,普通文本、股票代码、数字、按钮、列表行和订单记录不要使用 `font-bold`、`font-semibold`、`font-black` 或等效加粗样式。

4. **本地验证**
   - 每次可部署改动至少运行:

     ```bash
     npm test
     npm run build
     npm audit
     git diff --check
     ```

   - 涉及线上行为时,补充目标验证。例如:
     - 登录页和已登录页面 smoke check
     - `/api/quote` 未登录必须返回 `401`
     - 安全边界改动必须有对应 `npm test` 覆盖
     - 包体积治理必须记录 Vite chunk 输出和首页 preload 状态
     - 数据库/RLS 改动必须说明 Supabase SQL 执行状态
     - RLS 外部暴露复核可运行 `npm run verify:rls:rest`

5. **必须更新开发日志**
   - 每次代码、配置、部署、安全或文档改动,都必须在同一个提交中更新 `docs/development-log.md`。
   - 每次改进收尾时,必须同步核对所有记录面,避免版本、commit、部署、验证和线上状态互相不一致。至少检查 `docs/development-log.md`、`docs/handoff.md`、`README.md`、`docs/security-hardening.md`、`docs/architecture-security-audit.md` 和设置页更新日志/版本号;若某个文件不需要改,在日志或交接说明中明确原因。
   - `docs/handoff.md` 在以下任一情况必须同步更新:当前 `main`/关键 commit/部署状态/线上验证变化,设置页版本变化,产品规则或用户可见流程变化,安全边界/环境变量/Supabase/Vercel 配置变化,代码地图或主要风险变化,下一步优先级或可转发交接话术变化。
   - 用户可见更新必须同时更新设置页更新日志和版本号;产品状态、部署状态、安全基线或交接规则变化,必须同步更新对应文档,不能只改其中一个记录文件。
   - 日志必须包含:
     - 日期和时区
     - 背景/问题
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
   - 如果 `git push origin main` 走 HTTPS 时报 `could not read Username for 'https://github.com': Device not configured`,不要误判为仓库无权限;本机该项目已有 SSH key `~/.ssh/boduan_tracker_github`,应使用:

     ```bash
     GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes" git push git@github.com:chenshuai1190-dotcom/boduan-tracker.git main
     ```

   - 推送后如本地 `origin/main` 仍未刷新,用同一个 SSH key fetch: `GIT_SSH_COMMAND="ssh -i ~/.ssh/boduan_tracker_github -o IdentitiesOnly=yes" git fetch git@github.com:chenshuai1190-dotcom/boduan-tracker.git main:refs/remotes/origin/main`。

7. **Vercel 自动部署**
   - `main` 更新后由 Vercel 自动部署。
   - 这是每次完成可部署改动后的默认收尾动作;不能停在“已实现但未部署”状态。
   - 不在 Vercel 控制台直接改源码。
   - 环境变量只在 Vercel/Supabase 后台配置,不写进仓库。
   - 如果 GitHub、CI、Vercel 或权限问题导致无法部署,必须在最终交接中明确说明阻塞原因和当前 commit。

8. **生产验证和交接**
   - 部署完成后验证生产 URL。
   - 把线上验证结果写入 `docs/development-log.md`。
   - 最终交接必须说明:
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

## Log Template

复制以下模板追加到 `docs/development-log.md`:

```markdown
### YYYY-MM-DD - <short title>

- Commit: `<hash>` or `same commit`
- Background:
- Changes:
- Key files:
- Validation:
  - `npm test`: pass/fail
  - `npm run build`: pass/fail
  - `npm audit`: pass/fail
  - Other checks:
- Deployment:
- Production verification:
- Rollback:
- Follow-up:
```
