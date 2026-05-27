// =============================================
// 认证 - HMAC 签名会话 + Basic Auth 兼容
// =============================================
//
// 安全设计：
// - Cookie 值不再是 base64(user:pass)，而是 HMAC-SHA256 签名 token
// - Token 格式：base64url(payload).base64url(hmac)
// - Payload 含 user / iat / exp，密钥泄露后无法反推原密码
// - 签名密钥从 env.API_SECRET 派生（线上配置或本地 .dev.vars）
//

const COOKIE_NAME = 'cf_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

// =============================================
// HMAC 工具
// =============================================
const enc = new TextEncoder();
const dec = new TextDecoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode('cf-agent-session:' + (secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(secret, data) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

async function verify(secret, data, signature) {
  try {
    const key = await hmacKey(secret);
    const sigBytes = base64UrlDecode(signature);
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
  } catch (e) {
    return false;
  }
}

function base64UrlEncode(bytes) {
  let s = '';
  if (bytes instanceof Uint8Array) {
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  } else {
    s = bytes;
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// =============================================
// Cookie 解析
// =============================================
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// =============================================
// Token 创建/校验
// =============================================
async function createToken(env) {
  const payload = {
    u: env.API_USER_NAME,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE
  };
  const payloadStr = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await sign(env.API_SECRET, payloadStr);
  return `${payloadStr}.${sig}`;
}

async function verifyToken(token, env) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payloadStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const ok = await verify(env.API_SECRET, payloadStr, sig);
  if (!ok) return null;

  let payload;
  try {
    payload = JSON.parse(dec.decode(base64UrlDecode(payloadStr)));
  } catch (e) {
    return null;
  }
  if (!payload || payload.u !== env.API_USER_NAME) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// =============================================
// 检查认证（同步 wrapper：支持 cookie 异步 + basic auth 同步）
// =============================================
//
// checkAuth 在大量调用点是同步的（直接 if 判断），保持兼容：
// 优先验 Basic Auth header（同步），失败再异步验 cookie。
// 为简化迁移，这里返回 Promise<boolean>，所有调用点已改为 await。
//
export async function checkAuth(request, env) {
  // 1. Basic Auth header（探针/curl 客户端常用，同步路径）
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts[0] === 'Basic' && parts[1]) {
      try {
        const decoded = atob(parts[1]);
        const idx = decoded.indexOf(':');
        if (idx !== -1) {
          const u = decoded.slice(0, idx);
          const p = decoded.slice(idx + 1);
          if (timingSafeStringEqual(u, env.API_USER_NAME || '') &&
              timingSafeStringEqual(p, env.API_SECRET || '')) {
            return true;
          }
        }
      } catch (e) {}
    }
  }

  // 2. Cookie 签名 token（浏览器登录后用）
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies[COOKIE_NAME];
  if (token) {
    const payload = await verifyToken(token, env);
    if (payload) return true;
  }

  return false;
}

// =============================================
// 常量时间字符串比较（不通过长度泄露信息）
// =============================================
export function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // 不能因长度差异早返回，否则会泄露长度信息
  // 取较长的那个长度做循环，多余位用 0 填充比较
  const len = Math.max(a.length, b.length);
  let result = a.length ^ b.length; // 长度差也参与运算
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    result |= ca ^ cb;
  }
  return result === 0;
}

// =============================================
// Cookie 生成 / 清除
// =============================================
export async function makeSessionCookie(env, request) {
  const token = await createToken(env);
  // Secure 标志：生产 HTTPS 必带；本地 HTTP 开发可省略
  const isSecure = isHttpsContext(request);
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${COOKIE_MAX_AGE}`];
  if (isSecure) flags.push('Secure');
  return `${COOKIE_NAME}=${token}; ${flags.join('; ')}`;
}

export function clearSessionCookie(request) {
  const isSecure = isHttpsContext(request);
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure) flags.push('Secure');
  return `${COOKIE_NAME}=; ${flags.join('; ')}`;
}

function isHttpsContext(request) {
  if (!request) return true; // 默认安全
  try {
    const url = new URL(request.url);
    if (url.protocol === 'https:') return true;
    // CF 反代特征
    const xfp = request.headers.get('X-Forwarded-Proto');
    if (xfp && xfp.toLowerCase() === 'https') return true;
    return false;
  } catch (e) {
    return true;
  }
}

// =============================================
// 响应辅助
// =============================================
export function redirectToLogin(request) {
  const url = new URL(request.url);
  const next = url.pathname + url.search;
  return new Response(null, {
    status: 302,
    headers: { 'Location': `/login?next=${encodeURIComponent(next)}` }
  });
}

export function authResponseJson() {
  return new Response(JSON.stringify({ error: 'Unauthorized', loginUrl: '/login' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' }
  });
}

// 智能：API 路径返回 JSON 401，HTML 路径重定向到登录
export function authResponse(request) {
  if (request && typeof request.headers?.get === 'function') {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api')) {
      return authResponseJson();
    }
    return redirectToLogin(request);
  }
  return new Response('Unauthorized', { status: 401 });
}
