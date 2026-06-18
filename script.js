const currentVersion = "3.1.3";
let lastError = null;
let hasCalculated = false;
let reverseMode = "toStandard";
let hasCalculatedError = false;
let resultHistory = [];
let isStandardOnTop = false; // 標準時刻が上に配置されているかを示す状態変数
const QR_CODE_URL_BASE = "https://fkz1977.github.io/Time-Regulus/";

let inputHelperEnabled = false;
let includeDateEnabled = false;
let includeDateEnabledCorrection = false; // 補正画面用の年月日トグル状態
let autoJumpTimer = null;
let isPickerClosing = false; // ピッカーを閉じる際の一時的な再起動防止ガード（iOSゴーストタップ対策）
let _pendingMainInit = null; // 「開く」ボタン押下後に実行するメイン機能初期化関数を保持する変数
let realTimeInterval = null; // Real Timeチェック時の毎秒更新インターバル
let _standardSecUnlocked = false; // RealTime ONで一度解除したらOFF後も秒を自由入力可能にするフラグ


// セレクトボックス未選択時の灰色表示同期用ヘルパー
function updateSelectPlaceholderColor(selectId) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;
  if (selectEl.value === "") {
    selectEl.classList.add("placeholder-active");
  } else {
    selectEl.classList.remove("placeholder-active");
  }
}

// 日付・時刻入力欄のプレースホルダー色同期用ヘルパー
function updateInputPlaceholderColor(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.value !== "") {
    el.classList.add("has-value");
  } else {
    el.classList.remove("has-value");
  }
}

// すべての入力枠・セレクトボックスのプレースホルダー色・ガイド表示を一括同期する
function syncAllPlaceholderColors() {
  const selectIds = ["standardSeconds", "displaySeconds", "errorSeconds", "reverseDisplaySeconds"];
  selectIds.forEach(id => updateSelectPlaceholderColor(id));

  const dateTimeInputIds = ["displayDate", "displayTime", "standardDate", "standardTime", "errorTime", "reverseDisplayDate", "reverseDisplayTime"];
  dateTimeInputIds.forEach(id => {
    updateInputPlaceholderColor(id);
    
    // ガイド文字用の .time-empty / .date-empty クラスもここで完璧に一括同期！
    const el = document.getElementById(id);
    if (el) {
      if (el.type === "time") {
        if (!el.value) {
          el.classList.add("time-empty");
        } else {
          el.classList.remove("time-empty");
        }
      } else if (el.type === "date") {
        if (!el.value) {
          el.classList.add("date-empty");
        } else {
          el.classList.remove("date-empty");
        }
      }
    }
  });
}

function toggleIncludeDate(enabled) {
  includeDateEnabled = enabled;
  const includeToggle = document.getElementById("includeDateToggle");
  if (includeToggle) includeToggle.checked = enabled;

  const displayGroup = document.getElementById("errorModeDisplayInputGroup");
  const standardGroup = document.getElementById("errorModeStandardInputGroup");

  if (enabled) {
    if (displayGroup) displayGroup.classList.remove("date-omitted");
    if (standardGroup) standardGroup.classList.remove("date-omitted");
  } else {
    if (displayGroup) displayGroup.classList.add("date-omitted");
    if (standardGroup) standardGroup.classList.add("date-omitted");
  }

  // 再計算
  calculateError();
}

function toggleIncludeDateCorrection(enabled) {
  includeDateEnabledCorrection = enabled;
  const includeToggle = document.getElementById("includeDateToggleCorrection");
  if (includeToggle) includeToggle.checked = enabled;

  const isOmit = !enabled;
  const reverseTimeBlock = document.getElementById("reverseTimeBlock");
  if (reverseTimeBlock) {
    const rows = reverseTimeBlock.querySelectorAll(".datetime-row, .datetime-direct-row");
    rows.forEach(row => {
      if (isOmit) {
        row.classList.add("omit-date-active");
      } else {
        row.classList.remove("omit-date-active");
      }
    });
  }

  // 「年月日も計算」がOFFのとき、誤差の「日」の枠も非表示にする
  const errorDaysWrappers = document.querySelectorAll(".error-days-wrapper");
  errorDaysWrappers.forEach(el => {
    if (isOmit) {
      el.classList.add("omit-days-active");
    } else {
      el.classList.remove("omit-days-active");
    }
  });

  // 再計算
  handleReverseCalculation();
}

// 補助パース/フォーマット関数
function parseDateString(dateStr) {
  if (!dateStr) return { y: "", m: "", d: "" };
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return { y: parts[0], m: parts[1], d: parts[2] };
  }
  return { y: "", m: "", d: "" };
}

function parseTimeString(timeStr) {
  if (!timeStr) return { h: "", m: "" };
  const parts = timeStr.split(":");
  if (parts.length === 2) {
    return { h: parts[0], m: parts[1] };
  }
  return { h: "", m: "" };
}

function buildDateString(y, m, d) {
  if (!y && !m && !d) return "";
  const padY = String(y || "").padStart(4, '0');
  const padM = String(m || "").padStart(2, '0');
  const padD = String(d || "").padStart(2, '0');
  if (!y || !m || !d) return "";
  return `${padY}-${padM}-${padD}`;
}

// 各項目の入力状態を一字ごとに判定し、不足なら漢字、入力済なら全角スペースのラベル文字列を返す
function buildMissingLabel(hasY, hasM, hasD, hasH, hasMin, hasSec, showDate) {
  const SP = '\u3000'; // 全角スペース
  // showDate=falseのときは年月日部分を完全に省略、trueのときは入力済や未入力かで漢字/スペース
  const y  = showDate ? (!hasY  ? '年' : SP) : '';
  const mo = showDate ? (!hasM  ? '月' : SP) : '';
  const d  = showDate ? (!hasD  ? '日' : SP) : '';
  const h  = !hasH   ? '時' : SP;
  const mi = !hasMin ? '分' : SP;
  const s  = !hasSec ? '秒' : SP;
  return `⚠ 　${y}${mo}${d}${h}${mi}${s}　が不足`;
}

function buildTimeString(h, min) {
  if (!h && !min) return "";
  const padH = String(h || "").padStart(2, '0');
  const padM = String(min || "").padStart(2, '0');
  if (!h || !min) return "";
  return `${padH}:${padM}`;
}

function toggleInputHelper(enabled) {
  inputHelperEnabled = enabled;
  const toggleErr = document.getElementById("inputHelperToggleError");
  const toggleCorr = document.getElementById("inputHelperToggleCorrection");
  if (toggleErr) toggleErr.checked = enabled;
  if (toggleCorr) toggleCorr.checked = enabled;

  if (enabled) {
    document.body.classList.add("input-helper-on-mode");
    document.body.classList.remove("input-helper-off-mode");
  } else {
    document.body.classList.add("input-helper-off-mode");
    document.body.classList.remove("input-helper-on-mode");
  }

  // 入力補助ONのときは、テンキー左上の「∧∨」キーボードナビゲーションを完全に無効化（グレーアウト）するため、
  // すべての直接入力時分秒フィールドを readonly ＆ tabindex="-1" に設定。
  // 入力補助OFFのときは、手動入力できるように readonly を解除し tabindex="0" に戻す。
  const timeFields = [
    "displayHour_direct", "displayMin_direct", "displaySec_direct",
    "standardHour_direct", "standardMin_direct", "standardSec_direct",
    "errorHours_direct", "errorMinutes_direct", "errorSeconds_direct",
    "reverseDisplayHour_direct", "reverseDisplayMin_direct", "reverseDisplaySec_direct"
  ];
  timeFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      // どのルート（ON/OFF）でも、初回実行時に元の tabindex を確実に保存する
      if (!el.hasAttribute('data-orig-tabindex') && el.hasAttribute('tabindex')) {
        el.setAttribute('data-orig-tabindex', el.getAttribute('tabindex'));
      }

      // 入力補助ONのときでも、テンキー左上の「∧∨」キーボードナビゲーションで到達できるように、
      // readonly と tabindex="-1" には「しない」。常にフォーカス可能（ネイティブキーボードは touchstart 等で抑止済）
      el.readOnly = false;
      if (el.hasAttribute('data-orig-tabindex')) {
        el.setAttribute('tabindex', el.getAttribute('data-orig-tabindex'));
      } else {
        el.tabIndex = 0;
      }
    }
  });

  // 年月日の表示状態を再同期
  toggleIncludeDate(includeDateEnabled);
  toggleIncludeDateCorrection(includeDateEnabledCorrection);

  syncInputValues(enabled); // 双方向引き継ぎ

  // 切り替え後に再計算を走らせる
  calculateError();
  handleReverseCalculation();
}

function syncInputValues(toON) {
  if (toON) {
    // OFF -> ON への同期（日付・日数のみ）
    const dY = document.getElementById("displayYear_direct").value;
    const dM = document.getElementById("displayMonth_direct").value;
    const dD = document.getElementById("displayDay_direct").value;
    document.getElementById("displayDate").value = buildDateString(dY, dM, dD);

    const sY = document.getElementById("standardYear_direct").value;
    const sM = document.getElementById("standardMonth_direct").value;
    const sD = document.getElementById("standardDay_direct").value;
    document.getElementById("standardDate").value = buildDateString(sY, sM, sD);

    const errD = document.getElementById("errorDays_direct").value;
    document.getElementById("errorDays").value = errD;

    const rY = document.getElementById("reverseDisplayYear_direct").value;
    const rM = document.getElementById("reverseDisplayMonth_direct").value;
    const rD = document.getElementById("reverseDisplayDay_direct").value;
    document.getElementById("reverseDisplayDate").value = buildDateString(rY, rM, rD);
  } else {
    // ON -> OFF への同期（日付・日数のみ）
    const dispD = parseDateString(document.getElementById("displayDate").value);
    document.getElementById("displayYear_direct").value = dispD.y;
    document.getElementById("displayMonth_direct").value = dispD.m;
    document.getElementById("displayDay_direct").value = dispD.d;

    const stdD = parseDateString(document.getElementById("standardDate").value);
    document.getElementById("standardYear_direct").value = stdD.y;
    document.getElementById("standardMonth_direct").value = stdD.m;
    document.getElementById("standardDay_direct").value = stdD.d;

    // errorDays は常に errorDays_direct から値を引き継ぐか、同期不要。
    // 入力補助ONでもOFFでも「日」は errorDays_direct を使っているため、
    // errorDays から errorDays_direct への上書きは行わないようにする。
    // (staleな値で上書きされるのを防ぐため)
    const revD = parseDateString(document.getElementById("reverseDisplayDate").value);
    document.getElementById("reverseDisplayYear_direct").value = revD.y;
    document.getElementById("reverseDisplayMonth_direct").value = revD.m;
    document.getElementById("reverseDisplayDay_direct").value = revD.d;
  }
  syncAllPlaceholderColors();
}

// ==========================================================================
// 時：分：秒 三連極上カスタム無限ドラムロールピッカー（Time Regulus Picker）制御システム
// ==========================================================================
let activeTimePickerGroup = null; // "display", "standard", "reverseDisplay", "error"
let drumHour = null;
let drumMin = null;
let drumSec = null;

class TimeRegulusDrum {
  constructor(wheelId, type, onValueChange) {
    this.wheel = document.getElementById(wheelId);
    this.type = type; // "hour", "min", "sec"
    this.onValueChange = onValueChange;
    this.ITEM_HEIGHT = 36;
    this.isWarping = false;
    this.scrollTimeout = null;
    this.items = [];
    this.totalItemsCount = 0;
    this.oneSetHeight = 0;

    this.init();
  }

  init() {
    if (!this.wheel) return;

    // ドラムアイテムの生成
    if (this.type === "hour") {
      for (let i = 0; i <= 23; i++) {
        this.items.push(String(i).padStart(2, '0'));
      }
    } else if (this.type === "min") {
      for (let i = 0; i <= 59; i++) {
        this.items.push(String(i).padStart(2, '0'));
      }
    } else if (this.type === "sec") {
      for (let i = 0; i <= 59; i++) {
        this.items.push(String(i).padStart(2, '0'));
      }
    }

    this.totalItemsCount = this.items.length;
    this.oneSetHeight = this.totalItemsCount * this.ITEM_HEIGHT;

    // 無限ループ用に3セット分連結してDOM要素を生成
    const tripledItems = [...this.items, ...this.items, ...this.items];
    this.wheel.innerHTML = "";

    tripledItems.forEach((val, idx) => {
      const div = document.createElement("div");
      div.className = "picker-item";
      div.innerText = val;
      // "ss" は空文字列、数値は数値型として data-val を設定
      div.setAttribute("data-val", val === "ss" ? "" : parseInt(val, 10));
      div.setAttribute("data-index", idx);

      // 見えている数字をタップすればその数字が選択される仕組み
      div.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.scrollToIndex(idx, true);
      });

      // タッチ操作時のレスポンス向上のためタッチイベントも検知
      div.addEventListener("touchstart", (e) => {
        // スクリュー誤動作防止のため、長押しタップや指がブレない場合のトリガーとしてclickを推奨
      }, { passive: true });

      this.wheel.appendChild(div);
    });

    // スクロールイベント監視による「無限座標ワープ」と「アクティブハイライト」
    this.wheel.addEventListener("scroll", () => {
      if (this.isWarping) return;

      const top = this.wheel.scrollTop;

      // 真ん中のセットから大きくはみ出したら座標ワープ
      if (top < this.oneSetHeight - 360) {
        this.isWarping = true;
        this.wheel.scrollTop = top + this.oneSetHeight;
        setTimeout(() => { this.isWarping = false; }, 10);
      } else if (top > this.oneSetHeight * 2 + 360) {
        this.isWarping = true;
        this.wheel.scrollTop = top - this.oneSetHeight;
        setTimeout(() => { this.isWarping = false; }, 10);
      }

      this.updateActiveItem();

      // スナップ吸着のタイマー監視
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        this.snapToNearest();
      }, 80);
    });
  }

  updateActiveItem() {
    if (!this.wheel) return;

    const viewportHeight = this.wheel.clientHeight || 252;
    const wheelCenter = this.wheel.scrollTop + (viewportHeight / 2);
    const activeIdx = Math.floor(wheelCenter / this.ITEM_HEIGHT);

    const items = this.wheel.getElementsByClassName("picker-item");
    for (let i = 0; i < items.length; i++) {
      items[i].classList.remove("active");
    }

    const activeItem = this.wheel.querySelector(`.picker-item[data-index="${activeIdx}"]`);
    if (activeItem) {
      activeItem.classList.add("active");
      const val = activeItem.getAttribute("data-val");
      this.onValueChange(val);
    }
  }

  snapToNearest() {
    if (this.isWarping || !this.wheel) return;

    const top = this.wheel.scrollTop;
    const viewportHeight = this.wheel.clientHeight || 252;
    // 7項目表示用に拡張されたコンテナの中心に吸着する正確なスナップ位置を算出
    const nearestIdx = Math.round((top + viewportHeight / 2 - this.ITEM_HEIGHT / 2) / this.ITEM_HEIGHT);
    const targetScrollTop = nearestIdx * this.ITEM_HEIGHT - viewportHeight / 2 + this.ITEM_HEIGHT / 2;

    if (Math.abs(this.wheel.scrollTop - targetScrollTop) > 1) {
      this.isWarping = true;
      this.wheel.scrollTo({
        top: targetScrollTop,
        behavior: "smooth"
      });
      setTimeout(() => {
        this.isWarping = false;
        this.updateActiveItem();
      }, 150);
    } else {
      this.updateActiveItem();
    }
  }

  scrollToIndex(index, smooth = false) {
    if (!this.wheel) return;

    const viewportHeight = this.wheel.clientHeight || 252;
    // ターゲットアイテムが完璧にコンテナの中央に配置されるscrollTopを計算
    const targetScrollTop = index * this.ITEM_HEIGHT - viewportHeight / 2 + this.ITEM_HEIGHT / 2;

    this.isWarping = true;
    if (smooth) {
      this.wheel.scrollTo({
        top: targetScrollTop,
        behavior: "smooth"
      });
      setTimeout(() => {
        this.isWarping = false;
        this.updateActiveItem();
      }, 150);
    } else {
      this.wheel.scrollTop = targetScrollTop;
      setTimeout(() => {
        this.isWarping = false;
        this.updateActiveItem();
      }, 40);
    }
  }

  setValue(value) {
    let index = 0;
    if (value !== null && value !== undefined && value !== "") {
      index = parseInt(value, 10);
    } else {
      index = 0; // 空の場合は 00
    }

    // ドラム初期展開時の初期位置設定（setValue）のタイミングでのみ、無限ループの「真ん中のセット」へインデックスを強制補正する
    let targetIdx = index;
    const baseCount = this.totalItemsCount;
    while (targetIdx < baseCount) {
      targetIdx += baseCount;
    }
    while (targetIdx >= baseCount * 2) {
      targetIdx -= baseCount;
    }

    this.scrollToIndex(targetIdx, false);
  }
}

// ドラムで値が変更されたときに背後のHTML要素にリアルタイムに書き込む同期ロジック
function onDrumValueChange() {
  if (!activeTimePickerGroup) return;

  const activeHourEl = document.getElementById("pickerWheelHour").querySelector(".picker-item.active");
  const activeMinEl = document.getElementById("pickerWheelMin").querySelector(".picker-item.active");
  const activeSecEl = document.getElementById("pickerWheelSec").querySelector(".picker-item.active");

  const hVal = activeHourEl ? activeHourEl.getAttribute("data-val") : "0";
  const mVal = activeMinEl ? activeMinEl.getAttribute("data-val") : "0";
  let sVal = activeSecEl ? activeSecEl.getAttribute("data-val") : "";

  // 2桁パディングして hh:mm 形式を組み立て
  const hStr = String(hVal).padStart(2, '0');
  const mStr = String(mVal).padStart(2, '0');
  const timeStr = `${hStr}:${mStr}`;

  let timeEl = null;
  let secEl = null;
  let directH = null, directMin = null, directSec = null;

  if (activeTimePickerGroup === "display") {
    timeEl = document.getElementById("displayTime");
    secEl = document.getElementById("displaySeconds");
    directH = document.getElementById("displayHour_direct");
    directMin = document.getElementById("displayMin_direct");
    directSec = document.getElementById("displaySec_direct");
  } else if (activeTimePickerGroup === "standard") {
    timeEl = document.getElementById("standardTime");
    secEl = document.getElementById("standardSeconds");
    directH = document.getElementById("standardHour_direct");
    directMin = document.getElementById("standardMin_direct");
    directSec = document.getElementById("standardSec_direct");
    if (isStandardOnTop && !_standardSecUnlocked) {
      sVal = "0"; // 標準時刻が上 かつ 秒が未解除の場合は 00秒 に完全固定
    }
  } else if (activeTimePickerGroup === "reverseDisplay") {
    timeEl = document.getElementById("reverseDisplayTime");
    secEl = document.getElementById("reverseDisplaySeconds");
    directH = document.getElementById("reverseDisplayHour_direct");
    directMin = document.getElementById("reverseDisplayMin_direct");
    directSec = document.getElementById("reverseDisplaySec_direct");
  } else if (activeTimePickerGroup === "error") {
    timeEl = document.getElementById("errorTime");
    secEl = document.getElementById("errorSeconds");
    directH = document.getElementById("errorHours_direct");
    directMin = document.getElementById("errorMinutes_direct");
    directSec = document.getElementById("errorSeconds_direct");
  }

  // 背後インプットをリアルタイムに更新（値が異なる場合のみイベント発火）
  if (timeEl && timeEl.value !== timeStr) {
    timeEl.value = timeStr;
    timeEl.dispatchEvent(new Event("change"));
    timeEl.dispatchEvent(new Event("input"));
    updateInputPlaceholderColor(timeEl.id);
  }
  if (secEl && secEl.value !== sVal) {
    secEl.value = sVal;
    secEl.dispatchEvent(new Event("change"));
    secEl.dispatchEvent(new Event("input"));
    updateSelectPlaceholderColor(secEl.id);
  }

  // 表インプット（直接入力枠）を同期
  if (directH && directH.value !== hStr) {
    directH.value = hStr;
    directH.dispatchEvent(new Event("change"));
    directH.dispatchEvent(new Event("input"));
  }
  if (directMin && directMin.value !== mStr) {
    directMin.value = mStr;
    directMin.dispatchEvent(new Event("change"));
    directMin.dispatchEvent(new Event("input"));
  }
  if (directSec) {
    const paddedSec = sVal !== "" ? String(sVal).padStart(2, '0') : "";
    if (directSec.value !== paddedSec) {
      directSec.value = paddedSec;
      directSec.dispatchEvent(new Event("change"));
      directSec.dispatchEvent(new Event("input"));
    }
  }
}

function openTimePicker(group) {
  if (isPickerClosing) return; // 閉じる処理中のゴースト起動を完全ブロック！

  activeTimePickerGroup = group;

  // 既存 of picker-focused をクリア
  document.querySelectorAll(".picker-focused").forEach(el => el.classList.remove("picker-focused"));

  // 対象の要素に picker-focused クラスを付与して一体発光を維持（指示①）
  if (group === "display") {
    const row = document.querySelector("#errorModeDisplayInputGroup .time-capsule-wrapper");
    if (row) row.classList.add("picker-focused");
  } else if (group === "standard") {
    const row = document.querySelector("#errorModeStandardInputGroup .time-capsule-wrapper");
    if (row) row.classList.add("picker-focused");
  } else if (group === "reverseDisplay") {
    const row = document.querySelector("#reverseTimeBlock .time-capsule-wrapper");
    if (row) row.classList.add("picker-focused");
  } else if (group === "error") {
    const row = document.querySelector("#correctionMode .flex-wrap.input-helper-on .unit-capsule-wrapper");
    if (row) row.classList.add("picker-focused");
  }

  const overlay = document.getElementById("pickerOverlay");
  const sheet = document.getElementById("regulusTimePicker");
  const titleEl = document.getElementById("pickerTitle");
  if (!overlay || !sheet) return;

  // タイトルのネーム変更
  if (group === "display") {
    if (titleEl) titleEl.innerText = "表示時刻を選択";
  } else if (group === "standard") {
    if (titleEl) titleEl.innerText = "標準時刻を選択";
  } else if (group === "reverseDisplay") {
    const labelEl = document.getElementById("reverseTimeLabel");
    if (titleEl) titleEl.innerText = (labelEl ? labelEl.innerText.replace(":", "") : "表示時刻") + "を選択";
  } else if (group === "error") {
    if (titleEl) titleEl.innerText = "誤差時間を選択";
  }

  // 標準時刻が上の場合の秒ホイールロック制御
  const secContainer = document.getElementById("pickerWheelSec").parentElement;
  if (group === "standard" && isStandardOnTop && !_standardSecUnlocked) {
    if (secContainer) secContainer.classList.add("sec-locked");
  } else {
    if (secContainer) secContainer.classList.remove("sec-locked");
  }

  overlay.classList.add("show");
  sheet.classList.add("show");
  document.body.classList.add("result-highlighted"); // ぼかし解除を即時適用
  document.body.classList.add("picker-open-padding"); // スクロール限界に達しないよう最下部に余白を追加

  // 【バグ修正】強制リフローを実行して、ブラウザに「余白が追加された後の高さ」を即座に認識させる
  document.body.offsetHeight; 

  // 【バグ修正】ディレイを10msから80msに延ばし、ブラウザのスクロール最大上限の更新を確実に待ってから実行
  setTimeout(() => {
    const targetResultId = (group === "display" || group === "standard") ? "result" : "reverseResult";
    const targetEl = document.getElementById(targetResultId);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const pickerHeight = 390; // ピッカーの高さ350px + 余白
      if (rect.bottom > window.innerHeight - pickerHeight) {
        window.scrollBy({ top: rect.bottom - (window.innerHeight - pickerHeight), behavior: "smooth" });
      }
    }
    
    // スムーズスクロール完了後に画面ロックを適用
    setTimeout(() => {
      document.body.classList.add("scroll-locked");
    }, 400);
  }, 80);

  // 現在の入力値を読み取り
  let hNum = 0;
  let mNum = 0;
  let sVal = "0"; // 空欄時は 00秒 がデフォルト

  let directH = null, directMin = null, directSec = null;
  if (group === "display") {
    directH = document.getElementById("displayHour_direct");
    directMin = document.getElementById("displayMin_direct");
    directSec = document.getElementById("displaySec_direct");
  } else if (group === "standard") {
    directH = document.getElementById("standardHour_direct");
    directMin = document.getElementById("standardMin_direct");
    directSec = document.getElementById("standardSec_direct");
  } else if (group === "reverseDisplay") {
    directH = document.getElementById("reverseDisplayHour_direct");
    directMin = document.getElementById("reverseDisplayMin_direct");
    directSec = document.getElementById("reverseDisplaySec_direct");
  } else if (group === "error") {
    directH = document.getElementById("errorHours_direct");
    directMin = document.getElementById("errorMinutes_direct");
    directSec = document.getElementById("errorSeconds_direct");
  }

  if (directH && directH.value !== "") hNum = parseInt(directH.value, 10);
  if (directMin && directMin.value !== "") mNum = parseInt(directMin.value, 10);
  if (directSec && directSec.value !== "") sVal = parseInt(directSec.value, 10);

  if (group === "standard" && isStandardOnTop && !_standardSecUnlocked) {
    sVal = "0"; // ロック時は00固定
  }

  // 各ドラムホイールの初期位置設定（アニメーションなしで即座にスクロール）
  if (drumHour) drumHour.setValue(hNum);
  if (drumMin) drumMin.setValue(mNum);
  if (drumSec) drumSec.setValue(sVal);
}

function closeTimePicker() {
  const overlay = document.getElementById("pickerOverlay");
  const sheet = document.getElementById("regulusTimePicker");
  if (overlay) overlay.classList.remove("show");
  if (sheet) sheet.classList.remove("show");
  document.body.classList.remove("scroll-locked"); // 裏画面スクロールロック解除！
  document.body.classList.remove("result-highlighted");
  document.body.classList.remove("picker-open-padding"); // 余白を解除

  // picker-focused をクリア（指示①）
  document.querySelectorAll(".picker-focused").forEach(el => el.classList.remove("picker-focused"));

  activeTimePickerGroup = null;

  // 強制的に入力フォーカスを外してキーボードやiOSスクロールの誤動作を防止
  if (document.activeElement && document.activeElement.tagName === "INPUT") {
    document.activeElement.blur();
  }

  // iOSのタップすり抜け・ゴーストタップによる即時再起動を防ぐため、400msの間起動をブロック
  isPickerClosing = true;
  setTimeout(() => {
    isPickerClosing = false;
  }, 400);
}

function checkPass() {
  const inputField = document.getElementById("passcode");
  const input = inputField.value;
  const correct = "164";
  const DECOY_PASS = "12345"; // 元祖ダミー画面（タイマー機能付き）用パスワード
  const VIEW_LOCK_PASS = "7777"; // 新しいダミー時計画面（ネオン時計）用パスワード
  const errorMessage = document.getElementById("error");

  if (input === DECOY_PASS) {
    // 囮パスワード → ダミー時計画面へ
    inputField.value = "";
    inputField.style.border = "";
    errorMessage.innerText = "";
    showDecoyScreen();
    return;
  }

  if (input === VIEW_LOCK_PASS) {
    // 第2の囮パスワード → view_lock_screenへ
    inputField.value = "";
    inputField.style.border = "";
    errorMessage.innerText = "";
    showViewLockScreen();
    return;
  }

  if (input === correct) {
    document.getElementById("lockScreen").style.display = "none";
    document.getElementById("modeSelect").style.display = "block";
    inputField.blur();
    inputField.style.border = "";
    errorMessage.innerText = "";
    gtag('event', 'unlock_success'); // Google Analyticsイベント
    // ■ フェーズ2実行：認証成功後にメイン機能を初期化（テンキー操作中の割り込みを完全回避）
    if (typeof _pendingMainInit === 'function') {
      _pendingMainInit();
      _pendingMainInit = null; // 二重実行防止
    }
  } else {
    errorMessage.innerText = "暗証番号が違います";
    inputField.style.border = "2px solid red";
    inputField.value = "";
    inputField.focus();
    generateKeypad();
  }
}

/* ============================================================
   第2のおとり画面 (view_lock_screen) ロジック
   ============================================================ */
let _viewLockClockTimer = null;
let _viewLockHoldTimer = null;
let _viewLockStyleInterval = null;
let _viewLockCurrentFormat = 'standard';
let _viewLockScaleFactor = 1.0;
// viewLockScreen 長押しジェスチャー用モジュールレベル状態
// クロージャの代わりに名前付き関数を使うことで removeEventListener が確実に機能する
let _vlPressStartTime = 0;
let _vlIsLongPressSuccess = false;
let _vlBlockingClick = false;
// スワイプ・ダブルタップ・フォント切り替え管理
let _viewLockCurrentFontIndex = 0;   // 現在のフォントインデックス
let _viewLockCurrentFormatIndex = 0; // 現在のフォーマットインデックス
let _vlRandomMode = 0;               // 0: OFF, 1: COLOR, 2: FONT, 3: ALL
let _vlLastTapTime = 0;              // ダブルタップ検出用：前回タップ時刻
let _vlTapCount = 0;                 // タップ回数カウント用
let _vlSwipeStartY = 0;              // スワイプ開始Y座標
let _vlSwipeStartX = 0;              // スワイプ開始X座標
let _viewLockShowDate = false;       // シングルタップでの日付表示切り替え
let _vlSingleTapTimer = null;        // シングルタップとダブルタップの判別用タイマー
let _vlGlowIntensity = 1.0;          // ネオンの輝き強度（0.1〜2.0）
let _vlCurrentGlowColor = '0, 255, 240'; // 現在のネオンカラー（RGB文字列）

const VIEW_LOCK_FONTS = [
  // ── デジタル・SF系 ──────────────────────────────────────
  'Orbitron',          // SFっぽい未来的デジタル
  'VT323',             // レトロゲーム・CRTモニター風ドット文字
  'Share Tech Mono',   // シャープでクリーンなデジタルモノスペース
  'Sixtyfour',         // 64セグメントの超ユニークデジタル
  // ── かすれ・消えそう系 ───────────────────────────────────
  'Rubik Dirt',        // 土ぼこり・傷ついてかすれた文字
  'Moirai One',        // 波打つように消えかかった神秘的な文字
  // ── ぐるぐる・立体系 ─────────────────────────────────────
  'Bungee Shade',      // 影が立体的でくるっとしたポップ文字
  // ── 個性的・エレガント系 ─────────────────────────────────
  'Diplomata SC',      // 古典的・彫刻のような重厚感のある文字
  'Bellefair',         // 繊細でエレガントな細身の文字
];

// 合計20パターン：標準:8, 全角:4, 漢字系各1（計4）, ローマ:3　※漢字系は出現頻度を絞る
const VIEW_LOCK_FORMATS = [
  'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard', 'standard',
  'fullwidth', 'fullwidth', 'fullwidth', 'fullwidth',
  'kanji',
  'old_kanji',
  'kanji_digit',
  'old_kanji_digit',
  'roman', 'roman', 'roman'
];

function _toKanji(num) {
  const kanjiNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (num < 10) return kanjiNums[num];
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  return (tens > 1 ? kanjiNums[tens] : '') + '十' + (ones > 0 ? kanjiNums[ones] : '');
}

function _toOldKanji(num) {
  const oldKanjiNums = ['零', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖'];
  if (num < 10) return oldKanjiNums[num];
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  return (tens > 1 ? oldKanjiNums[tens] : '') + '拾' + (ones > 0 ? oldKanjiNums[ones] : '');
}

function _toKanjiDigit(num) {
  const kanjiNums = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const str = String(num).padStart(2, '0');
  return kanjiNums[parseInt(str[0])] + kanjiNums[parseInt(str[1])];
}

function _toOldKanjiDigit(num) {
  const oldKanjiNums = ['零', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖'];
  const str = String(num).padStart(2, '0');
  return oldKanjiNums[parseInt(str[0])] + oldKanjiNums[parseInt(str[1])];
}

function _toRoman(num) {
  if (num === 0) return "0";
  const lookup = {L:50, XL:40, X:10, IX:9, V:5, IV:4, I:1};
  let roman = '';
  for (let i in lookup) {
    while (num >= lookup[i]) {
      roman += i;
      num -= lookup[i];
    }
  }
  return roman;
}

const VIEW_LOCK_COLORS = [
  '255, 0, 170',   // 1. ピンク（赤系・タイムレグルス色）
  '255, 128, 0',   // 2. オレンジ
  '255, 255, 0',   // 3. 黄色
  '0, 255, 128',   // 4. 緑色
  '0, 255, 240',   // 5. シアン（標準）
  '0, 100, 255',   // 6. 藍色
  '170, 0, 255',   // 7. 紫色
  '255, 255, 255'  // 8. 白色
];

function changeViewLockStyle(reason = "tick") {
  const isTickOrToggle = (reason === "tick" || reason === "toggle");

  // フォント：ランダムモード2(FONT)または3(ALL)時の自動更新
  if (isTickOrToggle && (_vlRandomMode === 2 || _vlRandomMode === 3)) {
    _viewLockCurrentFontIndex = Math.floor(Math.random() * VIEW_LOCK_FONTS.length);
  }
  
  const randomFont = VIEW_LOCK_FONTS[_viewLockCurrentFontIndex];
  const clockEl = document.getElementById("viewLockClock");
  if (clockEl) {
    clockEl.style.fontFamily = randomFont;
  }
  
  // フォーマット・スケールの変更は、初期化時またはフォントランダム時
  if (reason === "init" || (isTickOrToggle && (_vlRandomMode === 2 || _vlRandomMode === 3))) {
    _viewLockCurrentFormatIndex = Math.floor(Math.random() * VIEW_LOCK_FORMATS.length);
    _viewLockScaleFactor = 0.75 + Math.random() * 0.25;
  }
  
  // 色の変更は、初期化時またはカラーランダム時
  if (reason === "init" || (isTickOrToggle && (_vlRandomMode === 1 || _vlRandomMode === 3))) {
    _vlCurrentGlowColor = VIEW_LOCK_COLORS[Math.floor(Math.random() * VIEW_LOCK_COLORS.length)];
  }
  // ネオン輝きを現在のカラーと強度で適用（初期・ティック・スワイプ全て共通）
  if (clockEl) {
    const g = _vlGlowIntensity;
    clockEl.style.textShadow = `
      0 0 10px rgba(${_vlCurrentGlowColor}, ${Math.min(1, 0.8 * g)}),
      0 0 20px rgba(${_vlCurrentGlowColor}, ${Math.min(1, 0.6 * g)}),
      0 0 40px rgba(${_vlCurrentGlowColor}, ${Math.min(1, 0.4 * g)}),
      0 0 80px rgba(${_vlCurrentGlowColor}, ${Math.min(1, 0.2 * g)})
    `;
  }
  _viewLockCurrentFormat = VIEW_LOCK_FORMATS[_viewLockCurrentFormatIndex];
  
  _updateViewLockClock();
  
  // 位置のランダム移動：スワイプ時（フォント確認中）は動かさない。それ以外（1分ごとの更新など）はバーンイン防止のため動かす。
  if (reason !== "swipe") {
    setTimeout(() => {
      if (!clockEl) return;
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      
      const w = clockEl.offsetWidth;
      const h = clockEl.offsetHeight;
      
      const maxX = Math.max(0, (winW - w) / 2);
      const maxY = Math.max(0, (winH - h) / 2);
      
      const randomX = (Math.random() * 2 - 1) * maxX;
      const randomY = (Math.random() * 2 - 1) * maxY;
      
      clockEl.style.transform = `translate(${randomX}px, ${randomY}px)`;
    }, 350);
  }
}

let _viewLockResizeTimer = null;
function _handleViewLockResize() {
  clearTimeout(_viewLockResizeTimer);
  _viewLockResizeTimer = setTimeout(() => {
    const clockEl = document.getElementById("viewLockClock");
    if (!clockEl || clockEl.style.display === "none") return;
    
    // ★【バグ修正】画面の回転・リサイズに合わせてフォントサイズを再計算させる
    _updateViewLockClock();
    
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const w = clockEl.offsetWidth;
    const h = clockEl.offsetHeight;
    
    // Flexboxのtransform方式に対応した画面外はみ出し補正
    const transformStr = clockEl.style.transform;
    let currentX = 0;
    let currentY = 0;
    
    if (transformStr) {
      const match = transformStr.match(/translate\(([^p]+)px,\s*([^p]+)px\)/);
      if (match) {
        currentX = parseFloat(match[1]);
        currentY = parseFloat(match[2]);
      }
    }
    
    if (isNaN(currentX) || isNaN(currentY)) return;
    
    const maxX = Math.max(0, (winW - w) / 2);
    const maxY = Math.max(0, (winH - h) / 2);
    
    let changed = false;
    
    if (currentX < -maxX) { currentX = -maxX; changed = true; }
    if (currentX > maxX) { currentX = maxX; changed = true; }
    
    if (currentY < -maxY) { currentY = -maxY; changed = true; }
    if (currentY > maxY) { currentY = maxY; changed = true; }
    
    if (changed) {
      clockEl.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }
  }, 100);
}

function showViewLockScreen() {
  if (typeof gtag === 'function') {
    gtag('event', 'view_clock_screen_triggered', {
      'event_category': 'Security',
      'event_label': 'View Lock Screen Triggered'
    });
  }

  document.getElementById("lockScreen").style.display = "none";
  const viewLock = document.getElementById("viewLockScreen");
  viewLock.style.display = "block";

  // 入室時：ランダムフォントを1つ選択し、モードをOFF（手動スワイプ切替）でスタート
  _viewLockCurrentFontIndex = Math.floor(Math.random() * VIEW_LOCK_FONTS.length);
  _vlRandomFontMode = false;
  _vlLastTapTime = 0;
  changeViewLockStyle("init");
  
  // setInterval(changeViewLockStyle, 60000) は削除。
  // スタイル変更は _updateViewLockClock 内の分切り替わり検知で処理します。
  _viewLockClockTimer = setInterval(_updateViewLockClock, 1000);
  
  window.addEventListener('resize', _handleViewLockResize);
  
  // ★【省電力】画面が非表示（スリープ・タブ切替）になったらタイマーを停止し、戻ったら再開する
  function _viewLockVisibilityHandler() {
    if (document.hidden) {
      // 画面が隠れた → タイマーを一時停止
      if (_viewLockClockTimer) { clearInterval(_viewLockClockTimer); _viewLockClockTimer = null; }
    } else {
      // 画面が戻った → タイマーを再開し、時刻を即時更新
      _updateViewLockClock();
      _viewLockClockTimer = setInterval(_updateViewLockClock, 1000);
    }
  }
  document.addEventListener('visibilitychange', _viewLockVisibilityHandler);
  // クリーンアップ用にリスナーを保存
  viewLock._visibilityHandler = _viewLockVisibilityHandler;
  
  initViewLockHold();
}

let _lastViewLockMinute = -1; // 分の切り替わり検知用

function _updateViewLockClock() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  
  const s = now.getSeconds();
  
  // ★「分」の切り替わり時にスタイルを自動ランダム変更
  if (_lastViewLockMinute !== -1 && _lastViewLockMinute !== m) {
    // 【バグ修正】ここで先に_lastViewLockMinuteを更新しないと、changeViewLockStyle内で
    // 再度_updateViewLockClockが呼ばれた際に無限ループに陥ってしまう
    _lastViewLockMinute = m;
    changeViewLockStyle("tick");
    return;
  }
  _lastViewLockMinute = m;
  
  let timeStr = "";
  let dateStr = "";
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const reiwaYear = year >= 2019 ? year - 2018 : 1;
  
  switch (_viewLockCurrentFormat) {
    case 'fullwidth':
      const fw_h = String(h).padStart(2, '0').replace(/[0-9]/g, str => String.fromCharCode(str.charCodeAt(0) + 0xFEE0));
      const fw_m = String(m).padStart(2, '0').replace(/[0-9]/g, str => String.fromCharCode(str.charCodeAt(0) + 0xFEE0));
      timeStr = `${fw_h}：${fw_m}`;
      const fw_y = String(year).replace(/[0-9]/g, str => String.fromCharCode(str.charCodeAt(0) + 0xFEE0));
      const fw_mo = String(month).padStart(2, '0').replace(/[0-9]/g, str => String.fromCharCode(str.charCodeAt(0) + 0xFEE0));
      const fw_d = String(date).padStart(2, '0').replace(/[0-9]/g, str => String.fromCharCode(str.charCodeAt(0) + 0xFEE0));
      dateStr = `${fw_y}年${fw_mo}月${fw_d}日`;
      break;
    case 'kanji':
      timeStr = `${_toKanji(h)}時${_toKanji(m)}分`;
      dateStr = `令和${reiwaYear === 1 ? '元' : _toKanji(reiwaYear)}年${_toKanji(month)}月${_toKanji(date)}日`;
      break;
    case 'old_kanji':
      timeStr = `${_toOldKanji(h)}時${_toOldKanji(m)}分`;
      dateStr = `令和${reiwaYear === 1 ? '元' : _toOldKanji(reiwaYear)}年${_toOldKanji(month)}月${_toOldKanji(date)}日`;
      break;
    case 'kanji_digit':
      timeStr = `${_toKanjiDigit(h)}：${_toKanjiDigit(m)}`;
      dateStr = `令和${reiwaYear === 1 ? '元' : _toKanjiDigit(reiwaYear)}年${_toKanjiDigit(month)}月${_toKanjiDigit(date)}日`;
      break;
    case 'old_kanji_digit':
      timeStr = `${_toOldKanjiDigit(h)}：${_toOldKanjiDigit(m)}`;
      dateStr = `令和${reiwaYear === 1 ? '元' : _toOldKanjiDigit(reiwaYear)}年${_toOldKanjiDigit(month)}月${_toOldKanjiDigit(date)}日`;
      break;
    case 'roman':
      timeStr = `${_toRoman(h)} : ${_toRoman(m)}`;
      dateStr = `${_toRoman(year)} . ${_toRoman(month)} . ${_toRoman(date)}`;
      break;
    case 'standard':
    default:
      timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      dateStr = `${year}/${String(month).padStart(2, '0')}/${String(date).padStart(2, '0')}`;
      break;
  }
  const clockEl = document.getElementById("viewLockClock");
  const dateEl = document.getElementById("viewLockDate");
  
  // 独立した日付枠は使用しないため常に非表示
  if (dateEl) {
    dateEl.style.display = "none";
  }

  if (clockEl) {
    if (_viewLockShowDate) {
      clockEl.innerHTML = `<div style="font-size: 0.6em; line-height: 1.2; margin-bottom: 0.1em; text-align: center;">${dateStr}</div><div style="text-align: center;">${timeStr}</div>`;
    } else {
      clockEl.innerText = timeStr;
    }

    
    // 表示される文字列の長さに応じて、画面幅（vw）に対する最大フォントサイズを動的に計算する
    // 日付表示時は日付文字列の幅も比較に含め、はみ出しを防ぐ
    const refStr = (_viewLockShowDate && dateStr && dateStr.length > timeStr.length)
      ? dateStr
      : timeStr;
    let emWidth = 0;
    for (let i = 0; i < refStr.length; i++) {
      if (refStr.charCodeAt(i) > 255) {
        emWidth += 1.05;
      } else {
        emWidth += 0.65;
      }
    }
    // 日付が0.6emで表示される場合、時刻より幅が広くなる影響も考慮する
    // → dateStrが refStrに選ばれた場合は、実際に0.6倍の大きさなので逆算する必要はない（すでに小さい内側に嵌まるため）
    
    let maxVw = 95 / emWidth;
    let calculatedVw = maxVw * _viewLockScaleFactor;
    
    // vh上限も95%まで拡大
    const vhLimit = 95 * _viewLockScaleFactor;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    let fontSizePx = (calculatedVw / 100) * winW;
    let maxFontSizePxByVh = (vhLimit / 100) * winH;
    
    let finalPx = Math.min(fontSizePx, maxFontSizePxByVh);
    if (finalPx < 60) finalPx = 60; // 下限 60px
    
    // ★【バグ修正】CSSアニメーション（transition）が設定されていると、
    // offsetWidthの測定値がアニメーション途中の値になってしまい、サイズが振動するバグを防ぐ
    const originalTransition = clockEl.style.transition;
    clockEl.style.transition = 'none';
    
    clockEl.style.fontSize = finalPx + 'px';
    
    // ★【はみ出し完全防止】フォントごとの文字幅・高さの違い（複数行や特殊フォント対策）
    // 実際にブラウザが計算した文字幅と高さを取得し、画面サイズを超えていたら縮小する
    const actualWidth = clockEl.offsetWidth;
    const actualHeight = clockEl.offsetHeight;
    const targetMaxWidth = winW * 0.95;
    const targetMaxHeight = winH * 0.95;
    
    let scaleDownRatio = 1;
    if (actualWidth > targetMaxWidth) {
      scaleDownRatio = Math.min(scaleDownRatio, targetMaxWidth / actualWidth);
    }
    if (actualHeight > targetMaxHeight) {
      scaleDownRatio = Math.min(scaleDownRatio, targetMaxHeight / actualHeight);
    }
    
    if (scaleDownRatio < 1) {
      finalPx = finalPx * scaleDownRatio;
      clockEl.style.fontSize = finalPx + 'px';
    }
    
    // 変更をブラウザに反映（強制リフロー）させた後、アニメーション設定を元に戻す
    void clockEl.offsetWidth;
    clockEl.style.transition = originalTransition;
  }
}


/* ============================================================
   ロック画面のアニメーションを強制再起動する
   decoyScreen / viewLockScreen から戻ったときに呼び出す。
   CSS animation のクラスを一度外して強制リフローをかけ、再連結して再生させる。
   ============================================================ */
function restartLockScreenAnimation() {
  const lockScreen = document.getElementById('lockScreen');
  if (!lockScreen) return;
  
  // キーパッドのシャッフル・再生成を統合
  if (typeof generateKeypad === 'function') {
    generateKeypad();
  }

  const animEls = lockScreen.querySelectorAll('.anim-title-rise, .anim-slow-fade');
  animEls.forEach(el => {
    const hasTitleRise = el.classList.contains('anim-title-rise');
    const hasSlowFade  = el.classList.contains('anim-slow-fade');
    if (hasTitleRise) el.classList.remove('anim-title-rise');
    if (hasSlowFade)  el.classList.remove('anim-slow-fade');
    void el.offsetWidth; // 強制リフロー（animationのリセットに必要）
    if (hasTitleRise) el.classList.add('anim-title-rise');
    if (hasSlowFade)  el.classList.add('anim-slow-fade');
  });
}

/* ============================================================
   viewLockScreen フラッシュメッセージ表示（RANDOM START/STOP）
   ============================================================ */
function _vlShowFlash(text, colorRGB = "0,255,224") {
  const viewLock = document.getElementById("viewLockScreen");
  if (!viewLock) return;
  // 既存フラッシュがあれば削除
  const existing = viewLock.querySelector('.vl-flash-msg');
  if (existing) existing.remove();

  const flash = document.createElement("div");
  flash.className = "vl-flash-msg";
  flash.textContent = text;
  flash.style.cssText = [
    "position:fixed",
    "top:50%",
    "left:50%",
    "transform:translate(-50%,-50%) scale(0.5)",
    "font-size:min(6.5vw,42px)",
    `color:rgba(${colorRGB},1)`,
    `text-shadow:0 0 20px rgba(${colorRGB},0.9),0 0 40px rgba(${colorRGB},0.6)`,
    "font-family:'Orbitron',sans-serif",
    "font-weight:bold",
    "text-align:center",
    "z-index:9999",
    "pointer-events:none",
    "letter-spacing:0.05em",
    "white-space:nowrap",
    "animation:vlFlashAnim 1.5s ease-out forwards"
  ].join(";");
  viewLock.appendChild(flash);
  setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 1600);
}

/* ============================================================
   viewLockScreen ランダムモード切り替え
   ============================================================ */
function _vlCycleRandomMode() {
  _vlRandomMode = (_vlRandomMode + 1) % 4;
  
  if (_vlRandomMode === 1) {
    _vlShowFlash("ＣＯＬＯＲ　ＲＡＮＤＯＭ", "255,128,0");
    changeViewLockStyle("toggle");
  } else if (_vlRandomMode === 2) {
    _vlShowFlash("ＦＯＮＴ　ＲＡＮＤＯＭ", "0,255,128");
    changeViewLockStyle("toggle");
  } else if (_vlRandomMode === 3) {
    _vlShowFlash("ＡＬＬ　ＲＡＮＤＯＭ", "0,255,240");
    changeViewLockStyle("toggle");
  } else {
    _vlShowFlash("ＲＡＮＤＯＭ　ＯＦＦ", "255,0,170");
  }
}

/* ============================================================
   viewLockScreen ネオンカラー順次変更（ダブルタップ用）
   ============================================================ */
function _vlCycleNeonColor() {
  let currentIndex = VIEW_LOCK_COLORS.indexOf(_vlCurrentGlowColor);
  if (currentIndex === -1) currentIndex = 0;
  const nextIndex = (currentIndex + 1) % VIEW_LOCK_COLORS.length;
  _vlCurrentGlowColor = VIEW_LOCK_COLORS[nextIndex];
  _vlShowFlash("ＣＯＬＯＲ　ＣＨＡＮＧＥ", _vlCurrentGlowColor);
  changeViewLockStyle("swipe"); // 位置移動なしでスタイル再適用
}

// ──────────────────────────────────────────────────────────────
// viewLockScreen 長押しジェスチャー ハンドラ群（モジュールレベル名前付き関数）
// クロージャではなく名前付き関数にすることで、removeEventListener による
// 完全なリスナー削除が可能になり、孤児タイマー問題を根本解決する。
// ──────────────────────────────────────────────────────────────

// iPhoneのghost click（幽霊クリック）をブロックするハンドラ
function _vlClickBlocker(e) {
  if (_vlBlockingClick) {
    e.stopPropagation();
    e.preventDefault();
  }
}

// 指離し（touchend / mouseup）ハンドラ
function _vlEndHold(e) {
  if (_vlIsLongPressSuccess) return;
  clearTimeout(_viewLockHoldTimer);
  _viewLockHoldTimer = null;
  const ring = document.getElementById("viewLockHoldRing");
  const circle = document.getElementById("viewLockRingCircle");
  if (ring) ring.style.opacity = "0";
  if (circle) {
    circle.style.transition = "stroke-dashoffset 0.1s linear";
    circle.style.strokeDashoffset = "164";
  }

  if (_vlPressStartTime === 0) return;
  const elapsed = Date.now() - _vlPressStartTime;
  _vlPressStartTime = 0; // 必ずリセット

  const touch = e.changedTouches ? e.changedTouches[0] : e;
  const endY = touch ? touch.clientY : _vlSwipeStartY;
  const endX = touch ? touch.clientX : _vlSwipeStartX;
  const deltaY = _vlSwipeStartY - endY;      // 正: 上スワイプ（指が上）/ 負: 下スワイプ（指が下）
  const deltaX = _vlSwipeStartX - endX;       // 正: 左スワイプ（指が左）/ 負: 右スワイプ（指が右）
  const absDeltaY = Math.abs(deltaY);
  const absDeltaX = Math.abs(deltaX);

  if (absDeltaX > 25 && absDeltaX > absDeltaY && elapsed < 700) {
    // ─── 横スワイプ検出 — フォント＋フォーマット切替 ───
    if (_vlRandomMode === 2 || _vlRandomMode === 3) {
      _viewLockCurrentFontIndex = Math.floor(Math.random() * VIEW_LOCK_FONTS.length);
      _viewLockCurrentFormatIndex = Math.floor(Math.random() * VIEW_LOCK_FORMATS.length);
    } else {
      if (deltaX > 0) {
        // 左スワイプ → 前のフォント＋フォーマット
        _viewLockCurrentFontIndex = (_viewLockCurrentFontIndex - 1 + VIEW_LOCK_FONTS.length) % VIEW_LOCK_FONTS.length;
        _viewLockCurrentFormatIndex = (_viewLockCurrentFormatIndex - 1 + VIEW_LOCK_FORMATS.length) % VIEW_LOCK_FORMATS.length;
      } else {
        // 右スワイプ → 次のフォント＋フォーマット
        _viewLockCurrentFontIndex = (_viewLockCurrentFontIndex + 1) % VIEW_LOCK_FONTS.length;
        _viewLockCurrentFormatIndex = (_viewLockCurrentFormatIndex + 1) % VIEW_LOCK_FORMATS.length;
      }
    }
    changeViewLockStyle("swipe");
  } else if (absDeltaY > 25 && absDeltaY > absDeltaX && elapsed < 700) {
    // ─── 縦スワイプ検出 — ネオン輝き強度の増減 ───
    const step = 0.2;
    if (deltaY > 0) {
      // 上スワイプ → 輝き強く
      _vlGlowIntensity = Math.min(2.0, _vlGlowIntensity + step);
    } else {
      // 下スワイプ → 輝き弱く
      _vlGlowIntensity = Math.max(0.1, _vlGlowIntensity - step);
    }
    changeViewLockStyle("swipe");
  } else if (elapsed < 400 && absDeltaY <= 20 && absDeltaX <= 20) {
    // ─── タップ検出（スワイプでない） ───
    const now = Date.now();
    if (_vlLastTapTime > 0 && now - _vlLastTapTime > 400) {
      _vlTapCount = 0; // 400ms以上空いたらリセット
    }
    _vlLastTapTime = now;
    _vlTapCount++;

    if (_vlSingleTapTimer) {
      clearTimeout(_vlSingleTapTimer);
      _vlSingleTapTimer = null;
    }

    if (_vlTapCount === 3) {
      // トリプルタップ → ランダムモード切り替え
      _vlTapCount = 0;
      _vlCycleRandomMode();
    } else {
      // シングルタップ/ダブルタップ → 確定待ちタイマーをセット
      _vlSingleTapTimer = setTimeout(() => {
        const count = _vlTapCount;
        _vlTapCount = 0;
        _vlLastTapTime = 0;
        
        if (count === 1) {
          // シングルタップ → 日付表示のトグル
          _viewLockShowDate = !_viewLockShowDate;
          _updateViewLockClock();
          // 日付追加で要素が上に拡大しても画面外にはみ出さないよう位置を再クランプ
          setTimeout(() => {
            const clockEl = document.getElementById("viewLockClock");
            if (!clockEl) return;
            const winW = window.innerWidth;
            const winH = window.innerHeight;
            const transformStr = clockEl.style.transform;
            let currentX = 0, currentY = 0;
            if (transformStr) {
              const match = transformStr.match(/translate\(([^p]+)px,\s*([^p]+)px\)/);
              if (match) { currentX = parseFloat(match[1]); currentY = parseFloat(match[2]); }
            }
            if (isNaN(currentX) || isNaN(currentY)) return;
            const w = clockEl.offsetWidth;
            const h = clockEl.offsetHeight;
            const maxX = Math.max(0, (winW - w) / 2);
            const maxY = Math.max(0, (winH - h) / 2);
            let cx = Math.max(-maxX, Math.min(maxX, currentX));
            let cy = Math.max(-maxY, Math.min(maxY, currentY));
            if (cx !== currentX || cy !== currentY) {
              clockEl.style.transform = `translate(${cx}px, ${cy}px)`;
            }
          }, 50);
        } else if (count === 2) {
          // ダブルタップ → ネオンカラー順次変更
          _vlCycleNeonColor();
        }
      }, 400);
    }
    // iOSのghost clickをブロック
    _vlBlockingClick = true;
    setTimeout(() => { _vlBlockingClick = false; }, 300);
  }
}

// スワイプ中の指移動（touchmove / mousemove）ハンドラ：長押しをキャンセル
function _vlMoveHold(e) {
  if (!_vlPressStartTime) return;
  const touch = e.touches ? e.touches[0] : e;
  const moveY = touch.clientY;
  const moveX = touch.clientX;
  
  // 開始位置から20px以上動いたら長押しをキャンセル（リングも消す）
  if (Math.abs(moveY - _vlSwipeStartY) > 20 || Math.abs(moveX - _vlSwipeStartX) > 20) {
    if (_viewLockHoldTimer) {
      clearTimeout(_viewLockHoldTimer);
      _viewLockHoldTimer = null;
      const ring = document.getElementById("viewLockHoldRing");
      const circle = document.getElementById("viewLockRingCircle");
      if (ring) ring.style.opacity = "0";
      if (circle) {
        circle.style.transition = "stroke-dashoffset 0.1s linear";
        circle.style.strokeDashoffset = "164";
      }
    }
  }
}

// 指触れ（touchstart / mousedown）ハンドラ
function _vlStartHold(e) {
  if (e.cancelable) e.preventDefault();
  
  // 連続スワイプ・マルチタッチ等によるタイマーの重複（孤児化）を防止
  if (_viewLockHoldTimer) {
    clearTimeout(_viewLockHoldTimer);
    _viewLockHoldTimer = null;
  }

  _vlIsLongPressSuccess = false;
  _vlPressStartTime = Date.now();
  const ring = document.getElementById("viewLockHoldRing");
  const circle = document.getElementById("viewLockRingCircle");
  const touch = e.touches ? e.touches[0] : e;
  _vlSwipeStartY = touch.clientY; // スワイプ開始Y座標を記録
  _vlSwipeStartX = touch.clientX; // スワイプ開始X座標を記録
  if (ring) {
    ring.style.left = touch.clientX + "px";
    ring.style.top = touch.clientY + "px";
    ring.style.opacity = "1";
  }
  if (circle) {
    circle.style.transition = "stroke-dashoffset 1s linear";
    requestAnimationFrame(() => { circle.style.strokeDashoffset = "0"; });
  }
  // 1秒長押しで初期画面へ戻るタイマー
  _viewLockHoldTimer = setTimeout(() => {
    _vlIsLongPressSuccess = true;
    if (_viewLockClockTimer)   { clearInterval(_viewLockClockTimer);   _viewLockClockTimer   = null; }
    if (_viewLockStyleInterval) { clearInterval(_viewLockStyleInterval); _viewLockStyleInterval = null; }
    window.removeEventListener('resize', _handleViewLockResize);
    const viewLock = document.getElementById("viewLockScreen");
    if (viewLock && viewLock._visibilityHandler) {
      document.removeEventListener('visibilitychange', viewLock._visibilityHandler);
      viewLock._visibilityHandler = null;
    }
    if (viewLock) viewLock.style.display = "none";
    document.getElementById("lockScreen").style.display = "block";
    // Bug①修正: 2フレーム待機してアニメーション確実再起動（display:blockの描画完了を待つ）
    requestAnimationFrame(() => requestAnimationFrame(() => restartLockScreenAnimation()));
    if (ring)   { ring.style.opacity = "0"; }
    if (circle) {
      circle.style.transition = "stroke-dashoffset 0.1s linear";
      circle.style.strokeDashoffset = "164";
    }
  }, 1000);
}

function initViewLockHold() {
  const viewLock = document.getElementById("viewLockScreen");
  if (!viewLock) return;
  // ★先に既存リスナーを必ず削除する（重複登録の完全防止）
  // 同一関数参照を渡すことで removeEventListener が正確に機能する
  viewLock.removeEventListener('click',       _vlClickBlocker, true);
  viewLock.removeEventListener('mousedown',   _vlStartHold);
  viewLock.removeEventListener('mousemove',   _vlMoveHold);
  viewLock.removeEventListener('touchstart',  _vlStartHold);
  viewLock.removeEventListener('touchmove',   _vlMoveHold);
  viewLock.removeEventListener('mouseup',     _vlEndHold);
  viewLock.removeEventListener('mouseleave',  _vlEndHold);
  viewLock.removeEventListener('touchend',    _vlEndHold);
  viewLock.removeEventListener('touchcancel', _vlEndHold);
  // 状態をリセット
  _vlPressStartTime = 0;
  _vlIsLongPressSuccess = false;
  _vlBlockingClick = false;
  _vlLastTapTime = 0;
  _vlTapCount = 0;
  _vlSwipeStartY = 0;
  _vlSwipeStartX = 0;
  // リスナーを登録
  viewLock.addEventListener('click',       _vlClickBlocker, true);
  viewLock.addEventListener('mousedown',   _vlStartHold);
  viewLock.addEventListener('mousemove',   _vlMoveHold);
  viewLock.addEventListener('touchstart',  _vlStartHold, { passive: false });
  viewLock.addEventListener('touchmove',   _vlMoveHold, { passive: true });
  viewLock.addEventListener('mouseup',     _vlEndHold);
  viewLock.addEventListener('mouseleave',  _vlEndHold);
  viewLock.addEventListener('touchend',    _vlEndHold);
  viewLock.addEventListener('touchcancel', _vlEndHold);
  viewLock.addEventListener('contextmenu', (e) => e.preventDefault());
}


/* ============================================================
   ダミー画面（デコイ時計）ロジック
   ============================================================ */
let _decoyClockTimer  = null; // 時計更新タイマー
let _decoyHoldTimer   = null; // 長押し判定タイマー
let _decoyHoldStarted = false;
let _decoyClockPaused = false;
let _decoyLastTapTime = 0;
let _decoyDisplayMode = 0; // 0: 通常, 1: 24時間残り, 2: 日の出/日没
let _decoySingleTapTimer = null;
let _decoyTapCount = 0;
let _decoyHideSubSeconds = false;

function showDecoyScreen() {
  // Google Analytics: ダミー画面への遷移をカウント（国別データなどもAnalytics上で確認可能）
  if (typeof gtag === 'function') {
    gtag('event', 'view_decoy_screen', {
      'event_category': 'Security',
      'event_label': 'Decoy Screen Triggered'
    });
  }

  document.getElementById("lockScreen").style.display = "none";
  const decoy = document.getElementById("decoyScreen");
  decoy.style.display = "block";

  const clockWrap = decoy.querySelector(".decoy-clock-wrap");
  // onclickハンドラは不要になりました（_decoyHoldEndで処理します）

  // アニメーションを確実に最初から再生させる（フェードイン・浮上）
  const title = decoy.querySelector(".anim-title-rise");
  const fades = decoy.querySelectorAll(".anim-slow-fade");
  if (title) {
    title.classList.remove("anim-title-rise");
    void title.offsetWidth;
    title.classList.add("anim-title-rise");
  }
  fades.forEach(el => {
    el.classList.remove("anim-slow-fade");
    void el.offsetWidth;
    el.classList.add("anim-slow-fade");
  });

  // ★ コンマ秒（2桁）を素早く表示するため50fps（20ms）で動かす
  // ただし画面が非表示（スリープ・タブ切替）になったら即座に停止する（省電力）
  _updateDecoyClock();
  _decoyClockTimer = setInterval(_updateDecoyClock, 20);

  // ★【省電力】画面が非表示になったらタイマーを停止し、戻ったら再開する
  function _decoyVisibilityHandler() {
    if (document.hidden) {
      if (_decoyClockTimer) { clearInterval(_decoyClockTimer); _decoyClockTimer = null; }
    } else {
      _updateDecoyClock();
      _decoyClockTimer = setInterval(_updateDecoyClock, 20);
    }
  }
  document.addEventListener('visibilitychange', _decoyVisibilityHandler);
  const decoyEl = document.getElementById("decoyScreen");
  if (decoyEl) decoyEl._visibilityHandler = _decoyVisibilityHandler;

  // 長押しイベント登録
  decoy.addEventListener("touchstart",  _decoyHoldStart,  { passive: false });
  decoy.addEventListener("touchend",    _decoyHoldEnd,    { passive: true });
  decoy.addEventListener("touchcancel", _decoyHoldEnd,    { passive: true });
  decoy.addEventListener("mousedown",   _decoyHoldStart);
  decoy.addEventListener("mouseup",     _decoyHoldEnd);
  decoy.addEventListener("mouseleave",  _decoyHoldEnd);
}

function hideDecoyScreen() {
  clearInterval(_decoyClockTimer);
  _decoyClockTimer = null;
  clearTimeout(_decoyHoldTimer);
  _decoyHoldTimer = null;
  _decoyHoldStarted = false;
  _decoyDisplayMode = 0;
  _decoyClockPaused = false;
  _decoyLastTapTime = 0;
  _decoyTapCount = 0;

  const decoy = document.getElementById("decoyScreen");
  cancelDecoyTimer(); // タイマーも解除
  // ★【省電力】visibilitychangeリスナーをクリーンアップ
  if (decoy._visibilityHandler) {
    document.removeEventListener('visibilitychange', decoy._visibilityHandler);
    decoy._visibilityHandler = null;
  }
  decoy.removeEventListener("touchstart",  _decoyHoldStart);
  decoy.removeEventListener("touchend",    _decoyHoldEnd);
  decoy.removeEventListener("touchcancel", _decoyHoldEnd);
  decoy.removeEventListener("mousedown",   _decoyHoldStart);
  decoy.removeEventListener("mouseup",     _decoyHoldEnd);
  decoy.removeEventListener("mouseleave",  _decoyHoldEnd);

  // ヒント・リングをリセット
  const hint = document.getElementById("decoyHint");
  if (hint) { hint.textContent = ""; hint.classList.remove("visible"); }
  const ring = document.getElementById("decoyHoldRing");
  if (ring) ring.style.display = "none";
  const circle = document.getElementById("decoyRingCircle");
  if (circle) circle.style.strokeDashoffset = "163";

  decoy.style.display = "none";
  document.getElementById("lockScreen").style.display = "block";
  // ロック画面のパスコード入力欄をクリア
  const pc = document.getElementById("passcode");
  if (pc) { pc.value = ""; pc.style.border = ""; }
  const err = document.getElementById("error");
  if (err) err.innerText = "";
  
  // Bug修正: 2フレーム遅延呼び出し（display:blockの描画完了待ちによるアニメーション不発防止）
  requestAnimationFrame(() => requestAnimationFrame(() => restartLockScreenAnimation()));
}

// 日の出・日の入りの近似計算（東京の緯度経度をデフォルトとする）
function getSunriseSunset(date, lat = 35.6895, lng = 139.6917) {
  const rad = Math.PI / 180;
  const noonLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const start = new Date(noonLocal.getFullYear(), 0, 0);
  const diff = (noonLocal - start) + ((start.getTimezoneOffset() - noonLocal.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (12 - 12) / 24);
  const eqTime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );
  
  const decl = 0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
    
  const zenith = 90.833 * rad;
  const haRad = Math.acos(
    Math.cos(zenith) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)
  );
  const haDeg = haRad / rad;
  
  const sunriseUTCMinutes = 720 - 4 * (lng + haDeg) - eqTime;
  const sunsetUTCMinutes  = 720 - 4 * (lng - haDeg) - eqTime;
  
  const sunrise = new Date(noonLocal.getTime());
  sunrise.setUTCHours(0, 0, 0, 0);
  sunrise.setUTCMinutes(Math.round(sunriseUTCMinutes));
  
  const sunset = new Date(noonLocal.getTime());
  sunset.setUTCHours(0, 0, 0, 0);
  sunset.setUTCMinutes(Math.round(sunsetUTCMinutes));
  
  return { sunrise, sunset };
}

function _updateDecoyClock() {
  if (_decoyClockPaused) return; // ダブルタップ停止中は更新しない
  const now = new Date();
  const dateEl = document.getElementById("decoyDate");
  const timeEl = document.getElementById("decoyTime");

  if (_decoyDisplayMode === 1) {
    // Mode 1: 24時間の残り時間
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const diff = Math.max(0, tomorrow - now);
    
    const h = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0");
    const mi = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
    const s = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, "0");
    const ms = String(Math.floor((diff % 1000) / 10)).padStart(2, "0");

    if (dateEl) {
      dateEl.style.visibility = "visible";
      dateEl.style.fontSize = ""; // Reset inline font-size
      if (now.getMonth() === 11 && now.getDate() === 31) {
        dateEl.textContent = "年明けまで";
      } else {
        dateEl.textContent = "一日の終わりまで";
      }
    }
    if (timeEl) {
      timeEl.style.fontSize = ""; // Reset inline font-size
      timeEl.textContent = _decoyHideSubSeconds ? `${h}:${mi}:${s}` : `${h}:${mi}:${s}.${ms}`;
    }
  } else if (_decoyDisplayMode === 2) {
    // Mode 2: 日の出・日没
    const todaySun = getSunriseSunset(now);
    let targetEvent = "";
    let targetTime = null;

    if (now < todaySun.sunrise) {
      targetEvent = "日の出";
      targetTime = todaySun.sunrise;
    } else if (now < todaySun.sunset) {
      targetEvent = "日没";
      targetTime = todaySun.sunset;
    } else {
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const tomorrowSun = getSunriseSunset(tomorrow);
      targetEvent = "日の出";
      targetTime = tomorrowSun.sunrise;
    }

    const nextH = String(targetTime.getHours()).padStart(2, "0");
    const nextM = String(targetTime.getMinutes()).padStart(2, "0");
    const nextS = String(targetTime.getSeconds()).padStart(2, "0");
    const nextTimeString = `${nextH}:${nextM}:${nextS}`;

    const diff = Math.max(0, targetTime - now);
    const h = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0");
    const mi = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0");
    const s = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, "0");
    const ms = String(Math.floor((diff % 1000) / 10)).padStart(2, "0");

    if (dateEl) {
      dateEl.style.visibility = "visible";
      dateEl.style.fontSize = ""; // 固定サイズを維持
      dateEl.textContent = `${targetEvent}　${nextTimeString}`;
    }
    if (timeEl) {
      timeEl.style.fontSize = ""; // 固定サイズを維持
      timeEl.textContent = _decoyHideSubSeconds ? `${h}:${mi}:${s}` : `${h}:${mi}:${s}.${ms}`;
    }
  } else {
    // Mode 0: 通常
    const y   = now.getFullYear();
    const mo  = String(now.getMonth() + 1).padStart(2, "0");
    const d   = String(now.getDate()).padStart(2, "0");
    const h   = String(now.getHours()).padStart(2, "0");
    const mi  = String(now.getMinutes()).padStart(2, "0");
    const s   = String(now.getSeconds()).padStart(2, "0");
    const ms  = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, "0"); // 0-99 (コンマ2桁)

    if (dateEl) {
      dateEl.style.visibility = "visible";
      dateEl.style.fontSize = ""; // Reset inline font-size
      dateEl.textContent = `${y}年${mo}月${d}日`;
    }
    // 全角コロンだと幅を取りすぎて改行されるため、半角コロンに変更
    if (timeEl) {
      timeEl.style.fontSize = ""; // Reset inline font-size
      timeEl.textContent = _decoyHideSubSeconds ? `${h}:${mi}:${s}` : `${h}:${mi}:${s}.${ms}`;
    }
  }
}

function _decoyHoldStart(e) {
  // ボタン類がタップされた場合は長押し判定やpreventDefaultを除外し、本来のclickを発火させる
  if (e && e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;

  if (e && e.cancelable) e.preventDefault(); // ghost click防止
  if (_decoyHoldStarted) return;
  _decoyHoldStarted = true;

  // ヒントを表示
  const hint = document.getElementById("decoyHint");
  if (hint) { hint.textContent = "長押しで戻る..."; hint.classList.add("visible"); }

  // プログレスリングを表示して開始
  const ring   = document.getElementById("decoyHoldRing");
  const circle = document.getElementById("decoyRingCircle");
  if (ring)   ring.style.display = "block";
  if (circle) {
    // 一度リセットしてからアニメーション開始
    circle.style.transition = "none";
    circle.style.strokeDashoffset = "163";
    // 強制リフロー後にアニメーション開始
    void circle.getBoundingClientRect();
    circle.style.transition = "stroke-dashoffset 3s linear";
    circle.style.strokeDashoffset = "0";
  }

  // 3秒後にロック画面へ戻る
  _decoyHoldTimer = setTimeout(() => {
    hideDecoyScreen();
  }, 3000);
}

function _decoyHoldEnd(e) {
  if (e && e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;

  if (!_decoyHoldStarted) return;
  _decoyHoldStarted = false;
  clearTimeout(_decoyHoldTimer);
  _decoyHoldTimer = null;

  // ヒントとリングをリセット
  const hint = document.getElementById("decoyHint");
  if (hint) { hint.textContent = ""; hint.classList.remove("visible"); }
  const ring   = document.getElementById("decoyHoldRing");
  const circle = document.getElementById("decoyRingCircle");
  if (ring)   ring.style.display = "none";
  if (circle) {
    circle.style.transition = "none";
    circle.style.strokeDashoffset = "163";
  }

  // タップ判定（長押しで戻る前に離した場合）
  const now = Date.now();
  if (_decoyLastTapTime > 0 && now - _decoyLastTapTime > 400) {
    _decoyTapCount = 0; // 400ms以上空いたらリセット
  }
  _decoyLastTapTime = now;
  _decoyTapCount++;
  
  if (_decoySingleTapTimer) clearTimeout(_decoySingleTapTimer);
  
  if (_decoyTapCount === 3) {
    // トリプルタップ (元々はダブルタップの機能)
    _decoyTapCount = 0;
    _decoyClockPaused = !_decoyClockPaused; // 停止/再開をトグル
    if (!_decoyClockPaused) {
      _updateDecoyClock(); // 即時反映
    }
  } else {
    // 400ms待って次のタップが来なければ確定させる
    _decoySingleTapTimer = setTimeout(() => {
      const count = _decoyTapCount;
      _decoyTapCount = 0;
      if (count === 1) {
        // シングルタップ
        _decoyDisplayMode = (_decoyDisplayMode + 1) % 3;
      } else if (count === 2) {
        // ダブルタップ (元々はトリプルタップの機能)
        _decoyHideSubSeconds = !_decoyHideSubSeconds;
        if (_decoyHideSubSeconds) {
          _decoyClockPaused = false; // コンマ秒をなくした時計が起動したときは静止を解除
        }
      }
      if (!_decoyClockPaused || count === 2) {
        _updateDecoyClock(); // 即時反映
      }
    }, 400);
  }
}

let _decoyTimerInterval = null;
let _decoyAlarmInterval = null;
let _decoyTargetTime = 0;
let _decoyTimerPaused = false;
let _decoyRemainTimeOnPause = 0;
let _decoyAudioCtx = null; // iOS用オーディオコンテキスト
let _decoyEngineSource = null; // アイドリング音のループソース
let _bikeAudioElement = null; // MP3再生用Audio要素

function toggleDecoyTimer() {
  if (!_decoyTimerInterval && !_decoyTimerPaused) return; // 起動していない

  const btn = document.getElementById("decoyPauseBtn");
  if (_decoyTimerPaused) {
    // 再生（再開）
    _decoyTimerPaused = false;
    _decoyTargetTime = Date.now() + _decoyRemainTimeOnPause;
    _decoyTimerInterval = setInterval(_updateDecoyCountdown, 100);
    if (btn) btn.textContent = "❚❚";
  } else {
    // 一時停止
    _decoyTimerPaused = true;
    _decoyRemainTimeOnPause = _decoyTargetTime - Date.now();
    clearInterval(_decoyTimerInterval);
    _decoyTimerInterval = null;
    if (btn) btn.innerHTML = '<span style="display:inline-block; transform:scale(0.85, 1.35);">►</span>';
  }
}

function startDecoyTimer(minutes) {
  // ── iOS Safariオーディオロック解除（初回のみ） ──
  try {
    if (!_decoyAudioCtx) {
      _decoyAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_decoyAudioCtx.state === 'suspended') {
      _decoyAudioCtx.resume();
    }
    // 無音のオシレーターを再生してブラウザにオーディオ利用を許可させる
    const osc = _decoyAudioCtx.createOscillator();
    const gain = _decoyAudioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(_decoyAudioCtx.destination);
    osc.start();
    osc.stop(_decoyAudioCtx.currentTime + 0.01);
    
    // MP3音源の先読み（Audio要素を使うことでローカル環境 file:// でのCORSエラーを回避）
    if (!_bikeAudioElement) {
      _bikeAudioElement = new Audio();
      _bikeAudioElement.preload = 'auto'; // autoplay誘発を防ぎ、先読みだけする
      _bikeAudioElement.loop = true;
      _bikeAudioElement.src = './bike.mp3'; // srcを後設定することで自動再生を防ぐ
    }
  } catch (e) {}

  const decoyScreen = document.getElementById("decoyScreen");
  const ring = document.getElementById("decoyHoldRing");
  const pauseBtn = document.getElementById("decoyPauseBtn");

  // もしアラーム発動中なら、アラームだけ止めて現在時刻から時間を上書き設定（ここは新規と同じ扱い）
  if (decoyScreen && decoyScreen.classList.contains("decoy-alarm")) {
    clearInterval(_decoyAlarmInterval);
    _decoyAlarmInterval = null;
    if (_decoyEngineSource) {
      try { 
        if (_decoyEngineSource.stop) _decoyEngineSource.stop(); 
        else if (_decoyEngineSource.pause) {
          _decoyEngineSource.pause();
          _decoyEngineSource.currentTime = 0;
        }
      } catch(e){}
      _decoyEngineSource = null;
    }
    decoyScreen.classList.remove("decoy-alarm");
    if (ring) ring.classList.remove("decoy-alarm");
    _decoyTargetTime = Date.now() + minutes * 60 * 1000;
    _decoyTimerPaused = false;
    if (pauseBtn) pauseBtn.textContent = "❚❚";
  } 
  // 一時停止中ならそこに時間を加算して再開
  else if (_decoyTimerPaused) {
    _decoyRemainTimeOnPause += minutes * 60 * 1000;
    _decoyTargetTime = Date.now() + _decoyRemainTimeOnPause;
    _decoyTimerPaused = false;
    if (pauseBtn) pauseBtn.textContent = "❚❚";
  }
  // 既にタイマー稼働中なら、目標時間を延長（加算）
  else if (_decoyTimerInterval) {
    _decoyTargetTime += minutes * 60 * 1000;
  } 
  // 新規スタート
  else {
    _decoyTargetTime = Date.now() + minutes * 60 * 1000;
    _decoyTimerPaused = false;
    if (pauseBtn) pauseBtn.textContent = "❚❚";
  }
  
  const display = document.getElementById("decoyCountdown");
  if (display) display.style.visibility = "visible";
  if (pauseBtn) pauseBtn.style.visibility = "visible";
  
  if (!_decoyTimerInterval) {
    _decoyTimerInterval = setInterval(_updateDecoyCountdown, 100);
  }
  _updateDecoyCountdown();
}

function cancelDecoyTimer() {
  clearInterval(_decoyTimerInterval);
  _decoyTimerInterval = null;
  clearInterval(_decoyAlarmInterval);
  _decoyAlarmInterval = null;
  if (_decoyEngineSource) {
    try { 
      if (_decoyEngineSource.stop) _decoyEngineSource.stop(); 
      else if (_decoyEngineSource.pause) {
        _decoyEngineSource.pause();
        _decoyEngineSource.currentTime = 0;
      }
    } catch(e){}
    _decoyEngineSource = null;
  }
  _decoyTimerPaused = false;
  
  const display = document.getElementById("decoyCountdown");
  if (display) {
    display.style.visibility = "hidden";
    display.textContent = "00:00.0";
  }
  const pauseBtn = document.getElementById("decoyPauseBtn");
  if (pauseBtn) {
    pauseBtn.style.visibility = "hidden";
    pauseBtn.textContent = "❚❚";
  }
  
  const decoyScreen = document.getElementById("decoyScreen");
  if (decoyScreen) decoyScreen.classList.remove("decoy-alarm");
  const ring = document.getElementById("decoyHoldRing");
  if (ring) ring.classList.remove("decoy-alarm");
}

function _updateDecoyCountdown() {
  // タイマーが起動していない場合は何もしない（誤発動防止）
  if (!_decoyTimerInterval && !_decoyTimerPaused) return;
  // _decoyTargetTimeの初期値(0)のまま呼ばれた場合も無視
  if (_decoyTargetTime <= 0) return;

  const remain = _decoyTargetTime - Date.now();
  const display = document.getElementById("decoyCountdown");
  
  if (remain <= 0) {
    // 時間切れ
    clearInterval(_decoyTimerInterval);
    _decoyTimerInterval = null;
    if (display) display.textContent = "00:00.0";
    
    // アラーム発動（ピンク色 + エンジン音 + バイブレーション）
    const decoyScreen = document.getElementById("decoyScreen");
    const ring = document.getElementById("decoyHoldRing");
    if (decoyScreen && !decoyScreen.classList.contains("decoy-alarm")) {
      decoyScreen.classList.add("decoy-alarm");
      if (ring) ring.classList.add("decoy-alarm");
      
      // ── アメ車のアイドリング音（アメリカンVツイン）合成 ──
      function _startAmericanIdle() {
        if (!_decoyAudioCtx) return;
        try {
          if (_decoyAudioCtx.state === 'suspended') {
            _decoyAudioCtx.resume();
          }
          
          if (_decoyEngineSource) {
            try { 
              if (_decoyEngineSource.stop) _decoyEngineSource.stop(); 
              else if (_decoyEngineSource.pause) {
                _decoyEngineSource.pause();
                _decoyEngineSource.currentTime = 0;
              }
            } catch(e){}
          }
          
          function _playSyntheticAmericanIdle() {
            // ── MP3がない場合は従来の合成音（一番最初の仕様＋三拍子リズム）にフォールバック ──
            const ctx = _decoyAudioCtx;
            const sampleRate = ctx.sampleRate;
          // 400 RPM = 150ms per rev = 300ms per 720-degree cycle
          const cycleMs = 300; 
          
          // 2サイクル分の長さ
          const totalMs = cycleMs * 2; 
          const bufferLen = Math.floor(sampleRate * (totalMs / 1000));
          const buffer = ctx.createBuffer(1, bufferLen, sampleRate);
          const data = buffer.getChannelData(0);
          
          // 一番最初の「音質」を再現する爆発生成関数（ピッチダウン＋ノイズ＋WaveShaper歪み）
          function addSpike(timeMs, amp) {
            const startSample = Math.floor((timeMs / 1000) * sampleRate);
            const durSec = 0.08; // 初回と同じ短い爆発時間
            
            for (let i = 0; i < sampleRate * durSec; i++) {
              let idx = startSample + i;
              if (idx >= bufferLen) break;
              
              // 減衰エンベロープ
              const env = Math.exp(-i / (sampleRate * durSec) * 5);
              const t = i / sampleRate;
              
              // 初回のピッチダウン (140Hz -> 40Hz)
              const freqStart = 140;
              const freqDrop = 100 / durSec;
              const phase = 2 * Math.PI * (freqStart * t - 0.5 * freqDrop * t * t);
              const thud = Math.sin(phase);
              
              // 排気ノイズ
              const noise = (Math.random() * 2 - 1);
              
              // 初回と同じミックスバランス
              data[idx] += (thud * 0.7 + noise * 0.3) * env * amp;
            }
          }
          
          // ── 三拍子リズム (420RPM) は維持 ──
          addSpike(0, 1.2); 
          addSpike(131, 0.85); 
          
          addSpike(300 + 15, 1.1);
          addSpike(300 + 15 + 131 + 8, 0.8);
          
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;
          
          // マフラーのくぐもった音をシミュレート（初回の設定を完全復元）
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 300; 
          filter.Q.value = 1.5;
          
          // 歪み（初回のオーバードライブ設定）
          const dist = ctx.createWaveShaper();
          const curve = new Float32Array(400);
          for (let i = 0; i < 400; i++) {
            let x = (i * 2 / 400) - 1;
            curve[i] = Math.tanh(x * 5); // 初回と同じ強さの歪み
          }
          dist.curve = curve;
          
          const gain = ctx.createGain();
          gain.gain.value = 2.0; // 音量
          
          // 初回と同じ結線順序 (src -> dist -> filter -> gain)
          src.connect(dist);
          dist.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          
          src.start();
          _decoyEngineSource = src;
          } // _playSyntheticAmericanIdle 終了
          
          // ── MP3音源があればそれを優先してループ再生 ──
          if (_bikeAudioElement) {
            _bikeAudioElement.currentTime = 0;
            const playPromise = _bikeAudioElement.play();
            if (playPromise !== undefined) {
              playPromise.then(() => {
                _decoyEngineSource = _bikeAudioElement;
              }).catch(e => {
                console.warn("bike.mp3の再生に失敗しました。合成音に切り替えます。", e);
                _playSyntheticAmericanIdle();
              });
            } else {
              _decoyEngineSource = _bikeAudioElement;
            }
          } else {
            _playSyntheticAmericanIdle();
          }
          
        } catch (e) {
        }
      }
      
      // アイドリング音スタート
      _startAmericanIdle();
      
      // バイブレーションはアイドリングの「三拍子」に合わせてリピート
      // ループ全体の長さは約610ms
      _decoyAlarmInterval = setInterval(() => {
        if (navigator.vibrate) navigator.vibrate([50, 74, 40, 151, 50, 74, 40, 131]); 
      }, 610);
    }
  } else {
    // 残り時間描画
    const m = String(Math.floor(remain / 60000)).padStart(2, "0");
    const s = String(Math.floor((remain % 60000) / 1000)).padStart(2, "0");
    const ms = String(Math.floor((remain % 1000) / 100)); // 1桁 (0.1秒)
    if (display) display.textContent = `${m}:${s}.${ms}`;
  }
}

// （以前ここにあった重複・古い仕様の restartLockScreenAnimation は削除・統合されました）

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

    // 星の瞬き（チカチカ明滅）アニメーションをランダムディレイ（0〜250ms）で付与
    const randomDelay = Math.random() * 250;
    setTimeout(() => {
      btn.classList.add("sparkle-btn-anim");
      
      // 明滅している間、表示する数字を高速ランダム変化させる（60msごとに1〜9のランダム数値）
      const changeInterval = setInterval(() => {
        btn.innerText = Math.floor(Math.random() * 9) + 1;
      }, 60);

      // 瞬き（0.25s * 2回 = 500ms）完了後に自動的にクラスを剥がし、本来の確定数字を再セット
      setTimeout(() => {
        clearInterval(changeInterval);
        btn.innerText = num;
        btn.classList.remove("sparkle-btn-anim");
      }, 500);
    }, randomDelay);
  });
}

document.addEventListener("DOMContentLoaded", function () {

  // =====================================================================
  // ■ フェーズ1：暗証番号画面の即時初期化（最小限の処理のみ実行）
  // =====================================================================

  // 起動時のバージョンポップアップ
  if (localStorage.getItem("lastVersion") !== currentVersion) {
    alert("タイムレグルスがv3.1.3にアップデートされました！");
    localStorage.setItem("lastVersion", currentVersion);
  }

  // 暗証番号入力欄のフォーカス& Enterキー対応
  const passInput = document.getElementById("passcode");
  if (passInput) {
    passInput.focus();
    passInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        checkPass();
      }
    });
  }

  // ロック画面のアニメーション再始動
  restartLockScreenAnimation();

  // =====================================================================
  // ■ フェーズ2：メイン機能の遅延初期化
  //    (暗証番号入力中に裏で実行。iOSはrequestIdleCallback非対応のためsetTimeoutで代用)
  // =====================================================================
  function initMainFeatures() {

    // 三連カスタム無限ドラムロールピッカーの初期化
    drumHour = new TimeRegulusDrum("pickerWheelHour", "hour", onDrumValueChange);
    drumMin = new TimeRegulusDrum("pickerWheelMin", "min", onDrumValueChange);
    drumSec = new TimeRegulusDrum("pickerWheelSec", "sec", onDrumValueChange);

    // 「日」の入力枠(errorDays)のフォーカス状態追跡フラグ
    // iOS テンキーの「∧∨」による隣接time入力への誤フォーカスを「日」選択時のみ防止するため
    let isDayFieldFocused = false;
    const errorDaysEl = document.getElementById("errorDays");
    if (errorDaysEl) {
      errorDaysEl.addEventListener("focus", () => { isDayFieldFocused = true; });
      errorDaysEl.addEventListener("blur", () => {
        // blur → focus の発火順序を考慮し、わずかな遅延後にフラグをリセット
        setTimeout(() => { isDayFieldFocused = false; }, 100);
      });
    }

    // 時分秒セレクト・インプットのネイティブ起動を抑止し、カスタム三連無限ドラムピッカーをフック起動
    const hookTimePicker = (triggerId, group, isDirectField = false) => {
      const el = document.getElementById(triggerId);
      if (!el) return;
      const handler = (e) => {
        if (isDirectField && !inputHelperEnabled) {
          // 直接入力枠で、かつ入力補助OFFのときはフックしない（テンキーを出す）
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        el.blur();
        openTimePicker(group);
      };
      // mousedownとtouchstartの両方をフックし、ネイティブキーボード/ネイティブピッカーの起動を確実に抑止
      el.addEventListener("mousedown", handler, { passive: false });
      el.addEventListener("touchstart", handler, { passive: false });

      // iOS テンキーの「∧∨」ナビゲーションによるフォーカス移動時もピッカーを展開する
      let isProcessingFocus = false;
      el.addEventListener("focus", function() {
        if (isDirectField && !inputHelperEnabled) {
          // 直接入力枠で、かつ入力補助OFFのときはそのままネイティブ入力させる
          return;
        }
        
        // 連続発火（フリーズ）防止フラグ
        if (isProcessingFocus) return;
        isProcessingFocus = true;
        
        // 【最強バグ回避】iOS Safariは readonly や blur() だけではキーボードを下げないことがあるため、
        // 移動先と現在フォーカス中の要素を一時的に「disabled（無効化）」することで、
        // 強制的にフォーカスを完全喪失させ、キーボードを確実に下ろさせる。
        setTimeout(() => {
          const active = document.activeElement;
          
          // 現在フォーカスを持っている要素（直前の枠など）を強制無効化
          if (active && active.tagName === 'INPUT') {
            active.disabled = true;
          }
          // 移動先（時分秒枠）も強制無効化
          el.disabled = true;
          
          // ピッカーを展開する
          if (!isPickerClosing) {
            openTimePicker(group);
          }
          
          // 0.5秒後にこっそり無効化を解除（ピッカー起動中は裏側に隠れているのでユーザーには見えない）
          setTimeout(() => {
            isProcessingFocus = false;
            if (active && active.tagName === 'INPUT') {
              active.disabled = false;
            }
            el.disabled = false;
          }, 500);
        }, 10);
      });
    };

    // 常に表示されるテンキー用入力枠へのピッカーフック起動
    hookTimePicker("displayHour_direct", "display", true);
    hookTimePicker("displayMin_direct", "display", true);
    hookTimePicker("displaySec_direct", "display", true);

    hookTimePicker("standardHour_direct", "standard", true);
    hookTimePicker("standardMin_direct", "standard", true);
    hookTimePicker("standardSec_direct", "standard", true);

    hookTimePicker("reverseDisplayHour_direct", "reverseDisplay", true);
    hookTimePicker("reverseDisplayMin_direct", "reverseDisplay", true);
    hookTimePicker("reverseDisplaySec_direct", "reverseDisplay", true);

    hookTimePicker("errorHours_direct", "error", true);
    hookTimePicker("errorMinutes_direct", "error", true);
    hookTimePicker("errorSeconds_direct", "error", true);

    // セレクトボックスの未選択プレースホルダー色初期同期 ＆ 監視設定
    const selectIds = ["standardSeconds", "displaySeconds", "errorSeconds", "reverseDisplaySeconds"];
    selectIds.forEach(id => {
      updateSelectPlaceholderColor(id);
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => updateSelectPlaceholderColor(id));
        el.addEventListener("input", () => updateSelectPlaceholderColor(id));
      }
    });

    // 日付・時刻入力欄のプレースホルダー色初期同期 ＆ 監視設定
    const dateTimeInputIds = ["displayDate", "displayTime", "standardDate", "standardTime", "errorTime", "reverseDisplayDate", "reverseDisplayTime"];
    dateTimeInputIds.forEach(id => {
      updateInputPlaceholderColor(id);
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", () => updateInputPlaceholderColor(id));
        el.addEventListener("input", () => updateInputPlaceholderColor(id));
      }
    });

    // 誤差計算の自動化のためのリスナー設定
    const errorInputs = [
      "standardDate", "standardTime", "displayDate", "displayTime", "standardSeconds", "displaySeconds"
    ];
    errorInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", calculateError);
        el.addEventListener("change", calculateError);
      }
    });

    // 誤差計算の直接入力欄のイベントリスナー設定
    const directErrorInputs = [
      "displayYear_direct", "displayMonth_direct", "displayDay_direct", "displayHour_direct", "displayMin_direct", "displaySec_direct",
      "standardYear_direct", "standardMonth_direct", "standardDay_direct", "standardHour_direct", "standardMin_direct", "standardSec_direct"
    ];
    directErrorInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
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
      "errorDays", "errorTime", "errorSeconds",
      "errorDirection", "reverseDisplayDate", "reverseDisplayTime", "reverseDisplaySeconds"
    ];
    reverseInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", handleReverseCalculation);
        el.addEventListener("change", handleReverseCalculation);
      }
    });

    // 補正計算の直接入力欄のイベントリスナー設定
    const directReverseInputs = [
      "errorDays_direct", "errorHours_direct", "errorMinutes_direct", "errorSeconds_direct",
      "reverseDisplayYear_direct", "reverseDisplayMonth_direct", "reverseDisplayDay_direct", "reverseDisplayHour_direct", "reverseDisplayMin_direct", "reverseDisplaySec_direct"
    ];
    directReverseInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", handleReverseCalculation);
        el.addEventListener("change", handleReverseCalculation);
      }
    });

    // iOS Safari等での余白タップ検知（✓ボタン押下と余白タップでのフォーカスアウトを区別するフラグ）
    let skipJumpOnBlur = false;
    window.addEventListener("touchstart", function(e) {
      if (e.target && !e.target.classList.contains("direct-year") && !e.target.classList.contains("direct-two") && !e.target.id.includes("direct") && !e.target.className.includes("direct")) {
        skipJumpOnBlur = true;
        setTimeout(() => { skipJumpOnBlur = false; }, 250);
      }
      if (autoJumpTimer) {
        clearTimeout(autoJumpTimer);
        autoJumpTimer = null;
      }
    }, { passive: true });
    window.addEventListener("mousedown", function(e) {
      if (e.target && !e.target.classList.contains("direct-year") && !e.target.classList.contains("direct-two") && !e.target.id.includes("direct") && !e.target.className.includes("direct")) {
        skipJumpOnBlur = true;
        setTimeout(() => { skipJumpOnBlur = false; }, 250);
      }
      if (autoJumpTimer) {
        clearTimeout(autoJumpTimer);
        autoJumpTimer = null;
      }
    });

    // 自動フォーカスジャンプと入力制御の設定関数
    function setupDirectInputField({ id, nextId, maxVal, customEnterHandler }) {
      const el = document.getElementById(id);
      if (!el) return;

      // ④ タップ時はクリアせず、入力開始時までクリアを待つためのフラグ ＆ 手動選択時の全選択
      el.addEventListener("focus", function() {
        el.dataset.freshFocus = "true";
        el.dataset.keyPressed = "false"; // フォーカス時は未入力にリセット
        if (autoJumpTimer) {
          clearTimeout(autoJumpTimer);
          autoJumpTimer = null;
        }
        // 再選択時に新キー1打で確実に上書きクリアできるよう、50msディレイでテキストを全選択
        setTimeout(() => {
          if (el.select) el.select();
        }, 50);
      });

      // ⑤ 最大値インテリジェント制御 ＆ 入力開始時クリア ＆ 最大桁数自動ジャンプ
      el.addEventListener("input", function() {
        let val = el.value.replace(/[^0-9]/g, "");
        if (val === "") {
          el.value = "";
          return;
        }

        // 新しい入力が開始された最初の1文字目に古い値をクリアする
        if (el.dataset.freshFocus === "true") {
          el.dataset.freshFocus = "false";
          const lastChar = val.charAt(val.length - 1);
          el.value = lastChar;
          val = lastChar;
        }

        if (maxVal !== undefined) {
          let num = parseInt(val, 10);
          if (num > maxVal) {
            // 最大値を超える場合は最後の1文字（新しく入力した数字）だけにする
            const lastChar = val.charAt(val.length - 1);
            el.value = lastChar;
            val = lastChar;

            calculateError();
            handleReverseCalculation();
          } else {
            el.value = val;
          }
        } else {
          el.value = val;
        }

        // 実際のキー入力(keyPressed)があった場合のみ、最大入力桁数で自動フォーカスジャンプ
        if (el.dataset.keyPressed === "true" && el.maxLength > 0 && val.length >= el.maxLength) {
          el.dataset.keyPressed = "false"; // 二重ジャンプを防ぐためリセット
          triggerNextJump();
        }
      });

      // ジャンプ処理の共通化
      function triggerNextJump() {
        if (customEnterHandler) {
          customEnterHandler();
        } else if (nextId) {
          const nextEl = document.getElementById(nextId);
          if (nextEl) {
            if (autoJumpTimer) clearTimeout(autoJumpTimer);
            autoJumpTimer = setTimeout(() => {
              nextEl.focus();
              if (nextEl.select) nextEl.select();
              autoJumpTimer = null;
            }, 60); // iOSのキーボード昇降アニメーションに合わせるためのわずかなディレイ
          }
        } else {
          el.blur(); // 最後の要素ならキーボードを閉じる
        }
      }

      // キー入力の存在検知（iOSの「∧」「∨」フォーカス移動による自動ジャンプ誤発火・㓼きを防ぐ）
      el.addEventListener("keydown", function(e) {
        el.dataset.keyPressed = "true";
        if (e.key === "Enter") {
          e.preventDefault();
          triggerNextJump();
        }
      });
      el.addEventListener("beforeinput", function() {
        el.dataset.keyPressed = "true";
      });

      // フォーカスアウト時、1桁の数字（月・日・時・分・秒）であれば自動で頭に「0」を埋めて2桁化
      el.addEventListener("blur", function() {
        let val = el.value.replace(/[^0-9]/g, "");
        if (val !== "" && el.maxLength === 2 && val.length === 1) {
          el.value = val.padStart(2, '0');
          calculateError();
          handleReverseCalculation();
        }
      });
    }

    // 各入力欄のセットアップ実行
    // --- 誤差計算: 表示時刻 ---
    setupDirectInputField({ id: "displayYear_direct", nextId: "displayMonth_direct" });
    setupDirectInputField({ id: "displayMonth_direct", nextId: "displayDay_direct", maxVal: 12 });
    setupDirectInputField({ id: "displayDay_direct", nextId: "displayHour_direct", maxVal: 31 });
    setupDirectInputField({ id: "displayHour_direct", nextId: "displayMin_direct", maxVal: 23 });
    setupDirectInputField({ id: "displayMin_direct", nextId: "displaySec_direct", maxVal: 59 });
    setupDirectInputField({
      id: "displaySec_direct",
      maxVal: 59,
      customEnterHandler: function() {
        if (!isStandardOnTop) {
          const nextId = !includeDateEnabled ? "standardHour_direct" : "standardYear_direct";
          const nextEl = document.getElementById(nextId);
          if (nextEl) {
            nextEl.focus();
            if (nextEl.select) nextEl.select();
          }
        } else {
          document.getElementById("displaySec_direct").blur();
        }
      }
    });

    // --- 誤差計算: 標準時刻 ---
    setupDirectInputField({ id: "standardYear_direct", nextId: "standardMonth_direct" });
    setupDirectInputField({ id: "standardMonth_direct", nextId: "standardDay_direct", maxVal: 12 });
    setupDirectInputField({ id: "standardDay_direct", nextId: "standardHour_direct", maxVal: 31 });
    setupDirectInputField({ id: "standardHour_direct", nextId: "standardMin_direct", maxVal: 23 });
    setupDirectInputField({
      id: "standardMin_direct",
      maxVal: 59,
      customEnterHandler: function() {
        if (isStandardOnTop) {
          const nextId = !includeDateEnabled ? "displayHour_direct" : "displayYear_direct";
          const nextEl = document.getElementById(nextId);
          if (nextEl) {
            nextEl.focus();
            if (nextEl.select) nextEl.select();
          }
        } else {
          const nextEl = document.getElementById("standardSec_direct");
          if (nextEl) {
            nextEl.focus();
            if (nextEl.select) nextEl.select();
          }
        }
      }
    });
    setupDirectInputField({
      id: "standardSec_direct",
      maxVal: 59,
      customEnterHandler: function() {
        if (!isStandardOnTop) {
          document.getElementById("standardSec_direct").blur();
        }
      }
    });

    // --- 補正誤差 ---
    // 「日」の入力完了後、入力補助ONのときは時分秒がhookTimePickerでフォーカスを即座にblurするため、
    // 自動ジャンプ先を時分秒に向けるとiOS Safariがフリーズ（デッドロック）する。
    // 入力補助ONのときはキーボードを閉じるだけにし、OFFのときのみ次の入力枠にジャンプする。
    setupDirectInputField({
      id: "errorDays_direct",
      customEnterHandler: function() {
        if (inputHelperEnabled) {
          const el = document.getElementById("errorDays_direct");
          if (el) el.blur();
        } else {
          const nextEl = document.getElementById("errorHours_direct");
          if (nextEl) {
            nextEl.focus();
            if (nextEl.select) nextEl.select();
          }
        }
      }
    });
    setupDirectInputField({ id: "errorHours_direct", nextId: "errorMinutes_direct", maxVal: 23 });
    setupDirectInputField({ id: "errorMinutes_direct", nextId: "errorSeconds_direct", maxVal: 59 });
    setupDirectInputField({
      id: "errorSeconds_direct",
      maxVal: 59,
      customEnterHandler: function() {
        const nextId = !includeDateEnabledCorrection ? "reverseDisplayHour_direct" : "reverseDisplayYear_direct";
        const nextEl = document.getElementById(nextId);
        if (nextEl) {
          nextEl.focus();
          if (nextEl.select) nextEl.select();
        }
      }
    });

    // --- 補正対象（表示/対象時刻） ---
    setupDirectInputField({ id: "reverseDisplayYear_direct", nextId: "reverseDisplayMonth_direct" });
    setupDirectInputField({ id: "reverseDisplayMonth_direct", nextId: "reverseDisplayDay_direct", maxVal: 12 });
    setupDirectInputField({ id: "reverseDisplayDay_direct", nextId: "reverseDisplayHour_direct", maxVal: 31 });
    setupDirectInputField({ id: "reverseDisplayHour_direct", nextId: "reverseDisplayMin_direct", maxVal: 23 });
    setupDirectInputField({ id: "reverseDisplayMin_direct", nextId: "reverseDisplaySec_direct", maxVal: 59 });
    setupDirectInputField({ id: "reverseDisplaySec_direct", maxVal: 59 });

    // 起動初期状態のトグル同期を明示的に呼び出してUIと同期
    toggleInputHelper(false);
    toggleIncludeDate(false);
    toggleIncludeDateCorrection(false);

    // ==========================================================================
    // 標準時刻が上のときの秒ロックドラムスワイプ無反応化（裏画面ドラッグすり抜けバグ完全撃破！）
    // ==========================================================================
    (function() {
      const secWheel = document.getElementById("pickerWheelSec");
      if (!secWheel) return;
      const secLockedContainer = secWheel.parentElement;

      if (secLockedContainer) {
        secLockedContainer.addEventListener("touchmove", (e) => {
          if (secLockedContainer.classList.contains("sec-locked")) {
            if (e.cancelable) {
              e.preventDefault();
            }
          }
        }, { passive: false });
      }
    })();

  } // end initMainFeatures()

  // ■ フェーズ2は「開く」ボタン核心後に checkPass() から呼び出す。
  // テンキー操作中の割り込みを完全回避するため、関数参照をグローバル変数に保持する。
  _pendingMainInit = initMainFeatures;

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
  defaultOption.text = "ss"; // 「秒」から「ss」へ変更
  select.appendChild(defaultOption);

  for (let i = 0; i <= 59; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.text = i.toString().padStart(2, '0');
    select.appendChild(option);
  }
}

function populateErrorDropdowns() {
  const secondSelect = document.getElementById("errorSeconds");
  if (!secondSelect) return;

  // オプションをクリア
  secondSelect.innerHTML = "";

  // 初期値の ss を追加
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.text = "ss";
  secondSelect.appendChild(defaultOption);

  for (let i = 0; i <= 59; i++) {
    const secOpt = document.createElement("option");
    secOpt.value = i;
    secOpt.text = i.toString().padStart(2, '0');
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

  const dateVal = `${yyyy}-${mm}-${dd}`;
  const timeVal = `${hh}:${min}`;

  const standardDateEl = document.getElementById("standardDate");
  const standardTimeEl = document.getElementById("standardTime");
  const standardSecondsEl = document.getElementById("standardSeconds");

  if (standardDateEl) standardDateEl.value = dateVal;
  if (standardTimeEl) standardTimeEl.value = timeVal;
  if (standardSecondsEl) standardSecondsEl.value = sec;

  // 直接入力側にも値を設定
  const sY = document.getElementById("standardYear_direct");
  const sM = document.getElementById("standardMonth_direct");
  const sD = document.getElementById("standardDay_direct");
  const sH = document.getElementById("standardHour_direct");
  const sMin = document.getElementById("standardMin_direct");
  const sS = document.getElementById("standardSec_direct");

  if (sY) sY.value = yyyy;
  if (sM) sM.value = mm;
  if (sD) sD.value = dd;
  if (sH) sH.value = hh;
  if (sMin) sMin.value = min;
  if (sS) {
    if (isStandardOnTop) {
      sS.value = "00";
    } else {
      sS.value = String(sec).padStart(2, '0');
    }
  }

  calculateError();
  syncAllPlaceholderColors();
}

// Real Timeチェックボックスの制御
function toggleRealTime(checked) {
  const fields = [
    'standardYear_direct', 'standardMonth_direct', 'standardDay_direct',
    'standardHour_direct', 'standardMin_direct', 'standardSec_direct'
  ];

  if (checked) {
    // 入力枠を読み取り専用にする
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.readOnly = true;
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.7';
      }
    });
    // RealTime ON で秒の00固定を解除。以降はOFFにしても秒を自由入力可能にする（フラグを立てる）
    _standardSecUnlocked = true;
    const sS = document.getElementById('standardSec_direct');
    if (sS) {
      sS.disabled = false;
      sS.readOnly = false;
      sS.style.opacity = '';
      sS.style.pointerEvents = 'auto';
      sS.classList.remove('seconds-fixed-00');
    }
    // ドラム（standardSeconds）も解除
    const sSel = document.getElementById('standardSeconds');
    if (sSel) {
      sSel.disabled = false;
      sSel.style.pointerEvents = 'auto';
      sSel.classList.remove('seconds-fixed-00');
    }
    // 即時反映
    _applyRealTimeToStandard();
    // 毎秒更新
    realTimeInterval = setInterval(_applyRealTimeToStandard, 1000);
  } else {
    // インターバル停止
    if (realTimeInterval) { clearInterval(realTimeInterval); realTimeInterval = null; }
    // 読み取り専用を解除
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.readOnly = false;
        el.style.pointerEvents = 'auto';
        el.style.opacity = '';
      }
    });
    // _standardSecUnlocked が true（RealTime ONになったことがある）なら秒の00固定に戻さず、自由入力状態を維持
    const sS = document.getElementById('standardSec_direct');
    if (sS) {
      if (_standardSecUnlocked) {
        // 自由入力状態を維持（readOnly・ disabled を解除）
        sS.readOnly = false;
        sS.disabled = false;
        sS.style.pointerEvents = 'auto';
        sS.style.opacity = '';
      } else {
        // まだRealTimeが一度もONになっていない → 00固定に戻す
        sS.value = '00';
        sS.disabled = true;
        sS.style.pointerEvents = 'none';
        sS.classList.add('seconds-fixed-00');
      }
    }
    // ドラム（standardSeconds）も同様に制御
    const sSel = document.getElementById('standardSeconds');
    if (sSel) {
      if (_standardSecUnlocked) {
        sSel.disabled = false;
        sSel.style.pointerEvents = 'auto';
      } else {
        sSel.disabled = true;
        sSel.style.pointerEvents = 'none';
        sSel.classList.add('seconds-fixed-00');
      }
    }
    calculateError();
  }
}

function _applyRealTimeToStandard() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  const sec  = String(now.getSeconds()).padStart(2, '0');

  const ids = {
    standardYear_direct: yyyy,
    standardMonth_direct: mm,
    standardDay_direct: dd,
    standardHour_direct: hh,
    standardMin_direct: min,
    standardSec_direct: sec
  };
  Object.entries(ids).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  // 年月日トグルON時はカレンダー入力も同期
  const sDate = document.getElementById('standardDate');
  if (sDate) sDate.value = `${yyyy}-${mm}-${dd}`;

  calculateError();
  syncAllPlaceholderColors();
}

function showErrorMode() {
  document.getElementById("modeSelect").style.display = "none";
  document.getElementById("errorMode").style.display = "block";

  // モード選択から遷移するたびに RealTime を必ず OFF にリセット
  const realTimeCb = document.getElementById('realTimeCheckbox');
  if (realTimeCb && realTimeCb.checked) {
    realTimeCb.checked = false;
    toggleRealTime(false);
  }

  
  // 初期状態でテンキーを起動する自動フォーカス処理
  if (!inputHelperEnabled) {
    setTimeout(() => {
      let target;
      if (!includeDateEnabled) {
        target = isStandardOnTop ? document.getElementById("standardHour_direct") : document.getElementById("displayHour_direct");
      } else {
        target = isStandardOnTop ? document.getElementById("standardYear_direct") : document.getElementById("displayYear_direct");
      }
      if (target) {
        target.focus();
        if (target.select) target.select();
      }
    }, 100);
  }
}

function showCorrectionMode() { 
  document.getElementById("modeSelect").style.display = "none"; 
  document.getElementById("correctionMode").style.display = "block";
  if (lastError) { 
    applyLastErrorToReverseInputs();
  }
  reverseMode = "toStandard";
  toggleReverseMode(false);

  // 初期状態でテンキーを起動する自動フォーカス処理
  // 「年月日も計算」OFFのときは errorDays_direct が visibility:hidden で不可視のため、
  // 不可視要素へのフォーカスによるiOS Safariフリーズを回避し、次の可視入力枠にフォーカスする
  if (!inputHelperEnabled) {
    setTimeout(() => {
      const targetId = includeDateEnabledCorrection ? "errorDays_direct" : "errorHours_direct";
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
        if (target.select) target.select();
      }
    }, 100);
  }
}

function disableRealTimeIfActive() {
  const realTimeCb = document.getElementById('realTimeCheckbox');
  if (realTimeCb && realTimeCb.checked) {
    realTimeCb.checked = false;
    if (typeof toggleRealTime === 'function') {
      toggleRealTime(false);
    }
  }
}

function backToModeSelect() {
  disableRealTimeIfActive();
  document.getElementById("errorMode").style.display = "none";
  document.getElementById("correctionMode").style.display = "none";
  document.getElementById("resultListPage").style.display = "none";
  document.getElementById("modeSelect").style.display = "block";
  document.getElementById("resetConfirmContainer").style.display = "none"; 
}

function backToCorrectionMode() {
  document.getElementById("resultListPage").style.display = "none";
  document.getElementById("correctionMode").style.display = "block";
}

/**
 * アプリをリセットする
 */
function resetApp(onlyInputs = false) {
  closeTimePicker();
  
  // 入力内容のリセット処理（すべての要素に対して存在チェックを徹底）
  const displayDateEl = document.getElementById("displayDate");
  if (displayDateEl) displayDateEl.value = "";

  const standardDateEl = document.getElementById("standardDate");
  if (standardDateEl) standardDateEl.value = "";

  const resultEl = document.getElementById("result");
  if (resultEl) resultEl.innerHTML = "";

  const toReverseButtonEl = document.getElementById("toReverseButton");
  if (toReverseButtonEl) toReverseButtonEl.style.display = "none";
  
  const errorDaysEl = document.getElementById("errorDays");
  if (errorDaysEl) errorDaysEl.value = "";

  setDirection("late");

  const reverseDisplayDateEl = document.getElementById("reverseDisplayDate");
  if (reverseDisplayDateEl) reverseDisplayDateEl.value = "";

  const reverseResultEl = document.getElementById("reverseResult");
  if (reverseResultEl) reverseResultEl.innerHTML = "";

  // 直接入力欄のリセット
  const directInputs = [
    "displayYear_direct", "displayMonth_direct", "displayDay_direct", "displayHour_direct", "displayMin_direct", "displaySec_direct",
    "standardYear_direct", "standardMonth_direct", "standardDay_direct", "standardHour_direct", "standardMin_direct", "standardSec_direct",
    "errorDays_direct", "errorHours_direct", "errorMinutes_direct", "errorSeconds_direct",
    "reverseDisplayYear_direct", "reverseDisplayMonth_direct", "reverseDisplayDay_direct", "reverseDisplayHour_direct", "reverseDisplayMin_direct", "reverseDisplaySec_direct"
  ];
  directInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  lastError = null;
  hasCalculated = false;
  reverseMode = "toStandard";
  hasCalculatedError = false;

  // isStandardOnTop の同期リセット（アニメーションなしで確実に初期のDOM順序へ戻す）
  if (isStandardOnTop) {
    const displayGroup = document.getElementById("errorModeDisplayInputGroup");
    const standardGroup = document.getElementById("errorModeStandardInputGroup");
    const modeCard = displayGroup ? displayGroup.parentElement : null;
    const swapButtonWrapper = document.querySelector('.swap-btn') ? document.querySelector('.swap-btn').parentElement : null;
    if (displayGroup && standardGroup && modeCard && swapButtonWrapper) {
      modeCard.insertBefore(displayGroup, standardGroup);
      modeCard.insertBefore(swapButtonWrapper, standardGroup);
    }
    isStandardOnTop = false;
  }

  const nowButton = document.getElementById("standardNowButton");
  if (nowButton) nowButton.style.display = "inline-block";

  const standardSeconds = document.getElementById("standardSeconds");
  if (standardSeconds) {
    standardSeconds.disabled = false;
    standardSeconds.style.pointerEvents = 'auto';
    standardSeconds.classList.remove('seconds-fixed-00'); // スタイルを戻す
    standardSeconds.value = "";
  }

  const standardSecDirect = document.getElementById("standardSec_direct");
  if (standardSecDirect) {
    standardSecDirect.disabled = false;
    standardSecDirect.style.pointerEvents = 'auto';
    standardSecDirect.classList.remove('seconds-fixed-00');
    standardSecDirect.value = "";
  }
  
  toggleReverseMode(false);
  toggleIncludeDate(false);
  toggleIncludeDateCorrection(false);

  if (onlyInputs) { 
     resultHistory = [];
     localStorage.removeItem('resultHistory');
     const resultListContainerEl = document.getElementById("resultListContainer");
     if (resultListContainerEl) resultListContainerEl.innerHTML = "";
     const showListLinkEl = document.getElementById("showListLink");
     if (showListLinkEl) showListLinkEl.style.display = "none";
  } else {
     syncAllPlaceholderColors();
     return;
  }
  syncAllPlaceholderColors();
}

function showResetConfirmation() {
  document.getElementById("errorMode").style.display = "none";
  document.getElementById("correctionMode").style.display = "none";
  document.getElementById("resultListPage").style.display = "none";
  document.getElementById("modeSelect").style.display = "block";
  document.getElementById("resetConfirmContainer").style.display = "block";
}

function resetAppAndReturnToLock() {
  try {
    resetApp(true); 
  } catch (e) {
    console.error("リセット処理中にエラーが発生しました:", e);
  }

  const modeSelect = document.getElementById("modeSelect");
  const lockScreen = document.getElementById("lockScreen");
  const passcode = document.getElementById("passcode");
  const resetConfirmContainer = document.getElementById("resetConfirmContainer");

  if (modeSelect) modeSelect.style.display = "none";
  if (lockScreen) lockScreen.style.display = "block";
  if (passcode) passcode.value = "";
  if (resetConfirmContainer) resetConfirmContainer.style.display = "none"; 

  setTimeout(() => {
    alert("全てのリセットが完了しました。初期画面に戻ります。");
    restartLockScreenAnimation();
  }, 100);
}

/**
 * 誤差計算モードで表示時刻と標準時刻の入力フィールドを入れ替える
 */
function swapErrorModeInputs() {
  const displayGroup = document.getElementById("errorModeDisplayInputGroup");
  const standardGroup = document.getElementById("errorModeStandardInputGroup");
  const modeCard = displayGroup.parentElement;
  const nowButton = document.getElementById("standardNowButton");
  const standardSecDirect = document.getElementById("standardSec_direct");
  const swapButtonWrapper = document.querySelector('.swap-btn').parentElement; // ⇅ボタンの親div

  if (!displayGroup || !standardGroup || !modeCard) return;

  const isMovingStandardUp = !isStandardOnTop;
  const omitClass = !includeDateEnabled ? "date-omitted" : "";

  // 1. フェードアウト＆スライド消去アニメーションの開始
  if (isMovingStandardUp) {
    // 標準時刻が上に上がる（標準Groupは上に消え、表示Groupは下に消える）
    standardGroup.className = `input-group ${omitClass} animate-up-out`.trim();
    displayGroup.className = `input-group ${omitClass} animate-down-out`.trim();
  } else {
    // 標準時刻が下に下がる（標準Groupは下に消え、表示Groupは上に消える）
    standardGroup.className = `input-group ${omitClass} animate-down-out`.trim();
    displayGroup.className = `input-group ${omitClass} animate-up-out`.trim();
  }

  // アニメーション完了（150ms）後に物理的なDOMの入れ替えと機能変更を実行
  setTimeout(() => {
    // 2. 物理的なDOM入れ替え
    if (isMovingStandardUp) {
      modeCard.insertBefore(standardGroup, displayGroup); 
      modeCard.insertBefore(swapButtonWrapper, displayGroup);
      
      // ♻で標準を上に移動するたびに秒の固定解除フラグをリセットし　00固定状態に戻す（要件②）
      _standardSecUnlocked = false;
      nowButton.style.display = "none";
      const realTimeRow = document.getElementById('realTimeCheckboxRow');
      if (realTimeRow) realTimeRow.style.display = 'flex';
      if (standardSecDirect) {
        standardSecDirect.value = "00";
        standardSecDirect.disabled = true;
        standardSecDirect.style.pointerEvents = 'none';
        standardSecDirect.classList.add('seconds-fixed-00');
      }
      // ドラム（standardSeconds）も同時に00固定にロック
      const standardSecsDrum = document.getElementById('standardSeconds');
      if (standardSecsDrum) {
        standardSecsDrum.value = "0";
        standardSecsDrum.disabled = true;
        standardSecsDrum.style.pointerEvents = 'none';
        standardSecsDrum.classList.add('seconds-fixed-00');
      }
    } else {
      modeCard.insertBefore(displayGroup, standardGroup);
      modeCard.insertBefore(swapButtonWrapper, standardGroup);
      
      nowButton.style.display = "inline-block";
      // Real Timeチェックをリセット
      if (realTimeInterval) { clearInterval(realTimeInterval); realTimeInterval = null; }
      const realTimeCheckbox = document.getElementById('realTimeCheckbox');
      if (realTimeCheckbox) realTimeCheckbox.checked = false;
      const realTimeRow = document.getElementById('realTimeCheckboxRow');
      if (realTimeRow) realTimeRow.style.display = 'none';
      if (standardSecDirect) {
        standardSecDirect.readOnly = false;
        standardSecDirect.style.opacity = '';
        standardSecDirect.disabled = false;
        standardSecDirect.style.pointerEvents = 'auto';
        standardSecDirect.classList.remove('seconds-fixed-00');
        // swap時に秒数をクリアせず、直前の秒（Real Timeまたは00固定）を保持する
      }
    }

    isStandardOnTop = isMovingStandardUp;
    calculateError();

    // 3. スライドイン＆フェードイン出現アニメーションの適用
    // 各要素が「元いた位置（内側）」から最終位置へ移動することで、
    // 消えるときと同じ「内側」の動きに見える
    if (isMovingStandardUp) {
      // 標準は元いた下から上へスライドして出現（内側から）
      standardGroup.className = `input-group ${omitClass} animate-up-in`.trim();
      // 表示は元いた上から下へスライドして出現（内側から）
      displayGroup.className = `input-group ${omitClass} animate-down-in`.trim();
    } else {
      // 表示は元いた下から上へスライドして出現（内側から）
      displayGroup.className = `input-group ${omitClass} animate-up-in`.trim();
      // 標準は元いた上から下へスライドして出現（内側から）
      standardGroup.className = `input-group ${omitClass} animate-down-in`.trim();
    }

    // 4. アニメーション終了（さらに150ms後）に元の静止クラス状態（date-omittedの有無など）に完全復元
    setTimeout(() => {
      const displayOmitClass = !includeDateEnabled ? "date-omitted" : "";
      const standardOmitClass = !includeDateEnabled ? "date-omitted" : "";
      
      displayGroup.className = `input-group ${displayOmitClass}`.trim();
      standardGroup.className = `input-group ${standardOmitClass}`.trim();
    }, 150);

  }, 150);
}


function calculateError() {
  let standardDateVal, standardTimeVal, displayDateVal, displayTimeVal, standardSecValue, displaySecValue;
  
  if (inputHelperEnabled) {
    standardDateVal = document.getElementById("standardDate").value;
    displayDateVal = document.getElementById("displayDate").value;
  } else {
    const sY = document.getElementById("standardYear_direct").value;
    const sM = document.getElementById("standardMonth_direct").value;
    const sD = document.getElementById("standardDay_direct").value;
    standardDateVal = buildDateString(sY, sM, sD);

    const dY = document.getElementById("displayYear_direct").value;
    const dM = document.getElementById("displayMonth_direct").value;
    const dD = document.getElementById("displayDay_direct").value;
    displayDateVal = buildDateString(dY, dM, dD);
  }
  
  // 時刻はON/OFF共通で直接入力から取得
  const sH = document.getElementById("standardHour_direct").value;
  const sMin = document.getElementById("standardMin_direct").value;
  standardTimeVal = buildTimeString(sH, sMin);
  
  const realTimeCheckbox = document.getElementById('realTimeCheckbox');
  const isRealTimeOn = realTimeCheckbox && realTimeCheckbox.checked;
  
  if (isStandardOnTop && !isRealTimeOn && !_standardSecUnlocked) {
    // 00固定状態（RealTimeが一度もONになっていない）→ 0秒を使用
    standardSecValue = "0";
  } else {
    standardSecValue = document.getElementById("standardSec_direct").value;
  }

  const dH = document.getElementById("displayHour_direct").value;
  const dMin = document.getElementById("displayMin_direct").value;
  displayTimeVal = buildTimeString(dH, dMin);
  displaySecValue = document.getElementById("displaySec_direct").value;
  
  const resultElement = document.getElementById("result");
  const toReverseButton = document.getElementById("toReverseButton");
  
  // --- システム当日の日付を取得（年月日未入力時の補完用） ---
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = String(today.getMonth() + 1).padStart(2, '0');
  const todayD = String(today.getDate()).padStart(2, '0');
  const todayStr = `${todayY}-${todayM}-${todayD}`;

  // 年月日が空なら当日の日付で補完する
  const finalStandardDate = standardDateVal || todayStr;
  const finalDisplayDate = displayDateVal || todayStr;

  // 秒の入力チェック（isStandardOnTop が true の場合、standardSecValue は "0" に固定）
  const isStandardSecValid = isStandardOnTop ? true : (standardSecValue !== "" && standardSecValue !== "ss" && standardSecValue !== "秒");
  const isDisplaySecValid = (displaySecValue !== "" && displaySecValue !== "ss" && displaySecValue !== "秒");

  // 各フィールドの個別判定
  let sY = "", sM = "", sD = "";
  let dY = "", dM = "", dD = "";
  if (inputHelperEnabled) {
    const sdParts = standardDateVal ? standardDateVal.split("-") : [];
    sY = sdParts[0] || ""; sM = sdParts[1] || ""; sD = sdParts[2] || "";
    const ddParts = displayDateVal ? displayDateVal.split("-") : [];
    dY = ddParts[0] || ""; dM = ddParts[1] || ""; dD = ddParts[2] || "";
  } else {
    sY = document.getElementById("standardYear_direct").value;
    sM = document.getElementById("standardMonth_direct").value;
    sD = document.getElementById("standardDay_direct").value;
    dY = document.getElementById("displayYear_direct").value;
    dM = document.getElementById("displayMonth_direct").value;
    dD = document.getElementById("displayDay_direct").value;
  }

  const hasStandardH   = !!sH;
  const hasStandardMin = !!sMin;
  const hasStandardSec = isStandardSecValid;
  const hasDisplayH    = !!dH;
  const hasDisplayMin  = !!dMin;
  const hasDisplaySec  = isDisplaySecValid;

  const hasStandardY = !!sY; const hasStandardM = !!sM; const hasStandardD = !!sD;
  const hasDisplayY  = !!dY; const hasDisplayM  = !!dM; const hasDisplayD  = !!dD;

  const showDate = includeDateEnabled;

  // 入力不足判定（年月日は showDate=trueのときのみチェック）
  const missingStandardInputs = [];
  const missingDisplayInputs = [];
  if (showDate) {
    if (!hasStandardY || !hasStandardM || !hasStandardD) missingStandardInputs.push("date");
    if (!hasDisplayY  || !hasDisplayM  || !hasDisplayD)  missingDisplayInputs.push("date");
  }
  // 時・分・秒を個別にチェック（時だけ入力や分だけ入力を正しく検出するため、buildTimeStringに頑りすぎず各フィールド単体で判定）
  if (!hasStandardH)   missingStandardInputs.push("時");
  if (!hasStandardMin) missingStandardInputs.push("分");
  if (!hasDisplayH)    missingDisplayInputs.push("時");
  if (!hasDisplayMin)  missingDisplayInputs.push("分");
  if (!isStandardSecValid) missingStandardInputs.push("秒");
  if (!isDisplaySecValid)  missingDisplayInputs.push("秒");
  
  const displayWarningEl = document.getElementById("displayWarning");
  const standardWarningEl = document.getElementById("standardWarning");
  if (displayWarningEl) displayWarningEl.style.visibility = "hidden";
  if (standardWarningEl) standardWarningEl.style.visibility = "hidden";

  // すべての入力が揃っていない場合
  if (missingStandardInputs.length > 0 || missingDisplayInputs.length > 0) {
    
    const isStandardEmpty = (!hasStandardY && !hasStandardM && !hasStandardD && !hasStandardH && !hasStandardMin && (!isStandardSecValid || isStandardOnTop));
    const isDisplayEmpty  = (!hasDisplayY && !hasDisplayM && !hasDisplayD && !hasDisplayH && !hasDisplayMin && !isDisplaySecValid);
    const isTotallyEmpty = isStandardEmpty && isDisplayEmpty;

    if (!isTotallyEmpty) {
        if (missingDisplayInputs.length > 0 && displayWarningEl) {
            displayWarningEl.innerText = buildMissingLabel(
                hasDisplayY,  hasDisplayM,  hasDisplayD,
                hasDisplayH,  hasDisplayMin, hasDisplaySec, showDate);
            displayWarningEl.style.visibility = "visible";
        }
        if (missingStandardInputs.length > 0 && standardWarningEl) {
            standardWarningEl.innerText = buildMissingLabel(
                hasStandardY, hasStandardM, hasStandardD,
                hasStandardH, hasStandardMin, hasStandardSec, showDate);
            standardWarningEl.style.visibility = "visible";
        }
    }

    // タイトル行を常に追加
    const titleText = isStandardOnTop ? "標準時刻から誤差を算出" : "表示時刻から誤差を算出";
    const titleColor = isStandardOnTop ? "var(--toggle-bg)" : "var(--accent)";
    
    resultElement.style.border = '';
    resultElement.style.borderRadius = '';
    resultElement.style.padding = '';
    resultElement.style.backgroundColor = '';
    resultElement.style.boxShadow = 'none';
    resultElement.innerHTML = `
        <span style="font-size: 16px; color: ${titleColor}; font-weight: bold;">${titleText}</span>
    `;
    
    toReverseButton.style.display = "none";
    hasCalculatedError = false;
    return;
  }
  
  // すべての入力が揃っている
  hasCalculatedError = true;

  const standardSec = Number(standardSecValue);
  const displaySec = Number(displaySecValue);

  // iOS/Androidでの互換性を高めるため、ISO 8601形式の文字列（T区切り）を生成してパース
  const standardDateStr = `${finalStandardDate}T${standardTimeVal}:${String(standardSec).padStart(2, '0')}`;
  const displayDateStr = `${finalDisplayDate}T${displayTimeVal}:${String(displaySec).padStart(2, '0')}`;

  const standard = new Date(standardDateStr);
  const display = new Date(displayDateStr);

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
    resultElement.style.border = '2px solid var(--accent)';
    resultElement.style.borderRadius = '10px';
    resultElement.style.padding = '12px 16px';
    resultElement.style.backgroundColor = '';
    resultElement.style.boxShadow = '';
    resultElement.innerHTML = `
      <p style="margin: 0 0 4px; font-size: 17px; color: var(--accent); font-weight: bold;">Precision Sync!</p>
      <p style="margin: 0; font-size: 14px; color: var(--text-sub);">表示時刻は標準時刻と完全に一致しています。</p>
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
    directionText = "進んでいます。";
    directionColor = "var(--error-late-color)"; // 太文字の赤
  } else {
    directionText = "遅れています。";
    directionColor = "var(--error-early-color)"; // 太文字の黄緑
  }

  resultElement.style.border = `2px solid ${directionColor}`;
  resultElement.style.borderRadius = '10px';
  resultElement.style.padding = '12px 16px';
  resultElement.style.backgroundColor = '';
  resultElement.style.boxShadow = '';
  resultElement.innerHTML = `
    <p style="margin: 0 0 6px; font-size: 17px; color: var(--accent); font-weight: bold; letter-spacing: 0.5px;">${parts.join('')}</p>
    <p style="margin: 0; font-size: 16px; color: ${directionColor}; font-weight: bold;">${directionText}</p>
  `;

  gtag('event', 'calculate_error'); 

  lastError = { days, hours, minutes, seconds, isFast };
  document.getElementById("toReverseButton").style.display = "block";
}

function setDirection(value) {
  const select = document.getElementById("errorDirection");
  if (!select) return;
  
  select.value = value;
  
  const btnLate = document.getElementById("btnLate");
  const btnEarly = document.getElementById("btnEarly");
  
  if (value === "late") {
    btnLate.classList.add("active-late");
    btnEarly.classList.remove("active-early");
  } else {
    btnLate.classList.remove("active-late");
    btnEarly.classList.add("active-early");
  }
  
  // 変更イベントを発火させて再計算をトリガー
  const event = new Event('change', { bubbles: true });
  select.dispatchEvent(event);
}

function toggleDirection() {
  const select = document.getElementById("errorDirection");
  if (!select) return;
  const currentValue = select.value;
  const newValue = (currentValue === "late") ? "early" : "late";
  setDirection(newValue);
}

function applyLastErrorToReverseInputs() {
  if (!lastError) return;

  const errorDaysEl = document.getElementById("errorDays");
  if (errorDaysEl) errorDaysEl.value = lastError.days || 0;
  
  // hh:mm 形式にフォーマットして errorTime に代入
  const padH = String(lastError.hours || 0).padStart(2, '0');
  const padM = String(lastError.minutes || 0).padStart(2, '0');

  const errorTimeEl = document.getElementById("errorTime");
  if (errorTimeEl) errorTimeEl.value = `${padH}:${padM}`;
  
  const errorSecondsEl = document.getElementById("errorSeconds");
  if (errorSecondsEl) errorSecondsEl.value = lastError.seconds || 0;

  // 直接入力側にも設定
  const errDaysD = document.getElementById("errorDays_direct");
  const errHoursD = document.getElementById("errorHours_direct");
  const errMinD = document.getElementById("errorMinutes_direct");
  const errSecD = document.getElementById("errorSeconds_direct");

  if (errDaysD) errDaysD.value = lastError.days || 0;
  if (errHoursD) errHoursD.value = padH;
  if (errMinD) errMinD.value = padM;
  if (errSecD) errSecD.value = String(lastError.seconds || 0).padStart(2, '0');
  
  // UIトグルの同期と計算実行
  setDirection(lastError.isFast ? "late" : "early");
  syncAllPlaceholderColors();
}

function switchToCorrectionMode() {
  disableRealTimeIfActive();
  document.getElementById("errorMode").style.display = "none";
  document.getElementById("correctionMode").style.display = "block";

  applyLastErrorToReverseInputs();
  reverseMode = "toStandard";
  toggleReverseMode(false); 
}

function toggleReverseMode(doToggle = true) {
  const toggleBtn = document.getElementById("reverseModeToggleBtn");
  const label = document.getElementById("reverseTimeLabel");
  const textLeft = document.getElementById("swapTextLeft");
  const textRight = document.getElementById("swapTextRight");
  
  if (doToggle) {
    reverseMode = reverseMode === "toStandard" ? "toDisplay" : "toStandard";
    
    // スワップアニメーション用のクラスを追加
    if (textLeft) textLeft.classList.add("slide-to-right");
    if (textRight) textRight.classList.add("slide-to-left");
    
    // アニメーション完了後にテキストをスワップし、クラスを削除して戻す
    setTimeout(() => {
      updateButtonTexts();
      if (textLeft) textLeft.classList.remove("slide-to-right");
      if (textRight) textRight.classList.remove("slide-to-left");
    }, 150); // cssのtransition 0.25sより少し短めの150msで入れ替え
  } else {
    updateButtonTexts();
  }

  function updateButtonTexts() {
    if (textLeft && textRight) {
      if (reverseMode === "toDisplay") {
        textLeft.textContent = "表示時刻を求める";
        textRight.textContent = "補正時刻を求める";
      } else {
        textLeft.textContent = "補正時刻を求める";
        textRight.textContent = "表示時刻を求める";
      }
    }
  }

  if (reverseMode === "toDisplay") {
    label.innerHTML = '<span style="color: var(--toggle-bg); font-weight: bold;">探している時刻:</span>'; 
    toggleBtn.classList.add("active-toggle-pink");
    toggleBtn.classList.remove("active-toggle");
  } else {
    label.innerHTML = '<span style="color: var(--accent); font-weight: bold;">表示時刻:</span>'; 
    toggleBtn.classList.remove("active-toggle-pink");
    toggleBtn.classList.add("active-toggle"); 
  }

  handleReverseCalculation();
}

function handleReverseCalculation() {
  const resultElement = document.getElementById("reverseResult");
  resultElement.innerHTML = "";

  let days, errorTimeVal, seconds, direction;
  let timeDateVal, timeTimeVal, timeSec;

  direction = document.getElementById("errorDirection").value;

  // 日数入力はON/OFFにかかわらず常に errorDays_direct が表示されており、そこに入力されているため一元化して取得
  days = Number(document.getElementById("errorDays_direct").value || 0);

  if (inputHelperEnabled) {
    timeDateVal = document.getElementById("reverseDisplayDate").value;
  } else {
    const rY = document.getElementById("reverseDisplayYear_direct").value;
    const rM = document.getElementById("reverseDisplayMonth_direct").value;
    const rD = document.getElementById("reverseDisplayDay_direct").value;
    timeDateVal = buildDateString(rY, rM, rD);
  }

  // 年月日も計算がOFFのときは、誤差の「日」は強制的に0日とする（非表示化に合わせた安全ガード）
  if (!includeDateEnabledCorrection) {
    days = 0;
  }

  // 誤差時間は常に直接入力から取得
  const eH = document.getElementById("errorHours_direct").value;
  const eM = document.getElementById("errorMinutes_direct").value;
  errorTimeVal = buildTimeString(eH, eM);
  seconds = Number(document.getElementById("errorSeconds_direct").value || 0);

  // 対象時刻は常に直接入力から取得
  const rH = document.getElementById("reverseDisplayHour_direct").value;
  const rMin = document.getElementById("reverseDisplayMin_direct").value;
  timeTimeVal = buildTimeString(rH, rMin);
  timeSec = document.getElementById("reverseDisplaySec_direct").value;

  let hours = 0;
  let minutes = 0;
  if (errorTimeVal) {
    const parts = errorTimeVal.split(":");
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
  }

  const hasError = (days > 0) || (errorTimeVal !== "") || (seconds > 0);
  const hasTime = (includeDateEnabledCorrection ? timeDateVal : true) && timeTimeVal && timeSec !== "" && timeSec !== "ss" && timeSec !== "--";

  document.getElementById("addToListButton").style.display = hasTime && hasError ? "inline-block" : "none";

  const correctionWarningEl = document.getElementById("correctionWarning");
  if (correctionWarningEl) correctionWarningEl.style.visibility = "hidden";

  if (!hasError && !hasTime) {
    resultElement.innerText = "誤差と時刻を入力してください";
    resultElement.style.color = "#e6c300"; // ★文字色を黄色に
    resultElement.style.border = '';
    resultElement.style.backgroundColor = '';
    return;
  }

  // 時間入力項目が一部不足している場合に親切なエラーを表示
  if (!hasTime && hasError) {
    const rH   = document.getElementById("reverseDisplayHour_direct").value;
    const rMin = document.getElementById("reverseDisplayMin_direct").value;
    const rSec = document.getElementById("reverseDisplaySec_direct").value;
    let rY = "", rM = "", rD = "";
    if (inputHelperEnabled) {
      const parts = timeDateVal ? timeDateVal.split("-") : [];
      rY = parts[0] || ""; rM = parts[1] || ""; rD = parts[2] || "";
    } else {
      rY = document.getElementById("reverseDisplayYear_direct").value;
      rM = document.getElementById("reverseDisplayMonth_direct").value;
      rD = document.getElementById("reverseDisplayDay_direct").value;
    }

    const showDate = includeDateEnabledCorrection;
    const hasRY = !!rY; const hasRM = !!rM; const hasRD = !!rD;
    const hasRH = !!rH; const hasRMin = !!rMin;
    const hasRSec = rSec !== "" && rSec !== "ss" && rSec !== "--";

    const msg = buildMissingLabel(hasRY, hasRM, hasRD, hasRH, hasRMin, hasRSec, showDate);
    if (correctionWarningEl) {
        correctionWarningEl.innerText = msg;
        correctionWarningEl.style.visibility = "visible";
    }
    resultElement.innerHTML = '';
    resultElement.style.border = '';
    resultElement.style.backgroundColor = '';
    return;
  }

  if (hasTime && !hasError) {
    resultElement.innerText = "補正に使う誤差を入力してください";
    resultElement.style.color = "#e6c300"; // ★文字色を黄色に
    resultElement.style.border = '';
    resultElement.style.backgroundColor = '';
    return;
  }

  // --- システム当日の日付を取得（年月日未入力時の補完用） ---
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = String(today.getMonth() + 1).padStart(2, '0');
  const todayD = String(today.getDate()).padStart(2, '0');
  const todayStr = `${todayY}-${todayM}-${todayD}`;
  const finalTimeDateVal = timeDateVal || todayStr;

  const baseTimeStr = `${finalTimeDateVal}T${timeTimeVal}:${String(timeSec).padStart(2, '0')}`;
  const baseTime = new Date(baseTimeStr);

  const totalMs = ((days * 86400) + (hours * 3600) + (minutes * 60) + seconds) * 1000;
  const isDisplayFast = direction === "late";

  let resultTimeMs;
  if (reverseMode === "toStandard") {
    resultTimeMs = baseTime.getTime() + (isDisplayFast ? -totalMs : totalMs);
  } else {
    resultTimeMs = baseTime.getTime() + (isDisplayFast ? totalMs : -totalMs);
  }

  const resultTime = new Date(resultTimeMs);

  gtag('event', 'calculate_correction'); 

  let baseStr, resultStr;
  if (includeDateEnabledCorrection) {
    baseStr = formatDate(baseTime, true);
    resultStr = formatDate(resultTime, true);
  } else {
    const formatTimeOnly = (date) => {
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${h}:${min}:${s}`;
    };

    baseStr = formatTimeOnly(baseTime);

    const baseDateOnly = new Date(baseTime.getFullYear(), baseTime.getMonth(), baseTime.getDate());
    const resultDateOnly = new Date(resultTime.getFullYear(), resultTime.getMonth(), resultTime.getDate());
    const diffTime = resultDateOnly.getTime() - baseDateOnly.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    const timeOnlyStr = formatTimeOnly(resultTime);
    if (diffDays === 0) {
      resultStr = timeOnlyStr;
    } else if (diffDays > 0) {
      resultStr = `${diffDays}日先の ${timeOnlyStr}`;
    } else {
      resultStr = `${Math.abs(diffDays)}日前の ${timeOnlyStr}`;
    }
  }
  
  const isToStandard = reverseMode === "toStandard";
  const resultBgColor = isToStandard ? "var(--result-standard-bg)" : "var(--result-display-bg)";
  const resultBorderColor = isToStandard ? "var(--accent)" : "var(--toggle-bg)";
  const resultColor = isToStandard ? "var(--accent)" : "var(--toggle-text)";

  const baseLabel = isToStandard ? "表示時刻" : "探している時刻";
  const resultLabel = isToStandard ? "補正時刻" : "表示時刻";

  resultElement.style.border = `2px solid ${resultBorderColor}`;
  resultElement.style.backgroundColor = resultBgColor;
  resultElement.style.color = 'var(--text-main)'; 

  resultElement.innerHTML = `
    <div style="padding: 6px 10px; line-height: 1.9; width: 100%; box-sizing: border-box;">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-bottom: 0;">
        <span style="font-size: 13px; text-align: right; white-space: nowrap; padding-right: 4px;">${baseLabel}が</span>
        <span style="font-size: 14px; font-weight: bold; color: ${resultColor}; background: var(--bg-dark); border: 1px solid ${resultBorderColor}; border-radius: 6px; padding: 2px 8px; letter-spacing: 0.5px; white-space: nowrap;">${baseStr}</span>
        <span></span>
      </div>
      <p style="margin: 0; font-size: 13px; text-align: center;">のとき</p>
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-top: 0;">
        <span style="font-size: 13px; text-align: right; white-space: nowrap; padding-right: 4px;">${resultLabel}は</span>
        <span style="font-size: 14px; font-weight: bold; color: ${resultColor}; background: var(--bg-dark); border: 1px solid ${resultBorderColor}; border-radius: 6px; padding: 2px 8px; letter-spacing: 0.5px; white-space: nowrap;">${resultStr}</span>
        <span></span>
      </div>
      <p style="margin: 0; font-size: 13px; text-align: center;">である</p>
    </div>
  `;

  document.getElementById("showListLink").style.display = "block";

  const result = {
    id: Date.now(), 
    error: { days, hours, minutes, seconds, direction },
    mode: reverseMode,
    base: baseTime,
    result: resultTime,
    includeDateCorrection: includeDateEnabledCorrection
  };
  window.latestResult = result;
}

function addResultToList() {
  const r = window.latestResult;
  if (!r) return;

  const padH = String(r.error.hours || 0).padStart(2, '0');
  const padM = String(r.error.minutes || 0).padStart(2, '0');
  const errorKey = `${r.error.days}-${padH}-${padM}-${r.error.seconds}-${r.error.direction}`;
  
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
    entry.mode === r.mode &&
    entry.includeDateCorrection === r.includeDateCorrection
  );

  if (isDuplicate) {
    const msg = document.getElementById("recordSuccessMessage");
    const originalText = msg.innerText;
    msg.innerText = "既に記録されています";
    msg.style.display = 'inline-block';
    msg.classList.remove('fade-out');
    msg.classList.add('fade-in-out');
    setTimeout(() => {
        msg.classList.remove('fade-in-out');
        msg.classList.add('fade-out');
        setTimeout(() => {
            msg.style.display = 'none';
            msg.classList.remove('fade-out');
            msg.innerText = originalText; 
        }, 500); 
    }, 1000); 
    return;
  }
  
  const newEntry = {
    id: Date.now(),
    base: r.base, 
    result: r.result, 
    mode: r.mode,
    includeDateCorrection: r.includeDateCorrection
  };
  group.entries.push(newEntry);
  
  saveResultHistory();

  gtag('event', 'add_to_list'); 

  renderResultList();
  
  if (resultHistory.length > 0) {
      const listLink = document.getElementById("showListLink");
      listLink.style.display = "block"; 
      listLink.innerText = "結果一覧を表示 →"; 
  }

  // 成功メッセージ表示アニメーション
  const msg = document.getElementById("recordSuccessMessage");
  msg.innerText = "✔ 追加しました";
  msg.style.display = 'inline-block';
  msg.classList.remove('fade-out');
  msg.classList.add('fade-in-out');
  setTimeout(() => {
      msg.classList.remove('fade-in-out');
      msg.classList.add('fade-out');
      setTimeout(() => {
          msg.style.display = 'none';
          msg.classList.remove('fade-out');
      }, 500); 
  }, 1000); 
}

function showResultList() {
    document.getElementById("correctionMode").style.display = "none";
    document.getElementById("resultListPage").style.display = "block";
    renderResultList();
}

function renderResultList() {
  const container = document.getElementById("resultListContainer");
  container.innerHTML = "";
  
  if (resultHistory.length === 0) {
    container.innerHTML = "<p style='color: var(--text-sub); text-align: center;'>記録された結果はありません。</p>";
    document.getElementById("showListLink").style.display = "none";
    return;
  }

  resultHistory.forEach(group => {
    const { days, hours, minutes, seconds, direction } = group.error;
    
    // (1) 頭の0の時間を表示しないインテリジェント表示ロジック
    let errorText = "";
    const d = days || 0;
    const h = hours || 0;
    const m = minutes || 0;
    const s = seconds || 0;

    if (d > 0) {
      errorText = `${d}日${h}時間${m}分${s}秒`;
    } else if (h > 0) {
      errorText = `${h}時間${m}分${s}秒`;
    } else if (m > 0) {
      errorText = `${m}分${s}秒`;
    } else {
      errorText = `${s}秒`;
    }
    errorText += `（${direction === "late" ? "進み" : "遅れ" }）`;
    
    const entriesByMode = group.entries.reduce((acc, entry) => {
      if (!acc[entry.mode]) {
        acc[entry.mode] = [];
      }
      acc[entry.mode].push(entry);
      return acc;
    }, {});
    
    Object.keys(entriesByMode).forEach(mode => {
      entriesByMode[mode].sort((a, b) => a.base.getTime() - b.base.getTime());
    });

    // 縦つぶしレイアウト圧縮の適用
    const outerBox = document.createElement("div");
    outerBox.className = "result-list-group-outer";
    outerBox.style.padding = "8px 10px";
    outerBox.style.marginBottom = "12px";
    outerBox.style.border = '2px solid var(--text-sub)';
    outerBox.style.borderRadius = "8px";
    outerBox.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
    outerBox.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";

    const title = document.createElement("h3");
    title.innerHTML = `<strong>補正に使った誤差：</strong>${errorText}`;
    title.style.color = 'var(--accent)';
    title.style.marginTop = "2px";
    title.style.marginBottom = "8px";
    title.style.borderBottom = "1px dashed var(--text-sub)";
    title.style.paddingBottom = "4px";
    outerBox.appendChild(title);

    ['toStandard', 'toDisplay'].forEach(mode => {
      const modeEntries = entriesByMode[mode];
      if (!modeEntries || modeEntries.length === 0) return;

      const isToStandard = mode === 'toStandard';
      const baseLabel = isToStandard ? "表示時刻" : "探索時刻";
      const resultLabel = isToStandard ? "補正時刻" : "表示時刻";
      const resultColor = isToStandard ? "var(--accent)" : "var(--toggle-text)"; 
      const borderColor = isToStandard ? "var(--accent)" : "var(--toggle-bg)"; 
      const bgColor = isToStandard ? "rgba(0, 255, 224, 0.05)" : "rgba(255, 0, 170, 0.05)";

      const innerBox = document.createElement("div");
      innerBox.className = "result-list-group-inner";
      innerBox.style.border = `1px solid ${borderColor}`;
      innerBox.style.backgroundColor = bgColor;
      innerBox.style.borderRadius = "6px";
      innerBox.style.padding = "6px 8px";
      innerBox.style.marginBottom = "6px";
      innerBox.style.textAlign = "left";

      const modeHeader = document.createElement("div");
      modeHeader.innerHTML = `<strong style="color: ${borderColor}; font-size: 13px;">${baseLabel} → ${resultLabel} の計算</strong>`;
      modeHeader.style.marginBottom = "4px";
      modeHeader.style.paddingBottom = "2px";
      innerBox.appendChild(modeHeader);

      modeEntries.forEach(entry => {
        const line = document.createElement("div");
        line.style.marginBottom = "3px";
        line.style.display = "flex";
        line.style.justifyContent = "space-between";
        line.style.alignItems = "center";
        
        let baseStr, resultStr;
        if (entry.includeDateCorrection === undefined || entry.includeDateCorrection) {
          baseStr = formatDate(entry.base, true);
          resultStr = formatDate(entry.result, true);
        } else {
          const formatTimeOnly = (date) => {
            const h = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            const s = String(date.getSeconds()).padStart(2, '0');
            return `${h}:${min}:${s}`;
          };

          baseStr = formatTimeOnly(entry.base);

          const baseDateOnly = new Date(entry.base.getFullYear(), entry.base.getMonth(), entry.base.getDate());
          const resultDateOnly = new Date(entry.result.getFullYear(), entry.result.getMonth(), entry.result.getDate());
          const diffTime = resultDateOnly.getTime() - baseDateOnly.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          const timeOnlyStr = formatTimeOnly(entry.result);
          if (diffDays === 0) {
            resultStr = timeOnlyStr;
          } else if (diffDays > 0) {
            resultStr = `${diffDays}日先の ${timeOnlyStr}`;
          } else {
            resultStr = `${Math.abs(diffDays)}日前の ${timeOnlyStr}`;
          }
        }

        const textSpan = document.createElement("span");
        textSpan.style.display = "block";
        textSpan.style.flex = "1";
        textSpan.style.marginRight = "8px";

        // 日付あり・なしに関わらず、同じHTML構造で表示する
        textSpan.innerHTML = `
          <span style="font-size: 13px; color: var(--text-sub); display: block;">${baseLabel}が ${baseStr} →</span>
          <span style="font-size: 14px; font-weight: bold; color: ${resultColor}; display: block; margin-top: 1px;">${resultLabel}は ${resultStr}</span>
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
  
  resultHistory = resultHistory.map(group => {
    const initialLength = group.entries.length;
    group.entries = group.entries.filter(entry => entry.id !== idToDelete);
    if (group.entries.length < initialLength) {
      isDeleted = true;
    }
    return group;
  }).filter(group => group.entries.length > 0); 

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
  document.getElementById("qrCodePage").style.display = "none"; 
  document.getElementById("lockScreen").style.display = "block";
}

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

                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New content available, show update prompt');
                            updateNotification.style.display = 'block'; 
                        }
                    });
                });
            })
            .catch(error => {
                console.log('Service Worker 登録失敗:', error);
            });
    });

    if (updateButton) {
        updateButton.addEventListener('click', () => {
            if (newWorker) {
                newWorker.postMessage({ action: 'skipWaiting' });
            }
        });
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

// ==========================================================================
// iPhone（iOS）用：input[type="time"]/input[type="date"] の .time-empty / .date-empty クラス着脱制御
// ==========================================================================
function initPlaceholderGuides() {
  const timeInputs = document.querySelectorAll('input[type="time"]');
  const dateInputs = document.querySelectorAll('input[type="date"]');
  
  timeInputs.forEach(input => {
    const updateEmptyClass = () => {
      if (!input.value) {
        input.classList.add("time-empty");
      } else {
        input.classList.remove("time-empty");
      }
    };

    // 初期化時
    updateEmptyClass();

    // イベント登録
    input.addEventListener("input", updateEmptyClass);
    input.addEventListener("change", updateEmptyClass);
    input.addEventListener("blur", updateEmptyClass);
    input.addEventListener("focus", () => {
      // フォーカスイベントの不整合による「ガイドが消えたまま戻らない」バグを完全解決！
      // フォーカス時も、値が空なら time-empty を維持し、ユーザーが文字入力を開始した瞬間に即座に消去します。
      updateEmptyClass();
    });
  });

  dateInputs.forEach(input => {
    const updateEmptyClass = () => {
      if (!input.value) {
        input.classList.add("date-empty");
      } else {
        input.classList.remove("date-empty");
      }
    };

    // 初期化時
    updateEmptyClass();

    // イベント登録
    input.addEventListener("input", updateEmptyClass);
    input.addEventListener("change", updateEmptyClass);
    input.addEventListener("blur", updateEmptyClass);
    input.addEventListener("focus", () => {
      // フォーカスイベントの不整合による「ガイドが消えたまま戻らない」バグを完全解決！
      // フォーカス時も、値が空なら date-empty を維持し、ユーザーが文字入力を開始した瞬間に即座に消去します。
      updateEmptyClass();
    });
  });
}

// ページロード時およびDOMContentLoaded時に確実に初期化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlaceholderGuides);
} else {
  initPlaceholderGuides();
}

/* ==========================================================================
   テンキーキーボード表示時の自動スクロール（入力補助OFF時など）
   ========================================================================== */
let _lastTextInputBlurTime = 0;
document.addEventListener("focusout", function(e) {
  if (e.target && e.target.tagName === "INPUT" && 
      e.target.type !== "checkbox" && 
      e.target.type !== "radio" && 
      e.target.type !== "button") {
    _lastTextInputBlurTime = Date.now();
  }
});

document.addEventListener("focusin", function(e) {
  if (activeTimePickerGroup) return; // ピッカー起動中はキーボード用自動スクロールとの二重競合をシャットアウト！
  if (e.target.tagName === "INPUT" && 
      e.target.type !== "checkbox" && 
      e.target.type !== "radio" && 
      e.target.type !== "button" && 
      e.target.type !== "date") {
    
    // 隣接する入力枠への移動時（連続入力時）は、画面が上下にバウンドするのを防ぐためスクロール処理をスキップ
    if (e.relatedTarget && e.relatedTarget.tagName === "INPUT") {
      return;
    }
    if (Date.now() - _lastTextInputBlurTime < 150) {
      return;
    }
    
    // キーボード展開アニメーション完了を待ってからスクロール判定
    setTimeout(() => {
      const isErrorMode = document.getElementById("errorMode").style.display !== "none";
      const targetResultId = isErrorMode ? "result" : "reverseResult";
      const targetEl = document.getElementById(targetResultId);
      
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const keyboardHeight = 350; // iOS/Androidの一般的なキーボード高さ + 余白
        if (rect.bottom > window.innerHeight - keyboardHeight) {
          window.scrollBy({ top: rect.bottom - (window.innerHeight - keyboardHeight), behavior: "smooth" });
        }
      }
    }, 400);
  }
});








/* ==========================================================================
   スライドアニメーション付きスワイプナビゲーション (バグ修正最終版)

   【修正した根本原因】
   - touchmove内でgetCurrentId()を毎回呼ぶと、toElをdisplay:blockにした瞬間
     「現在の画面」と誤検知し、ロック判定やdestId計算が狂う
   - 修正: touchstartで画面を1回確定し、touchmove/touchendはその値を使い続ける
   - 遷移先のbackground上書きを廃止: CSS クラスの色を生かすことで
     「色が後から出現する」バグを解消
   - 左スワイプ(指を左へ) = 次の画面へ進む
   - 右スワイプ(指を右へ) = 前の画面へ戻る
   ========================================================================== */
(function() {
  'use strict';

  let startX       = 0;
  let startY       = 0;
  let lastX        = 0;
  let isSwiping    = false;
  let isTransitioning = false;
  let axisLocked   = null;   // null | 'horizontal' | 'vertical'
  let currentId    = null;   // touchstartで確定した現在画面ID（以降変更しない）
  let isLockedScreen = false; // ロック/モード選択画面かどうか（touchstartで確定）

  let fromEl = null;
  let toEl   = null;
  let toId   = null;

  // スワイプ可能な画面一覧（modeSelectを先頭に追加）
  const SWIPEABLE = ['modeSelect', 'errorMode', 'correctionMode', 'resultListPage'];
  // スワイプさせない画面一覧（デコイ画面も完全固定）
  const LOCKED    = ['lockScreen', 'decoyScreen'];

  function getEl(id) { return document.getElementById(id); }

  // 現在表示中のスクリーンIDを返す（touchstartのみで呼ぶ）
  function detectCurrentId() {
    for (const id of LOCKED) {
      const el = getEl(id);
      if (el && el.style.display !== 'none' && el.style.display !== '') return id;
    }
    for (const id of SWIPEABLE) {
      const el = getEl(id);
      if (el && el.style.display !== 'none' && el.style.display !== '') return id;
    }
    return null;
  }

  // 左スワイプ(dX<0)=進む, 右スワイプ(dX>0)=戻る
  function getDestId(srcId, dX) {
    if (dX < 0) {
      // 左スワイプ → 次の画面へ
      if (srcId === 'modeSelect')     return 'errorMode';
      if (srcId === 'errorMode')      return 'correctionMode';
      if (srcId === 'correctionMode') return 'resultListPage';
    } else {
      // 右スワイプ → 前の画面へ
      if (srcId === 'resultListPage') return 'correctionMode';
      if (srcId === 'correctionMode') return 'modeSelect';
      if (srcId === 'errorMode')      return 'modeSelect';
    }
    return null;
  }

  // 遷移完了後の副作用のない後処理のみ
  function afterSwipe(destId, srcId) {
    if (destId === 'resultListPage') {
      if (typeof renderResultList === 'function') renderResultList();
    }
    if (destId === 'modeSelect') {
      const rc = getEl('resetConfirmContainer');
      if (rc) rc.style.display = 'none';
    }
    // ①: 誤差の計算モードからスワイプで補正時刻の計算モードに来た場合、計算結果を反映
    if (destId === 'correctionMode' && srcId === 'errorMode') {
      if (typeof applyLastErrorToReverseInputs === 'function'
          && typeof lastError !== 'undefined' && lastError) {
        applyLastErrorToReverseInputs();
      }
    }
  }

  // スワイプ/遷移中はボタン誤作動を防ぐ
  document.addEventListener('click', function(e) {
    if (isSwiping || isTransitioning) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ----------------------------------------------------------------
  // touchstart: 現在の画面を1回だけ確定し、以降はその値を使い続ける
  // ----------------------------------------------------------------
  document.addEventListener('touchstart', function(e) {
    if (isTransitioning) return;
    if (e.touches.length > 1) return;
    if (typeof activeTimePickerGroup !== 'undefined' && activeTimePickerGroup) return;

    // 現在の画面を確定（toElを表示する前のクリーンな状態で検出）
    currentId      = detectCurrentId();
    isLockedScreen = currentId ? LOCKED.includes(currentId) : false;

    if (!currentId) return;

    // ロック画面はスワイプ開始しない
    if (isLockedScreen) {
      isSwiping = false;
      fromEl = null;
      return;
    }

    fromEl = getEl(currentId);
    if (!fromEl) return;

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    lastX  = startX;

    // 画面端20px以内は除外（ブラウザの戻るジェスチャー対策）
    if (startX < 20 || startX > window.innerWidth - 20) {
      isSwiping = false;
      fromEl = null;
      return;
    }

    isSwiping  = true;
    axisLocked = null;
    toEl = null;
    toId = null;

  }, { passive: true });

  // ----------------------------------------------------------------
  // touchmove: touchstartで確定したcurrentId/fromElを使う
  //            toElをdisplay:blockにしても誤検知しない
  // ----------------------------------------------------------------
  document.addEventListener('touchmove', function(e) {

    // ロック画面・モード選択は常に全スクロール禁止
    // ※ isLockedScreenフラグを使い、toElの表示状態に左右されない
    if (isLockedScreen) {
      e.preventDefault();
      return;
    }

    if (!isSwiping || isTransitioning) return;
    if (!fromEl || !currentId) return;

    const x  = e.touches[0].clientX;
    const y  = e.touches[0].clientY;
    const dX = x - startX;
    const dY = y - startY;
    lastX = x;

    // 軸を確定（10px動くまで待つ）
    if (!axisLocked) {
      if (Math.abs(dX) < 10 && Math.abs(dY) < 10) return;
      axisLocked = Math.abs(dX) >= Math.abs(dY) ? 'horizontal' : 'vertical';
      if (axisLocked === 'vertical') {
        isSwiping = false;
        fromEl = null;
        return;
      } else {
        // 水平スワイプ確定時のみtransitionを解除（タップ時のDOM操作によるフォーカス消失バグ回避）
        fromEl.style.transition = 'none';
      }
    }

    // 水平スワイプと確定したのでスクロールを禁止
    e.preventDefault();

    // currentId（touchstartで確定）を使って遷移先を判定
    const destId = getDestId(currentId, dX);
    if (!destId) {
      // 行き先なし: 少しだけ引っ張られる感触
      fromEl.style.transform = `translateX(${dX * 0.15}px)`;
      return;
    }

    // 遷移先を初回だけ準備
    if (toId !== destId) {
      if (toEl) {
        toEl.style.display    = 'none';
        toEl.style.position   = '';
        toEl.style.zIndex     = '';
        // resultListPageのみwidth/minHeight/backgroundをリセット
        if (toEl.id === 'resultListPage') {
          toEl.style.width      = '';
          toEl.style.minHeight  = '';
          toEl.style.background = '';
        }
        toEl.style.transform  = '';
        toEl.style.transition = '';
      }
      toId = destId;
      toEl = getEl(toId);

      // ② mode-cardの要素(correctionMode/errorMode)はwidthとminHeightを変更しない。
      //   CSSクラスの width:94% / border-radius をそのまま維持することで
      //   遷移後のサイズ変化フラッシュ（全画面緑→カードサイズ）を解消。
      //   resultListPageだけ全画面背景が必要なため個別設定。
      const initW = window.innerWidth;
      const initBase = dX > 0 ? -initW : initW;
      toEl.style.transition = 'none';
      // スワイプ中は absolute にすることでドキュメントの元の高さ(margin-top等)を維持する
      toEl.style.position   = 'absolute';
      toEl.style.top        = '0';
      toEl.style.left       = '0';
      toEl.style.right      = '0';
      toEl.style.marginLeft = 'auto';
      toEl.style.marginRight= 'auto';
      if (toId === 'resultListPage') {
        toEl.style.width      = '100%';
        toEl.style.minHeight  = '100vh';
        toEl.style.background = 'var(--bg-dark, #111118)';
      }
      toEl.style.zIndex     = '100';
      // display:blockより先にtransformで画面外へ → 表示時に一瞬でも中央に見えない
      toEl.style.transform  = `translateX(${initBase + dX}px)`;
      toEl.style.display    = 'block';
    }

    const w    = window.innerWidth;
    const base = dX > 0 ? -w : w;
    fromEl.style.transform = `translateX(${dX}px)`;
    toEl.style.transform   = `translateX(${base + dX}px)`;

  }, { passive: false });

  // ----------------------------------------------------------------
  // touchend: 遷移確定 or キャンセル
  // ----------------------------------------------------------------
  document.addEventListener('touchend', function(e) {
    if (!isSwiping || isTransitioning) return;
    isSwiping = false;

    if (axisLocked !== 'horizontal') {
      fromEl = null; toEl = null; toId = null; currentId = null;
      return;
    }

    const dX        = lastX - startX;
    const w         = window.innerWidth;
    const threshold = w * 0.25;

    if (!toEl) {
      // 行き先なし: 元に戻す
      if (fromEl) {
        fromEl.style.transition = 'transform 0.3s ease';
        fromEl.style.transform  = 'translateX(0)';
        const f = fromEl;
        setTimeout(() => {
          f.style.transition = '';
          f.style.transform  = '';
        }, 300);
      }
      fromEl = null; toEl = null; toId = null; currentId = null;
      axisLocked = null;
      return;
    }

    if (Math.abs(dX) > threshold) {
      // ===== 遷移確定 =====
      isTransitioning = true;
      if (currentId === 'errorMode' && typeof disableRealTimeIfActive === 'function') {
        disableRealTimeIfActive();
      }

      fromEl.style.transition = 'transform 0.3s ease';
      toEl.style.transition   = 'transform 0.3s ease';
      fromEl.style.transform  = `translateX(${dX > 0 ? w : -w}px)`;
      toEl.style.transform    = 'translateX(0)';

      const cFrom  = fromEl;
      const cTo    = toEl;
      const cToId  = toId;
      const cFromId = currentId;  // ①の判定用: 遷移元IDを保存

      fromEl = null; toEl = null; toId = null; currentId = null;

      setTimeout(() => {
        // from 画面を完全に非表示＆リセット
        cFrom.style.display    = 'none';
        cFrom.style.transform  = '';
        cFrom.style.transition = '';

        // to 画面を通常フローへ戻す
        cTo.style.position   = '';
        cTo.style.top        = '';
        cTo.style.left       = '';
        cTo.style.right      = '';
        cTo.style.marginLeft = '';
        cTo.style.marginRight= '';
        // resultListPageのみリセット
        if (cTo.id === 'resultListPage') {
          cTo.style.width      = '';
          cTo.style.minHeight  = '';
          cTo.style.background = '';
        }
        cTo.style.zIndex     = '';
        cTo.style.transform  = '';
        cTo.style.transition = '';
        cTo.style.display    = 'block';

        afterSwipe(cToId, cFromId);
        setTimeout(() => { isTransitioning = false; }, 50);
      }, 300);

    } else {
      // ===== キャンセル: 元の位置に戻す =====
      isTransitioning = true;

      fromEl.style.transition = 'transform 0.3s ease';
      toEl.style.transition   = 'transform 0.3s ease';
      fromEl.style.transform  = 'translateX(0)';
      toEl.style.transform    = `translateX(${dX > 0 ? -w : w}px)`;

      const cFrom = fromEl;
      const cTo   = toEl;

      fromEl = null; toEl = null; toId = null; currentId = null;

      setTimeout(() => {
        cFrom.style.transform  = '';
        cFrom.style.transition = '';

        cTo.style.display    = 'none';
        cTo.style.position   = '';
        cTo.style.top        = '';
        cTo.style.left       = '';
        cTo.style.right      = '';
        cTo.style.marginLeft = '';
        cTo.style.marginRight= '';
        if (cTo.id === 'resultListPage') {
          cTo.style.width      = '';
          cTo.style.minHeight  = '';
          cTo.style.background = '';
        }
        cTo.style.zIndex     = '';
        cTo.style.transform  = '';
        cTo.style.transition = '';

        isTransitioning = false;
      }, 300);
    }

    axisLocked = null;
  });

})();
