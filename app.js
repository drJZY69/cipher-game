console.log("CIPHER Loaded");

// ===== إعداد Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyB2OQo-eP3L_CzUbYjzqP7AaM1i8-_kXNs",
  authDomain: "cipher-game-9607e.firebaseapp.com",
  databaseURL: "https://cipher-game-9607e-default-rtdb.firebaseio.com",
  projectId: "cipher-game-9607e",
  storageBucket: "cipher-game-9607e.firebasestorage.app",
  messagingSenderId: "833688921550",
  appId: "1:833688921550:web:9e265dfc1cc5bcde58779f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ROOMS_COLLECTION = "rooms";
let roomUnsubscribe = null;

// هوية اللاعب (ثابتة حتى لو غيّر الاسم)
let playerId = null;

// معلومات اللاعب
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
let currentTeamTurn = null;     
let phase = "clue";         

// التلميح
let currentClueText = "";
let currentClueTeam = null;  
let currentClueCount = 0;   

// التايمر
let masterTimeLimit = 60;
let opsTimeLimit = 90;
let timerId = null;
let timerRemaining = 0;

// حالة اللعبة
let gameStarted = false;
let lastLoggedClueText = "";

// اللوق
let logEntries = [];

// ===== توليد / قراءة playerId =====
function initPlayerId() {
  try {
    const stored = localStorage.getItem("cipher_player_id");
    if (stored) {
      playerId = stored;
      return;
    }
    const newId =
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      ("pid-" + Math.random().toString(36).slice(2));
    localStorage.setItem("cipher_player_id", newId);
    playerId = newId;
  } catch (e) {
    playerId = "pid-" + Math.random().toString(36).slice(2);
  }
}

// ===== تعديل الرابط =====
function updateUrlWithRoomCode(code) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("room", code);
    else url.searchParams.delete("room");
    window.history.pushState({ roomCode: code }, "", url.toString());
  } catch {}
}

function getRoomCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("room");
    return q ? q.toUpperCase() : null;
  } catch {
    return null;
  }
}

// === الكلمات ===
const ALL_WORDS = [
  "مكة","المدينة","الرياض","جدة","الدمام","القاهرة","دمشق","بيروت","بغداد","الدوحة",
  "الكويت","مسقط","المغرب","تونس","الجزائر","ليبيا","فلسطين","الأردن","السودان","تركيا",
  "أوروبا","آسيا","أفريقيا","أمريكا","اليابان","الصين","الهند","روسيا","البحر","الصحراء",
  "المحيط","النهر","الجبل","الغابة","العاصفة","البرق","الرعد","القمر","الشمس","النجوم",
  "سفينة","طائرة","قطار","سيارة","دراجة","مطار","ميناء","ملعب","جامعة","مدرسة",
  "مسجد","كنيسة","متحف","قصر","برج","فندق","مطعم","مقهى","سوق","مسرح",
  "قلعة","قرية","مدينة","جزيرة","كوكب","صاروخ","قلم","كتاب","هاتف","كمبيوتر",
  "لوحة","خريطة","صندوق","مفتاح","سيف","درع","كرة","بطل","ملك","أميرة",
  "صديق","عدو","جاسوس","سر","خطر","سلام","هجوم","دفاع","فخ","لغز",
  "ضحك","حزن","خوف","شجاعة","حقيقة","خيانة","أمل","يأس","نور","ظلام"
];

// === واجهات عامة ===
function showSection(id) {
  document.querySelectorAll(".section").forEach(sec => sec.classList.add("hidden"));
  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");
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
  const codeSpanLobby = document.getElementById("room-code-text-lobby");
  const roleSpan = document.getElementById("host-or-guest-label");

  if (!roomCode) {
    info?.classList.add("hidden");
    return;
  }

  info?.classList.remove("hidden");

  if (codeSpan) codeSpan.textContent = roomCode;
  if (codeSpanLobby) codeSpanLobby.textContent = roomCode;
  if (roleSpan) roleSpan.textContent = isHost ? "هوست" : "لاعب";
}

// تحكم الهوست في الأزرار + الوقت
function updateHostControlsUI() {
  const startBtn = document.getElementById("start-game-btn");
  const newRoundBtn = document.getElementById("new-round-btn");
  const masterInput = document.getElementById("master-time-input");
  const opsInput = document.getElementById("ops-time-input");

  if (startBtn) {
    if (isHost) startBtn.classList.remove("hidden");
    else startBtn.classList.add("hidden");
  }

  if (newRoundBtn) {
    if (isHost) newRoundBtn.classList.remove("hidden");
    else newRoundBtn.classList.add("hidden");
  }

  if (masterInput) masterInput.disabled = !isHost;
  if (opsInput) opsInput.disabled = !isHost;
}

// تحديث معلومات اللاعب في شاشة اللعبة + اللوبي
function updatePlayerInfoUI() {
  const nameInfo = document.getElementById("player-name-info");
  if (nameInfo) nameInfo.textContent = playerName || "لاعب";

  let teamLabel = "غير محدد";
  if (playerTeam === "red") teamLabel = "الأحمر";
  else if (playerTeam === "blue") teamLabel = "الأزرق";

  const teamInfo = document.getElementById("player-team-info");
  if (teamInfo) teamInfo.textContent = teamLabel;

  const teamLabelHeader = document.getElementById("player-team-label");
  if (teamLabelHeader) teamLabelHeader.textContent = teamLabel;

  let roleLabel = "غير محدد";
  if (playerRole === "spymaster") roleLabel = "Clue Cipher";
  else if (playerRole === "operative") roleLabel = "Seekers Cipher";

  const roleInfo = document.getElementById("player-role-info");
  if (roleInfo) roleInfo.textContent = roleLabel;

  const roleHeader = document.getElementById("player-role-label");
  if (roleHeader) roleHeader.textContent = roleLabel;

  const nameLabel = document.getElementById("player-name-label");
  if (nameLabel) nameLabel.textContent = playerName || "-";
}

// تحديث معلومات الدور والمرحلة
function updateTurnUI() {
  const teamSpan = document.getElementById("turn-team-label");
  const phaseSpan = document.getElementById("turn-phase-label");

  if (teamSpan) {
    if (currentTeamTurn === "red") teamSpan.textContent = "الفريق الأحمر";
    else if (currentTeamTurn === "blue") teamSpan.textContent = "الفريق الأزرق";
    else teamSpan.textContent = "-";
  }

  if (phaseSpan) {
    if (phase === "clue") phaseSpan.textContent = "إرسال تلميح";
    else if (phase === "guess") phaseSpan.textContent = "اختيار البطاقات";
    else phaseSpan.textContent = "-";
  }
}

// تحديث واجهة التلميح
function updateClueUI() {
  const form = document.getElementById("clue-form");
  const clueTextSpan = document.getElementById("clue-text");
  const clueTeamSpan = document.getElementById("clue-team");

  const canGiveClue =
    playerRole === "spymaster" &&
    playerTeam === currentTeamTurn &&
    phase === "clue" &&
    !currentClueText;

  if (form) {
    if (canGiveClue) form.classList.remove("hidden");
    else form.classList.add("hidden");
  }

  if (clueTextSpan) clueTextSpan.textContent = currentClueText || "لا يوجد تلميح بعد";

  if (clueTeamSpan) {
    if (currentClueTeam === "red") clueTeamSpan.textContent = "الفريق الأحمر";
    else if (currentClueTeam === "blue") clueTeamSpan.textContent = "الفريق الأزرق";
    else clueTeamSpan.textContent = "-";
  }
}

// توست التلميح
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

// ===== اللوق =====
function renderLog() {
  const logContainer = document.getElementById("log-entries");
  if (!logContainer) return;
  logContainer.innerHTML = "";
  logEntries.forEach(msg => {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.textContent = msg;
    logContainer.appendChild(div);
  });
  logContainer.scrollTop = logContainer.scrollHeight;
}

function logEvent(message) {
  logEntries.push(message);
  if (logEntries.length > 200) logEntries.shift();
  renderLog();
  saveGameStateToRoom({ logEntries });
}

// Overlay للرسائل
function showInfoOverlay(message) {
  const overlay = document.getElementById("info-overlay");
  const text = document.getElementById("info-text");
  if (text) text.textContent = message;
  overlay?.classList.remove("hidden");
}

function closeInfoOverlay() {
  document.getElementById("info-overlay")?.classList.add("hidden");
}

/* ===== Overlay تغيير الاسم ===== */

// فتح مودال تغيير الاسم
function openChangeNameOverlay() {
  const overlay = document.getElementById("change-name-overlay");
  const input   = document.getElementById("change-name-input");
  if (!overlay || !input) return;

  input.value = playerName || "";
  overlay.classList.remove("hidden");
  setTimeout(() => input.focus(), 50);
}

// تأكيد تغيير الاسم
async function confirmChangeName() {
  const overlay = document.getElementById("change-name-overlay");
  const input   = document.getElementById("change-name-input");
  if (!overlay || !input) return;

  let newName = (input.value || "").trim();
  if (!newName) {
    showInfoOverlay("اكتب لقباً جديداً أولاً.");
    return;
  }

  if (newName === playerName) {
    overlay.classList.add("hidden");
    return;
  }

  try {
    await applyPlayerNameChange(newName);
    overlay.classList.add("hidden");
    showInfoOverlay("تم تغيير لقبك بنجاح للجميع.");
  } catch (e) {
    console.error(e);
    showInfoOverlay("تعذّر تغيير اللقب، حاول مرة أخرى.");
  }
}

// تطبيق تغيير الاسم على Firebase
async function applyPlayerNameChange(newName) {
  const oldName = playerName || "";
  playerName = newName;

  const nameLabel = document.getElementById("player-name-label");
  const nameInfo  = document.getElementById("player-name-info");
  const nicknameInput = document.getElementById("nickname-input");

  if (nameLabel) nameLabel.textContent = newName;
  if (nameInfo) nameInfo.textContent = newName;
  if (nicknameInput) nicknameInput.value = newName;

  if (!roomCode || !playerId) return;

  const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);
  const data = {};
  data[`players.${playerId}.name`] = newName;
  await roomRef.set(data, { merge: true });

  if (oldName) {
    logEvent(`✏️ "${oldName}" غيّر اسمه إلى "${newName}".`);
  }
}

/* ===== الصلاحيات على الكروت ===== */

function canInteractWithCards(showMessage) {
  if (playerRole !== "operative") {
    if (showMessage) showInfoOverlay("فقط Seekers Cipher يقدرون يتعاملون مع البطاقات.");
    return false;
  }
  if (playerTeam !== currentTeamTurn) {
    if (showMessage) showInfoOverlay("ليس دور فريقك الآن.");
    return false;
  }
  if (!currentClueText || currentClueTeam !== currentTeamTurn) {
    if (showMessage) showInfoOverlay("لا يمكن اختيار البطاقات قبل التلميح.");
    return false;
  }
  if (phase !== "guess") {
    if (showMessage) showInfoOverlay("انتظر مرحلة اختيار البطاقات.");
    return false;
  }

  return true;
}

/* ===== التايمر ===== */

function startPhaseTimer(phaseType) {
  stopTimer();

  if (phaseType === "clue") {
    timerRemaining = masterTimeLimit;
  } else {
    timerRemaining = opsTimeLimit;
  }

  updateTimerLabel();

  if (!isHost) return;

  saveGameStateToRoom();

  timerId = setInterval(() => {
    timerRemaining--;
    if (timerRemaining < 0) timerRemaining = 0;

    updateTimerLabel();

    if (roomCode) {
      const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);
      roomRef.set({ game: { timerRemaining } }, { merge: true });
    }

    if (timerRemaining <= 0) {
      stopTimer();
      handleTimerEnd();
    }
  }, 1000);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function updateTimerLabel() {
  const el = document.getElementById("timer-label");
  if (el) el.textContent = formatTime(timerRemaining);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(1, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/* ===== حفظ حالة اللعبة في Firebase ===== */
function saveGameStateToRoom(extra = {}) {
  if (!roomCode) return;

  const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);

  const game = {
    started: gameStarted,
    boardState: boardState,
    startingTeam: startingTeam,
    currentTeamTurn: currentTeamTurn,
    phase: phase,
    currentClueText: currentClueText,
    currentClueTeam: currentClueTeam,
    currentClueCount: currentClueCount,
    remainingRed: remainingRed,
    remainingBlue: remainingBlue,
    timerRemaining: timerRemaining,
    logEntries: logEntries,
    ...extra
  };

  roomRef.set({ game }, { merge: true });
}

/* ===== تحديث الحالة من Firebase ===== */
function applyGameFromRoom(game) {
  if (!game) return;

  const prevStarted = gameStarted;
  const prevClue = currentClueText;

  gameStarted = !!game.started;

  if (Array.isArray(game.boardState)) {
    boardState = game.boardState;
  }

  startingTeam = game.startingTeam || startingTeam;
  currentTeamTurn = game.currentTeamTurn || currentTeamTurn;
  phase = game.phase || phase;

  currentClueText = game.currentClueText || "";
  currentClueTeam = game.currentClueTeam || null;
  currentClueCount = typeof game.currentClueCount === "number" ? game.currentClueCount : 0;

  remainingRed = typeof game.remainingRed === "number" ? game.remainingRed : remainingRed;
  remainingBlue = typeof game.remainingBlue === "number" ? game.remainingBlue : remainingBlue;

  if (typeof game.timerRemaining === "number") {
    timerRemaining = game.timerRemaining;
    updateTimerLabel();
  }

  if (Array.isArray(game.logEntries)) {
    logEntries = game.logEntries.slice();
    renderLog();
  }

  // === اللعب شغّال
  if (gameStarted) {
    const box = document.querySelector(".box");
    if (box) box.classList.add("corner");

    showSection("game-area");
    updatePlayerInfoUI();
    updateHostControlsUI();
    renderBoard();
    updateTurnUI();
    updateClueUI();
  }

  // === اللعب انتهى
  if (!gameStarted && prevStarted) {
    stopTimer();

    const overlay = document.getElementById("result-overlay");
    if (overlay) overlay.classList.add("hidden");

    const box = document.querySelector(".box");
    if (box) box.classList.remove("corner");

    showSection("lobby-screen");
    updateHostControlsUI();
  }

  // === تلميح جديد
  if (
    currentClueText &&
    currentClueText !== prevClue &&
    currentClueText !== lastLoggedClueText
  ) {
    const teamLabel = currentClueTeam === "red" ? "الأحمر"
                      : currentClueTeam === "blue" ? "الأزرق"
                      : "-";

    logEvent(`🕵️‍♂️ [${teamLabel}] تلميح: "${currentClueText}"`);
    showClueToast(`تلميح: ${currentClueText} — للفريق ${teamLabel}`);
    lastLoggedClueText = currentClueText;
  }
}

/* ===== نهاية الوقت ===== */
function handleTimerEnd() {
  if (phase === "clue") {
    if (!currentClueText || currentClueTeam !== currentTeamTurn) {
      // اللاعب لم يرسل تلميح
      const oldTeam = currentTeamTurn;

      currentTeamTurn = oldTeam === "red" ? "blue" : "red";
      phase = "clue";
      currentClueText = "";
      currentClueTeam = null;
      currentClueCount = 0;

      clearAllSusMarkers();
      logEvent(`⏰ انتهى وقت التلميح للفريق ${oldTeam === "red" ? "الأحمر" : "الأزرق"}، تم تمرير الدور.`);

      updateTurnUI();
      updateClueUI();
      saveGameStateToRoom();
      startPhaseTimer("clue");
    } else {
      // تم إرسال التلميح → الآن guess
      phase = "guess";
      clearAllSusMarkers();
      updateTurnUI();
      updateClueUI();
      saveGameStateToRoom();
      startPhaseTimer("guess");
    }
  }

  else if (phase === "guess") {
    const oldTeam = currentTeamTurn;
    currentTeamTurn = oldTeam === "red" ? "blue" : "red";
    phase = "clue";

    currentClueText = "";
    currentClueTeam = null;
    currentClueCount = 0;

    clearAllSusMarkers();
    logEvent(`⏰ انتهى وقت اختيار البطاقات للفريق ${oldTeam === "red" ? "الأحمر" : "الأزرق"}، الدور ينتقل.`);

    updateTurnUI();
    updateClueUI();
    saveGameStateToRoom();
    startPhaseTimer("clue");
  }
}

/* ===== مزامنة قائمة اللاعبين في اللوبي ===== */
function syncPlayersFromRoom(playersObj) {
  const blueSpy = document.getElementById("blue-spymaster-name");
  const redSpy  = document.getElementById("red-spymaster-name");
  const blueOps = document.getElementById("blue-operatives-list");
  const redOps  = document.getElementById("red-operatives-list");

  if (blueSpy) blueSpy.textContent = "غير معيّن";
  if (redSpy) redSpy.textContent  = "غير معيّن";
  if (blueOps) blueOps.innerHTML = "";
  if (redOps) redOps.innerHTML = "";

  const entries = Object.entries(playersObj || {});

  entries.forEach(([id, p]) => {
    if (!p || !p.name || !p.role || !p.team) return;

    // تحديث بيانات اللاعب الحالي من Firebase
    if (id === playerId) {
      playerName = p.name || playerName;
      playerTeam = p.team || null;
      playerRole = p.role || null;
      updatePlayerInfoUI();
    }

    if (p.role === "spymaster") {
      if (p.team === "blue" && blueSpy) blueSpy.textContent = p.name;
      if (p.team === "red"  && redSpy)  redSpy.textContent = p.name;
    }
    else if (p.role === "operative") {
      const li = document.createElement("li");
      li.textContent = p.name;

      if (p.team === "blue" && blueOps) blueOps.appendChild(li);
      if (p.team === "red"  && redOps) redOps.appendChild(li);
    }
  });
}

/* ===== الاشتراك في تغييرات الغرفة ===== */
function subscribeToRoomChanges() {
  if (!roomCode) return;

  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }

  const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);

  roomUnsubscribe = roomRef.onSnapshot(snap => {
    if (!snap.exists) return;

    const data = snap.data() || {};
    syncPlayersFromRoom(data.players || {});
    if (data.game) applyGameFromRoom(data.game);
  });
}

/* ===== دبل كلك = كشف البطاقة ===== */
function handleCardDoubleClick(index) {
  if (!canInteractWithCards(true)) return;
  revealCard(index);
}

/* ===== كشف بطاقة فعلية ===== */
function revealCard(index) {
  const card = boardState[index];
  if (!card || card.revealed) return;

  card.revealed = true;
  card.sus = false;
  card.chosenBy = playerName || "مجهول";

  updateSusMarker(index);

  const el = document.querySelector(`.card[data-index="${index}"]`);
  if (!el) return;
  el.className = "card";

  const teamArabic = playerTeam === "red" ? "الأحمر" : "الأزرق";

  let forceEndTurn = false;
  let switchTeam = false;

  if (card.team === "red") {
    el.classList.add("revealed-red");
    remainingRed--;
    logEvent(`🎯 [${teamArabic}] ${playerName}: اختار "${card.word}" (حمراء).`);

    if (currentTeamTurn === "red") currentClueCount = Math.max(0, currentClueCount - 1);
    else {
      forceEndTurn = true;
      switchTeam = true;
      currentClueCount = 0;
    }

    checkWin();
  }

  else if (card.team === "blue") {
    el.classList.add("revealed-blue");
    remainingBlue--;
    logEvent(`🎯 [${teamArabic}] ${playerName}: اختار "${card.word}" (زرقاء).`);

    if (currentTeamTurn === "blue") currentClueCount = Math.max(0, currentClueCount - 1);
    else {
      forceEndTurn = true;
      switchTeam = true;
      currentClueCount = 0;
    }

    checkWin();
  }

  else if (card.team === "neutral") {
    el.classList.add("revealed-neutral");
    logEvent(`🎯 [${teamArabic}] ${playerName}: اختار "${card.word}" (حيادية).`);

    forceEndTurn = true;
    switchTeam = true;
    currentClueCount = 0;
  }

  else if (card.team === "assassin") {
    el.classList.add("revealed-assassin");

    logEvent(`☠ [${teamArabic}] ${playerName}: اختار "${card.word}" (سوداء قاتلة!)`);

    showResult("assassin", { loserColor: currentTeamTurn });
    return;
  }

  if (!gameStarted) {
    saveGameStateToRoom();
    return;
  }

  if (!forceEndTurn && currentClueCount <= 0) {
    forceEndTurn = true;
    switchTeam = true;
  }

  if (forceEndTurn) {
    const prevTeam = currentTeamTurn;

    if (switchTeam) {
      currentTeamTurn = prevTeam === "red" ? "blue" : "red";
    }

    phase = "clue";
    currentClueText = "";
    currentClueTeam = null;
    currentClueCount = 0;

    clearAllSusMarkers();
    logEvent(`🔁 انتهى دور الفريق ${prevTeam === "red" ? "الأحمر" : "الأزرق"}.`);

    updateTurnUI();
    updateClueUI();
    saveGameStateToRoom();
    startPhaseTimer("clue");
  }
  else {
    saveGameStateToRoom();
  }
}

/* ===== التحقق من الفوز ===== */
function checkWin() {
  if (remainingRed === 0) {
    showResult("red");
  } else if (remainingBlue === 0) {
    showResult("blue");
  }
}

/* ===== شاشة الفوز + الخسارة ===== */
function showResult(resultType, opts = {}) {
  stopTimer();
  gameStarted = false;
  saveGameStateToRoom();

  const overlay = document.getElementById("result-overlay");
  const title = document.getElementById("result-title");
  const text  = document.getElementById("result-text");

  overlay.classList.remove("hidden", "result-red", "result-blue", "result-black");

  let t = "";
  let msg = "";

  if (resultType === "red" || resultType === "blue") {
    const winner = resultType;
    const loser = winner === "red" ? "blue" : "red";

    const wLabel = winner === "red" ? "الأحمر" : "الأزرق";
    const lLabel = loser === "red" ? "الأحمر" : "الأزرق";

    const youWin = playerTeam === winner;
    const youLose = playerTeam === loser;

    overlay.classList.add(winner === "red" ? "result-red" : "result-blue");

    if (youWin) {
      t = "🔥 مبروك الفوز!";
      msg = `فريقك (${wLabel}) أنهى كل كلماته وسيطر على الجولة. GG!`;
    } else if (youLose) {
      t = "💔 خسارة!";
      msg = `الفريق ${wLabel} أنهى كلماته أولاً. حاولوا الجولة القادمة.`;
    } else {
      t = `🎉 الفريق ${wLabel} فاز`;
      msg = `الفريق ${lLabel} حاول لكن ${
        wLabel
      } كان أسرع في كشف الكلمات.`;
    }
  }

  else if (resultType === "assassin") {
    overlay.classList.add("result-black");

    const loser = opts.loserColor;
    const winner = loser === "red" ? "blue" : "red";

    const lLabel = loser === "red" ? "الأحمر" : "الأزرق";
    const wLabel = winner === "red" ? "الأحمر" : "الأزرق";

    const youLose = playerTeam === loser;
    const youWin = playerTeam === winner;

    if (youLose) {
      t = "☠ سقوط الشبكة!";
      msg = `فريقك (${lLabel}) اختار البطاقة السوداء وخسر فوراً!`;
    } else if (youWin) {
      t = "🏴‍☠️ فوز سهل!";
      msg = `الفريق ${lLabel} وقع في الفخ ومنحكم الفوز مجاناً.`;
    } else {
      t = "☠ البطاقة السوداء!";
      msg = `الفريق ${lLabel} خسر الجولة بعد اختيار البطاقة السوداء.`;
    }
  }

  title.textContent = t;
  text.textContent = msg;
  overlay.classList.remove("hidden");
}

/* ===== رجوع من نتيجة الجولة ===== */
function returnToLobbyFromResult() {
  stopTimer();

  const overlay = document.getElementById("result-overlay");
  if (overlay) overlay.classList.add("hidden");

  const box = document.querySelector(".box");
  if (box) box.classList.remove("corner");

  showSection("lobby-screen");
  updateHostControlsUI();
}

/* ===== خروج اللاعب من الغرفة ===== */
async function goBackToMainMenu() {
  if (roomCode && playerId) {
    const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);
    let data = {};
    data[`players.${playerId}`] = firebase.firestore.FieldValue.delete();
    await roomRef.set(data, { merge: true });
  }

  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }

  stopTimer();

  roomCode = "";
  isHost = false;
  boardState = [];
  gameStarted = false;
  currentTeamTurn = null;
  phase = "clue";
  currentClueText = "";
  currentClueTeam = null;
  currentClueCount = 0;
  remainingRed = 0;
  remainingBlue = 0;
  logEntries = [];
  renderLog();

  const box = document.querySelector(".box");
  if (box) box.classList.remove("corner");

  const info = document.getElementById("room-info");
  if (info) info.classList.add("hidden");

  document.getElementById("player-team-label").textContent = "غير محدد";
  document.getElementById("player-role-label").textContent = "غير محدد";

  updateUrlWithRoomCode("");

  showSection("welcome-screen");
}

/* ===== فتح شاشة تغيير الاسم ===== */
function changePlayerName() {
  openChangeNameOverlay();
}

/* ===== تغيير الفريق بالكامل ===== */
function changePlayerTeam() {
  if (!roomCode || !playerId) {
    showInfoOverlay("أنت لست داخل غرفة.");
    return;
  }

  if (!playerTeam) {
    showInfoOverlay("لم تختر فريقك بعد.");
    return;
  }

  const newTeam = playerTeam === "red" ? "blue" : "red";
  const role = playerRole || "operative";

  chooseRole(newTeam, role);
}

/* ===== sus (علامة الشك) ===== */
function updateSusMarker(index) {
  const card = boardState[index];
  const susEl = document.querySelector(`.card[data-index="${index}"] .sus-marker`);
  if (!susEl) return;

  if (card.sus && !card.revealed) susEl.classList.remove("hidden");
  else susEl.classList.add("hidden");
}

/* ===== كلك واحد = SUS ===== */
function handleCardClick(index) {
  if (!canInteractWithCards(true)) return;

  const card = boardState[index];
  if (!card || card.revealed) return;

  card.sus = !card.sus;
  updateSusMarker(index);

  saveGameStateToRoom();
}

/* ===== حذف كل علامات SUS ===== */
function clearAllSusMarkers() {
  boardState.forEach((card, i) => {
    card.sus = false;
    const el = document.querySelector(`.card[data-index="${i}"] .sus-marker`);
    if (el) el.classList.add("hidden");
  });
}

/* ===== SUS by double click ===== */
function handleCardDoubleClick(index) {
  if (!canInteractWithCards(true)) return;
  revealCard(index);
}

/* ===== تنظيف التلميحات عند تغيير الدور ===== */
function resetClueState() {
  currentClueText = "";
  currentClueTeam = null;
  currentClueCount = 0;
  clearAllSusMarkers();
}

/* ===== عند الرجوع من شاشة الفوز ===== */
function returnToLobbyFromResult() {
  stopTimer();

  const overlay = document.getElementById("result-overlay");
  if (overlay) overlay.classList.add("hidden");

  const box = document.querySelector(".box");
  if (box) box.classList.remove("corner");

  showSection("lobby-screen");
  updateHostControlsUI();
}

/* ===== دوال مساعدة ===== */
function showSection(id) {
  document.querySelectorAll(".section").forEach(sec => sec.classList.add("hidden"));
  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
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

/* ===== END OF FILE ===== */
console.log("CIPHER — FULL SCRIPT LOADED SUCCESSFULLY");
