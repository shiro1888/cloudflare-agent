// =============================================
// 简单限流（基于 D1，跨 isolate 一致）
// =============================================
//
// 用 D1 的 settings 表做计数器（key="ratelimit:login:1.2.3.4"）
// 超过阈值返回 429，自动滑动窗口
//
// 适合低频敏感操作（登录、密码重置等），不适合高 QPS 接口

const RATE_LIMIT_PREFIX = 'ratelimit:';

/**
 * 检查并记录一次访问
 * @returns {Promise<{ok: boolean, remaining: number, retryAfter: number}>}
 */
export async function checkRateLimit(db, { key, limit, windowMs }) {
  const fullKey = RATE_LIMIT_PREFIX + key;
  const now = Date.now();
  try {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(fullKey).first();
    let entry = { count: 0, resetAt: now + windowMs };
    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && typeof parsed.resetAt === 'number') {
          // 窗口未过期：累加；已过期：重置
          if (parsed.resetAt > now) entry = parsed;
        }
      } catch (e) {}
    }
    entry.count += 1;

    await db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(fullKey, JSON.stringify(entry)).run();

    if (entry.count > limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      };
    }
    return {
      ok: true,
      remaining: limit - entry.count,
      retryAfter: 0
    };
  } catch (e) {
    console.error('rate limit check failed:', e);
    // 失败时放行（避免数据库故障导致全站不可用）
    return { ok: true, remaining: -1, retryAfter: 0 };
  }
}

/**
 * 成功登录后清除计数
 */
export async function clearRateLimit(db, key) {
  try {
    await db.prepare('DELETE FROM settings WHERE key = ?')
      .bind(RATE_LIMIT_PREFIX + key).run();
  } catch (e) {}
}

/**
 * 提取请求来源 IP（用于限流 key）
 */
export function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Real-IP')
      || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
      || 'unknown';
}
