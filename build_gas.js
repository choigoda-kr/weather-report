const fs = require('fs');
try {
  // 1. Code.gs 업데이트 (doGet, include 추가)
  let codeGs = fs.readFileSync('Code.gs', 'utf8');
  if (!codeGs.includes('function doGet')) {
    const doGetCode = `\n\nfunction doGet(e) {\n  return HtmlService.createTemplateFromFile('index').evaluate()\n      .setTitle('재난 모니터링 대시보드')\n      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);\n}\n\nfunction include(filename) {\n  return HtmlService.createHtmlOutputFromFile(filename).getContent();\n}\n`;
    fs.writeFileSync('Code.gs', codeGs + doGetCode, 'utf8');
  }

  // 2. Stylesheet.html 생성
  const css = fs.readFileSync('style.css', 'utf8');
  fs.writeFileSync('Stylesheet.html', '<style>\n' + css + '\n</style>', 'utf8');

  // 3. JavaScript.html 생성 (sub_regions.js -> app.js 순서)
  const subJs = fs.readFileSync('sub_regions.js', 'utf8');
  const appJs = fs.readFileSync('app.js', 'utf8');
  fs.writeFileSync('JavaScript.html', '<script>\n' + subJs + '\n\n' + appJs + '\n</script>', 'utf8');

  // 4. index.html 뼈대 코드 보완
  let html = fs.readFileSync('index.html', 'utf8');
  // css 치환
  html = html.replace(/<link rel=["']stylesheet["'] href=["']\.\/style\.css[^>]*>/i, "<?!= include('Stylesheet'); ?>");
  // js 치환 (기존에 쿼리스트링이 있을 수 있으니 정규식 넓게)
  html = html.replace(/<script[^>]*src=[^>]*sub_regions\.js[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src=[^>]*app\.js[^>]*><\/script>/gi, '');
  // 마지막 body 닫기 전에 include 삽입
  html = html.replace(/<\/body>/i, () => "<?!= include('JavaScript'); ?>\n</body>");
  fs.writeFileSync('index.html', html, 'utf8');

  console.log('All files processed successfully.');
} catch(e) {
  console.error(e);
}
