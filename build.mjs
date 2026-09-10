import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('public/dist/fonts',{recursive:true});
for(const [family,weight]of [['oswald',600],['roboto-condensed',400],['roboto-condensed',700]]){
 const file=`${family}-latin-${weight}-normal.woff2`;
 await copyFile(`node_modules/@fontsource/${family}/files/${file}`,`public/dist/fonts/${file}`);
 await copyFile(`node_modules/@fontsource/${family}/LICENSE`,`public/dist/fonts/${family}-LICENSE.txt`);
}
await build({entryPoints:['public/app.mjs'],bundle:true,format:'esm',outfile:'public/dist/app.js'});
