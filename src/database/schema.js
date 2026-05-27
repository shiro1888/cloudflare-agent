// =============================================
// D1 数据库初始化与维护
// =============================================
//
// 注意：本模块在 cold-start 时被调用，要尽量轻。
// 真实环境中 schema 早已建好，主要只跑 PRAGMA + 几个 CREATE IF NOT EXISTS。
//

const SCHEMA_VERSION_KEY = 'schema_version';
const CURRENT_SCHEMA_VERSION = 2;

const REQUIRED_SERVER_COLUMNS = {
  ping_ct: "TEXT DEFAULT '0'",
  ping_cu: "TEXT DEFAULT '0'",
  ping_cm: "TEXT DEFAULT '0'",
  ping_bd: "TEXT DEFAULT '0'",
  monthly_rx: "TEXT DEFAULT '0'",
  monthly_tx: "TEXT DEFAULT '0'",
  last_rx: "TEXT DEFAULT '0'",
  last_tx: "TEXT DEFAULT '0'",
  reset_month: "TEXT DEFAULT ''"
};

export async function initDatabase(db) {
  try {
    // 1. 基础表（IF NOT EXISTS - 已存在则免费）
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT,
        cpu TEXT DEFAULT '0',
        ram TEXT DEFAULT '0',
        disk TEXT DEFAULT '0',
        load_avg TEXT DEFAULT '0',
        uptime TEXT DEFAULT '0',
        last_updated INTEGER DEFAULT 0,
        ram_total TEXT DEFAULT '0',
        net_rx TEXT DEFAULT '0',
        net_tx TEXT DEFAULT '0',
        net_in_speed TEXT DEFAULT '0',
        net_out_speed TEXT DEFAULT '0',
        os TEXT DEFAULT '',
        cpu_info TEXT DEFAULT '',
        arch TEXT DEFAULT '',
        boot_time TEXT DEFAULT '',
        ram_used TEXT DEFAULT '0',
        swap_total TEXT DEFAULT '0',
        swap_used TEXT DEFAULT '0',
        disk_total TEXT DEFAULT '0',
        disk_used TEXT DEFAULT '0',
        processes TEXT DEFAULT '0',
        tcp_conn TEXT DEFAULT '0',
        udp_conn TEXT DEFAULT '0',
        country TEXT DEFAULT 'XX',
        ip_v4 TEXT DEFAULT '0',
        ip_v6 TEXT DEFAULT '0',
        server_group TEXT DEFAULT '默认分组',
        price TEXT DEFAULT '',
        expire_date TEXT DEFAULT '',
        bandwidth TEXT DEFAULT '',
        traffic_limit TEXT DEFAULT '',
        ping_ct TEXT DEFAULT '0',
        ping_cu TEXT DEFAULT '0',
        ping_cm TEXT DEFAULT '0',
        ping_bd TEXT DEFAULT '0',
        monthly_rx TEXT DEFAULT '0',
        monthly_tx TEXT DEFAULT '0',
        last_rx TEXT DEFAULT '0',
        last_tx TEXT DEFAULT '0',
        reset_month TEXT DEFAULT ''
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS metrics_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT (datetime('now')),
        cpu REAL DEFAULT 0,
        ram REAL DEFAULT 0,
        disk REAL DEFAULT 0,
        load_avg TEXT DEFAULT '0',
        net_in_speed REAL DEFAULT 0,
        net_out_speed REAL DEFAULT 0,
        net_rx REAL DEFAULT 0,
        net_tx REAL DEFAULT 0,
        processes INTEGER DEFAULT 0,
        tcp_conn INTEGER DEFAULT 0,
        udp_conn INTEGER DEFAULT 0,
        ping_ct INTEGER DEFAULT 0,
        ping_cu INTEGER DEFAULT 0,
        ping_cm INTEGER DEFAULT 0,
        ping_bd INTEGER DEFAULT 0,
        ram_total REAL DEFAULT 0,
        ram_used REAL DEFAULT 0,
        swap_total REAL DEFAULT 0,
        swap_used REAL DEFAULT 0,
        disk_total REAL DEFAULT 0,
        disk_used REAL DEFAULT 0,
        FOREIGN KEY (server_id) REFERENCES servers(id)
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_history_server_time
        ON metrics_history(server_id, timestamp)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_servers_last_updated
        ON servers(last_updated)`),
    ]);

    // 2. 版本检查 - 如果已是最新版本就跳过 ALTER 检查
    const versionRow = await db.prepare(
      "SELECT value FROM settings WHERE key = ?"
    ).bind(SCHEMA_VERSION_KEY).first();
    const version = versionRow ? parseInt(versionRow.value) : 0;
    if (version >= CURRENT_SCHEMA_VERSION) return;

    // 3. 列迁移（仅在版本不匹配时跑）
    const { results: cols } = await db.prepare(`PRAGMA table_info(servers)`).all();
    const have = new Set(cols.map(c => c.name));
    const missing = Object.entries(REQUIRED_SERVER_COLUMNS).filter(([n]) => !have.has(n));

    for (const [name, def] of missing) {
      try {
        await db.prepare(`ALTER TABLE servers ADD COLUMN ${name} ${def}`).run();
      } catch (e) {
        // 列可能并发添加成功，忽略 duplicate column 错误
        if (!String(e.message || '').includes('duplicate column')) throw e;
      }
    }

    // 4. 写入版本号
    await db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION)).run();

    console.log('[DB] 初始化/迁移完成');
  } catch (e) {
    console.error('[DB] 初始化失败:', e);
  }
}

// 清理超过24小时的历史数据（被 cron 调用）
export async function cleanupOldData(db) {
  try {
    const cutoff = Date.now() - 24 * 3600_000;
    const { meta } = await db.prepare(`
      DELETE FROM metrics_history
      WHERE
        (typeof(timestamp) = 'integer' AND timestamp < ?)
        OR (typeof(timestamp) = 'text' AND timestamp < datetime('now', '-24 hours'))
    `).bind(cutoff).run();

    const changes = meta?.changes || 0;
    if (changes > 0) console.log(`[Cron] 已清理 ${changes} 条历史数据`);
  } catch (e) {
    console.error('[Cron] 清理数据失败:', e);
  }
}

// 保存历史指标数据
export async function saveMetricsHistory(db, serverId, metrics) {
  try {
    await db.prepare(`
      INSERT INTO metrics_history (
        server_id, timestamp, cpu, ram, disk, load_avg,
        net_in_speed, net_out_speed, net_rx, net_tx,
        processes, tcp_conn, udp_conn,
        ping_ct, ping_cu, ping_cm, ping_bd,
        ram_total, ram_used, swap_total, swap_used,
        disk_total, disk_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      serverId,
      Date.now(),
      parseFloat(metrics.cpu) || 0,
      parseFloat(metrics.ram) || 0,
      parseFloat(metrics.disk) || 0,
      metrics.load || '0',
      parseFloat(metrics.net_in_speed) || 0,
      parseFloat(metrics.net_out_speed) || 0,
      parseFloat(metrics.net_rx) || 0,
      parseFloat(metrics.net_tx) || 0,
      parseInt(metrics.processes) || 0,
      parseInt(metrics.tcp_conn) || 0,
      parseInt(metrics.udp_conn) || 0,
      parseInt(metrics.ping_ct) || 0,
      parseInt(metrics.ping_cu) || 0,
      parseInt(metrics.ping_cm) || 0,
      parseInt(metrics.ping_bd) || 0,
      parseFloat(metrics.ram_total) || 0,
      parseFloat(metrics.ram_used) || 0,
      parseFloat(metrics.swap_total) || 0,
      parseFloat(metrics.swap_used) || 0,
      parseFloat(metrics.disk_total) || 0,
      parseFloat(metrics.disk_used) || 0
    ).run();
  } catch (e) {
    console.error('保存历史数据失败:', e);
  }
}
