const currentVersion = "3.0.1";

// ロック画面が完全ロードされたら、メイン機能をバックグラウンドで読み込む
function preloadMainScript() {
  const script = document.createElement('script');
  script.src = './script-main.js?v=3.0.1';
  script.defer = true;
  script.onload = () => {
    console.log('✓ Main script preloaded in background');
    window.mainScriptLoaded = true;
  };
  script.onerror = () => {
    console.warn('⚠ Main script preload failed (will load on demand)');
  };
  document.head.appendChild(script);
}

// ロック画面用Google Analytics（起動イベント）
function initGoogleAnalytics() {
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-R7PW7DY4GF');
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
    
    gtag('event', 'unlock_success');
    
    // メイン機能の読み込みが完了していなければ、ここで読み込む
    if (!window.mainScriptLoaded) {
      loadMainScript();
    } else {
      // 既にロード済みなら initMainApp() を呼び出す
      if (typeof initMainApp === 'function') {
        initMainApp();
      }
    }
  } else {
    errorMessage.innerText = "暗証番号が違います";
    inputField.style.border = "2px solid red";
    inputField.value = "";
    inputField.focus();
    generateKeypad();
  }
}

function loadMainScript() {
  console.log('Loading main script...');
  const script = document.createElement('script');
  script.src = './script-main.js?v=3.0.1';
  script.onload = () => {
    window.mainScriptLoaded = true;
    console.log('✓ Main script loaded');
    if (typeof initMainApp === 'function') {
      initMainApp();
    }
  };
  script.onerror = () => {
    console.error('✗ Failed to load main script');
  };
  document.body.appendChild(script);
}

function restartLockScreenAnimation() {
  const title = document.querySelector("#lockScreen h1.fkz");
  const subtitle = document.querySelector("#lockScreen .subtitle");
  const labels = document.querySelectorAll("#lockScreen label, #lockScreen input, #lockScreen button.action-btn, #lockScreen p:not(.fkz)");
  
  if (title) title.classList.remove("anim-title-rise");
  if (subtitle) subtitle.classList.remove("anim-slow-fade");
  labels.forEach(el => el.classList.remove("anim-slow-fade"));
  
  generateKeypad();
  
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

    const randomDelay = Math.random() * 250;
    setTimeout(() => {
      btn.classList.add("sparkle-btn-anim");
      
      const changeInterval = setInterval(() => {
        btn.innerText = Math.floor(Math.random() * 9) + 1;
      }, 60);

      setTimeout(() => {
        clearInterval(changeInterval);
        btn.innerText = num;
        btn.classList.remove("sparkle-btn-anim");
      }, 500);
    }, randomDelay);
  });
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
        navigator.serviceWorker.register('./service-worker.js?v=3.0.1')
            .then(reg => {
                console.log('✓ Service Worker registered:', reg.scope);

                reg.addEventListener('updatefound', () => {
                    newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New content available');
                            if (updateNotification) {
                              updateNotification.style.display = 'block';
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.log('✗ Service Worker registration failed:', error);
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

// DOMContentLoaded イベントのロック画面初期化処理
document.addEventListener("DOMContentLoaded", function () {
  initGoogleAnalytics();

  // バージョン確認ポップアップ
  if (localStorage.getItem("lastVersion") !== currentVersion) {
    alert("Time RegulusはV3.0.1です！");
    localStorage.setItem("lastVersion", currentVersion);
  }

  // パスコード入力イベント
  const passInput = document.getElementById("passcode");
  if (passInput) {
    passInput.focus();
    passInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        checkPass();
      }
    });
  }

  restartLockScreenAnimation();
  
  // メイン機能をバックグラウンドで事前読み込み（認証待機中に準備する）
  preloadMainScript();
});
