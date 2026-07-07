const fs = require('fs');
let code = fs.readFileSync('src/Code.gs', 'utf8');

const oldFunc = `    const { baseDate, baseTime } = getKmaBaseDateTime();
    const { baseDate: fcstBaseDate, baseTime: fcstBaseTime } = getKmaFcstBaseDateTime();
    const requests = [];
    
    // 1. Open-Meteo 요청 생성
    const omUrl = \`https://api.open-meteo.com/v1/forecast?latitude=\${latStr}&longitude=\${lonStr}&current=weather_code,temperature_2m&hourly=precipitation&daily=precipitation_sum&timezone=Asia%2FSeoul&past_days=0&forecast_days=10\`;
    requests.push({ url: omUrl, muteHttpExceptions: true });
    
    // 2. KMA 초단기실황 및 단기예보 요청
    lats.forEach((lat, i) => {
        const lon = lons[i];
        const grid = dfs_xy_conv("toXY", parseFloat(lat), parseFloat(lon));
        
        const ncstUrl = \`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=\${kmaApiKey}&pageNo=1&numOfRows=10&dataType=JSON&base_date=\${baseDate}&base_time=\${baseTime}&nx=\${grid.x}&ny=\${grid.y}\`;
        const fcstUrl = \`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=\${kmaApiKey}&pageNo=1&numOfRows=300&dataType=JSON&base_date=\${fcstBaseDate}&base_time=\${fcstBaseTime}&nx=\${grid.x}&ny=\${grid.y}\`;
        
        requests.push({ url: ncstUrl, muteHttpExceptions: true });
        requests.push({ url: fcstUrl, muteHttpExceptions: true });
    });

    // 병렬 호출 (이제 OM과 KMA ncst, fcst만 호출합니다)
    const responses = UrlFetchApp.fetchAll(requests);
    
    // OM 파싱
    const omResponseText = responses[0].getContentText();`;

const newFunc = `    const requests = [];
    
    // 1. Open-Meteo 요청 생성 (KMA 실시간 API 제거됨)
    const omUrl = \`https://api.open-meteo.com/v1/forecast?latitude=\${latStr}&longitude=\${lonStr}&current=weather_code,temperature_2m&hourly=precipitation&daily=precipitation_sum&timezone=Asia%2FSeoul&past_days=0&forecast_days=10\`;
    requests.push({ url: omUrl, muteHttpExceptions: true });

    const responses = UrlFetchApp.fetchAll(requests);
    const omResponseText = responses[0].getContentText();`;

code = code.replace(oldFunc, newFunc);

const oldCacheCode = `    // 날짜 필터 객체 생성
    let sDateObj = null, eDateObj = null;
    if (startDateStr && endDateStr) {
        sDateObj = new Date(startDateStr);
        sDateObj.setHours(0, 0, 0, 0);
        eDateObj = new Date(endDateStr);
        eDateObj.setHours(23, 59, 59, 999);
    }

    const locHistData = {}; // locName -> { daily: {}, hourly: {}, total: 0 }`;

const newCacheCode = `    // 기상청 예상강수량 캐시 시트 읽기
    let fcstCacheSheet = null;
    if (ss) { try { fcstCacheSheet = ss.getSheetByName('예상강수량_Cache'); } catch(e) {} }
    let fcstCacheData = [];
    if (fcstCacheSheet) {
        const fcstLastRow = fcstCacheSheet.getLastRow();
        if (fcstLastRow > 1) {
            fcstCacheData = fcstCacheSheet.getRange(2, 1, fcstLastRow - 1, 4).getValues();
        }
    }

    // 날짜 필터 객체 생성
    let sDateObj = null, eDateObj = null;
    if (startDateStr && endDateStr) {
        sDateObj = new Date(startDateStr);
        sDateObj.setHours(0, 0, 0, 0);
        eDateObj = new Date(endDateStr);
        eDateObj.setHours(23, 59, 59, 999);
    }

    const locHistData = {}; // locName -> { daily: {}, hourly: {}, total: 0 }
    const locFcstCache = {}; // locName -> { precip_hourly: [] }`;

code = code.replace(oldCacheCode, newCacheCode);

const oldMergeCode = `    });

    // JSON 조립
    const mergedResults = lats.map((lat, index) => {
        const ncstIndex = 1 + (index * 2);
        const fcstIndex = ncstIndex + 1;
        
        let ncstData = {}, fcstData = {};
        try {
            const ncstText = responses[ncstIndex].getContentText();
            if (!ncstText.trim().startsWith('<')) ncstData = JSON.parse(ncstText);
        } catch (e) {}
        
        try {
            const fcstText = responses[fcstIndex].getContentText();
            if (!fcstText.trim().startsWith('<')) fcstData = JSON.parse(fcstText);
        } catch (e) {}
        
        const kmaCurrent = extractKmaNcst(ncstData);
        const kmaForecast = extractKmaFcst24h(fcstData);`;

const newMergeCode = `    });

    // 예상강수량 캐시 데이터 포맷팅
    locNames.forEach(name => {
        locFcstCache[name] = { precip_hourly: [] };
        let targetStnCode = "108";
        if (KMA_AWS_STATIONS[name]) {
             targetStnCode = Object.keys(KMA_AWS_STATIONS[name])[0];
        }

        const filteredFcst = fcstCacheData.filter(row => {
            return (String(row[0]) === name && String(row[1]) === String(targetStnCode));
        });

        filteredFcst.forEach(row => {
            const isoTime = row[2];
            const datePart = isoTime.substring(0, 10).replace(/-/g, '');
            const timePart = isoTime.substring(11, 13) + "00";
            const pcpValue = parseFloat(row[3]) || 0;
            
            locFcstCache[name].precip_hourly.push({
                date: datePart,
                time: timePart,
                value: pcpValue.toString()
            });
        });
    });

    // JSON 조립
    const mergedResults = lats.map((lat, index) => {
        const kmaCurrent = {}; 
        const locName = locNames[index];
        const kmaForecast = locFcstCache[locName];`;

code = code.replace(oldMergeCode, newMergeCode);

fs.writeFileSync('src/Code.gs', code);
