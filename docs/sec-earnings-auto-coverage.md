# 自选 SEC 自动覆盖（阶段 2）

状态（2026-09-10）：生产 foundation SQL 已应用，三表和四函数权限聚合核验、RLS REST 检查通过；预算状态内部 forward-fix `v10.7.9.501 / d525407` 已通过最终发布验证，服务端自动覆盖开关已启用。首轮旧 runtime 的预算耗尽误报已修，新 runtime 的一次受保护生产任务 HTTP `200`、`29.17 秒`，正式验收成功；尚未观察自然每日 Cron。本阶段解决自动发现、任务去重和跨实例复用，不宣称所有公司已完整解析；精确生产基准见 `docs/handoff.md`。

## v501 首次启用证据与待完成项

以下保留 v501 的历史验收，不是当前运行时或实时任务计数。v502 已发布四家公司解析修复并升级 `sec-structure-6`；未再次触发任务或改写数据库，精确生产部署见 `docs/handoff.md`。

- 首次启用 runtime：`d52540741311455062bead1b5b44134c91337f24 / v10.7.9.501`；deployment `GkKfCcknxSsrSkm9AV3F9Xor5NTP`；静态入口 `/assets/index-DKetApCk.js`。当时解析版本为 `sec-structure-5`，服务端开关已启用。
- forward-fix 最终 FULL `1666 / 1666` tests PASS，build/docs/whitespace PASS；精确提交单次 `release:verify -- full` PASS（CI + Docs + Vercel）。实际 PGlite `12` 组通过；生产 `sec_earnings_auto_coverage_20260909.sql` 已应用，权限聚合核验和 `npm run verify:rls:rest` PASS；没有交易、收益、比赛或个人金额数据变更。
- `2026-09-10T03:09:52Z`（北京时间 `11:09:52`）首轮旧 runtime 任务 HTTP `503`，原因 `worker-time-budget` 被归入错误；当时聚合回查确认共享表保存了 `complete 5 / partial 11` 份结果。它们是当时结果份数，不是全部自选的成功比例；该状态问题已修，仍保留原失败事实。
- 首轮 jobs 聚合只有 `1` 个 `worker-time-budget` error，其余为 complete/partial/pending/unavailable；租约均已过期，无卡死租约。公开 AAPL 官方财期 `2026-06-27` 抽查得到 `5` 个报告分部，与同文档公司总收入勾稽 PASS，但整体仍是 partial，不等于所有区块完整。
- 内部 forward-fix 不升应用版本或新增 changelog。当前 runtime 的一次受保护生产任务于 `2026-09-10T03:23:35.611Z`（北京 `11:23:35`）HTTP `200`，耗时 `29.17 秒`；日志确认 Production/main、`vercel-cron/1.0`、deployment `dpl_GkKfCcknxSsrSkm9AV3F9Xor5NTP`。未取得的响应计数不填写或推算。
- 最终只读数据库回查以 `2026-09-10T03:20:00Z` 为本轮边界：已记录 `19` 个任务状态，complete `1`、partial `10`、pending `4`、unavailable `4`，本轮新 error `0`；当前共享缓存累计 `29` 份（complete `7`、partial `22`）。写入/刷新记录不是净新增或公司数；首轮历史 error 可能尚未重试，不能将本轮无新 error 写成全表 error 清零。
- 尚未观察自然每日 Cron；上述是受保护主动触发验收，不是自然到时调度证据。可以确认基础链路已启用且单次生产任务成功，不能称所有自选已完整自动覆盖。

本次验收与聚合回查已完成；剩余仅是后续自然触发证据，不为补统计重复生产调用或改写队列。文档证据更新走 DOCS，不重复部署 runtime。

## 行为与数据边界

- 已认证的财报日历请求只把已经发布且日期不晚于纽约当天的公开事件登记到队列。数据库再次核对该用户当前自选，客户端传入别人的代码不会获得其自选信息；重复读取同一事件不唤醒任务或重置退避。
- 调度器从当前 `watchlist` 去重读取股票代码。不读取 shares、cost、账户金额或交易，不改自选表、持仓和任何正式账本。不保存用户 ID、自选成员关系或凭据到共享表。
- 每个代码从 SEC submissions 自动发现最近最多两个独立官方财期。10-Q/10-K/20-F 的申报日只作内部选文锚点，绝不覆盖 EODHD 日历的公告日期。8-K/6-K 不猜季度，需日历已知财期才能尝试。多个候选身份/时间冲突则拒绝猜测。
- 当期结构必须通过现有严格解析器；没有细分、未支持、临时读取失败分别保留状态和原因。已入队不等于已成功。普通全年 10-K 不能变成第四季；非标准自定义轴、缺少可勾稽事实的报告仍可能不可用。TSM 固定已验证的 IR PDF 继续使用既有按需链路，后台 SEC-only 不扩大其 PDF 抓取。
- 结果按代码、官方财期、accession、文档类型和解析版本隔离。发现新申报后，即使新解析失败，同财期旧 accession 也会在成功完成任务事务时过期；历史 payload 保留。租约失败/进程退出时不能宣称该次检查完成，等待后续扫描回收。
- 详情接口优先读取未过期的共享结果，失效/数据库不可用时回到原按需解析；本轮按需请求不直接写共享表，只有持有有效租约的后台完成 RPC 可写。保留原核验时间；HTTP 和浏览器不能把共享缓存重新延长一个完整 TTL。完整定期报告 TTL 6 小时，部分/公告阶段 5 分钟。不向浏览器暴露任务池和别人自选。

## 调度、请求量和限制

`/api/earnings-coverage-schedule` 重写到现有 `/api/earnings-calendar?operation=sec-coverage-schedule`，不增加独立函数、不改 P&L/比赛收盘调度。仅 GET，独立恒定时间比较 `CRON_SECRET`；普通登录或关闭行情鉴权都不能绕过。无开关时返回 disabled、不建连接。

配置每日 UTC 01:00（北京时间 09:00）触发一次。Hobby 的定时触发可能在该小时内发生，并且每个任务最多每日一次；这里不承诺发布后几分钟同步。[Vercel 官方限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)

每次最多 36 个代码、每批 12 个、并发 3、SEC HTTP 最多 100 次；本次 worker 统一间隔至少 250ms 发起请求，SEC-only、拒绝重定向、不额外调用 EODHD。每次发现/单财期解析预算最多 7 秒；40 秒软工作预算，停止开启新解析，给数据库提交留余量，函数上限 60 秒。未开始的任务不逐个耗时提交，90 秒租约到期后可重新领取。

队列按到期时间轮转；池子大、提供方慢或超出请求预算时需要后续轮次，不保证一个日扫覆盖全部。15 分钟/1 小时/6 小时等 next_scan_at 是“最早可领取时间”，不是额外定时器；每日 Cron 仍需等下次触发。后台注入 SEC 白名单包装器，主要复用数据库结果和运行内 URL singleflight，不假定命中原来的进程级 TTL；实际请求数由 aggregate `secRequests` 返回，不估算用户账单。若要求更及时，先明确平台计划与频率，再调整调度，不能悄悄加轮询。

## 分阶段生产启用

1. 获得生产迁移和发布的明确授权。先记录当前部署/HEAD/开关，并做只读聚合 preflight：核对 `watchlist` 的 symbol/user_id 类型、service_role 权限、三个新增表是否已存在且结构匹配，不导出用户自选明细。首次已有同名异构表则停止，不能依赖 `IF NOT EXISTS` 覆盖。
2. 开关保持关闭，应用 `supabase/sec_earnings_auto_coverage_20260909.sql`（单事务、仅新增独立表/RPC/索引，无 backfill/触发器/账本写入）。确认 RLS、PUBLIC/anon/authenticated 无读写或 RPC EXECUTE；service_role 仅 SELECT + 三个受保护写 RPC。
3. 部署已通过 FULL 的代码，开关仍关闭。核对普通 API 未登录 401、调度器错误密钥 401、关闭开关时不处理任何任务。配置合法 `SEC_USER_AGENT`、现有 Supabase 服务端 URL/key、`CRON_SECRET`，不得放进 VITE 或日志。
4. 开启服务端 `SEC_EARNINGS_AUTO_COVERAGE_ENABLED=true` 并确认配置已随部署生效。先执行一次受保护有界任务，检查聚合 claimed/processed/stored/reused/failed/deferred/staleWrites/secRequests，抽样核对公开 SEC 结果来源及官方财期；不将测试 fixture 充当线上真实财报验收。失败或预算中断要反映真实状态。
5. 再确认自动调度日志有实际运行记录，以及新日历事件只登记、不触发同步批量解析。通过后才称“线上已自动覆盖”。应用清单不等于真实运行证据。

回滚：优先关闭开关并部署，恢复原按需路径；停用新增 Cron（保留其他任务）。共享表可保留，无需删除任何记录或回滚账本。不要自动 DROP 表；后续清理另需明确授权。升级解析器时结果和事件按版本隔离、原任务到期再扫描，不批量改写旧结果。

## 本地验证与复跑

定向测试在 `tests/sec-earnings-auto-coverage.test.js`、`sec-watchlist-discovery.test.js`、`sec-earnings-shared-cache.test.js`、`sec-earnings-coverage-integration.test.js`、`sec-earnings-auto-coverage-schema.test.js`。最后运行 `npm run check:full`。

实际 PostgreSQL 验证脚本：`scripts/test-sec-coverage-postgres.mjs`。它只在内存 PGlite 中建测试角色/watchlist，执行原始 SQL；不读取 .env、不连接生产、不发送 SEC 请求。外置安装 `@electric-sql/pglite`，通过 `PGLITE_MODULE_FILE` 指向其绝对路径，再执行脚本。无需修改 package.json/lock。

已验证：PostgreSQL 18.3 / PGlite 0.5.8，12 组测试，包括迁移重放、权限隔离、用户自选过滤、重复注册、租约 CAS/过期、唤醒交错、结果不降级、新申报旧缓存失效、最新失败状态、错误 payload/事务中到期全回滚，以及现有 GOOGL HTML 夹具 → 真实解析器 → worker 序列化 → SQL RPC → repository 查询 → selector 的完整链路。PGlite 是单连接，确定性交错不是多连接压力测试；不是生产 PostgREST、真实自选集合或实时 SEC 验收。
