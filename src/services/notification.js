// =============================================
// 通知服务（Telegram / 企业微信 / 自动识别）
// =============================================
//
// `tg_bot_token` 字段同时承担两个用途：
//   - Telegram：bot token 字符串，如 "123:ABC-DEF"
//   - 企业微信：完整 webhook URL，如 "https://qyapi.weixin.qq.com/..."
// 我们根据是否以 http(s):// 开头来判断该用哪条通道。
//

function isWebhookUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

export async function sendNotification(sys, msg) {
  if (sys.tg_notify !== 'true' || !sys.tg_bot_token) return;

  try {
    if (isWebhookUrl(sys.tg_bot_token)) {
      // 企业微信
      await fetch(sys.tg_bot_token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content: msg }
        })
      });
    } else if (sys.tg_chat_id) {
      // Telegram - bot token 本身是 URL-safe 的（数字:字母数字_-），不能再 encodeURIComponent
      // 否则 ":" 会被编码成 "%3A" 导致 API 拒绝
      await fetch(`https://api.telegram.org/bot${sys.tg_bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: sys.tg_chat_id,
          text: msg,
          parse_mode: 'Markdown'
        })
      });
    }
    // 既不是 URL 又没 chat_id：静默忽略
  } catch (e) {
    console.error('通知发送失败:', e);
  }
}

// 兼容旧函数名（避免破坏可能的外部 import）
export const sendTelegramNotification = sendNotification;
export const sendWeworkNotification = sendNotification;

export async function checkOfflineNodes(db, sys) {
  if (sys.tg_notify !== 'true') return;
  if (!sys.tg_bot_token) return;

  try {
    const { results: allServers } = await db.prepare(
      'SELECT id, name, last_updated FROM servers'
    ).all();
    if (!allServers || allServers.length === 0) return;

    let alertState = {};
    const stateRes = await db.prepare(
      "SELECT value FROM settings WHERE key = 'alert_state'"
    ).first();
    if (stateRes) {
      try { alertState = JSON.parse(stateRes.value) || {}; } catch (e) { alertState = {}; }
    }

    let stateChanged = false;
    const now = Date.now();
    const tasks = [];

    for (const s of allServers) {
      const lastUpdated = new Date(s.last_updated).getTime();
      const isOffline = (now - lastUpdated) > 300_000; // 5 分钟

      if (isOffline && !alertState[s.id]) {
        const msg = `⚠️ **节点离线告警**\n\n` +
          `**节点名称:** ${s.name}\n` +
          `**状态:** 离线 (超过 5 分钟未上报)\n` +
          `**时间:** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
        tasks.push(sendNotification(sys, msg));
        alertState[s.id] = true;
        stateChanged = true;
      } else if (!isOffline && alertState[s.id]) {
        const msg = `✅ **节点恢复通知**\n\n` +
          `**节点名称:** ${s.name}\n` +
          `**状态:** 恢复在线\n` +
          `**时间:** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
        tasks.push(sendNotification(sys, msg));
        delete alertState[s.id];
        stateChanged = true;
      }
    }

    // 并发发送，不互相阻塞
    if (tasks.length > 0) await Promise.allSettled(tasks);

    if (stateChanged) {
      await db.prepare(
        // 注意：SQLite 的字符串字面量必须用单引号，双引号是标识符
        "INSERT INTO settings (key, value) VALUES ('alert_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(JSON.stringify(alertState)).run();
    }
  } catch (e) {
    console.error('离线检测失败:', e);
  }
}
