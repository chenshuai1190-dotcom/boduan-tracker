# Quote 小助手 API / 数据库合同

此文描述本批新增合同；数据库迁移为 `supabase/quote_assistant_foundation_20261108.sql`。先应用迁移，再部署使用方。生产核验脚本为 `supabase/verification/quote_assistant_preflight.sql` 和 `quote_assistant_postflight.sql`，在同一 SQL 连接中按前检 → foundation → 后检执行。现有私有账本、时间线及评论权限不放宽。

## 角色与范围

- 固定 Quote 身份由服务端创建真实 Auth 用户，再调用 service `configure` 绑定；不得按 nickname 判断官方身份。
- 公开任务 kind：`reply`, `daily-review`, `followup`, `weekly-digest`, `milestone`。另有 `chat` 私密连续对话，禁止发布。
- 所有用户调用强制 `auth.uid() = p_expected_user_id`。所有 service 调用仅授予 `service_role`，前端不可执行。
- 新任务/记忆默认不复制全站资料。公开任务不读取个人记忆；chat 可使用本人启用后由模型提取、或本人补充的记忆。所有会话按 owner + sessionId + kind + postId 隔离。
- reply 的自动发布允许本人真实已保存且含 `@Quote` 的原帖/评论，或真人直接回复 Quote 的评论；工作台生成默认草稿。followup 仅允许预约本人公开原帖，dueAt 到期后自动回复该帖。
- milestone 只选择本人已有、结构有效的 timelineEvent 容器；此容器仅有事件引用，不能声称它附带了当前金额。客户端金额永不作为模型事实。没有容器诚实显示空态。

## 两个 RPC

用户 JWT：

```js
rpc('quote_assistant_user', {p_action, p_payload: {}, p_expected_user_id: userId})
```

| action | payload | return |
| --- | --- | --- |
| `state` | `{}` | `{assistant,memories,jobs,posts,milestones,memoryEnabled,subscriptions}` |
| `create` | `{id,kind,prompt,sessionId?,postId?,replyTo?:{kind,id},dueAt?,date?,rangeStart?,rangeEnd?,autoPublish?,shareConfirmed?,recurrence?}` | Job |
| `retry` | `{id,revision}` | Job（失败任务重置，最多3次领取） |
| `cancel` | `{id,revision}` | Job（同时撤下已发布派生内容） |
| `save-memory` | `{id,text,revision}`，新建revision=0 | Memory |
| `memory-preferences` | `{enabled:boolean}` | `{enabled,memoryEpoch}` |
| `cancel-subscription` | `{id,revision}` | `{id,active:false,revision}` |
| `delete-memory` | `{id,revision}` | `{deleted:true,id}` |

所有 id/sessionId 都是 UUID。`id` 是请求幂等键；同 id 同合法参数返回既有任务，跨用户及不同内容拒绝。`date` 为 YYYY-MM-DD；weekly rangeStart/rangeEnd 含首尾且最多31天。dueAt 必须是未来、最长一年。job 每用户 UTC 日上限30，pending/running合计上限20，followup每人活跃上限10；memory最多50条、每条1000字。限额在owner事务级advisory lock内检查；retry也受20个活跃任务限制。未绑定真实Bot身份时仅允许chat，公开功能返回55000。

服务端 service-role：

```js
rpc('quote_assistant_service', {p_action, p_payload: {}})
```

| action | payload | return |
| --- | --- | --- |
| `identity` | `{}` | `{authorId}` 或 null |
| `configure` | `{authorId}` | `{authorId}`（只能首次绑定或相同ID重试；真实Auth用户须已存在） |
| `claim` | `{id}` | `{job,leaseToken}`；未到期、运行中有效lease、已完成则 `{job,leaseToken:null}` |
| `context` | `{id,leaseToken}` | `{job,assistant,memories,history,post,comments,publicPosts,milestone}` |
| `apply-memories` | `{id,leaseToken,memoryEpoch,upserts:[{id,text,revision}],deletes:[{id,revision}]}` | `{applied,memoryEpoch?,reason?}`；仅活跃chat、启用记忆且epoch一致；最多5项 |
| `complete` | `{id,leaseToken,text,marketDate?,nextDueAt?}` | Job；有效生成转draft，原子核验来源，长度1..12000 |
| `fail` | `{id,leaseToken,errorCode}` | Job；存安全错误代码，正文不存到error |
| `publish` | `{id,ownerId,revision}` | Job；锁源帖/核验来源后原子生成 Quote 普通帖或评论；对已经published的相同owner重试返回原结果 |
| `due` | `{limit?:1..20}` | `{jobs:[Job]}`，返回到期pending或过期lease running（attempts<3），以及待补发的autoPublish draft |

领取：新lease为随机UUID，有效180秒，最多3次；旧token不可覆盖结果。context仅接受活跃lease。生成服务应在complete后依据 `job.autoPublish` 再调用publish；失败不返回伪造的成功。定时worker读取due、逐个claim，再走同一pipeline。

自动回复生成完成但发布网络失败时，due继续返回draft，claim不给新lease，服务端只幂等重试publish，禁止重新生成。取消或来源撤回的任务不会进入补发队列。

## 返回结构

```js
Memory = {id,text,revision,createdAt,updatedAt}
Job = {
 id,kind,status,prompt,sessionId,subscriptionId,recurrence,postId,replyTo,dueAt,date,rangeStart,rangeEnd,
 text,sources,revision,createdAt,updatedAt,errorCode,autoPublish,
 postRef: null | {postId,commentId:null|string}, canPublish
}
// status: pending | running | draft | published | failed | cancelled
Source = {postId,title,date,scope:'public'|'milestone'}
Post = {id,text,date,publishedAt,authorId,author:{nickname},stocks,market}
Milestone = {postId,title,date,event:{version,id,kind,metric,date,title}}
assistant = null | {authorId,nickname:'Quote',isAssistant:true}
```

state 返回本人最近50任务/50记忆、最近30公开文章（按真实published_at排序）、本人最多30时间线引用。不返回其他人的任务/记忆。service返回的Job额外有ownerId。context有memoryEnabled/memoryEpoch；history最多10条已完成同会话交互 `{prompt,text}`；公开kind的memories恒为空。publicPosts 为只读有界搜索材料；weekly按真实published_at选区间最多50篇，其他场景最多20篇，保留当前已公开、可引用的文案。

context会将实际提供的公开来源与指定milestone引用登记到内部sources表，并保存内容指纹；complete和publish都重新核验。公开源撤回/删除/正文变化、已引用评论更改/删除、或timeline引用改变时，待发任务取消，已生成文字清空，已发布派生内容撤下；再次公开不复活旧任务。新增评论、编辑未引用评论不会撤回既有回答；作者评论与社区评论均按comment_sources精确核验。

## 发布与身份

普通AI文章写 `review_logs` 的真实源记录，`review_data.visibility='public'`、`operationId=job.id`，不带timelineEvent；原trigger生成公开投影、新帖提醒。reply/followup 写 `review_community_evaluations` 并设置真实 replyTo，现有deferred通知负责收件人、去重和撤回；AI回复无评分和标签。

服务端保护的 `quote_assistant_identity` 是作者识别依据，提供 `quote_assistant_author_id()` 只读RPC供客户端读取固定UUID（登录后）。普通用户不能改Bot身份。前端对该可信UUID展示狐狸与小助手标识；不可按可伪造nickname或payload判断。

## 本地与发布

本地示例adapter不得调用生产写入；必须明确“示例数据”，实际API未配置或报错不能回退固定答案冒充AI。涉及API、RLS、service role和schema，执行FULL、多用户PGlite、匿名REST与生产迁移前后检查。API key只保留服务端环境。

### 自动记忆与循环草稿

模型自动记忆抽取只输入本轮新prompt和当前有效memory，不能把完整历史再次拿去提取，否则用户删除的偏好可能从旧对话复活。service apply-memories只绑定任务owner；用户修改/删除/暂停会提升memoryEpoch，旧在途结果返回MEMORY_CHANGED而不写入。公开job禁止apply；暂停后chat不注入memory且不学习。用户仍能查看、纠正、删除。

recurrence仅允许daily-review→daily、weekly-digest→weekly，显式开启、每人最多5个活跃订阅。首次dueAt可省略立即生成；有dueAt必须未来。完成后同一事务幂等创建下一次pending，后台生成草稿而不公开；失败保留failed供重试，不自动循环重发。state.subscriptions含{id,kind,recurrence,dueAt,active,revision}。cancel-subscription停止后续pending/running，保留已完成草稿。

循环daily的complete必须带服务端核验marketDate（最近8天已完成交易日）及nextDueAt（未来8天内下个交易日执行时刻），任务date同步实际marketDate，数据库按nextDueAt排下一次。非循环daily传marketDate时必须与选择日期一致。reply的context确保包含精确replyTo及最多8层祖先，再填充最近评论，总计最多40条，附nickname并登记源指纹。

### 迁移前后检查

用同一个管理员SQL连接依次执行`artifacts/quote-assistant/preflight.sql`、本迁移、`artifacts/quote-assistant/postflight.sql`。preflight保存连接内临时基线，不创建永久审计表；postflight可重复执行，强制检查8张新增表的RLS/无匿名或authenticated原始权限、16个函数的固定search_path/security definer/执行权限、3个来源撤回trigger、5个显式索引及全部新表约束。输出仅聚合count/opaque fingerprint，不输出用户内容或密钥。

postflight的businessUnchanged应为true。28张原业务表若在迁移间恰有真实用户写入，差异会明确列出，需核对原因后再发布，不能把并发数据变化直接当作迁移破坏或忽略。正式部署后运行`scripts/verify-rls-rest.mjs`，已覆盖全部8张新表与2个用户RPC、service RPC和内部fingerprint helper；RPC仅401/403视为通过，404代表未部署不可当作权限成功。本地PGlite测试实际执行两次迁移与前后检查，并覆盖多用户、自动回复补发、来源精准撤回、自动记忆、限流及循环任务。
