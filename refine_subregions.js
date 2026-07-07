const fs = require('fs');

let codeGs = fs.readFileSync('src/Code.gs', 'utf8');
let kmaMatch = codeGs.match(/const KMA_AWS_STATIONS = (\{[\s\S]*?\});/);
let kmaData = eval('(' + kmaMatch[1] + ')');

let jsLogic = fs.readFileSync('src/JS_Logic.html', 'utf8');
let locMatch = jsLogic.match(/const locations = (\[[\s\S]*?\]);/);
let locations = eval('(' + locMatch[1] + ')');

// Create a map from English ID to Korean City Name
let idToCity = {};
locations.forEach(loc => {
  idToCity[loc.id] = loc.name;
});

let jsData = fs.readFileSync('src/JS_Data.html', 'utf8');
let subMatch = jsData.match(/window\.subRegionsData = (\{[\s\S]*?\});/);
let subData = eval('(' + subMatch[1] + ')');

let newSubData = {};

for (let enId in subData) {
    let krCity = idToCity[enId];
    if (!krCity || !kmaData[krCity]) {
        console.log('Skipping city:', enId, krCity);
        continue;
    }
    
    newSubData[enId] = [];
    
    let allowedStns = Object.keys(kmaData[krCity]);
    // Remove the main city itself (e.g. "여주") if it exists, as it's the representative station
    allowedStns = allowedStns.filter(stn => stn !== krCity);
    
    let subList = subData[enId];
    
    allowedStns.forEach(stn => {
        // Find matching subRegion
        let match = subList.find(s => s.name.startsWith(stn));
        if (match) {
            match.matchName = stn;
            newSubData[enId].push(match);
        } else {
            console.log('WARNING: Could not find subregion for', krCity, stn);
        }
    });
}

let newSubStr = 'window.subRegionsData = ' + JSON.stringify(newSubData, null, 2) + ';';
jsData = jsData.replace(/window\.subRegionsData = \{[\s\S]*?\};/, newSubStr);
fs.writeFileSync('src/JS_Data.html', jsData);

console.log('Successfully refined subRegionsData!');
let count = 0;
for (let k in newSubData) count += newSubData[k].length;
console.log('Total sub-regions kept:', count);
