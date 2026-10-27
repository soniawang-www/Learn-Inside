// 1) 生成 worker/content.generated.js：Worker 内置的建表语句和题库（改了 data/ 或 schema.sql 后必须重新跑）
// 2) 输出 seed.sql 到标准输出，供 wrangler d1 execute 使用
//
// 用法（在仓库根目录）：node amc8-src/scripts/build-seed.mjs > amc8-src/seed.sql
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRows, rowsToSql } from '../../worker/seed.js';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(src, '..');
const knowledge = JSON.parse(readFileSync(join(src, 'data/knowledge.json'), 'utf8'));
const examDir = join(src, 'data/exams');
const exams = readdirSync(examDir).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(examDir, f), 'utf8')));
const schema = readFileSync(join(src, 'schema.sql'), 'utf8');

const rows = buildRows(knowledge, exams); // 顺便校验
writeFileSync(
  join(repo, 'worker/content.generated.js'),
  `// 由 amc8-src/scripts/build-seed.mjs 生成，不要手改\n` +
    `export const SCHEMA = ${JSON.stringify(schema)};\n` +
    `export const KNOWLEDGE = ${JSON.stringify(knowledge)};\n` +
    `export const EXAMS = ${JSON.stringify(exams)};\n`
);
console.error(`content.generated.js 已更新：${exams.length} 套试卷，${rows.length} 行`);
console.log(rowsToSql(rows));
