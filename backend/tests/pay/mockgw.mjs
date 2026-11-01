// 假支付宝网关：alipay.trade.query 一律返回已付款（金额取 /tmp/paytest/amount）
import http from 'node:http';
import { readFileSync } from 'node:fs';
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const p = new URLSearchParams(b); const biz = JSON.parse(p.get('biz_content') || '{}');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ alipay_trade_query_response: { code: '10000', msg: 'Success', out_trade_no: biz.out_trade_no, trade_no: 'Q' + Date.now(), trade_status: 'TRADE_SUCCESS', total_amount: readFileSync((process.env.PAYTEST_DIR || '/tmp/paytest') + '/amount', 'utf8').trim(), buyer_logon_id: 'abc***@x.com' }, sign: 'x' }));
  });
}).listen(8799);
