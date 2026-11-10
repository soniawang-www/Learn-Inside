// 作答判分：选择题比字母；填空题把孩子的写法规范化后比对。
// 填空题的标准答案写在 problem.answer，另外可接受的写法放在 problem.accept（JSON 数组）。
// 数值答案按数值比：3/4、0.75、1又1/2、1 1/2、15%、全角数字都认；末尾的单位汉字（个、元、厘米……）忽略。

const MAX_LEN = 40;
const HAN = /[\u3400-\u9fff]/;
// 汉字答案（成语、诗句）忽略标点：孩子常顺手打上逗号句号，官方也只要求填字
const PUNCT = /[\s　,.;:!?'"，。、；：！？“”‘’《》〈〉（）()【】\[\]「」『』…—·-]+/g;
const cleanHan = (s) => String(s ?? '').normalize('NFKC').replace(PUNCT, '');

/** 题目是不是填空题（没有选项） */
export const isFill = (choices) => !choices || !Object.keys(choices).length;

/** 全角转半角、去空白、统一减号和除号 */
function clean(s) {
  return String(s ?? '').normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/[−–—－]/g, '-').replace(/[÷／]/g, '/')
    .replace(/[，,](?=\d{3}(\D|$))/g, '') // 千分位逗号
    .toLowerCase();
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** 把数值写法解析成最简分数 [分子, 分母]（BigInt），解析不了返回 null */
export function toRational(raw) {
  const sp = String(raw ?? '').normalize('NFKC').trim().replace(/^([+-]?\d+)\s+(\d+\/\d+)/, '$1又$2'); // 「1 1/2」是带分数
  let s = clean(sp).replace(/[一-鿿]+$/, ''); // 末尾单位
  if (!s) return null;
  let sign = 1n;
  if (s[0] === '-') { sign = -1n; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
  let pct = false;
  if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  let n, d;
  let m;
  if ((m = /^(\d+)又(\d+)\/(\d+)$/.exec(s))) { // 带分数
    d = BigInt(m[3]); n = BigInt(m[1]) * d + BigInt(m[2]);
  } else if ((m = /^(\d+)分之(\d+)$/.exec(s))) { d = BigInt(m[1]); n = BigInt(m[2]); }
  else if ((m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s))) {
    const a = toRational(m[1]), b = toRational(m[2]);
    if (!a || !b || b[0] === 0n) return null;
    n = a[0] * b[1]; d = a[1] * b[0];
  } else if ((m = /^(\d*)\.(\d+)$/.exec(s)) || (m = /^(\d+)\.?$/.exec(s))) {
    const frac = m[2] || '';
    d = 10n ** BigInt(frac.length); n = BigInt((m[1] || '0') + frac);
  } else return null;
  if (d === 0n) return null;
  n *= sign;
  if (pct) d *= 100n;
  const g = gcd(n < 0n ? -n : n, d) || 1n;
  return [n / g, d / g];
}

/** 规范化孩子的作答，用来存库和显示（太长截断，空串当没答） */
export function normalizeInput(choices, input) {
  if (input === null || input === undefined) return null;
  if (!isFill(choices)) {
    const k = String(input).trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(choices, k)) return k;
    // 多选：几个字母，去重排序后都要是选项（判分时和排好序的答案整串比对，全对才算对）
    const ks = [...new Set(k.replace(/[^A-Z]/g, ''))].sort().join('');
    return ks.length > 1 && [...ks].every((c) => Object.prototype.hasOwnProperty.call(choices, c)) ? ks : null;
  }
  const s = String(input).normalize('NFKC').trim().slice(0, MAX_LEN);
  return s || null;
}

/** 判对错 */
export function judge({ choices, answer, accept }, input) {
  const v = normalizeInput(choices, input);
  if (v === null) return false;
  if (!isFill(choices)) return v === answer || (accept || []).includes(v); // 选择题：印刷错误导致两个选项都成立时，accept 里放另一个字母
  const keys = [answer, ...(accept || [])].filter((x) => x !== null && x !== undefined && x !== '');
  const cv = clean(v), rv = toRational(v);
  for (const k of keys) {
    if (clean(k) === cv) return true;
    if (HAN.test(k) && cleanHan(k) && cleanHan(k) === cleanHan(v)) return true;
    const rk = toRational(k);
    if (rk && rv && rk[0] === rv[0] && rk[1] === rv[1]) return true;
    // 文字答案末尾带单位（如“5个”）：去掉单位再比
    if (clean(k).replace(/[一-鿿]+$/, '') === cv.replace(/[一-鿿]+$/, '') && cv.replace(/[一-鿿]+$/, '')) return true;
  }
  return false;
}
