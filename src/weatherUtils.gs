/**
 * 기상청 단기예보 격자(X, Y) 변환 함수 (LCC DFS 좌표변환)
 * @param {string} code - "toXY" (위경도->좌표) 또는 "toLL" (좌표->위경도)
 * @param {number} v1 - lat 또는 X
 * @param {number} v2 - lon 또는 Y
 * @returns {object} {lat, lng, x, y}
 */
function dfs_xy_conv(code, v1, v2) {
    const RE = 6371.00877; // 지구 반경(km)
    const GRID = 5.0;      // 격자 간격(km)
    const SLAT1 = 30.0;    // 투영 위도1(degree)
    const SLAT2 = 60.0;    // 투영 위도2(degree)
    const OLON = 126.0;    // 기준점 경도(degree)
    const OLAT = 38.0;     // 기준점 위도(degree)
    const XO = 43;         // 기준점 X좌표(GRID)
    const YO = 136;        // 기준점 Y좌표(GRID)

    const DEGRAD = Math.PI / 180.0;
    const RADDEG = 180.0 / Math.PI;

    const re = RE / GRID;
    const slat1 = SLAT1 * DEGRAD;
    const slat2 = SLAT2 * DEGRAD;
    const olon = OLON * DEGRAD;
    const olat = OLAT * DEGRAD;

    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = re * sf / Math.pow(ro, sn);

    const rs = {};
    if (code === "toXY") {
        rs.lat = v1;
        rs.lng = v2;
        let ra = Math.tan(Math.PI * 0.25 + (v1) * DEGRAD * 0.5);
        ra = re * sf / Math.pow(ra, sn);
        let theta = v2 * DEGRAD - olon;
        if (theta > Math.PI) theta -= 2.0 * Math.PI;
        if (theta < -Math.PI) theta += 2.0 * Math.PI;
        theta *= sn;
        rs.x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
        rs.y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
    } else {
        rs.x = v1;
        rs.y = v2;
        const xn = v1 - XO;
        const yn = ro - v2 + YO;
        let ra = Math.sqrt(xn * xn + yn * yn);
        if (sn < 0.0) -ra;
        let alat = Math.pow((re * sf / ra), (1.0 / sn));
        alat = 2.0 * Math.atan(alat) - Math.PI * 0.5;

        let theta = 0.0;
        if (Math.abs(xn) <= 0.0) {
            theta = 0.0;
        } else {
            if (Math.abs(yn) <= 0.0) {
                theta = Math.PI * 0.5;
                if (xn < 0.0) -theta;
            } else theta = Math.atan2(xn, yn);
        }
        const alon = theta / sn + olon;
        rs.lat = alat * RADDEG;
        rs.lng = alon * RADDEG;
    }
    return rs;
}

/**
 * 기상청 API 호출용 날짜/시간(base_date, base_time) 생성 함수
 */
function getKmaBaseDateTime() {
    const now = new Date();
    // UTC -> KST 변환 (GAS 서버 시간이 다를 수 있으므로)
    const kstNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 3600000));
    
    // 초단기실황은 매시간 40분에 생성되므로, 40분 이전이면 이전 시간 사용
    let year = kstNow.getFullYear();
    let month = ('0' + (kstNow.getMonth() + 1)).slice(-2);
    let day = ('0' + kstNow.getDate()).slice(-2);
    let hours = kstNow.getHours();
    let minutes = kstNow.getMinutes();

    if (minutes < 40) {
        hours = hours - 1;
        if (hours < 0) {
            hours = 23;
            kstNow.setDate(kstNow.getDate() - 1);
            year = kstNow.getFullYear();
            month = ('0' + (kstNow.getMonth() + 1)).slice(-2);
            day = ('0' + kstNow.getDate()).slice(-2);
        }
    }
    const baseDate = `${year}${month}${day}`;
    const baseTime = ('0' + hours).slice(-2) + '00';

    return { baseDate, baseTime };
}

/**
 * 기상청 단기예보(getVilageFcst) 호출용 날짜/시간(base_date, base_time) 생성 함수
 * 단기예보는 0200, 0500, 0800, 1100, 1400, 1700, 2000, 2300 에 생성 (발표는 각 시간 10분 후)
 */
function getKmaFcstBaseDateTime() {
    const now = new Date();
    // UTC -> KST 변환
    const kstNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 3600000));
    
    let hours = kstNow.getHours();
    let minutes = kstNow.getMinutes();

    let timeNum = hours * 100 + minutes;
    let baseTimeHour;

    if (timeNum < 210) {
        baseTimeHour = 23; // 전날 23:00
        kstNow.setDate(kstNow.getDate() - 1);
    } else if (timeNum < 510) baseTimeHour = 2;
    else if (timeNum < 810) baseTimeHour = 5;
    else if (timeNum < 1110) baseTimeHour = 8;
    else if (timeNum < 1410) baseTimeHour = 11;
    else if (timeNum < 1710) baseTimeHour = 14;
    else if (timeNum < 2010) baseTimeHour = 17;
    else if (timeNum < 2310) baseTimeHour = 20;
    else baseTimeHour = 23; // 당일 23:00

    let year = kstNow.getFullYear();
    let month = ('0' + (kstNow.getMonth() + 1)).slice(-2);
    let day = ('0' + kstNow.getDate()).slice(-2);

    const baseDate = `${year}${month}${day}`;
    const baseTime = ('0' + baseTimeHour).slice(-2) + '00';

    return { baseDate, baseTime };
}
