const fs = require('fs');
let c = fs.readFileSync('src/Code.gs', 'utf8');

c = c.replace(
    'daily=precipitation_sum&timezone=Asia/Seoul&forecast_days=10',
    'hourly=precipitation&timezone=Asia/Seoul&forecast_days=10'
);

c = c.replace(
    '["시군", "관측소명", "날짜", "예상일강수량(mm)"]',
    '["시군", "관측소명", "예측일시(시간별)", "예상강수량(mm)"]'
);

c = c.replace(/locData\.daily/g, 'locData.hourly');
c = c.replace(/locData\.hourly\.precipitation_sum/g, 'locData.hourly.precipitation');

fs.writeFileSync('src/Code.gs', c);
console.log('Patched Code.gs for hourly open meteo data');
