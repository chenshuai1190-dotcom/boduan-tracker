# Development Process

本文件是 `boduan-tracker` 的正式开发流程。交接给任何新工程师或 AI 代理时,必须先阅读并遵守本文。

## Source of Truth

- 代码唯一源头: GitHub 仓库 `chenshuai1190-dotcom/boduan-tracker`
- 生产环境: Vercel `https://boduan-tracker.vercel.app`
- 数据库: Supabase,结构和 RLS 以 `supabase/rls.sql` 及线上 Supabase 项目为准
- 安全基线: `docs/security-hardening.md`
- 更新记录: `docs/development-log.md`

不要把 Vercel 控制台、腾讯云控制台、服务器临时文件或浏览器在线编辑当作代码源头。所有可维护的代码改动都必须回到 GitHub。

## Required Workflow

1. **开始前同步仓库**
   - 从 GitHub 当前 `main` 开始。
   - 运行 `git status --short --branch`,确认工作树状态。
   - 阅读 `README.md`、本文件、`docs/development-log.md` 和与任务相关的代码。

2. **创建明确范围的分支**
   - 常规格式: `codex/<short-task-name>`。
   - 优先通过 PR 合并。
   - 如果 GitHub 权限暂时无法开 PR,只有在用户明确授权后,才允许验证通过后快进 `main`。

3. **本地实现**
   - 小步修改,避免顺手重构无关代码。
   - 不提交真实 `.env`、API token、截图中的密钥或 Supabase service role key。
   - 前端密钥只能使用公开 anon key;付费行情 token 必须只放在服务端环境变量 `EODHD_API_KEY`。

4. **本地验证**
   - 每次可部署改动至少运行:

     ```bash
     npm run build
     npm audit
     git diff --check
     ```

   - 涉及线上行为时,补充目标验证。例如:
     - 登录页和已登录页面 smoke check
     - `/api/quote` 未登录必须返回 `401`
     - 包体积治理必须记录 Vite chunk 输出和首页 preload 状态
     - 数据库/RLS 改动必须说明 Supabase SQL 执行状态

5. **必须更新开发日志**
   - 每次代码、配置、部署、安全或文档改动,都必须在同一个提交中更新 `docs/development-log.md`。
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

7. **Vercel 自动部署**
   - `main` 更新后由 Vercel 自动部署。
   - 不在 Vercel 控制台直接改源码。
   - 环境变量只在 Vercel/Supabase 后台配置,不写进仓库。

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
  - `npm run build`: pass/fail
  - `npm audit`: pass/fail
  - Other checks:
- Deployment:
- Production verification:
- Rollback:
- Follow-up:
```
