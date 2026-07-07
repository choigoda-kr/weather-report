const fs = require('fs');
let c = fs.readFileSync('src/JS_Logic.html', 'utf8');

const startIdx = c.indexOf('async function fetchWeatherData(startDateStr, endDateStr, forceRefresh = false)');
const endIdx = c.indexOf('return null;\n  }\n}', startIdx) + 19;

const newFetch = `async function fetchWeatherData(startDateStr, endDateStr, forceRefresh = false) {
  const CACHE_TTL = 60 * 60 * 1000;
  const cacheKey = \`weather_data_v4_\${startDateStr}_\${endDateStr}\`;
  const cached = sessionStorage.getItem(cacheKey);

  const urlParamsForCache = new URLSearchParams(window.location.search);
  const isTestMode = urlParamsForCache.get('mode') === 'test_rain';

  if (!isTestMode && !forceRefresh && cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp < CACHE_TTL) {
      console.log('Using cached data for', startDateStr, 'to', endDateStr);
      updateLastTimeString();
      document.getElementById('loading-indicator').classList.add('hidden');
      return data.payload;
    }
  }

  document.getElementById('loading-indicator').classList.remove('hidden');

  try {
    const lats = locations.map(l => l.lat).join(',');
    const lons = locations.map(l => l.lon).join(',');
    const citiesStr = locations.map(l => l.name).join(',');
    const matchNamesStr = locations.map(l => l.name === '옹진' ? '백령도' : l.name).join(',');
    
    console.log('Fetching Hybrid Data via GAS Backend...');
    let results;
    
    if (typeof google === 'undefined' || typeof google.script === 'undefined') {
        throw new Error("GAS 환경(google.script.run)을 찾을 수 없습니다.");
    }
    
    results = await new Promise((resolve, reject) => {
        google.script.run
            .withSuccessHandler((res) => {
                try {
                    resolve(JSON.parse(res));
                } catch(e) { reject(e); }
            })
            .withFailureHandler(reject)
            .getMergedWeatherData(lats, lons, citiesStr, matchNamesStr, startDateStr, endDateStr);
    });

    if (results.length === 1 && results[0].error) {
        // Global Error
        const isMiss = results[0].error === "CACHE_MISS";
        return locations.map((loc) => ({
            id: loc.id,
            name: loc.name,
            isError: true,
            errorMessage: results[0].message,
            isStale: true,
            lastUpdated: "알 수 없음",
            isCacheMiss: isMiss
        }));
    }

    const processedData = locations.map((loc, index) => {
        const data = results[index] || {};
        return {
            id: loc.id,
            name: loc.name,
            current: {
                temp: data.current?.temp ?? '-',
                precip: data.current?.precip ?? '-',
                condition: getWeatherCondition(data.current?.code ?? -1)
            },
            historyTotal: data.historyTotal ?? 0,
            dailyDates: data.dailyDates || [],
            dailyPrecips: data.dailyPrecips || [],
            historyHourlyTimes: data.historyHourlyTimes || [],
            historyHourlyPrecips: data.historyHourlyPrecips || [],
            forecast24h: data.forecast24h || {},
            forecast10d: data.forecast10d || {},
            forecast10dHourly: data.forecast10dHourly || {},
            isStale: data.isStale,
            lastUpdated: data.lastUpdated || "알 수 없음"
        };
    });

    if (!isTestMode) {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        timestamp: Date.now(),
        payload: processedData
      }));
    }

    updateLastTimeString();
    document.getElementById('loading-indicator').classList.add('hidden');
    return processedData;

  } catch (error) {
    console.error('[GAS Fetch Exception]', error);
    document.getElementById('loading-indicator').classList.add('hidden');
    window.showToast('데이터 로드 실패 (GAS 환경 확인 요망)', true);
    return null;
  }
}`;

c = c.substring(0, startIdx) + newFetch + c.substring(endIdx);
fs.writeFileSync('src/JS_Logic.html', c);
console.log('Successfully patched fetchWeatherData in JS_Logic.html');
