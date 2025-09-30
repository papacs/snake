# Snake 实时对战平台

Snake 是一个基于 Next.js 与 Socket.IO 的多人实时贪吃蛇游戏，支持房间匹配、道具效果和成绩榜持久化，适合演示前后端协同和实时通信能力。

## 核心功能
- 房间管理：创建或加入六位数房间号，房主可同步开始游戏。
- 实时同步：Socket.IO 推送蛇身位置、食物刷新与道具效果。
- 排行榜：通过 Postgres 记录玩家分数，并提供 `/api/scores` 查询接口。
- 一键建表：访问 `/api/initdb` 自动创建 `game_rooms`、`players` 与 `player_score` 表。

## 食物趣味图鉴
| 编号 | 名称 | 效果亮点 | 趣味提示 |
| --- | --- | --- | --- |
| 1 | 普通食物 | +10 分并增长身体 | 经典脆皮口味，放心猛吃就是了 |
| 2 | 冰冻果实 | 冻结 3 秒无法动弹 | 牙齿打颤时不妨规划下一步走位 |
| 3 | 加速辣椒 | 5 秒疾速冲刺 | 控制得好就是神操作，失手便是原地离谱 |
| 4 | 缩小蘑菇 | 立即缩短最多 3 节 | 减重版“轻功水上飘”，危急时刻救你一命 |
| 5 | 彩虹糖果 | 随机触发多种效果 | 惊喜与惊吓并存，抽到什么全凭欧气 |
| 6 | 传送门 | 传送至随机安全区 | 小心忽然抵达对手蛇窝，落地先观察 |
| 8 | 穿墙能力 | 激活 6 秒穿墙 | 来去如风的特工，别忘了计时条在滴答 |
| 9 | 无敌状态 | 5 秒免疫碰撞 | 勇往直前但也别忘了收分目标 |
| X | 磁铁 | 8 秒吸附附近食物 | 口渴的吸尘器，记得靠近食物扫一圈 |

## 目录结构
- `app/`：Next.js App Router 页面、全局样式与 `app/api` 下的 REST 接口。
- `server/`：独立的 Socket.IO 游戏循环（TypeScript 编写，编译产物位于 `server/dist`）。
- `lib/db.ts`：Postgres 连接与表结构初始化工具函数。
- `public/`：静态资源；根目录和 `server/` 各自的 `package.json` 描述前后端依赖。

## 环境要求
- Node.js 18.17+（Next.js 15 的最低版本要求）。
- npm（或 pnpm / yarn）以及可用的 Postgres 数据库。推荐将连接串托管在 Neon、Supabase 等云服务。

## 快速开始
1. 安装依赖：
   ```bash
   npm install
   cd server && npm install
   ```
2. 配置数据库：创建 `.env.local` 与 `server/.env`，设置 `DATABASE_URL`（或 `POSTGRES_URL`），并在 `lib/db.ts` / 服务端配置中引用。
3. 初始化数据：启动前端后访问 `http://localhost:3000/api/initdb` 以创建数据表。
4. 分别启动客户端与实时服务器：
   ```bash
   npm run dev
   cd server && npm run dev
   ```
5. 部署上线：前端执行 `npm run build && npm run start`，服务端在 `server/` 中执行 `npm run build && npm run start`。

## 常用脚本
- `npm run dev`：启动 Next.js 开发服务器（默认 3000 端口，启用 Turbopack）。
- `npm run lint`：运行 ESLint，确保提交前通过。
- `npm run build` / `npm run start`：构建并运行生产版客户端。
- 在 `server/` 中运行 `npm run dev`、`npm run build`、`npm run start` 管理实时服务。

## 配置与安全建议
- 将当前硬编码在 `lib/db.ts` 的数据库连接迁移至环境变量，避免敏感信息入库。
- 新增配置时同步更新 `.env.example` 并确保凭证文件加入 `.gitignore`。
- 命名规范、测试策略等贡献细节请参阅仓库内的 `AGENTS.md`。
- 项目通过 `.editorconfig` 统一声明 UTF-8 编码和两空格缩进，避免跨平台乱码。
