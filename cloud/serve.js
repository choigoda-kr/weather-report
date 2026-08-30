/**
 * 로컬 확인용 정적 파일 서버 (외부 의존성 없음)
 *
 * file:// 로 직접 열면 브라우저가 데이터 파일 읽기를 차단하므로,
 * dist 폴더를 http 로 서빙해 실제 배포 환경과 동일한 조건에서 확인한다.
 *
 *   실행:  node serve.js
 *   접속:  http://localhost:8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // dist 밖으로 벗어나는 경로 차단
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('찾을 수 없음: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`정적 서버 실행 중 → http://localhost:${PORT}`);
  console.log(`(중지: Ctrl+C)`);
});
