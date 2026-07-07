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

function dfs_xy_conv(code, v1, v2) {
    const RE = 6371.00877; 
    const GRID = 5.0;      
    const SLAT1 = 30.0;    
    const SLAT2 = 60.0;    
    const OLON = 126.0;    
    const OLAT = 38.0;     
    const XO = 43;         
    const YO = 136;        
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
    }
    return rs;
}

const subCode = fs.readFileSync('sub_regions.js', 'utf8').replace('window.subRegionsData =', 'global.subRegionsData =');
eval(subCode);

const FORECAST_GRIDS = {};

// Create a flat map of all sub regions
const allSubs = [];
for (const city in subRegionsData) {
    for (const sub of subRegionsData[city]) {
        allSubs.push(sub);
    }
}

// Map them
for (const city in KMA_AWS_STATIONS) {
    FORECAST_GRIDS[city] = {};
    for (const station in KMA_AWS_STATIONS[city]) {
        let match = allSubs.find(s => s.name.startsWith(station) || station.startsWith(s.name.replace(/동$|면$|읍$|구$/, '')));
        if (!match) {
             if (station === "용문산") match = allSubs.find(s => s.name === "용문면");
             if (station === "도리도") match = allSubs.find(s => s.name === "서신면");
             if (station === "제부도") match = allSubs.find(s => s.name === "서신면");
             if (station === "도라산") match = allSubs.find(s => s.name === "장단면");
             if (station === "볼음도") match = allSubs.find(s => s.name === "서도면");
             if (station === "주교") match = allSubs.find(s => s.name === "덕양구");
             if (station === "능곡") match = allSubs.find(s => s.name === "일산동구");
             if (station === "벽제") match = allSubs.find(s => s.name === "덕양구");
             if (station === "신도") match = allSubs.find(s => s.name === "덕양구");
             if (station === "진동" && city==="파주") match = allSubs.find(s => s.name === "장단면");
        }
        if (match) {
            const grid = dfs_xy_conv("toXY", match.lat, match.lon);
            FORECAST_GRIDS[city][station] = { nx: grid.x, ny: grid.y };
        } else {
            console.log("Fallback to first subregion for", city, station);
            const first = allSubs.find(s => s.id.startsWith(city === "여주" ? "yj_" : city === "이천" ? "ic_" : city === "화성" ? "hs_" : city === "수원" ? "sw_" : city === "고양" ? "gy_" : city === "평택" ? "pt_" : "_XXX_"));
            if (first) {
                const grid = dfs_xy_conv("toXY", first.lat, first.lon);
                FORECAST_GRIDS[city][station] = { nx: grid.x, ny: grid.y };
            }
        }
    }
}

fs.writeFileSync('grids.json', JSON.stringify(FORECAST_GRIDS, null, 4));
console.log("Done");
