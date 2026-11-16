// 答题进度：本机存一份（断网也不丢），再隔几秒存到账号上（换台设备接着做）
// 两边都有时用较新的那份（at = 最后改动的时间）
export function draftSync({ api, store, key, sid, server, init }) {
  const local = store.get(key, null);
  const pick = !local ? server : !server ? local : (server.at || 0) > (local.at || 0) ? server : local;
  const S = Object.assign(init, pick || {});
  let timer = null, dirty = false, stopped = false;
  const push = () => {
    clearTimeout(timer); timer = null;
    if (!dirty || stopped) return;
    dirty = false;
    api(`/api/sessions/${encodeURIComponent(sid)}/draft`, { method: 'POST', body: { draft: S } }).catch(() => { dirty = true; });
  };
  const onHide = () => { if (document.visibilityState === 'hidden') push(); };
  document.addEventListener('visibilitychange', onHide);
  const save = () => {
    S.at = Date.now(); store.set(key, S); dirty = true;
    if (!timer) timer = setTimeout(push, 3000);
  };
  // 离开这一页：把没存上的进度存上；交卷后调用 stop(true) 不再存
  const stop = (done = false) => { if (!done) push(); stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); };
  return { S, save, stop };
}
