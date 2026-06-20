// supabase/functions/tanshu-proxy/index.ts
//
// 替代原来 server.js 里的 /tanshu-api 代理。
// 作用：前端调用这个 Edge Function，由它在服务器端加上真实的探数数据(tanshuapi) Key 再转发，
// 浏览器全程看不到 Key。
//
// 调用方式（前端用 supabase.functions.invoke 调用）：
//   { endpoint: 'query' | 'history' | 'winning', params: { caipiaoid, num?, start?, issueno?, number? } }
//
// 需要登录才能调用（避免被陌生人拿去当免费代理刷你的调用额度）。

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 三个真实接口地址（原来分别对应 server.js 代理转发的那几个路径）
const ENDPOINTS: Record<string, string> = {
  query: 'https://api2.tanshuapi.com/api/caipiao/v1/query',
  history: 'https://api2.tanshuapi.com/api/caipiao/v1/history',
  winning: 'https://api2.tanshuapi.com/api/caipiao/v1/winning',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const TANSHU_API_KEY = Deno.env.get('TANSHU_API_KEY');

    if (!TANSHU_API_KEY) {
      return json({ error: '服务器未配置 TANSHU_API_KEY，请联系管理员' }, 500);
    }

    // 必须是登录用户才能调用（避免被陌生人当公共免费代理使用，消耗你的调用额度）
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) {
      return json({ error: '未登录或登录已过期' }, 401);
    }

    const body = await req.json();
    const { endpoint, params } = body;

    const baseUrl = ENDPOINTS[endpoint];
    if (!baseUrl) {
      return json({ error: '未知的接口类型: ' + endpoint }, 400);
    }

    const url = new URL(baseUrl);
    url.searchParams.set('key', TANSHU_API_KEY);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }

    const upstreamRes = await fetch(url.toString());
    const data = await upstreamRes.json();

    return json(data, upstreamRes.status);
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
