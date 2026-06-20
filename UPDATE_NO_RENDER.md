# 更新说明：彻底不用 Render / server.js 了

## 改了什么

之前 `server.js` 干两件事：① 托管静态网页 ② 转发探数数据 API 请求（顺便藏 Key）。
现在这两件事拆开了：

| 原来 | 现在 |
|---|---|
| `server.js` 托管 html 文件 | 任何静态托管都行（GitHub Pages / Cloudflare Pages 等） |
| `server.js` 代理 `/tanshu-api`，藏 Key | 新增一个 Supabase Edge Function：`tanshu-proxy`，效果一样 |

`server.js` 和 `package.json` 这两个文件**不再需要了**，可以直接删掉，不用部署，也不用 Render。

---

## 第一步：部署新的 Edge Function

跟之前部署 `admin-manage-users` 的方法完全一样，在你电脑那个项目文件夹里执行：

```powershell
supabase functions deploy tanshu-proxy
```

部署前确认一下 `supabase/functions/tanshu-proxy/index.ts` 这个文件已经放在正确路径下（跟
`supabase/functions/admin-manage-users/index.ts` 同一层级的 `functions` 文件夹里）。

---

## 第二步：配置探数数据的 API Key

这个 Edge Function 需要知道真实的 Key 才能帮你转发请求。在 Supabase 控制台：

1. 左边菜单 **Edge Functions** → 点进 `tanshu-proxy`
2. 找到 **Secrets**（或者在项目级别的 **Project Settings → Edge Functions → Secrets**）
3. 新增一个：
   - Key: `TANSHU_API_KEY`
   - Value: 你的探数数据真实 Key（`1a6af2d8d7ddff8d605fd4925b5624c5`）

> 如果网页控制台没有直接加 Secret 的入口，也可以用命令行：
> ```powershell
> supabase secrets set TANSHU_API_KEY=你的真实key
> ```

---

## 第三步：把网页文件部署到免费静态托管（不再需要 Render）

现在 `index.html / account.html / lottery.html / lo_date.html / supabase-config.js` 这五个文件，
是纯前端文件，不需要任何服务器程序在背后跑着，随便找个免费静态托管就行。推荐用你已经有的 GitHub 仓库直接开 **GitHub Pages**：

1. 打开你的 GitHub 仓库（`lottery-app`）
2. **Settings** → 左边菜单 **Pages**
3. **Source** 选 **Deploy from a branch**，Branch 选 `main`，目录选 `/ (root)`
4. 保存，等 1-2 分钟，GitHub 会给你一个形如
   `https://tommymagic2026.github.io/lottery-app/index.html` 的网址

如果你之前提交过 `server.js` / `package.json`，留着也没关系（GitHub Pages 只会把它们当普通文件托管，不会真的去运行 Node 程序），不影响使用，想干净一点的话可以顺手删掉：

```powershell
git rm server.js package.json
git add .
git commit -m "改用 Supabase Edge Function 代理，移除 server.js"
git push
```

---

## 关于域名

跟之前说的一样，域名和"用什么平台托管"是两件独立的事。GitHub Pages 同样支持绑定自定义域名
（仓库 Settings → Pages → Custom domain 那一栏填上你的域名），办法和绑 Render 大同小异，等你域名办好了找我，我带你配置 DNS。

## 关于"国内访问速度"

老实说，GitHub Pages 在国内的访问速度**不一定稳定**（偶尔会被干扰），如果后面发现这是个问题，
可以换成 **Cloudflare Pages**（同样免费、同样支持自定义域名、走的是 GitHub 自动部署），通常体验更好一些，
到时候告诉我，我再带你过一遍 Cloudflare Pages 的部署步骤。
