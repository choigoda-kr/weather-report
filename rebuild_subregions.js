const fs = require('fs');

let codeGs = fs.readFileSync('src/Code.gs', 'utf8');
let kmaMatch = codeGs.match(/const KMA_AWS_STATIONS = (\{[\s\S]*?\});/);
let kmaData = eval('(' + kmaMatch[1] + ')');

let coordMatch = codeGs.match(/const OPEN_METEO_COORDS = (\{[\s\S]*?\});/);
let coords = eval('(' + coordMatch[1] + ')');

let jsLogic = fs.readFileSync('src/JS_Logic.html', 'utf8');
let locMatch = jsLogic.match(/const locations = (\[[\s\S]*?\]);/);
let locations = eval('(' + locMatch[1] + ')');

// Create map from Korean City Name to English ID
let cityToId = {};
locations.forEach(loc => {
  cityToId[loc.name] = loc.id;
});

let newSubData = {};

for (let krCity in kmaData) {
    let enId = cityToId[krCity];
    if (!enId) continue;
    
    newSubData[enId] = [];
    
    for (let stn in kmaData[krCity]) {
        // Skip the main city station (including 백령도 for 옹진)
        if (stn === krCity || (krCity === '옹진' && stn === '백령도')) continue;
        
        let c = coords[stn];
        if (c) {
            newSubData[enId].push({
                id: enId + '_' + stn,
                name: stn, // Frontend name is now exactly the KMA station name (e.g. "금사")
                matchName: stn,
                lat: c.lat,
                lon: c.lon
            });
        }
    }
}

let jsData = fs.readFileSync('src/JS_Data.html', 'utf8');
let newSubStr = 'window.subRegionsData = ' + JSON.stringify(newSubData, null, 2) + ';';
jsData = jsData.replace(/window\.subRegionsData = \{[\s\S]*?\};/, newSubStr);
fs.writeFileSync('src/JS_Data.html', jsData);

console.log('Successfully rebuilt subRegionsData from scratch!');
let count = 0;
for (let k in newSubData) count += newSubData[k].length;
console.log('Total sub-regions built:', count);
