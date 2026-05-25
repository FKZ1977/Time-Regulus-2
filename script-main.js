// Time Regulus Main App - メイン機能のすべて
// ロック画面解除後に読み込まれる

// 初期化関数（アンロック直後に実行）
function initMainApp() {
  console.log('Initializing main app features...');
  
  // localStorage から履歴を復元
  loadResultHistory();
  
  // プレースホルダーガイドの初期化
  initPlaceholderGuides();
  
  // ドラムロール初期化
  initializeDrums();
  
  // 補正画面の初期状態を「補正時刻を求める」に設定
  toggleReverseMode(false);
  
  console.log('✓ Main app initialized');
}

// ======================
// 結果履歴管理
// ======================
let resultHistory = [];

function loadResultHistory() {
  const stored = localStorage.getItem('resultHistory');
  resultHistory = stored ? JSON.parse(stored) : [];
}

function saveResultHistory() {
  localStorage.setItem('resultHistory', JSON.stringify(resultHistory));
}

// ======================
// プレースホルダーガイド
// ======================
function initPlaceholderGuides() {
  // 誤差計算モード
  const displayTimeInput = document.getElementById('displayTime');
  const displayDateInput = document.getElementById('displayDate');
  const standardTimeInput = document.getElementById('standardTime');
  const standardDateInput = document.getElementById('standardDate');
  const reverseTimeInput = document.getElementById('reverseDisplayTime');
  const reverseDateInput = document.getElementById('reverseDisplayDate');
  
  [displayTimeInput, standardTimeInput, reverseTimeInput].forEach(input => {
    if (!input) return;
    const updateEmptyClass = () => {
      if (input.value) {
        input.classList.add('has-value');
      } else {
        input.classList.remove('has-value');
      }
    };
    input.addEventListener('input', updateEmptyClass);
    input.addEventListener('change', updateEmptyClass);
  });
  
  [displayDateInput, standardDateInput, reverseDateInput].forEach(input => {
    if (!input) return;
    const updateEmptyClass = () => {
      if (input.value) {
        input.classList.add('has-value');
      } else {
        input.classList.remove('has-value');
      }
    };
    input.addEventListener('input', updateEmptyClass);
    input.addEventListener('change', updateEmptyClass);
  });
}

// ======================
// TimeRegulusDrum クラス
// ======================
class TimeRegulusDrum {
  constructor(wheelId, type, onValueChange) {
    this.wheelId = wheelId;
    this.type = type; // 'hour', 'min', 'sec'
    this.onValueChange = onValueChange;
    this.wheel = document.getElementById(wheelId);
    this.currentIndex = 0;
    this.values = [];
    this.itemHeight = 44; // 各アイテムの高さ
    this.visibleCount = 3; // 表示するアイテム数
  }

  init() {
    if (!this.wheel) return;
    
    // タイプに応じて値を生成
    if (this.type === 'hour') {
      this.values = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    } else if (this.type === 'min') {
      this.values = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    } else if (this.type === 'sec') {
      this.values = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    }

    // HTML 生成
    this.wheel.innerHTML = this.values.map(v => `<div class="picker-item">${v}</div>`).join('');
    
    // スクロールイベント
    this.wheel.addEventListener('scroll', () => this.onDrumScroll());
  }

  onDrumScroll() {
    this.snapToNearest();
    if (this.onValueChange) this.onValueChange();
  }

  updateActiveItem() {
    const items = this.wheel.querySelectorAll('.picker-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === this.currentIndex);
    });
  }

  snapToNearest() {
    const scrollTop = this.wheel.scrollTop;
    this.currentIndex = Math.round(scrollTop / this.itemHeight);
    this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.values.length - 1));
    this.scrollToIndex(this.currentIndex, true);
    this.updateActiveItem();
  }

  scrollToIndex(index, smooth = false) {
    const scrollPos = index * this.itemHeight;
    if (smooth) {
      this.wheel.scrollTo({ top: scrollPos, behavior: 'smooth' });
    } else {
      this.wheel.scrollTop = scrollPos;
    }
  }

  setValue(value) {
    const index = this.values.indexOf(value);
    if (index !== -1) {
      this.currentIndex = index;
      this.scrollToIndex(index);
      this.updateActiveItem();
    }
  }

  getValue() {
    return this.values[this.currentIndex] || '00';
  }
}

let pickerHourDrum, pickerMinDrum, pickerSecDrum;

function initializeDrums() {
  // ドラムロール初期化
  pickerHourDrum = new TimeRegulusDrum('pickerWheelHour', 'hour', onDrumValueChange);
  pickerMinDrum = new TimeRegulusDrum('pickerWheelMin', 'min', onDrumValueChange);
  pickerSecDrum = new TimeRegulusDrum('pickerWheelSec', 'sec', onDrumValueChange);
  
  pickerHourDrum.init();
  pickerMinDrum.init();
  pickerSecDrum.init();
}

function onDrumValueChange() {
  // ドラムの値が変わった時に背後のHTMLに同期
  const time = `${pickerHourDrum.getValue()}:${pickerMinDrum.getValue()}`;
  console.log('Drum value changed:', time);
}

// ======================
// タイムピッカー
// ======================
let currentPickerTarget = null;

function openTimePicker(group) {
  currentPickerTarget = group;
  document.getElementById('pickerOverlay').style.display = 'block';
  document.getElementById('regulusTimePicker').style.display = 'block';
}

function closeTimePicker() {
  if (currentPickerTarget && pickerHourDrum) {
    const hour = pickerHourDrum.getValue();
    const min = pickerMinDrum.getValue();
    const sec = pickerSecDrum.getValue();
    
    const timeStr = `${hour}:${min}:${sec}`;
    console.log(`Set time for ${currentPickerTarget}:`, timeStr);
    
    // TODO: currentPickerTarget の入力フィールドに値を設定
  }
  
  document.getElementById('pickerOverlay').style.display = 'none';
  document.getElementById('regulusTimePicker').style.display = 'none';
  currentPickerTarget = null;
}

// ======================
// モード切り替え
// ======================
function showErrorMode() {
  document.getElementById('modeSelect').style.display = 'none';
  document.getElementById('errorMode').style.display = 'block';
}

function showCorrectionMode() {
  document.getElementById('modeSelect').style.display = 'none';
  document.getElementById('correctionMode').style.display = 'block';
}

function backToModeSelect() {
  document.getElementById('errorMode').style.display = 'none';
  document.getElementById('correctionMode').style.display = 'none';
  document.getElementById('resultListPage').style.display = 'none';
  document.getElementById('modeSelect').style.display = 'block';
  resetApp(true);
}

function backToCorrectionMode() {
  document.getElementById('resultListPage').style.display = 'none';
  document.getElementById('correctionMode').style.display = 'block';
}

// ======================
// 入力補助トグル
// ======================
function toggleInputHelper(enabled) {
  const errorHelperON = document.querySelectorAll('#errorMode .input-helper-on');
  const errorHelperOFF = document.querySelectorAll('#errorMode .input-helper-off');
  const correctionHelperON = document.querySelectorAll('#correctionMode .input-helper-on:not(.correction-date-toggle-wrapper)');
  const correctionHelperOFF = document.querySelectorAll('#correctionMode .input-helper-off');
  
  if (enabled) {
    errorHelperON.forEach(el => el.style.display = '');
    errorHelperOFF.forEach(el => el.style.display = 'none');
    correctionHelperON.forEach(el => el.style.display = '');
    correctionHelperOFF.forEach(el => el.style.display = 'none');
  } else {
    errorHelperON.forEach(el => el.style.display = 'none');
    errorHelperOFF.forEach(el => el.style.display = '');
    correctionHelperON.forEach(el => el.style.display = 'none');
    correctionHelperOFF.forEach(el => el.style.display = '');
  }
  
  syncAllPlaceholderColors();
}

function toggleIncludeDate(enabled) {
  const dateWrappers = [
    document.getElementById('displayDateWrapper'),
    document.getElementById('standardDateWrapper'),
    document.getElementById('displayDateGroup_direct'),
    document.getElementById('standardDateGroup_direct')
  ];
  
  dateWrappers.forEach(wrapper => {
    if (wrapper) wrapper.style.display = enabled ? '' : 'none';
  });
}

function toggleIncludeDateCorrection(enabled) {
  const dateWrappers = [
    document.getElementById('reverseDisplayDateWrapper'),
    document.getElementById('reverseDisplayDateGroup_direct')
  ];
  
  dateWrappers.forEach(wrapper => {
    if (wrapper) wrapper.style.display = enabled ? '' : 'none';
  });
}

// ======================
// プレースホルダー色同期
// ======================
function syncAllPlaceholderColors() {
  // 誤差計算モード
  updateSelectPlaceholderColor('displaySeconds');
  updateSelectPlaceholderColor('standardSeconds');
  
  // 補正モード
  updateSelectPlaceholderColor('errorSeconds');
  updateSelectPlaceholderColor('reverseDisplaySeconds');
}

function updateSelectPlaceholderColor(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  if (select.value === '') {
    select.classList.add('placeholder-active');
  } else {
    select.classList.remove('placeholder-active');
  }
}

// ======================
// エラー計算
// ======================
function calculateError() {
  const displayTime = document.getElementById('displayTime').value;
  const standardTime = document.getElementById('standardTime').value;
  
  if (!displayTime || !standardTime) {
    document.getElementById('result').innerHTML = '<p>時刻を入力してください</p>';
    return;
  }
  
  // 時刻計算ロジック（簡略版）
  const [dHour, dMin] = displayTime.split(':').map(Number);
  const [sHour, sMin] = standardTime.split(':').map(Number);
  
  const dTotalMin = dHour * 60 + dMin;
  const sTotalMin = sHour * 60 + sMin;
  const diffMin = dTotalMin - sTotalMin;
  
  const direction = diffMin >= 0 ? '進んでいる' : '遅れている';
  const absDiffMin = Math.abs(diffMin);
  const hours = Math.floor(absDiffMin / 60);
  const mins = absDiffMin % 60;
  
  document.getElementById('result').innerHTML = `
    <p>誤差: <span class="${diffMin >= 0 ? 'error-late' : 'error-early'}">${hours}時間${mins}分 ${direction}</span></p>
  `;
}

// ======================
// 補正計算
// ======================
function toggleReverseMode(doToggle = true) {
  const btn = document.getElementById('reverseModeToggleBtn');
  const reverseBlock = document.getElementById('reverseTimeBlock');
  const label = document.getElementById('reverseTimeLabel');
  const textLeft = document.getElementById('swapTextLeft');
  const textRight = document.getElementById('swapTextRight');
  
  if (doToggle) {
    btn.classList.toggle('active-toggle');
    btn.classList.toggle('active-toggle-pink');
  }
  
  const isSearchingStandard = btn.classList.contains('active-toggle-pink');
  
  reverseBlock.style.display = isSearchingStandard ? '' : 'none';
  label.textContent = isSearchingStandard ? '表示時刻:' : '補正後の時刻:';
  
  updateButtonTexts();
  
  function updateButtonTexts() {
    if (isSearchingStandard) {
      textLeft.textContent = '表示時刻を求める';
      textRight.textContent = '補正時刻を求める';
    } else {
      textLeft.textContent = '補正時刻を求める';
      textRight.textContent = '表示時刻を求める';
    }
  }
}

function switchToCorrectionMode() {
  document.getElementById('errorMode').style.display = 'none';
  document.getElementById('correctionMode').style.display = 'block';
}

// ======================
// 結果管理
// ======================
function addResultToList() {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toLocaleString('ja-JP'),
    result: document.getElementById('reverseResult').innerText
  };
  
  resultHistory.push(entry);
  saveResultHistory();
  
  // 成功メッセージ表示
  const msg = document.getElementById('recordSuccessMessage');
  msg.style.display = 'block';
  msg.classList.remove('fade-out');
  msg.classList.add('fade-in-out');
  
  setTimeout(() => {
    msg.classList.remove('fade-in-out');
    msg.classList.add('fade-out');
  }, 2000);
  
  document.getElementById('showListLink').style.display = '';
}

function showResultList() {
  renderResultList();
  document.getElementById('correctionMode').style.display = 'none';
  document.getElementById('resultListPage').style.display = 'block';
}

function renderResultList() {
  const container = document.getElementById('resultListContainer');
  container.innerHTML = '';
  
  if (resultHistory.length === 0) {
    container.innerHTML = '<p>履歴はありません</p>';
    return;
  }
  
  resultHistory.forEach(entry => {
    const group = document.createElement('div');
    group.className = 'result-list-group-outer';
    
    const inner = document.createElement('div');
    inner.className = 'result-list-group-inner';
    inner.innerHTML = `
      <p><strong>${entry.timestamp}</strong></p>
      <p>${entry.result}</p>
    `;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '削除';
    deleteBtn.onclick = () => deleteResultById(entry.id);
    
    group.appendChild(inner);
    group.appendChild(deleteBtn);
    container.appendChild(group);
  });
}

function deleteResultById(idToDelete) {
  resultHistory = resultHistory.filter(entry => entry.id !== idToDelete);
  saveResultHistory();
  renderResultList();
}

// ======================
// ユーティリティ
// ======================
function setNowToStandard() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  document.getElementById('standardTime').value = `${hours}:${minutes}`;
  document.getElementById('standardSeconds').value = seconds;
}

function resetApp(onlyInputs = false) {
  // 誤差計算モードのリセット
  const inputIds = [
    'displayTime', 'displayDate', 'displaySeconds',
    'standardTime', 'standardDate', 'standardSeconds',
    'displayHour_direct', 'displayMin_direct', 'displaySec_direct', 'displayDay_direct', 'displayMonth_direct', 'displayYear_direct',
    'standardHour_direct', 'standardMin_direct', 'standardSec_direct', 'standardDay_direct', 'standardMonth_direct', 'standardYear_direct',
    'errorDays', 'errorTime', 'errorSeconds',
    'errorDays_direct', 'errorHours_direct', 'errorMinutes_direct', 'errorSeconds_direct',
    'reverseDisplayTime', 'reverseDisplayDate', 'reverseDisplaySeconds',
    'reverseDisplayHour_direct', 'reverseDisplayMin_direct', 'reverseDisplaySec_direct'
  ];
  
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  document.getElementById('result').innerHTML = '';
  document.getElementById('reverseResult').innerHTML = '';
  
  if (!onlyInputs) {
    document.getElementById('errorMode').style.display = 'none';
    document.getElementById('correctionMode').style.display = 'none';
    document.getElementById('modeSelect').style.display = 'block';
  }
}

function showResetConfirmation() {
  const container = document.getElementById('resetConfirmContainer');
  container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

function resetAppAndReturnToLock() {
  resetApp();
  document.getElementById('modeSelect').style.display = 'none';
  document.getElementById('lockScreen').style.display = 'block';
  document.getElementById('resetConfirmContainer').style.display = 'none';
  document.getElementById('passcode').value = '';
  document.getElementById('passcode').focus();
  restartLockScreenAnimation();
}

function setDirection(value) {
  const btnLate = document.getElementById('btnLate');
  const btnEarly = document.getElementById('btnEarly');
  
  if (value === 'late') {
    btnLate.classList.add('active-late');
    btnEarly.classList.remove('active-early');
  } else {
    btnLate.classList.remove('active-late');
    btnEarly.classList.add('active-early');
  }
}

function swapErrorModeInputs() {
  // 表示時刻と標準時刻を交換
  const fields = [
    ['displayTime', 'standardTime'],
    ['displaySeconds', 'standardSeconds'],
    ['displayDate', 'standardDate'],
    ['displayHour_direct', 'standardHour_direct'],
    ['displayMin_direct', 'standardMin_direct'],
    ['displaySec_direct', 'standardSec_direct'],
    ['displayYear_direct', 'standardYear_direct'],
    ['displayMonth_direct', 'standardMonth_direct'],
    ['displayDay_direct', 'standardDay_direct']
  ];
  
  fields.forEach(([id1, id2]) => {
    const el1 = document.getElementById(id1);
    const el2 = document.getElementById(id2);
    if (el1 && el2) {
      [el1.value, el2.value] = [el2.value, el1.value];
    }
  });
}
