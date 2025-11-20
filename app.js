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
let startingTeam = null;         // الفريق اللي يبدأ (اللي عنده 9 كروت)
let currentTeamTurn = null;      // "red" أو "blue"
let phase = "clue";              // "clue" أو "guess"

// التلميح
let currentClueText = "";
let currentClueTeam = null;      // "red" أو "blue"
let currentClueCount = 0;        // عدد المحاولات المتبقية بناء على التلميح

// التايمر
let masterTimeLimit = 60;        // بالثواني
let opsTimeLimit = 90;           // بالثواني
let timerId = null;
let timerRemaining = 0;

// حالة اللعبة (لـ Firebase)
let gameStarted = false;
let lastLoggedClueText = "";

// اللوق المشترك بين الجميع
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

// ===== أدوات الرابط (للكود في الـ URL مثل ?room=ABCDE) =====
function updateUrlWithRoomCode(code) {
  try {
    const url = new URL(window.location.href);
    if (code) {
      url.searchParams.set("room", code);
    } else {
      url.searchParams.delete("room");
    }
    window.history.pushState({ roomCode: code }, "", url.toString());
  } catch (e) {
    console.warn("تعذّر تحديث الرابط (مو مهم للّعبة):", e);
  }
}

function getRoomCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("room");
    if (fromQuery) return fromQuery.toUpperCase();
    return null;
  } catch (e) {
    return null;
  }
}

// الكلمات
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

// === أدوات واجهة عامة ===
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

// توليد كود غرفة من 5 حروف إنجليزية
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
    if (info) info.classList.add("hidden");
    return;
  }
  if (info) info.classList.remove("hidden");

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

  if (clueTextSpan) {
    clueTextSpan.textContent = currentClueText || "لا يوجد تلميح بعد";
  }

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
  if (logEntries.length > 200) {
    logEntries.shift();
  }
  renderLog();
  saveGameStateToRoom({ logEntries });
}

// ===== Overlay للرسائل =====
function showInfoOverlay(message) {
  const overlay = document.getElementById("info-overlay");
  const text = document.getElementById("info-text");
  if (text) text.textContent = message;
  if (overlay) overlay.classList.remove("hidden");
}

function closeInfoOverlay() {
  const overlay = document.getElementById("info-overlay");
  if (overlay) overlay.classList.add("hidden");
}

/* ===== Overlay تغيير الاسم (مودال) ===== */

// فتح مودال تغيير الاسم
function openChangeNameOverlay() {
  const overlay = document.getElementById("change-name-overlay");
  const input   = document.getElementById("change-name-input");
  if (!overlay || !input) return;

  input.value = playerName || "";
  overlay.classList.remove("hidden");
  setTimeout(() => input.focus(), 50);
}

// تأكيد تغيير الاسم من المودال
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

// تنفيذ التغيير محلياً وعلى Firebase (بدون تغيير playerId)
async function applyPlayerNameChange(newName) {
  const oldName = playerName || "";
  playerName = newName;

  const nameLabel = document.getElementById("player-name-label");
  if (nameLabel) nameLabel.textContent = playerName;
  const nameInfo = document.getElementById("player-name-info");
  if (nameInfo) nameInfo.textContent = playerName;
  const nicknameInput = document.getElementById("nickname-input");
  if (nicknameInput) nicknameInput.value = playerName;

  // لو ما فيه غرفة، اكتفي بالتحديث المحلي
  if (!roomCode || !playerId) return;

  const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);

  const data = {};
  data[`players.${playerId}.name`] = newName;

  await roomRef.set(data, { merge: true });

  // سجل تغيير الاسم في اللوق
  if (oldName) {
    logEvent(`✏️ "${oldName}" غيّر اسمه إلى "${newName}".`);
  }
}

// ===== فحص هل اللاعب يقدر يتفاعل مع الكروت الآن؟ =====
function canInteractWithCards(showMessage) {
  if (playerRole !== "operative") {
    if (showMessage) showInfoOverlay("فقط Seekers Cipher يقدرون يتعاملون مع البطاقات.");
    return false;
  }
  if (playerTeam !== currentTeamTurn) {
    if (showMessage) showInfoOverlay("ليس دور فريقك الآن.");
    return false;
  }

  // لازم يكون فيه تلميح للفريق الحالي
  if (!currentClueText || currentClueTeam !== currentTeamTurn) {
    if (showMessage) showInfoOverlay("لا يمكن اختيار البطاقات قبل أن يرسل Clue Cipher تلميحاً.");
    return false;
  }

  if (phase !== "guess") {
    if (showMessage) showInfoOverlay("انتظر حتى يبدأ دور الاختيار بعد التلميح.");
    return false;
  }

  return true;
}

// ===== تايمر المراحل (الهوست فقط هو اللي يحركه) =====
function startPhaseTimer(phaseType) {
  stopTimer();

  if (phaseType === "clue") {
    timerRemaining = masterTimeLimit;
  } else {
    timerRemaining = opsTimeLimit;
  }

  updateTimerLabel();

  if (!isHost) {
    return;
  }

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

function clearAllSusMarkers() {
  boardState.forEach((card, i) => {
    card.sus = false;
    const el = document.querySelector(`.card[data-index="${i}"] .sus-marker`);
    if (el) el.classList.add("hidden");
  });
}

// ===== حفظ حالة اللعبة في Firebase =====
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

// ===== قراءة حالة اللعبة من Firebase وتطبيقها =====
function applyGameFromRoom(game) {
  if (!game) return;

  const wasStarted = gameStarted;
  const prevClue = currentClueText;

  gameStarted = !!game.started;

  if (Array.isArray(game.boardState)) {
    boardState = game.boardState;
  }

  if (game.startingTeam) startingTeam = game.startingTeam;
  if (game.currentTeamTurn) currentTeamTurn = game.currentTeamTurn;
  if (game.phase) phase = game.phase;

  currentClueText = game.currentClueText || "";
  currentClueTeam = game.currentClueTeam || null;
  currentClueCount = typeof game.currentClueCount === "number" ? game.currentClueCount : 0;

  if (typeof game.remainingRed === "number") remainingRed = game.remainingRed;
  if (typeof game.remainingBlue === "number") remainingBlue = game.remainingBlue;

  if (typeof game.timerRemaining === "number") {
    timerRemaining = game.timerRemaining;
    updateTimerLabel();
  }

  if (Array.isArray(game.logEntries)) {
    logEntries = game.logEntries.slice();
    renderLog();
  }

  if (gameStarted) {
    const box = document.querySelector(".box");
    if (box) box.classList.add("corner");

    updatePlayerInfoUI();
    showSection("game-area");
    updateHostControlsUI();
    renderBoard();
    updateTurnUI();
    updateClueUI();
  }

  if (!gameStarted && wasStarted) {
    stopTimer();

    const overlay = document.getElementById("result-overlay");
    if (overlay) overlay.classList.add("hidden");

    const box = document.querySelector(".box");
    if (box) box.classList.remove("corner");

    showSection("lobby-screen");
    updateHostControlsUI();
  }

  // تلميح جديد
  if (
    currentClueText &&
    currentClueText !== prevClue &&
    currentClueText !== lastLoggedClueText
  ) {
    const teamLabel =
      currentClueTeam === "red"
        ? "الأحمر"
        : currentClueTeam === "blue"
        ? "الأزرق"
        : "-";

    logEvent(`🕵️‍♂️ [${teamLabel}] تلميح: "${currentClueText}"`);
    showClueToast(`تلميح: ${currentClueText} — للفريق ${teamLabel}`);
    lastLoggedClueText = currentClueText;
  }
}

// ===== نهاية الوقت =====
function handleTimerEnd() {
  if (phase === "clue") {
    if (!currentClueText || currentClueTeam !== currentTeamTurn) {
      const oldTeam = currentTeamTurn;
      currentTeamTurn = currentTeamTurn === "red" ? "blue" : "red";
      phase = "clue";
      currentClueText = "";
      currentClueTeam = null;
      currentClueCount = 0;
      clearAllSusMarkers();
      logEvent(
        `⏰ انتهى وقت التلميح للفريق ${
          oldTeam === "red" ? "الأحمر" : "الأزرق"
        }، تم تمرير الدور.`
      );

      updateTurnUI();
      updateClueUI();
      saveGameStateToRoom();
      startPhaseTimer("clue");
    } else {
      phase = "guess";
      clearAllSusMarkers();
      updateTurnUI();
      updateClueUI();
      saveGameStateToRoom();
      startPhaseTimer("guess");
    }
  } else if (phase === "guess") {
    const oldTeam = currentTeamTurn;
    currentTeamTurn = currentTeamTurn === "red" ? "blue" : "red";
    phase = "clue";
    currentClueText = "";
    currentClueTeam = null;
    currentClueCount = 0;
    clearAllSusMarkers();
    logEvent(
      `⏰ انتهى وقت اختيار البطاقات للفريق ${
        oldTeam === "red" ? "الأحمر" : "الأزرق"
      }، الدور ينتقل للفريق الآخر.`
    );

    updateTurnUI();
    updateClueUI();
    saveGameStateToRoom();
    startPhaseTimer("clue");
  }
}

// ===== مزامنة اللوبي مع Firebase =====
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

    // مزامنة بيانات اللاعب الحالي من Firebase (فريق/دور)
    if (id === playerId) {
      playerName = p.name || playerName;
      playerTeam = p.team || null;
      playerRole = p.role || null;
      updatePlayerInfoUI();
    }

    if (p.role === "spymaster") {
      if (p.team === "blue" && blueSpy) blueSpy.textContent = p.name;
      else if (p.team === "red" && redSpy) redSpy.textContent = p.name;
    } else if (p.role === "operative") {
      const li = document.createElement("li");
      li.textContent = p.name;
      if (p.team === "blue" && blueOps) blueOps.appendChild(li);
      else if (p.team === "red" && redOps) redOps.appendChild(li);
    }
  });
}

function subscribeToRoomChanges() {
  if (!roomCode) return;

  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }

  const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);
  roomUnsubscribe = roomRef.onSnapshot(snap => {
    if (!snap.exists) return;
    const data = snap.data();

    syncPlayersFromRoom(data.players || {});

    if (data.game) {
      applyGameFromRoom(data.game);
    }
  });
}

// ===== إنشاء بورد جديد (للهوست) =====
function setupNewBoard() {
  const words = pick25Words();
  const config = generateTeamLayout();
  const layout = config.layout;
  startingTeam = config.firstTeam;

  boardState = words.map((w, i) => ({
    word: w,
    team: layout[i],
    revealed: false,
    sus: false,
    chosenBy: null
  }));

  remainingRed = layout.filter(x => x === "red").length;
  remainingBlue = layout.filter(x => x === "blue").length;
}

// ===== رسم البورد على الشاشة =====
function renderBoard() {
  const board = document.getElementById("board");
  if (!board) return;

  board.innerHTML = "";

  boardState.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = "card";
    div.dataset.index = i;

    // ألوان الخريطة للـ Spymaster
    if (playerRole === "spymaster") {
      if (card.team === "red") div.classList.add("spy-map-red");
      if (card.team === "blue") div.classList.add("spy-map-blue");
      if (card.team === "neutral") div.classList.add("spy-map-neutral");
      if (card.team === "assassin") div.classList.add("spy-map-assassin");
    }

    if (card.revealed) {
      if (card.team === "red") div.classList.add("revealed-red");
      else if (card.team === "blue") div.classList.add("revealed-blue");
      else if (card.team === "neutral") div.classList.add("revealed-neutral");
      else if (card.team === "assassin") div.classList.add("revealed-assassin");
    }

    const chosenVisible =
      playerRole === "spymaster" &&
      card.revealed &&
      !!card.chosenBy;

    div.innerHTML = `
      <span class="sus-marker ${card.sus && !card.revealed ? "" : "hidden"}">✋</span>
      ${chosenVisible ? `<span class="chosen-marker">🎯</span>` : ""}
      <span class="card-word">${card.word}</span>
    `;

    div.onclick = () => handleCardClick(i);
    div.ondblclick = (e) => {
      e.preventDefault();
      handleCardDoubleClick(i);
    };

    board.appendChild(div);
  });
}

// ===== شاشة البداية: هوست / انضمام =====
window.addEventListener("DOMContentLoaded", () => {
  initPlayerId();

  const nicknameInput = document.getElementById("nickname-input");
  const hostBtn = document.getElementById("btn-host");
  const joinBtn = document.getElementById("btn-join");
  const joinCodeInput = document.getElementById("join-code-input");

  const urlRoomCode = getRoomCodeFromUrl();
  if (urlRoomCode && joinCodeInput) {
    joinCodeInput.value = urlRoomCode;
  }

  if (hostBtn) {
    hostBtn.onclick = async () => {
      let name = nicknameInput ? nicknameInput.value.trim() : "";
      if (!name) {
        showInfoOverlay("اكتب لقبك أولاً قبل إنشاء غرفة.");
        return;
      }
      playerName = name;

      isHost = true;
      roomCode = generateRoomCode();

      updateRoomInfoUI();
      updateHostControlsUI();
      updatePlayerInfoUI();

      await db.collection(ROOMS_COLLECTION).doc(roomCode).set({
        code: roomCode,
        hostId: playerId,
        hostName: playerName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        players: {
          [playerId]: {
            id: playerId,
            name: playerName,
            team: null,
            role: null
          }
        }
      });

      updateUrlWithRoomCode(roomCode);
      subscribeToRoomChanges();
      showSection("lobby-screen");
    };
  }

  if (joinBtn) {
    joinBtn.onclick = async () => {
      let name = nicknameInput ? nicknameInput.value.trim() : "";
      if (!name) {
        showInfoOverlay("اكتب لقبك أولاً قبل الانضمام إلى غرفة.");
        return;
      }
      playerName = name;

      const code = (joinCodeInput ? joinCodeInput.value.trim() : "").toUpperCase();
      if (code.length !== 5) {
        showInfoOverlay("اكتب رمز غرفة مكوّن من 5 حروف إنجليزية.");
        return;
      }

      const roomRef = db.collection(ROOMS_COLLECTION).doc(code);
      const snap = await roomRef.get();

      if (!snap.exists) {
        showInfoOverlay("هذه الغرفة غير موجودة. تأكد من الكود.");
        return;
      }

      isHost = false;
      roomCode = code;

      updateRoomInfoUI();
      updateHostControlsUI();
      updatePlayerInfoUI();

      await roomRef.set({
        players: {
          [playerId]: {
            id: playerId,
            name: playerName,
            team: null,
            role: null
          }
        }
      }, { merge: true });

      updateUrlWithRoomCode(roomCode);
      subscribeToRoomChanges();
      showSection("lobby-screen");
    };
  }
});

// ===== تغيير الدور في اللوبي =====
function clearPreviousRoleUI() {
  // ما نعدل واجهة اللوبي مباشرة، لأنها تُبنى من Firebase في syncPlayersFromRoom
  // نتركها فاضية هنا
}

async function leaveRole() {
  playerTeam = null;
  playerRole = null;
  updatePlayerInfoUI();

  // تحديث Firebase (تفريغ الدور للفرد الحالي فقط)
  if (roomCode && playerId) {
    const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);
    const data = {};
    data[`players.${playerId}.team`] = null;
    data[`players.${playerId}.role`] = null;
    await roomRef.set(data, { merge: true });
  }
}

async function chooseRole(team, role) {
  if (!roomCode || !playerId) {
    showInfoOverlay("ادخل غرفة أولاً.");
    return;
  }

  const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);
  const snap = await roomRef.get();

  if (!snap.exists) {
    showInfoOverlay("الغرفة غير موجودة.");
    return;
  }

  const data = snap.data() || {};
  const players = data.players || {};

  // 🔒 حماية دور Clue Cipher
  if (role === "spymaster") {
    const existingSpy = Object.values(players).find(
      p => p && p.team === team && p.role === "spymaster"
    );

    if (existingSpy && existingSpy.id !== playerId) {
      showInfoOverlay(`لا يمكن، يوجد Clue Cipher للفريق ${team === "red" ? "الأحمر" : "الأزرق"}.`);
      return;
    }
  }

  // 🔵🔴 تحديث اللاعب محليًا
  playerTeam = team;
  playerRole = role;
  updatePlayerInfoUI();

  const startBtn = document.getElementById("start-game-btn");
  if (isHost && startBtn) startBtn.disabled = false;

  // 🔥 حفظ الدور في Firebase
  const update = {};
  update[`players.${playerId}`] = {
    id: playerId,
    name: playerName,
    team: team,
    role: role
  };

  await roomRef.set(update, { merge: true });
}



// ===== بدء اللعبة (من الهوست فقط) =====
async function startGame() {
  if (!isHost) {
    showInfoOverlay("فقط الهوست يقدر يبدأ اللعبة.");
    return;
  }

  const masterInput = document.getElementById("master-time-input");
  const opsInput = document.getElementById("ops-time-input");

  const masterVal = masterInput ? parseInt(masterInput.value, 10) : NaN;
  const opsVal = opsInput ? parseInt(opsInput.value, 10) : NaN;

  masterTimeLimit = isNaN(masterVal) ? 60 : masterVal;
  opsTimeLimit = isNaN(opsVal) ? 90 : opsVal;

  const box = document.querySelector(".box");
  if (box) box.classList.add("corner");

  updatePlayerInfoUI();
  showSection("game-area");
  updateHostControlsUI();

  setupNewBoard();
  currentTeamTurn = startingTeam;
  phase = "clue";
  currentClueText = "";
  currentClueTeam = null;
  currentClueCount = 0;
  gameStarted = true;
  lastLoggedClueText = "";
  logEntries = [];
  renderLog();

  saveGameStateToRoom();
  startNewRoundFlowLocal();
}

// بدء جولة جديدة محلياً (للهوست فقط)
function startNewRoundFlowLocal() {
  const overlay = document.getElementById("result-overlay");
  if (overlay) overlay.classList.add("hidden");

  logEntries = [];
  renderLog();

  renderBoard();

  if (currentTeamTurn) {
    logEvent(
      `🚩 بدء جولة جديدة. الفريق الذي يبدأ: ${
        currentTeamTurn === "red" ? "الأحمر" : "الأزرق"
      }.`
    );
  }

  updateTurnUI();
  updateClueUI();
  startPhaseTimer("clue");
}

// 🔴 إنهاء الجولة والرجوع للوبي
function endRoundAndReturn() {
  if (!isHost) {
    showInfoOverlay("فقط الهوست يقدر إنهاء الجولة والرجوع إلى اللوبي.");
    return;
  }

  stopTimer();
  gameStarted = false;
  currentClueText = "";
  currentClueTeam = null;
  currentClueCount = 0;
  saveGameStateToRoom();

  const resultOverlay = document.getElementById("result-overlay");
  if (resultOverlay) resultOverlay.classList.add("hidden");

  showSection("lobby-screen");

  const box = document.querySelector(".box");
  if (box) box.classList.remove("corner");

  updateHostControlsUI();
}

// ===== كلمات عشوائية =====
function pick25Words() {
  return [...ALL_WORDS].sort(() => Math.random() - 0.5).slice(0, 25);
}

// ===== توزيع الألوان 9/8 + حيادي + قاتل =====
function generateTeamLayout() {
  const first = Math.random() < 0.5 ? "red" : "blue";
  const second = first === "red" ? "blue" : "red";

  const arr = [
    ...Array(9).fill(first),
    ...Array(8).fill(second),
    ...Array(7).fill("neutral"),
    "assassin"
  ];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  return { layout: arr, firstTeam: first };
}

// ===== sus (كلك عادي) =====
function updateSusMarker(index) {
  const card = boardState[index];
  const susEl = document.querySelector(`.card[data-index="${index}"] .sus-marker`);
  if (!susEl) return;
  if (card.sus && !card.revealed) susEl.classList.remove("hidden");
  else susEl.classList.add("hidden");
}

function handleCardClick(index) {
  if (!canInteractWithCards(true)) return;

  const card = boardState[index];
  if (!card || card.revealed) return;

  card.sus = !card.sus;
  updateSusMarker(index);
  saveGameStateToRoom();
}

// ===== دبل كلك = كشف البطاقة =====
function handleCardDoubleClick(index) {
  if (!canInteractWithCards(true)) return;
  revealCard(index);
}

// ===== إرسال التلميح من Clue Cipher =====
function sendClue() {
  if (
    !(playerRole === "spymaster" &&
      playerTeam === currentTeamTurn &&
      phase === "clue")
  ) {
    showInfoOverlay("فقط Clue Cipher للفريق الحالي يقدر يرسل التلميح في مرحلته.");
    return;
  }

  // منع إرسال أكثر من تلميح في نفس الدور للفريق الحالي
  if (currentClueText && currentClueTeam === currentTeamTurn) {
    showInfoOverlay("لقد أرسلت تلميحك بالفعل، انتظر أن يختار Seekers Cipher البطاقات.");
    return;
  }

  const wordInput = document.getElementById("clue-word-input");
  const countInput = document.getElementById("clue-count-input");

  let word = wordInput ? wordInput.value.trim() : "";
  let count = countInput ? parseInt(countInput.value, 10) : NaN;

  if (!word) {
    showInfoOverlay("اكتب كلمة التلميح أولاً.");
    return;
  }

  if (isNaN(count) || count < 1) count = 1;
  if (count > 9) count = 9;
  if (countInput) countInput.value = count;

  currentClueText = `${word} (${count})`;
  currentClueTeam = currentTeamTurn;
  currentClueCount = count;

  // تحويل المرحلة إلى guess مباشرة قبل الحفظ
  phase = "guess";

  const teamLabel = currentTeamTurn === "red" ? "الأحمر" : "الأزرق";
  logEvent(`🕵️‍♂️ [${teamLabel}] ${playerName} (Clue Cipher): "${currentClueText}"`);

  lastLoggedClueText = currentClueText;

  if (wordInput) wordInput.value = "";

  updateClueUI();
  showClueToast(`تلميح: ${currentClueText} — للفريق ${teamLabel}`);

  clearAllSusMarkers();
  updateTurnUI();
  saveGameStateToRoom();
  startPhaseTimer("guess");
}

// ===== كشف بطاقة =====
function revealCard(i) {
  const card = boardState[i];
  if (!card || card.revealed) return;

  card.revealed = true;
  card.sus = false;
  card.chosenBy = playerName || "مجهول";
  updateSusMarker(i);

  const el = document.querySelector(`.card[data-index="${i}"]`);
  if (!el) return;
  el.className = "card";

  const teamLabelOp = playerTeam === "red" ? "الأحمر" : "الأزرق";

  let endTurn = false;
  let switchTeam = false;

  if (card.team === "red") {
    el.classList.add("revealed-red");
    remainingRed--;
    logEvent(`🎯 [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة حمراء).`);

    if (currentTeamTurn === "red") {
      currentClueCount = Math.max(0, currentClueCount - 1);
    } else {
      endTurn = true;
      switchTeam = true;
      currentClueCount = 0;
    }

    checkWin();
  }
  else if (card.team === "blue") {
    el.classList.add("revealed-blue");
    remainingBlue--;
    logEvent(`🎯 [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة زرقاء).`);

    if (currentTeamTurn === "blue") {
      currentClueCount = Math.max(0, currentClueCount - 1);
    } else {
      endTurn = true;
      switchTeam = true;
      currentClueCount = 0;
    }

    checkWin();
  }
  else if (card.team === "neutral") {
    el.classList.add("revealed-neutral");
    logEvent(`🎯 [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة حيادية).`);
    endTurn = true;
    switchTeam = true;
    currentClueCount = 0;
  }
  else if (card.team === "assassin") {
    el.classList.add("revealed-assassin");
    logEvent(`☠ [${teamLabelOp}] ${playerName}: اختار "${card.word}" (بطاقة سوداء قاتلة!).`);
    // اللاعب الحالي (فريقه الحالي) هو الخاسر
    showResult("assassin", { loserColor: currentTeamTurn });
    return;
  }

  if (!gameStarted) {
    saveGameStateToRoom();
    return;
  }

  if (!endTurn && currentClueCount <= 0) {
    endTurn = true;
    switchTeam = true;
  }

  if (endTurn) {
    const oldTeam = currentTeamTurn;
    if (switchTeam) {
      currentTeamTurn = oldTeam === "red" ? "blue" : "red";
    }
    phase = "clue";
    currentClueText = "";
    currentClueTeam = null;
    currentClueCount = 0;
    clearAllSusMarkers();
    logEvent(
      `🔁 انتهى دور الفريق ${oldTeam === "red" ? "الأحمر" : "الأزرق"}، الدور ينتقل للفريق الآخر.`
    );
    updateTurnUI();
    updateClueUI();
    saveGameStateToRoom();
    startPhaseTimer("clue");
  } else {
    saveGameStateToRoom();
  }
}

// ===== التحقق من الفوز =====
function checkWin() {
  if (remainingRed === 0) {
    showResult("red");
  } else if (remainingBlue === 0) {
    showResult("blue");
  }
}

// ===== شاشة الفوز/الخسارة =====
function showResult(type, options = {}) {
  stopTimer();
  gameStarted = false;
  saveGameStateToRoom();

  const overlay = document.getElementById("result-overlay");
  const titleEl = document.getElementById("result-title");
  const textEl  = document.getElementById("result-text");

  if (!overlay || !titleEl || !textEl) return;

  overlay.classList.remove("hidden", "result-red", "result-blue", "result-black");

  let title = "";
  let text = "";

  if (type === "red" || type === "blue") {
    const winnerColor = type;                 // "red" or "blue"
    const loserColor  = winnerColor === "red" ? "blue" : "red";
    const winnerLabel = winnerColor === "red" ? "الأحمر" : "الأزرق";
    const loserLabel  = loserColor === "red" ? "الأحمر" : "الأزرق";

    const isWinner = playerTeam === winnerColor;
    const isLoser  = playerTeam === loserColor;

    if (winnerColor === "red") {
      overlay.classList.add("result-red");
    } else {
      overlay.classList.add("result-blue");
    }

    if (isWinner) {
      title = "🔥 مبروك! انتصار ساحق";
      text  = `فريقك (${winnerLabel}) سيطر على شبكة الكلمات واستطاع كشف جميع عملائه بنجاح. GG!`;
    } else if (isLoser) {
      title = "💔 خسارة هذه الجولة";
      text  = `الفريق ${winnerLabel} أنهى جميع كلماته أولاً. لا تيأس، خذ نفس ورجّع الجولة اللي بعدها.`;
    } else {
      title = `الفريق ${winnerLabel} فاز`;
      text  = `تم حسم الجولة لصالح الفريق ${winnerLabel}. الفريق ${loserLabel} حاول، لكن الحسم كان للأسرع.`;
    }
  }
  else if (type === "assassin") {
    overlay.classList.add("result-black");

    const loserColor = options.loserColor || null;
    const winnerColor =
      loserColor === "red" ? "blue" :
      loserColor === "blue" ? "red" :
      null;

    const loserLabel =
      loserColor === "red" ? "الأحمر" :
      loserColor === "blue" ? "الأزرق" :
      "الخاسر";

    const winnerLabel =
      winnerColor === "red" ? "الأحمر" :
      winnerColor === "blue" ? "الأزرق" :
      "الفريق الآخر";

    const isLoser  = playerTeam && playerTeam === loserColor;
    const isWinner = playerTeam && playerTeam === winnerColor;

    if (isLoser) {
      title = "☠ خسارة قاتلة!";
      text  = `فريقك (${loserLabel}) اختار البطاقة السوداء وتسبب في سقوط كل الشبكة. ركّزوا أكثر في الجولة الجاية!`;
    } else if (isWinner) {
      title = "🏴‍☠️ فوز مجاني!";
      text  = `الفريق ${loserLabel} اختار البطاقة السوداء، وهذا منح فريقك (${winnerLabel}) الفوز فوراً. أحياناً أفضل فوز هو خطأ خصمك!`;
    } else {
      title = "☠ البطاقة السوداء حسمت الجولة";
      text  = `الفريق ${loserLabel} وقع في فخ البطاقة السوداء، والجولة تنتهي بفوز الفريق ${winnerLabel}.`;
    }
  } else {
    overlay.classList.add("result-black");
    title = "انتهت الجولة";
    text  = "تم حسم الجولة، لكن نوع النتيجة غير معروف.";
  }

  titleEl.textContent = title;
  textEl.textContent  = text;
  overlay.classList.remove("hidden");
}

// رجوع إلى اللوبي بعد النتيجة (محلي بس)
function returnToLobbyFromResult() {
  stopTimer();
  const overlay = document.getElementById("result-overlay");
  if (overlay) overlay.classList.add("hidden");

  showSection("lobby-screen");
  const box = document.querySelector(".box");
  if (box) box.classList.remove("corner");

  updateHostControlsUI();
}

// ===== زر الرجوع إلى القائمة الرئيسية (للجميع) =====
async function goBackToMainMenu() {
  // حذف اللاعب من الغرفة في Firebase
  if (roomCode && playerId) {
    const roomRef = db.collection(ROOMS_COLLECTION).doc(roomCode);
    const data = {};
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

  const roomInfo = document.getElementById("room-info");
  if (roomInfo) roomInfo.classList.add("hidden");

  const teamLabel = document.getElementById("player-team-label");
  const roleLabel = document.getElementById("player-role-label");
  if (teamLabel) teamLabel.textContent = "غير محدد";
  if (roleLabel) roleLabel.textContent = "غير محدد";

  updateUrlWithRoomCode("");
  showSection("welcome-screen");
}

// ===== زر تغيير الاسم =====
function changePlayerName() {
  openChangeNameOverlay();
}

// ===== زر تغيير الفريق =====
function changePlayerTeam() {
  if (!roomCode || !playerId) {
    showInfoOverlay("أنت لست داخل غرفة حالياً.");
    return;
  }

  if (!playerTeam) {
    showInfoOverlay("ليس لديك فريق حالياً. اختر فريقك ودورك من اللوبي.");
    return;
  }

  const newTeam = playerTeam === "red" ? "blue" : "red";
  const role = playerRole || "operative";

  chooseRole(newTeam, role);
}


