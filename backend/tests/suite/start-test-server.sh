#!/bin/bash
# 起一套给标准测试用的本地环境（不连真实支付宝）：
#   测试密钥 + 假支付宝网关(8799) + 正式收费模式的 wrangler dev(8788) + 导入真题
# 用法：backend/tests/suite/start-test-server.sh <math-data 目录> [工作目录，默认 /tmp/suite]
# 然后：node backend/tests/suite/run.mjs http://127.0.0.1:8788 <工作目录> --ui --report 报告.md
set -e
DATA=${1:?请给出 math-data 仓库目录}
WORK=${2:-/tmp/suite}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
mkdir -p "$WORK"
cp "$ROOT/backend/tests/pay/keys.mjs" "$ROOT/backend/tests/pay/mockgw.mjs" "$WORK/"
[ -f "$WORK/keys.json" ] || (cd "$WORK" && node keys.mjs)
echo 99.00 > "$WORK/amount"
if ! curl -s -m1 -o /dev/null http://127.0.0.1:8799/; then
  (cd "$WORK" && PAYTEST_DIR="$WORK" setsid nohup node mockgw.mjs < /dev/null > gw.log 2>&1 &)
fi
APPPRIV=$(node -e "console.log(require('$WORK/keys.json').appPrivPkcs1)")
ALIPUB=$(node -e "console.log(require('$WORK/keys.json').aliPub)")
WRANGLER=${WRANGLER:-npx wrangler}
cd "$ROOT"
setsid nohup $WRANGLER dev --local --port 8788 --inspector-port 9330 --persist-to "$WORK/state" \
  --var ADMIN_KEY:localtest --var FREE_MODE:false --var AIPAY_APP_ID:2021000000000001 \
  --var "AIPAY_PRIVATE_KEY:$APPPRIV" --var "AIPAY_ALIPAY_PUBLIC_KEY:$ALIPUB" --var ALIPAY_GATEWAY:http://127.0.0.1:8799/gateway.do \
  --var PRICE_MATH_MONTH:39 --var PRICE_MATH_QUARTER:99 --var PRICE_MATH_YEAR:299 --var PRICE_ALL_YEAR:599 --var PRICE_ENGLISH_MONTH:29 --var PAY_MAX_AMOUNT:100 \
  < /dev/null > "$WORK/wrangler.log" 2>&1 &
for i in $(seq 1 90); do curl -s -m1 -o /dev/null http://127.0.0.1:8788/ && break; sleep 1; done
curl -s -m 120 http://127.0.0.1:8788/math/api/admin/seed -H 'x-admin-key: localtest' > /dev/null
python3 - "$DATA" <<'PY'
import json, glob, sys, urllib.request
d = sys.argv[1]
u = json.load(open(f'{d}/knowledge/units.json'))
ex = [json.load(open(f)) for f in sorted(glob.glob(f"{d}/exams/*/*.json"))]
for e in ex: e['published'] = True
r = urllib.request.Request('http://127.0.0.1:8788/math/api/admin/import', data=json.dumps({'points': u['points'], 'edges': u['edges'], 'prune': True, 'exams': ex}).encode(),
                           headers={'content-type': 'application/json', 'x-admin-key': 'localtest'})
print('导入：', json.loads(urllib.request.urlopen(r).read())['ok'])
PY
echo "测试环境就绪：http://127.0.0.1:8788（工作目录 $WORK）"
exit 0
