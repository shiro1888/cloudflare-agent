import { checkAuth, authResponse } from '../middleware/auth.js';
import { invalidateSettingsCache } from '../utils/settings.js';

export async function handleAdminAPI(request, env, sys) {
  if (!(await checkAuth(request, env))) {
    return authResponse(request);
  }

  // CSRF 防护：要求请求 Origin / Referer 与当前主机一致
  // 浏览器场景：SameSite=Lax cookie + Origin/Referer 双重防护
  // 命令行场景：携带 Authorization header 的请求不受 CSRF 影响（不会自动带 cookie），跳过检查
  const hasBasicAuth = (request.headers.get('Authorization') || '').toLowerCase().startsWith('basic ');
  if (!hasBasicAuth) {
    const reqUrl = new URL(request.url);
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const expectedHost = reqUrl.host;
    let originOk = false;
    if (origin) {
      try { originOk = new URL(origin).host === expectedHost; } catch (e) {}
    } else if (referer) {
      try { originOk = new URL(referer).host === expectedHost; } catch (e) {}
    }
    if (!originOk) {
      return new Response(JSON.stringify({ error: '请求来源不被允许' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  try {
    const data = await request.json();
    
    if (data.action === 'save_settings') {
      // 保存全局设置
      for (const [k, v] of Object.entries(data.settings)) {
        await env.DB.prepare(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        ).bind(k, v).run();
      }
      invalidateSettingsCache();
      return new Response(JSON.stringify({ success: true, message: '设置已保存' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } 
    else if (data.action === 'add') {
      // 添加新服务器
      const id = crypto.randomUUID();
      const name = (data.name || 'New Server').toString().slice(0, 100);
      const group = (data.server_group || '默认分组').toString().slice(0, 64);

      await env.DB.prepare(`
        INSERT INTO servers
        (id, name, server_group, last_updated, country)
        VALUES (?, ?, ?, 0, 'XX')
      `).bind(id, name, group).run();

      return new Response(JSON.stringify({
        success: true,
        id: id,
        message: `服务器 "${name}" 已添加`
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } 
    else if (data.action === 'delete') {
      // 删除服务器
      const { id } = data;
      if (!id) {
        return new Response(JSON.stringify({ error: '缺少服务器 ID' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // 同时删除历史数据
      await env.DB.prepare('DELETE FROM metrics_history WHERE server_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(id).run();
      
      return new Response(JSON.stringify({ success: true, message: '服务器已删除' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } 
    else if (data.action === 'edit') {
      // 编辑服务器信息（带长度限制防滥用）
      const { id } = data;
      if (!id) {
        return new Response(JSON.stringify({ error: '缺少服务器 ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const trim = (v, n = 100) => (v || '').toString().slice(0, n);
      await env.DB.prepare(`
        UPDATE servers
        SET server_group = ?, price = ?, expire_date = ?, bandwidth = ?, traffic_limit = ?
        WHERE id = ?
      `).bind(
        trim(data.server_group, 64) || '默认分组',
        trim(data.price, 32),
        trim(data.expire_date, 32),
        trim(data.bandwidth, 32),
        trim(data.traffic_limit, 32),
        id
      ).run();

      return new Response(JSON.stringify({ success: true, message: '服务器信息已更新' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    else if (data.action === 'batch_delete') {
      // 批量删除服务器
      const { ids } = data;
      if (!Array.isArray(ids) || ids.length === 0) {
        return new Response(JSON.stringify({ error: '请选择要删除的服务器' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // 限制单次最多 100 条，防止超时
      const safeIds = ids.slice(0, 100).filter(x => typeof x === 'string');
      if (safeIds.length === 0) {
        return new Response(JSON.stringify({ error: '无效的 ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // batch 方式一次发送，减少 round-trip
      const placeholders = safeIds.map(() => '?').join(',');
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM metrics_history WHERE server_id IN (${placeholders})`).bind(...safeIds),
        env.DB.prepare(`DELETE FROM servers WHERE id IN (${placeholders})`).bind(...safeIds),
      ]);

      return new Response(JSON.stringify({
        success: true,
        message: `已删除 ${safeIds.length} 台服务器`
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    else if (data.action === 'get_stats') {
      // 获取统计数据
      const { results: servers } = await env.DB.prepare(
        'SELECT id, name, last_updated, country, cpu, ram, disk, net_in_speed, net_out_speed FROM servers'
      ).all();
      
      const now = Date.now();
      const stats = {
        total: servers.length,
        online: 0,
        offline: 0,
        total_cpu: 0,
        total_ram: 0,
        total_disk: 0,
        total_net_in: 0,
        total_net_out: 0
      };
      
      servers.forEach(s => {
        const lastUpdated = new Date(s.last_updated).getTime();
        if ((now - lastUpdated) < 300000) {
          stats.online++;
          stats.total_cpu += parseFloat(s.cpu) || 0;
          stats.total_ram += parseFloat(s.ram) || 0;
          stats.total_disk += parseFloat(s.disk) || 0;
          stats.total_net_in += parseFloat(s.net_in_speed) || 0;
          stats.total_net_out += parseFloat(s.net_out_speed) || 0;
        } else {
          stats.offline++;
        }
      });
      
      if (stats.online > 0) {
        stats.avg_cpu = (stats.total_cpu / stats.online).toFixed(2);
        stats.avg_ram = (stats.total_ram / stats.online).toFixed(2);
        stats.avg_disk = (stats.total_disk / stats.online).toFixed(2);
      }
      
      return new Response(JSON.stringify({ success: true, stats }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    else if (data.action === 'clean_history') {
      // 手动清理历史数据
      const days = data.days || 7;
      await env.DB.prepare(
        `DELETE FROM metrics_history WHERE timestamp < datetime('now', '-' || ? || ' days')`
      ).bind(days).run();
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `已清理 ${days} 天前的历史数据` 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: '未知操作' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Admin API 错误:', e);
    // 不暴露 e.message 给客户端，防止泄露 SQL/堆栈信息
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}