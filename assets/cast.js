// learn-inside 小伙伴（原创矢量形象，同一个画风：平涂、一层暗部、大头、圆手圆脚）
// 主角「狸狸」：小狐狸（狐狸的「狸」，也是 learn-inside 的 Li、「知里才知理」的「里」）。表情：happy 答对 / think 答错想一想 / cheer 欢呼 / sleep 今天还没打卡
// 学科小伙伴：圆圆（数学）、墨墨（语文）、乐乐（英语）
const INK = '#1E2B28', JADE = '#1D5C4D', JADE2 = '#2E7A66', PLUM = '#B04A6F', PINK = '#E88AAB', YEL = '#FFC943', YEL2 = '#F2AE2A';
const FUR = '#EE8A3C', FUR2 = '#D9702A', DARK = '#4A3326', CREAM = '#FFF4E6', EARIN = '#FFE3CF', IRIS = '#3E9A7E';
const s = (d, c, w, extra = '') => `<path d="${d}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const f = (d, c, extra = '') => `<path d="${d}" fill="${c}" ${extra}/>`;
const star = (x, y, r, c = '#FFC93C') => `<path d="M${x} ${y - r}Q${x + r * .22} ${y - r * .22} ${x + r} ${y}Q${x + r * .22} ${y + r * .22} ${x} ${y + r}Q${x - r * .22} ${y + r * .22} ${x - r} ${y}Q${x - r * .22} ${y - r * .22} ${x} ${y - r}Z" fill="${c}"/>`;

// ───────── 狸狸 ─────────
function eyes(mood) {
  if (mood === 'cheer') return s('M63 90Q76 77 89 90', INK, 5) + s('M111 90Q124 77 137 90', INK, 5);
  if (mood === 'sleep') return s('M63 90Q76 100 89 90', INK, 4.5) + s('M111 90Q124 100 137 90', INK, 4.5);
  const dx = mood === 'think' ? 3 : 0, dy = mood === 'think' ? -4 : 1;
  const one = (cx) => `<ellipse cx="${cx}" cy="88" rx="14.5" ry="16.5" fill="#fff"/><circle cx="${cx + dx}" cy="${89 + dy}" r="11" fill="${IRIS}"/>
    <circle cx="${cx + dx}" cy="${89 + dy}" r="6.2" fill="${INK}"/><circle cx="${cx + dx + 4}" cy="${84 + dy}" r="3.6" fill="#fff"/><circle cx="${cx + dx - 4}" cy="${94 + dy}" r="1.5" fill="#fff"/>`;
  return one(76) + one(124) + (mood === 'think' ? s('M62 64Q74 58 88 64', DARK, 4) + s('M112 68Q124 66 136 69', DARK, 4) : '');
}
function mouth(mood) {
  if (mood === 'cheer') return f('M88 120Q100 120 112 120Q111 137 100 137Q89 137 88 120Z', INK) + f('M93 131Q100 125 107 131Q100 137 93 131Z', '#F27A9E');
  if (mood === 'think') return s('M93 125Q96.5 122 100 125T107 125', INK, 3);
  if (mood === 'sleep') return s('M95 124Q100 127 105 124', INK, 2.8);
  return s('M100 117Q100 125 91 123', INK, 3) + s('M100 117Q100 125 109 123', INK, 3);
}
function head(mood) {
  return `
    ${f('M54 70L46 14Q48 6 56 10L94 48Z', FUR)}${f('M60 60L55 26L82 48Z', EARIN)}${f('M46 14Q48 6 56 10L66 22L50 32Z', DARK)}
    ${f('M146 70L154 14Q152 6 144 10L106 48Z', FUR)}${f('M140 60L145 26L118 48Z', EARIN)}${f('M154 14Q152 6 144 10L134 22L150 32Z', DARK)}
    ${f('M100 40C142 40 166 64 166 94L180 120Q156 120 144 132Q124 150 100 150Q76 150 56 132Q44 120 20 120L34 94C34 64 58 40 100 40Z', FUR)}
    ${f('M30 118Q48 104 70 110Q86 102 100 112Q114 102 130 110Q152 104 170 118L180 120Q156 120 144 132Q124 150 100 150Q76 150 56 132Q44 120 20 120Z', CREAM)}
    ${f('M100 56Q106 72 100 84Q94 72 100 56Z', '#F6A766', 'opacity=".7"')}
    ${eyes(mood)}
    <ellipse cx="58" cy="112" rx="8" ry="5" fill="${PINK}" opacity=".5"/><ellipse cx="142" cy="112" rx="8" ry="5" fill="${PINK}" opacity=".5"/>
    ${f('M92 108Q100 104 108 108Q104 117 100 117Q96 117 92 108Z', DARK)}<ellipse cx="97" cy="108.5" rx="2.4" ry="1.4" fill="#fff" opacity=".55"/>
    ${mouth(mood)}`;
}
const paw = (x, y, r = 10) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${DARK}"/>`;
export function mascot(mood = 'happy', { head: only = false } = {}) {
  if (only) return `<svg viewBox="18 4 164 150" class="mascot mascot-${mood}" aria-hidden="true">${head(mood)}</svg>`;
  const up = mood === 'cheer' ? -8 : 0;
  const tail = `${f('M66 214Q20 220 14 176Q8 136 34 112Q46 100 58 104Q40 124 46 152Q52 178 74 196Z', FUR)}${f('M34 112Q46 100 58 104Q48 112 44 126Q36 122 26 128Q28 118 34 112Z', CREAM)}
    ${f('M66 214Q34 214 22 192Q40 204 70 200Z', FUR2, 'opacity=".6"')}`;
  const body = `${f('M58 206Q54 152 100 142Q146 152 142 206Q142 228 100 228Q58 228 58 206Z', FUR)}
    ${f('M76 152Q100 148 124 152Q130 178 120 206Q100 216 80 206Q70 178 76 152Z', CREAM)}
    <ellipse cx="80" cy="228" rx="17" ry="9" fill="${DARK}"/><ellipse cx="120" cy="228" rx="17" ry="9" fill="${DARK}"/>`;
  const scarf = `${f('M56 136Q100 158 144 136L146 150Q100 172 54 150Z', JADE)}${f('M116 154L130 194L117 197L107 158Z', JADE2)}${f('M124 186L130 194L117 197L115 190Z', PINK)}`;
  const arms = {
    happy: s('M62 166Q50 184 58 202', FUR, 15) + paw(59, 203) + s('M140 166Q172 166 184 144', FUR, 15) + paw(186, 139),
    think: s('M62 166Q50 184 58 202', FUR, 15) + paw(59, 203) + s('M140 168Q150 160 128 144', FUR, 15) + paw(124, 140, 10.5),
    cheer: s('M64 160Q24 152 18 96', FUR, 15) + paw(17, 90) + s('M136 160Q176 152 182 96', FUR, 15) + paw(183, 90),
    sleep: s('M62 166Q50 184 60 202', FUR, 15) + paw(62, 203) + s('M138 166Q150 184 140 202', FUR, 15) + paw(138, 203),
  }[mood];
  const extra = mood === 'think' ? `<text x="160" y="40" font-size="40" font-weight="900" fill="#B04A6F" font-family="Nunito, system-ui, sans-serif" transform="rotate(12 170 28)">?</text>`
    : mood === 'cheer' ? `${star(34, 50, 10)}${star(168, 44, 8)}${star(180, 22, 5, PINK)}${star(20, 26, 5, PINK)}`
    : mood === 'sleep' ? `<text x="150" y="40" font-size="26" font-weight="900" fill="#9AA6A1" font-family="Nunito, sans-serif">z</text><text x="168" y="22" font-size="18" font-weight="900" fill="#9AA6A1" font-family="Nunito, sans-serif">z</text>` : '';
  const sh = `<ellipse cx="100" cy="236" rx="${mood === 'cheer' ? 40 : 52}" ry="6" fill="${INK}" opacity=".1"/>`;
  return `<svg viewBox="0 0 200 244" class="mascot mascot-${mood}" aria-hidden="true">${sh}<g transform="translate(0 ${up})">${tail}${body}${scarf}${mood === 'think' ? '' : arms}${head(mood)}${mood === 'think' ? arms : ''}</g>${extra}</svg>`;
}

// ───────── 学科小伙伴 ─────────
function face(mood, k) {
  const ex = mood === 'think' ? 2.5 : 0, ey = mood === 'think' ? -3 : 0;
  const eye = (x) => mood === 'cheer' ? s(`M${x - 7} ${99}Q${x} ${90} ${x + 7} ${99}`, INK, 4.5)
    : `<ellipse cx="${x}" cy="97" rx="${k.eyeR || 6.5}" ry="${(k.eyeR || 6.5) * 1.2}" fill="${INK}"/><circle cx="${x + 2.2 + ex}" cy="${93.5 + ey}" r="2.6" fill="#fff"/><circle cx="${x - 2 + ex}" cy="${100 + ey}" r="1.1" fill="#fff"/>`;
  const brows = mood === 'think' ? s('M74 78Q82 72 90 77', k.hair, 4) + s('M110 80Q118 79 126 81', k.hair, 4) : s('M74 81Q82 77 90 80', k.hair, 4) + s('M110 80Q118 77 126 81', k.hair, 4);
  const mouth = mood === 'cheer' ? f('M88 114H112Q111 130 100 130Q89 130 88 114Z', INK) + f('M93 125Q100 119 107 125Q100 130 93 125Z', '#F27A9E')
    : mood === 'think' ? s('M93 119Q96.5 116 100 119T107 119', INK, 3) : s('M89 114Q100 124 111 114', INK, 3.6);
  return `${brows}${eye(82)}${eye(118)}<ellipse cx="68" cy="112" rx="8" ry="5" fill="${PINK}" opacity=".55"/><ellipse cx="132" cy="112" rx="8" ry="5" fill="${PINK}" opacity=".55"/>
    ${s('M97 108Q100 110 103 108', k.skin2, 3)}${mouth}`;
}
export function friend(k, mood = 'happy') {
  const up = mood === 'cheer' ? -8 : 0;
  const armL = { happy: ['M68 158Q54 176 58 198', [58, 200]], think: ['M68 158Q54 176 58 198', [58, 200]], cheer: ['M68 158Q38 150 30 120', [28, 114]] }[mood];
  const armR = { happy: ['M132 158Q158 150 168 124', [170, 119]], think: ['M132 160Q146 152 122 130', [118, 127]], cheer: ['M132 158Q162 150 170 120', [172, 114]] }[mood];
  const arm = ([d, [x, y]]) => s(d, k.sleeve || k.top, 14) + `<circle cx="${x}" cy="${y}" r="9" fill="${k.skin}"/>`;
  const legs = `<rect x="80" y="196" width="17" height="30" rx="8" fill="${k.pants}"/><rect x="103" y="196" width="17" height="30" rx="8" fill="${k.pants}"/>
    <ellipse cx="86" cy="228" rx="15" ry="8.5" fill="${k.shoes}"/><ellipse cx="114" cy="228" rx="15" ry="8.5" fill="${k.shoes}"/>`;
  const torso = f('M62 208Q60 152 100 146Q140 152 138 208Q100 214 62 208Z', k.top) + (k.outfit || '');
  const head = `<rect x="91" y="130" width="18" height="20" rx="6" fill="${k.skin2}"/>
    <circle cx="50" cy="98" r="10" fill="${k.skin}"/><circle cx="150" cy="98" r="10" fill="${k.skin}"/>
    <ellipse cx="100" cy="94" rx="51" ry="52" fill="${k.skin}"/>`;
  const extra = mood === 'think' ? `<text x="150" y="44" font-size="38" font-weight="900" fill="${PLUM}" font-family="Nunito, system-ui, sans-serif" transform="rotate(12 160 30)">?</text>`
    : mood === 'cheer' ? `${star(30, 62, 10)}${star(172, 52, 8)}${star(184, 84, 5, PINK)}${star(16, 88, 5, PINK)}` : '';
  const sh = `<ellipse cx="100" cy="236" rx="${mood === 'cheer' ? 38 : 48}" ry="6" fill="${INK}" opacity=".1"/>`;
  const front = mood === 'think' ? arm(armR) : '';
  return `<svg viewBox="0 0 200 244" class="friend" aria-hidden="true">${sh}<g transform="translate(0 ${up})">${k.back || ''}${legs}${arm(armL)}${mood === 'think' ? '' : arm(armR)}${torso}${k.propBack?.(mood) || ''}${head}${k.hairFront}${face(mood, k)}${k.glasses || ''}${front}${k.prop?.(mood) || ''}</g>${extra}</svg>`;
}

// 圆圆（数学）：两个圆发髻、圆眼镜、黄色卫衣，拿三角尺
export const YUANYUAN = { name: '圆圆', subject: '数学', skin: '#F7CDAA', skin2: '#E8AE86', hair: '#3B2A23', top: YEL, sleeve: YEL, pants: JADE, shoes: '#2B3A36',
  back: `<circle cx="58" cy="44" r="19" fill="#3B2A23"/><circle cx="142" cy="44" r="19" fill="#3B2A23"/><rect x="50" y="52" width="16" height="6" rx="3" fill="${PINK}"/><rect x="134" y="52" width="16" height="6" rx="3" fill="${PINK}"/>`,
  hairFront: f('M48 96Q46 46 100 40Q154 46 152 96Q146 70 128 66Q118 76 100 72Q86 78 72 68Q54 72 48 96Z', '#3B2A23'),
  glasses: `<circle cx="82" cy="97" r="13" fill="none" stroke="${JADE}" stroke-width="3.5"/><circle cx="118" cy="97" r="13" fill="none" stroke="${JADE}" stroke-width="3.5"/>${s('M95 96Q100 92 105 96', JADE, 3.5)}`,
  outfit: `${f('M80 180H120V198Q100 202 80 198Z', YEL2)}${s('M88 152Q100 162 112 152', YEL2, 4)}<text x="100" y="178" text-anchor="middle" font-size="18" font-weight="900" fill="${JADE}" font-family="Nunito, system-ui, sans-serif">π</text>`,
  prop: (m) => m === 'happy' ? f('M34 226L34 176L78 226Z', '#A9D9C6', 'opacity=".92"') + f('M42 216L42 196L60 216Z', '#fff') + s('M38 186H44M38 196H42M38 206H44', '#2E7A66', 2) + '<circle cx="58" cy="200" r="9" fill="#F7CDAA"/>' : '',
};
// 墨墨（语文）：自然的碎刘海、浅色长袖外面一件青绿对襟小马甲（梅红盘扣），手里一卷诗
export const MOMO = { name: '墨墨', subject: '语文', skin: '#F4C7A1', skin2: '#E3A57D', hair: '#232120', top: '#E6E0D2', sleeve: '#E6E0D2', pants: '#3A3F3C', shoes: '#1E2B28',
  hairFront: f('M47 98Q42 40 100 36Q158 40 153 98Q151 80 142 70L136 76L126 62L114 74L102 60L90 73L80 61L70 76Q56 80 47 98Z', '#232120') + s('M106 38Q112 24 126 28', '#232120', 5),
  outfit: `${f('M62 208Q60 156 84 148L97 176V211Q78 211 62 208Z', JADE)}${f('M138 208Q140 156 116 148L103 176V211Q122 211 138 208Z', JADE)}
    ${f('M88 148Q100 156 112 148L106 156Q100 160 94 156Z', '#DCD7CA')}
    ${[184, 196].map((y) => s(`M92 ${y}H108`, '#F2DFC4', 3) + `<circle cx="96" cy="${y}" r="2.6" fill="${PLUM}"/><circle cx="104" cy="${y}" r="2.6" fill="${PLUM}"/>`).join('')}`,
  prop: (m) => m === 'happy' ? `<g transform="rotate(-14 46 196)"><rect x="30" y="172" width="34" height="44" rx="3" fill="#FFF8EA" stroke="#D8C9A8" stroke-width="2"/><rect x="26" y="168" width="42" height="8" rx="4" fill="#8A5A35"/><rect x="26" y="212" width="42" height="8" rx="4" fill="#8A5A35"/>
    <text x="47" y="201" text-anchor="middle" font-size="17" font-weight="800" fill="${PLUM}" font-family="serif">诗</text></g><circle cx="58" cy="200" r="9" fill="#F4C7A1"/>` : '',
};
// 乐乐（英语）：卷发、梅红 T 恤、脖子上挂耳机，旁边一个 Hi! 气泡
export const LELE = { name: '乐乐', subject: '英语', skin: '#C98E66', skin2: '#AE7550', hair: '#2A1E19', top: PLUM, sleeve: PLUM, pants: '#2F5D8A', shoes: '#F2F0EA', eyeR: 6.5,
  back: [[56, 70, 20], [72, 50, 20], [96, 40, 22], [122, 44, 21], [144, 62, 20], [154, 86, 15], [46, 90, 15]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2A1E19"/>`).join(''),
  hairFront: [[62, 66, 14], [80, 56, 14], [100, 54, 14], [120, 56, 14], [138, 66, 14]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2A1E19"/>`).join(''),
  outfit: `${s('M80 150Q100 168 120 150', '#174B3F', 5)}<ellipse cx="78" cy="148" rx="9" ry="11" fill="${JADE}"/><ellipse cx="78" cy="148" rx="4.5" ry="6" fill="#5FB39A"/><ellipse cx="122" cy="148" rx="9" ry="11" fill="${JADE}"/><ellipse cx="122" cy="148" rx="4.5" ry="6" fill="#5FB39A"/>
    <text x="100" y="188" text-anchor="middle" font-size="17" font-weight="900" fill="#fff" font-family="Nunito, system-ui, sans-serif">ABC</text>`,
  prop: (m) => m === 'happy' ? `<g transform="translate(150 12)"><path d="M0 14Q0 0 14 0H32Q46 0 46 14V20Q46 34 32 34H16L6 44L8 33Q0 30 0 20Z" fill="#fff" stroke="${JADE}" stroke-width="3"/><text x="23" y="24" text-anchor="middle" font-size="15" font-weight="900" fill="${JADE}" font-family="Nunito, system-ui, sans-serif">Hi!</text></g>` : '',
};
export const FRIENDS = { math: YUANYUAN, chinese: MOMO, english: LELE };
