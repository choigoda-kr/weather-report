const fs = require('fs');

// KMA Grid to Lat/Lon conversion
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

    let rs = {};
    if (code === "toLL") { // grid to lat/lon
        rs.x = v1;
        rs.y = v2;
        let xn = v1 - XO;
        let yn = ro - v2 + YO;
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
            } else {
                theta = Math.atan2(xn, yn);
            }
        }
        let alon = theta / sn + olon;
        rs.lat = alat * RADDEG;
        rs.lon = alon * RADDEG;
    }
    return rs;
}

let c = fs.readFileSync('src/Code.gs', 'utf8');
let m = c.match(/const KMA_FORECAST_GRIDS = (\{[\s\S]*?\});/);
if (m) {
    let grids = eval('(' + m[1] + ')');
    let coords = {};
    for(let city in grids) {
        for(let stn in grids[city]) {
            let g = grids[city][stn];
            let ll = dfs_xy_conv("toLL", g.nx, g.ny);
            // Round to 4 decimal places
            coords[stn] = {
                lat: Math.round(ll.lat * 10000) / 10000,
                lon: Math.round(ll.lon * 10000) / 10000
            };
        }
    }
    
    // Remove old OPEN_METEO_COORDS if exists
    c = c.replace(/const OPEN_METEO_COORDS = \{[\s\S]*?\};\n\n/g, '');
    
    c = 'const OPEN_METEO_COORDS = ' + JSON.stringify(coords, null, 4) + ';\n\n' + c;
    fs.writeFileSync('src/Code.gs', c);
    console.log('Successfully generated OPEN_METEO_COORDS from GRIDS!');
}
