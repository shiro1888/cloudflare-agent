import { initDatabase, cleanupOldData } from './database/schema.js';
import { handleAdminAPI } from './handlers/admin.js';
import { handleAdminUI } from './handlers/admin-ui.js';
import { handleUpdate } from './handlers/update.js';
import { handleDashboard, handleServerAPI, handleDashboardAPI } from './handlers/dashboard.js';
import { handleServerDetail } from './handlers/server-detail.js';
import { handleLoginPage, handleLoginSubmit, handleLogout } from './handlers/login.js';
import { checkAuth, authResponse } from './middleware/auth.js';
import { loadSettings } from './utils/settings.js';

let dbInitialized = false;

// /api/history 允许查询的列白名单（防 SQL 注入）
const HISTORY_METRIC_WHITELIST = new Set([
  'cpu','ram','disk','processes',
  'net_in_speed','net_out_speed','net_rx','net_tx',
  'tcp_conn','udp_conn',
  'ping_ct','ping_cu','ping_cm','ping_bd',
  'load_avg','ram_used','swap_used','disk_used'
]);

// 全局安全响应头
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// 给响应附加安全头（仅 HTML 响应需要，避免污染 JSON / 探针响应）
function withSecurityHeaders(resp) {
  if (!resp) return resp;
  const ct = resp.headers.get('Content-Type') || '';
  if (!ct.includes('text/html')) return resp;
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(resp.body, { status: resp.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    if (!dbInitialized) {
      await initDatabase(env.DB);
      dbInitialized = true;
    }

    const url = new URL(request.url);
    const sys = await loadSettings(env.DB);

    let response;

    try {
      response = await routeRequest(request, env, ctx, url, sys);
    } catch (e) {
      console.error('Worker 错误:', e);
      response = new Response('Internal Server Error', { status: 500 });
    }

    return withSecurityHeaders(response);
  },

  async scheduled(event, env, ctx) {
    if (!dbInitialized) {
      await initDatabase(env.DB);
      dbInitialized = true;
    }
    // 根据 cron 表达式分发不同任务
    if (event.cron === '0 0 * * *') {
      console.log('[Cron] 每日清理');
      await cleanupOldData(env.DB);
    } else if (event.cron === '*/2 * * * *') {
      // 每 2 分钟检查离线节点
      const sys = await loadSettings(env.DB);
      if (sys.tg_notify === 'true' && sys.tg_bot_token) {
        const { checkOfflineNodes } = await import('./services/notification.js');
        await checkOfflineNodes(env.DB, sys);
      }
    }
  }
};

async function routeRequest(request, env, ctx, url, sys) {
  const { method } = request;
  const path = url.pathname;

  // 登录 / 登出
  if (method === 'GET'  && path === '/login')  return handleLoginPage(request, env, sys);
  if (method === 'POST' && path === '/login')  return handleLoginSubmit(request, env);
  if (path === '/logout') return handleLogout(request);

  // 探针上报（最频繁的路径放前面）
  if (method === 'POST' && path === '/update') return handleUpdate(request, env, ctx);

  // 安装脚本（由 Cloudflare Workers Assets 自动处理 public/install.sh，这里兜底）
  if (method === 'GET' && path === '/install.sh') {
    return serveInstallScript(env, url);
  }

  // 后台
  if (method === 'POST' && path === '/admin/api') return handleAdminAPI(request, env, sys);
  if (method === 'GET'  && path === '/admin')      return handleAdminUI(request, env, sys);

  // API
  if (method === 'GET' && path === '/api/server')    return handleServerAPI(request, env, sys);
  if (method === 'GET' && path === '/api/dashboard') return handleDashboardAPI(request, env, sys);
  if (method === 'GET' && path === '/api/history')   return handleHistoryAPI(request, env, sys);
  if (method === 'GET' && path === '/api/history/all') return handleHistoryAllAPI(request, env, sys);

  // 前台
  if (method === 'GET' && path === '/') {
    const viewId = url.searchParams.get('id');
    if (viewId) return handleServerDetail(request, env, sys, viewId);
    return handleDashboard(request, env, sys);
  }

  return new Response('Not Found', { status: 404 });
}

// =============================================
// 历史 API
// =============================================
async function handleHistoryAPI(request, env, sys) {
  if (sys.is_public !== 'true' && !(await checkAuth(request, env))) {
    return authResponse(request);
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const metric = url.searchParams.get('metric') || 'cpu';
  const hours = clampHours(url.searchParams.get('hours'));

  if (!id) return new Response('Missing ID', { status: 400 });
  if (!HISTORY_METRIC_WHITELIST.has(metric)) {
    return new Response('Invalid metric', { status: 400 });
  }

  const cutoff = Date.now() - hours * 3600_000;
  const { results } = await env.DB.prepare(`
    SELECT timestamp, ${metric}
    FROM metrics_history
    WHERE server_id = ?
      AND (
        (typeof(timestamp) = 'integer' AND timestamp > ?)
        OR (typeof(timestamp) = 'text' AND timestamp > datetime('now', '-' || ? || ' hours'))
      )
    ORDER BY timestamp ASC
  `).bind(id, cutoff, hours).all();

  return jsonResponse(results.map(normalizeRow));
}

async function handleHistoryAllAPI(request, env, sys) {
  if (sys.is_public !== 'true' && !(await checkAuth(request, env))) {
    return authResponse(request);
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const hours = clampHours(url.searchParams.get('hours'));
  if (!id) return new Response('Missing ID', { status: 400 });

  const cutoff = Date.now() - hours * 3600_000;
  const { results } = await env.DB.prepare(`
    SELECT timestamp, cpu, ram, disk, processes,
           net_in_speed, net_out_speed,
           tcp_conn, udp_conn,
           ping_ct, ping_cu, ping_cm, ping_bd
    FROM metrics_history
    WHERE server_id = ?
      AND (
        (typeof(timestamp) = 'integer' AND timestamp > ?)
        OR (typeof(timestamp) = 'text' AND timestamp > datetime('now', '-' || ? || ' hours'))
      )
    ORDER BY timestamp ASC
  `).bind(id, cutoff, hours).all();

  return jsonResponse(results.map(normalizeRow));
}

function normalizeRow(row) {
  let ts = row.timestamp;
  if (typeof ts === 'string') ts = new Date(ts).getTime();
  return { ...row, timestamp: ts };
}

function clampHours(input) {
  const n = parseFloat(input || '24');
  if (isNaN(n) || n <= 0) return 1;
  if (n > 168) return 168; // 最多 7 天
  return n;
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json; charset=UTF-8' }
  });
}

// =============================================
// 安装脚本（兜底：把 ASSETS 取到的脚本里的占位符替换成实际值）
// =============================================
async function serveInstallScript(env, url) {
  // 优先从绑定的 ASSETS 取
  if (env.ASSETS) {
    try {
      const r = await env.ASSETS.fetch(new Request(url.origin + '/install.sh'));
      if (r.ok) return r;
    } catch (e) {}
  }
  return new Response('install.sh not configured', { status: 404 });
}
