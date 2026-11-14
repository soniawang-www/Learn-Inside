// 听力播放器：播放 / 暂停、拖动进度条、显示时间。同一页里一次只响一段。
const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';

export const playerHTML = (file, big = false) =>
  `<div class="ap ${big ? 'big' : ''}" data-ap="${file.replace(/"/g, '&quot;')}"><button class="ap-b" type="button" aria-label="播放">${PLAY}</button>` +
  `<input class="ap-s" type="range" min="0" max="1000" value="0" step="1" aria-label="播放进度"><span class="ap-t">0:00</span></div>`;

// root 里所有 .ap 接上声音；base 是音频目录；pos/onPos 用来记住、恢复各段播放位置。返回 stop()。
export function bindPlayers(root, base, { pos = {}, onPos, onError } = {}) {
  const list = []; let dead = false;
  root.querySelectorAll('.ap').forEach((el) => {
    const file = el.dataset.ap; const b = el.querySelector('.ap-b'); const s = el.querySelector('.ap-s'); const t = el.querySelector('.ap-t');
    const a = new Audio(base + file); a.preload = 'metadata';
    let dragging = false;
    const show = () => {
      const d = a.duration;
      if (!dragging && d) s.value = Math.round((1000 * a.currentTime) / d);
      s.style.setProperty('--p', `${(s.value / 10).toFixed(1)}%`);
      t.textContent = d ? `${mmss(a.currentTime)} / ${mmss(d)}` : mmss(a.currentTime);
    };
    const icon = () => { b.innerHTML = a.paused ? PLAY : PAUSE; b.setAttribute('aria-label', a.paused ? '播放' : '暂停'); el.classList.toggle('on', !a.paused); };
    let first = true;
    a.addEventListener('loadedmetadata', () => { if (first && pos[file] && pos[file] < a.duration - 0.5) seek(pos[file]); first = false; show(); });
    a.addEventListener('timeupdate', () => { if (dead) return; show(); onPos?.(file, a.currentTime); });
    a.addEventListener('play', icon); a.addEventListener('pause', icon);
    a.addEventListener('ended', () => { onPos?.(file, 0); a.currentTime = 0; icon(); show(); });
    b.onclick = () => {
      if (!a.paused) { a.pause(); return; }
      list.forEach((x) => x !== a && x.pause());
      a.play().catch(() => onError?.());
    };
    s.oninput = () => { dragging = true; if (a.duration) { const v = (s.value / 1000) * a.duration; t.textContent = `${mmss(v)} / ${mmss(a.duration)}`; } s.style.setProperty('--p', `${(s.value / 10).toFixed(1)}%`); };
    // 服务器不支持分段下载时浏览器拖不动进度，这时把整段录音下载下来再跳
    let blob = null;
    const seekable = () => a.seekable.length && a.seekable.end(0) > 1;
    const whole = () => (blob ||= fetch(a.src).then((r) => r.blob()).then((bl) => new Promise((ok) => {
      const was = !a.paused; a.src = URL.createObjectURL(bl);
      a.addEventListener('loadedmetadata', () => { if (was) a.play().catch(() => {}); ok(); }, { once: true });
    })));
    const seek = async (v) => { if (!seekable()) await whole(); a.currentTime = v; onPos?.(file, v); show(); };
    s.onchange = () => { dragging = false; if (a.duration) seek((s.value / 1000) * a.duration); else show(); };
    list.push(a);
  });
  return () => { dead = true; list.forEach((a) => { a.pause(); a.removeAttribute('src'); a.load(); }); };
}
