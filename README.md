# Snake 实时对战平台

Snake 是一个基于 Next.js 与 Socket.IO 的多人实时贪吃蛇游戏，支持房间匹配、道具效果和成绩榜持久化，适合演示前后端协同和实时通信能力。

## 核心功能
- 房间管理：创建或加入六位数房间号，房主可同步开始游戏。
- 实时同步：Socket.IO 推送蛇身位置、食物刷新与道具效果。
- 排行榜：通过 Postgres 记录玩家分数，并提供 `/api/scores` 查询接口。
- 一键建表：访问 `/api/initdb` 自动创建 `game_rooms`、`players` 与 `player_score` 表。

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
