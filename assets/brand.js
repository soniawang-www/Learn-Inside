// 对外账号（网站各处、打印页脚共用一份）
// 小红书：名片二维码里的链接就是 XHS.link；公众号还没有，开了以后在后台「联系方式」里填名字、传二维码
export const XHS = {
  name: '一天一个知识点 | learn-inside',
  id: '95981992924', // 小红书号：搜这个最准
  link: 'http://xhslink.com/m/JnMcdzoa5w',
};
// 小红书、公众号都让大家搜这个词
export const FIND = 'learn inside';
// 平台图标（单色字形，染成平台色），在 /assets/brand/ 里；公众号空着就用微信的；都空着时显示一个平台色小圆点
export const LOGO = { wechat: '/assets/brand/wechat.png', xhs: '/assets/brand/xhs.png', mp: '' };
