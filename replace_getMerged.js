const fs = require('fs');
let c = fs.readFileSync('src/Code.gs', 'utf8');

const newFunc = `
function getMergedWeatherData(latStr, lonStr, cityStr, matchNameStr, startDateStr, endDateStr) {
    const lats = latStr.split(',');
    const lons = lonStr.split(',');
    const cities = cityStr.split(',');
    const matchNames = matchNameStr.split(',');
    
    // 1. 시트 연결
    let ss;
    try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch(e) {
        return JSON.stringify([{ error: "SHEET_ERROR", message: "스프레드시트 연결 실패" }]);
    }
    
    // 2. 신선도 및 데이터 파싱 함수
    function parseCacheSheet(sheetName, thresholdHours) {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return { stale: true, lastUpdated: "없음", data: [] };
        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) return { stale: true, lastUpdated: "없음", data: [] };
        
        let stale = true;
        let lastUpdatedStr = "알 수 없음";
        try {
            const f1Value = sheet.getRange('F1').getValue();
            const m = f1Value.toString().match(/마지막 갱신 시각: (.*?)]/);
            if (m) {
                lastUpdatedStr = m[1];
                const lastUpdTime = new Date(lastUpdatedStr.replace(' ', 'T') + '+09:00').getTime();
                const now = new Date().getTime();
                const hoursDiff = (now - lastUpdTime) / (1000 * 60 * 60);
                if (hoursDiff <= thresholdHours) {
                    stale = false;
                }
            }
        } catch(e) {}
        
        return { stale: stale, lastUpdated: lastUpdatedStr, data: data };
    }
    
    // 3. 시트 로드
    const pastCache = parseCacheSheet('과거강수량_Cache', 2);
    const fcstCache = parseCacheSheet('예상강수량_Cache', 2);
    const midCache = parseCacheSheet('중기예보_Cache', 4);
    
    if (pastCache.data.length === 0 && fcstCache.data.length === 0 && midCache.data.length === 0) {
        return JSON.stringify([{ error: "CACHE_MISS", message: "데이터 집계 중입니다." }]);
    }
    
    // 4. Open-Meteo 실시간 현재 날씨 가져오기 (가벼운 호출 1회)
    const omUrl = \`https://api.open-meteo.com/v1/forecast?latitude=\${latStr}&longitude=\${lonStr}&current=weather_code,temperature_2m,precipitation&timezone=Asia%2FSeoul\`;
    let omData = [];
    try {
        const resp = UrlFetchApp.fetch(omUrl, { muteHttpExceptions: true });
        let json = JSON.parse(resp.getContentText());
        omData = Array.isArray(json) ? json : [json];
    } catch(e) {}

    // 5. 날짜 매칭용
    let filterStart = null;
    let filterEnd = null;
    if (startDateStr && endDateStr) {
        filterStart = new Date(startDateStr);
        filterStart.setHours(0,0,0,0);
        // To handle KST, we just compare local YYYY-MM-DD simply by doing string compare or tz adjust.
        // But wait, it's easier to just compare date strings YYYY-MM-DD!
    }
    const sDateObj = filterStart ? Utilities.formatDate(filterStart, "Asia/Seoul", "yyyy-MM-dd") : null;
    const eDateObj = filterEnd ? Utilities.formatDate(new Date(endDateStr), "Asia/Seoul", "yyyy-MM-dd") : null;
    
    // 6. 결과 조립
    const mergedResults = lats.map((lat, index) => {
        const city = cities[index];
        const matchName = matchNames[index];
        
        const historyDaily = {};
        const historyHourly = {};
        let historyTotal = 0;
        
        for (let i = 1; i < pastCache.data.length; i++) {
            const row = pastCache.data[i];
            if (row[0] === city && row[1] === matchName) {
                const dtStr = row[2]; // "YYYY-MM-DD HH:00"
                const pcp = parseFloat(row[3]) || 0;
                
                const dKey = dtStr.split(' ')[0]; // "YYYY-MM-DD"
                if (sDateObj && eDateObj) {
                    if (dKey >= sDateObj && dKey <= eDateObj) {
                        historyTotal += pcp;
                        if(!historyDaily[dKey]) historyDaily[dKey] = 0;
                        historyDaily[dKey] += pcp;
                        historyHourly[dtStr.replace(' ', 'T')] = pcp;
                    }
                }
            }
        }
        const dailyDates = Object.keys(historyDaily).sort();
        const dailyPrecips = dailyDates.map(d => parseFloat(historyDaily[d].toFixed(1)));
        const hourlyTimes = Object.keys(historyHourly).sort();
        const hourlyPrecips = hourlyTimes.map(t => parseFloat(historyHourly[t].toFixed(1)));

        const fcst24hObj = {};
        for (let i = 1; i < fcstCache.data.length; i++) {
            const row = fcstCache.data[i];
            if (row[0] === city && row[1] === matchName) {
                const dtStr = row[2].toString(); // "YYYYMMDDHH00"
                const pcp = row[3];
                fcst24hObj[dtStr] = pcp;
            }
        }
        
        const midHourlyObj = {};
        const midDailyMap = {};
        for (let i = 1; i < midCache.data.length; i++) {
            const row = midCache.data[i];
            if (row[0] === city && row[1] === matchName) {
                const dtStr = row[2]; // "YYYY-MM-DDTHH:00"
                const pcp = parseFloat(row[3]) || 0;
                midHourlyObj[dtStr] = pcp;
                
                const dKey = dtStr.split('T')[0];
                if(!midDailyMap[dKey]) midDailyMap[dKey] = 0;
                midDailyMap[dKey] += pcp;
            }
        }
        const midDailyObj = { time: [], precipitation_sum: [] };
        const sortedMidDaily = Object.keys(midDailyMap).sort();
        for (let d of sortedMidDaily) {
            midDailyObj.time.push(d);
            midDailyObj.precipitation_sum.push(parseFloat(midDailyMap[d].toFixed(1)));
        }
        
        let isStale = pastCache.stale || fcstCache.stale || midCache.stale;
        if(fcstCache.data.length <= 1) isStale = true;
        
        let temp = omData[index]?.current?.temperature_2m;
        let precip = omData[index]?.current?.precipitation || 0;
        let code = omData[index]?.current?.weather_code || 0;
        
        return {
            lat: lat,
            lon: lons[index],
            city: city,
            matchName: matchName,
            isStale: isStale,
            lastUpdated: \`과거:\${pastCache.lastUpdated} | 예상:\${fcstCache.lastUpdated} | 중기:\${midCache.lastUpdated}\`,
            current: {
                temp: temp !== undefined ? temp : 0,
                precip: precip,
                code: code
            },
            historyTotal: parseFloat(historyTotal.toFixed(1)),
            dailyDates: dailyDates,
            dailyPrecips: dailyPrecips,
            historyHourlyTimes: hourlyTimes,
            historyHourlyPrecips: hourlyPrecips,
            forecast24h: fcst24hObj,
            forecast10d: midDailyObj,
            forecast10dHourly: midHourlyObj
        };
    });
    
    return JSON.stringify(mergedResults);
}
`;

c = c.replace(/function getMergedWeatherData[\s\S]*?\n}/, newFunc);
fs.writeFileSync('src/Code.gs', c);
console.log('Replaced getMergedWeatherData');
