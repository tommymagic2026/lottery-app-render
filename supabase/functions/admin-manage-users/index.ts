// supabase/functions/admin-manage-users/index.ts
//
// 管理员专用的"新增 / 编辑 / 删除账号"接口。
// 这里用 service_role key 调用 Supabase Auth 的管理员 API，
// service_role key 只存在于 Edge Function 的环境变量里，浏览器永远拿不到。
//
// 调用方式（前端用 supabase.functions.invoke 调用）：
//   action: 'create' | 'update' | 'delete'
//   create -> { action: 'create', username, password, role }
//   update -> { action: 'update', userId, username?, password?, role? }
//   delete -> { action: 'delete', userId }
//
// 安全检查：只有当前登录用户的 profiles.role === 'admin' 才允许执行任何操作。

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 内部邮箱后缀：用户名登录体验不变，底层用 username@lottery.local 这种邮箱给 Supabase Auth 用
const FAKE_EMAIL_DOMAIN = 'lottery.local';
function usernameToEmail(username: string) {
  return `${username}@${FAKE_EMAIL_DOMAIN}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // adminClient: 拥有最高权限，只在服务器端使用
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // callerClient: 用调用者自己的 token，用来确认"你是谁、你是不是 admin"
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return json({ error: '未登录或登录已过期' }, 401);
    }

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ error: '权限不足：只有管理员可以操作账号' }, 403);
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      const { username, password, role } = body;
      if (!username || !password) {
        return json({ error: '用户名和密码不能为空' }, 400);
      }
      if (password.length < 6) {
        return json({ error: '密码至少需要 6 位' }, 400);
      }

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: usernameToEmail(username),
        password,
        email_confirm: true,
        user_metadata: { username, role: role === 'admin' ? 'admin' : 'user' },
      });

      if (createErr) {
        const msg = createErr.message.includes('already been registered')
          ? '用户名已存在'
          : createErr.message;
        return json({ error: msg }, 400);
      }

      return json({ success: true, user: created.user });
    }

    if (action === 'update') {
      const { userId, username, password, role } = body;
      if (!userId) return json({ error: '缺少 userId' }, 400);

      // 防止管理员把自己降级导致系统没有管理员（可选保护，按需去掉）
      if (userId === caller.id && role === 'user') {
        return json({ error: '不能取消自己的管理员权限' }, 400);
      }

      const updatePayload: Record<string, unknown> = {};
      if (password) {
        if (password.length < 6) return json({ error: '密码至少需要 6 位' }, 400);
        updatePayload.password = password;
      }
      if (username) {
        updatePayload.email = usernameToEmail(username);
        updatePayload.user_metadata = { username, role };
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updErr } = await adminClient.auth.admin.updateUserById(userId, updatePayload);
        if (updErr) return json({ error: updErr.message }, 400);
      }

      // profiles 表里的 username / role 同步更新
      const profileUpdate: Record<string, unknown> = {};
      if (username) profileUpdate.username = username;
      if (role === 'admin' || role === 'user') profileUpdate.role = role;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profErr } = await adminClient
          .from('profiles')
          .update(profileUpdate)
          .eq('id', userId);
        if (profErr) return json({ error: profErr.message }, 400);
      }

      return json({ success: true });
    }

    if (action === 'delete') {
      const { userId } = body;
      if (!userId) return json({ error: '缺少 userId' }, 400);
      if (userId === caller.id) {
        return json({ error: '不能删除自己' }, 400);
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 400);

      return json({ success: true });
    }

    return json({ error: '未知操作: ' + action }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
