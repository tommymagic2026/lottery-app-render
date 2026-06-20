-- ====================================================================
-- 福利彩票选号系统 — Supabase 数据库初始化脚本
-- 使用方法：打开 Supabase 控制台 -> SQL Editor -> New query -> 粘贴整段 -> Run
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. profiles 表：存放用户名 / 角色，和 Supabase Auth 的 auth.users 一一对应
-- --------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  create_time timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 所有已登录用户都可以读取账号列表（账号管理页要展示用户名/角色）
-- 如果你不想让普通用户看到别人的账号列表，可以把这条改成 "auth.uid() = id"
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- 任何人都不能直接从浏览器更新 profiles（角色提升、改用户名都通过下面的 Edge Function 完成）
-- 这里只允许管理员修改角色字段对应的整行（编辑用户名等也走 Edge Function 更安全，但简单的角色切换可以放开给管理员）
create policy "profiles_update_admin_only"
  on public.profiles for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 删除也只能管理员做（实际删除 auth.users 走 Edge Function，这条是双保险）
create policy "profiles_delete_admin_only"
  on public.profiles for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- 新建 auth 用户时，自动在 profiles 里建一行（用户名/角色从 user_metadata 里取）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- --------------------------------------------------------------------
-- 2. selections 表：每个用户自己的选号记录
-- --------------------------------------------------------------------
create table if not exists public.selections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  lottery text not null,
  lottery_name text not null,
  issue text,
  kl8_count int,
  numbers jsonb not null,
  create_time timestamptz not null default now(),
  checked boolean not null default false,
  win_prize numeric not null default 0,
  win_level int not null default 0
);

alter table public.selections enable row level security;

-- 只能看到自己的选号
create policy "selections_select_own"
  on public.selections for select
  to authenticated
  using (auth.uid() = user_id);

-- 只能插入自己名下的选号（user_id 必须等于当前登录用户）
create policy "selections_insert_own"
  on public.selections for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 只能更新/删除自己的选号（查询中奖结果时会更新 checked/win_prize 字段）
create policy "selections_update_own"
  on public.selections for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "selections_delete_own"
  on public.selections for delete
  to authenticated
  using (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- 3. history_cache 表：开奖历史缓存（公开数据，不涉及隐私）
-- --------------------------------------------------------------------
create table if not exists public.history_cache (
  lottery text primary key,           -- 'ssq' / 'dlt' / 'kl8'
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.history_cache enable row level security;

-- 任何人（包括未登录）都可以读取开奖历史缓存
create policy "history_cache_select_public"
  on public.history_cache for select
  to anon, authenticated
  using (true);

-- 已登录用户可以写入/更新缓存（数据来自公开的彩票开奖接口，写坏了也只是缓存，不敏感）
create policy "history_cache_upsert_authenticated"
  on public.history_cache for insert
  to authenticated
  with check (true);

create policy "history_cache_update_authenticated"
  on public.history_cache for update
  to authenticated
  using (true)
  with check (true);


-- --------------------------------------------------------------------
-- 4. 把第一个账号设为管理员
-- --------------------------------------------------------------------
-- 先按本文档"部署步骤"用账号管理页面或 Supabase 控制台注册一个账号，
-- 然后回到这里，把下面的 'your_admin_username' 换成你刚注册的用户名，单独执行这一条：
--
-- update public.profiles set role = 'admin' where username = 'your_admin_username';
