# Cloudflare-Agent

> 极简风格、自托管的多服务器监控面板，跑在 Cloudflare Workers 上。零成本、低延迟、丝滑动效。

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=fff)](https://github.com/shiro1888/cloudflare-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

```
                  ┌────────────┐                  ┌──────────────┐
   多台 VPS  ───►  │   Probe    │   POST /update   │   Cloudflare │
   (bash 探针)     │ (1m 上报)  │  ───────────►    │   Worker     │
                  └────────────┘                  │     +        │
                                                  │   D1 数据库  │
   浏览器访问  ───────  GET / 或 /admin   ──────►  └──────────────┘
```

## ✨ 特性

- 📊 **实时监控**：CPU / 内存 / 磁盘 / 网络速率 / 进程数 / 连接数
- 📈 **历史图表**：1h / 3h / 6h / 12h / 24h 多时间范围切换
- 🌍 **全球地图**：可视化展示服务器分布
- 🔔 **离线告警**：支持 Telegram 和企业微信
- 🎨 **极简 UI**：浅色 / 深色 / 跟随系统三套主题，丝滑过渡
- 📱 **响应式**：桌面/手机自适应
- 🔄 **自动部署**：GitHub Actions 一键部署
- 🗺️ **运营商延迟**：电信 / 联通 / 移动 / 字节四线监测
- 🔐 **现代认证**：HMAC 签名 Cookie + 限流 + CSRF 防护

## 🛠️ 技术栈

- **服务端**：Cloudflare Workers（边缘计算，全球低延迟）
- **数据库**：Cloudflare D1（SQLite 兼容，5 GB 免费）
- **前端**：Alpine.js + Chart.js + Leaflet（CDN 加载，无构建）
- **探针**：纯 Bash 脚本（< 15 MB 内存占用）

## 📁 项目结构

```
cloudflare-agent/
├── public/
│   └── install.sh              # 一键探针安装脚本
├── src/
│   ├── index.js                # 路由入口
│   ├── database/
│   │   └── schema.js           # D1 表结构 + 迁移
│   ├── handlers/
│   │   ├── dashboard.js        # 首页大盘
│   │   ├── server-detail.js    # 服务器详情页
│   │   ├── admin-ui.js         # 管理后台 UI
│   │   ├── admin.js            # 管理 API
│   │   ├── login.js            # 登录页 + 提交
│   │   └── update.js           # 探针上报接口
│   ├── middleware/
│   │   ├── auth.js             # HMAC 会话 + Basic Auth
│   │   └── rate-limit.js       # 简单限流
│   ├── services/
│   │   └── notification.js     # Telegram / 企业微信
│   ├── themes/
│   │   └── styles.js           # 共享样式（浅/深）
│   └── utils/
│       ├── format.js
│       ├── settings.js         # 配置缓存
│       └── sanitize.js         # XSS / 重定向防护
├── .github/workflows/
│   └── deploy.yml              # 自动部署
├── wrangler.toml
└── package.json
```

## 🚀 部署到 Cloudflare（约 10 分钟）

### 第一步：Fork 本仓库

点击右上角 **Fork** 按钮，把项目复制到你自己的 GitHub。

### 第二步：在 Cloudflare 创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单进入 **Workers & Pages → D1 SQL Database**
3. 点击 **Create database**
4. 名字必须填：`server-monitor-db`
5. 创建后**复制 Database ID**（一串 UUID）

### 第三步：获取 Cloudflare 凭据

#### Account ID

在 Cloudflare Dashboard 任意页面右侧栏能看到 **Account ID**。

#### API Token

1. 打开 [API Tokens 页面](https://dash.cloudflare.com/profile/api-tokens)
2. 点 **Create Token**
3. 选 **Edit Cloudflare Workers** 模板
4. Account Resources 选你的账户
5. 创建 → **复制 Token（只会显示一次！）**

### 第四步：配置 GitHub Secrets

在你 fork 的仓库：
**Settings → Secrets and variables → Actions → New repository secret**

依次添加以下 **5 个 Secret**：

| Secret 名称       | 值                                          | 说明 |
|-------------------|----------------------------------------------|------|
| `CF_API_TOKEN`    | 第三步获取的 Token                          | Cloudflare API 令牌 |
| `CF_ACCOUNT_ID`   | 第三步获取的 ID                             | Cloudflare 账户 ID |
| `D1_DATABASE_ID`  | 第二步获取的 Database ID                    | D1 数据库 ID |
| `API_USER_NAME`   | 自定义用户名（如 `admin`）                  | 管理后台用户名 |
| `API_SECRET`      | **强密码（24+ 位随机串）**                  | 管理密码 + 探针密钥 + Cookie 签名密钥 |

> ⚠️ **`API_SECRET` 强烈建议用强密码！** 它同时承担三个角色：
> 1. 管理后台登录密码
> 2. 探针向 Worker 上报数据的认证密钥
> 3. HMAC 签名 Cookie 的派生密钥
>
> 弱密码会让会话 Cookie 被暴力破解。

**生成强密码：**
```bash
# Linux / macOS
openssl rand -base64 32

# PowerShell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

### 第五步：触发部署

```bash
# 方法 A：手动触发（推荐第一次用）
# 仓库页面 → Actions 标签 → 左侧 "Deploy to Cloudflare Workers" → 右上 "Run workflow"

# 方法 B：push 任何修改自动触发
git commit --allow-empty -m "trigger deploy"
git push
```

部署完成后，访问：

```
https://cloudflare-agent.<你的子域>.workers.dev/
```

子域可以在 **Cloudflare Dashboard → Workers & Pages → 你的项目** 看到。

## 🖥️ 添加服务器并安装探针

### 在管理后台添加节点

1. 浏览器打开 `https://你的项目.workers.dev/admin`
2. 用 `API_USER_NAME` / `API_SECRET` 登录
3. **服务器** tab → 输入名称 → 点 **添加**
4. 在新行点 **命令** 按钮 → 复制完整安装命令

### 在 VPS 上运行

SSH 登录目标 VPS（**需要 root**），粘贴执行：

```bash
curl -sL https://你的项目.workers.dev/install.sh | bash -s install <SERVER_ID> <SECRET> https://你的项目.workers.dev/update 60
```

参数说明：

| 参数         | 必填 | 默认 | 说明              |
|--------------|------|------|-------------------|
| `SERVER_ID`  | ✅   | -    | 唯一标识符        |
| `SECRET`     | ✅   | -    | 即 `API_SECRET`   |
| `WORKER_URL` | ✅   | -    | 你的 Worker URL   |
| `INTERVAL`   | ❌   | 60   | 上报间隔（秒）    |

**支持的系统：** Ubuntu / Debian / CentOS / RHEL / Fedora / Rocky / AlmaLinux

### 探针管理命令

```bash
# 查看状态
systemctl status cf-probe

# 查看实时日志
journalctl -u cf-probe -f

# 重启
systemctl restart cf-probe

# 卸载
curl -sL https://你的项目.workers.dev/install.sh | bash -s uninstall
```

## 📊 使用说明

### 前台大盘 `/`

- **卡片视图**：直观的状态卡片（默认）
- **列表视图**：紧凑表格，点列头排序
- **地图视图**：节点全球分布

支持按**国家**和**在线状态**过滤，CPU/RAM 高低排序。每 30 秒自动刷新（无闪烁）。

### 服务器详情 `/?id=xxx`

点首页任意卡片即可进入。展示：

- 系统信息（运行时间、负载、内存、磁盘等）
- 6 个独立图表：CPU / RAM / Disk / 网络 / 进程 / 连接
- 全宽延迟图表：CT / CU / CM / BD 四运营商
- 时间范围：10m / 30m / 1h / 3h / 6h / 12h / 24h

### 管理后台 `/admin`

三个 tab：

- **服务器**：增删改查、批量删除、复制安装命令、状态徽章
- **设置**：站点标题、主题、显示项、离线告警、自定义 CSS/Head/Script
- **文档**：内置安装说明

## 🔔 离线告警配置

进入管理后台 → **设置** tab → **离线告警** 区块。

### Telegram

1. 通过 [@BotFather](https://t.me/BotFather) 创建 bot，获取 Token
2. 把 bot 拉进想接收消息的群组（或私聊）
3. 通过 [@userinfobot](https://t.me/userinfobot) 获取 Chat ID
4. 后台填入：
   - **通知方式**：启用
   - **Bot Token / Webhook URL**：`123456:ABC-DEF...`（Telegram bot token）
   - **Chat ID**：`-100123456789` 或个人 ID

### 企业微信

1. 群机器人 → 获取 Webhook URL
2. 后台填入：
   - **通知方式**：启用
   - **Bot Token / Webhook URL**：完整的 `https://qyapi.weixin.qq.com/...`
   - **Chat ID**：留空

> 系统通过是否以 `http(s)://` 开头自动识别。

告警触发条件：节点连续 **5 分钟未上报** 视为离线，恢复在线后会发送一条恢复通知。检查由 cron 每 2 分钟执行一次（不会因探针上报触发，节省 D1 读次数）。

## 🔐 安全特性

| 防护项         | 实现 |
|----------------|------|
| 密码存储       | API_SECRET 不入库，仅作为 HMAC 派生密钥 |
| Cookie         | HMAC-SHA256 签名 token，带 HttpOnly + SameSite=Lax + Secure |
| 暴力破解       | 登录限流 5 次 / 分钟 / IP，超过返回 429 |
| 时序攻击       | 凭据比较使用常量时间算法 |
| SQL 注入       | 全部参数化，`/api/history` 的 `metric` 字段使用白名单 |
| XSS            | `safeJsonInScript` 防 `</script>` 突破，HTML 转义全覆盖 |
| 开放重定向     | `sanitizeNextPath` 校验登录跳转路径 |
| CSRF           | Origin/Referer 校验 + SameSite=Lax cookie + Basic Auth 例外 |
| HTTP 头        | X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy |
| 错误信息       | 不返回 SQL 详情或堆栈，只回"服务器内部错误" |

## 💰 资源消耗

### Cloudflare 这边

| 资源 | 免费额度 | 10 台服务器实测 |
|---|---|---|
| Workers 请求 / 天 | 10 万 | ~14400 ✅ |
| Workers 包体积 | 10 MB | ~55 KB ✅ |
| D1 存储 | 5 GB | ~2 MB ✅ |
| D1 写次数 / 天 | 10 万 | ~15000 ✅ |
| D1 读次数 / 天 | 500 万 | ~50000 ✅ |

### 你的 VPS 这边（探针）

- 内存：5-15 MB（绝大部分时间在 sleep）
- CPU：几乎为 0
- 网络：每次 1-2 KB JSON
- **128 MB 小鸡都能跑**

> 历史数据 24 小时自动清理（cron），所以即使监控几十台也不会爆免费额度。

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 创建本地配置
cat > .dev.vars <<EOF
API_USER_NAME=admin
API_SECRET=local-test-secret
EOF

# 启动本地 wrangler dev
npx wrangler dev --port 8787 --local

# 打开浏览器
# 首页: http://127.0.0.1:8787/
# 后台: http://127.0.0.1:8787/admin
# 登录: admin / local-test-secret
```

## ❓ 常见问题

**Q: 部署后访问 404？**
A: 检查 `wrangler.toml` 里的 D1 配置，确认 GitHub Actions 跑成功了（仓库 → Actions 标签）。

**Q: 探针装了但前台不显示？**
A: 在 VPS 上执行 `journalctl -u cf-probe -n 50` 看探针日志；确保探针能访问 Worker URL；检查 SECRET 是否正确。

**Q: 想换 `API_SECRET`？**
A:
1. 修改 GitHub Secret 中的 `API_SECRET`
2. 触发重新部署（Actions 页面 → Run workflow）
3. **所有探针必须重装**（用新 SECRET）
4. 浏览器需重新登录（旧 cookie 会失效）

**Q: 部署后第一次访问慢？**
A: Workers 冷启动需要 50-100ms，第一次访问就有这个延迟。后续都是边缘缓存，毫秒级。

**Q: 想自定义站点标题/主题？**
A: 管理后台 → **设置** tab，所有显示项都可以改。

**Q: 历史数据保留多久？**
A: 默认 24 小时（cron 每天清理）。如需更长，修改 `src/database/schema.js` 的 `cleanupOldData` 函数。

**Q: 支持多用户吗？**
A: 不支持，设计上是单管理员模型。如有需要，自行扩展 `auth.js`。

## 🤝 贡献

欢迎 issue 和 PR。

## 📄 许可证

[MIT License](LICENSE)

## 🙏 致谢

本项目深度二次开发自：

- [huilang-me/CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)
- 上游：[a63414262/CF-Server-Monitor-Pro](https://github.com/a63414262/CF-Server-Monitor-Pro)

依赖：

- [Cloudflare Workers](https://workers.cloudflare.com/) - 边缘计算
- [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite 数据库
- [Alpine.js](https://alpinejs.dev/) - 轻量响应式框架
- [Chart.js](https://www.chartjs.org/) - 图表库
- [Leaflet](https://leafletjs.com/) - 地图库
- [flagcdn.com](https://flagcdn.com/) - 国旗图标
