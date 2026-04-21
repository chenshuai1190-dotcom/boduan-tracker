# 🎯 Bottomline · 项目交接文档

> **给下一个 Claude (或工程师) 的全套背景资料**  
> 阅读这份文档 → 立刻进入状态, 接手开发  
> 最后更新: 2026-04-22 by chenshuai1190 + Claude

---

## 📌 立刻要知道的 (TL;DR)

```
Bottomline 是一个个人理财 PWA
波段交易追踪 + 资产管理 + 长期投资规划

技术栈:
  React + Vite + Tailwind  (前端)
  Vercel                   (部署)
  Supabase (Singapore)     (云端数据库)
  EODHD All World Extended (实时行情, $29.99/月, 含 WebSocket)

当前线上版本: v10.7.8.6
GitHub: https://github.com/chenshuai1190-dotcom/boduan-tracker
线上: https://boduan-tracker.vercel.app
Supabase: https://ykgotnmtqcqdzqtrlayq.supabase.co
```

---

## 👤 用户画像

```
chenshuai1190 (用户)
  - 中国用户, 主要使用普通话
  - Q友乐园 创始人 (网站社区背景)
  - 没有编程背景, 但有强烈产品直觉
  - 用长桥券商 (港美股)
  - 持仓: TQQQ / NVDA / TSM / GOOGL / META / MSFT
  - 投资目标: $2.4M → $14.86M (10 年, 年化 20%)
  - 家庭账户: "我" + "老婆"
```

### 沟通偏好

```
✓ 简洁直接, 不要过度解释
✓ 用 ask_user_input_v0 给可点选项 (手机不方便打字)
✓ 重要决策先出 HTML 预览, 不要直接写代码
✓ 表情符号点缀 (不要堆砌)
✓ 用列表 + 短句, 不要长段落
✓ 中英文混排可以 (技术词留英文)

✗ 不要 emojis 滥用
✗ 不要长篇大论
✗ 不要建议时反复确认
✗ 不要让用户判断技术细节
```

---

## 🏗️ 项目架构

### 目录结构

```
/home/claude/tqqq-app/          (本地开发路径)
├── src/
│   ├── App.jsx                 (~6500 行, 全部业务逻辑)
│   ├── Login.jsx               (登录/注册/忘记密码)
│   └── lib/
│       ├── db.js               (~740 行, 所有 Supabase 操作)
│       └── supabase.js         (Supabase 客户端 + 认证函数)
├── api/
│   └── quote.js                (~400 行, Vercel API 代理 EODHD)
├── public/
│   ├── manifest.json           (PWA)
│   └── favicon.svg             (V5 K线柱图标)
└── index.html
```

### 数据流

```
用户操作
   ↓
React state (本地)
   ↓ (防抖 500ms)
db.js 函数
   ↓
Supabase REST API
   ↓
PostgreSQL (云端)

读取相反流程, 启动时一次性 fetchAllUserData
```

---

## 🗂️ Supabase 数据库 (11 张表)

```
所有表都遵守"数据架构宪法 v1.0":
  1. 每个模块独立表
  2. 所有 SELECT 必须 .eq('user_id', user.id)
  3. 所有 INSERT/UPSERT 必须包含 user_id
  4. UNIQUE 约束在数据库层
  5. 原子操作 - 永远不要"先删后插"
  6. RLS 关闭 (信任前端 + user_id 隔离)

表清单:
  trades              交易记录
  watchlist           关注股票
  wave_notes          波段备注
  user_settings       用户设置 (FGI/VIX/汇率等)
  accounts            家庭账户 (我/老婆)
  balance_snapshots   月度余额快照
  investment_plan     投资计划 (北极星目标 1486 万)
  margin_status       融资杠杆状态
  disciplines         投资戒律
  review_logs         月度复盘日志
  yearly_actuals      年度实际数据
```

---

## 🔑 关键密钥 / 链接

```
EODHD API Token: 69e5ce0b670248.02951638
EODHD 套餐: All World Extended ($29.99/月, 含 WebSocket)

Vercel 环境变量:
  EODHD_API_KEY = 69e5ce0b670248.02951638  (服务端用)
  VITE_EODHD_TOKEN = 69e5ce0b670248.02951638  (前端 WebSocket 用)

环境变量管理:
  https://vercel.com/chenshuai1190s-projects/boduan-tracker/settings/environment-variables

Supabase Dashboard:
  https://supabase.com/dashboard/project/ykgotnmtqcqdzqtrlayq

⚠️ Token 安全:
  EODHD_API_KEY 在服务端安全 (api/quote.js)
  VITE_EODHD_TOKEN 暴露在浏览器 (WebSocket 用, 只是个人使用 OK)
  正式上线前需中转 (Supabase Edge Function)
```

---

## 🎨 设计系统

### 主题色

```
品牌色: 黑金 (#0a0a0a + #fbbf24)

涨跌:
  涨 = 红色 #dc2626 / rose-600  (中国股市习惯)
  跌 = 绿色 #16a34a / emerald-600

主操作按钮 (V3 金色描边):
  background: #fff
  color: #d97706
  border: 2px solid #fbbf24

头部 (3 个 tab 统一):
  background: linear-gradient(135deg, #0a0a0a 0%, #171717 100%)
  + 金色 radial-gradient 光晕
  + 1px solid rgba(251, 191, 36, 0.2) 边框

复利卡: 烈焰红金
本年大卡: 夕阳粉金 (#fdf2f8 + #db2777)
WebSocket BETA 卡: 金绿色 (#0a0a0a + #4ade80)
```

### 字体

```
数字: ui-monospace, monospace + tabular-nums
品牌: font-black (900)
标题: font-bold
正文: font-medium
```

---

## 📱 5 个底部 Tab

```
1. 首页 (home)        SPY/QQQ ETF + VIX + FGI + 关注列表
2. 交易 (trades)      波段记录 + 全部交易弹窗
3. 资产 (analysis)    家庭账户 + 月度走势图
4. 目标 (review)      复利计划 + 杠杆 + 年度进度 + 戒律 + 复盘日志
5. 设置 (settings)    数据状态 + WebSocket BETA + 重置 + 更新日志 + 关于
```

---

## 🧠 核心业务逻辑

### 1. 复利计划 (北极星目标)

```javascript
PLAN = {
  startCapital: 2_400_000,         // 起始本金 USD
  targetAnnualRate: 0.20,          // 年化 20%
  totalYears: 10,                  // 10 年
  // 终点: 2.4M × (1.2)^10 = $14.86M
}

每年:
  startBalance = 上年 endBalance     // 动态起点
  planTarget   = startBalance × 0.20 // 柔性目标
  actualGain   = 用户填写
  endBalance   = startBalance + actualGain

北极星目标 (硬目标, 永不变):
  ageGoalAmount = 2.4M × 1.2^10 = $14.86M
```

### 2. 波段切分

```javascript
按股票分组 → 按日期排序
累计买入股数 == 累计卖出股数 → 波段结束
波段 id: `wave-${symbol}-${startDate}` (基于日期, 稳定)

关键修复 (v10.7.7.3):
  之前 id = `wave-${symbol}-${firstTradeId}`
  删除首笔交易 → id 变 → 展开状态/备注丢失
  → 改成基于日期, 稳定
```

### 3. 智能刷新

```javascript
盘中 (ET 9:30-16:00):  10 秒一次
盘前/盘后:              30 秒一次
休市:                   5 分钟一次
visibilitychange:       页面隐藏暂停, 显示立即拉一次

实现: setTimeout 递归 + 动态计算下次间隔
```

### 4. WebSocket 实时 (v10.7.8 BETA)

```javascript
连接: wss://ws.eodhistoricaldata.com/ws/us?api_token=XXX
订阅: 所有 watchlist symbols
延迟: < 50ms
消息格式: { s: 'AAPL', p: 150.25, t: 1234567890 }

走势图同步策略 (1 分钟桶):
  同分钟内: 覆盖最后一个点 (避免数组爆炸)
  新分钟:   追加新点
  自动按 ET 时间标记 session (pre/regular/post)
```

### 5. 数据安全 (v10.7.7.4)

```javascript
原则: 云端拉取失败时, 绝不覆盖本地

db.js fetchAllUserData:
  失败返回 null (不是 [])
  返回 _failedTables 清单

App.jsx setState:
  if (cloudX !== null) setX(cloudX)
  else 保留本地

UI:
  顶部金色警告横幅 + "🔄 重试"按钮
  resetAll 二次确认 (要输入"确认清空")
```

### 6. 年度进度计算 (v10.7.8.3)

```javascript
之前: yearProgressPct = currentMonth / 12 × 100  (基于时间, 误导)
现在: yearProgressPct = actualGain / planTarget × 100  (基于实际收益)

例: 目标 +20% 实际 +12% → 60%
上限 150% (超额完成)
未填: 0% + 文案 "尚未填收益"
```

---

## 🔧 工作流程 (重要)

### DESIGN FIRST, CODE LATER

```
用户提需求
   ↓
Claude 出 HTML 预览 (多方案对比)
   ↓
用户用 ask_user_input_v0 选方案
   ↓
Claude 写代码
   ↓
打包 .zip.zip 给用户
   ↓
用户部署 (GitHub edit 链接)
```

### 每次改动必更新 3 处

```
1. App.jsx 底部注释
   // 📅 最后修改时间: YYYY-MM-DD HH:MM:SS (UTC+8)
   // 📝 本次更新: vX.X.X - 标题
   // (详细说明)

2. changelog 数组 (顶部加新条目)
   { ver: 'vX.X.X', date: '...', latest: true, items: [...] }
   (上一条把 latest: true 删掉)

3. "关于"卡版本号
   <div>📊 版本:vX.X.X</div>

4. 顶部徽章 (changelog 卡)
   v10.7.8.6  (这个文字也要改)
```

### 打包命令

```bash
rm -rf /tmp/vX.X.X && mkdir -p /tmp/vX.X.X/src
cp /home/claude/tqqq-app/src/App.jsx /tmp/vX.X.X/src/App.jsx
cd /tmp/vX.X.X && zip -r /mnt/user-data/outputs/bottomline-vX.X.X.zip.zip src 部署说明.txt
```

注意: **双 .zip.zip 扩展名** (历史习惯, 不要改)

### 验证脚本 (每次必跑)

```bash
node -e "
const c = require('fs').readFileSync('/home/claude/tqqq-app/src/App.jsx', 'utf8');
// 括号匹配检查 (忽略字符串/注释)
// ...
"
```

### 部署链接 (告诉用户)

```
GitHub edit:
  https://github.com/chenshuai1190-dotcom/boduan-tracker/edit/main/src/App.jsx
  https://github.com/chenshuai1190-dotcom/boduan-tracker/edit/main/api/quote.js
  https://github.com/chenshuai1190-dotcom/boduan-tracker/edit/main/src/lib/db.js

操作: Ctrl+A → Delete → 粘贴 → Commit changes → 等 Vercel 1-2 min → Ctrl+Shift+R 硬刷
```

---

## 📜 完整版本历史

```
v10.7.8.6   复盘改名"目标" + 更新日志折叠           ← 当前
v10.7.8.5   首页指数改 SPY/QQQ ETF + 删假按钮
v10.7.8.3   年度进度改"实际收益完成度" + 按钮配色
v10.7.8.1   WebSocket 走势图实时同步
v10.7.8     WebSocket 实时推送 BETA
v10.7.7.4   数据安全加固
v10.7.7.3   波段 bug 修复 + 全部交易弹窗
v10.7.7.2   走势图入场动画 + 空月断线
v10.7.7     设置页全部黑金统一
v10.7.6     设置页改版 (智能刷新指标 + 更新日志卡)
v10.7.5     修复密码重置直接登录 bug
v10.7.4     忘记密码功能 + 登录页黑金
v10.7.3     品牌图标 (V5 K 线) + 改名 Bottomline
v10.7.2     资产录入按人 Tab
v10.7.1     智能刷新
v10.7.0     我的关注 Robinhood 风
v10.6.9     HKD 汇率 bug
v10.6.8     全黑流动金线开屏 V4-B
v10.6.7     大 B 字母品牌
v10.6.6     头部统一黑金
v10.6.5     52 周高拆股 bug
v10.6.4     交易 tab V3.2 重做
v10.6.0-3   年度表升级
v10.5.x     复利计划 + 杠杆 + 戒律
v10.x       Supabase 云端 + 账户独立
v1.0        第一版 TQQQ 波段追踪器 🎂
```

---

## 🚧 已知限制 / 待办

### 立刻可以做的小改进

```
- usdRate / hkdRate 还没云端持久化 (在 user_settings 表里加字段)
- 没有 csv 导出功能
- 没有股票分组 (核心仓 / 杠杆 / 关注)
- 没有隐私模式 (一键模糊金额)
```

### 中期改进

```
- WebSocket 中转 (Supabase Edge Function)
  原因: 当前 token 暴露在浏览器
  方案: Edge Function 中转 + 用户认证
  工期: 2-3 小时

- 历史事件标注 (COVID / AI 浪潮 / 关税恐慌)
  在年度走势图上画时间标记

- 价格预警 (绑定戒律)
  比如 "VIX > 30 提醒我" + 触发后弹推送
```

### 长期想做的

```
- BTC / 加密货币支持 (EODHD crypto endpoint 不同)
- 期权追踪
- 自动导入交易 (CSV / 邮件 / OCR)
```

### 不要做的

```
- 道琼斯指数 (用户已决定 2026-04-20 删除, DIA 没意义)
- 完全实时的指数 (EODHD 真指数 GSPC.INDX 有 15 分钟延迟,
  改用 SPY/QQQ ETF 解决了, 不要回去用 INDX)
- 添加复杂的图表库 (recharts/d3 都不要, 自己写 SVG)
```

---

## ⚠️ 容易踩的坑

```
1. setState 直接传空数组
   错: setTrades(cloudTrades || [])
   对: if (cloudTrades !== null) setTrades(cloudTrades)
   原因: 云端故障时 [] 会清空本地数据

2. 波段 id 用交易 id
   错: `wave-${symbol}-${firstTrade.id}`
   对: `wave-${symbol}-${firstTrade.date}`
   原因: 删除首笔交易 → id 变 → 展开/备注丢失

3. EODHD 真指数延迟
   错: GSPC.INDX (15 分钟延迟)
   对: SPY.US (真实时)

4. WebSocket 走势图不同步
   要点: 1 分钟桶合并 (同分钟覆盖, 新分钟追加)
   不能: 每个 tick 都 push (数组爆炸)

5. 月度余额走势图空月
   错: (v || chartMin) (会把 0 拉到底部连成假线)
   对: filter(p => p.v > 0) 只画有效月

6. 中文涨跌色
   红 = 涨 (rose-600)  ← 中国股市习惯, 别搞反!
   绿 = 跌 (emerald-600)

7. 防抖保存
   设置/状态变化用 useEffect + 500ms 防抖
   单条操作直接调 db.xxx (不要等防抖)
```

---

## 🎁 用户偏好备忘

```
✓ 喜欢黑金主题 (高级感)
✓ 喜欢"低调"胜过"花哨" (V3 描边 > V1 渐变)
✓ 数据安全焦虑 (要求多次确认 + 警告)
✓ 期望"养成更新设置日志的习惯" (Claude 必须主动更新 changelog)
✓ 偏好 1 次部署完所有改动 (不喜欢分多个 commit)
✗ 不喜欢蓝色按钮 (蓝色不在主题色系)
✗ 不喜欢"假按钮" (无功能的装饰)
✗ 不喜欢被询问技术细节 (要给方案 ABCD)

工作时段: 主要在中国时间晚上
工作风格: 长对话 (单次几十轮), 一次推进多个改动
情绪管理: 累了会说"今天累了 不改了"  ← 要尊重, 别再 push
```

---

## 🚀 新对话怎么开始

```
1. 用户告诉你: "看一下 boduan-tracker 仓库的 CONTEXT.md"

2. 你 web_fetch 这个文档:
   https://github.com/chenshuai1190-dotcom/boduan-tracker/blob/main/CONTEXT.md

3. 读完后回应:
   "✓ 看完了. 我现在了解 Bottomline 的全部:
    - 最新 v10.7.8.6
    - 黑金主题 + 波段追踪 + 长期目标
    - 你的偏好和工作流
    
    今天想做什么?"

4. 如果用户的需求涉及代码:
   先 git clone 或者 web_fetch 关键文件
   或者让用户上传 App.jsx 当前版本

5. 严格按照 "DESIGN FIRST, CODE LATER" 流程
```

---

## 💎 最后

```
这个 App 不是 "完美的产品"
是 chenshuai1190 + Claude 一步步打磨出来的
每个版本都有故事, 每个细节都有偏好

下一个 Claude:
  尊重用户的判断 (他不是工程师但有产品直觉)
  保护数据安全 (这是真金白银)
  保持简洁 (不要为了炫技添功能)
  随时翻 CONTEXT.md

愿这个 App 帮 chenshuai1190 实现 14.86M 目标 💪
```

---

**最后更新**: 2026-04-22  
**当前版本**: v10.7.8.6  
**作者**: chenshuai1190 (产品 + 决策) + Claude (实现 + 建议)
