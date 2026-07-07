const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const indexPath = path.join(srcDir, 'index.html');

let html = fs.readFileSync(indexPath, 'utf8');

// 리다이렉트 스크립트 주석 처리
html = html.replace(/window\.location\.replace/g, '// window.location.replace');

// include 구문 파싱 및 파일 내용 삽입
html = html.replace(/<\?\!=\s*include\('([^']+)'\);\s*\?>/g, (match, filename) => {
    const includePath = path.join(srcDir, `${filename}.html`);
    if (fs.existsSync(includePath)) {
        return fs.readFileSync(includePath, 'utf8');
    }
    return `<!-- Failed to include ${filename} -->`;
});

const outPath = path.join(__dirname, 'local_test.html');
fs.writeFileSync(outPath, html);
console.log(`Generated ${outPath} successfully.`);
