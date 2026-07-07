const fs = require('fs');

const func = `

/**
 * 10일 중기예보(Open-Meteo) 구글 시트 캐싱 배치 함수
 */
function updateOpenMeteoCache() {
    const stnNames = Object.keys(OPEN_METEO_COORDS);
    Logger.log("총 " + stnNames.length + "개 관측소 Open-Meteo 데이터 요청 시작...");
    
    // Open-Meteo는 한 번에 여러 위경도를 요청할 수 있음
    const lats = stnNames.map(name => OPEN_METEO_COORDS[name].lat).join(',');
    const lons = stnNames.map(name => OPEN_METEO_COORDS[name].lon).join(',');
    
    const url = \`https://api.open-meteo.com/v1/forecast?latitude=\${lats}&longitude=\${lons}&daily=precipitation_sum&timezone=Asia/Seoul&forecast_days=10\`;
    
    let response;
    try {
        response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    } catch(e) {
        Logger.log("Open-Meteo API 호출 실패: " + e.toString());
        return;
    }
    
    const code = response.getResponseCode();
    if (code !== 200) {
        Logger.log("Open-Meteo API 에러: " + code + " - " + response.getContentText());
        return;
    }
    
    let json;
    try {
        json = JSON.parse(response.getContentText());
    } catch(e) {
        Logger.log("Open-Meteo JSON 파싱 실패");
        return;
    }
    
    // 만약 1개의 지점만 요청했다면 배열이 아니라 단일 객체로 리턴되므로 배열로 묶어줌
    if (!Array.isArray(json)) {
        json = [json];
    }
    
    let ss;
    try {
        ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch(e) {
        Logger.log("시트에 연결할 수 없습니다. " + e.toString());
        return;
    }
    
    let sheet = ss.getSheetByName('중기예보_Cache');
    if (!sheet) {
        sheet = ss.insertSheet('중기예보_Cache');
    }
    sheet.clear();
    
    // 시군 매핑을 위해 KMA_AWS_STATIONS 뒤집기
    const stnToCity = {};
    for (const city in KMA_AWS_STATIONS) {
        for (const stn in KMA_AWS_STATIONS[city]) {
            stnToCity[stn] = city;
        }
    }
    
    const sheetData = [];
    sheetData.push(["시군", "관측소명", "날짜", "예상일강수량(mm)"]);
    
    json.forEach((locData, index) => {
        const stnName = stnNames[index];
        const city = stnToCity[stnName] || "";
        
        if (locData && locData.daily && locData.daily.time) {
            const times = locData.daily.time;
            const precip = locData.daily.precipitation_sum;
            
            for (let i = 0; i < times.length; i++) {
                const dateStr = times[i]; // "YYYY-MM-DD"
                const pcpValue = precip[i] !== null ? precip[i] : 0;
                sheetData.push([city, stnName, dateStr, pcpValue]);
            }
        }
    });
    
    if (sheetData.length > 1) {
        sheet.getRange(1, 1, sheetData.length, 4).setValues(sheetData);
        Logger.log("구글 시트 적재 완료. 총 " + (sheetData.length - 1) + "행 저장.");
    } else {
        Logger.log("저장할 중기예보 데이터가 없습니다.");
    }
}
`;

fs.appendFileSync('src/Code.gs', func, 'utf8');
console.log('Appended updateOpenMeteoCache to Code.gs');
