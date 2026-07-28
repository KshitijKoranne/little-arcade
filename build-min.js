/* Minified single-file build for hosting. Same source, comments and
   whitespace stripped. Verified by the same test harness afterwards. */
const fs=require('fs'), path=require('path');
const terser=require('/tmp/node_modules/terser');
const CleanCSS=require('/tmp/node_modules/clean-css');
const ROOT=__dirname;

(async () => {
  let html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');

  const css=fs.readFileSync(path.join(ROOT,'css/style.css'),'utf8');
  const mincss=new CleanCSS({level:2}).minify(css).styles;
  html=html.replace(/<link rel="stylesheet" href="css\/style\.css">/,'<style>'+mincss+'</style>');

  const icon=fs.readFileSync(path.join(ROOT,'icon.svg'),'utf8');
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,'manifest.webmanifest'),'utf8'));
  m.icons[0].src='data:image/svg+xml,'+encodeURIComponent(icon);
  html=html.replace(/<link rel="manifest" href="manifest\.webmanifest">/,
    '<link rel="manifest" href="data:application/manifest+json,'+encodeURIComponent(JSON.stringify(m))+'">');

  const srcs=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x=>x[1]);
  const code=srcs.map(s=>fs.readFileSync(path.join(ROOT,s),'utf8')).join('\n');
  const out=await terser.minify(code,{
    compress:{passes:2, drop_debugger:true},
    mangle:true,
    format:{comments:false}
  });
  if(out.error) throw out.error;

  html=html.replace(/<script src="[^"]+"><\/script>\s*/g,'');
  html=html.replace('</body>','<script>'+out.code+'</script>\n</body>');
  html=html.replace(/<!--[\s\S]*?-->/g,'').replace(/\n\s*\n/g,'\n');

  fs.mkdirSync(path.join(ROOT,'dist'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'dist/index.min.html'),html);
  console.log('dist/index.min.html', (Buffer.byteLength(html)/1024).toFixed(1)+' KB');
})();
