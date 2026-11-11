// Local test-tool diagnostics only. Never return paths, raw messages or argv.
export function classifyBrowserLaunchError(error) {
  let message;
  try { const d=error && typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message'):null;message=d && 'value' in d && typeof d.value==='string'?d.value:''; } catch { return 'unknown'; }
  if (/Executable doesn.t exist/i.test(message)) return 'missing_browser';
  if (/Library not loaded|dyld.*not found/i.test(message)) return 'missing_library';
  if (/Permission denied|Operation not permitted|EACCES|EPERM/i.test(message)) return 'permission_denied';
  if (/Target.*closed|Browser.*closed/i.test(message)) return 'engine_exited';
  return 'unknown';
}
