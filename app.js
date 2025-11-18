// ===== وضع أوفلاين بدون سيرفر (لا Supabase ولا Firebase) =====
console.log("CIPHER Loaded (OFFLINE MODE)");

// نخزن كل الغرف اللي تم إنشاؤها في هذه الجلسة
const createdRooms = new Set();

// دوال سيرفر وهمية عشان ما توقف اللعبة
async function testSupabaseConnection() {
  console.log("Backend disabled: اللعبة تعمل أوفلاين فقط.");
}

async function createRoomInDb(code, hostName, startTeam) {
  console.log("createRoomInDb stub:", { code, hostName, startTeam });
  createdRooms.add(code);
  return true;
}

async function checkRoomExistsInDb(code) {
  console.log("checkRoomExistsInDb stub for code:", code);
  return createdRooms.has(code);
}

async function addPlayerToRoom(code, name, team, role) {
  console.log("addPlayerToRoom stub:", { code, name, team, role });
}

async function saveRoomStateToDb() {
  // لا شيء — أوفلاين
}

// ===== معلومات اللاعب =====
let playerName = "";
let playerTeam = null;   // "red" / "blue"
let playerRole = null;   // "spymaster" / "operative"

// معلومات الغرفة
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

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(1, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function updateTimerLabel() {
  const el = document.getElementById("timer-label");
  if (el) el.textContent = formatTime(timerRemaining);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

// تشغيل الصوتيات
function playSfx(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch (_) {}
}

// توليد كود غرفة
function generateRoomCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

function updateRoomInfoUI() {
  const info = document.getElementById("room-info");
  const codeSpan = document.getElementById("room-code-text");
  const roleSpan = document.getElementById("host-or-guest-label");

  if (!roomCode) {
    if (info) info.classList.add("hidden");
    return;
  }
  if (info) info.classList.remove("hidden");
  if (codeSpan) codeSpan.textContent = roomCode;
  if (roleSpan) roleSpan.textContent = isHost ? "هوست" : "لاعب";

  updateInGameRoomCodeUI();
}

// كود الغرفة داخل شاشة اللعب
function updateInGameRoomCodeUI() {
  const box  = document.getElementById("in-game-room-code");
  const text = document.getElementById("in-game-room-code-text");
  if (!box || !text) return;

  if (!roomCode) {
    box.classList.add("hidden");
  } else {
    text.textContent = roomCode;
    box.classList.remove("hidden");
  }
}

// تحكم الهوست
function updateHostControlsUI() {
  const startBtn    = document.getElementById("start-game-btn");
  const masterInput = document.getElementById("master-time-input");
  const opsInput    = document.getElementById("ops-time-input");

  if (startBtn) {
    if (isHost) startBtn.classList.remove("hidden");
    else        startBtn.classList.add("hidden");
  }

  if (masterInput) masterInput.disabled = !isHost;
  if (opsInput)    opsInput.disabled    = !isHost;
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

// معلومات الدور والمرحلة
function updateTurnUI() {
  const teamSpan  = document.getElementById("turn-team-label");
  const phaseSpan = document.getElementById("turn-phase-label");

  if (teamSpan) {
    if (currentTeamTurn === "red")      teamSpan.textContent = "الفريق الأحمر";
    else if (currentTeamTurn === "blue")teamSpan.textContent = "الفريق الأزرق";
    else                                teamSpan.textContent = "-";
  }

  if (phaseSpan) {
    if (phase === "clue")       phaseSpan.textContent = "إرسال تلميح";
    else if (phase === "guess") phaseSpan.textContent = "اختيار البطاقات";
    else                        phaseSpan.textContent = "-";
  }
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

    div.classList.remove(
      "spy-map-red",
      "spy-map-blue",
      "spy-map-neutral",
      "spy-map-assassin"
    );

    if (playerRole === "spymaster") {
      if (card.team === "red")      div.classList.add("spy-map-red");
      if (card.team === "blue")     div.classList.add("spy-map-blue");
      if (card.team === "neutral")  div.classList.add("spy-map-neutral");
      if (card.team === "assassin") div.classList.add("spy-map-assassin");
    }
  });
}

function handleTimerEnd() {
  if (phase === "clue") {
    const oldTeam = currentTeamTurn;

    if (!currentClueText || currentClueTeam !== currentTeamTurn) {
      currentTeamTurn = currentTeamTurn === "red" ? "blue" : "red";
      phase = "clue";
      currentClueText = "";
      currentClueTeam = null;
      clearAllSusMarkers();

      const teamName = oldTeam === "red" ? "الأحمر" : "الأزرق";
      const otherTeamName = oldTeam === "red" ? "الأزرق" : "الأحمر";

      const msg = `انتهى وقت التلميح للفريق ${teamName}، تم تمرير الدور للفريق ${otherTeamName}.`;
      logEvent(`⏰ ${msg}`);
      playSfx("sfx-turn-change");
      showClueToast(msg);

      updateTurnUI();
      updateClueUI();
      saveRoomStateToDb();
      startPhaseTimer("clue");
    } else {
      phase = "guess";
      clearAllSusMarkers();
      updateTurnUI();
      updateClueUI();
      saveRoomStateToDb();
      startPhaseTimer("guess");
    }
  } else if (phase === "guess") {
    const oldTeam = currentTeamTurn;
    currentTeamTurn = currentTeamTurn === "red" ? "blue" : "red";
    phase = "clue";
    currentClueText = "";
    currentClueTeam = null;
    clearAllSusMarkers();

    const teamName = oldTeam === "red" ? "الأحمر" : "الأزرق";
    const otherTeamName = oldTeam === "red" ? "الأزرق" : "الأحمر";

    const msg = `انتهى وقت اختيار البطاقات للفريق ${teamName}، تم تمرير الدور للفريق ${otherTeamName}.`;
    logEvent(`⏰ ${msg}`);
    playSfx("sfx-turn-change");
    showClueToast(msg);

    updateTurnUI();
    updateClueUI();
    saveRoomStateToDb();
    startPhaseTimer("clue");
  }
}

// ===== شاشة البداية: هوست / انضمام =====
window.addEventListener("DOMContentLoaded", () => {
  testSupabaseConnection();

  const nicknameInput = document.getElementById("nickname-input");
  const hostBtn       = document.getElementById("btn-host");
  const joinBtn       = document.getElementById("btn-join");
  const joinCodeInput = document.getElementById("join-code-input");
  const enterGameBtn  = document.getElementById("btn-enter-game");

  // إنشاء غرفة (هوست)
  if (hostBtn) {
    hostBtn.onclick = async () => {
      let name = nicknameInput.value.trim();
      if (!name) name = "لاعب مجهول";
      playerName = name;

      isHost   = true;
      roomCode = generateRoomCode();
      startingTeam = Math.random() < 0.5 ? "red" : "blue";

      const ok = await createRoomInDb(roomCode, playerName, startingTeam);
      if (!ok) {
        isHost   = false;
        roomCode = "";
        return;
      }

      await addPlayerToRoom(roomCode, playerName, "none", "none");

      const nameLabel = document.getElementById("player-name-label");
      if (nameLabel) nameLabel.textContent = playerName;

      updateRoomInfoUI();
      updateHostControlsUI();

      showSection("lobby-screen");
    };
  }

  // الانضمام إلى غرفة
  if (joinBtn) {
    joinBtn.onclick = async () => {
      let name = nicknameInput.value.trim();
      if (!name) name = "لاعب مجهول";
      playerName = name;

      const code = joinCodeInput.value.trim().toUpperCase();
      if (code.length !== 5) {
        showInfoOverlay("اكتب رمز غرفة مكوّن من 5 حروف إنجليزية.");
        return;
      }

      const exists = await checkRoomExistsInDb(code);
      if (!exists) {
        showInfoOverlay("هذه الغرفة غير موجودة. تأكد من الكود.");
        return;
      }

      isHost   = false;
      roomCode = code;

      await addPlayerToRoom(roomCode, playerName, "none", "none");

      const nameLabel = document.getElementById("player-name-label");
      if (nameLabel) nameLabel.textContent = playerName;

      updateRoomInfoUI();
      updateHostControlsUI();

      showSection("lobby-screen");
    };
  }

  // زر "دخول اللعبة (Spectator)" – ما يبدأ جولة، بس يفتح شاشة اللعب
  if (enterGameBtn) {
    enterGameBtn.onclick = () => {
      const box = document.querySelector(".box");
      if (box) box.classList.add("corner");

      updatePlayerInfoUI();
      updateInGameRoomCodeUI();
      showSection("game-area");
      updateHostControlsUI();
      refreshBoardForCurrentRole();
      updateClueUI();
    };
  }

  // زر موافق في رسالة المعلومات
  const infoOkBtn = document.getElementById("info-ok-btn");
  if (infoOkBtn) {
    infoOkBtn.onclick = () => {
      closeInfoOverlay();
    };
  }

  // تهيئة حوار الإدخال
  const dialogConfirmBtn = document.getElementById("dialog-confirm-btn");
  const dialogCancelBtn  = document.getElementById("dialog-cancel-btn");
  const dialogInput      = document.getElementById("dialog-input");
  const dialogOverlay    = document.getElementById("dialog-overlay");

  if (dialogConfirmBtn) {
    dialogConfirmBtn.onclick = () => {
      if (dialogConfirmHandler) dialogConfirmHandler();
    };
  }
  if (dialogCancelBtn && dialogOverlay) {
    dialogCancelBtn.onclick = () => {
      dialogOverlay.classList.add("hidden");
      dialogConfirmHandler = null;
    };
  }
  if (dialogInput) {
    dialogInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && dialogConfirmHandler) {
        e.preventDefault();
        dialogConfirmHandler();
      }
    });
  }

  // أزرار اختيار الأدوار في اللوبي
  const redSpyBtn    = document.getElementById("btn-red-spymaster");
  const redOpsBtn    = document.getElementById("btn-red-operative");
  const blueSpyBtn   = document.getElementById("btn-blue-spymaster");
  const blueOpsBtn   = document.getElementById("btn-blue-operative");
  const leaveRoleBtn = document.getElementById("btn-leave-role");

  if (redSpyBtn)   redSpyBtn.onclick   = () => chooseRole("red",  "spymaster");
  if (redOpsBtn)   redOpsBtn.onclick   = () => chooseRole("red",  "operative");
  if (blueSpyBtn)  blueSpyBtn.onclick  = () => chooseRole("blue", "spymaster");
  if (blueOpsBtn)  blueOpsBtn.onclick  = () => chooseRole("blue", "operative");
  if (leaveRoleBtn) leaveRoleBtn.onclick = () => changeToSpectatorInGame();

  // أزرار التحكم في الجولة
  const startGameBtn     = document.getElementById("start-game-btn");
  const endRoundBtn      = document.getElementById("end-round-btn");
  const resultToLobbyBtn = document.getElementById("result-to-lobby-btn");

  if (startGameBtn)     startGameBtn.onclick     = () => startGame();
  if (endRoundBtn)      endRoundBtn.onclick      = () => endRoundAndReturn();
  if (resultToLobbyBtn) resultToLobbyBtn.onclick = () => returnToLobbyFromResult();

  // أزرار أعلى الشاشة داخل الجولة
  const changeTeamBtn   = document.getElementById("btn-change-team");
  const changeNameBtn   = document.getElementById("btn-change-name");
  const toSpectatorBtn  = document.getElementById("btn-to-spectator");

  if (changeTeamBtn)   changeTeamBtn.onclick   = () => changeTeamInGame();
  if (changeNameBtn)   changeNameBtn.onclick   = () => changeNameInGame();
  if (toSpectatorBtn)  toSpectatorBtn.onclick  = () => changeToSpectatorInGame();

  // لاقط عام لزر "حسناً"
  document.addEventListener("click", (event) => {
    const el  = event.target;
    if (!el) return;
    const txt = el.textContent.trim();

    if (txt === "حسناً" || txt === "حسنا") {
      closeInfoOverlay();
      return;
    }
  });
});

// ===== تغيير الدور في اللوبي =====
function clearPreviousRoleUI() {
  if (!playerTeam || !playerRole) return;

  if (playerRole === "spymaster") {
    const span = document.getElementById(
      playerTeam === "blue" ? "blue-spymaster-name" : "red-spymaster-name"
    );
    if (span && span.textContent === playerName) span.textContent = "غير معيّن";
  } else {
    const list = document.getElementById(
      playerTeam === "blue" ? "blue-operatives-list" : "red-operatives-list"
    );
    if (list) {
      [...list.children].forEach(li => {
        if (li.textContent === playerName) list.removeChild(li);
      });
    }
  }
}

function leaveRole() {
  clearPreviousRoleUI();
  playerTeam = null;
  playerRole = null;

  const teamLabel = document.getElementById("player-team-label");
  const roleLabel = document.getElementById("player-role-label");
  if (teamLabel) teamLabel.textContent = "غير محدد";
  if (roleLabel) roleLabel.textContent = "غير محدد";

  const startBtn = document.getElementById("start-game-btn");
  if (isHost && startBtn) startBtn.disabled = true;

  updatePlayerInfoUI();
  updateClueUI();
  refreshBoardForCurrentRole();
}

function chooseRole(team, role) {
  // لو Clue للفريق هذا وعليه اسم غير اسمي -> ما نسمح
  if (role === "spymaster") {
    const id = team === "blue" ? "blue-spymaster-name" : "red-spymaster-name";
    const span = document.getElementById(id);
    if (span && span.textContent !== "غير معيّن" && span.textContent !== playerName) {
      showInfoOverlay("يوجد Clue Cipher لهذا الفريق بالفعل.");
      return;
    }
  }

  clearPreviousRoleUI();

  playerTeam = team;
  playerRole = role;

  const teamLabel = document.getElementById("player-team-label");
  const roleLabel = document.getElementById("player-role-label");

  if (teamLabel) teamLabel.textContent =
    team === "blue" ? "الأزرق" : "الأحمر";

  if (roleLabel) roleLabel.textContent =
    role === "spymaster" ? "Clue Cipher" : "Seekers Cipher";

  if (role === "spymaster") {
    const id = team === "blue" ? "blue-spymaster-name" : "red-spymaster-name";
    const span = document.getElementById(id);
    if (span) span.textContent = playerName;
  } else {
    const id = team === "blue" ? "blue-operatives-list" : "red-operatives-list";
    const list = document.getElementById(id);
    if (list) {
      const li = document.createElement("li");
      li.textContent = playerName;
      list.appendChild(li);
    }
  }

  const startBtn = document.getElementById("start-game-btn");
  if (isHost && startBtn) startBtn.disabled = false;

  updatePlayerInfoUI();
  updateClueUI();
  refreshBoardForCurrentRole();
}

// ===== تغيير الفريق أثناء الجولة =====
function changeTeamInGame() {
  // Spectator: يقدر يختار أي رول
  if (!playerRole) {
    const msg =
      "اختر الرقم:\n" +
      "1 - Seekers الفريق الأحمر\n" +
      "2 - Seekers الفريق الأزرق\n" +
      "3 - Clue Cipher الفريق الأحمر (إذا كان متاحًا)\n" +
      "4 - Clue Cipher الفريق الأزرق (إذا كان متاحًا)";
    showInputDialog(msg, "", "اكتب رقم 1 أو 2 أو 3 أو 4", (val) => {
      const choice = (val || "").trim();
      if (!choice) return;

      if (choice === "1") {
        chooseRole("red", "operative");
      } else if (choice === "2") {
        chooseRole("blue", "operative");
      } else if (choice === "3") {
        chooseRole("red", "spymaster");
      } else if (choice === "4") {
        chooseRole("blue", "spymaster");
      } else {
        showInfoOverlay("اختيار غير صحيح.");
        return;
      }
    });
    return;
  }

  // Seekers: يبدل بين الأحمر والأزرق فقط
  if (playerRole === "operative") {
    const msg =
      "اختر الرقم:\n" +
      "1 - الانتقال إلى Seekers الفريق الأحمر\n" +
      "2 - الانتقال إلى Seekers الفريق الأزرق";
    showInputDialog(msg, "", "1 أو 2", (val) => {
      const choice = (val || "").trim();
      if (!choice) return;

      if (choice === "1") {
        chooseRole("red", "operative");
      } else if (choice === "2") {
        chooseRole("blue", "operative");
      } else {
        showInfoOverlay("اختيار غير صحيح.");
        return;
      }
    });
    return;
  }

  // Clue Cipher: يقدر يتنقل للفريق الآخر لو فاضي
  if (playerRole === "spymaster") {
    const otherTeam = playerTeam === "red" ? "blue" : "red";
    const otherSpan = document.getElementById(
      otherTeam === "blue" ? "blue-spymaster-name" : "red-spymaster-name"
    );
    const occupied =
      otherSpan && otherSpan.textContent !== "غير معيّن" && otherSpan.textContent !== playerName;

    if (occupied) {
      showInfoOverlay("لا يمكن تغيير الفريق: يوجد Clue Cipher للفريق الآخر بالفعل.");
      return;
    }

    const msg =
      "اختر الرقم:\n" +
      `1 - البقاء في الفريق الحالي (${playerTeam === "red" ? "الأحمر" : "الأزرق"})\n` +
      `2 - الانتقال إلى Clue Cipher للفريق ${otherTeam === "red" ? "الأحمر" : "الأزرق"}`;
    showInputDialog(msg, "2", "1 أو 2", (val) => {
      const choice = (val || "").trim();
      if (choice === "2") {
        chooseRole(otherTeam, "spymaster");
      }
    });
  }
}

// ===== تغيير الاسم أثناء الجولة =====
function changeNameInGame() {
  const oldName = playerName || "لاعب مجهول";
  showInputDialog("اكتب الاسم الجديد:", oldName, "", (raw) => {
    if (raw === null || raw === undefined) return;
    const newName = raw.trim() || "لاعب مجهول";
    playerName = newName;

    const label = document.getElementById("player-name-label");
    if (label) label.textContent = playerName;

    updatePlayerInfoUI();

    if (playerRole === "spymaster" && playerTeam) {
      const id = playerTeam === "blue" ? "blue-spymaster-name" : "red-spymaster-name";
      const span = document.getElementById(id);
      if (span) span.textContent = playerName;
    } else if (playerRole === "operative" && playerTeam) {
      const listId = playerTeam === "blue" ? "blue-operatives-list" : "red-operatives-list";
      const list = document.getElementById(listId);
      if (list && list.children.length > 0) {
        list.children[0].textContent = playerName;
      }
    }
  });
}

// تحويل أي رول إلى Spectator
function changeToSpectatorInGame() {
  leaveRole();
  showClueToast("تم تحويلك إلى Spectator.");
}

// ===== بدء اللعبة =====
function startGame() {
  if (!isHost) {
    showInfoOverlay("فقط الهوست يقدر يبدأ اللعبة.");
    return;
  }

  if (!playerTeam || !playerRole) {
    showInfoOverlay("انضم أولاً لأحد الأدوار في أحد الفريقين قبل بدء اللعبة.");
    return;
  }

  refreshTimeLimitsFromInputs();

  const box = document.querySelector(".box");
  if (box) box.classList.add("corner");

  updatePlayerInfoUI();
  updateInGameRoomCodeUI();

  showSection("game-area");
  updateHostControlsUI();

  startNewRoundFlow();
}

// جولة جديدة
function startNewRoundFlow() {
  refreshTimeLimitsFromInputs();

  const overlay = document.getElementById("result-overlay");
  if (overlay) overlay.classList.add("hidden");

  const logContainer = document.getElementById("log-entries");
  if (logContainer) logContainer.innerHTML = "";

  setupBoard();

  currentTeamTurn = startingTeam || "red";
  phase           = "clue";
  currentClueText = "";
  currentClueTeam = null;

  logEvent(`🚩 بدء جولة جديدة. الفريق الذي يبدأ: ${currentTeamTurn === "red" ? "الأحمر" : "الأزرق"}.`);
  playSfx("sfx-round-start");

  updateTurnUI();
  updateClueUI();
  saveRoomStateToDb();
  startPhaseTimer("clue");
}

// إنهاء الجولة
function endRoundAndReturn() {
  if (!isHost) {
    showInfoOverlay("فقط الهوست يقدر إنهاء الجولة والرجوع إلى اللوبي.");
    return;
  }

  stopTimer();

  const resultOverlay = document.getElementById("result-overlay");
  if (resultOverlay) resultOverlay.classList.add("hidden");

  showSection("lobby-screen");

  const box = document.querySelector(".box");
  if (box) box.classList.remove("corner");

  updateHostControlsUI();
}

// كلمات عشوائية
function pick25Words() {
  return [...ALL_WORDS].sort(() => Math.random() - 0.5).slice(0, 25);
}

// توزيع الألوان
function generateTeamLayout() {
  const first  = Math.random() < 0.5 ? "red" : "blue";
  const second = first === "red" ? "blue" : "red";

  const arr = [
    ...Array(9).fill(first),
    ...Array(8).fill(second),
    ...Array(7).fill("neutral"),
    "assassin"
  ];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return { layout: arr, firstTeam: first };
}

// تجهيز البورد
function setupBoard() {
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

  // بعد ما نبني البورد، نطبّق رؤية السباي ماستر لو موجود
  refreshBoardForCurrentRole();
}

// sus marker
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

// إرسال التلميح
function sendClue() {
  if (!(playerRole === "spymaster" &&
        playerTeam === currentTeamTurn &&
        phase === "clue")) {
    showInfoOverlay("فقط Clue Cipher للفريق الحالي يقدر يرسل التلميح في مرحلته.");
    return;
  }

  const wordInput  = document.getElementById("clue-word-input");
  const countInput = document.getElementById("clue-count-input");

  let word  = wordInput ? wordInput.value.trim() : "";
  let count = parseInt(countInput ? countInput.value : "1", 10);

  if (!word) {
    showInfoOverlay("اكتب كلمة التلميح أولاً.");
    return;
  }

  if (isNaN(count) || count < 1) count = 1;
  if (count > 9) count = 9;
  if (countInput) countInput.value = count;

  currentClueText = `${word} (${count})`;
  currentClueTeam = currentTeamTurn;

  const teamLabel = currentTeamTurn === "red" ? "الأحمر" : "الأزرق";
  logEvent(`🕵️‍♂️ [${teamLabel}] ${playerName} (Clue Cipher): "${currentClueText}"`);

  if (wordInput) wordInput.value = "";

  updateClueUI();
  playSfx("sfx-clue");
  showClueToast(`تلميح: ${currentClueText} — للفريق ${teamLabel}`);

  phase = "guess";
  clearAllSusMarkers();
  updateTurnUI();
  saveRoomStateToDb();
  startPhaseTimer("guess");
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

  const teamLabelOp = playerTeam === "red" ? "الأحمر" : "الأزرق";

  if (card.team === "red") {
    el.classList.add("revealed-red");
    remainingRed--;
    const correct = (currentTeamTurn === "red");
    logEvent(`🎯 [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة حمراء).`);
    playSfx(correct ? "sfx-card-correct" : "sfx-card-wrong");
    checkWin();
  } else if (card.team === "blue") {
    el.classList.add("revealed-blue");
    remainingBlue--;
    const correct = (currentTeamTurn === "blue");
    logEvent(`🎯 [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة زرقاء).`);
    playSfx(correct ? "sfx-card-correct" : "sfx-card-wrong");
    checkWin();
  } else if (card.team === "neutral") {
    el.classList.add("revealed-neutral");
    logEvent(`🎯 [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة حيادية).`);
    playSfx("sfx-card-wrong");
  } else if (card.team === "assassin") {
    el.classList.add("revealed-assassin");
    logEvent(`☠ [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة قاتل!).`);
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
