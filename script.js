const currentVersion = "2.0.1";
let lastError = null;
let hasCalculated = false;
let reverseMode = "toStandard";
let hasCalculatedError = false;
let resultHistory = [];
let isStandardOnTop = false; // 標準時刻が上に配置されているかを示す状態変数
const QR_CODE_URL_BASE = "https://fkz1977.github.io/Time-Regulus/";

function checkPass() {
  const inputField = document.getElementById("passcode");
  const input = inputField.value;
  const correct = "164";
  const errorMessage = document.getElementById("error");

  if (input === correct) {
    document.getElementById("lockScreen").style.display = "none";
    document.getElementById("modeSelect").style.display = "block";
    inputField.blur();
    inputField.style.border = "";
    errorMessage.innerText = "";
  } else {
    errorMessage.innerText = "暗証番号が違います";
    inputField.style.border = "2px solid red";
    inputField.value = "";
    inputField.focus();
    generateKeypad();
  }
}

function generateKeypad() {
  const keypad = document.getElementById("keypad");
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const shuffled = numbers.sort(() => Math.random() - 0.5);
  keypad.innerHTML = "";

  shuffled.forEach(num => {
    const btn = document.createElement("button");
    btn.innerText = num;
    btn.onclick = () => {
      const input = document.getElementById("passcode");
      input.value += num;
    };
    keypad.appendChild(btn);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  // 起動時のポップアップ (修正: function showModeSelect()0.0の内容に変更)
  if (localStorage.getItem("lastVersion") !== currentVersion) {
    alert("Time RegulusはV2.0.1です！");
    localStorage.setItem("lastVersion", currentVersion);
  }

  const passInput = document.getElementById("passcode");
  if (passInput) {
    passInput.focus();
    passInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        checkPass();
      }
    });
  }

  generateKeypad();

  populateSeconds("standardSeconds");
  populateSeconds("displaySeconds");
  populateSeconds("reverseDisplaySeconds");
  populateErrorDropdowns();

  // 誤差計算の自動化のためのリスナー設定
  const errorInputs = [
    "standardTime", "displayTime", "standardSeconds", "displaySeconds"
  ];
  errorInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // input, changeイベントで即座に計算を試みる
      el.addEventListener("input", calculateError);
      el.addEventListener("change", calculateError);
    }
  });


  // 結果一覧の復元
  const savedHistory = localStorage.getItem('resultHistory');
  if (savedHistory) {
    const parsedHistory = JSON.parse(savedHistory);
    resultHistory = parsedHistory.map(group => ({
      ...group,
      entries: group.entries.map(entry => ({
        ...entry,
        base: new Date(entry.base),
        result: new Date(entry.result)
      }))
    }));
  }
  if (resultHistory.length > 0) {
    document.getElementById("showListLink").style.display = "block";
  }

  const reverseInputs = [
    "errorDays", "errorHours", "errorMinutes", "errorSeconds",
    "errorDirection", "reverseDisplayTime", "reverseDisplaySeconds"
  ];
  reverseInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", handleReverseCalculation);
      el.addEventListener("change", handleReverseCalculation);
    }
  });
});

/**
 * 結果履歴をlocalStorageに保存する
 */
function saveResultHistory() {
  localStorage.setItem('resultHistory', JSON.stringify(resultHistory));
}


function populateSeconds(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  // 既存のオプションをクリア
  select.innerHTML = ""; 

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.text = "秒";
  select.appendChild(defaultOption);

  for (let i = 0; i <= 59; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.text = i.toString().padStart(2, '0');
    select.appendChild(option);
  }
}

function populateErrorDropdowns() {
  const hourSelect = document.getElementById("errorHours");
  const minuteSelect = document.getElementById("errorMinutes");
  const secondSelect = document.getElementById("errorSeconds");

  // オプションをクリア
  hourSelect.innerHTML = "";
  minuteSelect.innerHTML = "";
  secondSelect.innerHTML = "";

  // 初期値の -- を追加
  [hourSelect, minuteSelect, secondSelect].forEach(select => {
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.text = "--";
    select.appendChild(defaultOption);
  });

  for (let i = 0; i <= 23; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.text = `${i}`;
    hourSelect.appendChild(option);
  }

  for (let i = 0; i <= 59; i++) {
    const minOpt = document.createElement("option");
    minOpt.value = i;
    minOpt.text = `${i}`;
    minuteSelect.appendChild(minOpt);

    const secOpt = document.createElement("option");
    secOpt.value = i;
    secOpt.text = `${i}`;
    secondSelect.appendChild(secOpt);
  }
}

function setNowToStandard() {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const sec = now.getSeconds();

  const datetimeLocal = `${yyyy}-${mm}-${dd}T${hh}:${min}`;

  document.getElementById("standardTime").value = datetimeLocal;
  document.getElementById("standardSeconds").value = sec;

  calculateError();
}

function showErrorMode() {
  document.getElementById("modeSelect").style.display = "none";
  document.getElementById("errorMode").style.display = "block";
}

function showCorrectionMode() { document.getElementById("modeSelect").style.display = "none"; document.getElementById("correctionMode").style.display = "block";
 // 【変更点】誤差計算の結果が残っていれば反映する
 if (lastError) { applyLastErrorToReverseInputs();
 }
 // 初期モードを toStandard に設定
 reverseMode = "toStandard";
 toggleReverseMode(false);
 // 初期表示（表示時刻から補正時刻を求める）
 }

function backToModeSelect() {
  document.getElementById("errorMode").style.display = "none";
  document.getElementById("correctionMode").style.display = "none";
  document.getElementById("resultListPage").style.display = "none";
  document.getElementById("modeSelect").style.display = "block";
 // ★追加: リセット確認ボタンを非表示に戻す
  document.getElementById("resetConfirmContainer").style.display = "none"; }

function backToCorrectionMode() {
  document.getElementById("resultListPage").style.display = "none";
  document.getElementById("correctionMode").style.display = "block";
}

/**
 * アプリをリセットする
 */
function resetApp(onlyInputs = false) {
  
  // 入力内容のリセット処理
  document.getElementById("displayTime").value = "";
  document.getElementById("standardTime").value = "";
  document.getElementById("displaySeconds").value = "";
  document.getElementById("standardSeconds").value = "";
  document.getElementById("result").innerHTML = "";
  document.getElementById("toReverseButton").style.display = "none";
  
  document.getElementById("errorDays").value = "";
  document.getElementById("errorHours").value = "";
  document.getElementById("errorMinutes").value = "";
  document.getElementById("errorSeconds").value = "";
  document.getElementById("errorDirection").value = "late";
  document.getElementById("reverseDisplayTime").value = "";
  document.getElementById("reverseDisplaySeconds").value = "";
  document.getElementById("reverseResult").innerHTML = "";

  lastError = null;
  hasCalculated = false;
  reverseMode = "toStandard";
  hasCalculatedError = false;

  if (isStandardOnTop) {
    swapErrorModeInputs(); // isStandardOnTopをfalseに戻すために実行
  } else {
     const nowButton = document.getElementById("standardNowButton");
     const standardSeconds = document.getElementById("standardSeconds");
     nowButton.style.display = "inline-block";
     standardSeconds.disabled = false;
     standardSeconds.style.pointerEvents = 'auto';
     standardSeconds.classList.remove('seconds-fixed-00'); // スタイルを戻す
     standardSeconds.value = "";
  }
  
  toggleReverseMode(false);

  // ポップアップ処理を削除し、処理をシンプル化
  // 【重要】resultHistoryの消去処理は、onlyInputsがtrueのときのみ行うようにする
  //          また、画面遷移とアラートは resetAppAndReturnToLock() で制御する。
  if (onlyInputs) { 
    // 結果一覧も消去
    resultHistory = [];
    localStorage.removeItem('resultHistory');
    document.getElementById("showListLink").style.display = "none";
  } else {
    // onlyInputsがfalse（リセットリンク初回クリック時）の場合は、
    // ここで何もしない (showResetConfirmation()が呼ばれるため)
    return;
  }
}

/**
 * 入力情報のリセット確認ボタンを表示する
 */
function showResetConfirmation() {
  // 他の画面要素が表示されている可能性を排除するため、モード選択画面に戻る処理を実行
  // backToModeSelect()はモード選択画面を表示する関数ですが、
  // ここでは画面の状態を変えないために、直接コンテナを表示します。

  // モード選択画面以外が表示されていた場合を想定し、画面をモード選択に固定する
  document.getElementById("errorMode").style.display = "none";
  document.getElementById("correctionMode").style.display = "none";
  document.getElementById("resultListPage").style.display = "none";
  document.getElementById("modeSelect").style.display = "block";
  
  // 確認ボタンを表示
  document.getElementById("resetConfirmContainer").style.display = "block";
}

/**
 * 入力情報を消去し、初期画面に戻る
 */
function resetAppAndReturnToLock() {
  // 1. 全てのリセット処理を実行（入力欄と履歴の消去）
  //    => 履歴も消去するため、trueを渡して resetApp() を呼び出す
  resetApp(true); 

  // 2. 画面をロック画面に戻す
  document.getElementById("modeSelect").style.display = "none";
  document.getElementById("lockScreen").style.display = "block";
  
  // 3. パスコード入力欄をクリアし、フォーカスを戻す
  document.getElementById("passcode").value = "";
  document.getElementById("passcode").focus();

  // 4. 確認ボタンを非表示に戻す
  document.getElementById("resetConfirmContainer").style.display = "none"; 

  // 5. 完了メッセージを表示
  alert("全てのリセットが完了しました。初期画面に戻ります。");
}

/**
 * 誤差計算モードで表示時刻と標準時刻の入力フィールドを入れ替える
 */
function swapErrorModeInputs() {
  const displayGroup = document.getElementById("errorModeDisplayInputGroup");
  const standardGroup = document.getElementById("errorModeStandardInputGroup");
  const modeCard = displayGroup.parentElement;
  const nowButton = document.getElementById("standardNowButton");
  const standardSeconds = document.getElementById("standardSeconds");
  const swapButtonWrapper = document.querySelector('.swap-btn').parentElement; // ⇅ボタンの親div

  // 既存のアニメーションクラスをクリア
  displayGroup.className = "input-group";
  standardGroup.className = "input-group";

  const isMovingStandardUp = !isStandardOnTop;

  // 1. アニメーションクラスの適用（OUT）
  if (isMovingStandardUp) {
    displayGroup.classList.add("animate-down-out");
    standardGroup.classList.add("animate-up-out");
  } else {
    displayGroup.classList.add("animate-up-out");
    standardGroup.classList.add("animate-down-out");
  }

  // 2. DOM操作と機能変更をsetTimeout内で実行
  setTimeout(() => {
    
    if (isMovingStandardUp) {
      // 標準時刻を上 (isStandardOnTop = true) にする
      modeCard.insertBefore(standardGroup, displayGroup); 
      modeCard.insertBefore(swapButtonWrapper, displayGroup);
      
      // 機能の変更 (標準時刻が上)
      nowButton.style.display = "none";
      standardSeconds.value = "0"; // 00秒に固定
      standardSeconds.disabled = true; // 無効化
      standardSeconds.style.pointerEvents = 'none'; // 無効化の視覚的強調
      standardSeconds.classList.add('seconds-fixed-00'); // 新しいスタイル適用
      
    } else {
      // 標準時刻を下 (isStandardOnTop = false) に戻す
      modeCard.insertBefore(displayGroup, standardGroup);
      modeCard.insertBefore(swapButtonWrapper, standardGroup);
      
      // 機能の復元 (標準時刻が下)
      nowButton.style.display = "inline-block"; // NOWボタン表示
      standardSeconds.disabled = false; // 有効化
      standardSeconds.style.pointerEvents = 'auto'; // 有効化
      standardSeconds.classList.remove('seconds-fixed-00'); // スタイルを削除
      standardSeconds.value = ""; // 「秒」に戻す (初期値)
    }
    
    // 状態更新
    isStandardOnTop = isMovingStandardUp;

    // 3. 入れ替え後のフェードインクラスを適用
    // アニメーションクラスをクリア
    displayGroup.classList.remove("animate-down-out", "animate-up-out");
    standardGroup.classList.remove("animate-down-out", "animate-up-out");

    if (isMovingStandardUp) {
      standardGroup.classList.add("animate-up-in");
      displayGroup.classList.add("animate-down-in");
    } else {
      standardGroup.classList.add("animate-down-in");
      displayGroup.classList.add("animate-up-in");
    }
    
    // アニメーション終了後にクラスをクリア
    setTimeout(() => {
      displayGroup.classList.remove("animate-up-in", "animate-down-in");
      standardGroup.classList.remove("animate-up-in", "animate-down-in");
      calculateError(); // 入れ替え後にも計算を試みる
    }, 300);

  }, 300); // 0.3秒のアニメーション後にDOM操作
}


function calculateError() {
  const standardInput = document.getElementById("standardTime").value;
  const displayInput = document.getElementById("displayTime").value;
  
  const standardSecValue = document.getElementById("standardSeconds").value; 
  const displaySecValue = document.getElementById("displaySeconds").value;
  
  const resultElement = document.getElementById("result");
  const toReverseButton = document.getElementById("toReverseButton");
  
  // --- 入力チェック ---
  
  const missingStandardInputs = [];
  const missingDisplayInputs = [];
  
  // 1. 標準時刻の日付時刻入力欄のチェック
  if (!standardInput) {
    missingStandardInputs.push("日時");
  }
  
  // 2. 表示時刻の日付時刻入力欄のチェック
  if (!displayInput) {
    missingDisplayInputs.push("日時");
  }
  
  // 秒の入力チェックに必要な変数の定義
  // isStandardOnTop が true の場合、standardSecValue は "0" に固定されている
  const isStandardSecValid = isStandardOnTop ? (standardSecValue === "0") : (standardSecValue !== "" && standardSecValue !== "秒");
  const isDisplaySecValid = (displaySecValue !== "" && displaySecValue !== "秒");

  // 3. 標準時刻の秒入力チェック
  if (!isStandardSecValid) {
    missingStandardInputs.push("秒");
  }
  
  // 4. 表示時刻の秒入力チェック
  if (!isDisplaySecValid) {
    missingDisplayInputs.push("秒");
  }
  
  // すべての入力が揃っていない場合
  if (missingStandardInputs.length > 0 || missingDisplayInputs.length > 0) {
    
// --- 【変更点 START】 ---
    
    // 標準時刻と表示時刻の両方で「日時」と「秒」が不足しているかチェック
    // isStandardOnTop == true の場合は標準時刻の秒は固定(00)なので、displayInput + displaySecValue の不足のみをチェック
    const isTotallyEmpty = (isStandardOnTop ?
        (!standardInput && !displayInput && !isDisplaySecValid) :
        (!standardInput && !displayInput && !isStandardSecValid && !isDisplaySecValid)
    );
    
    let messageContent;
    let messageStyle = `font-size: 14px; color: #FFFF00; text-decoration: font-weight: bold; line-height: 1.5;`;

    if (isTotallyEmpty) {
        // 全く入力がない場合: 画像のメッセージに変更
        // 標準時刻と表示時刻が入れ替わっている状態（isStandardOnTop=true）にも対応
        const firstLine = isStandardOnTop ? "標準時刻から誤差を算出" : "表示時刻から誤差を算出";
        messageContent = `
            ${firstLine}<br>
            <span style="font-size: 14px; color: var(--text-sub); text-decoration: none; font-weight: normal; line-height: 1.5;">
                日時と秒の両方を入力してください
            </span>
        `;
        // スタイルを上書きしないようにする (外側のspanで制御)
        messageStyle = `font-size: 16px; color: var(--accent); font-weight: bold; line-height: 1.5; text-decoration: none;`; 

    } else {
        // 一部入力が不足している場合: 既存の不足項目メッセージを使用
        const standardMessage = missingStandardInputs.length > 0
          ? `標準時刻: ${missingStandardInputs.join(", ")}が不足`
          : "";
          
        const displayMessage = missingDisplayInputs.length > 0
          ? `表示時刻: ${missingDisplayInputs.join(", ")}が不足`
          : "";

        let finalMessageLines = [];
        
        // 表示順序を isStandardOnTop に連動させる
        if (isStandardOnTop) {
            if (standardMessage) finalMessageLines.push(standardMessage);
            if (displayMessage) finalMessageLines.push(displayMessage);
        } else {
            if (displayMessage) finalMessageLines.push(displayMessage);
            if (standardMessage) finalMessageLines.push(standardMessage);
        }
        
        // メッセージ全体を構築（行区切りとスタイル適用）
        messageContent = finalMessageLines.join("<br>");
        // 元のスタイル
        messageStyle = `font-size: 14px; color: #FFFF00; text-decoration: font-weight: bold; line-height: 1.5;`; 
    }
    
    // 結果表示エリアの更新
    resultElement.innerHTML = `
        <span style="${messageStyle}">
            ${messageContent}
        </span>
    `;
    
    // --- 【変更点 END】 ---
    
    toReverseButton.style.display = "none";
    hasCalculatedError = false;
    return;
  }
  
  // すべての入力が揃っている
  hasCalculatedError = true;


  const standardSec = Number(standardSecValue);
  const displaySec = Number(displaySecValue);

  const standard = new Date(standardInput);
  const display = new Date(displayInput);
  standard.setSeconds(standardSec);
  display.setSeconds(displaySec);

  const diffMs = standard.getTime() - display.getTime(); // 標準 - 表示
  const diffAbsMs = Math.abs(diffMs);
  
  const isLate = diffMs > 0; // 標準 > 表示 なら、表示時刻は遅れている (isLate = true)
  const isFast = diffMs < 0; // 標準 < 表示 なら、表示時刻は進んでいる (isFast = true)

  const totalSeconds = Math.floor(diffAbsMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (totalSeconds === 0) {
    resultElement.innerHTML = `
      <span style="color: var(--accent); font-weight: bold;">Precision Sync!</span><br>
      <span style="color: var(--text-sub); font-size: 15px;">表示時刻は標準時刻と完全に一致しています。</span>
    `;
    document.getElementById("toReverseButton").style.display = "none";
    lastError = null;
    return;
  }

  const parts = [];
  if (days > 0) parts.push(`${days}日`);
  if (hours > 0) parts.push(`${hours}時間`);
  if (minutes > 0) parts.push(`${minutes}分`);
  if (seconds > 0) parts.push(`${seconds}秒`);

  let directionText;
  let directionColor;

  if (isFast) {
    // 表示時刻が進んでいる
    directionText = "進んでいます。";
    directionColor = "var(--error-late-color)"; // 太文字の赤
  } else {
    // 表示時刻が遅れている
    directionText = "遅れています。";
    directionColor = "var(--error-early-color)"; // 太文字の黄緑
  }

  resultElement.innerHTML = `
    <span style="color: var(--accent); font-weight: bold;">${parts.join("")}</span><br>
    <span style="color: ${directionColor}; font-weight: bold;">${directionText}</span>
  `;

  lastError = { days, hours, minutes, seconds, isFast };
  document.getElementById("toReverseButton").style.display = "block";
}

function applyLastErrorToReverseInputs() {
  if (!lastError) return;
  document.getElementById("errorDays").value    = lastError.days    || 0;
  document.getElementById("errorHours").value   = lastError.hours   || 0;
  document.getElementById("errorMinutes").value = lastError.minutes || 0;
  document.getElementById("errorSeconds").value = lastError.seconds || 0;
  // isFast (表示時刻が進んでいる) は direction の "late" (進んでいる) に相当
  document.getElementById("errorDirection").value = lastError.isFast ? "late" : "early";
  handleReverseCalculation();
}

function switchToCorrectionMode() {
  document.getElementById("errorMode").style.display = "none";
  document.getElementById("correctionMode").style.display = "block";

  const prevSeconds = document.getElementById("reverseDisplaySeconds").value;
  // 秒のオプションを再設定
  populateSeconds("reverseDisplaySeconds");
  // 以前の値があれば復元（なければ「秒」のまま）
  if (prevSeconds !== "" && prevSeconds !== "秒" && prevSeconds !== "--") {
    document.getElementById("reverseDisplaySeconds").value = prevSeconds;
  }

  // 誤差計算の結果を反映
  applyLastErrorToReverseInputs();
  reverseMode = "toStandard";
  toggleReverseMode(false); // 初期表示（表示時刻から補正時刻を求める）
}

/**
 * ⇆切替ボタンのロジック (修正: スタイルの制御)
 */
function toggleReverseMode(doToggle = true) {
  const toggleBtn = document.getElementById("reverseModeToggleBtn");
  const label = document.getElementById("reverseTimeLabel");
  
  if (doToggle) {
    reverseMode = reverseMode === "toStandard" ? "toDisplay" : "toStandard";
  }

  // ボタン名を「⇆切替」に統一
  toggleBtn.innerText = "⇆切替";

  if (reverseMode === "toDisplay") {
    // 探している時刻 → 表示時刻 (ピンク色)
    label.innerHTML = '<span style="color: var(--toggle-bg); font-weight: bold;">探している時刻:</span>'; // ピンク太字
    toggleBtn.classList.add("active-toggle-pink");
    toggleBtn.classList.remove("active-toggle");
  } else {
    // 表示時刻 → 補正時刻 (水色)
    label.innerHTML = '<span style="color: var(--accent); font-weight: bold;">表示時刻:</span>'; // 水色太字
    toggleBtn.classList.remove("active-toggle-pink");
    toggleBtn.classList.add("active-toggle"); // active-toggleは水色
  }

  handleReverseCalculation();
}

function handleReverseCalculation() {
  const resultElement = document.getElementById("reverseResult");
  resultElement.innerHTML = "";

  const days    = Number(document.getElementById("errorDays").value || 0);
  const hours   = Number(document.getElementById("errorHours").value || 0);
  const minutes = Number(document.getElementById("errorMinutes").value || 0);
  const seconds = Number(document.getElementById("errorSeconds").value || 0);
  const direction = document.getElementById("errorDirection").value;

  const timeInput = document.getElementById("reverseDisplayTime").value;
  const timeSec   = document.getElementById("reverseDisplaySeconds").value;

  const hasError = (days + hours + minutes + seconds) > 0;
  const hasTime = timeInput && timeSec !== "" && timeSec !== "秒" && timeSec !== "--";

  document.getElementById("addToListButton").style.display = hasTime && hasError ? "inline-block" : "none";

  if (!hasError && !hasTime) {
    resultElement.innerText = "時刻と誤差を入力してください";
    return;
  }

  if (!hasTime && hasError) {
    resultElement.innerText = reverseMode === "toDisplay"
      ? "探している時刻を入力してください"
      : "表示時刻を入力してください";
    return;
  }

  if (hasTime && !hasError) {
    resultElement.innerText = "補正に使う誤差を入力してください";
    return;
  }

  const baseTime = new Date(timeInput);
  baseTime.setSeconds(Number(timeSec));

  const totalMs = ((days * 86400) + (hours * 3600) + (minutes * 60) + seconds) * 1000;
  
  // direction: late = 表示時刻が進んでいる / early = 表示時刻が遅れている
  const isDisplayFast = direction === "late";

  let resultTimeMs;
  if (reverseMode === "toStandard") {
    // 表示時刻 → 補正時刻（標準時刻）を求める
    // 表示時刻が進んでいれば（late）、標準時刻は遅れているのでマイナス補正
    // 表示時刻が遅れていれば（early）、標準時刻は進んでいるのでプラス補正
    resultTimeMs = baseTime.getTime() + (isDisplayFast ? -totalMs : totalMs);
  } else {
    // 探している時刻（標準時刻） → 表示時刻を求める
    // 表示時刻が進んでいれば（late）、標準時刻よりプラス補正
    // 表示時刻が遅れていれば（early）、標準時刻よりマイナス補正
    resultTimeMs = baseTime.getTime() + (isDisplayFast ? totalMs : -totalMs);
  }

  const resultTime = new Date(resultTimeMs);

  const baseStr = formatDate(baseTime, true);
  const resultStr = formatDate(resultTime, true);
  
  const isToStandard = reverseMode === "toStandard";
  const resultBgColor = isToStandard ? "var(--result-standard-bg)" : "var(--result-display-bg)";
  const resultBorderColor = isToStandard ? "var(--accent)" : "var(--toggle-bg)";
  const resultColor = isToStandard ? "var(--accent)" : "var(--toggle-text)";

  const baseLabel = isToStandard ? "表示時刻" : "探している時刻";
  const resultLabel = isToStandard ? "補正時刻" : "表示時刻";

  resultElement.style.border = `2px solid ${resultBorderColor}`;
  resultElement.style.backgroundColor = resultBgColor;
  resultElement.style.color = 'var(--text-main)'; // 全体の文字色はメインテキストカラーに

  resultElement.innerHTML = `
    <div style="padding: 0 10px;">
      <p style="margin: 0; line-height: 1.5;">${baseLabel}が</p>
      <div style="background-color: var(--bg-dark); border: 1px solid ${resultBorderColor}; border-radius: 6px; padding: 6px 10px; margin: 4px 0; display: inline-block;">
        <strong style="color: ${resultColor};">${baseStr}</strong>
      </div>
      <p style="margin: 0; line-height: 1.5;">のとき</p>
      <p style="margin: 10px 0 0; line-height: 1.5;">${resultLabel}は</p>
      <div style="background-color: var(--bg-dark); border: 1px solid ${resultBorderColor}; border-radius: 6px; padding: 6px 10px; margin: 4px 0; display: inline-block;">
        <strong style="color: ${resultColor};">${resultStr}</strong>
      </div>
      <p style="margin: 0; line-height: 1.5;">である</p>
    </div>
  `;

  document.getElementById("showListLink").style.display = "block";

  const result = {
    // 一意のキー生成のため、ベース時刻も組み込む
    id: Date.now(), 
    error: { days, hours, minutes, seconds, direction },
    mode: reverseMode,
    base: baseTime,
    result: resultTime
  };
  window.latestResult = result;
}

/**
 * 結果一覧に追加する (修正: 表示時間を1.0秒に)
 */
function addResultToList() {
  const r = window.latestResult;
  if (!r) return;

  const errorKey = `${r.error.days}-${r.error.hours}-${r.error.minutes}-${r.error.seconds}-${r.error.direction}`;
  
  let group = resultHistory.find(g => g.errorKey === errorKey);

  if (!group) {
    group = {
      errorKey,
      error: r.error,
      entries: []
    };
    resultHistory.push(group);
  }
  
  // 重複チェック
  const baseMs = r.base.getTime();
  const resultMs = r.result.getTime();
  const isDuplicate = group.entries.some(entry => 
    entry.base.getTime() === baseMs && 
    entry.result.getTime() === resultMs && 
    entry.mode === r.mode
  );

if (isDuplicate) {
    // ★改修: 「追加しました」と同じアニメーション時間に変更
    const msg = document.getElementById("recordSuccessMessage");
    const originalText = msg.innerText;
    msg.innerText = "既に記録されています";
    msg.style.display = 'inline-block';
    msg.classList.remove('fade-out');
    msg.classList.add('fade-in-out');
    // 外側のsetTimeoutを1000ms (1.0秒) に維持
    setTimeout(() => {
        msg.classList.remove('fade-in-out');
        msg.classList.add('fade-out');
        setTimeout(() => {
            msg.style.display = 'none';
            msg.classList.remove('fade-out');
            msg.innerText = originalText; // テキストを元に戻す
        }, 500); // 0.5秒のフェードアウト時間
    }, 1000); // 1.0秒後にフェードアウト開始
    return;
  }
  
  // 常に新しいIDを割り当ててユニークにする
  const newEntry = {
    id: Date.now(),
    base: r.base, 
    result: r.result, 
    mode: r.mode 
  };
  group.entries.push(newEntry);
  
  saveResultHistory();
  renderResultList();
  
// ★改修: 履歴がある場合、「結果一覧を表示 →」リンクを表示し、テキストを再設定する
    if (resultHistory.length > 0) {
        const listLink = document.getElementById("showListLink");
        listLink.style.display = "block"; // pタグなのでblockで表示
        listLink.innerText = "結果一覧を表示 →"; 
    }

    // 成功メッセージ表示アニメーション
    const msg = document.getElementById("recordSuccessMessage");
    msg.innerText = "✔ 追加しました";
    msg.style.display = 'inline-block';
    msg.classList.remove('fade-out');
    msg.classList.add('fade-in-out');
    // 外側のsetTimeoutを1000ms (1.0秒) に維持
    setTimeout(() => {
        msg.classList.remove('fade-in-out');
        msg.classList.add('fade-out');
        setTimeout(() => {
            msg.style.display = 'none';
            msg.classList.remove('fade-out');
        }, 500); // 0.5秒のフェードアウト時間
    }, 1000); // 1.0秒後にフェードアウト開始
}

function showResultList() {
    document.getElementById("correctionMode").style.display = "none";
    document.getElementById("resultListPage").style.display = "block";
    renderResultList();
}

/**
 * 結果一覧を誤差と計算モードの小グループに分けて表示する
 */
function renderResultList() {
  const container = document.getElementById("resultListContainer");
  container.innerHTML = "";
  
  if (resultHistory.length === 0) {
    container.innerHTML = "<p style='color: var(--text-sub);'>記録された結果はありません。</p>";
    document.getElementById("showListLink").style.display = "none";
    return;
  }

  // 大グループ（誤差ごと）の処理
  resultHistory.forEach(group => {
    const { days, hours, minutes, seconds, direction } = group.error;
    const errorText = `${days || 0}日${hours || 0}時間${minutes || 0}分${seconds || 0}秒（${direction === "late" ? "進み" : "遅れ" }）`;
    
    // エントリを toStandard と toDisplay に分類
    const entriesByMode = group.entries.reduce((acc, entry) => {
      if (!acc[entry.mode]) {
        acc[entry.mode] = [];
      }
      acc[entry.mode].push(entry);
      return acc;
    }, {});
    
    // 各モード内で時刻の昇順（早いもの順）にソート
    Object.keys(entriesByMode).forEach(mode => {
      entriesByMode[mode].sort((a, b) => a.base.getTime() - b.base.getTime());
    });

    // 大枠のコンテナ（誤差グループ）
    const outerBox = document.createElement("div");
    outerBox.className = "result-list-group-outer";
    outerBox.style.padding = "16px";
    outerBox.style.marginBottom = "24px";
    outerBox.style.border = '2px solid var(--text-sub)';
    outerBox.style.borderRadius = "12px";
    outerBox.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
    outerBox.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";

    // 誤差のタイトル
    const title = document.createElement("h3");
    title.innerHTML = `<strong>補正に使った誤差：</strong>${errorText}`;
    title.style.color = 'var(--accent)';
    title.style.marginBottom = "16px";
    title.style.borderBottom = "1px dashed var(--text-sub)";
    title.style.paddingBottom = "10px";
    outerBox.appendChild(title);

    // 小グループ（計算モードごと）の処理
    ['toStandard', 'toDisplay'].forEach(mode => {
      const modeEntries = entriesByMode[mode];
      if (!modeEntries || modeEntries.length === 0) return;

      const isToStandard = mode === 'toStandard';
      const baseLabel = isToStandard ? "表示時刻" : "探している時刻";
      const resultLabel = isToStandard ? "補正時刻" : "表示時刻";
      const resultColor = isToStandard ? "var(--accent)" : "var(--toggle-text)"; 
      const borderColor = isToStandard ? "var(--accent)" : "var(--toggle-bg)"; 
      const bgColor = isToStandard ? "rgba(0, 255, 224, 0.05)" : "rgba(255, 0, 170, 0.05)";


      const innerBox = document.createElement("div");
      innerBox.className = "result-list-group-inner";
      innerBox.style.border = `1px solid ${borderColor}`;
      innerBox.style.backgroundColor = bgColor;
      innerBox.style.borderRadius = "8px";
      innerBox.style.padding = "12px";
      innerBox.style.marginBottom = "12px";
      innerBox.style.textAlign = "left";

      // モードのヘッダー
      const modeHeader = document.createElement("div");
      modeHeader.innerHTML = `<strong style="color: ${borderColor};">${baseLabel} → ${resultLabel} の計算</strong>`;
      modeHeader.style.marginBottom = "8px";
      modeHeader.style.paddingBottom = "4px";
      innerBox.appendChild(modeHeader);

      // 各エントリの行
      modeEntries.forEach(entry => {
        const line = document.createElement("div");
        line.style.marginBottom = "6px";
        line.style.display = "flex";
        line.style.justifyContent = "space-between";
        line.style.alignItems = "center";
        
        const baseStr = formatDate(entry.base, true);
        const resultStr = formatDate(entry.result, true);

        const textSpan = document.createElement("span");
        textSpan.innerHTML = `
          <span style="font-size: 15px; color: var(--text-sub);">${baseStr}</span>
          <span style="font-size: 14px; color: var(--text-sub);">→</span>
          <span style="font-size: 16px; font-weight: bold; color: ${resultColor};">${resultStr}</span>
        `;
        line.appendChild(textSpan);
        
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.innerText = "削除";
        deleteBtn.onclick = () => deleteResultById(entry.id); 
        line.appendChild(deleteBtn);
        
        innerBox.appendChild(line);
      });

      outerBox.appendChild(innerBox);
    });

    container.appendChild(outerBox);
  });
}

function deleteResultById(idToDelete) {
  let isDeleted = false;
  
  // 履歴をループして、一致するIDを持つエントリを削除
  resultHistory = resultHistory.map(group => {
    const initialLength = group.entries.length;
    group.entries = group.entries.filter(entry => entry.id !== idToDelete);
    if (group.entries.length < initialLength) {
      isDeleted = true;
    }
    return group;
  }).filter(group => group.entries.length > 0); // エントリが空になったグループは削除

  if (isDeleted) {
    saveResultHistory();
    renderResultList();
  }
}


function formatDate(date, includeSeconds = false) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  
  if (includeSeconds) {
    return `${y}/${m}/${d} ${h}:${min}:${s}`;
  }
  return `${y}/${m}/${d} ${h}:${min}`;
}

function showInformationPage() {
  document.getElementById("lockScreen").style.display = "none";
  document.getElementById("informationPage").style.display = "block";
}

function backToLockScreen() {
  document.getElementById("informationPage").style.display = "none";
  document.getElementById("qrCodePage").style.display = "none"; // QRコード画面も閉じる
  document.getElementById("lockScreen").style.display = "block";
}

// QRコード表示機能
function showQRCodePage() {
  document.getElementById("informationPage").style.display = "none";
  document.getElementById("qrCodePage").style.display = "block";
}

function closeQRCodePage() {
  document.getElementById("qrCodePage").style.display = "none";
  document.getElementById("informationPage").style.display = "block";
}

// ======================
// PWA 更新通知ロジック 
// ======================

let newWorker;
const updateNotification = document.getElementById('updateNotification');
const updateButton = document.getElementById('updateButton');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => {
                console.log('Service Worker 登録成功:', reg.scope);

                // 新しいService Workerがインストールされたことを監視する
                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        // 新しいService Workerがインストールされ、待機状態になった場合
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // ★アクティブなService Workerが存在し、新しいSWがインストールされた = 更新あり
                            console.log('New content available, show update prompt');
                            updateNotification.style.display = 'block'; // 通知を表示
                        }
                    });
                });
            })
            .catch(error => {
                console.log('Service Worker 登録失敗:', error);
            });
    });

    // ユーザーが通知ボタンを押した時の処理
    if (updateButton) {
        updateButton.addEventListener('click', () => {
            if (newWorker) {
                // Service Workerにスキップメッセージを送信し、強制的にアクティベートさせる
                newWorker.postMessage({ action: 'skipWaiting' });
            }
        });
    }

    // skipWaitingによってService Workerがアクティベートされた後、ページをリロードする
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 現在のService Workerが切り替わったら（＝更新が適用されたら）ページをリロード
        window.location.reload();
    });
}