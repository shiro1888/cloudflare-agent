import { checkAuth, authResponse } from '../middleware/auth.js';
import { formatBytes } from '../utils/format.js';
import { getThemeStyles, getFooterHtml, getBaseStyles, getThemeClass } from '../themes/styles.js';
import { escapeHtml, safeJsonInScript } from '../utils/sanitize.js';

// 把 D1 row 转成前端友好的服务器对象（dashboard / dashboardAPI 共用）
function toClientServer(server, now, sys) {
  const lastUpdated = new Date(server.last_updated).getTime();
  const isOnline = (now - lastUpdated) < 120000;
  const useMonthly = sys.auto_reset_traffic === 'true';
  const rx_val = useMonthly ? (parseFloat(server.monthly_rx) || 0) : (parseFloat(server.net_rx) || 0);
  const tx_val = useMonthly ? (parseFloat(server.monthly_tx) || 0) : (parseFloat(server.net_tx) || 0);

  let expireText = '';
  if (server.expire_date) {
    const expTime = new Date(server.expire_date).getTime();
    if (!isNaN(expTime)) {
      const diff = expTime - now;
      expireText = diff > 0 ? Math.ceil(diff / 86400000) + 'd' : 'EXPIRED';
    }
  }

  return {
    id: server.id,
    name: server.name || 'unnamed',
    country: (server.country || 'xx').toUpperCase(),
    group: server.server_group || '默认分组',
    online: isOnline,
    offlineDuration: isOnline ? 0 : Math.floor((now - lastUpdated) / 1000),
    cpu: parseFloat(server.cpu) || 0,
    ram: parseFloat(server.ram) || 0,
    disk: parseFloat(server.disk) || 0,
    netIn: server.net_in_speed || '0',
    netOut: server.net_out_speed || '0',
    netInFmt: formatBytes(server.net_in_speed),
    netOutFmt: formatBytes(server.net_out_speed),
    monthlyRx: formatBytes(rx_val),
    monthlyTx: formatBytes(tx_val),
    os: server.os || 'Linux',
    arch: server.arch || '',
    ipv4: server.ip_v4 === '1',
    ipv6: server.ip_v6 === '1',
    price: server.price || '',
    expire: expireText || (server.expire_date ? '' : '永久'),
    bandwidth: server.bandwidth || '',
    trafficLimit: server.traffic_limit || '',
    pingCt: parseInt(server.ping_ct) || 0,
    pingCu: parseInt(server.ping_cu) || 0,
    pingCm: parseInt(server.ping_cm) || 0,
    pingBd: parseInt(server.ping_bd) || 0,
    lastUpdate: Math.max(0, Math.round((now - lastUpdated) / 1000)),
    // 仅给 handleDashboard 内部统计用，handleDashboardAPI 不需要
    _rxVal: rx_val,
    _txVal: tx_val,
  };
}

export async function handleServerAPI(request, env, sys) {
  if (sys.is_public !== 'true' && !(await checkAuth(request, env))) {
    return authResponse(request);
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Missing ID', { status: 400 });
  const server = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(id).first();
  if (!server) return new Response('Not Found', { status: 404 });
  return new Response(JSON.stringify(server), { headers: { 'Content-Type': 'application/json' } });
}

// 给前台 dashboard 用的精简数据 API（用于自动刷新）
export async function handleDashboardAPI(request, env, sys) {
  if (sys.is_public !== 'true' && !(await checkAuth(request, env))) {
    return authResponse(request);
  }
  const { results } = await env.DB.prepare(
    'SELECT * FROM servers ORDER BY server_group, name'
  ).all();
  const now = Date.now();
  const servers = (results || []).map(s => {
    const c = toClientServer(s, now, sys);
    delete c._rxVal; delete c._txVal;
    return c;
  });
  return new Response(JSON.stringify({ servers }), {
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      // 边缘缓存 5 秒，多次刷新走缓存（D1 也要缓存）
      'Cache-Control': 'private, max-age=5'
    }
  });
}

export async function handleDashboard(request, env, sys) {
  if (sys.is_public !== 'true' && !(await checkAuth(request, env))) {
    return authResponse(request);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM servers ORDER BY server_group, name'
  ).all();

  const now = Date.now();

  // 统计
  let globalOnline = 0, globalOffline = 0;
  let globalSpeedIn = 0, globalSpeedOut = 0;
  let globalNetTx = 0, globalNetRx = 0;
  const countryStats = {};

  const clientServers = (results || []).map(server => {
    const c = toClientServer(server, now, sys);

    // 同步统计
    if (c.online) {
      globalOnline++;
      globalSpeedIn  += parseFloat(server.net_in_speed) || 0;
      globalSpeedOut += parseFloat(server.net_out_speed) || 0;
    } else {
      globalOffline++;
    }
    globalNetRx += c._rxVal;
    globalNetTx += c._txVal;

    // 国家统计（TW 归到 CN）
    let cCodeMap = c.country;
    if (cCodeMap === 'TW') cCodeMap = 'CN';
    if (cCodeMap !== 'XX') {
      countryStats[cCodeMap] = (countryStats[cCodeMap] || 0) + 1;
    }

    delete c._rxVal; delete c._txVal;
    return c;
  });

  const summary = {
    total: results.length,
    online: globalOnline,
    offline: globalOffline,
    speedIn: formatBytes(globalSpeedIn),
    speedOut: formatBytes(globalSpeedOut),
    trafficIn: formatBytes(globalNetRx),
    trafficOut: formatBytes(globalNetTx),
    isMonthly: sys.auto_reset_traffic === 'true',
  };

  const themeStyles = getThemeStyles(sys);
  const baseStyles = getBaseStyles();

  const themeClass = getThemeClass(sys);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sys.site_title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" crossorigin=""/>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/alpinejs/3.13.5/cdn.min.js"></script>
  ${sys.custom_head || ''}
  <style>
    ${baseStyles}
    ${themeStyles}
    /* 页面专属样式 */
    .leaflet-container { background: var(--surface) !important; }
    body.dark .leaflet-tile { filter: invert(1) hue-rotate(180deg) brightness(.95) contrast(.85); }
    .leaflet-control-attribution { display: none !important; }
  </style>
</head>
<body class="${themeClass}" x-data="dashboard()" x-init="init()">

  <!-- 顶部导航 -->
  <header class="surface" style="border-bottom:1px solid var(--border); position:sticky; top:0; z-index:40; backdrop-filter:saturate(180%) blur(10px); background:color-mix(in srgb, var(--surface) 92%, transparent);">
    <div class="container" style="height:56px; display:flex; align-items:center; gap:16px; position:relative;">
      <a href="/" style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px; height:28px; border-radius:6px; background:var(--text); color:var(--bg); display:flex; align-items:center; justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div style="font-weight:600; font-size:15px; letter-spacing:-.01em;">${escapeHtml(sys.site_title)}</div>
      </a>

      <nav style="position:absolute; left:50%; transform:translateX(-50%);">
        <div class="seg" x-ref="seg">
          <div class="seg-indicator" :style="segStyle"></div>
          <template x-for="(v, idx) in views" :key="v.id">
            <button class="seg-item" :data-seg-idx="idx" :class="currentView === v.id ? 'active' : ''" @click="currentView = v.id" x-text="v.label"></button>
          </template>
        </div>
      </nav>

      <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
        <button @click="toggleTheme()" class="btn btn-ghost btn-icon" title="切换主题">
          <template x-if="effectiveTheme === 'dark'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          </template>
          <template x-if="effectiveTheme !== 'dark'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </template>
        </button>
        <a href="/admin" class="btn btn-primary">管理后台</a>
      </div>
    </div>
  </header>

  <main class="container" style="padding-top:32px; padding-bottom:32px;">

    <!-- 标题区 -->
    <div style="display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:32px; flex-wrap:wrap; gap:12px;">
      <div>
        <h1 class="title-pop" style="font-size:24px; font-weight:600; letter-spacing:-.02em;">服务器Agent</h1>
        <p class="text-2 title-pop" style="font-size:14px; margin-top:4px; animation-delay:.1s">实时监控所有服务器状态 · 共 ${results.length} 台</p>
      </div>
      <div class="title-pop" style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-3); animation-delay:.2s">
        <span class="dot-pulse" style="width:6px;height:6px;border-radius:50%;background:var(--green)"></span>
        <span>实时同步 · <span class="tabular-nums" x-text="liveSeconds + 's'"></span></span>
      </div>
    </div>

    <!-- 概览卡 -->
    <section class="stagger" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:32px;" id="summary-grid">
      <div class="surface card-hover" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">服务器总数</div>
        <div style="font-size:24px; font-weight:600; letter-spacing:-.01em;" class="tabular-nums">${summary.total}</div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">
          <span style="color:var(--green)">●</span> 在线 <b>${summary.online}</b>
          ·
          <span style="color:var(--red)">●</span> 离线 <b>${summary.offline}</b>
        </div>
      </div>
      <div class="surface card-hover" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">实时网速</div>
        <div style="font-size:24px; font-weight:600; letter-spacing:-.01em;" class="tabular-nums">↓ ${summary.speedIn}/s</div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">↑ ${summary.speedOut}/s</div>
      </div>
      <div class="surface card-hover" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">${summary.isMonthly ? '本月流量' : '总流量'}</div>
        <div style="font-size:24px; font-weight:600; letter-spacing:-.01em;" class="tabular-nums">↓ ${summary.trafficIn}</div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">↑ ${summary.trafficOut}</div>
      </div>
      <div class="surface card-hover" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">在线率</div>
        <div style="font-size:24px; font-weight:600; letter-spacing:-.01em;" class="tabular-nums">${summary.total > 0 ? Math.round(summary.online / summary.total * 100) : 0}%</div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">${summary.online}/${summary.total} 节点上报中</div>
      </div>
    </section>

    <!-- 工具栏 -->
    <section style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:16px;">
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <template x-for="s in statusFilters" :key="s.id">
          <button class="chip" :class="statusFilter === s.id ? 'active' : ''" @click="statusFilter = s.id">
            <template x-if="s.dotColor">
              <span style="width:6px;height:6px;border-radius:50%;" :style="'background:' + s.dotColor"></span>
            </template>
            <span x-text="s.label"></span>
          </button>
        </template>
      </div>
      <div style="width:1px; height:20px; background:var(--border); margin:0 4px;"></div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
        <template x-for="f in filters" :key="f.code">
          <button class="chip" :class="activeFilter === f.code ? 'active' : ''" @click="activeFilter = f.code">
            <template x-if="f.code !== 'all'">
              <img :src="'https://flagcdn.com/16x12/' + f.code.toLowerCase() + '.png'"
                   :alt="f.code"
                   loading="lazy"
                   onerror="this.style.display='none'"
                   style="border-radius:2px;" />
            </template>
            <span x-text="f.label"></span>
            <span class="chip-count" x-text="f.count"></span>
          </button>
        </template>
      </div>
      <div style="margin-left:auto; position:relative;" x-data="{ open: false }" @click.outside="open=false">
        <button class="btn btn-ghost" @click="open = !open">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
          <span style="font-size:13px;" x-text="sortOptions.find(o => o.id === sortBy)?.label"></span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-3"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div x-show="open" x-cloak class="surface" style="position:absolute; right:0; top:calc(100% + 4px); width:180px; border:1px solid var(--border); border-radius:8px; padding:4px; box-shadow:0 4px 16px rgba(0,0,0,.08); z-index:30;">
          <template x-for="o in sortOptions" :key="o.id">
            <button @click="sortBy = o.id; open = false" :class="sortBy === o.id ? 'text-primary' : 'text-2'"
              style="width:100%; text-align:left; padding:6px 10px; border-radius:6px; font-size:13px; background:transparent; border:none; cursor:pointer; display:flex; justify-content:space-between; transition:background .2s;"
              @mouseover="$event.target.style.background='var(--surface-2)'" @mouseout="$event.target.style.background='transparent'">
              <span x-text="o.label"></span>
              <span x-show="sortBy === o.id">✓</span>
            </button>
          </template>
        </div>
      </div>
    </section>

    <!-- ============ 卡片视图 ============ -->
    <section x-show="currentView === 'cards'" x-cloak class="view-fade" :key="'cards-'+activeFilter+statusFilter+sortBy">
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:12px;" class="stagger">
        <template x-for="s in filteredServers" :key="s.id">
          <a :href="'/?id=' + s.id" class="surface card-hover" :class="!s.online ? 'card-offline' : ''" style="border:1px solid var(--border); border-radius:8px; padding:16px; display:block;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;" :style="'background:' + (s.online ? 'var(--green)' : 'var(--red)')"></span>
                <template x-if="s.country !== 'XX'">
                  <img :src="'https://flagcdn.com/20x15/' + s.country.toLowerCase() + '.png'"
                       loading="lazy"
                       onerror="this.style.display='none'"
                       style="border-radius:2px; flex-shrink:0;" />
                </template>
                <span style="font-weight:500; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" x-text="s.name"></span>
              </div>
              <span style="font-size:11px;" :style="'color:' + (s.online ? 'var(--text-3)' : 'var(--red)')"
                    x-text="s.online ? (s.lastUpdate + 's') : ('离线 ' + formatDuration(s.offlineDuration))"></span>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="text-mono text-3" style="width:36px; font-size:10px; text-transform:uppercase;">CPU</span>
                <div class="bar" style="flex:1;"><div :style="'width:'+s.cpu+'%; background:'+barColor(s.cpu)"></div></div>
                <span class="tabular-nums" style="font-size:11px; width:38px; text-align:right;" x-text="s.cpu.toFixed(0)+'%'"></span>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="text-mono text-3" style="width:36px; font-size:10px; text-transform:uppercase;">RAM</span>
                <div class="bar" style="flex:1;"><div :style="'width:'+s.ram+'%; background:'+barColor(s.ram)"></div></div>
                <span class="tabular-nums" style="font-size:11px; width:38px; text-align:right;" x-text="s.ram.toFixed(0)+'%'"></span>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="text-mono text-3" style="width:36px; font-size:10px; text-transform:uppercase;">DISK</span>
                <div class="bar" style="flex:1;"><div :style="'width:'+s.disk+'%; background:'+barColor(s.disk)"></div></div>
                <span class="tabular-nums" style="font-size:11px; width:38px; text-align:right;" x-text="s.disk.toFixed(0)+'%'"></span>
              </div>
            </div>

            <div class="text-mono text-2" style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); font-size:11px;">
              <span>↓ <span class="tabular-nums" x-text="s.netInFmt"></span>/s</span>
              <span>↑ <span class="tabular-nums" x-text="s.netOutFmt"></span>/s</span>
              <span :style="'color:'+pingColor(s.pingCt)" x-text="s.pingCt + 'ms'"></span>
            </div>
          </a>
        </template>
      </div>
      <div x-show="filteredServers.length === 0" class="text-3" style="text-align:center; padding:64px 0; font-size:14px;">
        没有符合条件的服务器
      </div>
    </section>

    <!-- ============ 列表视图 ============ -->
    <section x-show="currentView === 'table'" x-cloak class="view-fade surface" style="border:1px solid var(--border); border-radius:8px; overflow:hidden;">
      <div style="overflow-x:auto;">
        <table class="tbl">
          <thead>
            <tr>
              <th>名称</th>
              <th>区域</th>
              <th style="cursor:pointer;" @click="toggleSort('cpu')">CPU <span x-show="sortBy.startsWith('cpu')" x-text="sortBy.endsWith('asc')?'↑':'↓'"></span></th>
              <th style="cursor:pointer;" @click="toggleSort('ram')">RAM <span x-show="sortBy.startsWith('ram')" x-text="sortBy.endsWith('asc')?'↑':'↓'"></span></th>
              <th>磁盘</th>
              <th>↓ 速度</th>
              <th>↑ 速度</th>
              <th>延迟</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            <template x-for="s in filteredServers" :key="s.id">
              <tr style="cursor:pointer;" @click="window.location.href = '/?id=' + s.id">
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:6px;height:6px;border-radius:50%;" :style="'background:'+(s.online?'var(--green)':'var(--red)')"></span>
                    <span style="font-weight:500;" x-text="s.name"></span>
                  </div>
                </td>
                <td class="text-2">
                  <template x-if="s.country !== 'XX'">
                    <span style="display:inline-flex;align-items:center;gap:6px;">
                      <img :src="'https://flagcdn.com/20x15/' + s.country.toLowerCase() + '.png'"
                           loading="lazy"
                           onerror="this.style.display='none'"
                           style="border-radius:2px;" />
                      <span x-text="s.country"></span>
                    </span>
                  </template>
                  <template x-if="s.country === 'XX'"><span>-</span></template>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div class="bar" style="width:64px;"><div :style="'width:'+s.cpu+'%; background:'+barColor(s.cpu)"></div></div>
                    <span class="tabular-nums" style="font-size:12px;" x-text="s.cpu.toFixed(0)+'%'"></span>
                  </div>
                </td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div class="bar" style="width:64px;"><div :style="'width:'+s.ram+'%; background:'+barColor(s.ram)"></div></div>
                    <span class="tabular-nums" style="font-size:12px;" x-text="s.ram.toFixed(0)+'%'"></span>
                  </div>
                </td>
                <td class="tabular-nums text-2" x-text="s.disk.toFixed(0)+'%'"></td>
                <td class="text-mono text-2" style="font-size:12px;"><span x-text="s.netInFmt"></span>/s</td>
                <td class="text-mono text-2" style="font-size:12px;"><span x-text="s.netOutFmt"></span>/s</td>
                <td><span class="text-mono" style="font-size:12px;" :style="'color:'+pingColor(s.pingCt)" x-text="s.pingCt + 'ms'"></span></td>
                <td class="text-3" style="font-size:12px;" x-text="s.lastUpdate + 's ago'"></td>
              </tr>
            </template>
            <tr x-show="filteredServers.length === 0">
              <td colspan="9" style="text-align:center; padding:48px 0;" class="text-3">没有符合条件的服务器</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ============ 地图视图（不带 scale 动画，避免 Leaflet 测量错误） ============ -->
    <section x-show="currentView === 'map'" x-cloak class="surface" style="border:1px solid var(--border); border-radius:8px; padding:8px; overflow:hidden; animation: overlay-fade .4s var(--ease-out-expo);">
      <div id="map" style="width:100%; height:560px; border-radius:6px; overflow:hidden;"></div>
    </section>

    ${getFooterHtml()}
  </main>

  <div class="toast-stack">
    <template x-for="t in toasts" :key="t.id">
      <div class="toast"><span x-text="t.icon"></span><span x-text="t.msg"></span></div>
    </template>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" crossorigin=""></script>
  <script id="server-data" type="application/json">${safeJsonInScript(clientServers)}</script>
  <script>
    function dashboard() {
      const SERVERS = JSON.parse(document.getElementById('server-data').textContent);
      const COORDS = ${safeJsonInScript(getCountryCoords())};

      return {
        theme: '${themeClass}',
        currentView: localStorage.getItem('cf_view') || 'cards',
        activeFilter: 'all',
        statusFilter: 'all',
        sortBy: localStorage.getItem('cf_sort') || 'cpu-desc',
        servers: SERVERS,
        toasts: [],
        liveSeconds: 0,
        segStyle: 'left:4px;width:0;',
        _mapInited: false,
        _map: null,

        views: [
          { id: 'cards', label: '卡片' },
          { id: 'table', label: '列表' },
          { id: 'map',   label: '地图' },
        ],
        statusFilters: [
          { id: 'all', label: '全部' },
          { id: 'online',  label: '在线', dotColor: 'var(--green)' },
          { id: 'offline', label: '离线', dotColor: 'var(--red)' },
        ],
        sortOptions: [
          { id: 'cpu-desc',  label: 'CPU 高→低' },
          { id: 'cpu-asc',   label: 'CPU 低→高' },
          { id: 'ram-desc',  label: 'RAM 高→低' },
          { id: 'ram-asc',   label: 'RAM 低→高' },
          { id: 'name-asc',  label: '名称 A→Z' },
        ],

        get effectiveTheme() {
          if (this.theme === 'dark') return 'dark';
          if (this.theme === 'light') return 'light';
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        },
        get filters() {
          const map = {};
          for (const s of this.servers) if (s.country !== 'XX') map[s.country] = (map[s.country] || 0) + 1;
          const arr = [{ code: 'all', label: '全部', count: this.servers.length }];
          Object.entries(map).sort().forEach(([c,n]) => arr.push({ code: c, label: c, count: n }));
          return arr;
        },
        get filteredServers() {
          let arr = this.servers.slice();
          if (this.activeFilter !== 'all') arr = arr.filter(s => s.country === this.activeFilter.toUpperCase());
          if (this.statusFilter === 'online')  arr = arr.filter(s => s.online);
          if (this.statusFilter === 'offline') arr = arr.filter(s => !s.online);
          const [field, dir] = this.sortBy.split('-');
          arr.sort((a,b) => {
            const av = a[field], bv = b[field];
            if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            return dir === 'asc' ? av - bv : bv - av;
          });
          return arr;
        },

        barColor(v) { if (v < 60) return 'var(--text-3)'; if (v < 85) return 'var(--amber)'; return 'var(--red)'; },
        pingColor(v) { if (v === 0) return 'var(--text-3)'; if (v < 100) return 'var(--green)'; if (v < 200) return 'var(--amber)'; return 'var(--red)'; },
        formatDuration(sec) {
          if (sec < 60) return sec + 's';
          if (sec < 3600) return Math.floor(sec / 60) + 'm';
          if (sec < 86400) return Math.floor(sec / 3600) + 'h';
          return Math.floor(sec / 86400) + 'd';
        },
        toggleSort(field) { this.sortBy = (this.sortBy === field+'-desc') ? field+'-asc' : field+'-desc'; },
        toggleTheme() {
          const next = this.effectiveTheme === 'dark' ? 'light' : 'dark';
          this.theme = next;
          document.body.classList.remove('dark','light','auto');
          document.body.classList.add(next);
          localStorage.setItem('cf_theme', next);
        },
        toast(msg, icon='✓') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, msg, icon });
          setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 2000);
        },
        updateSeg() {
          const seg = this.$refs.seg;
          if (!seg) return;
          const idx = this.views.findIndex(v => v.id === this.currentView);
          const target = seg.querySelector('[data-seg-idx="'+idx+'"]');
          if (!target) return;
          this.segStyle = 'left:'+target.offsetLeft+'px;width:'+target.offsetWidth+'px;';
        },
        initMap() {
          if (this._mapInited) {
            // 已初始化：等动画结束后重新计算尺寸
            setTimeout(() => this._map && this._map.invalidateSize(true), 750);
            return;
          }
          this._mapInited = true;
          // 等 view-fade 动画完成后再初始化（动画 700ms）
          setTimeout(() => {
            const mapEl = document.getElementById('map');
            if (!mapEl) { this._mapInited = false; return; }
            this._map = L.map('map', { zoomControl: true, attributionControl: false, worldCopyJump: false }).setView([20, 30], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { noWrap: true }).addTo(this._map);
            for (const s of this.servers) {
              const c = COORDS[s.country];
              if (!c) continue;
              const color = s.online ? '#22c55e' : '#ef4444';
              const html = '<div style="width:10px;height:10px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 0 0 1px '+color+'"></div>';
              L.marker(c, { icon: L.divIcon({ html, className:'', iconSize:[10,10] }) })
                .addTo(this._map)
                .bindPopup('<b>'+s.name+'</b><br/>'+s.country+' · '+(s.online?'在线':'离线'));
            }
            // 多次 invalidateSize 确保正确（动画期间可能尺寸还在变）
            this._map.invalidateSize(true);
            setTimeout(() => this._map && this._map.invalidateSize(true), 200);
            setTimeout(() => this._map && this._map.invalidateSize(true), 800);
          }, 750);
        },

        init() {
          // 加载本地保存的主题
          const savedTheme = localStorage.getItem('cf_theme');
          if (savedTheme) {
            this.theme = savedTheme;
            document.body.classList.remove('dark','light','auto');
            document.body.classList.add(savedTheme);
          }

          this.$watch('currentView', (v) => {
            localStorage.setItem('cf_view', v);
            this.$nextTick(() => this.updateSeg());
            if (v === 'map') this.$nextTick(() => this.initMap());
          });
          this.$watch('sortBy', (v) => localStorage.setItem('cf_sort', v));
          this.$nextTick(() => this.updateSeg());
          window.addEventListener('resize', () => this.updateSeg());

          setInterval(() => { this.liveSeconds = (this.liveSeconds + 1) % 60; }, 1000);

          // 每 30 秒拉取最新数据
          setInterval(() => this.refresh(), 30000);
        },

        async refresh() {
          try {
            const res = await fetch('/api/dashboard', { credentials: 'include' });
            if (!res.ok) return;
            const j = await res.json();
            if (!j || !Array.isArray(j.servers)) return;
            // 原地更新：按 id 找到旧对象并替换属性，新增/删除才动数组
            const oldMap = new Map(this.servers.map(s => [s.id, s]));
            const newIds = new Set(j.servers.map(s => s.id));
            // 更新或追加
            for (const ns of j.servers) {
              const old = oldMap.get(ns.id);
              if (old) {
                Object.assign(old, ns);
              } else {
                this.servers.push(ns);
              }
            }
            // 移除已删除的
            for (let i = this.servers.length - 1; i >= 0; i--) {
              if (!newIds.has(this.servers[i].id)) this.servers.splice(i, 1);
            }
          } catch (e) {}
        }
      };
    }
  </script>

  ${sys.custom_script || ''}
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}

// 简单 HTML 转义防 XSS - 已迁移至 utils/sanitize.js

function getCountryCoords() {
  return {
    HK:[22.3,114.1], SG:[1.35,103.8], JP:[35.7,139.7], KR:[37.5,127.0],
    US:[37.7,-95.7], CA:[56.1,-106.3], MX:[23.6,-102.5], BR:[-14.2,-51.9],
    DE:[51.1,10.4], FR:[46.6,1.8], GB:[55.4,-3.4], NL:[52.1,5.3], IT:[41.9,12.6], ES:[40.5,-3.7],
    RU:[61.5,105.3], IN:[20.6,79.0], AU:[-25.3,133.8], NZ:[-41.0,174.0],
    CN:[35.8,104.2], TW:[23.7,121.0], TH:[15.9,100.9], VN:[14.1,108.3], MY:[4.2,101.9], ID:[-0.8,113.9], PH:[13.4,122.6],
    AE:[23.4,53.8], TR:[38.9,35.2], SA:[23.9,45.1], ZA:[-30.6,22.9], EG:[26.8,30.8],
    AR:[-38.4,-63.6], CL:[-35.7,-71.5], CO:[4.6,-74.3], PE:[-9.2,-75.0],
    SE:[60.1,18.6], NO:[60.5,8.5], FI:[61.9,25.7], DK:[56.3,9.5], CH:[46.8,8.2], AT:[47.5,14.6],
    PL:[51.9,19.1], CZ:[49.8,15.5], RO:[45.9,24.9], UA:[48.4,31.2], BE:[50.5,4.5], IE:[53.1,-7.7], PT:[39.4,-8.2],
  };
}
