/**
 * 기상청 및 Open-Meteo API 병렬 호출을 통한 하이브리드 날씨 데이터 획득
 * @param {string} latStr - 콤마로 구분된 위도 문자열 (예: "37.5665,35.1796")
 * @param {string} lonStr - 콤마로 구분된 경도 문자열 (예: "126.9780,129.0756")
 * @param {string} locNamesStr - 콤마로 구분된 지역명 문자열 (예: "과천,여주")
 * @param {string} startDateStr - 조회 시작일 (예: "2026-06-19")
 * @param {string} endDateStr - 조회 종료일 (예: "2026-06-22")
 * @returns {string} - JSON 형태의 통합 기상 데이터 문자열
 */
function getMergedWeatherData(latStr, lonStr, locNamesStr, startDateStr, endDateStr) {
    const lats = latStr.split(',');
    const lons = lonStr.split(',');
    const locNames = locNamesStr ? locNamesStr.split(',') : [];
    
    // KMA API Key (Script Properties에서 로드)
    const scriptProps = PropertiesService.getScriptProperties();
    const kmaApiKey = scriptProps.getProperty('KMA_API_KEY');
    const awsApiKey = scriptProps.getProperty('GG_AWS_API_KEY') || "4669acbc5df0400cb20cd2b1967487bd";
    
    if (!kmaApiKey) {
        throw new Error('KMA_API_KEY is not set in Script Properties.');
    }
    
    const { baseDate, baseTime } = getKmaBaseDateTime();
    const { baseDate: fcstBaseDate, baseTime: fcstBaseTime } = getKmaFcstBaseDateTime();
    const requests = [];
    
    // 1. Open-Meteo 요청 생성
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lonStr}&current=weather_code,temperature_2m&hourly=precipitation&daily=precipitation_sum&timezone=Asia%2FSeoul&past_days=0&forecast_days=10`;
    requests.push({ url: omUrl, muteHttpExceptions: true });
    
    // 2. KMA 초단기실황 및 단기예보 요청
    lats.forEach((lat, i) => {
        const lon = lons[i];
        const grid = dfs_xy_conv("toXY", parseFloat(lat), parseFloat(lon));
        
        const ncstUrl = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${kmaApiKey}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${grid.x}&ny=${grid.y}`;
        const fcstUrl = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${kmaApiKey}&pageNo=1&numOfRows=300&dataType=JSON&base_date=${fcstBaseDate}&base_time=${fcstBaseTime}&nx=${grid.x}&ny=${grid.y}`;
        
        requests.push({ url: ncstUrl, muteHttpExceptions: true });
        requests.push({ url: fcstUrl, muteHttpExceptions: true });
    });

    // 3. KMA API Hub (과거 기간 일자별 전체 조회)
    const awsStartIdx = requests.length;
    const KMA_STN_MAP = {
        "과천": "590", "여주": "465", "이천": "203", "양평": "202",
        "화성": "488", "수원": "119", "연천": "491", "포천": "473",
        "파주": "99", "고양": "540", "강화": "201", "옹진": "102",
        "김포": "441", "평택": "356", "안성": "470"
    };
    
    // YYYYMMDDHHMI format
    const formatKmaTime = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        return `${yyyy}${mm}${dd}${hh}00`;
    };

    const apiHubKey = PropertiesService.getScriptProperties().getProperty('KMA_API_KEY');
    let tm1 = "", tm2 = "";
    
    if (startDateStr && endDateStr) {
        const sDate = new Date(startDateStr);
        sDate.setHours(0, 0, 0, 0);
        const eDate = new Date(endDateStr);
        eDate.setHours(23, 0, 0, 0);
        
        tm1 = formatKmaTime(sDate);
        tm2 = formatKmaTime(eDate);
        
        locNames.forEach(locName => {
            const stn = KMA_STN_MAP[locName] || "108"; // default seoul
            requests.push({
                url: `https://apihub.kma.go.kr/api/typ01/url/awsh.php?tm1=${tm1}&tm2=${tm2}&stn=${stn}&help=0&authKey=${apiHubKey}`,
                muteHttpExceptions: true
            });
        });
    }
    
    // 병렬 호출
    const responses = UrlFetchApp.fetchAll(requests);
    
    // OM 파싱
    const omResponseText = responses[0].getContentText();
    let omData = JSON.parse(omResponseText);
    if (!Array.isArray(omData)) {
        if (omData.error) throw new Error(`Open-Meteo Error: ${omData.reason}`);
        omData = [omData];
    }
    
    // KMA API Hub 데이터 파싱 및 매핑
    const locHistData = {}; // locName -> { daily: {}, hourly: {}, total: 0 }
    locNames.forEach(name => {
        locHistData[name] = { daily: {}, hourly: {}, total: 0 };
    });
    
    for(let i = awsStartIdx; i < responses.length; i++) {
        const locName = locNames[i - awsStartIdx];
        try {
            const text = responses[i].getContentText();
            const lines = text.split('\n');
            lines.forEach(line => {
                if (line.startsWith('#') || line.trim() === '') return;
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 10) {
                    const timeStr = parts[0]; 
                    const rn1hrStr = parts[6];
                    
                    if (timeStr && timeStr.length === 12 && rn1hrStr && rn1hrStr !== '-9.0' && rn1hrStr !== '-99.0' && rn1hrStr !== '-999') {
                        const rn1hr = parseFloat(rn1hrStr) || 0;
                        if (rn1hr >= 0) { 
                            const dateKey = timeStr.substring(0, 8); 
                            const hourKey = timeStr.substring(8, 10); 
                            
                            locHistData[locName].total += rn1hr;
                            if (!locHistData[locName].daily[dateKey]) locHistData[locName].daily[dateKey] = 0;
                            locHistData[locName].daily[dateKey] += rn1hr;
                            
                            const isoTime = `${dateKey.substring(0,4)}-${dateKey.substring(4,6)}-${dateKey.substring(6,8)}T${hourKey}:00`;
                            locHistData[locName].hourly[isoTime] = rn1hr;
                        }
                    }
                }
            });
        } catch(e) {}
    }

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
        const kmaForecast = extractKmaFcst24h(fcstData);
        const omForecast10d = omData[index]?.daily || {};
        const omForecast10dHourly = omData[index]?.hourly || {};
        
        const locName = locNames[index];
        const histData = locHistData[locName];
        
        // 날짜/시간 정렬 및 추출
        const sortedDates = Object.keys(histData.daily).sort();
        const dailyDates = sortedDates.map(d => `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`);
        const dailyPrecips = sortedDates.map(d => parseFloat(histData.daily[d].toFixed(1)));
        
        const sortedTimes = Object.keys(histData.hourly).sort();
        const hourlyTimes = sortedTimes;
        const hourlyPrecips = sortedTimes.map(t => parseFloat(histData.hourly[t].toFixed(1)));

        return {
            lat: lat,
            lon: lons[index],
            name: locName,
            current: {
                temp: kmaCurrent.T1H !== undefined ? kmaCurrent.T1H : omData[index]?.current?.temperature_2m,
                precip: kmaCurrent.RN1 !== undefined ? kmaCurrent.RN1 : 0
            },
            historyTotal: parseFloat(histData.total.toFixed(1)),
            dailyDates: dailyDates,
            dailyPrecips: dailyPrecips,
            historyHourlyTimes: hourlyTimes,
            historyHourlyPrecips: hourlyPrecips,
            forecast24h: kmaForecast,
            forecast10d: omForecast10d,
            forecast10dHourly: omForecast10dHourly
        };
    });
    
    return JSON.stringify(mergedResults);
}

function extractKmaNcst(data) {
    const result = {};
    if (data && data.response && data.response.body && data.response.body.items) {
        data.response.body.items.item.forEach(i => {
            if (i.category === 'T1H') result.T1H = parseFloat(i.obsrValue); // 기온
            if (i.category === 'RN1') result.RN1 = parseFloat(i.obsrValue); // 1시간 강수량
        });
    }
    return result;
}

function extractKmaFcst24h(data) {
    const result = { precip_hourly: [] };
    if (data && data.response && data.response.body && data.response.body.items) {
        // 향후 24시간 필터링 등 로직 포함 (간소화)
        data.response.body.items.item.forEach(i => {
            if (i.category === 'PCP') { // 1시간 강수량
                result.precip_hourly.push({
                    date: i.fcstDate,
                    time: i.fcstTime,
                    value: i.fcstValue
                });
            }
        });
    }
    return result;
}

/**
 * [테스트용 함수]
 * GAS 에디터에서 '실행' 버튼으로 테스트해 보시려면 이 함수를 선택해서 실행해 주세요!
 */
function test_getMergedWeatherData() {
    // 서울시청 주변 임의의 위경도를 세팅하여 백엔드 로직 테스트
    const testLat = "37.5665";
    const testLon = "126.9780";
    
    Logger.log("테스트 데이터 통신 시작...");
    try {
        const resultJSON = getMergedWeatherData(testLat, testLon);
        Logger.log("통신 성공! 결과 데이터:");
        Logger.log(resultJSON);
    } catch (e) {
        Logger.log("에러 발생: " + e.message);
    }
}


function doGet(e) {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('재난 모니터링 대시보드')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 프론트엔드 자바스크립트를 템플릿 엔진 파싱 없이 브라우저로 직접 쏘아주기 위한 비동기 통신 함수
 */
function test_aws_api2() {
    const res = getMergedWeatherData("37.4292", "126.9877", "과천", "2026-06-11", "2026-06-24");
    Logger.log(res);
}

function getJSCode() {
  var data = HtmlService.createHtmlOutputFromFile('JS_Data').getContent();
  var logic = HtmlService.createHtmlOutputFromFile('JS_Logic').getContent();
  var ui = HtmlService.createHtmlOutputFromFile('JS_UI').getContent();
  
  // <script> 와 </script> 껍데기를 모두 벗겨내고 순수 자바스크립트 텍스트만 합쳐서 반환
  var regex = /<script\b[^>]*>|<\/script>/gi;
  var pureJs = data.replace(regex, '') + '\n' + logic.replace(regex, '') + '\n' + ui.replace(regex, '');
  
  return pureJs;
}