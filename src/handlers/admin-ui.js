import { checkAuth, authResponse } from '../middleware/auth.js';
import { getThemeStyles, getFooterHtml, getBaseStyles, getThemeClass } from '../themes/styles.js';
import { escapeHtml, safeJsonInScript } from '../utils/sanitize.js';

export async function handleAdminUI(request, env, sys) {
  if (!(await checkAuth(request, env))) {
    return authResponse(request);
  }

  const url = new URL(request.url);
  const host = url.origin;

  const { results } = await env.DB.prepare(
    'SELECT id, name, last_updated, server_group, price, expire_date, bandwidth, traffic_limit, country FROM servers ORDER BY server_group, name'
  ).all();

  const now = Date.now();

  // 给前端的服务器数据
  const clientServers = (results || []).map(s => {
    const lastUpdated = new Date(s.last_updated).getTime();
    const isOnline = (now - lastUpdated) < 300000;
    return {
      id: s.id,
      name: s.name || 'unnamed',
      country: (s.country || 'xx').toUpperCase(),
      group: s.server_group || 'Default',
      price: s.price || '',
      expire: s.expire_date || '',
      bandwidth: s.bandwidth || '',
      trafficLimit: s.traffic_limit || '',
      online: isOnline,
    };
  });
  const onlineCount = clientServers.filter(s => s.online).length;

  const themeStyles = getThemeStyles(sys);
  const baseStyles = getBaseStyles();
  const themeClass = getThemeClass(sys);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sys.admin_title)}</title>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/alpinejs/3.13.5/cdn.min.js"></script>
  ${sys.custom_head || ''}
  <style>
    ${baseStyles}
    ${themeStyles}
    .checkbox-row {
      display:flex; align-items:center; gap:10px;
      padding:10px 12px; border:1px solid var(--border); border-radius:8px;
      background:var(--surface); cursor:pointer;
      transition:border-color .25s var(--ease-out-expo), background .25s var(--ease-out-expo);
    }
    .checkbox-row:hover { border-color:var(--border-strong); background:var(--surface-2); }
    .checkbox-row input { accent-color: var(--text); }
    .code-block {
      font-family:'JetBrains Mono', monospace; font-size:12px;
      background:var(--surface-2); border:1px solid var(--border);
      border-radius:6px; padding:10px 12px;
      overflow-x:auto; white-space:nowrap; color:var(--text-2);
    }
  </style>
</head>
<body class="${themeClass}" x-data="adminApp()" x-init="init()">

  <header class="surface" style="border-bottom:1px solid var(--border); position:sticky; top:0; z-index:40;">
    <div class="container" style="height:56px; display:flex; align-items:center; gap:16px; position:relative;">
      <a href="/" style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px;height:28px;border-radius:6px;background:var(--text);color:var(--bg);display:flex;align-items:center;justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div style="font-weight:600; font-size:15px;">${escapeHtml(sys.site_title)}</div>
        <span class="text-3" style="margin:0 4px; font-size:13px;">/</span>
        <span style="font-weight:500; font-size:14px;">${escapeHtml(sys.admin_title)}</span>
      </a>

      <nav style="position:absolute; left:50%; transform:translateX(-50%);">
        <div class="seg" x-ref="seg">
          <div class="seg-indicator" :style="segStyle"></div>
          <template x-for="(t, idx) in tabs" :key="t.id">
            <button class="seg-item" :data-seg-idx="idx" :class="currentTab === t.id ? 'active' : ''" @click="currentTab = t.id" x-text="t.label"></button>
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
        <a href="/" class="btn">前台</a>
        <a href="/logout" class="btn btn-danger" title="退出登录">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </a>
      </div>
    </div>
  </header>

  <main class="container" style="padding-top:32px; padding-bottom:32px;">

    <div style="display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:32px; flex-wrap:wrap; gap:12px;">
      <div>
        <h1 class="title-pop" style="font-size:24px; font-weight:600; letter-spacing:-.02em;">管理控制台</h1>
        <p class="text-2 title-pop" style="font-size:14px; margin-top:4px; animation-delay:.1s">添加、配置和管理服务器探针</p>
      </div>
      <div class="title-pop" style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-3); animation-delay:.2s">
        <span class="dot-pulse" style="width:6px;height:6px;border-radius:50%;background:var(--green)"></span>
        <span>已登录 · ${escapeHtml(env.API_USER_NAME || 'admin')}</span>
      </div>
    </div>

    <!-- 统计 -->
    <section class="stagger" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; margin-bottom:32px;">
      <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">服务器总数</div>
        <div style="font-size:24px; font-weight:600;" class="tabular-nums" x-text="servers.length"></div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">添加新服务器开始监控</div>
      </div>
      <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">在线</div>
        <div style="font-size:24px; font-weight:600; color:var(--green);" class="tabular-nums" x-text="onlineCount"></div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">最近 5 分钟有上报</div>
      </div>
      <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">离线</div>
        <div style="font-size:24px; font-weight:600; color:var(--red);" class="tabular-nums" x-text="servers.length - onlineCount"></div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">超过 5 分钟无上报</div>
      </div>
      <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:16px;">
        <div class="text-3" style="font-size:12px; margin-bottom:6px;">部署平台</div>
        <div style="font-size:18px; font-weight:600;">Cloudflare D1</div>
        <div class="text-2" style="font-size:12px; margin-top:4px;">免费额度 5 GB</div>
      </div>
    </section>

    <!-- 服务器 tab -->
    <section x-show="currentTab === 'servers'" x-cloak class="view-fade" :key="'servers'+reload">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
        <input x-model="newName" @keydown.enter="addServer()" type="text" class="input" placeholder="输入服务器名称..." style="width:240px;" />
        <select x-model="newGroup" class="input" style="width:140px;">
          <option value="Default">默认分组</option>
          <option value="亚太">亚太</option>
          <option value="欧美">欧美</option>
          <option value="国内">国内</option>
        </select>
        <button @click="addServer()" class="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          添加
        </button>
        <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
          <input x-model="search" type="text" class="input" placeholder="搜索..." style="width:200px;" />
          <button @click="batchDelete()" class="btn btn-danger" :style="selected.length === 0 ? 'opacity:.4;cursor:not-allowed' : ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/></svg>
            <span x-text="selected.length > 0 ? '删除 (' + selected.length + ')' : '批量删除'"></span>
          </button>
        </div>
      </div>

      <div class="surface" style="border:1px solid var(--border); border-radius:8px; overflow:hidden;">
        <div style="overflow-x:auto;">
          <table class="tbl">
            <thead>
              <tr>
                <th style="width:40px;"><input type="checkbox" :checked="selected.length === filteredServers.length && filteredServers.length > 0" @change="toggleAll" /></th>
                <th>名称</th>
                <th>分组</th>
                <th>价格</th>
                <th>到期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <template x-for="s in filteredServers" :key="s.id">
                <tr>
                  <td><input type="checkbox" :value="s.id" :checked="selected.includes(s.id)" @change="toggleSelect(s.id)" /></td>
                  <td>
                    <div style="font-weight:500;"><a :href="'/?id=' + s.id" style="color:var(--text);" x-text="s.name"></a></div>
                    <div class="text-3 text-mono" style="font-size:11px;" x-text="s.id"></div>
                  </td>
                  <td><span class="tag" x-text="s.group"></span></td>
                  <td class="text-2" x-text="s.price || '-'"></td>
                  <td class="text-2" x-text="s.expire || '永久'"></td>
                  <td>
                    <span class="tag" :class="s.online ? 'tag-online' : 'tag-offline'">
                      <span style="width:6px;height:6px;border-radius:50%;" :style="'background:' + (s.online ? 'var(--green)' : 'var(--red)')"></span>
                      <span x-text="s.online ? '在线' : '离线'"></span>
                    </span>
                  </td>
                  <td>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <button @click="copyCmd(s)" class="btn btn-ghost" style="height:26px;padding:0 8px;font-size:12px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        命令
                      </button>
                      <button @click="editServer(s)" class="btn btn-ghost btn-icon" title="编辑">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button @click="deleteServer(s)" class="btn btn-ghost btn-icon btn-danger" title="删除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6M10 11v6M14 11v6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
              <tr x-show="filteredServers.length === 0">
                <td colspan="7" style="text-align:center; padding:48px 0;" class="text-3">没有服务器，点击上方"添加"创建一个</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 设置 tab -->
    <section x-show="currentTab === 'settings'" x-cloak class="view-fade" :key="'settings'+reload">
      <div class="stagger" style="display:grid; grid-template-columns:1fr; gap:24px;">

        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:16px;">站点配置</h3>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">站点标题</label>
              <input x-model="settings.site_title" type="text" class="input" />
            </div>
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">管理后台标题</label>
              <input x-model="settings.admin_title" type="text" class="input" />
            </div>
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">主题</label>
              <select x-model="settings.theme" class="input">
                <option value="auto">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">背景图片 URL（可选）</label>
              <input x-model="settings.custom_bg" type="text" class="input" placeholder="https://..." />
            </div>
          </div>
        </div>

        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:16px;">显示选项</h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <label class="checkbox-row">
              <input type="checkbox" x-model="settings.is_public" />
              <div style="flex:1;">
                <div style="font-size:13px; font-weight:500;">公开访问</div>
                <div class="text-3" style="font-size:11px;">关闭后前台需要密码登录</div>
              </div>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" x-model="settings.show_price" />
              <div style="flex:1;">
                <div style="font-size:13px; font-weight:500;">显示价格</div>
                <div class="text-3" style="font-size:11px;">在卡片上显示服务器价格</div>
              </div>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" x-model="settings.show_expire" />
              <div style="flex:1;">
                <div style="font-size:13px; font-weight:500;">显示到期时间</div>
                <div class="text-3" style="font-size:11px;">倒计时显示</div>
              </div>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" x-model="settings.show_bw" />
              <div style="flex:1;">
                <div style="font-size:13px; font-weight:500;">显示带宽</div>
                <div class="text-3" style="font-size:11px;">带宽规格徽章</div>
              </div>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" x-model="settings.show_tf" />
              <div style="flex:1;">
                <div style="font-size:13px; font-weight:500;">显示流量额度</div>
                <div class="text-3" style="font-size:11px;">月流量限制</div>
              </div>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" x-model="settings.auto_reset_traffic" />
              <div style="flex:1;">
                <div style="font-size:13px; font-weight:500;">每月自动重置流量</div>
                <div class="text-3" style="font-size:11px;">每月 1 日自动重置统计</div>
              </div>
            </label>
          </div>
        </div>

        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:16px;">离线告警</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">通知方式</label>
              <select x-model="settings.tg_notify" class="input">
                <option value="false">关闭</option>
                <option value="true">启用</option>
              </select>
            </div>
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">配置类型</label>
              <select class="input" disabled style="opacity:.6;">
                <option>Telegram / 企业微信</option>
              </select>
            </div>
            <div style="grid-column:1 / -1;">
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">Bot Token / Webhook URL</label>
              <input x-model="settings.tg_bot_token" type="text" class="input text-mono" style="font-size:12px;" placeholder="bot123456:ABC-DEF... 或 https://qyapi.weixin.qq.com/..." />
            </div>
            <div style="grid-column:1 / -1;">
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">Telegram Chat ID（企业微信留空）</label>
              <input x-model="settings.tg_chat_id" type="text" class="input text-mono" style="font-size:12px;" placeholder="-100123456789" />
            </div>
          </div>
        </div>

        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:16px;">高级</h3>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">自定义 head 注入</label>
              <textarea x-model="settings.custom_head" rows="3" class="input text-mono" style="font-size:12px;" placeholder="<meta name='...' />"></textarea>
            </div>
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">自定义脚本</label>
              <textarea x-model="settings.custom_script" rows="3" class="input text-mono" style="font-size:12px;" placeholder="&lt;script&gt;...&lt;/script&gt;"></textarea>
            </div>
            <div>
              <label class="text-3" style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; display:block;">自定义 CSS</label>
              <textarea x-model="settings.custom_css" rows="4" class="input text-mono" style="font-size:12px;" placeholder="/* 你的样式 */"></textarea>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button @click="saveSettings()" class="btn btn-primary">保存设置</button>
        </div>
      </div>
    </section>

    <!-- 文档 tab -->
    <section x-show="currentTab === 'docs'" x-cloak class="view-fade" :key="'docs'+reload">
      <div class="stagger" style="display:flex; flex-direction:column; gap:16px; max-width:720px;">
        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:8px;">1. 添加服务器</h3>
          <p class="text-2" style="font-size:14px; line-height:1.6;">在"服务器"标签页输入名称后点击"添加"，会生成一条唯一的安装命令。</p>
        </div>
        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:8px;">2. 在 VPS 上运行</h3>
          <p class="text-2" style="font-size:14px; margin-bottom:12px; line-height:1.6;">SSH 登录后粘贴执行（root 权限）：</p>
          <div class="code-block">curl -sL ${host}/install.sh | bash -s install &lt;ID&gt; ${escapeHtml(env.API_SECRET || 'YOUR_SECRET')} ${host}/update 60</div>
          <p class="text-3" style="font-size:12px; margin-top:8px;">支持 Ubuntu / Debian / CentOS / Rocky / AlmaLinux</p>
        </div>
        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:8px;">3. 自定义上报间隔</h3>
          <p class="text-2" style="font-size:14px; margin-bottom:12px;">命令末尾追加秒数（默认 60）：</p>
          <div class="code-block">... | bash -s install &lt;ID&gt; &lt;SECRET&gt; &lt;URL&gt; 30</div>
        </div>
        <div class="surface" style="border:1px solid var(--border); border-radius:8px; padding:20px;">
          <h3 style="font-size:14px; font-weight:600; margin-bottom:8px;">4. 卸载</h3>
          <div class="code-block">curl -sL ${host}/install.sh | bash -s uninstall</div>
        </div>
      </div>
    </section>

    ${getFooterHtml()}
  </main>

  <!-- 编辑模态框 -->
  <div x-show="editOpen" x-cloak style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;" @keydown.escape.window="editOpen=false">
    <div class="overlay-fade" style="position:absolute;inset:0;background:rgba(0,0,0,.4);" @click="editOpen=false"></div>
    <div class="surface pop-in" style="position:relative;border:1px solid var(--border);border-radius:12px;padding:24px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.15);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div style="font-size:16px;font-weight:600;">编辑服务器</div>
        <button @click="editOpen=false" class="btn btn-ghost btn-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <template x-if="editing">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label class="text-3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">分组</label>
            <select x-model="editing.group" class="input">
              <option value="Default">默认分组</option>
              <option value="亚太">亚太</option>
              <option value="欧美">欧美</option>
              <option value="国内">国内</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="text-3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">价格</label>
              <input x-model="editing.price" class="input" placeholder="$5/mo" />
            </div>
            <div>
              <label class="text-3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">到期日期</label>
              <input x-model="editing.expire" class="input" placeholder="2026-12-31" />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="text-3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">带宽</label>
              <input x-model="editing.bandwidth" class="input" placeholder="1Gbps" />
            </div>
            <div>
              <label class="text-3" style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;display:block;">流量限额</label>
              <input x-model="editing.trafficLimit" class="input" placeholder="1TB" />
            </div>
          </div>
        </div>
      </template>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;">
        <button @click="editOpen=false" class="btn">取消</button>
        <button @click="saveEdit()" class="btn btn-primary">保存</button>
      </div>
    </div>
  </div>

  <!-- 命令模态框 -->
  <div x-show="cmdModalOpen" x-cloak style="position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;" @keydown.escape.window="cmdModalOpen=false">
    <div class="overlay-fade" style="position:absolute;inset:0;background:rgba(0,0,0,.4);" @click="cmdModalOpen=false"></div>
    <div class="surface pop-in" style="position:relative;border:1px solid var(--border);border-radius:12px;padding:24px;max-width:640px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.15);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:600;">安装命令</div>
        <button @click="cmdModalOpen=false" class="btn btn-ghost btn-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <p class="text-2" style="font-size:14px;margin-bottom:12px;">SSH 到你的服务器，粘贴下面的命令执行：</p>
      <div class="code-block" style="margin-bottom:12px;" x-text="cmdText"></div>
      <p class="text-3" style="font-size:12px;margin-bottom:16px;">需要 root 权限。系统支持：Ubuntu / Debian / CentOS / Rocky</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button @click="cmdModalOpen=false" class="btn">关闭</button>
        <button @click="copyToClipboard(cmdText); toast('已复制'); cmdModalOpen=false" class="btn btn-primary">复制</button>
      </div>
    </div>
  </div>

  <div class="toast-stack">
    <template x-for="t in toasts" :key="t.id">
      <div class="toast"><span x-text="t.icon"></span><span x-text="t.msg"></span></div>
    </template>
  </div>

  <script id="server-data" type="application/json">${safeJsonInScript(clientServers)}</script>
  <script id="settings-data" type="application/json">${safeJsonInScript(sys)}</script>
  <script>
    function adminApp() {
      const SERVERS = JSON.parse(document.getElementById('server-data').textContent);
      const SYS = JSON.parse(document.getElementById('settings-data').textContent);
      const HOST = ${safeJsonInScript(host)};
      const SECRET = ${safeJsonInScript(env.API_SECRET || '')};

      return {
        theme: '${themeClass}',
        currentTab: 'servers',
        segStyle: 'left:4px;width:0;',
        reload: 0,
        servers: SERVERS,
        newName: '',
        newGroup: 'Default',
        search: '',
        selected: [],
        editOpen: false,
        editing: null,
        cmdModalOpen: false,
        cmdText: '',
        toasts: [],
        settings: {
          site_title: SYS.site_title || 'cloudflare-agent',
          admin_title: SYS.admin_title || '管理后台',
          theme: SYS.theme || 'auto',
          custom_bg: SYS.custom_bg || '',
          custom_head: SYS.custom_head || '',
          custom_script: SYS.custom_script || '',
          custom_css: SYS.custom_css || '',
          is_public: SYS.is_public === 'true',
          show_price: SYS.show_price === 'true',
          show_expire: SYS.show_expire === 'true',
          show_bw: SYS.show_bw === 'true',
          show_tf: SYS.show_tf === 'true',
          auto_reset_traffic: SYS.auto_reset_traffic === 'true',
          tg_notify: SYS.tg_notify === 'true' ? 'true' : 'false',
          tg_bot_token: SYS.tg_bot_token || '',
          tg_chat_id: SYS.tg_chat_id || '',
        },
        tabs: [
          { id: 'servers', label: '服务器' },
          { id: 'settings', label: '设置' },
          { id: 'docs', label: '文档' },
        ],

        get effectiveTheme() {
          if (this.theme === 'dark') return 'dark';
          if (this.theme === 'light') return 'light';
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        },
        get onlineCount() { return this.servers.filter(s => s.online).length; },
        get filteredServers() {
          if (!this.search) return this.servers;
          const q = this.search.toLowerCase();
          return this.servers.filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.id || '').toLowerCase().includes(q) ||
            (s.group || '').toLowerCase().includes(q)
          );
        },

        async addServer() {
          const name = (this.newName || '').trim();
          if (!name) { this.toast('请输入服务器名称', '!'); return; }
          try {
            const r = await fetch('/admin/api', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ action: 'add', name, server_group: this.newGroup })
            });
            const j = await r.json();
            if (!j.success) { this.toast(j.error || '添加失败', '!'); return; }
            this.servers.unshift({
              id: j.id, name, country: 'XX', group: this.newGroup,
              price: '', expire: '', bandwidth: '', trafficLimit: '', online: false
            });
            this.newName = '';
            this.toast('已添加 ' + name);
          } catch (e) { this.toast('网络错误', '!'); }
        },
        editServer(s) { this.editing = { ...s }; this.editOpen = true; },
        async saveEdit() {
          try {
            const r = await fetch('/admin/api', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                action: 'edit',
                id: this.editing.id,
                server_group: this.editing.group,
                price: this.editing.price,
                expire_date: this.editing.expire,
                bandwidth: this.editing.bandwidth,
                traffic_limit: this.editing.trafficLimit
              })
            });
            const j = await r.json();
            if (!j.success) { this.toast(j.error || '保存失败', '!'); return; }
            const idx = this.servers.findIndex(x => x.id === this.editing.id);
            if (idx >= 0) this.servers[idx] = { ...this.editing };
            this.editOpen = false;
            this.toast('已保存');
          } catch (e) { this.toast('网络错误', '!'); }
        },
        async deleteServer(s) {
          if (!confirm('确定删除 ' + s.name + ' ?')) return;
          try {
            const r = await fetch('/admin/api', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ action: 'delete', id: s.id })
            });
            const j = await r.json();
            if (!j.success) { this.toast(j.error || '删除失败', '!'); return; }
            this.servers = this.servers.filter(x => x.id !== s.id);
            this.selected = this.selected.filter(id => id !== s.id);
            this.toast('已删除 ' + s.name);
          } catch (e) { this.toast('网络错误', '!'); }
        },
        copyCmd(s) {
          this.cmdText = 'curl -sL ' + HOST + '/install.sh | bash -s install ' + s.id + ' ' + SECRET + ' ' + HOST + '/update 60';
          this.cmdModalOpen = true;
        },
        copyToClipboard(text) {
          if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
        },
        toggleSelect(id) {
          if (this.selected.includes(id)) this.selected = this.selected.filter(x => x !== id);
          else this.selected.push(id);
        },
        toggleAll(e) {
          if (e.target.checked) this.selected = this.filteredServers.map(s => s.id);
          else this.selected = [];
        },
        async batchDelete() {
          if (this.selected.length === 0) return;
          if (!confirm('确定删除 ' + this.selected.length + ' 台服务器?')) return;
          try {
            const r = await fetch('/admin/api', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ action: 'batch_delete', ids: this.selected })
            });
            const j = await r.json();
            if (!j.success) { this.toast(j.error || '删除失败', '!'); return; }
            this.servers = this.servers.filter(s => !this.selected.includes(s.id));
            this.toast('已删除 ' + this.selected.length + ' 台');
            this.selected = [];
          } catch (e) { this.toast('网络错误', '!'); }
        },
        async saveSettings() {
          // 转换 boolean -> string
          const out = {};
          for (const k in this.settings) {
            const v = this.settings[k];
            out[k] = (typeof v === 'boolean') ? (v ? 'true' : 'false') : (v || '');
          }
          try {
            const r = await fetch('/admin/api', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ action: 'save_settings', settings: out })
            });
            const j = await r.json();
            if (!j.success) { this.toast(j.error || '保存失败', '!'); return; }
            this.toast('设置已保存');
          } catch (e) { this.toast('网络错误', '!'); }
        },
        toggleTheme() {
          const next = this.effectiveTheme === 'dark' ? 'light' : 'dark';
          this.theme = next;
          document.body.classList.remove('dark','light','auto');
          document.body.classList.add(next);
          localStorage.setItem('cf_theme', next);
        },
        toast(msg, icon = '✓') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, msg, icon });
          setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 2000);
        },
        updateSeg() {
          const seg = this.$refs.seg;
          if (!seg) return;
          const idx = this.tabs.findIndex(t => t.id === this.currentTab);
          const target = seg.querySelector('[data-seg-idx="' + idx + '"]');
          if (!target) return;
          this.segStyle = 'left:' + target.offsetLeft + 'px;width:' + target.offsetWidth + 'px;';
        },

        init() {
          const savedTheme = localStorage.getItem('cf_theme');
          if (savedTheme) {
            this.theme = savedTheme;
            document.body.classList.remove('dark','light','auto');
            document.body.classList.add(savedTheme);
          }
          this.$watch('currentTab', () => { this.$nextTick(() => this.updateSeg()); this.reload++; });
          this.$nextTick(() => this.updateSeg());
          window.addEventListener('resize', () => this.updateSeg());
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
