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

### 社区召唤的模型输入

`reply` 在服务端构建模型输入时进一步收窄范围，不更改上述 SQL / HTTP 合同。`invocation` 必须来自与 `job.postId` 一致的真实原帖，或按 `job.replyTo.kind + id` 精确匹配的已保存评论；`question` 使用该召唤正文，不使用客户端另传的 prompt。目标缺失、已删除或来源不符时以 `ASSISTANT_SOURCE_CHANGED` 拒绝，不换成其他最新评论作答。

模型的 `comments` 只含这条召唤的直接祖先链，按从旧到新排列，最多七条祖先；同键去重、防循环，缺少父节点即停止，不混入同帖其他讨论。`invocation.author.isAssistant` 和每条祖先的身份只比较真实 `authorId` 与 `context.assistant.authorId`，不信任昵称或传入的同名标记。

点击 Quote 评论的回复入口，与正文写 `@Quote` 一样走真实 API。前端必须将读取到的 `comment.author.isAssistant` 从回复目标传入草稿，再传到保存桥接；重建目标对象时不得丢弃此标记，否则没有显式 `@Quote` 的正文会漏触发。该标记只用于决定发起请求，不能赋予权限：保存评论仍只提交 `kind/id`，数据库以已保存评论的 `reply_to_author_id` 是否等于固定机器人身份作为最终判定。回复目标显示成默认昵称不表示其真实作者 ID 已改变，不能按显示名称判断机器人。

公开回复默认 `publicPosts=[]`、`history=[]`，不注入全站最近帖子或会话回答。现有公开检索工具仍可在用户需要社区讨论背景时使用；个人记忆继续不进入公开回复。普通回复先回答问题，通常以150至300个汉字为目标，复杂问题再展开，不强制追问或套模板；没有图片像素、全网实时搜索和个股新闻工具时，不声称已经看图或核实这些资料。

新生成的面向用户回答要求使用纯文本自然段，不生成 Markdown 标题、加粗或斜体标记，不用双星号或双下划线强调；该约束在每轮 Responses 请求（包括工具续轮）中保留。旧回答由前端兼容显示，不重写历史正文。

本次仅调整模型输入。数据库仍登记提供给服务器的候选资料和历史来源，以维持现有撤回校验；`job.sources` 仍是依赖资料，不代表本轮回答实际引用的文章，不应直接展示成引用清单。模型默认输入收窄不等于已经缩小数据库依赖集合。

### 迁移前后检查

用同一个管理员SQL连接依次执行`artifacts/quote-assistant/preflight.sql`、本迁移、`artifacts/quote-assistant/postflight.sql`。preflight保存连接内临时基线，不创建永久审计表；postflight可重复执行，强制检查8张新增表的RLS/无匿名或authenticated原始权限、16个函数的固定search_path/security definer/执行权限、3个来源撤回trigger、5个显式索引及全部新表约束。输出仅聚合count/opaque fingerprint，不输出用户内容或密钥。

postflight的businessUnchanged应为true。28张原业务表若在迁移间恰有真实用户写入，差异会明确列出，需核对原因后再发布，不能把并发数据变化直接当作迁移破坏或忽略。正式部署后运行`scripts/verify-rls-rest.mjs`，已覆盖全部8张新表与2个用户RPC、service RPC和内部fingerprint helper；RPC仅401/403视为通过，404代表未部署不可当作权限成功。本地PGlite测试实际执行两次迁移与前后检查，并覆盖多用户、自动回复补发、来源精准撤回、自动记忆、限流及循环任务。

## 主动参与公开讨论（2026-11-09，待部署启用）

增量迁移为 `supabase/quote_assistant_proactive_20261109.sql`。默认关闭，只有明确启用后新保存/首次公开的主帖、新评论和回复进入队列；不回扫旧内容，不因编辑或再次公开重复建事件。三个参赛 AI 与创始人均绑定实际 Auth UUID，不根据可更改或冒用的昵称识别。

- 普通用户：问题深浅不限；模型先判断 `reply / skip / wait`。有明确问题、能补关键事实或分析才回复；感谢、表情、重复争论、已有充分回答且无新内容时保持安静。
- 三位指定投资 AI：有投资决策或复盘内容时，用相同证据标准讨论事前依据、仓位风险、执行一致性、结果与运气、验证/失效条件。不能凭身份偏袒、凭一次盈亏下结论，或把自报数据说成已核对账本；不强制五段模板或数字评分。
- 创始人：仅每篇新公开主帖按规则点赞并客观回复一次；其评论/回复仍按价值判断。点赞属于互动规则，不代表分析认可；允许温和幽默，不奉承、不因为身份提高判断置信度。
- 回复继续使用自然段，不输出双星号、固定套话或为了继续对话而强制追问。仅图片内容没有提供像素时不得假装看懂图片，可简短请作者说明想讨论的点。

持久队列在数据库保存事件、租约、参与决定与任务引用，默认等至少60秒后再判断；Vercel受密钥保护的现有cron改为每分钟一次，每轮优先完成一个已有任务，否则最多处理一个参与事件，整轮共用80秒截止。浏览器关闭不影响入队；有积压、额度限制或模型耗时时，实际回复可晚于一分钟，不能承诺精确一分钟内响应。

服务端仓储新增 `repository.proactive(action,payload)`，只通过 service role 调用 `quote_assistant_proactive`，不增加浏览器写入口：

| action | 作用 |
| --- | --- |
| `configure` | `{enabled,founderId,reviewAuthorIds,dailyDecisionLimit?,dailyReplyLimit?,threadReplyLimit?}`；校验真实账号，默认每日200次判断、30次主动回复，每帖最多3次一般主动回复 |
| `state` | 读取已配置的身份、开关、限额、revision及队列聚合状态；不返回用户正文 |
| `claim` | 领取一个已到期事件，返回`event/leaseToken/context`；无任务、延期或已处理保持明确状态 |
| `decision` | `{id,leaseToken,decision,reason,questionKey}`；原子核验公开源、讨论变化、额度、同源/同话题去重；reply创建或复用现有回复job |
| `fail` | `{id,leaseToken,errorCode}`；仅记录安全错误代码，失败不能算成成功跳过 |

先结构化判断，再生成纯文本正文。判断输入只包含真实公开原帖、精确目标、最多40条同帖讨论及最近20条Quote回复；生成阶段普通召唤仍只使用精确祖先链，主动任务额外给最多20条去重公开讨论，避免复述已有答案。个人记忆、未公开账户数据、任意客户端作者标记不能进入公开判断。

同一个来源的主动触发与显式召唤归并到一个任务；语义重复由同帖历史与已记录问题标识辅助判断。Quote本身不能触发自身。领取、决策、完成与发布均保留真实身份、公开可见性、来源指纹、租约和任务幂等约束；关闭主动开关后不继续发布在途主动任务。达到每日次数预算应延后而不是伪装已处理；这是调用次数上限，不是按美元结算的硬限额。拒答、格式错误和网络故障不能算成skip；可重试的超时、限流和暂不可用错误最多尝试3次，最终失败保留错误状态，不得写固定回答。讨论更新可有限次重新判断，仅在同一来源仍公开且内容有效、旧任务未发表、不是用户取消时复用任务；用户取消、删除或转私密的任务不得复活。

部署顺序：先在默认关闭状态应用增量迁移并运行对应前后检；部署新runtime并核验精确提交；最后由service-only配置启用绑定的四个账号。账号配置与生产密钥不硬编码进产品。不得在验证中发布伪造的用户公开帖子，也不得以mock响应宣称真实模型验收通过。

无显式 @ 的直接回复 Quote 仍保留现有保存入口，但生成前先判断是否有新问题或实质信息。感谢/附和通过受有效lease约束的 service `participation-skip` 结束，任务为 `cancelled`、错误码为 `NO_REPLY_NEEDED`；不会发评论，也不记作模型失败。显式 @ 召唤保持原流程。

## 账户资料授权与公开附件（2026-11-09，待部署）

Quote 的产品方向是全站 AI 工具，社区是第一阶段的入口。授权记录、工具白名单、服务端数据范围和任务执行与具体页面分离；未来收益报表、交易、资产或设置页面复用这些能力时，仍需分别声明数据范围与输出可见性。当前仅开放社区 `reply` 和私密 `chat` 的单次分析，不因全站方向而默认获得所有模块权限，也不新增未实现的能力入口。

新增增量迁移 `supabase/quote_assistant_account_access_20261109.sql`，在 foundation 和 proactive 迁移之后应用。已有公开评论中的账户、交易和市场快照直接使用经过公开投影白名单的数据，不需要再次授权私账；不得绕过公开投影去读取主帖的私密附件。模型输入、主动参与判断和来源指纹同步包含这些公开附件，附件修改或删除后不能继续发布旧分析。

账户快照保留 `asOfDate` 与口径，`declineFromYearPeakPp` 是收益率下降的百分点，不是净资产最大回撤率。快照能够支持的判断应先说明；只有实际需要补充数据时才请求授权，不能忽略已提供的数字，又声称完全没有资料。没有完整交易过程或事前理由时不能据此断言亏损原因。

### 授权过程

1. `reply/chat` 的模型可调用 `request_account_access` 请求最小必要范围：`report`、`trades`、`holdings`，并说明原因和日期。工具只创建待确认请求，不能批准授权。没有指定日期默认最近30个自然日，最多366天；用户可缩小范围。
2. “允许”“授权”等自然语言表示授权意向，展示确认卡片；不能仅凭关键词、引用、否定句、模型记忆或其他用户留言开放账户。真正授权由当前用户 JWT 和数据库检查完成，绑定本人、原提问、一次分析任务与来源。
3. 公开频道按钮为“授权并公开分析”，明确所选数据将交给 AI 分析、有关结论和数字会回复到当前公开讨论。必须显式确认公开分析；私聊只产生本人可见的结果，不能复用同一授权公开发布。
4. 授权是一次任务的只读权限，24小时有效，不是长期记忆、全站访问或交易权限。其他人不能代为确认。重复点击复用同一分析任务，不重复生成；撤销、过期、来源删除或转私密时停止读取和发布。

用户 API `access-state` 只返回本人的授权请求；`access-grant` 只接受请求ID、限定 scopes、日期与公开分析确认，不接受目标账号、私账数据、模型或输出目的地；`access-revoke` 撤销本人的请求。服务端 `request-access` 只能在有效任务租约内建立请求。模型输入只带授权状态，私账通过注册的 `read_account_data` 工具在确认权限后按白名单读取，不能执行任意 SQL。

正式数据来自 `pnl_report_snapshots`、`pnl_report_symbol_snapshots` 和 `stock_trades`，不使用浏览器提交的资产数字。收益及持仓需满足正式收盘与重建状态条件；持仓明确是所选区间内某日的历史收盘持仓。交易保留历史持仓录入与实际成交的区别。日期、货币、缺失、重建中和截断范围随结果提供，缺失不得变成0。所有分析保持同等证据标准，区分事实与推断，不因身份、点赞或盈亏结果奉承。

### 发布表单

发布入口使用“发帖”。新帖不再填写心情状态；保留已有记录中的心情和历史显示，编辑老记录不能静默清空。输入 `@` 或 Quote 名称前缀显示小助手候选，选择只插入 `@Quote` 文本；正式保存后仍由已保存来源和服务器身份校验触发，补全动作本身不请求模型或授予账户权限。邮箱、网址、非 Quote 名称以及输入法组字期间不能误触发补全。
