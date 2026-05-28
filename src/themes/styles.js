// =============================================
// 主题样式 - 极简风格
// =============================================
//
// 主题取值：'light' | 'dark' | 'auto'（默认）
// auto 跟随系统 prefers-color-scheme
//

const LIGHT_VARS = `
  --bg: #ffffff;
  --surface: #ffffff;
  --surface-2: #fafafa;
  --border: #ececec;
  --border-strong: #d4d4d4;
  --text: #171717;
  --text-2: #737373;
  --text-3: #a3a3a3;
  --green: #16a34a;
  --red: #dc2626;
  --amber: #d97706;
  --blue: #2563eb;
`;

const DARK_VARS = `
  --bg: #0a0a0a;
  --surface: #0f0f0f;
  --surface-2: #161616;
  --border: #1f1f1f;
  --border-strong: #2a2a2a;
  --text: #f5f5f5;
  --text-2: #a3a3a3;
  --text-3: #737373;
  --green: #22c55e;
  --red: #ef4444;
  --amber: #f59e0b;
  --blue: #3b82f6;
`;

// 把 sys.theme 归一化为 'light' | 'dark' | 'auto'
export function getThemeClass(sys) {
  const t = sys && sys.theme;
  if (t === 'light' || t === 'dark' || t === 'auto') return t;
  return 'auto';
}

export function getThemeStyles(sys) {
  return `
    :root { ${LIGHT_VARS} --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1); }
    @media (prefers-color-scheme: dark) {
      body.auto { ${DARK_VARS} }
    }
    body.dark { ${DARK_VARS} }
    body.light { ${LIGHT_VARS} }
    /* 用户自定义 CSS（管理后台填的，可任意覆写） */
    ${sys.custom_css || ''}
    /* 自定义背景图片 */
    ${sys.custom_bg ? `
      body { background-image: url('${sys.custom_bg}'); background-size: cover; background-attachment: fixed; }
    ` : ''}
  `;
}

export function getFooterHtml() {
  return `
    <footer style="margin-top:64px; padding:24px 0; text-align:center; border-top:1px solid var(--border); font-size:12px; color:var(--text-3);">
      Powered by
      <a href="https://github.com/shiro1888/cloudflare-agent" target="_blank" rel="noopener" class="footer-link">cloudflare-agent</a>
    </footer>
  `;
}

// 共用基础样式（被 dashboard / server-detail / admin-ui 引用）
export function getBaseStyles() {
  return `
    /* 字体（系统字体优先，无需远程字体减少加载延迟） */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      font-size: 14px;
      line-height: 1.5;
    }
    .text-mono {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace;
    }
    button, a { -webkit-tap-highlight-color: transparent; }
    a { color: inherit; text-decoration: none; }
    input, button, select, textarea { font-family: inherit; }

    .surface { background: var(--surface); border-color: var(--border); }
    .border-soft { border-color: var(--border); }
    .text-2 { color: var(--text-2); }
    .text-3 { color: var(--text-3); }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }

    /* 按钮 */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 32px; padding: 0 12px;
      border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text);
      font-size: 13px; font-weight: 500; cursor: pointer;
      transition: background .35s var(--ease-out-expo), border-color .35s var(--ease-out-expo), opacity .35s var(--ease-out-expo);
      white-space: nowrap;
    }
    .btn:hover { background: var(--surface-2); border-color: var(--border-strong); }
    .btn:active { opacity: .8; }
    .btn-primary { background: var(--text); color: var(--bg); border-color: var(--text); }
    .btn-primary:hover { opacity: .9; background: var(--text); }
    .btn-ghost { border-color: transparent; background: transparent; }
    .btn-ghost:hover { background: var(--surface-2); }
    .btn-danger { color: var(--red); }
    .btn-danger:hover { background: rgba(220,38,38,.06); border-color: rgba(220,38,38,.4); }
    .btn-icon { width: 32px; padding: 0; }

    /* 输入 */
    .input {
      height: 32px; padding: 0 10px;
      border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text);
      font-size: 13px; outline: none;
      transition: border-color .25s var(--ease-out-expo), box-shadow .25s var(--ease-out-expo);
      width: 100%;
    }
    .input:focus { border-color: var(--text); box-shadow: 0 0 0 3px rgba(0,0,0,.04); }
    body.dark .input:focus { box-shadow: 0 0 0 3px rgba(255,255,255,.06); }
    .input::placeholder { color: var(--text-3); }
    textarea.input { height: auto; padding: 8px 10px; line-height: 1.5; resize: vertical; }
    select.input {
      padding-right: 28px; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 8px center; background-size: 14px;
    }

    /* Segmented control */
    .seg { position: relative; display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; }
    .seg-item {
      position: relative; z-index: 2; padding: 6px 22px;
      font-size: 13px; font-weight: 500; color: var(--text-2);
      cursor: pointer; transition: color .4s var(--ease-out-expo);
      background: transparent; border: none; border-radius: 7px; white-space: nowrap;
      outline: none;
    }
    .seg-item:hover { color: var(--text); }
    .seg-item.active { color: var(--text); font-weight: 600; }
    .seg-indicator {
      position: absolute; top: 4px; bottom: 4px;
      background: var(--surface); border-radius: 7px;
      box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 0 0 1px var(--border);
      transition: left .65s var(--ease-out-expo), width .65s var(--ease-out-expo);
      z-index: 1; pointer-events: none;
    }
    body.dark .seg-indicator { box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 0 0 1px var(--border-strong); }

    /* Chip */
    .chip {
      display: inline-flex; align-items: center; gap: 5px;
      height: 26px; padding: 0 10px;
      border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface);
      font-size: 12px; color: var(--text-2);
      cursor: pointer; transition: all .35s var(--ease-out-expo);
    }
    .chip:hover { border-color: var(--border-strong); color: var(--text); }
    .chip.active { background: var(--text); color: var(--bg); border-color: var(--text); }
    .chip.active .chip-count { color: var(--bg); opacity: 0.6; }
    .chip-count { color: var(--text-3); margin-left: 2px; font-variant-numeric: tabular-nums; }

    /* 表格 */
    .tbl { width: 100%; font-size: 13px; border-collapse: collapse; }
    .tbl th {
      text-align: left; padding: 10px 16px;
      font-size: 11px; font-weight: 500; letter-spacing: .02em;
      color: var(--text-3); text-transform: uppercase;
      border-bottom: 1px solid var(--border);
    }
    .tbl td { padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .tbl tbody tr { transition: background .35s var(--ease-out-expo); }
    .tbl tbody tr:hover { background: var(--surface-2); }
    .tbl tbody tr:last-child td { border-bottom: 0; }

    /* 进度条 */
    .bar { background: var(--border); height: 2px; border-radius: 999px; overflow: hidden; }
    .bar > div { height: 100%; transition: width 1.4s var(--ease-out-expo); }

    /* 标签 */
    .tag {
      display: inline-flex; align-items: center; gap: 4px;
      height: 22px; padding: 0 8px; border-radius: 5px;
      font-size: 11px; font-weight: 500;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
    }
    .tag-online { color: var(--green); border-color: rgba(22,163,74,.25); background: rgba(22,163,74,.06); }
    .tag-offline { color: var(--red); border-color: rgba(220,38,38,.25); background: rgba(220,38,38,.06); }

    /* 状态点 - 完全静止，只是颜色慢慢变（10s 周期，类似呼吸但没有形变） */
    .dot-pulse {
      animation: dot-breathe 10s ease-in-out infinite;
    }
    @keyframes dot-breathe {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.25; }
    }

    /* Toast */
    .toast-stack { position: fixed; bottom: 16px; right: 16px; z-index: 70; display: flex; flex-direction: column; gap: 8px; }
    .toast {
      background: var(--text); color: var(--bg);
      padding: 10px 14px; border-radius: 8px;
      font-size: 13px; font-weight: 500;
      display: flex; align-items: center; gap: 8px;
      min-width: 200px; max-width: 320px;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
      animation: toast-glide .5s var(--ease-out-expo);
    }
    @keyframes toast-glide { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); } }

    /* kbd */
    .kbd {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      border: 1px solid var(--border); border-radius: 4px;
      background: var(--surface-2);
      font-size: 11px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', Consolas, 'Courier New', monospace;
      color: var(--text-2);
    }

    /* 入场动画 - 错峰淡入（fill-mode forwards 保持终态，避免任何重渲染时再次闪烁） */
    .stagger > * {
      opacity: 0;
      transform: translateY(12px);
      animation: fade-rise .9s var(--ease-out-expo) forwards;
    }
    .stagger > *:nth-child(1)  { animation-delay: .04s; }
    .stagger > *:nth-child(2)  { animation-delay: .08s; }
    .stagger > *:nth-child(3)  { animation-delay: .12s; }
    .stagger > *:nth-child(4)  { animation-delay: .16s; }
    .stagger > *:nth-child(5)  { animation-delay: .2s; }
    .stagger > *:nth-child(6)  { animation-delay: .24s; }
    .stagger > *:nth-child(7)  { animation-delay: .28s; }
    .stagger > *:nth-child(8)  { animation-delay: .32s; }
    .stagger > *:nth-child(9)  { animation-delay: .36s; }
    .stagger > *:nth-child(10) { animation-delay: .4s; }
    .stagger > *:nth-child(11) { animation-delay: .44s; }
    .stagger > *:nth-child(12) { animation-delay: .48s; }
    @keyframes fade-rise { to { opacity: 1; transform: translateY(0); } }

    .view-fade { animation: view-glide .7s var(--ease-out-expo); }
    @keyframes view-glide { 0% { opacity: 0; transform: scale(.985) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }

    .pop-in { animation: modal-fade .45s var(--ease-out-expo); }
    @keyframes modal-fade { 0% { opacity: 0; transform: scale(.96); } 100% { opacity: 1; transform: scale(1); } }

    .drawer-in { animation: drawer-glide .55s var(--ease-out-expo); }
    @keyframes drawer-glide { 0% { transform: translateX(100%); } 100% { transform: translateX(0); } }

    .overlay-fade { animation: overlay-fade .4s var(--ease-out-expo); }
    @keyframes overlay-fade { from { opacity: 0; } to { opacity: 1; } }

    .title-pop { opacity: 0; transform: translateY(16px); animation: fade-rise 1s var(--ease-out-expo) forwards; }

    /* 卡片悬停 */
    .card-hover {
      transition: transform .7s var(--ease-out-expo),
                  border-color .5s var(--ease-out-expo),
                  box-shadow .7s var(--ease-out-expo);
    }
    .card-hover:hover {
      transform: translateY(-3px);
      border-color: var(--border-strong);
      box-shadow: 0 16px 32px -16px rgba(0,0,0,.12), 0 4px 12px -4px rgba(0,0,0,.04);
    }
    body.dark .card-hover:hover { box-shadow: 0 16px 32px -16px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04); }
    .card-hover:active { transform: translateY(-1px); transition-duration: .25s; }

    /* 离线卡片：整体降饱和度，让在线节点更突出 */
    .card-offline {
      opacity: .55;
      filter: grayscale(.6);
      transition: opacity .35s var(--ease-out-expo), filter .35s var(--ease-out-expo);
    }
    .card-offline:hover { opacity: .85; filter: grayscale(.3); }

    /* utility */
    .container { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    [x-cloak] { display: none !important; }

    /* footer 链接 - 用纯 CSS 替代 inline onmouseover */
    .footer-link {
      color: var(--text); font-weight: 500;
      border-bottom: 1px solid transparent;
      transition: border-color .25s var(--ease-out-expo);
    }
    .footer-link:hover { border-bottom-color: currentColor; }

    /*
     * 减少动效偏好：尊重系统设置，但保留状态指示动画（呼吸点 / spinner）
     * 这些不是装饰，而是功能性指示，关掉反而让人误以为页面卡住
     */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        transition-duration: .01ms !important;
      }
      .dot-pulse,
      .spinner,
      .spinner > span,
      .spinner::before,
      .spinner::after {
        animation-duration: revert !important;
      }
    }
    @media (max-width: 768px) {
      .container { padding: 0 12px; }
      /* 概览卡片在窄屏回到 2 列 */
      [style*="grid-template-columns:repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
    }
  `;
}
