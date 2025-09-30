# Repository Guidelines（仓库贡献指南）

## 项目结构与模块划分
- `app/` 包含 Next.js 路由、界面组件，以及位于 `app/api/{initdb,rooms,scores}` 的 REST 处理器。
- `lib/db.ts` 负责集中管理 Postgres 访问；`public/` 存放静态资源；`app/globals.css` 维护全局样式与 Tailwind 配置。
- `server/` 承载 Socket.IO 游戏主循环（TypeScript 编写），编译产物生成在 `server/dist`。

## 构建、测试与本地开发
- 首次运行 `npm install`，然后使用 `npm run dev` 启动客户端（Turbopack，默认端口 3000）。
- 使用 `npm run build` 生成生产包，`npm run start` 启动构建后的前端。
- 提交前执行 `npm run lint` 处理 ESLint 告警。
- 在 `server/` 目录分别执行 `npm install`、`npm run dev`（热更新）或 `npm run build && npm run start`（运行编译版本）。

## 代码风格与命名约定
- 全面采用 TypeScript；组件使用 PascalCase 命名，工具函数与 hooks 使用 camelCase。
- 遵循 `eslint-config-next` 规则，确保无未处理的 lint 警告。
- 推荐两空格缩进、双引号字符串，与 `app/page.tsx` 保持一致。
- 局部样式随组件就近维护，共用样式集中在 `app/globals.css`。

## 测试指引
- 当前无自动化测试，提交前请在客户端 `npm run dev` 和服务端 `server npm run dev` 下进行冒烟验证。
- 若新增测试，优先使用 Jest 或 Vitest，文件命名为 `*.test.ts[x]` 并置于相邻的 `__tests__` 目录。
- 在 PR 描述中记录手动验证步骤、覆盖的边界场景及潜在风险，直至引入自动化覆盖率要求。

## 提交与拉取请求规范
- 现有历史包含数字与描述混合的提交，建议改用简洁的祈使句主题，例如 `feat: add room ready toggle`。
- 数据库结构或迁移应单独提交，并在描述中突出 `lib/db.ts` 或相关脚本的变更。
- PR 需包含变更摘要、受影响模块、手动测试记录，以及涉及界面改动时的截图。
- 关联相关 issue，声明新增环境变量，并列出后续计划或限制范围。

## 安全与配置提示
- 将 `lib/db.ts` 的硬编码数据库连接迁移到 `.env.local` 或 `server/.env`，并在文档中说明所需变量。
- 使用 `.gitignore` 排除敏感文件，新增配置时同步更新 `.env.example`。
- 若对流程或约定有疑问，请在 PR 中提出讨论或创建 Issue，确保团队共识。
