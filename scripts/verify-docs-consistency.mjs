#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const summary = [];

const coreDocs = {
  README: 'README.md',
  process: 'docs/development-process.md',
  handoff: 'docs/handoff.md',
};

const retiredDocs = [
  'CONTEXT.md',
  'docs/development-log.md',
  'docs/security-hardening.md',
  'docs/architecture-security-audit.md',
];

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function requireMarkers(name, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) fail(`${name} missing marker: ${marker}`);
  }
}

for (const relativePath of Object.values(coreDocs)) {
  if (!fs.existsSync(absolute(relativePath))) fail(`missing core doc: ${relativePath}`);
}

for (const relativePath of retiredDocs) {
  if (fs.existsSync(absolute(relativePath))) fail(`retired doc must stay removed: ${relativePath}`);
}

if (failures.length === 0) {
  const readme = read(coreDocs.README);
  const processDoc = read(coreDocs.process);
  const handoff = read(coreDocs.handoff);

  requireMarkers('README', readme, [
    '## 三份权威文档',
    '`docs/development-process.md`',
    '`docs/handoff.md`',
    '`DOCS / FAST / FULL`',
    '## 永久安全规则',
    '## 金融与比赛不变量',
    'npm run release:verify',
  ]);

  requireMarkers('development-process', processDoc, [
    '## 三、DOCS：纯 Markdown',
    '## 四、FAST：默认快速通道',
    '## 五、FULL：高风险完整门禁',
    '## 六、视觉验收只做最终一轮',
    '## 七、发布只调用一次等待器',
    'npm run check:docs',
    'npm run check:fast',
    'npm run check:full',
    'npm run release:verify',
    '本机真实 Xcode iOS Simulator',
    '已删除的旧流程不得恢复',
  ]);

  requireMarkers('handoff', handoff, [
    '验证时间：',
    '## 当前生产基准',
    '## 收益比赛当前状态',
    '## 当前风险与下一步',
  ]);

  const budgets = {
    README: [readme, 220],
    process: [processDoc, 240],
    handoff: [handoff, 180],
  };
  for (const [name, [text, maximum]] of Object.entries(budgets)) {
    const lines = text.split(/\r?\n/).length;
    if (lines > maximum) fail(`${name} exceeds ${maximum}-line core-doc budget: ${lines}`);
    summary.push(`${name}Lines=${lines}/${maximum}`);
  }
}

if (failures.length > 0) {
  console.error('docs consistency: FAIL');
  for (const item of summary) console.error(`- ${item}`);
  for (const item of failures) console.error(`ERROR: ${item}`);
  process.exit(1);
}

console.log('docs consistency: PASS');
for (const item of summary) console.log(`- ${item}`);
console.log('- coreDocs=README.md, docs/development-process.md, docs/handoff.md');
