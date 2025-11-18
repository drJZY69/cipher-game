// ===== تهيئة Supabase =====
const SUPABASE_URL = "https://yifgimztfhbyocdwrqjr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZmdpbXp0ZmhieW9jZHdycWpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjAxNzYsImV4cCI6MjA3ODk5NjE3Nn0.g2809m0EjwpfHn9UzM4iPVhU6NAFAgB1HNs6D9ur4TQ";

let supa = null;
if (typeof supabase !== "undefined") {
  supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error("Supabase library not loaded! تأكد من وسم السكربت في index.html");
}

// فحص اتصال سريع فقط
async function testSupabaseConnection() {
  if (!supa) {
    console.error("Supabase client is null – ما تم إنشاؤه.");
    return;
  }
  try {
    const { error } = await supa.from("rooms").select("id").limit(1);
    if (error) {
      console.error("Supabase connection ERROR:", error.message || error);
    } else {
      console.log("Supabase connection OK.");
    }
  } catch (e) {
    console.error("Supabase fatal error:", e);
  }
}

// ===== دوال Supabase =====

// إنشاء غرفة جديدة في rooms
async function createRoomInDb(code, hostName, startingTeam) {
  if (!supa) return null;

  try {
    const { data, error } = await supa
      .from("rooms")
      .insert({
        code: code,
        host_name: hostName,
        starting_team: startingTeam,
        current_team: startingTeam,
        phase: "lobby",
        // نحط حالة بورد فاضية عشان ما يكون العمود null
        board_state: {
          cards: [],
          remainingRed: 0,
          remainingBlue: 0
        }
      })
      .select()
      .single();

    if (error) {
      console.error("createRoomInDb error:", error);
      showInfoOverlay("ما قدرنا ننشئ الغرفة في السيرفر، جرّب بعد شوي.");
      return null;
    }

    console.log("Room created in DB:", data);
    return data;
  } catch (e) {
    console.error("createRoomInDb fatal:", e);
    showInfoOverlay("صار خطأ غير متوقع أثناء إنشاء الغرفة.");
    return null;
  }
}

// جلب غرفة برمزها
async function fetchRoomByCode(code) {
  if (!supa) return null;

  try {
    const { data, error } = await supa
      .from("rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("fetchRoomByCode error:", error);
      return null;
    }

    return data; // لو ما فيه غرفة يرجع null
  } catch (e) {
    console.error("fetchRoomByCode fatal:", e);
    return null;
  }
}

// إضافة لاعب لجدول players
async function addPlayerToRoom(code, name, team = "none", role = "none") {
  if (!supa) return;

  try {
    const { data, error } = await supa
      .from("players")
      .insert({
        room_code: code,
        name: name,
        team: team,   // ما عاد ترسل null أبداً
        role: role    // نفس الشي
      })
      .select()
      .single();

    if (error) {
      console.error("addPlayerToRoom error:", error);
      showInfoOverlay("ما قدرنا نضيفك كلاعب في الغرفة، جرّب مرة ثانية.");
      return;
    }

    console.log("Player added:", data);
  } catch (e) {
    console.error("addPlayerToRoom fatal:", e);
  }
}


// ===== كود اللعبة =====

console.log("CIPHER Loaded");

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
let startingTeam = null;         // الفريق الذي يبدأ (الذي يملك 9 كروت)
let currentTeamTurn = null;      // "red" أو "blue"
let phase = "clue";              // "clue" أو "guess"

// التلميح
let currentClueText = "";
let currentClueTeam = null;      // "red" أو "blue"

// التايمر
let masterTimeLimit = 60;
let opsTimeLimit = 90;
let timerId = null;
let timerRemaining = 0;

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

// 🎵 صوتيات
function playSfx(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch (_) {}
}

// توليد كود غرفة من 5 حروف
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
    info.classList.add("hidden");
    return;
  }
  info.classList.remove("hidden");

  codeSpan.textContent = roomCode;
  roleSpan.textContent = isHost ? "هوست" : "لاعب";
}

// تحكم الهوست في الأزرار + الوقت
function updateHostControlsUI() {
  const startBtn   = document.getElementById("start-game-btn");
  const newRoundBtn= document.getElementById("new-round-btn");
  const masterInput= document.getElementById("master-time-input");
  const opsInput   = document.getElementById("ops-time-input");

  if (startBtn) {
    if (isHost) startBtn.classList.remove("hidden");
    else        startBtn.classList.add("hidden");
  }

  if (newRoundBtn) {
    if (isHost) newRoundBtn.classList.remove("hidden");
    else        newRoundBtn.classList.add("hidden");
  }

  if (masterInput) masterInput.disabled = !isHost;
  if (opsInput)    opsInput.disabled    = !isHost;
}

// معلومات اللاعب في شاشة اللعبة
function updatePlayerInfoUI() {
  document.getElementById("player-name-info").textContent = playerName || "لاعب";

  let teamLabel = "غير محدد";
  if (playerTeam === "red")  teamLabel = "الأحمر";
  if (playerTeam === "blue") teamLabel = "الأزرق";
  document.getElementById("player-team-info").textContent = teamLabel;

  let roleLabel = "غير محدد";
  if (playerRole === "spymaster") roleLabel = "Clue Cipher";
  if (playerRole === "operative") roleLabel = "Seekers Cipher";
  document.getElementById("player-role-info").textContent = roleLabel;
}

// معلومات الدور والمرحلة
function updateTurnUI() {
  const teamSpan  = document.getElementById("turn-team-label");
  const phaseSpan = document.getElementById("turn-phase-label");

  if (currentTeamTurn === "red")  teamSpan.textContent = "الفريق الأحمر";
  else if (currentTeamTurn === "blue") teamSpan.textContent = "الفريق الأزرق";
  else teamSpan.textContent = "-";

  if (phase === "clue")  phaseSpan.textContent = "إرسال تلميح";
  else if (phase === "guess") phaseSpan.textContent = "اختيار البطاقات";
  else phaseSpan.textContent = "-";
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

  if (canGiveClue) form.classList.remove("hidden");
  else             form.classList.add("hidden");

  clueTextSpan.textContent = currentClueText || "لا يوجد تلميح بعد";

  if (currentClueTeam === "red")  clueTeamSpan.textContent = "الفريق الأحمر";
  else if (currentClueTeam === "blue") clueTeamSpan.textContent = "الفريق الأزرق";
  else clueTeamSpan.textContent = "-";
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
  text.textContent = message;
  overlay.classList.remove("hidden");
}

function closeInfoOverlay() {
  document.getElementById("info-overlay").classList.add("hidden");
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

// تايمر
function startPhaseTimer(phaseType) {
  stopTimer();

  timerRemaining = (phaseType === "clue") ? masterTimeLimit : opsTimeLimit;
  updateTimerLabel();

  timerId = setInterval(() => {
    timerRemaining--;
    updateTimerLabel();

    if (timerRemaining > 0 && timerRemaining <= 10) {
      playSfx("sfx-tick");
      showClueToast(`${timerRemaining}`);
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

function handleTimerEnd() {
  if (phase === "clue") {
    if (!currentClueText || currentClueTeam !== currentTeamTurn) {
      const oldTeam = currentTeamTurn;
      currentTeamTurn = currentTeamTurn === "red" ? "blue" : "red";
      phase = "clue";
      currentClueText = "";
      currentClueTeam = null;
      clearAllSusMarkers();
      logEvent(`⏰ انتهى وقت التلميح للفريق ${oldTeam === "red" ? "الأحمر" : "الأزرق"}، تم تمرير الدور للفريق الآخر.`);
      playSfx("sfx-turn-change");
      showClueToast("انتهى الوقت، الدور للفريق الآخر");

      updateTurnUI();
      updateClueUI();
      startPhaseTimer("clue");
    } else {
      phase = "guess";
      clearAllSusMarkers();
      updateTurnUI();
      updateClueUI();
      startPhaseTimer("guess");
    }
  } else if (phase === "guess") {
    const oldTeam = currentTeamTurn;
    currentTeamTurn = currentTeamTurn === "red" ? "blue" : "red";
    phase = "clue";
    currentClueText = "";
    currentClueTeam = null;
    clearAllSusMarkers();
    logEvent(`⏰ انتهى وقت اختيار البطاقات للفريق ${oldTeam === "red" ? "الأحمر" : "الأزرق"}، الدور ينتقل للفريق الآخر.`);
    playSfx("sfx-turn-change");
    showClueToast("انتهى الوقت، الدور للفريق الآخر");

    updateTurnUI();
    updateClueUI();
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

  // إنشاء غرفة
  hostBtn.onclick = async () => {
    let name = nicknameInput.value.trim();
    if (!name) name = "لاعب مجهول";
    playerName = name;

    isHost   = true;
    roomCode = generateRoomCode();

    startingTeam = Math.random() < 0.5 ? "red" : "blue";

    const room = await createRoomInDb(roomCode, playerName, startingTeam);
    if (!room) {
      isHost   = false;
      roomCode = "";
      return;
    }

    // نسجل الهوست في جدول اللاعبين
    await addPlayerToRoom(roomCode, playerName, null, null);

    document.getElementById("player-name-label").textContent = playerName;
    updateRoomInfoUI();
    updateHostControlsUI();

    showSection("lobby-screen");
  };

  // انضمام لغرفة
  joinBtn.onclick = async () => {
    let name = nicknameInput.value.trim();
    if (!name) name = "لاعب مجهول";
    playerName = name;

    const code = joinCodeInput.value.trim().toUpperCase();
    if (code.length !== 5) {
      showInfoOverlay("اكتب رمز غرفة مكوّن من 5 حروف إنجليزية.");
      return;
    }

    const room = await fetchRoomByCode(code);
    if (!room) {
      showInfoOverlay("❌ عذراً، لا توجد غرفة بهذا الكود.\nتأكد من الكود أو خلي صاحبك ينشئ غرفة جديدة.");
      return;
    }

    isHost   = false;
    roomCode = code;

    // نضيف اللاعب في جدول players
    await addPlayerToRoom(roomCode, playerName, null, null);

    document.getElementById("player-name-label").textContent = playerName;
    updateRoomInfoUI();
    updateHostControlsUI();

    showSection("lobby-screen");
  };
});

// ===== تغيير الدور في اللوبي =====
function clearPreviousRoleUI() {
  if (!playerTeam || !playerRole) return;

  if (playerRole === "spymaster") {
    const span = document.getElementById(
      playerTeam === "blue" ? "blue-spymaster-name" : "red-spymaster-name"
    );
    if (span.textContent === playerName) span.textContent = "غير معيّن";
  } else {
    const list = document.getElementById(
      playerTeam === "blue" ? "blue-operatives-list" : "red-operatives-list"
    );
    [...list.children].forEach(li => {
      if (li.textContent === playerName) list.removeChild(li);
    });
  }
}

function leaveRole() {
  clearPreviousRoleUI();
  playerTeam = null;
  playerRole = null;
  document.getElementById("player-team-label").textContent = "غير محدد";
  document.getElementById("player-role-label").textContent = "غير محدد";
}

function chooseRole(team, role) {
  if (role === "spymaster") {
    const id = team === "blue" ? "blue-spymaster-name" : "red-spymaster-name";
    const span = document.getElementById(id);
    if (span.textContent !== "غير معيّن" && span.textContent !== playerName) {
      showInfoOverlay("يوجد Clue Cipher لهذا الفريق بالفعل.");
      return;
    }
  }

  clearPreviousRoleUI();

  playerTeam = team;
  playerRole = role;

  document.getElementById("player-team-label").textContent =
    team === "blue" ? "الأزرق" : "الأحمر";
  document.getElementById("player-role-label").textContent =
    role === "spymaster" ? "Clue Cipher" : "Seekers Cipher";

  if (role === "spymaster") {
    const id = team === "blue" ? "blue-spymaster-name" : "red-spymaster-name";
    document.getElementById(id).textContent = playerName;
  } else {
    const id = team === "blue" ? "blue-operatives-list" : "red-operatives-list";
    const list = document.getElementById(id);
    const li = document.createElement("li");
    li.textContent = playerName;
    list.appendChild(li);
  }

  const startBtn = document.getElementById("start-game-btn");
  if (isHost) startBtn.disabled = false;
}

// ===== بدء اللعبة =====
function startGame() {
  if (!isHost) {
    showInfoOverlay("فقط الهوست يقدر يبدأ اللعبة.");
    return;
  }

  const masterInput = document.getElementById("master-time-input");
  const opsInput    = document.getElementById("ops-time-input");

  const masterVal = parseInt(masterInput.value, 10);
  const opsVal    = parseInt(opsInput.value, 10);

  masterTimeLimit = isNaN(masterVal) ? 60 : masterVal;
  opsTimeLimit    = isNaN(opsVal) ? 90 : opsVal;

  document.querySelector(".box").classList.add("corner");

  updatePlayerInfoUI();

  showSection("game-area");
  updateHostControlsUI();

  startNewRoundFlow();
}

// جولة جديدة
function startNewRoundFlow() {
  const overlay = document.getElementById("result-overlay");
  overlay.classList.add("hidden");

  const logContainer = document.getElementById("log-entries");
  if (logContainer) logContainer.innerHTML = "";

  setupBoard();

  currentTeamTurn = startingTeam;
  phase          = "clue";
  currentClueText = "";
  currentClueTeam = null;

  logEvent(`🚩 بدء جولة جديدة. الفريق الذي يبدأ: ${currentTeamTurn === "red" ? "الأحمر" : "الأزرق"}.`);
  playSfx("sfx-round-start");

  updateTurnUI();
  updateClueUI();
  startPhaseTimer("clue");
}

// إنهاء الجولة والرجوع للوبي
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
  board.innerHTML = "";

  const words        = pick25Words();
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

    if (playerRole === "spymaster") {
      if (card.team === "red")      div.classList.add("spy-map-red");
      if (card.team === "blue")     div.classList.add("spy-map-blue");
      if (card.team === "neutral")  div.classList.add("spy-map-neutral");
      if (card.team === "assassin") div.classList.add("spy-map-assassin");
    }

    board.appendChild(div);
  });
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

  let word  = wordInput.value.trim();
  let count = parseInt(countInput.value, 10);

  if (!word) {
    showInfoOverlay("اكتب كلمة التلميح أولاً.");
    return;
  }

  if (isNaN(count) || count < 1) count = 1;
  if (count > 9) count = 9;
  countInput.value = count;

  currentClueText = `${word} (${count})`;
  currentClueTeam = currentTeamTurn;

  const teamLabel = currentTeamTurn === "red" ? "الأحمر" : "الأزرق";
  logEvent(`🕵️‍♂️ [${teamLabel}] ${playerName} (Clue Cipher): "${currentClueText}"`);

  wordInput.value = "";

  updateClueUI();
  playSfx("sfx-clue");
  showClueToast(`تلميح: ${currentClueText} — للفريق ${teamLabel}`);

  phase = "guess";
  clearAllSusMarkers();
  updateTurnUI();
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
}

// فحص الفوز
function checkWin() {
  if (remainingRed === 0)  showResult("red");
  if (remainingBlue === 0) showResult("blue");
}

// شاشة النتيجة
function showResult(type) {
  stopTimer();

  const overlay = document.getElementById("result-overlay");
  const text    = document.getElementById("result-text");

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
  const overlay = document.getElementById("result-overlay");
  overlay.classList.add("hidden");

  showSection("lobby-screen");
  document.querySelector(".box").classList.remove("corner");

  updateHostControlsUI();
}


