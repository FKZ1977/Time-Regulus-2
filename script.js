const currentVersion = "3.0.3";
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

      if (enabled) {
        el.readOnly = true;
        el.tabIndex = -1;
      } else {
        el.readOnly = false;
        // 保存していた元の tabindex に復元するか、なければ 0 に戻す
        if (el.hasAttribute('data-orig-tabindex')) {
          el.setAttribute('tabindex', el.getAttribute('data-orig-tabindex'));
        } else {
          el.tabIndex = 0;
        }
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
    if (isStandardOnTop) {
      sVal = "0"; // 標準時刻が上の場合は 00秒 に完全固定
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
  if (group === "standard" && isStandardOnTop) {
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

  if (group === "standard" && isStandardOnTop) {
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
  const errorMessage = document.getElementById("error");

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

// ロック画面のアニメーション再始動用ヘルパー
function restartLockScreenAnimation() {
  const title = document.querySelector("#lockScreen h1.fkz");
  const subtitle = document.querySelector("#lockScreen .subtitle");
  const labels = document.querySelectorAll("#lockScreen label, #lockScreen input, #lockScreen button.action-btn, #lockScreen p:not(.fkz)");
  
  if (title) title.classList.remove("anim-title-rise");
  if (subtitle) subtitle.classList.remove("anim-slow-fade");
  labels.forEach(el => el.classList.remove("anim-slow-fade"));
  
  generateKeypad(); // 瞬きアニメーションをトリガー
  
  // DOMリフロー後にアニメーションを最初から実行
  setTimeout(() => {
    if (title) title.classList.add("anim-title-rise");
    if (subtitle) subtitle.classList.add("anim-slow-fade");
    labels.forEach(el => el.classList.add("anim-slow-fade"));
  }, 10);
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
    alert("タイムレグルスはV3.0.3にアップデートされました！");
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

      // iOS テンキーの「∧∨」ナビゲーションによるフォーカス移動を防止
      el.addEventListener("focus", function() {
        if (isDirectField && !inputHelperEnabled) {
          // 直接入力枠で、かつ入力補助OFFのときはフォーカス移動させる
          return;
        }
        // 入力補助ONのときは、キーボードナビゲーション（∧∨）による意図しないピッカー起動を防ぐため、
        // focusイベント単体でのピッカー自動起動を完全に廃止し、即座にフォーカスを外す（blur）のみにする。
        // 【バグ修正】focusイベントの最中に同期的に blur() を呼ぶと、iOS Safariがフォーカスを直前の"日"の枠に差し戻してしまい、
        // "日"の入力枠が点滅フリーズ（デッドロック）するバグが発生します。
        // これを防ぐため、setTimeoutで少しまとしてから blur() を安全に実行します。
        setTimeout(() => {
          el.blur();
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

function showErrorMode() {
  document.getElementById("modeSelect").style.display = "none";
  document.getElementById("errorMode").style.display = "block";
  
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

function backToModeSelect() {
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
     const showListLinkEl = document.getElementById("showListLink");
     if (showListLinkEl) showListLinkEl.style.display = "none";
  } else {
     syncAllPlaceholderColors();
     return;
  }
  syncAllPlaceholderColors();
}

/**
 * 入力情報のリセット確認ボタンを表示する
 */
function showResetConfirmation() {
  document.getElementById("errorMode").style.display = "none";
  document.getElementById("correctionMode").style.display = "none";
  document.getElementById("resultListPage").style.display = "none";
  document.getElementById("modeSelect").style.display = "block";
  document.getElementById("resetConfirmContainer").style.display = "block";
}

/**
 * 入力情報を消去し、初期画面に戻る
 */
function resetAppAndReturnToLock() {
  try {
    resetApp(true); 
  } catch (e) {
    console.error("リセット処理中にエラーが発生しました:", e);
  }

  // 画面の非表示・表示切り替え（ロック画面への確実な帰還）を保証するガード処理
  const modeSelect = document.getElementById("modeSelect");
  const lockScreen = document.getElementById("lockScreen");
  const passcode = document.getElementById("passcode");
  const resetConfirmContainer = document.getElementById("resetConfirmContainer");

  if (modeSelect) modeSelect.style.display = "none";
  if (lockScreen) lockScreen.style.display = "block";
  if (passcode) passcode.value = "";
  if (resetConfirmContainer) resetConfirmContainer.style.display = "none"; 

  // 【バグ修正】同期的な alert() による描画スレッドのロック（フリーズ）を防ぐため、100msの遅延後に alert を実行
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
      
      nowButton.style.display = "none";
      if (standardSecDirect) {
        standardSecDirect.value = "00";
        standardSecDirect.disabled = true;
        standardSecDirect.style.pointerEvents = 'none';
        standardSecDirect.classList.add('seconds-fixed-00');
      }
    } else {
      modeCard.insertBefore(displayGroup, standardGroup);
      modeCard.insertBefore(swapButtonWrapper, standardGroup);
      
      nowButton.style.display = "inline-block";
      if (standardSecDirect) {
        standardSecDirect.disabled = false;
        standardSecDirect.style.pointerEvents = 'auto';
        standardSecDirect.classList.remove('seconds-fixed-00');
        standardSecDirect.value = "";
      }
    }

    isStandardOnTop = isMovingStandardUp;
    calculateError();

    // 3. スライドイン＆フェードイン出現アニメーションの適用
    if (isMovingStandardUp) {
      // 上に来た標準Groupは上から降りて出現し、下に来た表示Groupは下から昇って出現する
      standardGroup.className = `input-group ${omitClass} animate-down-in`.trim();
      displayGroup.className = `input-group ${omitClass} animate-up-in`.trim();
    } else {
      // 上に来た表示Groupは上から降りて出現し、下に来た標準Groupは下から昇って出現する
      displayGroup.className = `input-group ${omitClass} animate-down-in`.trim();
      standardGroup.className = `input-group ${omitClass} animate-up-in`.trim();
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
  
  if (isStandardOnTop) {
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

  // --- 入力チェック ---
  
  const missingStandardInputs = [];
  const missingDisplayInputs = [];
  
  // 1. 標準時刻の入力欄チェック（年月日のチェックは廃止）
  if (!standardTimeVal) {
    missingStandardInputs.push("時分");
  }
  
  // 2. 表示時刻の入力欄チェック（年月日のチェックは廃止）
  if (!displayTimeVal) {
    missingDisplayInputs.push("時分");
  }
  
  // 秒の入力チェックに必要な変数の定義
  // isStandardOnTop が true の場合、standardSecValue は "0" に固定されている
  const isStandardSecValid = isStandardOnTop ? (standardSecValue === "0") : (standardSecValue !== "" && standardSecValue !== "ss" && standardSecValue !== "秒");
  const isDisplaySecValid = (displaySecValue !== "" && displaySecValue !== "ss" && displaySecValue !== "秒");

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
    
    // 標準時刻と表示時刻の両方で「時分」「秒」が不足しているかチェック
    const isTotallyEmpty = (isStandardOnTop ?
        (!standardTimeVal && !displayTimeVal && !isDisplaySecValid) :
        (!standardTimeVal && !displayTimeVal && !isStandardSecValid && !isDisplaySecValid)
    );
    
    let messageContent;
    let messageStyle = `font-size: 14px; color: #FFFF00; font-weight: bold; line-height: 1.5;`;

    if (isTotallyEmpty) {
        const firstLine = isStandardOnTop ? "標準時刻から誤差を算出" : "表示時刻から誤差を算出";
        messageContent = `
            ${firstLine}<br>
            <span style="font-size: 14px; color: var(--text-sub); font-weight: normal; line-height: 1.5;">
                時分、秒を入力してください
            </span>
        `;
        messageStyle = `font-size: 16px; color: var(--accent); font-weight: bold; line-height: 1.5; text-decoration: none;`; 

    } else {
        const standardMessage = missingStandardInputs.length > 0
          ? `標準時刻: ${missingStandardInputs.join(", ")}が不足`
          : "";
          
        const displayMessage = missingDisplayInputs.length > 0
          ? `表示時刻: ${missingDisplayInputs.join(", ")}が不足`
          : "";

        let finalMessageLines = [];
        
        if (isStandardOnTop) {
            if (standardMessage) finalMessageLines.push(standardMessage);
            if (displayMessage) finalMessageLines.push(displayMessage);
        } else {
            if (displayMessage) finalMessageLines.push(displayMessage);
            if (standardMessage) finalMessageLines.push(standardMessage);
        }
        
        messageContent = finalMessageLines.join("<br>");
        messageStyle = `font-size: 14px; color: #FFFF00; font-weight: bold; line-height: 1.5;`; 
    }
    
    resultElement.style.border = '';
    resultElement.style.borderRadius = '';
    resultElement.style.padding = '';
    resultElement.style.backgroundColor = '';
    resultElement.innerHTML = `
        <span style="${messageStyle}">
            ${messageContent}
        </span>
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

  if (!hasError && !hasTime) {
    resultElement.innerText = "時刻と誤差を入力してください";
    return;
  }

  // 時間入力項目が一部不足している場合に親切なエラーを表示
  if (!hasTime && hasError) {
    const missing = [];
    const dateMissing = includeDateEnabledCorrection && !timeDateVal;
    if (dateMissing) missing.push("年月日");
    if (!timeTimeVal) missing.push("時分");
    if (timeSec === "" || timeSec === "ss" || timeSec === "--") missing.push("秒");
    
    const timeLabel = reverseMode === "toDisplay" ? "探している時刻" : "表示時刻";

    if (missing.length === (includeDateEnabledCorrection ? 3 : 2)) {
      resultElement.innerText = `${timeLabel}を入力してください`;
    } else if (dateMissing && missing.length === 1) {
      // 年月日だけが不足している場合 → 黄色の小さい文字で目立たせる
      resultElement.innerHTML = `<span style="color: #e6c300; font-size: 0.82em;">⚠ ${timeLabel}の年月日が不足</span>`;
    } else {
      resultElement.innerHTML = `<span style="color: #e6c300; font-size: 0.82em;">⚠ ${timeLabel}: ${missing.join(", ")}が不足</span>`;
    }
    return;
  }

  if (hasTime && !hasError) {
    resultElement.innerText = "補正に使う誤差を入力してください";
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
      const baseLabel = isToStandard ? "表示時刻" : "探している時刻";
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

        if (entry.includeDateCorrection === undefined || entry.includeDateCorrection) {
          textSpan.innerHTML = `
            <span style="font-size: 13px; color: var(--text-sub); display: block;">${baseStr} →</span>
            <span style="font-size: 14px; font-weight: bold; color: ${resultColor}; display: block; margin-top: 1px; padding-left: 8px;">${resultStr}</span>
          `;
        } else {
          textSpan.innerHTML = `
            <span style="font-size: 13px; color: var(--text-main); line-height: 1.45; display: block;">
              ${baseLabel}が <strong style="color: ${resultColor};">${baseStr}</strong> のとき<br>
              ${resultLabel}は <strong style="color: ${resultColor};">${resultStr}</strong> である
            </span>
          `;
        }
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
document.addEventListener("focusin", function(e) {
  if (activeTimePickerGroup) return; // ピッカー起動中はキーボード用自動スクロールとの二重競合をシャットアウト！
  if (e.target.tagName === "INPUT" && 
      e.target.type !== "checkbox" && 
      e.target.type !== "radio" && 
      e.target.type !== "button" && 
      e.target.type !== "date") {
    
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