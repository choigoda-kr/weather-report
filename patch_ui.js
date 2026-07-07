const fs = require('fs');
let c = fs.readFileSync('src/JS_UI.html', 'utf8');

const startIdx = c.indexOf('async function fetchSubRegionData(cityId, cityName, startDateStr, endDateStr) {');
const endIdx = c.indexOf('return null;\n  }\n}', startIdx) + 19;

const newFetch = `async function fetchSubRegionData(cityId, cityName, startDateStr, endDateStr) {
  const regions = window.subRegionsData ? window.subRegionsData[cityId] : null;
  if (!regions || regions.length === 0) {
    window.showToast(\`\${cityName}의 세부 지역 데이터가 없습니다.\`, true);
    return null;
  }
  
  const lats = regions.map(l => l.lat).join(',');
  const lons = regions.map(l => l.lon).join(',');
  const citiesStr = regions.map(l => cityName).join(','); // 시군 이름 유지
  const matchNamesStr = regions.map(l => l.matchName || l.name).join(',');
  
  try {
    if (typeof google === 'undefined' || typeof google.script === 'undefined') {
        throw new Error("GAS 환경(google.script.run)을 찾을 수 없습니다.");
    }
    
    const results = await new Promise((resolve, reject) => {
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
        throw new Error(results[0].message);
    }

    return regions.map((loc, index) => {
        const data = results[index] || {};
        
        const currentTemp = data.current?.temp !== undefined ? Number(data.current.temp).toFixed(1) : '-';
        const totalPrecip = data.historyTotal !== undefined ? Number(data.historyTotal).toFixed(1) : '0.0';
        const conditionCode = data.current?.code || ((parseFloat(totalPrecip) > 0) ? 61 : 0);
        const condition = window.getWeatherCondition ? window.getWeatherCondition(conditionCode) : { text: '알 수 없음', icon: '<i class="fa-solid fa-circle-question"></i>', color: 'text-slate-400' };

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
    
  } catch (error) {
    console.error(error);
    window.showToast('세부 데이터 로드 실패: ' + error.message, true);
    return null;
  }
}`;

c = c.substring(0, startIdx) + newFetch + c.substring(endIdx);
fs.writeFileSync('src/JS_UI.html', c);
console.log('Successfully patched fetchSubRegionData in JS_UI.html');
