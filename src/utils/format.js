// =============================================
// 格式化工具
// =============================================

/**
 * 把字节数格式化成人类可读字符串。
 * 例：1024 -> "1 KB", 1536 -> "1.5 KB"
 */
export function formatBytes(bytes) {
  const b = parseInt(bytes);
  if (isNaN(b) || b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
