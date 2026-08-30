/**
 * weather-proxy
 * ---------------------------------------------------------------
 * 정적 화면이 실시간 조회(날짜 범위 / 읍면동 / 지도)를 할 때 사용하는 중계자.
 *
 * GAS는 CORS 헤더를 보내지 않아 브라우저가 직접 호출을 차단한다.
 * 이 함수가 요청을 GAS로 그대로 전달하고, 응답에 CORS 헤더를 붙여 돌려준다.
 *
 * 중계 대상인 GAS 엔드포인트는 이미 익명 공개 상태이므로
 * 이 함수로 인해 새로 노출되는 정보는 없다. 읽기 전용이다.
 */

const functions = require('@google-cloud/functions-framework');

const GAS_URL = process.env.GAS_URL;

// 허용된 조회 종류만 중계한다.
const ALLOWED_ACTIONS = new Set(['merged', 'subRegion', 'mapData', 'latestJson']);

functions.http('proxy', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }

  try {
    if (!GAS_URL) throw new Error('환경변수 GAS_URL이 설정되지 않았습니다.');

    const action = req.query.action;
    if (!ALLOWED_ACTIONS.has(action)) {
      res.status(400).json({ error: '허용되지 않은 action 입니다: ' + action });
      return;
    }

    // 전달받은 조회 조건을 그대로 GAS로 넘긴다.
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      params.append(key, Array.isArray(value) ? value[0] : value);
    }

    const response = await fetch(GAS_URL + '?' + params.toString(), { redirect: 'follow' });
    const text = await response.text();

    if (!response.ok) {
      console.error('GAS 응답 오류 HTTP ' + response.status);
      res.status(502).json({ error: 'GAS 응답 오류: HTTP ' + response.status });
      return;
    }

    res.set('Cache-Control', 'no-store');
    res.type('application/json; charset=utf-8').status(200).send(text);
  } catch (err) {
    console.error('중계 실패:', err);
    res.status(500).json({ error: err.message });
  }
});
