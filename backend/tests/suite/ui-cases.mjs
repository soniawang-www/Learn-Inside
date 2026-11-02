// 标准测试集合（界面部分）：在真实浏览器里，以三种身份看各个页面，检查显示和可点的东西是否符合身份。
// run(page, ctx) 返回观察值；expect 同 cases.mjs。ctx.go(hash) 打开页面，ctx.text(sel) 取文字。

const same = (v) => ({ guest: v, user: v, member: v });
const WX_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50';

export const UI_FEATURES = [
  { id: 'U1', area: '界面', name: '首页', cases: [
    { id: 'U1-1', name: '首页掌握地图（游客换成注册后可用的功能）', run: async (p, c) => { await c.go('#/'); if (!(await c.text('h1')).includes('的数学')) return 'no-h1'; return (await p.locator('.mm .reg-feats').count()) ? '注册提示' : await p.locator('.mm-tile').count(); }, expect: { guest: '注册提示', user: 30, member: 30 } },
    { id: 'U1-2', name: '顶部「注册就送 10 次互动解析」', run: async (p, c) => { await c.go('#/'); return (await p.locator('.gift-tip').count()) > 0; }, expect: { guest: true, user: false, member: false } },
    { id: 'U1-3', name: '侧栏身份', run: async (p, c) => { await c.go('#/'); const t = await c.text('.side-who small'); return t.includes('游客') ? '游客' : t.includes('会员') ? '会员' : t.replace(/\s/g, ''); }, expect: { guest: '游客', user: '免费次数10', member: '会员' } },
  ] },
  { id: 'U7', area: '界面', name: '注册要输两遍密码', cases: [
    { id: 'U7-1', name: '注册页：两次密码不一样不能提交，一样才行', run: async (p, c) => {
      const ctx = await p.context().browser().newContext(); const q = await ctx.newPage();
      await q.goto(c.base + '/math/'); await q.waitForTimeout(600); if (await q.locator('[data-tab="register"]').count()) await q.click('[data-tab="register"]');
      const phone = '139' + String(Date.now()).slice(-8);
      await q.fill('#join [name=phone]', phone); await q.fill('#join [name=password]', 'abc123'); await q.fill('#join [name=password2]', 'abc124'); await q.fill('#join [name=nickname]', '两遍');
      await q.click('#join [type=submit]'); await q.waitForTimeout(600);
      const bad = (await q.locator('#err').textContent()).includes('不一样') && !(await q.evaluate(() => localStorage.getItem('li.token')));
      await q.fill('#join [name=password2]', 'abc123'); await q.click('#join [type=submit]'); await q.waitForTimeout(1500);
      const good = !!(await q.evaluate(() => localStorage.getItem('li.token')));
      await ctx.close(); return `${bad}/${good}`;
    }, expect: { guest: 'true/true', user: 'skip', member: 'skip' } },
    { id: 'U7-3', name: '用已注册的手机号注册：提示后直接换到登录页，手机号已填好', run: async (p, c) => {
      const phone = c.newPhone(); await c.anon('/api/auth/register', 'POST', { phone, password: 'abc123', nickname: '老用户' });
      const ctx = await p.context().browser().newContext(); const q = await ctx.newPage();
      await q.goto(c.base + '/math/'); await q.waitForTimeout(600);
      await q.fill('#join [name=phone]', phone); await q.fill('#join [name=password]', 'abc123'); await q.fill('#join [name=password2]', 'abc123'); await q.fill('#join [name=nickname]', '再注册');
      await q.click('#join [type=submit]'); await q.waitForTimeout(1200);
      const r = `${(await q.locator('.auth-card h2').textContent()).trim()}/${await q.inputValue('#join [name=phone]') === phone}/${(await q.locator('#err').textContent()).includes('已经注册过')}`;
      await ctx.close(); return r;
    }, expect: { guest: '登录/true/true', user: 'skip', member: 'skip' } },
    { id: 'U7-2', name: '账号页注册 / 改密码表单有「再输一遍」', run: async (p, c) => { await c.go('#/account'); return p.locator('#bind [name=password2], #pw [name=password2]').count(); }, expect: { guest: 1, user: 1, member: 1 } },
  ] },
  { id: 'U8', area: '界面', name: '在微信里打开', cases: [
    { id: 'U8-1', name: '微信里：忘记密码 / 联系客服直接给「打开微信客服」按钮', run: async (p, c) => {
      const ctx = await p.context().browser().newContext({ viewport: { width: 390, height: 844 }, userAgent: WX_UA }); const q = await ctx.newPage();
      await q.goto(c.base + '/math/'); await q.waitForTimeout(700); await q.click('[data-tab="login"]'); await q.click('#forgot'); await q.waitForTimeout(800);
      const r = await q.locator('.support a.btn[href^="https://work.weixin"]').count(); await ctx.close(); return r;
    }, expect: { guest: 1, user: 'skip', member: 'skip' } },
    { id: 'U8-2', name: '微信里点「开通」：提示到浏览器打开，不跳支付宝', run: async (p, c) => {
      const ctx = await p.context().browser().newContext({ viewport: { width: 390, height: 844 }, userAgent: WX_UA }); const q = await ctx.newPage();
      await q.goto(c.base + '/math/'); await q.evaluate(([t, s]) => { localStorage.setItem('li.token', JSON.stringify(t)); localStorage.setItem('li.student', JSON.stringify(s)); }, [c.T, { id: c.sid, nickname: '微信' }]);
      await q.goto(c.base + '/math/#/account'); await q.reload(); await q.waitForTimeout(1000);
      await q.locator('[data-plan]').first().click(); await q.waitForTimeout(700);
      const r = `${(await q.locator('.modal').textContent().catch(() => '')).includes('在浏览器')}/${q.url().includes('alipay')}`; await ctx.close(); return r;
    }, expect: { guest: 'skip', user: 'true/false', member: 'true/false' } },
  ] },
  { id: 'U2', area: '界面', name: '考试与考情', cases: [
    { id: 'U2-1', name: 'AMC 8 试卷卡片数', run: async (p, c) => { await c.go('#/contest/amc8'); return p.locator('.exam-tile').count(); }, expect: same(26) },
    { id: 'U2-2', name: '考情：大类占比 + 知识项表', run: async (p, c) => { await c.go('#/contest/amc8/stats'); return (await p.locator('.mrow').count()) === 8 && (await p.locator('.utable tr').count()) > 20; }, expect: same(true) },
    { id: 'U2-3', name: '点「模考」出现考前须知', run: async (p, c) => { await c.go('#/contest/amc8'); await p.locator('[data-mode="exam"]').first().click(); await p.waitForTimeout(400); return (await p.locator('.modal').count()) > 0; }, expect: same(true) },
  ] },
  { id: 'U3', area: '界面', name: '知识图谱与错题本', cases: [
    { id: 'U3-1', name: '知识图谱画出 30 个知识项', run: async (p, c) => { await c.go('#/graph'); await p.waitForTimeout(500); if (await p.locator('.reg-wall').count()) return '注册提示'; return p.locator('svg .kg-n').count(); }, expect: { guest: '注册提示', user: 30, member: 30 } },
    { id: 'U3-2', name: '列表视图（薄弱在前）', run: async (p, c) => { await c.go('#/graph'); if (await p.locator('.reg-wall').count()) return '注册提示'; await p.click('[data-view="list"]'); await p.waitForTimeout(500); return p.locator('.kl-row').count(); }, expect: { guest: '注册提示', user: 30, member: 30 } },
    { id: 'U3-3', name: '错题本列出错题', run: async (p, c) => { await c.go('#/mistakes'); if (await p.locator('.reg-wall').count()) return '注册提示'; return (await p.locator('.ms-row').count()) > 0; }, expect: { guest: '注册提示', user: true, member: true } },
    { id: 'U3-4', name: '复盘页：错因和知识项链接（游客只显示知识项名字）', run: async (p, c) => { await c.go(`#/review/${c.session}`); return `${await p.locator('.reason-chips').count() > 0}/${await p.locator('.kphead a').count() > 0}/${await p.locator('.kphead b').count() > 0}`; }, expect: { guest: 'false/false/true', user: 'true/true/true', member: 'true/true/true' } },
  ] },
  { id: 'U4', area: '界面', name: '会员内容的锁', cases: [
    { id: 'U4-1', name: '知识项页「开始突击」是否带锁', run: async (p, c) => { await c.go('#/kp/cnt.perm'); if (await p.locator('.reg-wall').count()) return '注册提示'; return (await c.text('[data-drill]')).includes('🔒') ? 'locked' : 'open'; }, expect: { guest: '注册提示', user: 'locked', member: 'open' } },
    { id: 'U4-2', name: '复盘页互动解析按钮是否带锁', run: async (p, c) => { await c.go(`#/review/${c.session}`); return (await c.text('[data-adv]')).includes('🔒') ? 'locked' : 'open'; }, expect: { guest: 'locked', user: 'locked', member: 'open' } },
    { id: 'U4-3', name: '复盘页（有错题）是否提示注册礼', run: async (p, c) => { await c.go(`#/review/${c.session}`); return (await p.locator('.rev-side .gift').count()) > 0; }, expect: { guest: true, user: false, member: false } },
    { id: 'U4-4', name: '点锁住的互动解析', run: async (p, c) => {
      await c.go(`#/review/${c.session}`); await p.locator('[data-adv]').first().click(); await p.waitForTimeout(1200);
      if (await p.locator('.lp-overlay').count()) return '直接打开';
      const m = await c.text('.modal');
      return m.includes('注册就送 10 次') ? '提示注册' : m.includes('用 1 次免费次数解锁') ? '询问用 1 次' : m.slice(0, 20);
    }, expect: { guest: '提示注册', user: '询问用 1 次', member: '直接打开' } },
    { id: 'U4-5', name: '免费样板（2026 年）互动解析', run: async (p, c) => { await c.go('#/problem/amc8-2026-p01'); await p.locator('[data-adv]').click(); await p.waitForTimeout(1200); return (await p.locator('.lp-overlay').count()) > 0 ? '直接打开' : '没打开'; }, expect: same('直接打开') },
  ] },
  { id: 'U5', area: '界面', name: '账号页', cases: [
    { id: 'U5-1', name: '会员卡片显示', run: async (p, c) => { await c.go('#/account'); const t = await c.text('.col-main'); return t.includes('数学会员 到') || t.includes('数学会员到') ? '数学会员' : t.includes('注册就送 10 次') ? '注册礼' : t.includes('剩余免费次数 10 次') ? '剩 10 次' : '?'; }, expect: { guest: '注册礼', user: '剩 10 次', member: '数学会员' } },
    { id: 'U5-2', name: '套餐按钮', run: async (p, c) => { await c.go('#/account'); const n = async (s) => p.locator(s).count(); return `${await n('[data-plan]')}开通/${await n('.plan [data-support]')}找客服/${await n('[data-goreg]')}注册后开通`; }, expect: { guest: '0开通/0找客服/3注册后开通', user: '2开通/1找客服/0注册后开通', member: '2开通/1找客服/0注册后开通' } },
    { id: 'U5-3', name: '激活码提示注册', run: async (p, c) => { await c.go('#/account'); return (await c.text('.col-side')).includes('注册后才能兑换'); }, expect: { guest: true, user: false, member: false } },
    { id: 'U5-4', name: '账号卡片：游客在最上面注册，注册用户在右栏看登录方式', run: async (p, c) => { await c.go('#/account'); const t = await c.text(c.role === 'guest' ? '.col-main > .card:first-child' : '.col-side'); return t.includes('注册账号') ? '注册账号' : t.includes('登录方式') ? '登录方式' : '?'; }, expect: { guest: '注册账号', user: '登录方式', member: '登录方式' } },
    { id: 'U5-5', name: '联系客服弹出二维码说明', run: async (p, c) => { await c.go('#/account'); await p.locator('[data-support]').first().click(); await p.waitForTimeout(500); return (await p.locator('.support').count()) > 0; }, expect: same(true) },
    { id: 'U5-6', name: '活动期间套餐显示原价划线和活动价，手机上不挤', run: async (p, c) => {
      await c.admin('/api/admin/promo', 'POST', { title: '界面测试活动', until: Date.now() + 86400000, prices: { 'math.month': 19.9 } });
      await p.setViewportSize({ width: 360, height: 740 }); await c.go('#/account');
      const r = `${(await c.text('.promo-bar')).includes('界面测试活动')}/${await c.text('.plan .orig')}/${await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1)}`;
      await c.admin('/api/admin/promo', 'DELETE'); await p.setViewportSize({ width: 1366, height: 860 }); return r;
    }, expect: same('true/¥39/true') },
    { id: 'U5-7', name: '次数用完：账号页和解锁弹窗提示转发宣传图再得 10 次', run: async (p, c) => {
      const left = c.aid ? (await c.get('/api/account')).data.credits : 0;
      if (c.aid && left) await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'add_credits', value: -left, reason: '标准测试：次数用完' });
      await c.go('#/account'); const acc = (await p.locator('.col-main .share').count()) > 0;
      await c.go(`#/review/${c.session}`); await p.locator('[data-adv]').first().click(); await p.waitForTimeout(1000);
      const mod = (await p.locator('.modal .share').count()) > 0;
      const img = mod ? await p.evaluate(() => { const i = document.querySelector('.modal .share img'); return i.complete && i.naturalWidth > 500; }) : false;
      if (c.aid && left) await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'add_credits', value: left, reason: '标准测试：恢复次数' });
      return `${acc}/${mod}/${img}`;
    }, expect: { guest: 'false/false/false', user: 'true/true/true', member: 'false/false/false' } },
    { id: 'U5-8', name: '手机上从复盘页点注册：一进账号页就看到注册表单', run: async (p, c) => {
      await p.setViewportSize({ width: 390, height: 844 }); await c.go(`#/review/${c.session}`);
      await p.mouse.wheel(0, 3000); await p.waitForTimeout(300);
      const link = p.locator('.rev-side a[href="#/account"]').first();
      if (!(await link.count())) { await p.setViewportSize({ width: 1366, height: 860 }); return 'no-link'; }
      await link.click(); await p.waitForTimeout(1200);
      const box = await p.locator('#bind').boundingBox(); await p.setViewportSize({ width: 1366, height: 860 });
      return !!box && box.y >= 0 && box.y < 844;
    }, expect: { guest: true, user: 'skip', member: 'skip' } },
  ] },
  { id: 'U6', area: '界面', name: '所有页面在各种屏幕上', cases: [
    { id: 'U6-1', name: '电脑 1440：不溢出、文字不截断、按钮不折行、没有脚本错误', run: async (p, c) => c.sweep(1440, 900, 'light'), expect: same('ok') },
    { id: 'U6-2', name: '手机 390：同上', run: async (p, c) => c.sweep(390, 844, 'light'), expect: same('ok') },
    { id: 'U6-3', name: '手机 390 深色模式：同上', run: async (p, c) => c.sweep(390, 844, 'dark'), expect: same('ok') },
    { id: 'U6-5', name: '小屏手机 360：同上', run: async (p, c) => c.sweep(360, 740, 'light'), expect: same('ok') },
    { id: 'U6-6', name: '最窄 320（或手机调大字号）：同上', run: async (p, c) => c.sweep(320, 640, 'light'), expect: same('ok') },
    { id: 'U6-7', name: '平板 768：同上', run: async (p, c) => c.sweep(768, 1024, 'light'), expect: same('ok') },
    { id: 'U6-4', name: '以上整个界面流程没有脚本错误', run: async (p, c) => (c.errs.length ? c.errs[0] : 'ok'), expect: same('ok') },
  ] },
];
