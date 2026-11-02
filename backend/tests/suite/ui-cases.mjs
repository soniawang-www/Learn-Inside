// 标准测试集合（界面部分）：在真实浏览器里，以三种身份看各个页面，检查显示和可点的东西是否符合身份。
// run(page, ctx) 返回观察值；expect 同 cases.mjs。ctx.go(hash) 打开页面，ctx.text(sel) 取文字。

const same = (v) => ({ guest: v, user: v, member: v });

export const UI_FEATURES = [
  { id: 'U1', area: '界面', name: '首页', cases: [
    { id: 'U1-1', name: '首页标题和掌握地图', run: async (p, c) => { await c.go('#/'); return (await p.locator('.mm-tile').count()) === 30 && (await c.text('h1')).includes('的数学'); }, expect: same(true) },
    { id: 'U1-2', name: '顶部「注册就送 10 次互动解析」', run: async (p, c) => { await c.go('#/'); return (await p.locator('.gift-tip').count()) > 0; }, expect: { guest: true, user: false, member: false } },
    { id: 'U1-3', name: '侧栏身份', run: async (p, c) => { await c.go('#/'); const t = await c.text('.side-who small'); return t.includes('游客') ? '游客' : t.includes('会员') ? '会员' : t.replace(/\s/g, ''); }, expect: { guest: '游客', user: '免费次数10', member: '会员' } },
  ] },
  { id: 'U2', area: '界面', name: '考试与考情', cases: [
    { id: 'U2-1', name: 'AMC 8 试卷卡片数', run: async (p, c) => { await c.go('#/contest/amc8'); return p.locator('.exam-tile').count(); }, expect: same(26) },
    { id: 'U2-2', name: '考情：大类占比 + 知识项表', run: async (p, c) => { await c.go('#/contest/amc8/stats'); return (await p.locator('.mrow').count()) === 8 && (await p.locator('.utable tr').count()) > 20; }, expect: same(true) },
    { id: 'U2-3', name: '点「模考」出现考前须知', run: async (p, c) => { await c.go('#/contest/amc8'); await p.locator('[data-mode="exam"]').first().click(); await p.waitForTimeout(400); return (await p.locator('.modal').count()) > 0; }, expect: same(true) },
  ] },
  { id: 'U3', area: '界面', name: '知识图谱与错题本', cases: [
    { id: 'U3-1', name: '知识图谱画出 30 个知识项', run: async (p, c) => { await c.go('#/graph'); await p.waitForTimeout(500); return p.locator('svg .kg-n').count(); }, expect: same(30) },
    { id: 'U3-2', name: '列表视图（薄弱在前）', run: async (p, c) => { await c.go('#/graph'); await p.click('[data-view="list"]'); await p.waitForTimeout(500); return p.locator('.kl-row').count(); }, expect: same(30) },
    { id: 'U3-3', name: '错题本列出错题', run: async (p, c) => { await c.go('#/mistakes'); return (await p.locator('.ms-row').count()) > 0; }, expect: same(true) },
  ] },
  { id: 'U4', area: '界面', name: '会员内容的锁', cases: [
    { id: 'U4-1', name: '知识项页「开始突击」是否带锁', run: async (p, c) => { await c.go('#/kp/cnt.perm'); return (await c.text('[data-drill]')).includes('🔒') ? 'locked' : 'open'; }, expect: { guest: 'locked', user: 'locked', member: 'open' } },
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
    { id: 'U5-4', name: '右侧卡片：注册 / 登录方式', run: async (p, c) => { await c.go('#/account'); const t = await c.text('.col-side'); return t.includes('注册账号') ? '注册账号' : t.includes('登录方式') ? '登录方式' : '?'; }, expect: { guest: '注册账号', user: '登录方式', member: '登录方式' } },
    { id: 'U5-5', name: '联系客服弹出二维码说明', run: async (p, c) => { await c.go('#/account'); await p.locator('[data-support]').first().click(); await p.waitForTimeout(500); return (await p.locator('.support').count()) > 0; }, expect: same(true) },
    { id: 'U5-6', name: '活动期间套餐显示原价划线和活动价，手机上不挤', run: async (p, c) => {
      await c.admin('/api/admin/promo', 'POST', { title: '界面测试活动', until: Date.now() + 86400000, prices: { 'math.month': 19.9 } });
      await p.setViewportSize({ width: 360, height: 740 }); await c.go('#/account');
      const r = `${(await c.text('.promo-bar')).includes('界面测试活动')}/${await c.text('.plan .orig')}/${await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1)}`;
      await c.admin('/api/admin/promo', 'DELETE'); await p.setViewportSize({ width: 1366, height: 860 }); return r;
    }, expect: same('true/¥39/true') },
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
