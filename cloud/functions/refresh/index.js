/**
 * weather-refresh
 * ---------------------------------------------------------------
 * Cloud Scheduler가 주기적으로 호출한다.
 * 기존 GAS의 latestJson 엔드포인트에서 계산된 데이터를 받아
 * Cloud Storage에 스냅샷으로 저장한다.
 *
 * 정적 화면은 이 스냅샷을 읽어 첫 화면을 즉시 표시한다.
 */

const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');

const BUCKET = process.env.BUCKET;
const GAS_URL = process.env.GAS_URL;
const OBJECT_NAME = 'weather-latest.json';

const storage = new Storage();

functions.http('refresh', async (req, res) => {
  try {
    if (!BUCKET || !GAS_URL) {
      throw new Error('환경변수 BUCKET 또는 GAS_URL이 설정되지 않았습니다.');
    }

    const url = GAS_URL + '?action=latestJson';
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error('GAS 응답 오류: HTTP ' + response.status);
    }

    const text = await response.text();

    // 빈 응답이나 깨진 데이터를 그대로 저장하지 않도록 검증한다.
    // (이전에 리다이렉트 미추적으로 빈 파일이 저장된 사고가 있었다)
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('GAS 응답이 JSON이 아닙니다. 앞부분: ' + text.slice(0, 80));
    }
    if (!data || !Array.isArray(data.payload) || data.payload.length === 0) {
      throw new Error('payload가 비어 있어 저장하지 않았습니다.');
    }

    await storage.bucket(BUCKET).file(OBJECT_NAME).save(text, {
      contentType: 'application/json; charset=utf-8',
      metadata: {
        // 특보 지연을 줄이기 위해 매번 재검증하도록 한다(변경 없으면 304).
        cacheControl: 'no-cache'
      }
    });

    console.log('스냅샷 저장 완료: ' + data.payload.length + '개 지역');
    res.status(200).json({
      ok: true,
      locations: data.payload.length,
      generatedAt: data.generatedAt
    });
  } catch (err) {
    console.error('스냅샷 갱신 실패:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
