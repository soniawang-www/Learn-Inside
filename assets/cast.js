// learn-inside 小伙伴：毛毡质感的 3D 形象（图在 /assets/pals/，用 tools/mascot-clay 渲染）
// 学生「狸狸」：小河狸，按板块换装（数学三角尺、语文红马甲毛笔、英语耳机……）。表情：happy 开心 / think 想一想 / cheer 欢呼 / sleep 今天还没打卡
// 老师：长颈鹿（讲解、批改、表扬）
// 输出仍是 <svg class="mascot|friend">，里面放一张图：各页面原来给 svg 定的宽高照样生效，图按比例居中不变形
const V = '20261128n';
const SIZE = {
  'b-hello': [320, 301], 'b-math': [320, 301], 'b-chinese': [320, 300], 'b-english': [320, 304], 'b-wrong': [320, 302], 'b-medal': [320, 307],
  'b-exam': [320, 305], 'b-school': [320, 311], 'b-grad': [318, 320],
  't-hello': [204, 320], 't-praise': [203, 320], 't-mark': [195, 320], 't-lecture': [202, 320], 't-award': [206, 320],
  'h-main': [160, 160], 'h-math': [160, 160], 'h-chinese': [160, 160], 'h-english': [160, 160], 'h-teacher': [160, 160],
};
const pic = (name, cls) => {
  const [w, h] = SIZE[name];
  return `<svg viewBox="0 0 ${w} ${h}" class="${cls}" aria-hidden="true"><image href="/assets/pals/${name}.webp?v=${V}" width="${w}" height="${h}"/></svg>`;
};

// 学生狸狸（不分科目的地方用这个）
// 另有几身专门场合的打扮：school 背书包戴小黄帽（第一次来）、exam 抱秒表（开始答题）、grad 学士帽（加练完成）
const MOOD = { happy: 'b-hello', think: 'b-wrong', cheer: 'b-medal', sleep: 'b-hello', school: 'b-school', exam: 'b-exam', grad: 'b-grad' };
export function mascot(mood = 'happy', { head = false } = {}) {
  return pic(head ? 'h-main' : MOOD[mood] || MOOD.happy, `mascot mascot-${mood}`);
}

// 各科的狸狸：开心时是这一科的打扮，欢呼戴金牌，想一想拿放大镜
export function friend(k, mood = 'happy', { head = false } = {}) {
  const name = head ? `h-${k.subject}` : mood === 'cheer' ? 'b-medal' : mood === 'think' ? 'b-wrong' : `b-${k.subject}`;
  return pic(name, head ? 'friend friend-head' : 'friend');
}
export const YUANYUAN = { name: '狸狸', subject: 'math' };
export const MOMO = { name: '狸狸', subject: 'chinese' };
export const LELE = { name: '狸狸', subject: 'english' };
export const FRIENDS = { math: YUANYUAN, chinese: MOMO, english: LELE };

// 长颈鹿老师：hello 招手 / praise 表扬 / mark 批改 / lecture 讲课 / award 颁奖
export const teacher = (pose = 'hello', { head = false } = {}) => pic(head ? 'h-teacher' : `t-${pose}`, `mascot teacher teacher-${pose}`);

export const castRow = (mood = 'happy') => `<div class="cast-row">${teacher('hello', { head: true })}${[YUANYUAN, MOMO, LELE].map((k) => friend(k, mood, { head: true })).join('')}</div>`;
