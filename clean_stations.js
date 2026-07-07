const fs = require('fs');
let c = fs.readFileSync('src/Code.gs', 'utf8');
const toRemove = ['청운', '전곡', '가산', '연평도', '삼죽', '서운'];
toRemove.forEach(name => {
    // Remove from KMA_AWS_STATIONS (e.g. "청운": "564", or "청운": "564")
    const regex1 = new RegExp('\"' + name + '\"\\s*:\\s*\"\\d+\",?\\s*', 'g');
    c = c.replace(regex1, '');
    // Remove from KMA_FORECAST_GRIDS (e.g. "청운": {...}, )
    const regex2 = new RegExp('\"' + name + '\"\\s*:\\s*\\{[^}]+\\},?\\s*', 'g');
    c = c.replace(regex2, '');
});
fs.writeFileSync('src/Code.gs', c);

let j = fs.readFileSync('src/JS_Data.html', 'utf8');
const toRemoveJS = ['yp_cheongun', 'yc_jeongok', 'pc_gasan', 'oj_yeonpyeong', 'as_samjuk', 'as_seoun'];
toRemoveJS.forEach(id => {
    const regex = new RegExp('\\s*\\{\\s*id:\\s*\'' + id + '\'[^}]+\\},?\\s*', 'g');
    j = j.replace(regex, '');
});
fs.writeFileSync('src/JS_Data.html', j);
