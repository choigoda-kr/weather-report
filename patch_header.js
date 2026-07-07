const fs = require('fs');
let c = fs.readFileSync('src/JS_Logic.html', 'utf8');

// Add isStale icon to JS_Logic.html renderCards()
c = c.replace(/onclick='window\.openSubRegionModal\(\"\$\{data\.id\}\", \"\$\{data\.name\}\"\)'>([\s\S]*?)\$\{data\.name\}([\s\S]*?)<\/h2>/, 
  `onclick='window.openSubRegionModal("\${data.id}", "\${data.name}")'>
            \${data.name} <i class="fa-solid fa-circle-chevron-down text-sm opacity-30 group-hover/title:opacity-100 transition-opacity"></i>
            \${data.isStale ? \`<i class="fa-solid fa-triangle-exclamation text-red-500 text-sm ml-1" title="캐시 지연: \${data.lastUpdated}"></i>\` : ''}
          </h2>`);

fs.writeFileSync('src/JS_Logic.html', c);
console.log('Replaced JS_Logic.html header');

// Add isStale icon to JS_UI.html openSubRegionModal()
let ui = fs.readFileSync('src/JS_UI.html', 'utf8');
ui = ui.replace(/<h3 class="text-lg md:text-xl font-bold tracking-tight text-\[#1D1D1F\] md:text-white\/90 flex items-center gap-1.5">([\s\S]*?)\$\{loc\.name\}([\s\S]*?)<\/h3>/, 
  `<h3 class="text-lg md:text-xl font-bold tracking-tight text-[#1D1D1F] md:text-white/90 flex items-center gap-1.5">
                      \${loc.name}
                      \${loc.isStale ? \`<i class="fa-solid fa-triangle-exclamation text-red-500 text-sm ml-1" title="캐시 지연: \${loc.lastUpdated}"></i>\` : ''}
                    </h3>`);

fs.writeFileSync('src/JS_UI.html', ui);
console.log('Replaced JS_UI.html header');
