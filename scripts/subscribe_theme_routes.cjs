const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.cwd();
const files=[];
function walk(dir){for(const x of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,x.name); if(x.isDirectory()) walk(p); else if(/\.tsx$/.test(x.name)) files.push(p);}}
walk(path.join(root,'app'));
let changed=0;
for(const file of files){
  if(path.basename(file)==='_layout.tsx' || path.basename(file)==='+html.tsx') continue;
  const text=fs.readFileSync(file,'utf8');
  const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const roots=[];
  function visit(n){
    if(ts.isFunctionDeclaration(n) && n.body && n.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword) && n.name && /^[A-Z]/.test(n.name.text)) roots.push(n);
    ts.forEachChild(n,visit);
  }
  visit(sf); if(!roots.length || text.includes('useThemeContext()')) continue;
  const edits=[];
  for(const fn of roots){
    const pos=fn.body.getStart(sf)+1;
    edits.push([pos,'\n  useThemeContext();']);
  }
  if(!text.includes('from "@/lib/theme-provider"') && !text.includes("from '@/lib/theme-provider'")){
    const imports=[...text.matchAll(/^import .*?;\s*$/gm)];
    const pos=imports.length?imports[imports.length-1].index+imports[imports.length-1][0].length:0;
    edits.push([pos,'\nimport { useThemeContext } from "@/lib/theme-provider";']);
  }
  edits.sort((a,b)=>b[0]-a[0]); let out=text;
  for(const [pos,s] of edits) out=out.slice(0,pos)+s+out.slice(pos);
  fs.writeFileSync(file,out); changed++; console.log(path.relative(root,file));
}
console.log('route roots updated:',changed);
