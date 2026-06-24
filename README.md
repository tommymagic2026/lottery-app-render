# 🎰 执元福利彩票选号系统

一个基于 **纯静态网页 + Supabase 云后端** 的中国福利彩票选号与对奖系统，部署在 GitHub Pages，无需服务器。

---

## 功能概览

| 功能模块 | 说明 |
|---|---|
| 🔐 用户登录 | 用户名 + 密码登录，底层使用 Supabase Auth（邮箱映射方案） |
| 🎲 彩票选号 | 支持双色球 / 超级大乐透 / 快乐8，手动选号或随机选号 |
| 💾 保存选号 | 选号保存至 Supabase 云端，多设备同步 |
| ✅ 自动对奖 | 调用探数 API 获取最新开奖号码，自动检测中奖等级 |
| 📊 历史数据 | 查看各彩种近期开奖历史，支持缓存减少 API 调用 |
| 👤 账号管理 | 管理员专属：增删改查用户账号（通过 Edge Function 安全执行） |

---

## 支持的彩种

### 双色球（SSQ）
- 前区：从 01–33 中选 6 个红球
- 后区：从 01–16 中选 1 个蓝球
- 奖级：一等奖至六等奖 + 追加奖

### 超级大乐透（DLT）
- 前区：从 01–35 中选 5 个号码
- 后区：从 01–12 中选 2 个号码
- 奖级：一等奖至七等级 + 追加奖

### 快乐8（KL8）
- 从 01–80 中自由选号（1–10 个）
- 奖级根据选号数量和命中数动态计算

---

## 技术架构

```
┌─────────────────────────────────────────────┐
│             GitHub Pages（静态托管）          │
│  index.html / lottery.html / lo_date.html   │
│  account.html / supabase-config.js          │
└──────────────┬──────────────────────────────┘
               │ Supabase JS SDK
┌──────────────▼──────────────────────────────┐
│              Supabase 云后端                  │
│  ┌──────────┐  ┌───────────────────────────┐│
│  │  Auth    │  │  PostgreSQL 数据库         ││
│  │ 用户认证 │  │  profiles / selections    ││
│  └──────────┘  │  history_cache            ││
│  ┌─────────────┴─────────────────────────┐ ││
│  │         Edge Functions                │ ││
│  │  admin-manage-users（用户管理）        │ ││
│  │  tanshu-proxy（API 代理）             │ ││
│  └───────────────────────────────────────┘ ││
└─────────────────────────────────────────────┘
               │ Edge Function 转发
┌──────────────▼──────────────────────────────┐
│         探数 API（第三方开奖数据）             │
│         https://api2.tanshuapi.com          │
└─────────────────────────────────────────────┘
```

### 文件结构

```
├── index.html          # 登录页 & 主菜单
├── lottery.html        # 彩票选号 & 对奖
├── lo_date.html        # 历史开奖数据
├── account.html        # 账号管理（仅管理员）
├── supabase-config.js  # Supabase 客户端配置（共享）
└── server.js           # 旧版本地代理（已弃用，仅保留参考）
```

---

## Supabase 数据库结构

### `profiles` 表
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 对应 Auth 用户 ID（主键） |
| username | text | 登录用户名 |
| role | text | `admin` / `user` |
| create_time | timestamptz | 创建时间 |

### `selections` 表
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| user_id | uuid | 外键关联 profiles |
| lottery_type | text | `SSQ` / `DLT` / `KL8` |
| numbers | jsonb | 选号数据 |
| created_at | timestamptz | 保存时间 |

### `history_cache` 表
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 主键 |
| lottery_type | text | 彩种代码 |
| data | jsonb | 从探数 API 缓存的开奖数据 |
| cached_at | timestamptz | 缓存时间 |

### Edge Functions
| 函数名 | 说明 |
|---|---|
| `admin-manage-users` | 管理员专用：创建 / 修改 / 删除用户，需携带有效 JWT |
| `tanshu-proxy` | 安全代理探数 API 请求，隐藏 API Key |

---

## 部署说明

### 前提条件
- 一个 [Supabase](https://supabase.com) 项目
- 一个 [探数 API](https://www.tanshuapi.com) 账号及彩票数据 API Key
- GitHub 仓库（开启 GitHub Pages）

### 第一步：配置 Supabase

1. 在 Supabase 控制台创建上述三张数据库表，并开启 **Row Level Security（RLS）**
2. 部署两个 Edge Functions（`admin-manage-users`、`tanshu-proxy`）
3. 在 Edge Function 的环境变量中设置：
   - `TANSHU_API_KEY`：你的探数 API Key
   - `SUPABASE_SERVICE_ROLE_KEY`：用于 admin 函数操作用户

### 第二步：修改配置文件

编辑 `supabase-config.js`，填入你自己的值：

```js
const SUPABASE_URL = 'https://你的项目ID.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = '你的 anon/publishable key';
```

> ⚠️ **安全提示**：这里只放 `anon` 公开 Key，绝对不要放 `service_role` Key。真正的权限控制依靠 RLS 规则和 Edge Function 内的 JWT 校验。

### 第三步：部署到 GitHub Pages

```bash
git add .
git commit -m "deploy"
git push origin main
```

在仓库 Settings → Pages 中选择 `main` 分支根目录，保存后等待几分钟即可访问。

---

## 认证方案说明

本系统使用"用户名登录"的友好体验，底层通过将用户名拼接 `@lottery.local` 后缀转换为邮箱格式，交由 Supabase Auth 处理。用户无需记忆邮箱，所有用户管理由管理员通过账号管理页面操作。

---

## 关于 server.js

`server.js` 是项目早期使用 Express 搭建的本地代理服务器（用于解决探数 API 的跨域问题），现已被 Supabase Edge Function（`tanshu-proxy`）完全替代。当前部署为纯静态网页，无需运行 Node.js 服务。该文件仅作历史参考保留。

---

## License

MIT
