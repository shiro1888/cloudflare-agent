// =============================================
// 输入/输出净化工具（XSS / 重定向 / 注入防护）
// =============================================

/**
 * HTML 实体转义 - 用于把不可信字符串注入到 HTML 内容/属性中
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 安全地把 JS 数据注入到内联 <script> 块。
 * 防御点：
 *   - 防 </script> 突破
 *   - 防 HTML 注释序列突破
 *   - 防行分隔符（U+2028 / U+2029）破坏 JS 解析
 */
export function safeJsonInScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * 校验并消毒"登录后跳转"路径，防止开放重定向 / javascript: XSS
 *
 * 允许：
 *   - "/admin"
 *   - "/?id=xxx"
 *   - "/admin?tab=settings"
 *
 * 拒绝：
 *   - "javascript:..."
 *   - "//evil.com/path"（协议相对 URL）
 *   - "https://evil.com/..."
 *   - 空字符串 / null
 *   - 不以 / 开头的相对路径
 *
 * @param {string|null|undefined} input
 * @param {string} fallback - 默认安全路径
 * @returns {string} 一定以单个 / 开头的安全本地路径
 */
export function sanitizeNextPath(input, fallback = '/admin') {
  if (typeof input !== 'string' || !input) return fallback;
  // 必须以 / 开头
  if (!input.startsWith('/')) return fallback;
  // 不能是协议相对 URL "//host/..."
  if (input.startsWith('//')) return fallback;
  // 不能含反斜杠（某些浏览器把 \\ 当 //）
  if (input.startsWith('/\\')) return fallback;
  // 控制字符 / 换行符
  if (/[\x00-\x1f]/.test(input)) return fallback;
  // 长度限制
  if (input.length > 512) return fallback;
  return input;
}
