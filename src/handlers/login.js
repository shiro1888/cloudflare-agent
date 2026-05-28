import { makeSessionCookie, clearSessionCookie, timingSafeStringEqual } from '../middleware/auth.js';
import { checkRateLimit, clearRateLimit, getClientIp } from '../middleware/rate-limit.js';
import { getThemeStyles, getBaseStyles, getThemeClass } from '../themes/styles.js';
import { escapeHtml, safeJsonInScript, sanitizeNextPath } from '../utils/sanitize.js';

export async function handleLoginPage(request, env, sys) {
  const url = new URL(request.url);
  const next = sanitizeNextPath(url.searchParams.get('next'));
  const error = url.searchParams.get('error');

  const themeStyles = getThemeStyles(sys);
  const baseStyles = getBaseStyles();
  const themeClass = getThemeClass(sys);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 · ${escapeHtml(sys.site_title)}</title>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/alpinejs/3.13.5/cdn.min.js"></script>
  ${sys.custom_head || ''}
  <style>
    ${baseStyles}
    ${themeStyles}
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }

    /* 登录卡 */
    .login-card {
      width: 100%;
      max-width: 380px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,.04), 0 12px 40px -8px rgba(0,0,0,.08);
      animation: card-in .55s var(--ease-out-expo);
    }
    body.dark .login-card { box-shadow: 0 1px 3px rgba(0,0,0,.3), 0 12px 40px -8px rgba(0,0,0,.5); }
    @keyframes card-in { from { opacity:0; transform: translateY(20px) scale(.98); } to { opacity:1; transform: translateY(0) scale(1); } }

    .logo {
      width: 44px; height: 44px;
      border-radius: 10px;
      background: var(--text); color: var(--bg);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
    }
    .login-title {
      text-align: center;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -.02em;
      margin-bottom: 6px;
    }
    .login-subtitle {
      text-align: center;
      font-size: 13px;
      color: var(--text-3);
      margin-bottom: 28px;
    }

    .field { margin-bottom: 14px; }
    .field label {
      display: block;
      font-size: 12px;
      color: var(--text-2);
      margin-bottom: 6px;
      font-weight: 500;
    }
    .field .input {
      height: 40px;
      font-size: 14px;
    }
    .field-pwd { position: relative; }
    .field-pwd .toggle {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: none; cursor: pointer;
      color: var(--text-3); border-radius: 6px;
      transition: color .25s var(--ease-out-expo), background .25s var(--ease-out-expo);
    }
    .field-pwd .toggle:hover { color: var(--text); background: var(--surface-2); }

    .login-btn {
      width: 100%; height: 40px; font-size: 14px;
      margin-top: 8px;
    }

    .alert {
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(220,38,38,.06);
      border: 1px solid rgba(220,38,38,.2);
      color: var(--red);
      font-size: 13px;
      margin-bottom: 16px;
      display: flex; align-items: center; gap: 8px;
      animation: shake .4s var(--ease-out-expo);
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }

    .footer-link {
      text-align: center;
      font-size: 12px;
      color: var(--text-3);
      margin-top: 20px;
    }
    .footer-link a { color: var(--text-2); }
    .footer-link a:hover { color: var(--text); }

    /* 切换主题按钮固定右上 */
    .theme-toggle {
      position: fixed; top: 16px; right: 16px;
    }

    /* 加载状态 */
    .login-btn[data-loading="true"] {
      opacity: .7; cursor: not-allowed;
    }
    .spinner {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .spinner::before,
    .spinner::after {
      content: '';
      width: 6px; height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.85);
      animation: dot-bounce 1.4s ease-in-out infinite;
    }
    .spinner > span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.85);
      animation: dot-bounce 1.4s ease-in-out infinite;
      animation-delay: 0.2s;
    }
    .spinner::before { animation-delay: 0s; }
    .spinner::after  { animation-delay: 0.4s; }
    @keyframes dot-bounce {
      0%, 60%, 100% { transform: translateY(0);    opacity: 0.4; }
      30%           { transform: translateY(-6px); opacity: 1; }
    }
  </style>
</head>
<body class="${themeClass}" x-data="loginApp()" x-init="init()">

  <button @click="toggleTheme()" class="btn btn-ghost btn-icon theme-toggle" title="切换主题">
    <template x-if="effectiveTheme === 'dark'">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    </template>
    <template x-if="effectiveTheme !== 'dark'">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </template>
  </button>

  <div class="login-card">
    <div class="logo">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    </div>
    <div class="login-title">${escapeHtml(sys.site_title)}</div>
    <div class="login-subtitle">登录管理后台</div>

    <template x-if="errorMsg">
      <div class="alert">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <span x-text="errorMsg"></span>
      </div>
    </template>

    <form @submit.prevent="submit()">
      <div class="field">
        <label>用户名</label>
        <input x-model="username" type="text" class="input" placeholder="admin" autocomplete="username" autofocus />
      </div>
      <div class="field">
        <label>密码</label>
        <div class="field-pwd">
          <input x-model="password" :type="showPwd ? 'text' : 'password'" class="input" placeholder="••••••••" autocomplete="current-password" style="padding-right:38px;" />
          <button type="button" class="toggle" @click="showPwd = !showPwd" :title="showPwd ? '隐藏' : '显示'">
            <template x-if="!showPwd">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </template>
            <template x-if="showPwd">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            </template>
          </button>
        </div>
      </div>
      <button type="submit" class="btn btn-primary login-btn" :data-loading="loading">
        <template x-if="!loading"><span>登录</span></template>
        <template x-if="loading"><span class="spinner"><span></span></span></template>
      </button>
    </form>

    <div class="footer-link">
      <a href="/">← 返回前台</a>
    </div>
  </div>

  <script>
    function loginApp() {
      return {
        theme: '${themeClass}',
        username: 'admin',
        password: '',
        showPwd: false,
        loading: false,
        errorMsg: ${safeJsonInScript(error === 'invalid' ? '用户名或密码错误' : (error || ''))} || null,

        get effectiveTheme() {
          if (this.theme === 'dark') return 'dark';
          if (this.theme === 'light') return 'light';
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        },
        toggleTheme() {
          const next = this.effectiveTheme === 'dark' ? 'light' : 'dark';
          this.theme = next;
          document.body.classList.remove('dark','light','auto');
          document.body.classList.add(next);
          localStorage.setItem('cf_theme', next);
        },
        async submit() {
          if (this.loading) return;
          if (!this.username || !this.password) {
            this.errorMsg = '请输入用户名和密码';
            return;
          }
          this.loading = true;
          this.errorMsg = '';
          try {
            const res = await fetch('/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ username: this.username, password: this.password })
            });
            const j = await res.json();
            if (j.success) {
              // 登录成功：跳转
              window.location.href = ${safeJsonInScript(next)} || '/admin';
            } else {
              this.errorMsg = j.error || '登录失败';
              this.loading = false;
            }
          } catch (e) {
            this.errorMsg = '网络错误，请重试';
            this.loading = false;
          }
        },
        init() {
          const savedTheme = localStorage.getItem('cf_theme');
          if (savedTheme) {
            this.theme = savedTheme;
            document.body.classList.remove('dark','light','auto');
            document.body.classList.add(savedTheme);
          }
        }
      };
    }
  </script>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

// POST /login - 校验凭据
export async function handleLoginSubmit(request, env) {
  try {
    // 限流：每个 IP 5 次/分钟
    const ip = getClientIp(request);
    const rl = await checkRateLimit(env.DB, {
      key: `login:${ip}`,
      limit: 5,
      windowMs: 60_000
    });
    if (!rl.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: `登录尝试过于频繁，请 ${rl.retryAfter} 秒后再试`
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Retry-After': String(rl.retryAfter)
        }
      });
    }

    const data = await request.json();
    const { username, password } = data;
    if (typeof username !== 'string' || typeof password !== 'string') {
      return new Response(JSON.stringify({ success: false, error: '请求格式错误' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' }
      });
    }
    // 常量时间比较，防时序攻击
    const userOk = timingSafeStringEqual(username, env.API_USER_NAME || '');
    const passOk = timingSafeStringEqual(password, env.API_SECRET || '');
    if (userOk && passOk) {
      // 登录成功 - 清除该 IP 的失败计数
      await clearRateLimit(env.DB, `login:${ip}`);
      const cookie = await makeSessionCookie(env, request);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Set-Cookie': cookie
        }
      });
    }
    return new Response(JSON.stringify({ success: false, error: '用户名或密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: '请求格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' }
    });
  }
}

// GET/POST /logout - 清除会话
export async function handleLogout(request) {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/login',
      'Set-Cookie': clearSessionCookie(request)
    }
  });
}
