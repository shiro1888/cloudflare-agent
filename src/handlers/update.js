import { saveMetricsHistory } from '../database/schema.js';
import { loadSettings } from '../utils/settings.js';
import { timingSafeStringEqual } from '../middleware/auth.js';

// 简单常量字典限速 / 限制：超过 N 字节的 JSON 直接拒绝
const MAX_BODY = 32 * 1024; // 32 KB 已经足够包含所有 metrics

export async function handleUpdate(request, env, ctx) {
  try {
    // 1. 简单的 body 大小防御
    const contentLength = parseInt(request.headers.get('content-length') || '0');
    if (contentLength > MAX_BODY) {
      return new Response('Payload too large', { status: 413 });
    }

    const data = await request.json();
    const { id, secret, metrics } = data;

    // 常量时间字符串比较，避免时序攻击（不通过长度差异泄露信息）
    if (!secret || !env.API_SECRET || !timingSafeStringEqual(secret, env.API_SECRET)) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (!id || typeof id !== 'string') {
      return new Response('Invalid ID', { status: 400 });
    }
    if (!metrics || typeof metrics !== 'object') {
      return new Response('Invalid metrics', { status: 400 });
    }

    let countryCode = request.cf?.country || 'XX';
    if (countryCode.toUpperCase() === 'TW') countryCode = 'CN';

    const serverExists = await env.DB.prepare(
      'SELECT id, monthly_rx, monthly_tx, last_rx, last_tx, reset_month FROM servers WHERE id = ?'
    ).bind(id).first();
    if (!serverExists) {
      return new Response('Server not found', { status: 404 });
    }

    // 流量累加
    const tzOffset = 8 * 60 * 60000;
    const localNow = new Date(Date.now() + tzOffset);
    const currentMonthStr = `${localNow.getFullYear()}-${localNow.getMonth() + 1}`;

    let monthly_rx = parseFloat(serverExists.monthly_rx || '0') || 0;
    let monthly_tx = parseFloat(serverExists.monthly_tx || '0') || 0;
    let last_rx = parseFloat(serverExists.last_rx || '0') || 0;
    let last_tx = parseFloat(serverExists.last_tx || '0') || 0;
    let reset_month = serverExists.reset_month || currentMonthStr;

    // 一次性载入设置（带缓存）
    const sys = await loadSettings(env.DB);

    if (sys.auto_reset_traffic === 'true' && currentMonthStr !== reset_month) {
      monthly_rx = 0;
      monthly_tx = 0;
      reset_month = currentMonthStr;
    }

    const current_rx = parseFloat(metrics.net_rx || '0') || 0;
    const current_tx = parseFloat(metrics.net_tx || '0') || 0;

    // 计数器跳变（重启后会归零，要兼容）
    monthly_rx += (current_rx >= last_rx) ? (current_rx - last_rx) : current_rx;
    monthly_tx += (current_tx >= last_tx) ? (current_tx - last_tx) : current_tx;
    last_rx = current_rx;
    last_tx = current_tx;

    await env.DB.prepare(`
      UPDATE servers
      SET cpu = ?, ram = ?, disk = ?, load_avg = ?, uptime = ?, last_updated = ?,
          ram_total = ?, net_rx = ?, net_tx = ?, net_in_speed = ?, net_out_speed = ?,
          os = ?, cpu_info = ?, arch = ?, boot_time = ?, ram_used = ?, swap_total = ?,
          swap_used = ?, disk_total = ?, disk_used = ?, processes = ?, tcp_conn = ?, udp_conn = ?,
          country = ?, ip_v4 = ?, ip_v6 = ?, ping_ct = ?, ping_cu = ?, ping_cm = ?, ping_bd = ?,
          monthly_rx = ?, monthly_tx = ?, last_rx = ?, last_tx = ?, reset_month = ?
      WHERE id = ?
    `).bind(
      str(metrics.cpu), str(metrics.ram), str(metrics.disk), str(metrics.load), str(metrics.uptime), Date.now(),
      str(metrics.ram_total), str(metrics.net_rx), str(metrics.net_tx),
      str(metrics.net_in_speed), str(metrics.net_out_speed),
      str(metrics.os), str(metrics.cpu_info), str(metrics.arch), str(metrics.boot_time),
      str(metrics.ram_used), str(metrics.swap_total), str(metrics.swap_used),
      str(metrics.disk_total), str(metrics.disk_used), str(metrics.processes),
      str(metrics.tcp_conn), str(metrics.udp_conn), countryCode,
      str(metrics.ip_v4, '0'), str(metrics.ip_v6, '0'),
      str(metrics.ping_ct), str(metrics.ping_cu), str(metrics.ping_cm), str(metrics.ping_bd),
      String(monthly_rx), String(monthly_tx), String(last_rx), String(last_tx), reset_month,
      id
    ).run();

    // 历史数据
    ctx.waitUntil(saveMetricsHistory(env.DB, id, metrics));

    // 离线告警检查现已移到 cron（每 2 分钟跑一次），不再每次上报都全表扫
    // 见 wrangler.toml triggers + index.js scheduled 处理器

    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('update 失败:', e);
    return new Response('Bad Request', { status: 400 });
  }
}

// 安全字符串转换（避免 null/undefined 进库）
function str(v, fallback = '0') {
  if (v == null) return fallback;
  return String(v);
}
