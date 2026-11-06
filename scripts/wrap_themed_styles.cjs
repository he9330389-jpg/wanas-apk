const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.cwd();
const roots = ['app', 'components'];
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(item.name)) files.push(full);
  }
}
for (const r of roots) walk(path.join(root, r));
let changedFiles = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('StyleSheet.create(') || text.includes('themedStyles(() => (StyleSheet.create(')) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const inserts = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(sf) === 'StyleSheet' && node.expression.name.text === 'create') {
      const isWrapped = node.parent && ts.isCallExpression(node.parent) &&
        ts.isIdentifier(node.parent.expression) && node.parent.expression.text === 'themedStyles';
      if (!isWrapped) {
        inserts.push([node.getStart(sf), 'themedStyles(() => (']);
        inserts.push([node.end, '))']);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!inserts.length) continue;
  if (!text.includes('from "@/lib/theme-runtime"') && !text.includes("from '@/lib/theme-runtime'")) {
    const imports = [...text.matchAll(/^import .*?;\s*$/gm)];
    const pos = imports.length ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
    inserts.push([pos, '\nimport { themedStyles } from "@/lib/theme-runtime";']);
  }
  inserts.sort((a,b) => b[0] - a[0]);
  let out = text;
  for (const [pos, value] of inserts) out = out.slice(0, pos) + value + out.slice(pos);
  fs.writeFileSync(file, out);
  changedFiles++;
  console.log(path.relative(root,file));
}
console.log('changed files:', changedFiles);
