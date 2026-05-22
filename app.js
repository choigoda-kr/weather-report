// 1. 20개 지점 데이터 셋 구축 (광역 4개 신규 + 기존 16개 유지)
const locations = [
  { id: 'gwacheon', name: '과천', lat: 37.4292, lon: 126.9899 },
  { id: 'gyeongg_north', name: '경기북부', lat: 37.749633, lon: 127.071114 },
  { id: 'gyeongg_south', name: '경기남부', lat: 37.288951, lon: 127.053747 },
  { id: 'incheon', name: '인천', lat: 37.456060, lon: 126.705177 },
  { id: 'yeoju', name: '여주', lat: 37.2982, lon: 127.6371 },
  { id: 'icheon', name: '이천', lat: 37.2723, lon: 127.4350 },
  { id: 'yangpyeong', name: '양평', lat: 37.4913, lon: 127.4876 },
  { id: 'gwangju', name: '광주', lat: 37.4294, lon: 127.2551 },
  { id: 'hwaseong', name: '화성', lat: 37.2064, lon: 126.8320 },
  { id: 'suwon', name: '수원', lat: 37.2636, lon: 127.0286 },
  { id: 'yeoncheon', name: '연천', lat: 38.0964, lon: 127.0744 },
  { id: 'pocheon', name: '포천', lat: 37.8949, lon: 127.2003 },
  { id: 'gapyeong', name: '가평', lat: 37.8315, lon: 127.5095 },
  { id: 'paju', name: '파주', lat: 37.7599, lon: 126.7798 },
  { id: 'goyang', name: '고양', lat: 37.6584, lon: 126.8320 },
  { id: 'ganghwa', name: '강화', lat: 37.7466, lon: 126.4880 },
  { id: 'ongjin', name: '옹진', lat: 37.4465, lon: 126.1681 },
  { id: 'gimpo', name: '김포', lat: 37.6152, lon: 126.7156 },
  { id: 'pyeongtaek', name: '평택', lat: 36.9921, lon: 127.1129 },
  { id: 'anseong', name: '안성', lat: 37.0080, lon: 127.2758 }
];

// Open-Meteo WMO Code 파싱 함수
function getWeatherCondition(code) {
  switch (true) {
    case code === 0: return { text: '맑음', icon: 'fa-sun', color: 'text-amber-500 md:text-yellow-400' };
    case code === 1: return { text: '대체로 맑음', icon: 'fa-cloud-sun', color: 'text-orange-500 md:text-yellow-300' };
    case code === 2: return { text: '구름조금', icon: 'fa-cloud', color: 'text-slate-500 md:text-slate-300' };
    case code === 3: return { text: '흐림', icon: 'fa-cloud', color: 'text-slate-600 md:text-slate-400' };
    case (code >= 45 && code <= 48): return { text: '안개', icon: 'fa-smog', color: 'text-slate-500 md:text-slate-400' };
    case (code >= 51 && code <= 55): return { text: '이슬비', icon: 'fa-cloud-rain', color: 'text-blue-500 md:text-blue-300' };
    case (code >= 61 && code <= 65): return { text: '비', icon: 'fa-cloud-showers-heavy', color: 'text-blue-600 md:text-blue-500' };
    case (code >= 71 && code <= 77): return { text: '눈', icon: 'fa-snowflake', color: 'text-sky-500 md:text-white' };
    case (code >= 80 && code <= 82): return { text: '소나기', icon: 'fa-cloud-showers-water', color: 'text-blue-500 md:text-blue-400' };
    case (code >= 95 && code <= 99): return { text: '뇌우', icon: 'fa-cloud-bolt', color: 'text-indigo-600 md:text-yellow-500' };
    default: return { text: '알수없음', icon: 'fa-circle-question', color: 'text-slate-500 md:text-slate-500' };
  }
}

// 전역 Toast 메시지 함수
window.showToast = function(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  const bgColor = isError ? 'bg-red-500' : 'bg-slate-800 md:bg-blue-600';
  const icon = isError ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-circle-info"></i>';
  
  toast.className = `flex items-center gap-2 px-4 py-3 text-white text-sm font-medium rounded shadow-lg transition-all duration-300 transform translate-y-4 opacity-0 ${bgColor}`;
  toast.innerHTML = `${icon} <span>${message}</span>`;
  
  container.appendChild(toast);
  
  // 페이드인 애니메이션
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });
  
  // 3초 후 페이드아웃 및 제거
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      if(container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3000);
};

// 2. Fetch 및 Mapping 로직 구조화
async function fetchWeatherData(startDateStr, endDateStr, forceRefresh = false) {
  const CACHE_TTL = 60 * 60 * 1000; // 60분 TTL
  const cacheKey = `weather_data_v2_${startDateStr}_${endDateStr}`;
  const cached = sessionStorage.getItem(cacheKey);

  if (!forceRefresh && cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp < CACHE_TTL) {
      console.log('Using cached data for', startDateStr, 'to', endDateStr);
      updateLastTimeString();
      document.getElementById('loading-indicator').classList.add('hidden');
      return data.payload;
    }
  }

  // 로딩 상태 시작
  document.getElementById('loading-indicator').classList.remove('hidden');

  try {
    const lats = locations.map(l => l.lat).join(',');
    const lons = locations.map(l => l.lon).join(',');
    
    // API 요청 종료일을 강제로 오늘 + 7일로 확장
    const todayDate = new Date();
    const offset = todayDate.getTimezoneOffset() * 60000;
    const todayIso = (new Date(todayDate - offset)).toISOString().split('T')[0];
    
    const futureDate = new Date(todayDate);
    futureDate.setDate(futureDate.getDate() + 11);
    const futureIso = (new Date(futureDate - offset)).toISOString().split('T')[0];
    
    // Batch Request URL 생성 (past_days 완전 삭제)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=weather_code,temperature_2m&hourly=precipitation&daily=precipitation_sum&timezone=Asia%2FSeoul&start_date=${startDateStr}&end_date=${futureIso}`;
    
    console.log('Fetching Open-Meteo Data...');
    const res = await fetch(url);
    if (!res.ok) {
      // 에러 발생 시 상세 로깅 처리
      const errText = await res.text();
      console.error('\n[Open-Meteo API Error Details]');
      console.error(`- Status Code: ${res.status}`);
      console.error(`- Request URL: ${url}`);
      console.error(`- Request Start Date: ${startDateStr}`);
      console.error(`- Request End Date: ${futureIso}`);
      console.error(`- Response Body: ${errText}\n`);
      throw new Error(`API Request Failed with status ${res.status}`);
    }
    
    let results = await res.json();
    
    // 배열이 아닌 단일 객체 리턴 시 대비
    if (!Array.isArray(results)) {
       results = [results];
    }
    
    // 데이터 정규화(Mapping) 처리
    const processedData = locations.map((loc, index) => {
      const data = results[index] || {};
      
      // 기상 상태 (현재)
      const currentCode = data.current?.weather_code !== undefined ? data.current.weather_code : -1;
      const condition = getWeatherCondition(currentCode);
      
      // 현재 기온 추출 및 가공
      const currentTemp = data.current?.temperature_2m !== undefined ? data.current.temperature_2m.toFixed(1) : '-';
      
      // 기간별 강수량 합산 분리 (과거/미래)
      const dailyDates = [];
      const dailyPrecips = [];
      let historyTotal = 0;
      
      const futureDates = [];
      const futurePrecips = [];
      
      if (data.daily && data.daily.time) {
        data.daily.time.forEach((t, i) => {
          const p = data.daily.precipitation_sum[i] || 0;
          
          // 1. 선택 기간 강수량 (과거/현재 조회용)
          if (t >= startDateStr && t <= endDateStr) {
            historyTotal += p;
            dailyDates.push(t);
            dailyPrecips.push(p);
          }
          
          // 2. 향후 10일 강수량 (모달 예보용)
          if (t >= todayIso && futureDates.length < 10) {
            futureDates.push(t);
            futurePrecips.push(p);
          }
        });
      }
      const totalPrecip = historyTotal.toFixed(1);
      
      // 향후 10일 예상 강수량 합산
      const next10dPrecip = futurePrecips.reduce((sum, val) => sum + (val || 0), 0).toFixed(1);
      
      // 향후 24시간 예상 강수량 합산 및 경보 분석 (현재 시점 기준)
      const nowMs = Date.now();
      const next24hMs = nowMs + (24 * 60 * 60 * 1000);
      let next24hSum = 0;
      
      const hourlyTimes = data.hourly?.time || [];
      const hourlyPrecips = data.hourly?.precipitation || [];
      
      const targetPrecips = [];
      hourlyTimes.forEach((t, i) => {
        const timeMs = new Date(t).getTime();
        if (timeMs >= nowMs && timeMs <= next24hMs) {
          const val = hourlyPrecips[i] || 0;
          next24hSum += val;
          targetPrecips.push(val);
        }
      });
      const next24hPrecip = next24hSum.toFixed(1);
      
      // Sliding Window 1시간/3시간 경보 판별
      let alertLevel = 'none';
      for (let i = 0; i < targetPrecips.length; i++) {
        const p1 = targetPrecips[i];
        const p2 = i + 1 < targetPrecips.length ? targetPrecips[i + 1] : 0;
        const p3 = i + 2 < targetPrecips.length ? targetPrecips[i + 2] : 0;
        const sum3h = p1 + p2 + p3;
        
        if (sum3h >= 90 || p1 >= 50) {
          alertLevel = 'red';
          break; // 가장 높은 경보이므로 루프 종료
        } else if ((sum3h >= 60 || p1 >= 30) && alertLevel !== 'red') {
          alertLevel = 'orange';
        }
      }
      
      return {
        ...loc,
        condition,
        currentTemp,
        totalPrecip,
        next24hPrecip,
        next10dPrecip,
        alertLevel,
        dailyDates: dailyDates,
        dailyPrecips: dailyPrecips,
        futureDates: futureDates,
        futurePrecips: futurePrecips,
        hourlyTimes: data.hourly?.time || [],
        hourlyPrecips: data.hourly?.precipitation || []
      };
    });

    // SessionStorage 캐싱 저장
    sessionStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      payload: processedData
    }));

    document.getElementById('loading-indicator').classList.add('hidden');
    updateLastTimeString();
    
    return processedData;
    
  } catch (error) {
    console.error('[Open-Meteo Fetch Exception]', error);
    document.getElementById('loading-indicator').classList.add('hidden');
    window.showToast('최근 90일 이내의 데이터만 조회가 가능합니다.', true);
    return null;
  }
}

function updateLastTimeString() {
  const now = new Date();
  document.getElementById('last-updated').innerText = `최종 갱신: ${now.toLocaleTimeString('ko-KR')}`;
}

// 3. UI 렌더링 로직
function renderCards(dataArray) {
  const grid = document.getElementById('weather-grid');
  grid.innerHTML = '';
  
  if(!dataArray || dataArray.length === 0) return;

  // 긴급 호우 알림 검사 (50mm 이상)
  checkEmergencyRain(dataArray);

  dataArray.forEach(data => {
    let borderClass = 'border-2 border-[#EEEEEE] md:border-transparent shadow-[0_2px_10px_rgba(0,0,0,0.03)] md:shadow-none';
    if (data.alertLevel === 'red') {
      borderClass = 'border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] md:shadow-[0_0_20px_rgba(239,68,68,0.4)]';
    } else if (data.alertLevel === 'orange') {
      borderClass = 'border-2 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)] md:shadow-[0_0_20px_rgba(249,115,22,0.4)]';
    }

    const card = document.createElement('div');
    card.className = `weather-card rounded-2xl p-4 sm:p-5 pb-4 flex flex-col justify-between h-auto min-h-[12.5rem] bg-white md:bg-transparent relative overflow-hidden group ${borderClass} transition-all duration-300`;
    
    // 장식용 배경 이펙트
    const bgBlur = document.createElement('div');
    bgBlur.className = `absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity bg-current ${data.condition.color}`;
    card.appendChild(bgBlur);

    const innerContent = document.createElement('div');
    innerContent.className = 'relative z-10 flex flex-col h-full gap-1';
    
    innerContent.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <!-- 좌측: 지점명 + 지도 보기 버튼 -->
        <div class="flex items-center gap-3">
          <h2 class="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1D1F] md:text-white/90 shrink-0">${data.name}</h2>
          <button class="map-view-btn shrink-0" onclick='showMapModal(${JSON.stringify(data.name)}, ${data.lat}, ${data.lon}, ${JSON.stringify(data.condition.text)}, ${JSON.stringify(data.currentTemp)})'>
            <i class="fa-solid fa-map-location-dot"></i> 지도 보기
          </button>
        </div>
        
        <!-- 우측: 기온 + 날씨 아이콘 세트 -->
        <div class="flex items-center gap-3 sm:gap-4">
          <span class="text-xl sm:text-2xl font-bold text-[#1D1D1F] md:text-slate-200 tracking-tight shrink-0">${data.currentTemp} <span class="text-sm sm:text-base font-normal">°C</span></span>
          <div class="flex flex-col items-center shrink-0">
            <i class="fa-solid ${data.condition.icon} text-3xl sm:text-4xl ${data.condition.color} drop-shadow-sm md:drop-shadow-lg mb-1 float-animation"></i>
            <span class="text-[10px] sm:text-xs font-semibold tracking-wide uppercase ${data.condition.color} bg-slate-100 md:bg-black/20 px-2 py-0.5 rounded-full">${data.condition.text}</span>
          </div>
        </div>
      </div>
      
      <div class="space-y-3 mt-auto">
         <div class="flex justify-between items-end bg-[#F5F5F7] md:bg-slate-800/40 p-3 sm:p-2 rounded-lg border border-[#E5E5E5] md:border-slate-700/50 cursor-pointer hover:bg-[#EAEAEA] md:hover:bg-slate-700/70 transition-colors group/btn" onclick='showHistoryModal(${JSON.stringify(data.name)}, ${JSON.stringify(data.dailyDates)}, ${JSON.stringify(data.dailyPrecips)}, ${JSON.stringify(data.hourlyTimes)}, ${JSON.stringify(data.hourlyPrecips)}, ${data.totalPrecip})'>
          <span class="text-base sm:text-lg text-slate-500 md:text-slate-400 font-semibold group-hover/btn:text-[#1D1D1F] md:group-hover/btn:text-white transition-colors">선택 기간 강수량 <i class="fa-solid fa-chevron-right text-[11px] ml-0.5 opacity-50 group-hover/btn:opacity-100"></i></span>
          <div class="text-right flex items-baseline gap-1">
             <span class="text-3xl sm:text-2xl font-bold text-[#003366] md:text-blue-400 md:drop-shadow">${data.totalPrecip}</span>
             <span class="text-sm sm:text-base text-slate-400 md:text-slate-500 font-bold">mm</span>
          </div>
        </div>
        
        <div class="flex justify-between items-center px-3 py-2.5 sm:py-1.5 sm:px-2 mt-1 cursor-pointer hover:bg-slate-100 md:hover:bg-slate-800/60 rounded-lg -mx-1 transition-colors group/btn3" onclick='showNext24hModal(${JSON.stringify(data.name)}, ${JSON.stringify(data.hourlyTimes)}, ${JSON.stringify(data.hourlyPrecips)})'>
          <span class="text-base sm:text-lg text-slate-500 md:text-slate-400 font-semibold flex items-center gap-1 group-hover/btn3:text-[#1D1D1F] md:group-hover/btn3:text-white transition-colors"><i class="fa-regular fa-clock text-slate-400 md:text-slate-500 group-hover/btn3:text-sky-500"></i>향후 24시간 예상 <i class="fa-solid fa-chevron-right text-[11px] opacity-50 group-hover/btn3:opacity-100"></i></span>
          <div class="text-right flex items-baseline gap-1">
             <span class="text-3xl sm:text-2xl font-bold text-[#003366] md:text-sky-400 md:drop-shadow">${data.next24hPrecip}</span>
             <span class="text-sm sm:text-base text-slate-400 md:text-slate-500 font-bold">mm</span>
          </div>
        </div>

        <div class="flex justify-between items-center px-3 py-2.5 sm:py-1.5 sm:px-2 mt-1 cursor-pointer hover:bg-slate-100 md:hover:bg-slate-800/60 rounded-lg -mx-1 transition-colors group/btn2" onclick='showFutureModal(${JSON.stringify(data.name)}, ${JSON.stringify(data.futureDates)}, ${JSON.stringify(data.futurePrecips)}, ${JSON.stringify(data.hourlyTimes)}, ${JSON.stringify(data.hourlyPrecips)})'>
          <span class="text-base sm:text-lg text-slate-500 md:text-slate-400 font-semibold flex items-center gap-1 group-hover/btn2:text-[#1D1D1F] md:group-hover/btn2:text-white transition-colors"><i class="fa-regular fa-calendar-days text-slate-400 md:text-slate-500 group-hover/btn2:text-blue-500 md:group-hover/btn2:text-amber-400/70"></i>향후 10일 예상 <i class="fa-solid fa-chevron-right text-[11px] opacity-50 group-hover/btn2:opacity-100"></i></span>
          <div class="text-right flex items-baseline gap-1">
             <span class="text-3xl sm:text-2xl font-bold text-[#003366] md:text-amber-300 md:drop-shadow">${data.next10dPrecip}</span>
             <span class="text-sm sm:text-base text-slate-400 md:text-slate-500 font-bold">mm</span>
          </div>
        </div>
      </div>
    `;
    
    card.appendChild(innerContent);
    grid.appendChild(card);
  });
}

function checkEmergencyRain(dataArray) {
  const threshold = 50.0;
  const emergencyLogs = [];
  const affectedLocations = new Set();
  const now = Date.now();
  
  dataArray.forEach(loc => {
    if (!loc.hourlyTimes || !loc.hourlyPrecips) return;
    loc.hourlyTimes.forEach((timeStr, i) => {
      const precip = loc.hourlyPrecips[i];
      if (precip >= threshold) {
        const [datePart, timePart] = timeStr.split('T');
        const targetTime = new Date(timeStr).getTime();
        
        // 과거 데이터 제외 (현재 시각 이후만)
        if (targetTime >= now) {
          affectedLocations.add(loc.name);
          emergencyLogs.push({
            name: loc.name,
            date: datePart,
            time: timePart,
            precip: precip
          });
        }
      }
    });
  });
  
  if (emergencyLogs.length > 0) {
    const locsArray = Array.from(affectedLocations).join(', ');
    document.getElementById('emergency-modal-title').innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 긴급: ${locsArray}에 강한 호우 예상됨`;
    
    const tbody = document.getElementById('emergency-modal-tbody');
    tbody.innerHTML = '';
    
    // 시간순 정렬
    emergencyLogs.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    
    emergencyLogs.forEach(log => {
      tbody.innerHTML += `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3 font-bold text-slate-800">${log.name}</td>
          <td class="px-4 py-3 text-slate-600">${log.date}</td>
          <td class="px-4 py-3 text-slate-600">${log.time}</td>
          <td class="px-4 py-3 text-right font-mono font-bold text-red-600">${Number(log.precip).toFixed(1)}</td>
        </tr>
      `;
    });
    
    document.getElementById('emergency-modal').showModal();
  }
}

function initSkeleton() {
  const grid = document.getElementById('weather-grid');
  grid.innerHTML = '';
  // 20개의 스켈레톤 UI 생성
  for(let i=0; i<20; i++) {
    grid.innerHTML += `
      <div class="weather-card skeleton-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between h-auto min-h-[12.5rem] bg-white md:bg-slate-800/50 border border-[#EEEEEE] md:border-slate-700/30 shadow-[0_2px_10px_rgba(0,0,0,0.03)] md:shadow-none">
        <div class="flex justify-between">
          <div class="h-6 bg-slate-200 md:bg-slate-700/80 rounded w-16 mb-4"></div>
          <div class="h-10 w-10 bg-slate-200 md:bg-slate-700/80 rounded-full"></div>
        </div>
        <div class="space-y-3 mt-auto">
           <div class="h-14 bg-slate-100 md:bg-slate-700/60 rounded-lg w-full"></div>
           <div class="h-14 bg-slate-100 md:bg-slate-700/60 rounded-lg w-full"></div>
           <div class="h-14 bg-slate-100 md:bg-slate-700/60 rounded-lg w-full"></div>
        </div>
      </div>
    `;
  }
}

// 4. 모달 관련 전역 함수
window.toggleHourlyData = function(dateIndex) {
  const el = document.getElementById(`hourly-row-${dateIndex}`);
  if(el.classList.contains('hidden')) {
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
};

function generateHourlyChart(dateStr, hourlyTimes, hourlyPrecips, colorTheme) {
  const barColor = colorTheme === 'future' ? 'bg-amber-400' : 'bg-blue-400';
  const textColor = colorTheme === 'future' ? 'text-amber-400' : 'text-blue-400';
  
  const hoursData = [];
  let maxPrecip = -1;
  let maxIdx = -1;
  
  for(let i=0; i<hourlyTimes.length; i++) {
    if(hourlyTimes[i].startsWith(dateStr)) {
      const val = hourlyPrecips[i] || 0;
      hoursData.push({ time: hourlyTimes[i], val });
      if(val > maxPrecip) { maxPrecip = val; maxIdx = hoursData.length - 1; }
    }
  }
  
  if(hoursData.length === 0) {
    return `<div class="text-center text-xs text-slate-400 py-2">시간별 데이터가 없습니다.</div>`;
  }
  
  let chartHtml = `<div class="flex overflow-x-auto gap-2 pb-2 pt-1 custom-scrollbar-hide snap-x">`;
  hoursData.forEach((d, idx) => {
    const isMax = (idx === maxIdx && maxPrecip > 0);
    const hColor = isMax ? 'bg-red-500' : barColor;
    const tColor = isMax ? 'text-red-500 font-bold' : 'text-slate-400 md:text-slate-500';
    const valColor = isMax ? 'text-red-500 font-bold' : 'text-slate-600 md:text-slate-400';
    
    let hPx = 2;
    if(maxPrecip > 0 && d.val > 0) {
      hPx = Math.max(2, Math.floor((d.val / maxPrecip) * 36)); 
    }
    
    const hourStr = d.time.substring(11, 16); 
    const valStr = d.val > 0 ? d.val.toFixed(1) : '0';
    
    chartHtml += `
      <div class="flex flex-col items-center justify-end min-w-[36px] snap-center">
        <span class="text-[10px] mb-1 ${valColor}">${valStr}</span>
        <div class="w-4 rounded-t-sm ${hColor}" style="height: ${hPx}px; transition: height 0.3s ease;"></div>
        <span class="text-[9px] mt-1 ${tColor}">${hourStr}</span>
      </div>
    `;
  });
  chartHtml += `</div>`;
  
  if(maxPrecip > 0) {
    const peakTime = hoursData[maxIdx].time.substring(11, 16);
    chartHtml = `<div class="text-[11px] mb-2 text-red-500 font-bold tracking-tight"><i class="fa-solid fa-triangle-exclamation"></i> ${peakTime} 피크 집중 강수 (${maxPrecip.toFixed(1)}mm)</div>` + chartHtml;
  }
  return chartHtml;
}

window.showHistoryModal = function(name, dates, precips, hourlyTimes, hourlyPrecips, total) {
  document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-clock-rotate-left text-blue-500 md:text-blue-400"></i> ${name} 과거 강수내역`;
  document.getElementById('modal-total').innerText = total;
  
  const tbody = document.getElementById('modal-tbody');
  tbody.innerHTML = '';
  dates.forEach((date, i) => {
    const val = precips[i] !== null ? Number(precips[i]).toFixed(1) : '0.0';
    tbody.innerHTML += `
      <tr class="hover:bg-slate-100 md:hover:bg-slate-700/30 transition-colors cursor-pointer group" onclick="toggleHourlyData('hist-${i}')">
        <td class="px-4 py-3 sm:py-2.5 text-[#1D1D1F] md:text-slate-300 flex items-center gap-2">
          <i class="fa-solid fa-chevron-down text-[10px] text-slate-400 group-hover:text-blue-500 transition-colors"></i> ${date}
        </td>
        <td class="px-4 py-3 sm:py-2.5 text-right font-mono ${Number(val) > 0 ? 'text-[#003366] md:text-blue-400 font-bold' : 'text-slate-400 md:text-slate-500'}">${val}</td>
      </tr>
      <tr id="hourly-row-hist-${i}" class="hidden bg-[#F8F8F8] md:bg-slate-900/50">
        <td colspan="2" class="px-4 py-3 border-t border-[#E5E5E5] md:border-slate-700/50">
          ${generateHourlyChart(date, hourlyTimes, hourlyPrecips, 'history')}
        </td>
      </tr>
    `;
  });
  document.getElementById('detail-modal').showModal();
};

window.showNext24hModal = function(name, hourlyTimes, hourlyPrecips) {
  document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-clock text-sky-500 md:text-sky-400"></i> ${name} 향후 24시간 강수예측`;
  const tbody = document.getElementById('modal-tbody');
  tbody.innerHTML = '';
  
  let sum = 0;
  const nowMs = Date.now();
  const next24hMs = nowMs + (24 * 60 * 60 * 1000);
  
  let hasData = false;
  
  if (hourlyTimes && hourlyTimes.length > 0) {
    hourlyTimes.forEach((t, i) => {
      const timeMs = new Date(t).getTime();
      if (timeMs >= nowMs && timeMs <= next24hMs) {
        hasData = true;
        const val = hourlyPrecips[i] !== null && hourlyPrecips[i] !== undefined ? Number(hourlyPrecips[i]) : 0;
        sum += val;
        const valStr = val.toFixed(1);
        
        // Extract hour string, e.g. "2023-01-01T15:00" -> "15:00"
        const hourStr = t.substring(11, 16);
        const dateStr = t.substring(5, 10).replace('-', '/'); // "01/01"
        
        tbody.innerHTML += `
          <tr class="hover:bg-slate-100 md:hover:bg-slate-700/30 transition-colors">
            <td class="px-4 py-3 sm:py-2.5 text-[#1D1D1F] md:text-slate-300 font-mono">
              <span class="text-xs text-slate-400 mr-2">${dateStr}</span>${hourStr}
            </td>
            <td class="px-4 py-3 sm:py-2.5 text-right font-mono ${val > 0 ? 'text-[#003366] md:text-sky-400 font-bold' : 'text-slate-400 md:text-slate-500'}">${valStr}</td>
          </tr>
        `;
      }
    });
  }
  
  if (!hasData) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-center py-6 text-slate-400 text-sm">데이터가 없습니다.</td></tr>';
  }
  
  document.getElementById('modal-total').innerText = sum.toFixed(1);
  document.getElementById('detail-modal').showModal();
};

window.showFutureModal = function(name, dates, precips, hourlyTimes, hourlyPrecips) {
  document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-fast-forward text-blue-500 md:text-amber-400"></i> ${name} 향후 10일 강수예측`;
  const tbody = document.getElementById('modal-tbody');
  tbody.innerHTML = '';
  
  let sum = 0;
  
  if (!dates || dates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-center py-6 text-slate-400 text-sm">데이터가 없습니다.</td></tr>';
    document.getElementById('modal-total').innerText = '0.0';
    document.getElementById('detail-modal').showModal();
    return;
  }
  
  dates.forEach((date, i) => {
    const val = precips[i] !== null ? Number(precips[i]) : 0;
    sum += val;
    const valStr = val.toFixed(1);
    tbody.innerHTML += `
      <tr class="hover:bg-slate-100 md:hover:bg-slate-700/30 transition-colors cursor-pointer group" onclick="toggleHourlyData('fut-${i}')">
        <td class="px-4 py-3 sm:py-2.5 text-[#1D1D1F] md:text-slate-300 flex items-center gap-2">
          <i class="fa-solid fa-chevron-down text-[10px] text-slate-400 group-hover:text-amber-400 transition-colors"></i> ${date}
        </td>
        <td class="px-4 py-3 sm:py-2.5 text-right font-mono ${val > 0 ? 'text-[#003366] md:text-amber-400 font-bold' : 'text-slate-400 md:text-slate-500'}">${valStr}</td>
      </tr>
      <tr id="hourly-row-fut-${i}" class="hidden bg-[#F8F8F8] md:bg-slate-900/50">
        <td colspan="2" class="px-4 py-3 border-t border-[#E5E5E5] md:border-slate-700/50">
          ${generateHourlyChart(date, hourlyTimes, hourlyPrecips, 'future')}
        </td>
      </tr>
    `;
  });
  
  document.getElementById('modal-total').innerText = sum.toFixed(1);
  document.getElementById('detail-modal').showModal();
};

// 4. Flatpickr 초기화 및 디바운싱 구동
let debounceTimer;

document.addEventListener('DOMContentLoaded', () => {
  initSkeleton(); // 최초 로딩 시 스켈레톤 배치
  
  const today = new Date();
  
  // 기본값: 오늘 기준 최근 7일 (오늘 - 7일 = 지난 일주일간)
  const defaultStartDate = new Date(today);
  defaultStartDate.setDate(defaultStartDate.getDate() - 7);
  
  // 최대 90일(3개월) 이내 제한 설정
  const maxLimitDate = new Date(today);
  maxLimitDate.setDate(maxLimitDate.getDate() - 90);
  
  const format = d => {
     // 로컬 타임존 기준으로 yyyy-mm-dd 추출
     const offset = d.getTimezoneOffset() * 60000;
     const localISOTime = (new Date(d - offset)).toISOString().split('T')[0];
     return localISOTime;
  };
  
  let currentStart = format(defaultStartDate);
  let currentEnd = format(today);

  flatpickr('#date-range', {
    mode: 'range',
    locale: 'ko', // 한국어 로케일 지정 (index.html에 cdn 추가됨)
    defaultDate: [currentStart, currentEnd],
    minDate: maxLimitDate,
    maxDate: today,
    dateFormat: "Y-m-d",
    onChange: function(selectedDates, dateStr, instance) {
      if (selectedDates.length === 2) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          document.getElementById('loading-indicator').classList.remove('hidden');
          const s = format(selectedDates[0]);
          const e = format(selectedDates[1]);
          initSkeleton(); // 패치하는 동안 기존 카드 비우고 스켈레톤 노출
          const d = await fetchWeatherData(s, e);
          renderCards(d);
        }, 300); // 300ms 디바운스
      }
    }
  });

  // 최초 로딩 시 API Call
  fetchWeatherData(currentStart, currentEnd).then(renderCards);

  // 30분 단위 백그라운드 자동 갱신 (알림 없이 조용히 갱신)
  setInterval(async () => {
    console.log('[Auto-Refresh] Fetching latest weather data...');
    const fp = document.querySelector('#date-range')?._flatpickr;
    let s = currentStart;
    let e = currentEnd;
    if (fp && fp.selectedDates.length === 2) {
      s = format(fp.selectedDates[0]);
      e = format(fp.selectedDates[1]);
    }
    
    // 로딩 인디케이터 활성화 (스켈레톤 UI 대신 헤더 인디케이터만 노출)
    document.getElementById('loading-indicator').classList.remove('hidden');
    
    // forceRefresh=true 전달하여 캐시 무시하고 강제 갱신
    const d = await fetchWeatherData(s, e, true);
    if (d) renderCards(d);
  }, 30 * 60 * 1000); // 30분(1800000ms)
});

// ==========================================================
// 5. 지도 모달 제어 함수 (Leaflet.js 연동)
// ==========================================================

/** 지도 모달 닫기 */
window.closeMapModal = function() {
  const modal = document.getElementById('map-modal');
  modal.close();
  // 닫기 후 인스턴스 정리 (메모리 누수 방지)
  if (window._leafletMap) {
    try { window._leafletMap.remove(); } catch(e) { /* ignore */ }
    window._leafletMap = null;
  }
};

/**
 * 지도 모달 열기
 * @param {string} name  - 지점명
 * @param {number} lat   - 위도
 * @param {number} lon   - 경도
 * @param {string} condition - 기상 텍스트 (맥음, 비 등)
 * @param {string} temp  - 현재 기온
 */
window.showMapModal = function(name, lat, lon, condition, temp) {

  // 1. 좌표 유효성 검사
  if (lat == null || lon == null || isNaN(Number(lat)) || isNaN(Number(lon))) {
    alert(`[불러오기 실패] ${name} 지점의 위치 좌표가 없어 지도를 표시할 수 없습니다.`);
    return;
  }

  // 2. 모달 타이틀 갱신
  document.getElementById('map-modal-title-text').textContent = `${name} 위치 지도`;
  document.getElementById('map-modal-info').textContent = `${condition} | ${temp !== '-' ? temp + '°C' : '-'} | ${lat.toFixed(4)}°N  ${lon.toFixed(4)}°E`;

  // 3. 지도 모달 열기
  document.getElementById('map-modal').showModal();

  // 4. 기존 인스턴스 제거 (중복 초기화 방지) — showModal() 직후, setTimeout 밖에서 선행 처리
  if (window._leafletMap) {
    try { window._leafletMap.remove(); } catch(e) { /* ignore */ }
    window._leafletMap = null;
  }

  // 5. 대기 중 로딩 스피너 표시 (300ms 대기 동안 UX 개선)
  const mapEl = document.getElementById('map-container');
  mapEl.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:10px; color:#94a3b8;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size:2rem; color:#059669;"></i>
      <p style="font-size:12px; font-weight:500;">지도를 불러오는 중...</p>
    </div>
  `;

  // 6. [핵심 수정] Leaflet 초기화 전체를 setTimeout 300ms 안으로 이동
  //    showModal()은 동기적으로 open 속성만 추가할 뿐,
  //    브라우저의 레이아웃(리플로우/페인팅) 완료를 보장하지 않음.
  //    즉시 초기화 시 map-container의 크기가 0이라 Leaflet 에러 발생.
  //    300ms 대기로 렌더링 완료 후 초기화하여 근본 해결.
  setTimeout(() => {

    try {
      mapEl.innerHTML = ''; // 로딩 스피너 제거

      window._leafletMap = L.map('map-container', {
        center: [lat, lon],
        zoom: 11,
        zoomControl: true,
        scrollWheelZoom: true
      });

      // OpenStreetMap 타일 레이어
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
      }).addTo(window._leafletMap);

      // 마커 추가
      const marker = L.marker([lat, lon]).addTo(window._leafletMap);

      // 팝업 내용 (지점명 · 기상 · 기온 · 좌표)
      const popupContent = `
        <div style="font-family: 'Noto Sans KR', sans-serif; min-width: 130px;">
          <div style="font-size: 14px; font-weight: 700; color: #1D1D1F; margin-bottom: 4px;">📍 ${name}</div>
          <div style="font-size: 12px; color: #555; line-height: 1.7;">
            기상: <b>${condition}</b><br>
            기온: <b>${temp !== '-' ? temp + '°C' : '정보 없음'}</b><br>
            <span style="color: #aaa; font-size: 10px;">${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</span>
          </div>
        </div>
      `;
      marker.bindPopup(popupContent, { maxWidth: 220 }).openPopup();

      // 컨테이너 크기 재계산 (dialog 레이아웃 최종 안정화)
      window._leafletMap.invalidateSize();

    } catch (err) {
      // Leaflet 초기화 실패 시 사용자 친화적 에러 표시
      console.error('[showMapModal] Leaflet 초기화 실패:', err);
      mapEl.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:8px; color:#ef4444;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;"></i>
          <p style="font-size:13px; font-weight:600;">지도를 불러오는데 실패했습니다.</p>
          <p style="font-size:11px; color:#94a3b8;">네트워크 상태를 확인 후 다시 시도해 주세요.</p>
        </div>
      `;
    }

  }, 300); // 300ms: <dialog> 렌더링 및 CSS 애니메이션 완료 대기
};

