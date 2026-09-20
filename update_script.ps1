$s = [System.IO.File]::ReadAllText("$PWD\script.js", [System.Text.Encoding]::UTF8)

# 1. getDestId: correctionModeの右スワイプ先をerrorModeに変更
$s = $s -replace "if \(srcId === 'correctionMode'\) return 'modeSelect'; // [^\r\n]*", "if (srcId === 'correctionMode') return 'errorMode';"

# 2. afterSwipe: destId === 'resultListPage' の時にテンキー・ドラムロールを非表示にする
$newAfterSwipe = @"
if (destId === 'resultListPage') {
      if (typeof RegulusKeypad !== 'undefined' && RegulusKeypad.isOpen) {
        RegulusKeypad.close();
      }
      if (typeof closeTimePicker === 'function') {
        closeTimePicker();
      }
      document.body.classList.remove('picker-open-padding');
      document.body.classList.remove('scroll-locked');
      window.scrollTo({ top: 0, left: 0 });
      if (typeof renderResultList === 'function') renderResultList();
    }
"@

$s = $s -replace '(?s)if \(destId === ''resultListPage''\) \{\s*if \(typeof renderResultList === ''function''\) renderResultList\(\);\s*\}', $newAfterSwipe

# 3. showResultList: ボタン等での遷移時にもテンキー・ドラムロールを非表示にする
$newShowResultList = @"
function showResultList() {
  if (typeof RegulusKeypad !== 'undefined' && RegulusKeypad.isOpen) {
    RegulusKeypad.close();
  }
  if (typeof closeTimePicker === 'function') {
    closeTimePicker();
  }
  document.body.classList.remove('picker-open-padding');
  document.body.classList.remove('scroll-locked');
  window.scrollTo({ top: 0, left: 0 });

  if (window.slideTransition && document.getElementById("correctionMode").style.display !== "none") {
"@

$s = $s -replace 'function showResultList\(\) \{\s*if \(window\.slideTransition', $newShowResultList

[System.IO.File]::WriteAllText("$PWD\script.js", $s, [System.Text.Encoding]::UTF8)
"script.js updated successfully"
