const fs = require('fs');
let c = fs.readFileSync('src/Code.gs', 'utf8');

const timeStampLogic = `
    // 마지막 갱신 시각 기록
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now - tzOffset)).toISOString().replace(/T/, ' ').replace(/\..+/, '');
    sheet.getRange('F1').setValue('[마지막 갱신 시각: ' + localISOTime + ']');
`;

c = c.replace(/sheet\.getRange\(2, 1, sheetData\.length, 4\)\.setValues\(sheetData\);/, `sheet.getRange(2, 1, sheetData.length, 4).setValues(sheetData);` + timeStampLogic);

c = c.replace(/sheet\.getRange\(1, 1, rows\.length, rows\[0\]\.length\)\.setValues\(rows\);/, `sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);` + timeStampLogic);

c = c.replace(/sheet\.getRange\(1, 1, sheetData\.length, 4\)\.setValues\(sheetData\);/, `sheet.getRange(1, 1, sheetData.length, 4).setValues(sheetData);` + timeStampLogic);

fs.writeFileSync('src/Code.gs', c);
console.log('Patched Code.gs with timestamp logic');
