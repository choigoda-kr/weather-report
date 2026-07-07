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
        
        const currentTemp = data.current?.temp !== undefined ? Number(data.current.temp).toFixed(1) : '-';
        const totalPrecip = data.historyTotal !== undefined ? Number(data.historyTotal).toFixed(1) : '0.0';
        const conditionCode = data.current?.code || ((parseFloat(totalPrecip) > 0) ? 61 : 0);
        const condition = getWeatherCondition(conditionCode); 

        let next24hSum = 0;
        const targetPrecips = [];
        const hourlyTimes = [];
        const hourlyPrecips = [];
        
        if (data.forecast24h) {
            const sortedKeys = Object.keys(data.forecast24h).sort();
            sortedKeys.forEach(k => {
                let pValue = parseFloat(data.forecast24h[k]);
                if (isNaN(pValue)) pValue = 0;
                next24hSum += pValue;
                targetPrecips.push(pValue);
                
                const dtStr = k.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:00");
                hourlyTimes.push(dtStr);
                hourlyPrecips.push(pValue);
            });
        }
        const next24hPrecip = next24hSum.toFixed(1);

        let next10dSum = 0;
        const futureDates = data.forecast10d?.time || [];
        const futurePrecips = data.forecast10d?.precipitation_sum || [];
        futurePrecips.forEach(p => next10dSum += (p || 0));
        const next10dPrecip = next10dSum.toFixed(1);
        
        const futureHourlyTimes = Object.keys(data.forecast10dHourly || {}).sort();
        const futureHourlyPrecips = futureHourlyTimes.map(k => parseFloat(data.forecast10dHourly[k]));

        let alertLevel = 'none';
        for (let i = 0; i < targetPrecips.length; i++) {
            const p1 = targetPrecips[i];
            const p2 = i + 1 < targetPrecips.length ? targetPrecips[i + 1] : 0;
            const p3 = i + 2 < targetPrecips.length ? targetPrecips[i + 2] : 0;
            const sum3h = p1 + p2 + p3;
            if (sum3h >= 90 || p1 >= 50) {
                alertLevel = 'red'; break;
            } else if ((sum3h >= 60 || p1 >= 30) && alertLevel !== 'red') {
                alertLevel = 'orange';
            }
        }

        return {
            ...loc,
            condition,
            currentTemp,
            totalPrecip,
            next24hPrecip,
            next10dPrecip,
            alertLevel,
            dailyDates: data.dailyDates || [],
            dailyPrecips: data.dailyPrecips || [],
            futureDates: futureDates,
            futurePrecips: futurePrecips,
            futureHourlyTimes: futureHourlyTimes,
            futureHourlyPrecips: futureHourlyPrecips,
            hourlyTimes: hourlyTimes,
            hourlyPrecips: hourlyPrecips,
            historyHourlyTimes: data.historyHourlyTimes || [],
            historyHourlyPrecips: data.historyHourlyPrecips || [],
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

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'test_rain' && processedData && processedData.length >= 2) {
      processedData[0].alertLevel = 'orange';
      processedData[1].alertLevel = 'red';
      const futureHour = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const offset = futureHour.getTimezoneOffset() * 60000;
      const futureLocalStr = new Date(futureHour - offset).toISOString().substring(0, 16);
      processedData[1].hourlyTimes.push(futureLocalStr);
      processedData[1].hourlyPrecips.push(55.5);
    }

    document.getElementById('loading-indicator').classList.add('hidden');
    updateLastTimeString();

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
