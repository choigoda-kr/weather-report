// 1. 20개 지점 데이터 셋 구축 (광역 4개 신규 + 기존 16개 유지)
const locations = [
  { id: 'seoul', name: '서울', lat: 37.5669, lon: 126.9786 },
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

// 2. Fetch 및 Mapping 로직 구조화
async function fetchWeatherData(startDateStr, endDateStr) {
  const CACHE_TTL = 60 * 60 * 1000; // 60분 TTL
  const cacheKey = `weather_cache_${startDateStr}_${endDateStr}`;
  const cached = sessionStorage.getItem(cacheKey);

  if (cached) {
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
    
    // Batch Request URL 생성
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=weather_code&hourly=precipitation&daily=precipitation_sum&timezone=Asia%2FSeoul&start_date=${startDateStr}&end_date=${endDateStr}`;
    
    console.log('Fetching Open-Meteo Data...');
    const res = await fetch(url);
    if (!res.ok) throw new Error('API Request Failed');
    
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
      
      // 누적 강수량 (기간 내 전체 합산)
      const dailyPrecips = data.daily?.precipitation_sum || [];
      const totalPrecip = dailyPrecips.reduce((sum, val) => sum + (val || 0), 0).toFixed(1);
      
      // 향후 24시간 예상 강수량 (현재 시간 기준 앞으로 24개 인덱스 추출)
      let next24hPrecip = 0;
      if (data.hourly && data.hourly.time && data.hourly.precipitation) {
        // YYYY-MM-DDTHH:00 형태로 현재 시간 문자열 생성 (로컬 시간 기준)
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const nowIso = `${yyyy}-${mm}-${dd}T${hh}:00`;
        
        const currentIndex = data.hourly.time.findIndex(t => t === nowIso);
        
        if (currentIndex !== -1) {
          // 일치하는 현재 시간을 찾은 경우, 기준 인덱스부터 "앞으로 24시간" slice
          const upcoming = data.hourly.precipitation.slice(currentIndex, currentIndex + 24);
          next24hPrecip = upcoming.reduce((sum, val) => sum + (val || 0), 0).toFixed(1);
        } else {
          // 예외 상황: 정확한 시간축을 찾지 못한 경우 방어코드 (첫번째 항목부터 24개 임시 계산)
          next24hPrecip = (data.hourly.precipitation.slice(0, 24).reduce((sum, val) => sum + (val || 0), 0)).toFixed(1);
        }
      }
      
      return {
        ...loc,
        condition,
        totalPrecip,
        next24hPrecip,
        dailyDates: dailyPrecips.length ? data.daily.time : [],
        dailyPrecips: dailyPrecips
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
    console.error('Fetch error:', error);
    document.getElementById('loading-indicator').classList.add('hidden');
    alert('기상 데이터를 불러오는데 실패했습니다.');
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

  dataArray.forEach(data => {
    const card = document.createElement('div');
    card.className = 'weather-card rounded-2xl p-5 flex flex-col justify-between h-48 relative overflow-hidden group';
    
    // 장식용 배경 이펙트
    const bgBlur = document.createElement('div');
    bgBlur.className = `absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity bg-current ${data.condition.color}`;
    card.appendChild(bgBlur);

    const innerContent = document.createElement('div');
    innerContent.className = 'relative z-10 flex flex-col h-full';
    
    innerContent.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <h2 class="text-xl font-bold tracking-tight text-[#1D1D1F] md:text-white/90">${data.name}</h2>
        <div class="flex flex-col items-end">
          <i class="fa-solid ${data.condition.icon} text-3xl ${data.condition.color} drop-shadow-sm md:drop-shadow-lg mb-1 float-animation"></i>
          <span class="text-xs font-semibold tracking-wide uppercase ${data.condition.color} bg-slate-100 md:bg-black/20 px-2 py-0.5 rounded-full">${data.condition.text}</span>
        </div>
      </div>
      
      <div class="space-y-3 mt-auto">
         <div class="flex justify-between items-end bg-[#F5F5F7] md:bg-slate-800/40 p-3 sm:p-2 rounded-lg border border-[#E5E5E5] md:border-slate-700/50 cursor-pointer hover:bg-[#EAEAEA] md:hover:bg-slate-700/70 transition-colors group/btn" onclick='showHistoryModal(${JSON.stringify(data.name)}, ${JSON.stringify(data.dailyDates)}, ${JSON.stringify(data.dailyPrecips)}, ${data.totalPrecip})'>
          <span class="text-xs text-slate-500 md:text-slate-400 font-medium group-hover/btn:text-[#1D1D1F] md:group-hover/btn:text-white transition-colors">선택 기간 강수량 <i class="fa-solid fa-chevron-right text-[9px] ml-0.5 opacity-50 group-hover/btn:opacity-100"></i></span>
          <div class="text-right flex items-baseline gap-1">
             <span class="text-3xl sm:text-2xl font-bold text-[#003366] md:text-blue-400 md:drop-shadow">${data.totalPrecip}</span>
             <span class="text-xs text-slate-400 md:text-slate-500 font-bold">mm</span>
          </div>
        </div>
        
        <div class="flex justify-between items-center px-3 py-2.5 sm:py-1.5 sm:px-2 mt-1 cursor-pointer hover:bg-slate-100 md:hover:bg-slate-800/60 rounded-lg -mx-1 transition-colors group/btn2" onclick='showFutureModal(${JSON.stringify(data.name)}, ${data.lat}, ${data.lon})'>
          <span class="text-xs text-slate-500 md:text-slate-400 flex items-center gap-1 group-hover/btn2:text-[#1D1D1F] md:group-hover/btn2:text-white transition-colors"><i class="fa-regular fa-clock text-slate-400 md:text-slate-500 group-hover/btn2:text-blue-500 md:group-hover/btn2:text-amber-400/70"></i>향후 24h 예상 <i class="fa-solid fa-chevron-right text-[9px] opacity-50 group-hover/btn2:opacity-100"></i></span>
          <div class="text-right flex items-baseline gap-1">
             <span class="text-xl sm:text-lg font-bold text-[#003366] md:text-amber-300 md:drop-shadow">${data.next24hPrecip}</span>
             <span class="text-[10px] text-slate-400 md:text-slate-500 font-bold">mm</span>
          </div>
        </div>
      </div>
    `;
    
    card.appendChild(innerContent);
    grid.appendChild(card);
  });
}

function initSkeleton() {
  const grid = document.getElementById('weather-grid');
  grid.innerHTML = '';
  // 20개의 스켈레톤 UI 생성
  for(let i=0; i<20; i++) {
    grid.innerHTML += `
      <div class="weather-card skeleton-card rounded-2xl p-5 flex flex-col justify-between h-48 bg-[#FBFBFB] md:bg-slate-800/50 border md:border-slate-700/30">
        <div class="flex justify-between">
          <div class="h-6 bg-slate-200 md:bg-slate-700/80 rounded w-16 mb-4"></div>
          <div class="h-10 w-10 bg-slate-200 md:bg-slate-700/80 rounded-full"></div>
        </div>
        <div class="space-y-4">
           <div class="h-12 bg-slate-100 md:bg-slate-700/60 rounded-lg w-full"></div>
           <div class="flex justify-between">
             <div class="h-4 bg-slate-100 md:bg-slate-700/60 rounded w-20"></div>
             <div class="h-5 bg-slate-100 md:bg-slate-700/60 rounded w-12"></div>
           </div>
        </div>
      </div>
    `;
  }
}

// 4. 모달 관련 전역 함수
window.showHistoryModal = function(name, dates, precips, total) {
  document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-clock-rotate-left text-blue-500 md:text-blue-400"></i> ${name} 과거 강수내역`;
  document.getElementById('modal-total').innerText = total;
  
  const tbody = document.getElementById('modal-tbody');
  tbody.innerHTML = '';
  dates.forEach((date, i) => {
    const val = precips[i] !== null ? Number(precips[i]).toFixed(1) : '0.0';
    tbody.innerHTML += `
      <tr class="hover:bg-slate-100 md:hover:bg-slate-700/30 transition-colors">
        <td class="px-4 py-3 sm:py-2.5 text-[#1D1D1F] md:text-slate-300">${date}</td>
        <td class="px-4 py-3 sm:py-2.5 text-right font-mono ${Number(val) > 0 ? 'text-[#003366] md:text-blue-400 font-bold' : 'text-slate-400 md:text-slate-500'}">${val}</td>
      </tr>
    `;
  });
  document.getElementById('detail-modal').showModal();
};

window.showFutureModal = async function(name, lat, lon) {
  document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-fast-forward text-blue-500 md:text-amber-400"></i> ${name} 향후 7일 강수예측`;
  document.getElementById('modal-total').innerText = '-';
  const tbody = document.getElementById('modal-tbody');
  tbody.innerHTML = `<tr><td colspan="2" class="text-center py-10 text-slate-400"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 text-blue-500/50 md:text-amber-400/50"></i><br>데이터를 불러오는 중입니다...</td></tr>`;
  document.getElementById('detail-modal').showModal();
  
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum&timezone=Asia%2FSeoul&forecast_days=7`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('API Error');
    const data = await res.json();
    
    tbody.innerHTML = '';
    let sum = 0;
    const dates = data.daily.time;
    const precips = data.daily.precipitation_sum;
    
    dates.forEach((date, i) => {
      const val = precips[i] !== null ? Number(precips[i]) : 0;
      sum += val;
      const valStr = val.toFixed(1);
      tbody.innerHTML += `
        <tr class="hover:bg-slate-100 md:hover:bg-slate-700/30 transition-colors">
          <td class="px-4 py-3 sm:py-2.5 text-[#1D1D1F] md:text-slate-300">${date}</td>
          <td class="px-4 py-3 sm:py-2.5 text-right font-mono ${val > 0 ? 'text-[#003366] md:text-amber-400 font-bold' : 'text-slate-400 md:text-slate-500'}">${valStr}</td>
        </tr>
      `;
    });
    document.getElementById('modal-total').innerText = sum.toFixed(1);
    
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="2" class="text-center py-6 text-red-500 md:text-red-400 text-sm">데이터를 불러오지 못했습니다.</td></tr>';
    document.getElementById('modal-total').innerText = '0.0';
  }
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
});
