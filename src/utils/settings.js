// =============================================
// 设置加载（带 5 秒内存缓存，减少 D1 读压力）
// =============================================
//
// ⚠️ 已知限制：缓存仅在单 isolate 生效
// -----------------------------------------------
// Cloudflare Workers 会把请求分发到多个 isolate（V8 实例），
// 每个 isolate 有自己的模块级变量。`invalidateSettingsCache()`
// 只能清除当前 isolate 的缓存，其他 isolate 中的旧设置最多
// 会再活 5 秒（CACHE_TTL）。
//
// 这对设置面板来说几乎无感（保存后 ≤ 5s 全网生效），
// 如果需要严格的全局一致性，应考虑：
//   - 把缓存挪到 Workers KV / D1（成本：每次读写都要付费）
//   - 缩短 TTL 到 1 秒（成本：D1 读次数 × N）
//   - 接受短暂的不一致（当前选择）
//

const DEFAULTS = Object.freeze({
  site_title: 'Cloudflare-Agent',
  admin_title: '管理后台',
  theme: 'auto',
  custom_bg: '',
  custom_css: '',
  custom_head: '',
  custom_script: '',
  is_public: 'true',
  show_price: 'true',
  show_expire: 'true',
  show_bw: 'true',
  show_tf: 'true',
  tg_notify: 'false',
  tg_bot_token: '',
  tg_chat_id: '',
  auto_reset_traffic: 'false'
});

// 模块级缓存：仅当前 isolate 内有效
let _cache = null;
let _cachedAt = 0;
const CACHE_TTL = 5000; // 5 秒

export async function loadSettings(db, { force = false } = {}) {
  const now = Date.now();
  if (!force && _cache && (now - _cachedAt) < CACHE_TTL) {
    return _cache;
  }
  const merged = { ...DEFAULTS };
  try {
    const { results } = await db.prepare('SELECT key, value FROM settings').all();
    if (results && results.length > 0) {
      for (const r of results) {
        if (r.key) merged[r.key] = r.value;
      }
    }
  } catch (e) {
    console.error('loadSettings 失败:', e);
  }
  _cache = merged;
  _cachedAt = now;
  return merged;
}

// 后台保存设置后调用：仅清当前 isolate 的缓存
// 其他 isolate 上的旧值会在 CACHE_TTL 内自然过期
export function invalidateSettingsCache() {
  _cache = null;
  _cachedAt = 0;
}
