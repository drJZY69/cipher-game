// ========= CIPHER GAME (دعم الرول الجديد + ضبط رؤية البطاقات) =========

let playerRole = null;   // "spymaster" / "operative"
let playerTeam = null;   // "red" / "blue"
let playerName = "";
let isHost = false;
let roomCode = "";

// حالة البورد
let boardState = [];
let remainingRed = 0;
let remainingBlue = 0;

// نظام الدور والمرحلة
let startingTeam = null;
let currentTeamTurn = null;      // "red" / "blue"
let phase = "clue";              // "clue" / "guess"

// التلميح
let currentClueText = "";
let currentClueTeam = null;      // "red" / "blue"

// التايمر
let masterTimeLimit = 60;
let opsTimeLimit = 90;
let timerId = null;
let timerRemaining = 0;

// حوار عام
let dialogConfirmHandler = null;

// ===== أدوات واجهة عامة =====
function showSection(id) {
  document.querySelectorAll(".section").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// معلومات اللاعب في شاشة اللعبة
function updatePlayerInfoUI() {
  const nameInfo = document.getElementById("player-name-info");
  const teamInfo = document.getElementById("player-team-info");
  const roleInfo = document.getElementById("player-role-info");

  if (nameInfo) nameInfo.textContent = playerName || "لاعب";

  let teamLabel = "غير محدد";
  if (playerTeam === "red")  teamLabel = "الأحمر";
  if (playerTeam === "blue") teamLabel = "الأزرق";
  if (teamInfo) teamInfo.textContent = teamLabel;

  let roleLabel = "غير محدد";
  if (playerRole === "spymaster") roleLabel = "Clue Cipher";
  if (playerRole === "operative") roleLabel = "Seekers Cipher";
  if (roleInfo) roleInfo.textContent = roleLabel;
}

// واجهة التلميح
function updateClueUI() {
  const form         = document.getElementById("clue-form");
  const clueTextSpan = document.getElementById("clue-text");
  const clueTeamSpan = document.getElementById("clue-team");

  const canGiveClue =
    playerRole === "spymaster" &&
    playerTeam === currentTeamTurn &&
    phase === "clue";

  if (form) {
    if (canGiveClue) form.classList.remove("hidden");
    else             form.classList.add("hidden");
  }

  if (clueTextSpan) clueTextSpan.textContent = currentClueText || "لا يوجد تلميح بعد";

  if (clueTeamSpan) {
    if (currentClueTeam === "red")      clueTeamSpan.textContent = "الفريق الأحمر";
    else if (currentClueTeam === "blue")clueTeamSpan.textContent = "الفريق الأزرق";
    else                                clueTeamSpan.textContent = "-";
  }
}

// توست
function showClueToast(text) {
  const toast = document.getElementById("clue-toast");
  if (!toast) return;

  toast.textContent = text;
  toast.classList.remove("hidden");
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 250);
  }, 1800);
}

// اللوق
function logEvent(message) {
  const logContainer = document.getElementById("log-entries");
  if (!logContainer) return;
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = message;
  logContainer.appendChild(div);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Overlay للرسائل
function showInfoOverlay(message) {
  const overlay = document.getElementById("info-overlay");
  const text    = document.getElementById("info-text");
  if (!overlay || !text) return;
  text.textContent = message;
  overlay.classList.remove("hidden");
}

function closeInfoOverlay() {
  const overlay = document.getElementById("info-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
}

// حوار إدخال بنفس ستايل CIPHER
function showInputDialog(message, defaultValue, placeholder, onConfirm) {
  const overlay   = document.getElementById("dialog-overlay");
  const textEl    = document.getElementById("dialog-text");
  const inputEl   = document.getElementById("dialog-input");

  if (!overlay || !textEl || !inputEl) {
    const v = prompt(message, defaultValue || "");
    if (v === null) return;
    onConfirm(v);
    return;
  }

  textEl.innerHTML = message.replace(/\n/g, "<br>");
  inputEl.value = defaultValue || "";
  inputEl.placeholder = placeholder || "";
  overlay.classList.remove("hidden");
  inputEl.focus();

  dialogConfirmHandler = () => {
    const val = inputEl.value;
    overlay.classList.add("hidden");
    dialogConfirmHandler = null;
    onConfirm(val);
  };
}

// عدّ تنازلي بصري
function showCountdown(n) {
  const overlay = document.getElementById("countdown-overlay");
  const numEl   = document.getElementById("countdown-number");
  if (!overlay || !numEl) return;
  numEl.textContent = n;
  overlay.classList.remove("hidden");
}

function hideCountdown() {
  const overlay = document.getElementById("countdown-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
}

// هل يقدر يلمس الكروت الآن؟
function canInteractWithCards(showMessage) {
  // فقط Seekers Cipher (operative) يمكنه التفاعل
  if (playerRole !== "operative") {
    if (showMessage) showInfoOverlay("فقط Seekers Cipher يقدرون يتعاملون مع البطاقات.");
    return false;
  }
  if (playerTeam !== currentTeamTurn) {
    if (showMessage) showInfoOverlay("ليس دور فريقك الآن.");
    return false;
  }
  if (phase !== "guess") {
    if (showMessage) showInfoOverlay("لا يمكن اختيار البطاقات قبل أن يرسل Clue Cipher تلميحاً.");
    return false;
  }
  return true;
}

// تحديث قيم التايمر من المدخلات
function refreshTimeLimitsFromInputs() {
  const masterInput = document.getElementById("master-time-input");
  const opsInput    = document.getElementById("ops-time-input");

  if (masterInput) {
    let v = parseInt(masterInput.value, 10);
    if (!isNaN(v) && v >= 10 && v <= 600) masterTimeLimit = v;
  }

  if (opsInput) {
    let v = parseInt(opsInput.value, 10);
    if (!isNaN(v) && v >= 10 && v <= 600) opsTimeLimit = v;
  }
}

// ===== التايمر =====
function startPhaseTimer(phaseType) {
  stopTimer();
  hideCountdown();

  timerRemaining = (phaseType === "clue") ? masterTimeLimit : opsTimeLimit;
  updateTimerLabel();

  timerId = setInterval(() => {
    timerRemaining--;
    updateTimerLabel();

    if (timerRemaining > 0 && timerRemaining <= 10) {
      showCountdown(timerRemaining);
      playSfx("sfx-tick");
    }

    if (timerRemaining <= 0) {
      stopTimer();
      hideCountdown();
      handleTimerEnd();
    }
  }, 1000);
}

function clearAllSusMarkers() {
  boardState.forEach((card, i) => {
    card.sus = false;
    const el = document.querySelector(`.card[data-index="${i}"] .sus-marker`);
    if (el) el.classList.add("hidden");
  });
}

// تحديث البورد بناءً على الرول (Spy / Spectator / Seekers)
function refreshBoardForCurrentRole() {
  if (!boardState || boardState.length === 0) return;
  boardState.forEach((card, i) => {
    const div = document.querySelector(`.card[data-index="${i}"]`);
    if (!div) return;

    // إزالة كل الألوان
    div.classList.remove(
      "spy-map-red", "spy-map-blue", "spy-map-neutral", "spy-map-assassin",
      "revealed-red", "revealed-blue", "revealed-neutral", "revealed-assassin"
    );

    // Clue Cipher "spymaster" يرى الخريطة الكاملة للألوان
    if (playerRole === "spymaster") {
      if (card.team === "red")      div.classList.add("spy-map-red");
      if (card.team === "blue")     div.classList.add("spy-map-blue");
      if (card.team === "neutral")  div.classList.add("spy-map-neutral");
      if (card.team === "assassin") div.classList.add("spy-map-assassin");
      // إذا كانت البطاقة مكشوفة تعرض لون الكشف
      if (card.revealed) {
        div.classList.remove("spy-map-red", "spy-map-blue", "spy-map-neutral", "spy-map-assassin");
        if (card.team === "red")      div.classList.add("revealed-red");
        if (card.team === "blue")     div.classList.add("revealed-blue");
        if (card.team === "neutral")  div.classList.add("revealed-neutral");
        if (card.team === "assassin") div.classList.add("revealed-assassin");
      }
      return;
    }

    // Seekers (operative): مشاهده فقط للكلمات، لا يعرض خريطة الألوان إلا عند كشف البطاقة
    if (playerRole === "operative") {
      if (card.revealed) {
        if (card.team === "red")      div.classList.add("revealed-red");
        if (card.team === "blue")     div.classList.add("revealed-blue");
        if (card.team === "neutral")  div.classList.add("revealed-neutral");
        if (card.team === "assassin") div.classList.add("revealed-assassin");
      }
      // وإلا لا يضاف أي لون للخلفية (عرض نص فقط)
      return;
    }

    // Spectator: عرض نص البطاقة فقط ولا يعرض ألوان حتى وإن كانت مكشوفة
    // اترك div بلا أي لون، نص فقط
  });
}

// ===== بناء البورد =====
function buildBoard() {
  const board = document.getElementById("board");
  if (!board) return;

  board.innerHTML = "";

  const words = pick25Words();
  const { layout, firstTeam } = generateTeamLayout();
  startingTeam = firstTeam;

  boardState = words.map((w, i) => ({
    word: w,
    team: layout[i],
    revealed: false,
    sus: false
  }));

  remainingRed  = layout.filter(x => x === "red").length;
  remainingBlue = layout.filter(x => x === "blue").length;

  boardState.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.index = i;

    div.innerHTML = `
      <span class="sus-marker hidden">✋</span>
      <span class="card-word">${card.word}</span>
    `;

    div.onclick = () => handleCardClick(i);
    div.ondblclick = (e) => {
      e.preventDefault();
      handleCardDoubleClick(i);
    };

    board.appendChild(div);
  });

  // بعد ما نبني البورد، طبّق رؤية اللاعب/الدور
  refreshBoardForCurrentRole();
}


// عارض sus marker
function updateSusMarker(index) {
  const card = boardState[index];
  const susEl = document.querySelector(`.card[data-index="${index}"] .sus-marker`);
  if (!susEl) return;
  if (card.sus && !card.revealed) susEl.classList.remove("hidden");
  else                            susEl.classList.add("hidden");
}

function handleCardClick(index) {
  if (!canInteractWithCards(true)) return;

  const card = boardState[index];
  if (!card || card.revealed) return;

  card.sus = !card.sus;
  updateSusMarker(index);
}

// دبل كلك = كشف البطاقة
function handleCardDoubleClick(index) {
  if (!canInteractWithCards(true)) return;
  revealCard(index);
}

// كشف بطاقة
function revealCard(i) {
  const card = boardState[i];
  if (!card || card.revealed) return;

  card.revealed = true;
  card.sus      = false;
  updateSusMarker(i);

  const el = document.querySelector(`.card[data-index="${i}"]`);
  if (!el) return;
  el.className = "card";

  // إضافة لون الكشف المناسب
  if (card.team === "red") {
    el.classList.add("revealed-red");
    remainingRed--;
    playSfx(currentTeamTurn === "red" ? "sfx-card-correct" : "sfx-card-wrong");
    checkWin();
  } else if (card.team === "blue") {
    el.classList.add("revealed-blue");
    remainingBlue--;
    playSfx(currentTeamTurn === "blue" ? "sfx-card-correct" : "sfx-card-wrong");
    checkWin();
  } else if (card.team === "neutral") {
    el.classList.add("revealed-neutral");
    playSfx("sfx-card-wrong");
  } else if (card.team === "assassin") {
    el.classList.add("revealed-assassin");
    playSfx("sfx-assassin");
    showResult("assassin");
  }

  saveRoomStateToDb();
}

// فحص الفوز
function checkWin() {
  if (remainingRed === 0)  showResult("red");
  if (remainingBlue === 0) showResult("blue");
}

// شاشة النتيجة
function showResult(type) {
  stopTimer();
  hideCountdown();

  const overlay = document.getElementById("result-overlay");
  const text    = document.getElementById("result-text");
  if (!overlay || !text) return;

  overlay.classList.remove("hidden");

  if (type === "red") {
    overlay.style.background = "rgba(255,0,0,0.35)";
    text.textContent = "🔥 مبروك! الفريق الأحمر فاز!";
    if (playerTeam === "red") playSfx("sfx-win");
    else                      playSfx("sfx-lose");
  } else if (type === "blue") {
    overlay.style.background = "rgba(0,0,255,0.35)";
    text.textContent = "🔥 مبروك! الفريق الأزرق فاز!";
    if (playerTeam === "blue") playSfx("sfx-win");
    else                       playSfx("sfx-lose");
  } else {
    overlay.style.background = "rgba(0,0,0,0.8)";
    text.textContent = "☠ خسارة! تم اختيار بطاقة القاتل!";
    if (playerTeam === currentTeamTurn) playSfx("sfx-lose");
    else                                playSfx("sfx-win");
  }
}

// رجوع للوبي بعد النتيجة
function returnToLobbyFromResult() {
  stopTimer();
  hideCountdown();
  const overlay = document.getElementById("result-overlay");
  if (overlay) overlay.classList.add("hidden");

  showSection("lobby-screen");
  const box = document.querySelector(".box");
  if (box) box.classList.remove("corner");

  updateHostControlsUI();
}

// أي تحديث لدور أو فريق: يجب دوماً تحديث المعلومات والبورد
function onRoleOrTeamChanged() {
  updatePlayerInfoUI();
  refreshBoardForCurrentRole();
}

// =========== مثال: عند تغيير الدور استدعي:
function setPlayerRoleAndTeam(role, team) {
  playerRole = role;
  playerTeam = team;
  onRoleOrTeamChanged();
}

// =========== مثال: عند الانضمام لرول
// setPlayerRoleAndTeam("operative", "red");  // أو "spymaster", "blue", etc...


// =============== باقي الدوال (مثال فقط!):
function playSfx(name) {/* ... */}              // تشغيل مؤثر صوتي حسب الحدث
function saveRoomStateToDb() {/* ... */}        // تخزين حالة الغرفة في db إذا عندك multiplayer
function stopTimer() {/* ... */}
function updateTimerLabel() {/* ... */}
function handleTimerEnd() {/* ... */}
function updateHostControlsUI() {/* ... */}
function pick25Words() {/* ... */}              // انتبه لربط كلمات اللعبة المعتادة
function generateTeamLayout() {/* ... */}

// =============== انتهى ===============

// ملاحظة: 
// لو لديك أي جزئية Socket أو مربوطة بظهور اللاعبين أو تنفيذ الأدوار، استدعي فيها onRoleOrTeamChanged() بعد تحديث دور اللاعب.
// الكود السابق هو لأهم منطق اللعبة (واجهة البطاقات والرؤية والتفاعل مع كل دور)، معدّل كما طلبت بالضبط.
// بقية الأجزاء (مثل بعض الواجهات والباك اند) لا تتأثر إذا استخدمت نفس طريقة مناداة "onRoleOrTeamChanged" بعد أي تغيير بالدور أو الفريق.
