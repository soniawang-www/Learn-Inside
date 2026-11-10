// 标准测试集合（界面部分）：在真实浏览器里，以三种身份看各个页面，检查显示和可点的东西是否符合身份。
// run(page, ctx) 返回观察值；expect 同 cases.mjs。ctx.go(hash) 打开页面，ctx.text(sel) 取文字。

const same = (v) => ({ guest: v, user: v, member: v });
const WX_ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; V2309A Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300333 MMWEBSDK/20241103 MMWEBID/1234 MicroMessenger/8.0.54.2760(0x28003637) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64';
const WX_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50';

export const UI_FEATURES = [
  { id: 'U1', area: '界面', name: '数学首页', cases: [
    { id: 'U1-1', name: '只放竞赛入口卡片（AMC 8 / 思维 100 / 希望数学），不铺试卷', run: async (p, c) => { await c.go('#/'); return `${await p.locator('a.fam-card').count()}/${await p.locator('.exam-tile').count()}`; }, expect: same('3/0') },
    { id: 'U1-2', name: '点竞赛卡片进到这个竞赛的试卷', run: async (p, c) => { await c.go('#/'); await p.locator('a.fam-card', { hasText: 'AMC 8' }).click(); await c.settle(); return `${p.url().endsWith('#/contest/amc8')}/${await p.locator('.exam-tile').count()}`; }, expect: same('true/26') },
    { id: 'U1-3', name: '「今天做什么」「最近成绩」一直显示', run: async (p, c) => { await c.go('#/'); return p.locator('.dash-grid > .card').count(); }, expect: same(2) },
    { id: 'U1-4', name: '侧栏底部身份（游客是注册提示）', run: async (p, c) => { await c.go('#/'); const t = await c.text('.sn-who small'); return t.includes('注册送') ? '注册提示' : t.includes('会员') ? '会员' : t.replace(/\s/g, ''); }, expect: { guest: '注册提示', user: '免费次数10', member: '会员' } },
    { id: 'U1-5', name: '知识图谱页最上面的掌握地图（游客换成注册提示）', run: async (p, c) => { await c.go('#/graph'); if (await p.locator('.reg-wall').count()) return '注册提示'; return p.locator('.mm-tile').count(); }, expect: { guest: '注册提示', user: 30, member: 30 } },
    { id: 'U1-6', name: '选过的竞赛和年级记住：希望数学选四年级，刷新后还是四年级', run: async (p, c) => { await c.go('#/contest/hope'); await p.locator('[data-grade="4"]').click(); await c.settle(); await c.go('#/contest/hope'); return c.text('.grade-tabs button.on'); }, expect: same('四年级') },
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
      await q.goto(c.base + '/account/'); await q.waitForTimeout(1500);
      await q.locator('[data-plan]').first().click(); await q.waitForTimeout(700);
      const r = `${(await q.locator('.modal').textContent().catch(() => '')).includes('在浏览器')}/${q.url().includes('alipay')}`; await ctx.close(); return r;
    }, expect: { guest: 'skip', user: 'true/false', member: 'true/false' } },
  ] },
  { id: 'U9', area: '界面', name: '等服务器时不能重复点', cases: [
    { id: 'U9-1', name: '网慢时连点「兑换」：按钮转圈、只发一次请求、顶部有进度条', run: async (p, c) => {
      if (c.role === 'guest') return 'skip';
      let n = 0;
      await p.route('**/api/redeem', async (route) => { n++; await new Promise((r) => setTimeout(r, 1200)); await route.continue().catch(() => {}); });
      await c.go('#/account'); await p.fill('#redeem input', 'NOTACODE00');
      const b = p.locator('#redeem button'); await b.click(); await p.waitForTimeout(250);
      const busy = await b.evaluate((x) => x.classList.contains('busy')); const bar = await p.evaluate(() => document.body.classList.contains('net-wait'));
      await b.click({ force: true }).catch(() => {}); await b.click({ force: true }).catch(() => {});
      await p.waitForTimeout(1800); await p.unroute('**/api/redeem');
      const done = !(await b.evaluate((x) => x.classList.contains('busy')));
      return `${busy}/${bar}/${n}/${done}`;
    }, expect: { guest: 'skip', user: 'true/true/1/true', member: 'true/true/1/true' } },
    { id: 'U9-2', name: '换页时数据没回来：旧页面变淡、不能点', run: async (p, c) => {
      await c.go('#/'); await p.route('**/math/api/families**', async (route) => { await new Promise((r) => setTimeout(r, 1000)); await route.continue().catch(() => {}); });
      await p.evaluate(() => { location.hash = '#/exams'; }); await p.waitForTimeout(400);
      const dim = await p.evaluate(() => document.getElementById('app').classList.contains('page-wait'));
      await p.waitForTimeout(1500); await p.unroute('**/math/api/families**');
      const back = !(await p.evaluate(() => document.getElementById('app').classList.contains('page-wait')));
      return `${dim}/${back}`;
    }, expect: same('true/true') },
  ] },
  { id: 'U2', area: '界面', name: '考试与考情', cases: [
    { id: 'U2-1', name: 'AMC 8 试卷卡片数', run: async (p, c) => { await c.go('#/contest/amc8'); return p.locator('.exam-tile').count(); }, expect: same(26) },
    { id: 'U2-2', name: '考情：大类占比 + 知识项表', run: async (p, c) => { await c.go('#/contest/amc8/stats'); return (await p.locator('.mrow').count()) === 8 && (await p.locator('.utable tr').count()) > 20; }, expect: same(true) },
    { id: 'U2-3', name: '点「模考」出现考前须知', run: async (p, c) => { await c.go('#/contest/amc8'); await p.locator('[data-mode="exam"]').first().click(); await p.waitForTimeout(400); return (await p.locator('.modal').count()) > 0; }, expect: same(true) },
    { id: 'U2-4', name: '希望数学：按年级列卷，填空题是输入框，没有语言切换', run: async (p, c) => {
      await c.go('#/contest/hope'); const tabs = (await p.locator('.grade-tabs button').count()) > 1 ? 1 : 0;
      await p.locator('[data-grade="4"]').click(); await c.settle();
      await p.locator('[data-start="hope-2019w-g4"][data-mode="practice"]').click(); await p.waitForSelector('#go'); await p.click('#go'); await p.waitForSelector('.ez-q');
      const r = `${tabs}/${await p.locator('#fill').count()}/${await p.locator('#lang').count()}`;
      await p.fill('#fill', '4'); const prog = await p.textContent('.ez-prow span:last-child');
      return `${r}/${prog}`;
    }, expect: same('1/1/0/1/40') },
    { id: 'U2-5', name: '试卷卡片点「打印」：先打印预览（25 题、没有答案页），回填页另开', run: async (p, c) => {
      // 留两份没交的回填卷给各种屏幕的检查用（选择题卷、填空题卷）
      c.paperSids = [];
      for (const ex of ['amc8-2016', 'hope-2025w-g7']) c.paperSids.push((await c.post('/math/api/sessions', { exam_id: ex, student_id: c.sid, mode: 'paper' })).data.session.id);
      await c.go('#/contest/amc8'); await p.locator('[data-paper="amc8-2017"]').click(); await p.waitForSelector('#pp-print');
      const steps = await p.locator('.pp-step').count();
      await p.click('#pp-print'); await p.waitForSelector('#pvSheet .it', { timeout: 15000 });
      const r = `${steps}/${await p.locator('#pvSheet .it').count()}/${await p.locator('#pvSheet .ai').count()}/${await p.locator('#pvSheet .fa').count()}`;
      await p.click('#pvClose'); return r;
    }, expect: same('2/25/0/0') },
    { id: 'U2-6', name: '回填答案：点字母选、再点取消，填用时，交卷后复盘标「纸笔」、用时是填的', run: async (p, c) => {
      await c.go('#/contest/amc8'); await p.locator('[data-paper="amc8-2017"]').click(); await p.waitForSelector('#pp-fill');
      await p.click('#pp-fill'); await p.waitForSelector('.pp-row'); await c.settle();
      const rows = await p.locator('.pp-row').count();
      await p.locator('.pp-opts').nth(0).locator('[data-pick="B"]').click();
      await p.locator('.pp-opts').nth(1).locator('[data-pick="C"]').click(); await p.locator('.pp-opts').nth(1).locator('[data-pick="C"]').click();
      await p.locator('.pp-opts').nth(2).locator('[data-pick="D"]').click();
      await p.fill('#pp-used', '38');
      const cnt = await c.text('#pp-count');
      await p.reload(); await c.settle(); // 刷新后填的还在
      const kept = `${await p.locator('.pp-opt[aria-pressed="true"]').count()}/${await p.inputValue('#pp-used')}`;
      await p.click('#pp-submit'); await p.click('#yes'); await p.waitForSelector('.rev-score'); await c.settle();
      const sub = await c.text('.ph p'), used = await c.text('.rev-meta dd');
      return `${rows}/${cnt}/${kept}/${sub.startsWith('纸笔')}/${used.startsWith('38:00')}/${await p.locator('.ritem').count()}`;
    }, expect: same('25/已填 2 / 25/2/38/true/true/25') },
    { id: 'U2-7', name: '填空卷回填：输入框、回车跳到下一题', run: async (p, c) => {
      await c.go(`#/exam/${c.paperSids[1]}`); await p.waitForSelector('.pp-in');
      const n = await p.locator('.pp-in').count();
      await p.locator('.pp-in').nth(0).fill('4025'); await p.keyboard.press('Enter');
      const next = await p.evaluate(() => document.activeElement === document.querySelectorAll('.pp-in')[1]);
      return `${n}/${next}/${await c.text('#pp-count')}/${await p.locator('.pp-fmt').count()}`;
    }, expect: same('24/true/已填 1 / 25/1') },
    { id: 'U2-8', name: '安卓微信打印整卷 → 换到浏览器打开链接，没登录也直接进打印预览', run: async (p, c) => {
      const token = await p.evaluate(() => localStorage.getItem('li.token')), student = await p.evaluate(() => localStorage.getItem('li.student'));
      const b = p.context().browser();
      const wx = await b.newContext({ userAgent: WX_ANDROID_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const q = await wx.newPage();
      await q.goto(c.base + '/math/'); await q.evaluate(([t, s]) => { localStorage.setItem('li.token', t); localStorage.setItem('li.student', s); }, [token, student]);
      await q.goto(c.base + '/math/#/contest/amc8'); await q.reload(); await q.waitForSelector('[data-paper="amc8-2017"]');
      await q.click('[data-paper="amc8-2017"]'); await q.click('#pp-print'); await q.waitForSelector('#pvSheet .it');
      await q.click('#pvPdf'); await q.waitForFunction(() => /在浏览器打开/.test(document.querySelector('#pvTip')?.textContent || ''));
      const url = q.url(); await wx.close();
      const ext = await b.newContext({ viewport: { width: 390, height: 844 } }); const r = await ext.newPage();
      await r.goto(url); await r.waitForSelector('#pvSheet .it', { timeout: 15000 });
      const m = await r.locator('#pvSheet .it').count(); await r.click('#pvClose');
      const back = await r.locator('a.btn', { hasText: '回到数学' }).count(); await ext.close();
      return `${/\/math\/\?print=[0-9a-f]{64}$/.test(url)}/${m}/${back}`;
    }, expect: same('true/25/1') },
  ] },
  { id: 'U3', area: '界面', name: '知识图谱与错题本', cases: [
    { id: 'U3-1', name: '知识图谱画出 30 个知识项', run: async (p, c) => { await c.go('#/graph'); await p.waitForTimeout(500); if (await p.locator('.reg-wall').count()) return '注册提示'; return p.locator('svg .kg-n').count(); }, expect: { guest: '注册提示', user: 30, member: 30 } },
    { id: 'U3-2', name: '列表视图（薄弱在前）', run: async (p, c) => { await c.go('#/graph'); if (await p.locator('.reg-wall').count()) return '注册提示'; await p.click('[data-view="list"]'); await p.waitForTimeout(500); return p.locator('.kl-row').count(); }, expect: { guest: '注册提示', user: 30, member: 30 } },
    { id: 'U3-3', name: '错题本列出错题', run: async (p, c) => { await c.go('#/mistakes'); if (await p.locator('.reg-wall').count()) return '注册提示'; return (await p.locator('.ms-row').count()) > 0; }, expect: { guest: '注册提示', user: true, member: true } },
    { id: 'U3-4', name: '复盘页：错因和知识项链接（游客只显示知识项名字）', run: async (p, c) => { await c.go(`#/review/${c.session}`); return `${await p.locator('.reason-chips').count() > 0}/${await p.locator('.kphead a').count() > 0}/${await p.locator('.kphead b').count() > 0}`; }, expect: { guest: 'false/false/true', user: 'true/true/true', member: 'true/true/true' } },
    { id: 'U3-8', name: '复盘页：互动解析是缩略图（有图、有步数），紧跟在解题思路下面；考点卡不再列「怎么认出这个考点」；点缩略图打开或提示解锁', run: async (p, c) => {
      await c.go(`#/review/${c.session}`); await p.waitForTimeout(800);
      const card = p.locator('.ritem .adv-card').first(); if (!(await card.count())) return 'none';
      const afterSol = await p.evaluate(() => [...document.querySelectorAll('.ritem .adv-card')].every((x) => x.previousElementSibling?.classList.contains('solution')));
      const pic = await card.locator('.adv-pic svg, .adv-pic img, .adv-pic .adv-tt').count() > 0, steps = /\d+ 步/.test(await card.textContent());
      const sig = await p.locator('.kpcard .signals').count();
      await card.click(); await p.waitForTimeout(800);
      const opened = (await p.locator('.lp-overlay').count()) ? 'lesson' : (await p.locator('.modal').count()) ? 'unlock' : 'nothing';
      await p.keyboard.press('Escape').catch(() => {}); await p.locator('.lp-x').click().catch(() => {});
      return `${afterSol}/${pic}/${steps}/${sig}/${opened}`;
    }, expect: { guest: 'true/true/true/0/unlock', user: 'true/true/true/0/unlock', member: 'true/true/true/0/lesson' } },
    { id: 'U3-5', name: '错题本「打印错题」→ 打印预览：题数和答案数等于错题数', run: async (p, c) => {
      await c.go('#/mistakes'); if (await p.locator('.reg-wall').count()) return '注册提示';
      const total = +(/共 (\d+) 道/.exec(await c.text('.ph p')) || [])[1];
      await p.click('[data-ms-print]'); await p.click('[data-pr-scope="all"]'); await p.click('#pr-go');
      await p.waitForSelector('#pvSheet .it', { timeout: 15000 });
      const n = await p.locator('#pvSheet .it').count(), na = await p.locator('#pvSheet .ai').count();
      return total > 0 && n === Math.min(total, 60) && na === n;
    }, expect: { guest: '注册提示', user: true, member: true } },
    { id: 'U3-6', name: '打印预览「存成 PDF」生成 A4 页，打印媒体下只剩练习单', run: async (p, c) => {
      if (!(await p.locator('#pvPdf').count())) return '注册提示';
      await p.click('#pvPdf'); await p.waitForFunction(() => /已生成 \d+ 页 PDF/.test(document.querySelector('#pvTip')?.textContent || ''), null, { timeout: 120000 });
      await p.emulateMedia({ media: 'print' });
      const ok = await p.evaluate(() => getComputedStyle(document.getElementById('app')).display === 'none' && getComputedStyle(document.querySelector('.pv-bar')).display === 'none' && getComputedStyle(document.getElementById('printArea')).position === 'static');
      await p.emulateMedia({ media: 'screen' }); await p.click('#pvClose');
      return ok && (await p.locator('#printArea').isHidden());
    }, expect: { guest: '注册提示', user: true, member: true } },
    { id: 'U3-7', name: '安卓微信「存成 PDF」→ 提示在浏览器打开；没登录的浏览器打开链接直接进打印预览，题数一致', run: async (p, c) => {
      const token = await p.evaluate(() => localStorage.getItem('li.token')), student = await p.evaluate(() => localStorage.getItem('li.student'));
      const b = p.context().browser();
      const wx = await b.newContext({ userAgent: WX_ANDROID_UA, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const q = await wx.newPage();
      await q.goto(c.base + '/math/'); await q.evaluate(([t, s]) => { localStorage.setItem('li.token', t); localStorage.setItem('li.student', s); }, [token, student]);
      await q.goto(c.base + '/math/#/mistakes'); await q.reload(); await q.waitForTimeout(900);
      if (await q.locator('.reg-wall').count()) { await wx.close(); return '注册提示'; }
      await q.click('[data-ms-print]'); await q.click('[data-pr-scope="all"]'); await q.click('#pr-go'); await q.waitForSelector('#pvSheet .it');
      const n = await q.locator('#pvSheet .it').count();
      await q.click('#pvPdf'); await q.waitForFunction(() => /在浏览器打开/.test(document.querySelector('#pvTip')?.textContent || ''));
      const url = q.url(); const okUrl = /\/math\/\?print=[0-9a-f]{64}$/.test(url);
      await q.click('#pvClose'); const restored = !q.url().includes('print='); await wx.close();
      const ext = await b.newContext({ viewport: { width: 390, height: 844 } }); const r = await ext.newPage(); // 手机浏览器：没有登录状态
      await r.goto(url); await r.waitForSelector('#pvSheet .it', { timeout: 15000 });
      const m = await r.locator('#pvSheet .it').count(), loggedOut = !(await r.evaluate(() => localStorage.getItem('li.token')));
      await ext.close();
      return `${okUrl}/${restored}/${m === n && n > 0}/${loggedOut}`;
    }, expect: { guest: '注册提示', user: 'true/true/true/true', member: 'true/true/true/true' } },
  ] },
  { id: 'U4', area: '界面', name: '会员内容的锁', cases: [
    { id: 'U4-1', name: '知识项页「开始突击」是否带锁', run: async (p, c) => { await c.go('#/kp/cnt.perm'); if (await p.locator('.reg-wall').count()) return '注册提示'; return (await p.locator('[data-drill] .ic-lock').count()) > 0 ? 'locked' : 'open'; }, expect: { guest: '注册提示', user: 'locked', member: 'open' } },
    { id: 'U4-2', name: '复盘页互动解析按钮是否带锁', run: async (p, c) => { await c.go(`#/review/${c.session}`); return (await p.locator('[data-adv]').first().locator('.ic-lock').count()) > 0 ? 'locked' : 'open'; }, expect: { guest: 'locked', user: 'locked', member: 'open' } },
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
    { id: 'U5-2', name: '套餐按钮（测试环境：数学 39/99/299、英语月卡 29、语文月卡 19、全科年卡 599，单笔上限 100）', run: async (p, c) => { await c.go('#/account'); const n = async (s) => p.locator(s).count(); return `${await n('[data-plan]')}开通/${await n('.plan [data-support]')}找客服/${await n('[data-goreg]')}注册后开通`; }, expect: { guest: '0开通/0找客服/6注册后开通', user: '4开通/2找客服/0注册后开通', member: '4开通/2找客服/0注册后开通' } },
    { id: 'U5-3', name: '激活码：游客输入框不能用、提示注册后可兑换', run: async (p, c) => { await c.go('#/account'); const i = p.locator('#redeem input'); return `${await i.isDisabled()}/${await i.getAttribute('placeholder')}`; }, expect: { guest: 'true/注册后可兑换', user: 'false/输入激活码', member: 'false/输入激活码' } },
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
  { id: 'U11', area: '界面', name: '语文', cases: [
    { id: 'U11-1', name: '语文首页：汉字小达人、古诗文大会、诗人卡和常识卡、每日背诗、飞花令（语文会员）五张卡片', run: async (p, c) => { await c.go('/chinese/'); return `${await p.locator('a.fam-card').count()}/${await p.locator('a.fam-card[href="#/hanzi"]').count()}/${await p.locator('a.fam-card[href="#/gsw"]').count()}/${(await c.text('a.fam-card[href$="feihua.html"] .vip')).trim()}`; }, expect: same('5/1/1/语文会员') },
    { id: 'U11-6', name: '飞花令会员版：不是语文会员只能试「花」字，有开通入口；原来的免费飞花令页面不受影响', run: async (p, c) => {
      await c.go('/chinese/feihua.html'); await p.locator('#home').waitFor({ timeout: 15000 }); await p.waitForTimeout(1500);
      const gate = (await c.text('.fh-gate')).includes('试「花」字');
      await c.go('/chinese/feihua.html#full'); await p.waitForTimeout(1500);
      const chars = await p.evaluate(() => window.__FHL?.chars?.length || 0);
      await c.go('/chinese/feihualing.html'); await p.waitForTimeout(1000);
      const old = await p.evaluate(() => !!document.getElementById('fhl-data') && (document.querySelector('.fh-gate') === null));
      return `${gate}/${chars}/${old}`;
    }, expect: same('true/1/true') },
    { id: 'U11-7', name: '飞花令总决选版：5 个赛题用字，比一比默认每句限时 10 秒，开赛后显示倒数', run: async (p, c) => {
      if (c.role === 'member') await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'add_days', value: 31, tier: 'chinese', reason: '标准测试：语文会员' });
      await c.go('/chinese/feihua.html#final'); await p.waitForTimeout(2000);
      if (!(await p.locator('#app').isVisible())) return '会员才能进';
      const n = await p.locator('#chars8 button').count();
      await p.click('#tab-game'); const lim = await p.locator('#tLimit').inputValue();
      await p.click('#startBtn'); await p.waitForTimeout(1300);
      return `${n}/${lim}/${await p.locator('#tClock').isVisible()}`;
    }, expect: { guest: '会员才能进', user: '会员才能进', member: '5/10/true' } },
    { id: 'U11-2', name: '语文首页：「今天做什么」「最近成绩」一直显示，今天做什么推荐一套没做过的卷子', run: async (p, c) => { await c.go('/chinese/'); return `${await p.locator('.dash-grid > .card').count()}/${await p.locator('.tasks a[href^="#/intro/"]').count()}`; }, expect: same('2/1') },
    { id: 'U11-3', name: '点汉字小达人进到试卷列表（真题 + 模拟题）', run: async (p, c) => { await c.go('/chinese/'); await p.locator('a.fam-card[href="#/hanzi"]').click(); await c.settle(); return `${p.url().endsWith('#/hanzi')}/${await p.locator('.exam-row').count()}`; }, expect: same('true/6') },
    { id: 'U11-4', name: '考前须知：标题是试卷名、5 条规则、有「开始答题」', run: async (p, c) => { await c.go('/chinese/#/intro/hanzi-2021-city'); return `${(await c.text('main h1')).includes('第八届')}/${await p.locator('.rules li').count()}/${await p.locator('main button, main a').filter({ hasText: '开始答题' }).count()}`; }, expect: same('true/5/1') },
    { id: 'U11-5', name: '语文错题本（游客是注册提示）', run: async (p, c) => { await c.go('/chinese/#/mistakes'); const h = await c.text('main h2'); return h.includes('注册') ? '注册提示' : h.includes('还没有错题') ? '还没有错题' : (await p.locator('.mk').count()) > 0 ? '有错题' : '?'; }, expect: { guest: '注册提示', user: '还没有错题', member: '还没有错题' } },
    { id: 'U11-6', name: '语文登录统一在账号页：没登录打开语文 → 账号页 → 游客进入后回到语文', run: async (p, c) => {
      const ctx = await p.context().browser().newContext(); const q = await ctx.newPage();
      await q.goto(c.base + '/chinese/#/hanzi'); await q.waitForURL(/\/account\//, { timeout: 10000 }); await q.getByText('先不注册，直接试试').click();
      await q.waitForURL(/\/chinese\//, { timeout: 15000 }); const r = q.url().endsWith('/chinese/#/hanzi'); await ctx.close(); return r;
    }, expect: { guest: true, user: 'skip', member: 'skip' } },
  ] },
  { id: 'U16', area: '英语', name: '英语 · ESDP', cases: [
    { id: 'U16-1', name: '英语首页：ESDP 卡片', run: async (p, c) => { await c.go('/english/'); return await p.locator('a.fam-card[href="#/esdp"]').count(); }, expect: same(1) },
    { id: 'U16-2', name: 'ESDP 页：组别切换、4 个模拟比赛、按话题学 5 行', run: async (p, c) => { await c.go('/english/#/esdp'); return `${await p.locator('.seg button').count()}/${await p.locator('.mode').count()}/${await p.locator('.learn-row').count()}`; }, expect: same('2/4/5') },
    { id: 'U16-3', name: '学习页样题：一步步打开提示 → 提纲 → 参考句子 → 背诵', run: async (p, c) => { await c.go('/english/#/learn/esdp-speak-low-p01'); const n0 = await p.locator('.step.shut').count(); await p.locator('[data-reveal="4"]').click(); return `${n0}/${await p.locator('.step.shut').count()}/${await p.locator('.recite .rc').count() > 0}`; }, expect: same('4/0/true') },
    { id: 'U16-4', name: '背诵：挖空模式能点开空', run: async (p, c) => { await c.go('/english/#/learn/esdp-speak-low-p01'); await p.locator('[data-reveal="4"]').click(); await p.locator('[data-mode="holes"]').click(); const h = p.locator('.hole').first(); await h.click(); return await h.evaluate((e) => e.classList.contains('open')); }, expect: same(true) },
    { id: 'U16-5', name: '没解锁的题：显示解锁按钮', run: async (p, c) => { await c.go('/english/#/learn/esdp-speak-low-p30'); return await p.locator('[data-unlock]').count(); }, expect: same(1) },
    { id: 'U16-6', name: '模拟半决赛：选不准备 → 开始说 → 计时 → 说完了出结果', run: async (p, c) => { await c.go('/english/#/speech/esdp-speak-high-p05'); await p.locator('[data-prep="0"]').click(); await p.locator('#go').click(); await p.locator('#stop').waitFor(); await p.waitForTimeout(1200); await p.locator('#stop').click(); await p.locator('.result').waitFor(); return await p.locator('.checks label').count(); }, expect: same(5) },
    { id: 'U16-7', name: '模拟复赛：连答 3 题出结果', run: async (p, c) => { await c.go('/english/#/interview'); await p.locator('#go').click(); for (let i = 0; i < 3; i++) { await p.locator('#nx').waitFor(); await p.locator('#nx').click(); } await p.locator('.result').waitFor(); return await p.locator('.iv-list .q-row').count(); }, expect: same(3) },
    { id: 'U16-8', name: '模拟决赛：准备 → 演讲 → 评委 2 问 → 出结果', run: async (p, c) => { await c.go('/english/#/draw/esdp-speak-high?s=3'); await p.locator('#go').click(); for (let i = 0; i < 4; i++) { await p.locator('#nx').waitFor(); await p.locator('#nx').click(); await p.waitForTimeout(300); } await p.locator('.fin-res').waitFor(); return await p.locator('.fr-row').count(); }, expect: same(2) },
    { id: 'U16-9', name: '话题列表：真题筛选只列真题', run: async (p, c) => { await c.go('/english/#/bank/esdp-speak-high?s=3&f=real'); const n = await p.locator('.q-row').count(); return n > 0 && n === await p.locator('.q-row .tag.real').count(); }, expect: same(true) },
  ] },
  { id: 'U12', area: '界面', name: '左侧导航', cases: [
    { id: 'U12-1', name: '导航项：首页 / 数学 / 语文 / 英语 / 账号 + 联系客服', run: async (p, c) => { await c.go('#/'); const a = (await p.locator('.side .sn-nav > a span').allTextContents()).join('/'); return `${a}/${await p.locator('.side .sn-soon').count()}/${await p.locator('.side .sn-help').count()}`; }, expect: same('首页/数学/语文/英语/账号/0/1') },
    { id: 'U12-2', name: '数学、语文、账号页都有同一个导航（首页没有）', run: async (p, c) => { const n = []; for (const u of ['#/', '/chinese/', '/account/', '/']) { await c.go(u); n.push(await p.locator('.side').count()); } return n.join(''); }, expect: same('1110') },
    { id: 'U12-3', name: '电脑：收起导航，刷新后还是收起的', run: async (p, c) => { await c.go('#/'); await p.click('[data-sidefold]'); await c.go('#/'); const mini = await p.evaluate(() => document.documentElement.classList.contains('side-mini')); await p.click('[data-sidefold]'); return `${mini}/${await p.evaluate(() => document.documentElement.classList.contains('side-mini'))}`; }, expect: same('true/false') },
    { id: 'U12-4', name: '手机：菜单在左上角、logo 在右上角，导航从左边滑出，点遮罩关上', run: async (p, c) => {
      await p.setViewportSize({ width: 390, height: 844 }); await c.go('#/');
      const m = await p.locator('.sn-menu').boundingBox(), l = await p.locator('.sn-bar .sn-logo').boundingBox();
      await p.click('.sn-menu'); await p.waitForTimeout(400); const open = Math.round((await p.locator('.side').boundingBox()).x) === 0;
      await p.locator('.sn-mask').click({ position: { x: 370, y: 400 } }); await p.waitForTimeout(400); const shut = (await p.locator('.side').boundingBox()).x < 0;
      await p.setViewportSize({ width: 1366, height: 860 });
      return `${m.x < 60}/${l.x + l.width > 330}/${open}/${shut}`;
    }, expect: same('true/true/true/true') },
  ] },
  { id: 'U13', area: '界面', name: '加载时的样子', cases: [
    { id: 'U13-1', name: '第一次打开（数据慢）：不弹漫画；内容区是灰色占位块，顶部进度条在走；加载完换成内容、进度条消失', run: async (p, c) => {
      const ctx = await p.context().browser().newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage();
      await q.goto(c.base + '/math/'); await q.evaluate(([t, s]) => { localStorage.setItem('li.token', JSON.stringify(t)); localStorage.setItem('li.student', JSON.stringify(s)); }, [c.T, { id: c.sid, nickname: '慢' }]);
      await q.route('**/math/api/**', async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue().catch(() => {}); });
      await q.goto(c.base + '/math/'); await q.waitForTimeout(1300);
      const sk = await q.locator('#app .sk').isVisible(), comic = await q.locator('.li-load, .li-ring').count(), bar = await q.evaluate(() => document.body.classList.contains('net-wait'));
      await q.waitForSelector('.fam-card', { timeout: 30000 }); await q.waitForTimeout(300);
      const gone = (await q.locator('.sk').count()) === 0, barGone = await q.evaluate(() => !document.body.classList.contains('net-wait')); await ctx.close();
      return `${sk}/${comic}/${bar}/${gone}/${barGone}`;
    }, expect: same('true/0/true/true/true') },
    { id: 'U13-5', name: '各页第一次打开都是同一种加载：数学、语文、英语、账号页先出占位块，没有加载漫画', run: async (p, c) => {
      const out = [];
      for (const u of ['/math/', '/chinese/', '/english/', '/account/']) { const h = await (await fetch(c.base + u)).text(); out.push(h.includes('sk-first') && !h.includes('li-load') && h.includes('<body class="net-wait">') ? 1 : 0); }
      return out.join('');
    }, expect: same('1111') },
    { id: 'U13-2', name: '数学站内换页（数据慢）：不弹漫画；内容区原地显示骨架，导航不动，顶部进度条在走；加载完换成内容', run: async (p, c) => {
      await c.go('#/contest/amc8'); await p.route('**/math/api/families**', async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue().catch(() => {}); });
      await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1000);
      const sk = await p.locator('#app > main .sk').isVisible(), comic = await p.locator('.li-load').count(), nav = await p.locator('#app > .side').count(), bar = await p.evaluate(() => document.body.classList.contains('net-wait'));
      await p.waitForSelector('.fam-card', { timeout: 15000 }); await p.unroute('**/math/api/families**');
      return `${sk}/${comic}/${nav}/${bar}/${(await p.locator('.sk').count()) === 0}`;
    }, expect: same('true/0/1/true/true') },
    { id: 'U13-3', name: '语文站内换页（数据慢）：同样显示骨架', run: async (p, c) => {
      await c.go('/chinese/#/hanzi'); await p.route('**/api/exams**', async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue().catch(() => {}); });
      await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(1000);
      const sk = await p.locator('#app > main .sk').isVisible(), comic = await p.locator('.li-load').count();
      await p.waitForSelector('.fam-card', { timeout: 15000 }); await p.unroute('**/api/exams**');
      return `${sk}/${comic}/${(await p.locator('.sk').count()) === 0}`;
    }, expect: same('true/0/true') },
    { id: 'U13-4', name: '网快时换页：不出骨架也不弹漫画', run: async (p, c) => { await c.go('#/contest/amc8'); await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(250); return `${await p.locator('.sk').count()}/${await p.locator('.li-load').count()}`; }, expect: same('0/0') },
  ] },
  { id: 'U14', area: '界面', name: '网站首页', cases: [
    { id: 'U14-1', name: '数学、语文、英语三张科目卡片', run: async (p, c) => { await c.go('/'); return `${await p.locator('a.subj').count()}/${await p.locator('.subj-soon').count()}`; }, expect: same('3/0') },
    { id: 'U14-2', name: '漫画弹窗：新访客弹，做过题的不弹（看「继续上次」）', run: async (p, c) => {
      const ctx = await p.context().browser().newContext(); const q = await ctx.newPage(); await q.goto(c.base + '/'); await q.waitForTimeout(1200);
      const fresh = await q.locator('#promo').isVisible(); await ctx.close();
      await c.go('/'); await p.waitForTimeout(800); return `${fresh}/${await p.locator('#promo').isVisible()}`;
    }, expect: same('true/false') },
    { id: 'U14-3', name: '漫画弹窗有数学、语文、英语三页，每页四格；点「英语」滑到英语那页', run: async (p, c) => {
      const ctx = await p.context().browser().newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); await q.goto(c.base + '/'); await q.waitForTimeout(1200);
      const tabs = (await q.locator('.promo-dots button').allInnerTexts()).join(','), figs = await q.$$eval('.promo-slide', (l) => l.map((x) => x.querySelectorAll('.comic figure').length).join(''));
      await q.click('[data-slide="2"]'); await q.waitForTimeout(900);
      const on = await q.locator('.promo-dots button.on').innerText(), vis = await q.evaluate(() => { const r = document.querySelector('.promo-slide.en').getBoundingClientRect(), t = document.getElementById('promo-track').getBoundingClientRect(); return Math.abs(r.left - t.left) < 4; });
      await ctx.close(); return `${tabs}/${figs}/${on}/${vis}`;
    }, expect: same('数学,语文,英语/444/英语/true') },
  ] },
  { id: 'U15', area: '界面', name: '语文答题（和比赛界面一样）', cases: [
    { id: 'U15-1', name: '开考：一页一题、有倒计时，没作答「下一页」不能点，没有「上一页」，不显示还剩多少题', run: async (p, c) => {
      await c.go('/chinese/#/intro/hanzi-2021-city'); await p.getByText(/开始答题|重新开始/).first().click(); await p.locator('.ex-q').waitFor({ timeout: 15000 });
      c.zhExam = p.url().split('#/exam/')[1];
      const body = await p.locator('body').innerText();
      return `${await p.locator('.ex-q').count()}/${await p.locator('#clock').isVisible()}/${await p.locator('.ex-next').isDisabled()}/${(await p.getByText('上一页').count()) === 0}/${!/第\s*\d+\s*\/\s*150|还剩\s*\d+\s*题/.test(body)}`;
    }, expect: same('1/true/true/true/true') },
    { id: 'U15-2', name: '做了 3 题后刷新：从第 4 题接着做', run: async (p, c) => {
      for (let n = 1; n <= 3; n++) await c.zhAnswer(n, n === 1 ? 'wrong' : 'right');
      await p.reload(); await p.locator('.ex-q').waitFor({ timeout: 15000 }); return ((await p.locator('.ex-q').innerText()).match(/(\d+)\./) || [])[1] === '4';
    }, expect: same(true) },
    { id: 'U15-3', name: '手机 390 深色模式下答题页不溢出、选项按钮完整', run: async (p, c) => {
      await p.setViewportSize({ width: 390, height: 844 }); await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(300);
      const r = `${await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)}/${await p.locator('.ex-next').isVisible()}`;
      await p.emulateMedia({ colorScheme: 'light' }); await p.setViewportSize({ width: 1366, height: 860 }); return r;
    }, expect: same('true/true') },
    { id: 'U15-4', name: '做完整套（第 1 题故意做错）：交卷得 149 分，成绩页有各大题得分', run: async (p, c) => {
      const n0 = +((await p.locator('.ex-q').innerText()).match(/(\d+)\./) || [])[1];
      for (let n = n0; n <= c.zhKey.length; n++) await c.zhAnswer(n, 'right');
      await p.locator('.score-big').waitFor({ timeout: 20000 });
      return `${await c.text('.score-big b')}/${(await p.locator('.score .tbl tr').count()) > 1}`;
    }, expect: same('149/true') },
    { id: 'U15-5', name: '成绩页：游客提示注册收进错题本，注册用户直接去错题本', run: async (p, c) => (await c.text('.score .actions')).includes('注册后收进错题本') ? '注册提示' : (await c.text('.score .actions')).includes('去错题本') ? '去错题本' : '?', expect: { guest: '注册提示', user: '去错题本', member: '去错题本' } },
    { id: 'U15-6', name: '做错的题进了语文错题本（数学错题本里没有）', run: async (p, c) => {
      await c.go('/chinese/#/mistakes'); if ((await c.text('main h2')).includes('注册')) return '注册提示';
      const zh = await p.locator('.mk').count(); await c.go('#/mistakes'); const mathHasHanzi = (await c.text('main')).includes('汉字');
      return `${zh}/${mathHasHanzi}`;
    }, expect: { guest: '注册提示', user: '1/false', member: '1/false' } },
  ] },
  { id: 'U17', area: '界面', name: '古诗文大会（线上初选 / 复选卷、决选笔试卷）', cases: [
    { id: 'U17-1', name: '语文首页有古诗文大会入口；卷子页有年级切换（小学 3 档 + 初中 2 档）和决选 / 复选 / 初选分组', run: async (p, c) => {
      await c.go('/chinese/#/'); await p.locator('a.fam-card[href="#/gsw"]').waitFor({ timeout: 15000 });
      await c.go('/chinese/#/gsw'); await p.locator('.seg button').first().waitFor({ timeout: 15000 });
      const h2 = await p.locator('main .card h2').allInnerTexts();
      return `${await p.locator('.seg button').count()}/${['决选', '复选', '初选'].every((k) => h2.some((t) => t.startsWith(k)))}`;
    }, expect: same('5/true') },
    { id: 'U17-2', name: '复选卷：一屏一题、显示「单选题（1/N）」、能跳到下一题再回上一题、键盘 B 选中', run: async (p, c) => {
      await c.go('/chinese/#/intro/gsw-2025-fx-g4'); await p.getByText(/开始答题|重新开始/).first().click(); await p.locator('.gx-q').waitFor({ timeout: 15000 });
      const t1 = await c.text('.gx-type'); await p.click('#next'); const t2 = await c.text('.gx-type'); await p.click('#prev');
      await p.keyboard.press('b'); const on = await p.locator('.gx-opt.on').getAttribute('data-k');
      return `${/（1\/\d+）/.test(t1)}/${/（2\/\d+）/.test(t2)}/${on}`;
    }, expect: same('true/true/B') },
    { id: 'U17-3', name: '复选卷手机深色模式不溢出，上一题 / 下一题都在', run: async (p, c) => {
      await p.setViewportSize({ width: 360, height: 760 }); await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(300);
      const r = `${await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)}/${await p.locator('#prev').isVisible()}/${await p.locator('#next').isVisible()}`;
      await p.emulateMedia({ colorScheme: 'light' }); await p.setViewportSize({ width: 1366, height: 860 }); return r;
    }, expect: same('true/true/true') },
    { id: 'U17-4', name: '决选笔试卷：整卷一页，有填空框和简答框，顶部有倒计时和交卷', run: async (p, c) => {
      await c.go('/chinese/#/intro/gsw-2016-jx-g4'); await p.getByText(/开始答题|重新开始/).first().click(); await p.locator('.pp-q').first().waitFor({ timeout: 15000 });
      return `${(await p.locator('.pp-q').count()) > 40}/${(await p.locator('.pp-fill').count()) > 0}/${(await p.locator('.pp-text').count()) > 0}/${await p.locator('#clock').isVisible()}/${await p.locator('#hand').isVisible()}`;
    }, expect: same('true/true/true/true/true') },
    { id: 'U17-5', name: '决选卷交卷后：成绩页有简答自评，勾一个得分点保存后总分增加', run: async (p, c) => {
      await p.locator('.pp-text').first().fill('我最喜欢李白'); await p.click('#hand'); await p.click('#sure');
      await p.locator('#selfcard').waitFor({ timeout: 20000 });
      const before = +(await c.text('#tot')); const sf = p.locator('.sf').first(); await sf.locator('input[type=checkbox]').first().check();
      await sf.locator('[data-save]').click(); await p.waitForTimeout(1500);
      return +(await c.text('#tot')) > before;
    }, expect: same(true) },
  ] },
  { id: 'U19', area: '界面', name: '古诗文练习（速答 / 专项）', cases: [
    { id: 'U19-1', name: '古诗文页有「速答训练」和按考点的专项练按钮', run: async (p, c) => { await c.go('/chinese/#/gsw'); await p.locator('#speed').waitFor({ timeout: 15000 }); return `${await p.locator('#speed').isVisible()}/${await p.locator('.gp-t').count() >= 5}`; }, expect: same('true/true') },
    { id: 'U19-2', name: '速答：没有上一题 / 下一题按钮；6 秒不选自动跳下一题；选了马上跳', run: async (p, c) => {
      await p.click('#speed'); await p.locator('.gx-type').waitFor({ timeout: 15000 });
      const nav = await p.locator('#next').count(); const t1 = await c.text('.gx-type');
      await p.waitForTimeout(6600); const t2 = await c.text('.gx-type');
      await p.locator('.gx-opt').first().click(); await p.waitForTimeout(700); const t3 = await c.text('.gx-type');
      return `${nav}/${/（1\//.test(t1)}/${/（2\//.test(t2)}/${/（3\//.test(t3)}`;
    }, expect: same('0/true/true/true') },
    { id: 'U19-3', name: '专项练：每题确定后马上显示对错和解析', run: async (p, c) => {
      await c.go('/chinese/#/gsw'); await p.locator('.gp-t').first().waitFor({ timeout: 15000 }); await p.locator('.gp-t').first().click();
      await p.locator('.ex-q').waitFor({ timeout: 15000 }); await p.locator('.ex-opt').first().click(); await p.click('.ex-next'); await p.locator('.ex-fb').waitFor({ timeout: 10000 });
      return (await p.locator('.ex-fb').count()) > 0;
    }, expect: same(true) },
  ] },
  { id: 'U20', area: '界面', name: '诗人卡和常识卡', cases: [
    { id: 'U20-1', name: '诗人卡按朝代分组，常识卡一栏；数量对', run: async (p, c) => {
      await c.go('/chinese/#/cards'); await p.locator('.kc-chip').first().waitFor({ timeout: 15000 });
      const poets = await p.locator('.kc-chip').count(); await c.go('/chinese/#/cards?t=topic'); await p.waitForTimeout(500);
      return `${poets >= 50}/${(await p.locator('.kc-chip').count()) >= 20}`;
    }, expect: same('true/true') },
    { id: 'U20-2', name: '李白卡：字号、称号、代表作、易混点都在；点「练相关的题」开 15 题练习', run: async (p, c) => {
      await c.go('/chinese/#/card/p-libai'); await p.locator('.kc-dl').waitFor({ timeout: 15000 });
      const t = await c.text('.kc-card'); const ok = ['太白', '青莲', '诗仙', '容易混'].every((k) => t.includes(k));
      await p.click('#drill'); await p.locator('.ex-q').waitFor({ timeout: 15000 });
      return `${ok}/${(await c.text('.ex-clock b')).includes('/ 15')}`;
    }, expect: same('true/true') },
    { id: 'U20-3', name: '背诗页作者名链到诗人卡', run: async (p, c) => { await c.go('/chinese/#/poem/1'); await p.locator('.ps-head a').waitFor({ timeout: 15000 }); return await p.locator('.ps-head a').getAttribute('href'); }, expect: same('#/card/p-dufu') },
  ] },
  { id: 'U21', area: '界面', name: '古诗文大会初中组', cases: [
    { id: 'U21-1', name: '年级切换有「预初·初一」「初二·初三」；初二·初三有决选、复选、初选和练习', run: async (p, c) => {
      await c.go('/chinese/#/gsw'); await p.locator('.seg button').first().waitFor({ timeout: 15000 });
      const tabs = (await p.locator('.seg button').allInnerTexts()).join('/'); await p.click('.seg button:has-text("初二·初三")'); await p.waitForTimeout(1200);
      const h2 = (await p.locator('main .card h2').allInnerTexts()).join('|');
      return `${tabs.includes('预初·初一') && tabs.includes('初二·初三')}/${['练习', '决选', '复选', '初选'].every((k) => h2.includes(k))}`;
    }, expect: same('true/true') },
    { id: 'U21-2', name: '初中复选卷：第 81 题是多选（能选两个），第 101 题是填空（有输入框）', run: async (p, c) => {
      await c.go('/chinese/#/intro/gsw-cz-fx-1'); await p.getByText(/开始答题|重新开始/).first().click(); await p.locator('.gx-q').waitFor({ timeout: 15000 });
      for (let i = 0; i < 80; i++) await p.click('#next');
      const t1 = await c.text('.gx-type'); await p.locator('.gx-opt').nth(0).click(); await p.locator('.gx-opt').nth(1).click();
      const on = await p.locator('.gx-opt.on').count();
      for (let i = 0; i < 20; i++) await p.click('#next');
      return `${t1.startsWith('多选题')}/${on}/${(await c.text('.gx-type')).startsWith('填空题')}/${await p.locator('#gfill').count()}`;
    }, expect: same('true/2/true/1') },
  ] },
  { id: 'U22', area: '界面', name: '古诗 / 卡片打印', cases: [
    { id: 'U22-1', name: '打印设置：全选一栏后生成打印页（新标签），学习版带白话', run: async (p, c) => {
      await c.go('/chinese/#/print'); await p.locator('.pr-it').first().waitFor({ timeout: 15000 });
      await p.locator('.pr-all').first().click(); const n = await c.text('#pr-n');
      const [np] = await Promise.all([p.context().waitForEvent('page'), p.click('#pr-go')]); await np.waitForLoadState(); await np.locator('.poem').first().waitFor({ timeout: 15000 });
      const r = `${/已选 \d+/.test(n)}/${(await np.locator('.poem').count()) > 3}/${(await np.locator('.pl').count()) > 0}`; await np.close(); return r;
    }, expect: same('true/true/true') },
    { id: 'U22-2', name: '没登录也能打开打印页：默写版有格子和答案页，提示字版每首 3 个字，卡片能打印', run: async (p, c) => {
      const ctx = await p.context().browser().newContext(); const q = await ctx.newPage();
      await q.goto(c.base + '/chinese/print.html#p=0,1&v=blank&k=1'); await q.locator('.poem').first().waitFor({ timeout: 15000 });
      const blank = `${(await q.locator('.w').count()) > 20}/${await q.locator('.ans').count()}`;
      await q.goto(c.base + '/chinese/print.html#p=0,1&v=hint&k=1'); await q.reload(); await q.locator('.hint').first().waitFor({ timeout: 15000 });
      const hint = await q.locator('.hint').first().locator('.hc span').count();
      await q.goto(c.base + '/chinese/print.html#c=p-libai'); await q.reload(); await q.locator('.card').first().waitFor({ timeout: 15000 });
      const card = (await q.locator('.card h2').innerText()).trim(); await ctx.close();
      return `${blank}/${hint}/${card}`;
    }, expect: same('true/1/3/李白') },
  ] },
  { id: 'U18', area: '界面', name: '每日背诗', cases: [
    { id: 'U18-1', name: '每日背诗页：今天新学 2 篇，进度、分组篇目都在', run: async (p, c) => {
      await c.go('/chinese/#/beishi'); await p.locator('.bs-stat').waitFor({ timeout: 15000 });
      return `${await p.locator('.bs-row').count() >= 2}/${await p.locator('.bs-sec').count() >= 3}`;
    }, expect: same('true/true') },
    { id: 'U18-2', name: '背一篇：四步（全文有白话 → 挖空 → 首字 → 3 个提示字），点「背会了」回到列表，这篇不再出现在新学里', run: async (p, c) => {
      const href = await p.locator('.bs-row').first().getAttribute('href'); await p.locator('.bs-row').first().click(); await p.locator('.ps-text').waitFor({ timeout: 15000 });
      const plain = await p.locator('.ps-plain').count() > 0;
      for (let i = 0; i < 3; i++) await p.click('#next');
      const hints = await p.locator('.ps-hint span').count();
      await p.click('#learned'); await p.locator('.bs-stat').waitFor({ timeout: 15000 });
      const still = await p.locator(`.bs-row[href="${href}"]`).count();
      return `${plain}/${hints}/${still}`;
    }, expect: same('true/3/0') },
    { id: 'U18-4', name: '诗页「真题里怎么考过」：《望岳》展开能看到题目，点「看答案」显示答案', run: async (p, c) => {
      await c.go('/chinese/#/poem/1'); await p.locator('#qs').waitFor({ timeout: 15000 });
      await p.locator('#qs summary').click(); await p.locator('.pq').first().waitFor({ timeout: 15000 });
      const n = await p.locator('.pq').count(); await p.locator('.pq-a summary').first().click();
      return `${n > 3}/${(await c.text('.pq-a[open] b')).length > 0}`;
    }, expect: same('true/true') },
    { id: 'U18-3', name: '手机 360 深色模式下背诗页不溢出', run: async (p, c) => {
      await p.setViewportSize({ width: 360, height: 760 }); await p.emulateMedia({ colorScheme: 'dark' }); await c.go('/chinese/#/poem/2'); await p.locator('.ps-text').waitFor({ timeout: 15000 });
      const r = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      await p.emulateMedia({ colorScheme: 'light' }); await p.setViewportSize({ width: 1366, height: 860 }); return r;
    }, expect: same(true) },
  ] },
  { id: 'U10', area: '界面', name: '在线支付的各种情况', cases: [
    { id: 'U10-1', name: '点「开通」：先确认订单，再全屏遮罩跳支付宝（页面不能点）', run: async (p, c) => {
      c.mockPaid('0.00'); await c.go('#/account'); await p.locator('[data-plan="math.month"]').click(); await p.waitForTimeout(400);
      const confirm = (await c.text('.modal')).includes('确认开通') && (await c.text('.pay-total')).includes('¥');
      await p.route('**/gateway.do**', (route) => route.fulfill({ status: 200, body: 'mock alipay' }));
      await p.route('**/api/pay/create', async (route) => { await new Promise((r) => setTimeout(r, 800)); await route.continue().catch(() => {}); });
      await p.click('#gopay'); await p.waitForTimeout(300);
      const overlay = (await p.locator('.pay-overlay').count()) > 0;
      await p.waitForURL(/gateway/, { timeout: 8000 }).catch(() => {}); await p.unroute('**/gateway.do**'); await p.unroute('**/api/pay/create');
      return `${confirm}/${overlay}/${p.url().includes('gateway')}`;
    }, expect: { guest: 'skip', user: 'true/true/true', member: 'true/true/true' } },
    { id: 'U10-2', name: '从支付宝返回没付：账号页显示待付款订单，开通按钮正常', run: async (p, c) => {
      await c.go('#/account');
      return `${(await c.text('.pay-pending')).includes('还没付完')}/${await p.locator('[data-plan].busy, [data-plan]:disabled').count()}`;
    }, expect: { guest: 'skip', user: 'true/0', member: 'true/0' } },
    { id: 'U10-3', name: '再点同一套餐：接着付原来那笔，不重复下单', run: async (p, c) => {
      const a = (await c.get('/api/account')).data.pending_order; const r = await c.post('/api/pay/create', { plan: 'math.month' });
      return `${r.data.order_id === a.id}/${!!r.data.reused}`;
    }, expect: { guest: 'skip', user: 'true/true', member: 'true/true' } },
    { id: 'U10-4', name: '支付结果页：还没付 → 「还没收到付款」，可继续支付 / 取消', run: async (p, c) => {
      const id = (await c.get('/api/account')).data.pending_order.id; await c.go(`#/account/paid/${id}`); await p.waitForTimeout(13000);
      return `${(await c.text('.pay-result h2')).trim()}/${await p.locator('.pay-result [data-repay]').count()}`;
    }, expect: { guest: 'skip', user: '还没收到付款/1', member: '还没收到付款/1' } },
    { id: 'U10-5', name: '取消订单 → 结果页显示「没有完成付款」，账号页不再提示', run: async (p, c) => {
      const id = (await c.get('/api/account')).data.pending_order.id; await c.post(`/api/pay/orders/${id}/cancel`, {});
      await c.go(`#/account/paid/${id}`); await p.waitForTimeout(1500); const t = (await c.text('.pay-result h2')).trim();
      await c.go('#/account'); return `${t}/${await p.locator('.pay-pending').count()}`;
    }, expect: { guest: 'skip', user: '没有完成付款/0', member: '没有完成付款/0' } },
    { id: 'U10-6', name: '付了钱：结果页显示已开通', run: async (p, c) => {
      const r = await c.post('/api/pay/create', { plan: 'math.month' }); await c.notify(r.data.order_id, JSON.parse(new URL(r.data.url).searchParams.get('biz_content')).total_amount);
      await c.go(`#/account/paid/${r.data.order_id}`); await p.waitForTimeout(1500); return (await c.text('.pay-result h2')).includes('已开通');
    }, expect: { guest: 'skip', user: true, member: true } },
  ] },
];
