import { formatBytes, getPingColor } from '../utils/format.js';
import { getThemeStyles, getFooterHtml, getBaseStyles } from '../themes/styles.js';
import { escapeHtml, safeJsonInScript } from '../utils/sanitize.js';

export async function handleServerDetail(request, env, sys, viewId) {
  const server = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(viewId).first();
  if (!server) return new Response('Server not found', { status: 404 });

  const now = Date.now();
  const serverLastUpdated = new Date(server.last_updated).getTime();
  const isOnline = (now - serverLastUpdated) < 120000;

  const cCode = (server.country || 'xx').toLowerCase();
  const flagHtml = cCode !== 'xx'
    ? `<img src="https://flagcdn.com/24x18/${cCode}.png" alt="${cCode}" loading="lazy" onerror="this.style.display='none'" style="vertical-align:middle;margin-right:6px;border-radius:2px;" />`
    : '';

  const themeStyles = getThemeStyles(sys);
  const baseStyles = getBaseStyles();
  const themeClass = (sys.theme === 'light' || sys.theme === 'theme2') ? 'light'
                  : (sys.theme === 'dark'  || sys.theme === 'theme1') ? 'dark'
                  : 'auto';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(server.name)} · ${escapeHtml(sys.site_title)}</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/chartjs-adapter-date-fns/3.0.0/chartjs-adapter-date-fns.bundle.min.js"></script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/alpinejs/3.13.5/cdn.min.js"></script>
  ${sys.custom_head || ''}
  <style>
    ${baseStyles}
    ${themeStyles}
    .info-card {
      background:var(--surface); border:1px solid var(--border);
      border-radius:8px; padding:12px;
    }
    .info-card .lbl {
      color:var(--text-3); font-size:11px; text-transform:uppercase;
      letter-spacing:.04em; margin-bottom:4px;
    }
    .info-card .val { font-size:14px; font-weight:500; }
    .chart-card {
      background:var(--surface); border:1px solid var(--border);
      border-radius:8px; padding:16px;
    }
    .chart-card .head {
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:12px;
    }
    .chart-wrap { position:relative; height:160px; width:100%; }
    .chart-wrap.full { height:280px; }
  </style>
</head>
<body class="${themeClass}" x-data="detail()" x-init="init()">

  <header class="surface" style="border-bottom:1px solid var(--border); position:sticky; top:0; z-index:40;">
    <div class="container" style="height:56px; display:flex; align-items:center; gap:16px;">
      <a href="/" style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px;height:28px;border-radius:6px;background:var(--text);color:var(--bg);display:flex;align-items:center;justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div style="font-weight:600; font-size:15px;">${escapeHtml(sys.site_title)}</div>
      </a>
      <a href="/" class="btn" style="margin-left:auto;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </a>
      <button @click="toggleTheme()" class="btn btn-ghost btn-icon" title="切换主题">
        <template x-if="effectiveTheme === 'dark'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        </template>
        <template x-if="effectiveTheme !== 'dark'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </template>
      </button>
    </div>
  </header>

  <main class="container" style="padding-top:32px; padding-bottom:32px;">

    <!-- 标题 -->
    <div style="display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px;">
      <div class="title-pop" style="display:flex; align-items:center; gap:12px;">
        ${flagHtml}
        <div>
          <h1 style="font-size:24px; font-weight:600; letter-spacing:-.02em;">${escapeHtml(server.name)}</h1>
          <p class="text-3" style="font-size:12px; margin-top:2px;">${escapeHtml(server.os || 'Linux')} · ${escapeHtml(server.arch || '')}</p>
        </div>
      </div>
      <div class="title-pop" style="display:flex; align-items:center; gap:8px; animation-delay:.1s">
        <span class="tag ${isOnline ? 'tag-online' : 'tag-offline'}">
          <span class="dot-pulse" style="width:6px;height:6px;border-radius:50%;background:${isOnline ? 'var(--green)' : 'var(--red)'};"></span>
          ${isOnline ? '在线' : '离线'}
        </span>
      </div>
    </div>

    <!-- 系统信息 -->
    <section class="stagger" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:8px; margin-bottom:32px;">
      <div class="info-card"><div class="lbl">运行时间</div><div class="val tabular-nums">${escapeHtml(server.uptime || '-')}</div></div>
      <div class="info-card"><div class="lbl">负载</div><div class="val tabular-nums">${escapeHtml(server.load_avg || '0.00')}</div></div>
      <div class="info-card"><div class="lbl">内存</div><div class="val tabular-nums">${(parseFloat(server.ram_total)/1024).toFixed(1)} GiB</div></div>
      <div class="info-card"><div class="lbl">磁盘</div><div class="val tabular-nums">${(parseFloat(server.disk_total)/1024).toFixed(1)} GiB</div></div>
      <div class="info-card"><div class="lbl">本月入站</div><div class="val tabular-nums">${formatBytes(server.monthly_rx)}</div></div>
      <div class="info-card"><div class="lbl">本月出站</div><div class="val tabular-nums">${formatBytes(server.monthly_tx)}</div></div>
      <div class="info-card"><div class="lbl">进程数</div><div class="val tabular-nums">${escapeHtml(server.processes || '0')}</div></div>
      <div class="info-card"><div class="lbl">TCP 连接</div><div class="val tabular-nums">${escapeHtml(server.tcp_conn || '0')}</div></div>
    </section>

    <!-- 时间范围 -->
    <div style="margin-bottom:16px; display:flex; gap:6px; flex-wrap:wrap;">
      <template x-for="t in [{h:0.167,l:'10m'},{h:0.5,l:'30m'},{h:1,l:'1h'},{h:3,l:'3h'},{h:6,l:'6h'},{h:12,l:'12h'},{h:24,l:'24h'}]" :key="t.l">
        <button class="chip" :class="hours === t.h ? 'active' : ''" @click="setHours(t.h)" x-text="t.l"></button>
      </template>
    </div>

    <!-- 图表网格 -->
    <section style="display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;" id="chart-grid">
      <div class="chart-card">
        <div class="head">
          <div style="font-size:13px; font-weight:500;" class="text-2">CPU 使用率</div>
          <div style="font-size:14px; font-weight:600;" class="tabular-nums" id="text-cpu">${parseFloat(server.cpu || 0).toFixed(1)}%</div>
        </div>
        <div class="chart-wrap"><canvas id="chartCPU"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="head">
          <div style="font-size:13px; font-weight:500;" class="text-2">内存使用率</div>
          <div style="font-size:14px; font-weight:600;" class="tabular-nums" id="text-ram">${parseFloat(server.ram || 0).toFixed(1)}%</div>
        </div>
        <div class="chart-wrap"><canvas id="chartRAM"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="head">
          <div style="font-size:13px; font-weight:500;" class="text-2">磁盘使用率</div>
          <div style="font-size:14px; font-weight:600;" class="tabular-nums" id="text-disk">${parseFloat(server.disk || 0).toFixed(1)}%</div>
        </div>
        <div class="chart-wrap"><canvas id="chartDisk"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="head">
          <div style="font-size:13px; font-weight:500;" class="text-2">网络速率</div>
          <div style="font-size:13px;" class="text-mono">
            <span class="tabular-nums" id="text-net-in">↓ ${formatBytes(server.net_in_speed)}/s</span>
            &nbsp;&nbsp;
            <span class="tabular-nums" id="text-net-out">↑ ${formatBytes(server.net_out_speed)}/s</span>
          </div>
        </div>
        <div class="chart-wrap"><canvas id="chartNet"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="head">
          <div style="font-size:13px; font-weight:500;" class="text-2">进程数</div>
          <div style="font-size:14px; font-weight:600;" class="tabular-nums" id="text-proc">${escapeHtml(server.processes || '0')}</div>
        </div>
        <div class="chart-wrap"><canvas id="chartProc"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="head">
          <div style="font-size:13px; font-weight:500;" class="text-2">连接数</div>
          <div style="font-size:13px;" class="text-mono">
            <span class="tabular-nums">TCP <b id="text-tcp">${escapeHtml(server.tcp_conn || '0')}</b></span>
            &nbsp;&nbsp;
            <span class="tabular-nums">UDP <b id="text-udp">${escapeHtml(server.udp_conn || '0')}</b></span>
          </div>
        </div>
        <div class="chart-wrap"><canvas id="chartConn"></canvas></div>
      </div>

      <div class="chart-card" style="grid-column: 1 / -1;">
        <div class="head">
          <div style="font-size:13px; font-weight:500;" class="text-2">国内运营商延迟</div>
          <div style="font-size:12px; display:flex; gap:14px;" class="text-mono">
            <span>CT <b id="t-ct">${escapeHtml(server.ping_ct || '0')}ms</b></span>
            <span>CU <b id="t-cu">${escapeHtml(server.ping_cu || '0')}ms</b></span>
            <span>CM <b id="t-cm">${escapeHtml(server.ping_cm || '0')}ms</b></span>
            <span>BD <b id="t-bd">${escapeHtml(server.ping_bd || '0')}ms</b></span>
          </div>
        </div>
        <div class="chart-wrap full"><canvas id="chartPing"></canvas></div>
      </div>
    </section>

    <div class="text-3" style="text-align:center; font-size:12px; margin-top:24px;">
      最后上报：${new Date(serverLastUpdated).toLocaleString(undefined, { hour12: false })} · 自动刷新 5s/60s
    </div>

    ${getFooterHtml()}
  </main>

  <script>
    function detail() {
      const SERVER_ID = ${safeJsonInScript(viewId)};

      return {
        theme: '${themeClass}',
        hours: 1,
        charts: {},
        statusTimer: null,
        historyTimer: null,

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
          this.recolorCharts();
        },

        chartColors() {
          const isDark = this.effectiveTheme === 'dark';
          return {
            line:   isDark ? '#f5f5f5' : '#171717',
            grid:   isDark ? '#1f1f1f' : '#ececec',
            tick:   isDark ? '#737373' : '#a3a3a3',
            green:  isDark ? '#22c55e' : '#16a34a',
            red:    isDark ? '#ef4444' : '#dc2626',
            amber:  isDark ? '#f59e0b' : '#d97706',
            blue:   isDark ? '#3b82f6' : '#2563eb',
            tipBg:  isDark ? '#f5f5f5' : '#171717',
            tipFg:  isDark ? '#0a0a0a' : '#ffffff',
          };
        },

        baseOptions(unit) {
          const c = this.chartColors();
          const hrs = this.hours;
          return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400, easing: 'easeOutQuart' },
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: c.tipBg, titleColor: c.tipFg, bodyColor: c.tipFg,
                padding: 8, displayColors: false, cornerRadius: 4,
                titleFont: { size: 11 }, bodyFont: { size: 11 }
              }
            },
            scales: {
              x: {
                type: 'time',
                time: { unit: hrs <= 3 ? 'minute' : 'hour', displayFormats: { minute: 'HH:mm', hour: 'MM-dd HH:mm' } },
                ticks: { color: c.tick, font: { size: 10 }, maxTicksLimit: 6, maxRotation: 0 },
                grid: { color: c.grid, drawBorder: false, tickLength: 0 }
              },
              y: {
                beginAtZero: true,
                ticks: { color: c.tick, font: { size: 10 }, callback: v => v + unit },
                grid: { color: c.grid, drawBorder: false, tickLength: 0 }
              }
            },
            elements: {
              point: { radius: 0, hoverRadius: 4 },
              line: { tension: 0.3, borderWidth: 1.4, fill: false }
            }
          };
        },

        createChart(id, datasets, opts) {
          const ctx = document.getElementById(id);
          if (!ctx) return null;
          if (this.charts[id]) { try { this.charts[id].destroy(); } catch(e) {} }
          this.charts[id] = new Chart(ctx, { type: 'line', data: { datasets }, options: opts });
          return this.charts[id];
        },

        async fetchHistory() {
          try {
            const res = await fetch('/api/history/all?id=' + encodeURIComponent(SERVER_ID) + '&hours=' + this.hours, { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
          } catch (e) { return null; }
        },

        async fetchLatest() {
          try {
            const res = await fetch('/api/server?id=' + encodeURIComponent(SERVER_ID), { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
          } catch (e) { return null; }
        },

        renderHistory(rows) {
          if (!Array.isArray(rows)) rows = [];
          const c = this.chartColors();
          const map = (key) => rows.map(r => ({ x: r.timestamp, y: parseFloat(r[key]) || 0 }));
          this.createChart('chartCPU',  [{ data: map('cpu'),  borderColor: c.line }], this.baseOptions('%'));
          this.createChart('chartRAM',  [{ data: map('ram'),  borderColor: c.line }], this.baseOptions('%'));
          this.createChart('chartDisk', [{ data: map('disk'), borderColor: c.line }], this.baseOptions('%'));
          this.createChart('chartProc', [{ data: map('processes'), borderColor: c.line }], this.baseOptions(''));
          this.createChart('chartNet', [
            { data: map('net_in_speed'),  borderColor: c.green, label: 'In' },
            { data: map('net_out_speed'), borderColor: c.blue,  label: 'Out' }
          ], this.baseOptions(' B/s'));
          this.createChart('chartConn', [
            { data: map('tcp_conn'), borderColor: c.line, label: 'TCP' },
            { data: map('udp_conn'), borderColor: c.tick, label: 'UDP' }
          ], this.baseOptions(''));
          this.createChart('chartPing', [
            { data: map('ping_ct'), borderColor: c.green, label: 'CT' },
            { data: map('ping_cu'), borderColor: c.amber, label: 'CU' },
            { data: map('ping_cm'), borderColor: c.blue,  label: 'CM' },
            { data: map('ping_bd'), borderColor: c.red,   label: 'BD' }
          ], this.baseOptions('ms'));
        },

        recolorCharts() {
          // 重新拉一次数据并重画
          this.fetchHistory().then(rows => this.renderHistory(rows || []));
        },

        async setHours(h) {
          this.hours = h;
          const rows = await this.fetchHistory();
          this.renderHistory(rows || []);
        },

        async refreshLatest() {
          const s = await this.fetchLatest();
          if (!s) return;
          const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
          setT('text-cpu',  parseFloat(s.cpu  || 0).toFixed(1) + '%');
          setT('text-ram',  parseFloat(s.ram  || 0).toFixed(1) + '%');
          setT('text-disk', parseFloat(s.disk || 0).toFixed(1) + '%');
          setT('text-proc', s.processes || '0');
          setT('text-tcp', s.tcp_conn || '0');
          setT('text-udp', s.udp_conn || '0');
          setT('t-ct', (s.ping_ct || '0') + 'ms');
          setT('t-cu', (s.ping_cu || '0') + 'ms');
          setT('t-cm', (s.ping_cm || '0') + 'ms');
          setT('t-bd', (s.ping_bd || '0') + 'ms');
          // 网速
          const fmt = (b) => {
            const v = parseInt(b);
            if (!v || isNaN(v)) return '0 B';
            const k = 1024, sz = ['B','KB','MB','GB','TB'];
            const i = Math.floor(Math.log(v) / Math.log(k));
            return (v / Math.pow(k, i)).toFixed(2) + sz[i];
          };
          setT('text-net-in',  '↓ ' + fmt(s.net_in_speed)  + '/s');
          setT('text-net-out', '↑ ' + fmt(s.net_out_speed) + '/s');
        },

        async init() {
          // 应用本地主题
          const savedTheme = localStorage.getItem('cf_theme');
          if (savedTheme) {
            this.theme = savedTheme;
            document.body.classList.remove('dark','light','auto');
            document.body.classList.add(savedTheme);
          }
          // 全局 Chart.js 默认色
          Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
          Chart.defaults.font.size = 10;
          // 等布局稳定后画图
          setTimeout(async () => {
            const rows = await this.fetchHistory();
            this.renderHistory(rows || []);
          }, 200);
          // 自动刷新
          this.statusTimer  = setInterval(() => this.refreshLatest(), 5000);
          this.historyTimer = setInterval(async () => {
            const rows = await this.fetchHistory();
            this.renderHistory(rows || []);
          }, 60000);
        }
      };
    }
  </script>
  ${sys.custom_script || ''}
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

// 工具函数已迁移至 utils/sanitize.js
