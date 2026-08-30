/**
 * 정적 빌드 스크립트
 *
 * GAS는 doGet에서 index.html 템플릿을 평가하면서 <?!= include('X'); ?> 지점에
 * 각 파일 내용을 끼워 넣어 하나의 HTML을 만들어 보낸다.
 * 이 스크립트는 그 조립 과정을 그대로 재현해 정적 파일 하나를 만든다.
 *
 * 화면 파일(src/*.html)은 원본 그대로 두고 절대 수정하지 않는다.
 */

const fs = require('fs');
const path = require('path');

// 화면 원본은 GAS 소스(../src)를 그대로 사용한다. 사본을 두지 않아 원본이 하나로 유지된다.
const SRC = path.join(__dirname, '..', 'src');
const SHIM = path.join(__dirname, 'shim');
// 빌드 결과는 저장소 루트의 index.html — GitHub Pages가 이 파일을 서비스한다.
const OUT_FILE = path.join(__dirname, '..', 'index.html');

const read = (name) => fs.readFileSync(path.join(SRC, name), 'utf8');

let html = read('index.html');

// GAS의 include() 스크립틀릿을 실제 파일 내용으로 치환.
// 어댑터(shim)는 원본 로직보다 반드시 먼저 실행되어야 하므로
// 첫 스크립트 지점인 JS_Data 앞에 함께 끼워 넣는다.
const INCLUDES = ['Stylesheet', 'JS_Data', 'JS_Logic', 'JS_UI'];
const adapter = fs.readFileSync(path.join(SHIM, 'api-adapter.html'), 'utf8');
let replaced = 0;
let adapterInjected = false;

// 지도 지연 로딩 shim 은 showMapModal 이 정의된 뒤에 실행되어야 하므로
// 마지막 스크립트인 JS_UI 뒤에 붙인다.
const mapLazy = fs.readFileSync(path.join(SHIM, 'map-lazy.html'), 'utf8');
let mapLazyInjected = false;

for (const name of INCLUDES) {
  // <?!= include('Stylesheet'); ?> 형태. 공백 변형을 허용한다.
  const pattern = new RegExp("<\\?!=\\s*include\\(\\s*'" + name + "'\\s*\\)\\s*;?\\s*\\?>", 'g');
  const before = html;
  html = html.replace(pattern, () => {
    if (name === 'JS_Data') {
      adapterInjected = true;
      return adapter + '\n' + read(name + '.html');
    }
    if (name === 'JS_UI') {
      mapLazyInjected = true;
      return read(name + '.html') + '\n' + mapLazy;
    }
    return read(name + '.html');
  });
  if (html !== before) replaced++;
  else console.error(`[경고] include('${name}') 지점을 찾지 못했습니다.`);
}

if (!adapterInjected) {
  console.error('[오류] 어댑터를 주입하지 못했습니다.');
  process.exit(1);
}
if (!mapLazyInjected) {
  console.error('[오류] 지도 지연 로딩 shim 을 주입하지 못했습니다.');
  process.exit(1);
}

// ---------------------------------------------------------------
// 외부 CDN 자산을 저장소 안(assets/)의 파일로 바꾼다.
//
// 원본은 부품을 남의 서버 5곳에서 받아온다. 도메인마다 주소 조회와
// 보안 연결 절차를 새로 거치므로 첫 로딩이 그만큼 늦어지고,
// 그 중 한 곳만 장애가 나거나 차단돼도 화면이 깨진다.
// flatpickr 주소는 버전조차 고정돼 있지 않아 저쪽 배포가 그대로 들어온다.
//
// 화면 원본(src/)은 GAS용으로 그대로 두고, 여기 빌드 단계에서만 바꾼다.
// ---------------------------------------------------------------
const ASSET_SWAPS = [
  // [화면에서 찾을 문자열, 바꿔 넣을 값, 설명]
  ['https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css', './assets/flatpickr.min.css', '달력 CSS'],
  ['https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js',        './assets/flatpickr-ko.js',   '달력 한국어'],
  ['https://cdn.jsdelivr.net/npm/flatpickr',                        './assets/flatpickr.min.js',  '달력 JS'],
  ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', './assets/icons.css', '아이콘 CSS']
];

for (const [from, to, label] of ASSET_SWAPS) {
  if (!html.includes(from)) {
    console.error(`[오류] ${label} 주소를 찾지 못했습니다: ${from}`);
    process.exit(1);
  }
  html = html.split(from).join(to);
}

// 지도(Leaflet)와 한글 글꼴은 MAP 모달에서만 쓰이므로 첫 로딩에서 뺀다.
// 실제로 필요한 시점에 map-lazy shim 이 불러온다.
const DEFERRED_TAGS = [
  [/\s*<link rel="stylesheet" href="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css"\s*\/?>/, '지도 CSS'],
  [/\s*<script src="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js"><\/script>/, '지도 JS'],
  [/\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Noto\+Sans\+KR[^"]*" rel="stylesheet">/, '한글 글꼴']
];

for (const [pattern, label] of DEFERRED_TAGS) {
  if (!pattern.test(html)) {
    console.error(`[오류] ${label} 태그를 찾지 못했습니다. 원본 구조를 확인하십시오.`);
    process.exit(1);
  }
  html = html.replace(pattern, `\n  <!-- ${label}: MAP 모달을 열 때 불러옵니다 -->`);
}

// ---------------------------------------------------------------
// 원본 index.html 은 "GAS 밖에서 열리면 GAS로 보내라"는 리다이렉트를
// <head> 최상단에 갖고 있다. 정적 페이지에서는 이 페이지 자체가 목적지이므로
// 반드시 제거해야 한다. 남아 있으면 페이지가 즉시 GAS로 튕겨 나간다.
// ---------------------------------------------------------------
const REDIRECT_BLOCK = /<script>\s*\/\/[^\n]*리다이렉트[\s\S]*?window\.location\.replace\([\s\S]*?<\/script>/;
if (!REDIRECT_BLOCK.test(html)) {
  console.error('[오류] GAS 리다이렉트 블록을 찾지 못했습니다. 원본 구조를 확인하십시오.');
  process.exit(1);
}
html = html.replace(REDIRECT_BLOCK,
  '<!-- GAS 리다이렉트 제거됨: 이 정적 페이지가 최종 목적지이므로 불필요 -->');

// 제거 확인
if (/window\.location\.replace\s*\(\s*["']https:\/\/script\.google\.com/.test(html)) {
  console.error('[오류] GAS 리다이렉트가 여전히 남아 있습니다.');
  process.exit(1);
}

// ---------------------------------------------------------------
// 첫 로딩 가속 힌트를 <head> 앞쪽에 주입한다.
//   - preconnect : 외부 도메인 연결(DNS+TLS)을 미리 병렬로 시작
//   - 데이터 선행 요청 : 자산 다운로드와 겹쳐서 데이터를 미리 받아둔다
//   - 아이콘 폰트 preload : CSS 해석을 기다리지 않고 바로 받기 시작
// ---------------------------------------------------------------
const SNAPSHOT_URL = 'https://storage.googleapis.com/weather-report-507023-data/weather-latest.json';

// 부품이 모두 같은 주소에서 오므로 예열할 외부 도메인은 데이터 쪽 하나만 남는다.
const PERF_HINTS = `
  <!-- 첫 로딩 가속: 데이터 도메인 연결 예열 -->
  <link rel="preconnect" href="https://storage.googleapis.com" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="./assets/icons.woff2" crossorigin>
  <script>
    // 데이터 요청을 가장 먼저 시작해 자산 다운로드와 겹치게 한다.
    // 어댑터가 이 진행 중인 요청을 그대로 재사용한다.
    window.__SNAPSHOT_URL__ = ${JSON.stringify(SNAPSHOT_URL)};
    try {
      window.__SNAPSHOT_PREFETCH__ = fetch(window.__SNAPSHOT_URL__, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      window.__SNAPSHOT_PREFETCH__.catch(function () {});
    } catch (e) {
      window.__SNAPSHOT_PREFETCH__ = null;
    }
  </script>
`;

const headAnchor = '<meta name="viewport"';
if (!html.includes(headAnchor)) {
  console.error('[오류] <head> 주입 지점을 찾지 못했습니다.');
  process.exit(1);
}
html = html.replace(headAnchor, PERF_HINTS.trim() + '\n  ' + headAnchor);

// 남은 GAS 스크립틀릿이 없는지 검사
const leftover = html.match(/<\?[!=]?/g);

// 출력 대상이 실서비스 파일이므로, 검증을 모두 통과한 뒤에만 기록한다.
if (replaced !== INCLUDES.length) {
  console.error(`[오류] 치환 실패 (${replaced}/${INCLUDES.length}). 기록하지 않았습니다.`);
  process.exit(1);
}
if (leftover) {
  console.error(`[오류] GAS 스크립틀릿 ${leftover.length}건이 남아 있습니다. 기록하지 않았습니다.`);
  process.exit(1);
}

fs.writeFileSync(OUT_FILE, html, 'utf8');

console.log(`치환 완료: ${replaced} / ${INCLUDES.length}`);
console.log(`남은 GAS 스크립틀릿: 0`);
console.log(`생성: index.html (${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB)`);
