import fs from 'node:fs';

const main=fs.readFileSync('src/main.js','utf8');
const style=fs.readFileSync('src/drawing_style.js','utf8');
const ann=fs.readFileSync('src/annotations.js','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

const styleImport=main.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/drawing_style\.js['"]/);
ok(styleImport,'drawing_style import missing from main.js');
const styleNames=styleImport[1].split(',').map(x=>x.trim());
for(const name of ['resolveTrendStyle','resolveHorizontalStyle','newHorizontalStyle']){
  ok(styleNames.includes(name),`main.js missing imported binding: ${name}`);
  ok(style.includes(`export function ${name}`),`drawing_style.js missing export: ${name}`);
}

const annImport=main.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/annotations\.js['"]/);
ok(annImport,'annotations import missing from main.js');
const annNames=annImport[1].split(',').map(x=>x.trim());
for(const name of ['redoDrawing','duplicateDrawing']){
  ok(annNames.includes(name),`main.js missing imported binding: ${name}`);
  ok(ann.includes(`export function ${name}`),`annotations.js missing export: ${name}`);
}

ok(!main.match(/resolveHorizontalStyle\s*\(/) || styleNames.includes('resolveHorizontalStyle'),
   'resolveHorizontalStyle is used without import');
ok(!main.match(/newHorizontalStyle\s*\(/) || styleNames.includes('newHorizontalStyle'),
   'newHorizontalStyle is used without import');
ok(!main.match(/redoDrawing\s*\(/) || annNames.includes('redoDrawing'),
   'redoDrawing is used without import');
ok(!main.match(/duplicateDrawing\s*\(/) || annNames.includes('duplicateDrawing'),
   'duplicateDrawing is used without import');

console.log('WORKSPACE_RUNTIME_BINDINGS_SMOKE_OK');
