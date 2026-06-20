# 本地数据迁移到 Supabase —— 部署步骤

## 改了什么

| 原来（localStorage）       | 现在（Supabase）                                  |
|----------------------------|----------------------------------------------------|
| `lottery_users`            | Supabase Auth + `profiles` 表（角色信息）           |
| `lottery_current_user`     | Supabase Auth 的登录 session                        |
| `lottery_selections`       | `selections` 表（按用户做行级权限隔离）             |
| `lottery_history_cache`    | `history_cache` 表（公开可读）                       |

账号的"新增 / 编辑 / 删除"现在统一走一个叫 `admin-manage-users` 的 Edge Function，
浏览器端再也不会出现真正有管理权限的密钥，全部检查都在服务器端完成。

---

## 第一步：建表

1. 打开你的 Supabase 项目 -> 左侧菜单 **SQL Editor** -> **New query**
2. 把 `01_schema.sql` 整个内容粘贴进去 -> **Run**
3. 看到 Success 即可（这一步会建好 `profiles` / `selections` / `history_cache` 三张表，以及对应的行级安全规则 RLS）

---

## 第二步：部署 Edge Function（账号管理用）

需要装一次 [Supabase CLI](https://supabase.com/docs/guides/cli)。在你本机（不是这个对话的容器）执行：

```bash
npm install -g supabase

# 登录（会打开浏览器授权）
supabase login

# 把下载到本地的 supabase/ 文件夹链接到你的项目
# YOUR_PROJECT_REF 在 Supabase 控制台 URL 里能看到，形如 abcdefghijklmnop
supabase link --project-ref YOUR_PROJECT_REF

# 部署 Edge Function
supabase functions deploy admin-manage-users
```

Edge Function 运行时需要两个环境变量，Supabase 平台**会自动注入** `SUPABASE_URL` 和
`SUPABASE_SERVICE_ROLE_KEY`，你不用手动配置。

> 如果你本机没有 Node/npm 环境装不了 CLI，也可以在 Supabase 控制台
> **Edge Functions** 页面里直接用网页编辑器新建一个名为 `admin-manage-users` 的函数，
> 把 `supabase/functions/admin-manage-users/index.ts` 的内容粘贴进去保存部署。

---

## 第三步：填写前端的 Supabase 连接信息

打开 `supabase-config.js`，把这两行换成你项目的真实值：

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'YOUR-ANON-OR-PUBLISHABLE-KEY';
```

这两个值在 Supabase 控制台 **Project Settings -> API** 页面能找到：
- `Project URL` -> 对应 `SUPABASE_URL`
- `anon public`（新版叫 `publishable`）key -> 对应 `SUPABASE_PUBLISHABLE_KEY`

⚠️ **不要**把 `service_role` key 填进这个文件——那个 key 只能放在 Edge Function 里。

---

## 第四步：注册第一个管理员账号

1. 用 `server.js` 或任意静态服务器把这几个文件跑起来（本地先测试）：
   ```bash
   node server.js
   # 打开 http://localhost:3000/index.html
   ```
2. 因为账号管理页要求"已经是管理员"才能新增账号，第一个账号需要手动注册。最简单的方法：
   打开 Supabase 控制台 -> **Authentication -> Users -> Add user**，
   - Email 填 `你想要的用户名@lottery.local`（比如 `admin@lottery.local`）
   - 密码自己设
   - 这样会自动触发我们写的数据库触发器，在 `profiles` 表里生成一行（默认角色是 `user`）
3. 回到 SQL Editor，把这个账号设成管理员：
   ```sql
   update public.profiles set role = 'admin' where username = 'admin';
   ```
   （这里的 `'admin'` 换成你刚才在邮箱 `@` 前面填的那部分）
4. 现在就可以在登录页用"用户名 = admin"登录，之后所有新增账号都可以从 **账号管理** 页面里添加了，不用再手动去 Supabase 控制台。

---

## 第五步：上线部署

把 `index.html / account.html / lottery.html / lo_date.html / supabase-config.js / server.js`
一起放到你的服务器或者 Vercel / Netlify 这类静态托管上即可（`server.js` 主要是为了反代探数数据 API，
解决浏览器跨域问题，如果你的前端直接请求探数 API 没有跨域问题，也可以不用 `server.js`，
用任意静态文件服务器托管这几个 html 文件就行）。

---

## 关于安全性，再提醒两点

1. **探数数据(tanshuapi)的 API_KEY 目前是写死在前端代码里的**（`account.html` / `lottery.html` /
   `lo_date.html` 里都有一行 `const API_KEY = '...'`）。这个跟你这次问的"本地数据库迁移"是两件事，
   我没有动它，但既然要公开部署，任何人打开浏览器控制台都能看到这个 Key、拿去用在别的地方消耗你的调用额度。
   如果需要，我可以帮你把这部分也改成通过 `server.js`（或者一个新的 Edge Function）转发请求、Key 只放在服务器端——
   跟这次的 Edge Function 是同一个思路，需要的话告诉我。
2. 这次的方案里，"用户名"在底层映射成了 `用户名@lottery.local` 这种邮箱格式给 Supabase Auth 用，
   所以**找回密码（忘记密码邮件）功能用不了**——这类邮箱收不到真实邮件。如果以后需要"忘记密码"功能，
   需要让用户绑定真实邮箱，是另一项改造，目前先维持和原来一样"管理员帮用户改密码"的方式（账号管理页的编辑功能已经支持）。
