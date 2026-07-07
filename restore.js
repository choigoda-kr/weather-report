const fs = require('fs');

const KMA_AWS_STATIONS = {
    "과천": { "과천": "590" },
    "여주": { "여주": "465", "금사": "576", "대신": "577", "점동": "579", "가남": "580", "북내": "569" },
    "이천": { "이천": "203", "모가": "555", "백사": "556", "장호원": "557", "호법": "558", "마장": "559", "신둔": "578" },
    "양평": { "양평": "202", "청운": "564", "단월": "565", "옥천": "566", "용문산": "567", "지평": "568", "양동": "575" },
    "화성": { "화성": "488", "송산": "548", "서신": "549", "향남": "551", "동탄": "586", "도리도": "587", "제부도": "589" },
    "수원": { "수원": "119" },
    "연천": { "연천": "491", "백학": "522", "미산": "523", "신서": "524", "왕징": "525", "장남": "526", "청산": "527", "전곡": "528", "중면": "529" },
    "포천": { "포천": "473", "이동": "514", "일동": "515", "관인": "516", "영북": "517", "창수": "518", "신북": "519", "내촌": "520", "가산": "521", "소흘": "530" },
    "파주": { "파주": "99", "탄현": "531", "광탄": "532", "진동": "533", "월롱": "534", "적성": "535", "법원": "536", "파평": "537", "도라산": "538" },
    "고양": { "고양": "540", "주교": "541", "능곡": "542", "일산": "543", "벽제": "544", "신도": "545" },
    "강화": { "강화": "201", "교동": "503", "삼산": "504", "서도": "505", "양도": "506", "내가": "507", "불은": "508", "길상": "509", "화도": "510", "볼음도": "511" },
    "옹진": { "백령도": "102", "덕적도": "501", "영흥도": "502", "자월도": "513", "연평도": "171" },
    "김포": { "김포": "441", "대곶": "546", "월곶": "547", "통진": "588" },
    "평택": { "평택": "356", "송탄": "571", "안중": "572", "포승": "573", "현덕": "574" },
    "안성": { "안성": "470", "일죽": "560", "죽산": "561", "삼죽": "562", "고삼": "563", "공도": "581", "보개": "582", "금광": "583", "서운": "584", "미양": "585" }
};

let code = fs.readFileSync('src/Code.gs', 'utf8');
const grids = fs.readFileSync('grids.json', 'utf8');

// 1. Prepend KMA_FORECAST_GRIDS and KMA_AWS_STATIONS
code = `const KMA_FORECAST_GRIDS = ${grids};\n\nconst KMA_AWS_STATIONS = ${JSON.stringify(KMA_AWS_STATIONS, null, 4)};\n\n` + code;

// 2. Fix getMergedWeatherData to remove old API HUB call and use both caches properly
// Replace everything inside getMergedWeatherData with a clean implementation.
const getMergedRegex = /function getMergedWeatherData\(latStr, lonStr, locNamesStr, startDateStr, endDateStr\) \{[\s\S]*?return JSON\.stringify\(mergedResults\);\n\}/;

const newGetMerged = `function getMergedWeatherData(latStr, lonStr, locNamesStr, startDateStr, endDateStr) {
    const lats = latStr.split(',');
    const lons = lonStr.split(',');
    const locNames = locNamesStr ? locNamesStr.split(',') : [];
    
    const scriptProps = PropertiesService.getScriptProperties();
    const kmaApiKey = scriptProps.getProperty('KMA_API_KEY');
    
    if (!kmaApiKey) {
        throw new Error('KMA_API_KEY is not set in Script Properties.');
    }
    
    const requests = [];
    
    // 1. Open-Meteo 요청 생성 (현재 기온, 10일 예보용)
    const omUrl = \`https://api.open-meteo.com/v1/forecast?latitude=\${latStr}&longitude=\${lonStr}&current=weather_code,temperature_2m&hourly=precipitation&daily=precipitation_sum&timezone=Asia%2FSeoul&past_days=0&forecast_days=10\`;
    requests.push({ url: omUrl, muteHttpExceptions: true });

    // 병렬 호출 (Open-Meteo 만)
    const responses = UrlFetchApp.fetchAll(requests);
    
    const omResponseText = responses[0].getContentText();
    let omData = JSON.parse(omResponseText);
    if (!Array.isArray(omData)) {
        if (omData.error) throw new Error(\`Open-Meteo Error: \${omData.reason}\`);
        omData = [omData];
    }
    
    // 캐시 시트 읽기
    let ss;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
    
    let cacheSheet = null;
    if (ss) { try { cacheSheet = ss.getSheetByName('과거강수량_Cache'); } catch(e) {} }
    let cacheData = [];
    if (cacheSheet) {
        const lastRow = cacheSheet.getLastRow();
        if (lastRow > 1) {
            cacheData = cacheSheet.getRange(2, 1, lastRow - 1, 5).getValues();
        }
    }

    let fcstCacheSheet = null;
    if (ss) { try { fcstCacheSheet = ss.getSheetByName('예상강수량_Cache'); } catch(e) {} }
    let fcstCacheData = [];
    if (fcstCacheSheet) {
        const fcstLastRow = fcstCacheSheet.getLastRow();
        if (fcstLastRow > 1) {
            fcstCacheData = fcstCacheSheet.getRange(2, 1, fcstLastRow - 1, 4).getValues();
        }
    }

    let sDateObj = null, eDateObj = null;
    if (startDateStr && endDateStr) {
        sDateObj = new Date(startDateStr);
        sDateObj.setHours(0, 0, 0, 0);
        eDateObj = new Date(endDateStr);
        eDateObj.setHours(23, 59, 59, 999);
    }

    const locHistData = {}; // locName -> { daily: {}, hourly: {}, total: 0 }
    const locFcstCache = {}; // locName -> { precip_hourly: [] }
    
    locNames.forEach(name => {
        locHistData[name] = { daily: {}, hourly: {}, total: 0 };
        locFcstCache[name] = { precip_hourly: [] };
        
        let targetStnCode = "108";
        let targetStationName = name;
        if (KMA_AWS_STATIONS[name]) {
             targetStationName = Object.keys(KMA_AWS_STATIONS[name])[0]; // 관측소명 (예: "여주")
             targetStnCode = KMA_AWS_STATIONS[name][targetStationName];
        }

        // 과거 데이터 필터링
        const filteredHist = cacheData.filter(row => {
            const rowStnCode = String(row[2]);
            if (rowStnCode !== String(targetStnCode)) return false;
            if (sDateObj && eDateObj) {
                const rowTime = new Date(row[3]); 
                if (rowTime < sDateObj || rowTime > eDateObj) return false;
            }
            return true;
        });

        filteredHist.forEach(row => {
            const isoTime = row[3]; 
            const rn1hr = parseFloat(row[4]) || 0;
            
            locHistData[name].total += rn1hr;
            const dateKey = isoTime.substring(0, 10).replace(/-/g, ''); 
            if (!locHistData[name].daily[dateKey]) locHistData[name].daily[dateKey] = 0;
            locHistData[name].daily[dateKey] += rn1hr;
            locHistData[name].hourly[isoTime] = rn1hr;
        });

        // 예측 데이터 필터링
        const filteredFcst = fcstCacheData.filter(row => {
            return (String(row[0]) === name && String(row[1]) === String(targetStationName));
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

    const mergedResults = lats.map((lat, index) => {
        const locName = locNames[index];
        const histData = locHistData[locName];
        const kmaForecast = locFcstCache[locName];
        
        const sortedDates = Object.keys(histData.daily).sort();
        const dailyDates = sortedDates.map(d => \`\${d.substring(0,4)}-\${d.substring(4,6)}-\${d.substring(6,8)}\`);
        const dailyPrecips = sortedDates.map(d => parseFloat(histData.daily[d].toFixed(1)));
        
        const sortedTimes = Object.keys(histData.hourly).sort();
        const hourlyPrecips = sortedTimes.map(t => parseFloat(histData.hourly[t].toFixed(1)));

        const omForecast10d = omData[index]?.daily || {};
        const omForecast10dHourly = omData[index]?.hourly || {};

        return {
            lat: lat,
            lon: lons[index],
            name: locName,
            current: {
                temp: omData[index]?.current?.temperature_2m,
                precip: 0
            },
            historyTotal: parseFloat(histData.total.toFixed(1)),
            dailyDates: dailyDates,
            dailyPrecips: dailyPrecips,
            historyHourlyTimes: sortedTimes,
            historyHourlyPrecips: hourlyPrecips,
            forecast24h: kmaForecast,
            forecast10d: omForecast10d,
            forecast10dHourly: omForecast10dHourly
        };
    });
    
    return JSON.stringify(mergedResults);
}`;

code = code.replace(getMergedRegex, newGetMerged);

// 3. Append updatePastPrecipitationCache if not present
if (!code.includes('function updatePastPrecipitationCache()')) {
    const pastCode = `\n\n/**\n * [배치 작업] 1시간마다 실행되어 15개 지역 전체 하위 AWS 관측소 14일치 데이터를 구글 시트에 캐싱\n */\nfunction updatePastPrecipitationCache() {\n    const scriptProps = PropertiesService.getScriptProperties();\n    const apiHubKey = scriptProps.getProperty('KMA_API_HUB_KEY');\n    if (!apiHubKey) {\n        Logger.log('KMA_API_HUB_KEY is not set.');\n        return;\n    }\n\n    let ss;\n    try {\n        ss = SpreadsheetApp.getActiveSpreadsheet();\n    } catch(e) {\n        Logger.log('Cannot get Active Spreadsheet (must be bound to a Google Sheet).');\n        return;\n    }\n    \n    let sheet = ss.getSheetByName('과거강수량_Cache');\n    if (!sheet) {\n        sheet = ss.insertSheet('과거강수량_Cache');\n    }\n\n    const formatKmaTime = (d) => {\n        const yyyy = d.getFullYear();\n        const mm = String(d.getMonth() + 1).padStart(2, '0');\n        const dd = String(d.getDate()).padStart(2, '0');\n        const hh = String(d.getHours()).padStart(2, '0');\n        return \`\${yyyy}\${mm}\${dd}\${hh}00\`;\n    };\n\n    const eDate = new Date();\n    const sDate = new Date();\n    sDate.setDate(sDate.getDate() - 14);\n    sDate.setHours(0, 0, 0, 0);\n\n    const tm1 = formatKmaTime(sDate);\n    const tm2 = formatKmaTime(eDate);\n\n    const requests = [];\n    const stationMeta = [];\n\n    for (const city in KMA_AWS_STATIONS) {\n        for (const stationName in KMA_AWS_STATIONS[city]) {\n            const stnCode = KMA_AWS_STATIONS[city][stationName];\n            requests.push({\n                url: \`https://apihub.kma.go.kr/api/typ01/url/awsh.php?tm1=\${tm1}&tm2=\${tm2}&stn=\${stnCode}&help=0&authKey=\${apiHubKey}\`,\n                muteHttpExceptions: true\n            });\n            stationMeta.push({ city, stationName, stnCode });\n        }\n    }\n\n    Logger.log(\`총 \${requests.length}개 관측소 데이터 요청 시작...\`);\n    \n    const chunkSize = 30;\n    let allResponses = [];\n    for (let i = 0; i < requests.length; i += chunkSize) {\n        const chunk = requests.slice(i, i + chunkSize);\n        const responses = UrlFetchApp.fetchAll(chunk);\n        allResponses = allResponses.concat(responses);\n        Utilities.sleep(500);\n    }\n\n    const rows = [];\n    rows.push(['지역명(City)', '관측소명(Station)', 'STN번호', '관측일시', '1시간누적강수량']);\n\n    for (let i = 0; i < allResponses.length; i++) {\n        const meta = stationMeta[i];\n        try {\n            const text = allResponses[i].getContentText();\n            const lines = text.split('\n');\n            lines.forEach(line => {\n                if (line.startsWith('#') || line.trim() === '') return;\n                const parts = line.trim().split(/\\s+/);\n                if (parts.length >= 10) {\n                    const timeStr = parts[0]; \n                    const rn1hrStr = parts[6];\n                    \n                    if (timeStr && timeStr.length === 12 && rn1hrStr && rn1hrStr !== '-9.0' && rn1hrStr !== '-99.0' && rn1hrStr !== '-999') {\n                        const rn1hr = parseFloat(rn1hrStr) || 0;\n                        if (rn1hr >= 0) {\n                            const y = timeStr.substring(0, 4);\n                            const m = timeStr.substring(4, 6);\n                            const d = timeStr.substring(6, 8);\n                            const h = timeStr.substring(8, 10);\n                            const isoTime = \`\${y}-\${m}-\${d}T\${h}:00\`;\n                            \n                            rows.push([meta.city, meta.stationName, meta.stnCode, isoTime, rn1hr]);\n                        }\n                    }\n                }\n            });\n        } catch (e) {\n            Logger.log(\`파싱 에러 [\${meta.city} - \${meta.stationName}]: \${e.message}\`);\n        }\n    }\n\n    sheet.clear();\n    if (rows.length > 0) {\n        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);\n    }\n    Logger.log(\`구글 시트 적재 완료. 총 \${rows.length - 1}행 저장.\`);\n}`;
    code += pastCode;
}

fs.writeFileSync('src/Code.gs', code);
