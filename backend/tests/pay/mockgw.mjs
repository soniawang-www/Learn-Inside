// 假支付宝网关（只给测试用）：查询一律返回已付款（金额取 <PAYTEST_DIR>/amount），退款直接成功，关单成功
import http from 'node:http';
import { readFileSync } from 'node:fs';
const dir = process.env.PAYTEST_DIR || process.cwd();
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const p = new URLSearchParams(b); const biz = JSON.parse(p.get('biz_content') || '{}'); const m = p.get('method') || '';
    const key = m.replace(/\./g, '_') + '_response';
    const body = m === 'alipay.trade.refund' ? { code: '10000', msg: 'Success', fund_change: 'Y', out_trade_no: biz.out_trade_no, refund_fee: biz.refund_amount }
      : m === 'alipay.trade.close' ? { code: '10000', msg: 'Success', out_trade_no: biz.out_trade_no }
      : { code: '10000', msg: 'Success', out_trade_no: biz.out_trade_no, trade_no: 'Q' + Date.now(), trade_status: 'TRADE_SUCCESS', total_amount: readFileSync(dir + '/amount', 'utf8').trim(), buyer_logon_id: 'abc***@x.com' };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ [key]: body, sign: 'x' }));
  });
}).listen(8799);
