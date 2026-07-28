/* Bundles the whole arcade into one self-contained index.html.
   Same source, zero dependencies — just easier to host and to hand around. */
const fs = require('fs'), path = require('path');
const ROOT = __dirname;
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/style\.css">/,
  '<style>\n' + css + '\n</style>');

const manifest = fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8');
const icon = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8');
const iconUri = 'data:image/svg+xml,' + encodeURIComponent(icon);
const m = JSON.parse(manifest);
m.icons[0].src = iconUri;
html = html.replace(/<link rel="manifest" href="manifest\.webmanifest">/,
  '<link rel="manifest" href="data:application/manifest+json,' +
  encodeURIComponent(JSON.stringify(m)) + '">');

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(ROOT, src), 'utf8');
  return '<script>\n/* ===== ' + src + ' ===== */\n' + js + '\n</script>';
});

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/index.html'), html);
fs.writeFileSync(path.join(ROOT, 'dist/icon.svg'), icon);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
