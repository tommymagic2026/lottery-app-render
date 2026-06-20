// supabase-config.js
// 所有页面共用的 Supabase 客户端初始化文件。
//
// ⚠️ 部署前必须修改下面两行：
//   SUPABASE_URL          -> 在 Supabase 控制台 Project Settings -> API 里找 "Project URL"
//   SUPABASE_PUBLISHABLE_KEY -> 同一页面里的 "anon public" key（新版叫 publishable key）
//
// 这个 key 是"公开"的，专门设计成可以放在前端代码里——
// 真正的权限控制由数据库的 Row Level Security（RLS）规则决定，不是靠隐藏这个 key。
// 千万不要把 service_role key 放到这里或任何前端文件里！

const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'YOUR-ANON-OR-PUBLISHABLE-KEY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// 内部邮箱后缀：登录界面还是"用户名+密码"，底层映射成邮箱给 Supabase Auth 用
const FAKE_EMAIL_DOMAIN = 'lottery.local';
function usernameToEmail(username) {
  return `${username}@${FAKE_EMAIL_DOMAIN}`;
}

// 获取当前登录用户 + 对应的 profile（用户名/角色）
// 返回 null 表示未登录
async function getCurrentUserProfile() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('id, username, role, create_time')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) return null;
  return profile;
}

// 退出登录
async function logoutCurrentUser() {
  await supabaseClient.auth.signOut();
}

// 调用 tanshu-proxy 这个 Edge Function 获取开奖数据（替代以前 server.js 的 /tanshu-api 代理）
// endpoint: 'query' | 'history' | 'winning'
// params: 比如 { caipiaoid: 11, num: 20, start: 0 }
async function callTanshuProxy(endpoint, params) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error('请先登录');

  const { data, error } = await supabaseClient.functions.invoke('tanshu-proxy', {
    body: { endpoint, params },
    headers: { Authorization: `Bearer ${session.access_token}` }
  });

  if (error) {
    let msg = error.message;
    try {
      const errBody = await error.context.json();
      if (errBody && errBody.error) msg = errBody.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return data;
}
