/**
 * 외부 자산 수집 스크립트
 *
 * 화면이 쓰는 부품(달력·지도·아이콘)을 저장소 안(assets/)으로 내려받는다.
 * 남의 CDN에 의존하지 않게 되어 다음이 해결된다.
 *   - 첫 로딩 시 외부 도메인 연결 4~5회가 사라진다
 *   - CDN 장애·사내망 차단에 화면이 깨지지 않는다
 *   - 버전이 고정된다 (지금 flatpickr 주소는 버전이 없어 언제든 바뀔 수 있다)
 *
 * 아이콘은 화면이 실제로 쓰는 것만 추려 폰트를 다시 만든다.
 * 전체 세트 252KB → 실사용분만 담아 대폭 축소.
 *
 *   실행:  node cloud/fetch-assets.js
 *   필요:  python + fonttools, brotli  (pip install fonttools brotli)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const BUILT = path.join(ROOT, 'index.html');

// 버전은 반드시 고정한다. 고정하지 않으면 저쪽이 올린 새 버전이 어느 날 그대로 들어온다.
const FLATPICKR = '4.6.13';
const LEAFLET = '1.9.4';
const FONTAWESOME = '6.4.0';

const FILES = [
  ['flatpickr.min.css', `https://cdn.jsdelivr.net/npm/flatpickr@${FLATPICKR}/dist/flatpickr.min.css`],
  ['flatpickr.min.js',  `https://cdn.jsdelivr.net/npm/flatpickr@${FLATPICKR}/dist/flatpickr.min.js`],
  ['flatpickr-ko.js',   `https://cdn.jsdelivr.net/npm/flatpickr@${FLATPICKR}/dist/l10n/ko.js`],
  ['leaflet.css',       `https://unpkg.com/leaflet@${LEAFLET}/dist/leaflet.css`],
  ['leaflet.js',        `https://unpkg.com/leaflet@${LEAFLET}/dist/leaflet.js`],
  // leaflet.css 가 상대경로로 참조하는 이미지들. 없으면 줌 컨트롤 등이 깨진다.
  ['images/layers.png',      `https://unpkg.com/leaflet@${LEAFLET}/dist/images/layers.png`],
  ['images/layers-2x.png',   `https://unpkg.com/leaflet@${LEAFLET}/dist/images/layers-2x.png`],
  ['images/marker-icon.png', `https://unpkg.com/leaflet@${LEAFLET}/dist/images/marker-icon.png`]
];

const FA_CSS_URL  = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FONTAWESOME}/css/all.min.css`;
const FA_FONT_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FONTAWESOME}/webfonts/fa-solid-900.woff2`;

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const kb = (n) => (n / 1024).toFixed(1) + 'KB';

(async function main() {
  fs.mkdirSync(path.join(ASSETS, 'images'), { recursive: true });

  // ---------------------------------------------------------
  // 1. 라이브러리 파일 내려받기
  // ---------------------------------------------------------
  let libTotal = 0;
  for (const [name, url] of FILES) {
    const buf = await download(url);
    fs.writeFileSync(path.join(ASSETS, name), buf);
    libTotal += buf.length;
    console.log(`  받음 ${name.padEnd(22)} ${kb(buf.length)}`);
  }

  // ---------------------------------------------------------
  // 2. 화면이 실제로 쓰는 아이콘만 추리기
  //    빌드 결과물에서 fa-* 클래스를 모으고,
  //    FontAwesome CSS에 실제 아이콘으로 정의된 것만 남긴다.
  // ---------------------------------------------------------
  if (!fs.existsSync(BUILT)) {
    console.error('[오류] index.html 이 없습니다. 먼저 node cloud/build.js 를 실행하십시오.');
    process.exit(1);
  }
  const page = fs.readFileSync(BUILT, 'utf8');
  const faCss = (await download(FA_CSS_URL)).toString('utf8');

  // content 규칙을 수집한다. 별칭 아이콘은 선택자를 묶어 한 규칙으로 정의되므로
  //   .fa-triangle-exclamation:before,.fa-exclamation-triangle:before{content:"\f071"}
  // 처럼 선택자 목록 전체를 훑어야 한다. 하나만 보면 별칭이 통째로 누락된다.
  const glyphs = new Map();
  for (const m of faCss.matchAll(/([^{}]+)\{content:"\\([0-9a-f]+)"\}/g)) {
    for (const s of m[1].matchAll(/\.fa-([a-z0-9-]+):before/g)) {
      glyphs.set(s[1], m[2]);
    }
  }

  // 화면에 등장하는 fa-* 중 실제 아이콘인 것만 남긴다.
  // fa-solid / fa-spin 같은 유틸리티 클래스는 아이콘이 아니므로 자연히 제외된다.
  const inPage = new Set([...page.matchAll(/\bfa-([a-z0-9-]+)/g)].map(m => m[1]));
  const UTILITY = new Set(['solid', 'regular', 'brands', 'fw', 'spin', 'fade', 'lg', 'xs', 'sm', 'solid-900']);
  const used = [...inPage].filter(n => glyphs.has(n)).sort();
  const missing = [...inPage].filter(n => !glyphs.has(n) && !UTILITY.has(n));

  if (used.length === 0) {
    console.error('[오류] 사용 중인 아이콘을 찾지 못했습니다.');
    process.exit(1);
  }
  // 아이콘인데 글리프를 못 찾았다면 화면에서 빈 네모로 보이게 된다. 여기서 멈춘다.
  if (missing.length > 0) {
    console.error('[오류] 글리프를 찾지 못한 아이콘: ' + missing.join(', '));
    console.error('       그대로 두면 화면에서 해당 아이콘이 사라집니다.');
    process.exit(1);
  }

  // ---------------------------------------------------------
  // 3. 아이콘 폰트를 실사용분만 담아 다시 만들기
  // ---------------------------------------------------------
  const fullFont = path.join(ASSETS, '.fa-full.woff2');
  fs.writeFileSync(fullFont, await download(FA_FONT_URL));
  const fullSize = fs.statSync(fullFont).size;

  const unicodes = used.map(n => 'U+' + glyphs.get(n)).join(',');
  execFileSync('python', [
    '-m', 'fontTools.subset', fullFont,
    '--unicodes=' + unicodes,
    '--flavor=woff2',
    '--output-file=' + path.join(ASSETS, 'icons.woff2')
  ], { stdio: 'pipe' });
  fs.unlinkSync(fullFont);
  const subSize = fs.statSync(path.join(ASSETS, 'icons.woff2')).size;

  // ---------------------------------------------------------
  // 4. 최소 아이콘 CSS 생성
  //    원본 CSS 102KB 에는 쓰지 않는 아이콘 수천 개의 정의가 들어 있다.
  //    필요한 규칙만 직접 만들어 대체한다.
  // ---------------------------------------------------------
  const css = `/* 화면이 실제로 쓰는 아이콘 ${used.length}종만 담은 최소 CSS
   원본: FontAwesome Free ${FONTAWESOME} (CC BY 4.0 / SIL OFL 1.1)
   cloud/fetch-assets.js 가 생성하므로 직접 수정하지 마십시오. */
@font-face {
  font-family: 'Font Awesome 6 Free';
  font-style: normal;
  font-weight: 900;
  font-display: block;
  src: url('./icons.woff2') format('woff2');
}
.fa-solid, .fas {
  font-family: 'Font Awesome 6 Free';
  font-weight: 900;
}
.fa-solid, .fas, .fa {
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  display: var(--fa-display, inline-block);
  font-style: normal;
  font-variant: normal;
  line-height: 1;
  text-rendering: auto;
}
.fa-fw { text-align: center; width: 1.25em; }
.fa-spin { animation: fa-spin 2s infinite linear; }
.fa-fade { animation: fa-fade 2s infinite cubic-bezier(.4,0,.6,1); }
@keyframes fa-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes fa-fade { 50% { opacity: .4; } }
@media (prefers-reduced-motion: reduce) {
  .fa-spin, .fa-fade { animation-delay: -1ms; animation-duration: 1ms; animation-iteration-count: 1; }
}
${used.map(n => `.fa-${n}:before { content: "\\${glyphs.get(n)}"; }`).join('\n')}
`;
  fs.writeFileSync(path.join(ASSETS, 'icons.css'), css, 'utf8');

  // ---------------------------------------------------------
  // 결과 보고
  // ---------------------------------------------------------
  const cssSize = Buffer.byteLength(css, 'utf8');
  console.log('');
  console.log(`  아이콘 ${used.length}종 추출: ${used.join(', ')}`);
  console.log('');
  console.log(`  아이콘 CSS   ${kb(faCss.length).padStart(9)} → ${kb(cssSize)}`);
  console.log(`  아이콘 폰트  ${kb(fullSize).padStart(9)} → ${kb(subSize)}`);
  console.log(`  라이브러리   ${kb(libTotal).padStart(9)} (저장소 내부로 이전)`);
  console.log('');
  console.log(`  자산 폴더: assets/  (flatpickr ${FLATPICKR} · leaflet ${LEAFLET} · fontawesome ${FONTAWESOME})`);
})().catch(err => {
  console.error('[오류]', err.message);
  process.exit(1);
});
