// 填空题判分的单元测试：node backend/tests/unit/answers.test.mjs
import { judge } from '../../../worker/answers.js';
const F = {}, C = { A: 'x', B: 'y', C: 'z', D: 'w' };
const T = [
  [F, '14', '14', true], [F, '14', '１４', true], [F, '14', ' 14 ', true], [F, '14', '14个', true], [F, '14', '15', false],
  [F, '1/2019', '1/2019', true], [F, '1/2019', '2/4038', true], [F, '1/2', '0.5', true], [F, '3/2', '1又1/2', true], [F, '3/2', '1 1/2', true],
  [F, '-3/2', '-1 1/2', true], [F, '11/2', '11/2', true], [F, '65.7', '65.70', true], [F, '-1', '－1', true], [F, '2039190', '2,039,190', true],
  [F, '0.25', '25%', true], [F, 'B', 'b', true], [F, '720', '720元', true], [F, '1/16777216', '1/16777216', true],
  [F, '4', '', false], [F, '4', null, false], [F, '红色', '红', false], [F, '5', '五', false],
  [C, 'B', 'B', true], [C, 'B', 'b', true], [C, 'B', 'E', false], [C, 'B', '2', false],
];
let bad = 0;
for (const [ch, ans, inp, exp] of T) { const r = judge({ choices: ch, answer: ans }, inp); if (r !== exp) { bad++; console.log('✗', ans, JSON.stringify(inp), '→', r); } }
if (judge({ choices: F, answer: '6', accept: ['六'] }, '六') !== true) { bad++; console.log('✗ accept'); }
console.log(bad ? `失败 ${bad}` : `全部通过：${T.length + 1} 条`);
process.exit(bad ? 1 : 0);
