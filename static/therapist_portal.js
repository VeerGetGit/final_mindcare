import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  getFirestore, doc, collection,
  addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: "mental-health-d6596.firebaseapp.com",
  projectId: "mental-health-d6596",
  storageBucket: "mental-health-d6596.firebasestorage.app",
  messagingSenderId: "827190774187",
  appId: "1:827190774187:web:1450ed5c595532c7076aee"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── STATE ─────────────────────────────────────────────────────────────────────
let currentTherapistId = null;
let currentPatientId = null;
let currentPatientData = null;
let allSessions = [];
let allPatients = [];
let chatHistory = [];

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "/therapist/login"; return; }
  const snap = await getDoc(doc(db, "therapists", user.uid));
  if (!snap.exists()) { await signOut(auth); window.location.href = "/therapist/login"; return; }
  currentTherapistId = user.uid;
  document.getElementById("tp-therapist-name").textContent = snap.data().name || "Therapist";
  await loadPatients();
  addAgentMessage("👋 Hello! I'm your AI session assistant. Click **+ Add** to add a patient, then tell me what you'd like to do.");
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById("tp-logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/therapist/login";
});

// ── LOAD PATIENTS ─────────────────────────────────────────────────────────────
async function loadPatients() {
  const listEl = document.getElementById("patient-list");
  listEl.innerHTML = '<li class="tp-loading">Loading...</li>';
  try {
    const snap = await getDocs(query(
      collection(db, "therapists", currentTherapistId, "patients"),
      orderBy("name")
    ));
    allPatients = [];
    snap.forEach(d => allPatients.push({ id: d.id, ...d.data() }));
    renderPatientList(allPatients);
  } catch (e) {
    listEl.innerHTML = '<li class="tp-loading">Error loading patients.</li>';
  }
}

function renderPatientList(patients) {
  const listEl = document.getElementById("patient-list");
  listEl.innerHTML = "";
  if (!patients.length) {
    listEl.innerHTML = '<li class="tp-loading">No patients yet. Click + Add!</li>';
    return;
  }
  patients.forEach(p => {
    const li = document.createElement("li");
    li.className = "tp-patient-item" + (p.id === currentPatientId ? " active" : "");
    li.dataset.id = p.id;
    const risk = p.latestRisk || "Low";
    li.innerHTML = `
      <div class="tp-p-name"><span class="tp-risk-dot ${risk}"></span>${p.name}</div>
      <div class="tp-p-meta">${[p.age ? p.age + " yrs" : null, p.gender, p.primaryConcern].filter(Boolean).join(" • ")}</div>`;
    li.addEventListener("click", () => selectPatient(p.id, p));
    listEl.appendChild(li);
  });
}

// ── ADD PATIENT MODAL ─────────────────────────────────────────────────────────
document.getElementById("add-patient-btn").addEventListener("click", () => {
  document.getElementById("patient-form").reset();
  document.getElementById("patient-modal").style.display = "flex";
});
document.getElementById("close-patient-modal").addEventListener("click", () => {
  document.getElementById("patient-modal").style.display = "none";
});
document.getElementById("cancel-patient-modal").addEventListener("click", () => {
  document.getElementById("patient-modal").style.display = "none";
});
document.getElementById("patient-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
});
document.getElementById("patient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const patientData = {
    name: document.getElementById("pm-name").value.trim(),
    age: document.getElementById("pm-age").value,
    gender: document.getElementById("pm-gender").value,
    primaryConcern: document.getElementById("pm-concern").value.trim(),
    latestRisk: "Low",
    createdAt: serverTimestamp()
  };
  try {
    const ref = collection(db, "therapists", currentTherapistId, "patients");
    await addDoc(ref, patientData);
    document.getElementById("patient-modal").style.display = "none";
    await loadPatients();
    showToast("Patient added successfully!", "success");
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
});

// ── PATIENT SEARCH ────────────────────────────────────────────────────────────
document.getElementById("patient-search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderPatientList(allPatients.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.primaryConcern || "").toLowerCase().includes(q)
  ));
});

// ── SELECT PATIENT ────────────────────────────────────────────────────────────
async function selectPatient(patientId, patientData) {
  currentPatientId = patientId;
  currentPatientData = patientData;
  chatHistory = [];

  document.getElementById("tp-empty-state").style.display = "none";
  document.getElementById("tp-chat-view").style.display = "block";
  document.getElementById("view-patient-name").textContent = patientData.name;
  document.getElementById("view-patient-meta").textContent =
    [patientData.age ? patientData.age + " yrs" : null, patientData.gender, patientData.primaryConcern]
    .filter(Boolean).join(" • ");

  document.querySelectorAll(".tp-patient-item").forEach(el =>
    el.classList.toggle("active", el.dataset.id === patientId));

  const risk = patientData.latestRisk || "Low";
  const banner = document.getElementById("risk-banner");
  banner.style.display = risk === "Low" ? "none" : "block";
  banner.className = "tp-risk-pill " + risk;
  banner.textContent = risk === "High" ? "🔴 High Risk" : "🟡 Medium Risk";

  await loadSessions();
  switchTab("chat");

  document.getElementById("chat-messages").innerHTML = "";
  addAgentMessage(`📋 Now working with **${patientData.name}**. I have ${allSessions.length} session(s) on record.\n\nYou can:\n• Log a new session\n• View session history\n• Search sessions\n• Update or delete a session`);
}

// ── LOAD SESSIONS ─────────────────────────────────────────────────────────────
async function loadSessions() {
  const snap = await getDocs(query(
    collection(db, "therapists", currentTherapistId, "patients", currentPatientId, "sessions"),
    orderBy("date", "desc")
  ));
  allSessions = [];
  snap.forEach(d => allSessions.push({ id: d.id, ...d.data() }));
  renderSessionHistory(allSessions);
  renderOverview(allSessions);
}

// ── SEND CHAT ─────────────────────────────────────────────────────────────────
document.getElementById("chat-send-btn").addEventListener("click", sendMessage);
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  if (!currentPatientId) {
    addAgentMessage("⚠️ Please select a patient from the sidebar first.");
    return;
  }
  input.value = "";
  addUserMessage(text);
  const thinkingEl = addThinkingMessage();
  document.getElementById("chat-send-btn").disabled = true;

  try {
    const sessionsSummary = allSessions.length
      ? allSessions.slice(0, 10).map((s, i) =>
          `[${i}] ID:${s.id} | Date:${s.date} | Mood:${s.moodObserved || "?"} | Risk:${s.riskLevel || "?"} | Concerns:${s.keyConcerns || "?"}`
        ).join("\n")
      : "No sessions yet.";

    const response = await fetch("/api/therapist/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        patient: {
          id: currentPatientId,
          name: currentPatientData.name,
          age: currentPatientData.age,
          gender: currentPatientData.gender,
          primaryConcern: currentPatientData.primaryConcern
        },
        sessions_summary: sessionsSummary,
        chat_history: chatHistory,
        today: new Date().toISOString().split("T")[0]
      })
    });

    const data = await response.json();
    thinkingEl.remove();

    if (data.error) { addAgentMessage("❌ " + data.error, true); return; }

    const result = await executeAction(data.action, data.payload);
    chatHistory.push({ role: "user", content: text });
    chatHistory.push({ role: "assistant", content: result });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
    addAgentMessage(result);

  } catch (err) {
    thinkingEl.remove();
    addAgentMessage("❌ Something went wrong: " + err.message, true);
  } finally {
    document.getElementById("chat-send-btn").disabled = false;
  }
}

// ── EXECUTE ACTIONS ───────────────────────────────────────────────────────────
async function executeAction(action, payload) {
  const sessionsRef = collection(db, "therapists", currentTherapistId, "patients", currentPatientId, "sessions");
  const patientRef = doc(db, "therapists", currentTherapistId, "patients", currentPatientId);

  switch (action) {
    case "log_session": {
      const sessionData = { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await addDoc(sessionsRef, sessionData);
      await updateDoc(patientRef, { latestRisk: payload.riskLevel || "Low", lastSession: payload.date });
      await loadSessions();
      await loadPatients();
      return `✅ Session logged!\n\n📅 **${formatDate(payload.date)}** — ${payload.duration || "?"} mins\n😶 Mood: ${payload.moodObserved || "—"}\n⚡ Risk: ${payload.riskLevel || "Low"}\n📝 Concerns: ${payload.keyConcerns || "—"}\n🎯 Actions: ${payload.actionItems || "—"}`;
    }
    case "retrieve_sessions": {
      if (!allSessions.length) return "📭 No sessions found yet.";
      const count = payload.count || 5;
      const lines = allSessions.slice(0, count).map((s, i) =>
        `**${i + 1}. ${formatDate(s.date)}** — ${s.moodObserved || "?"} mood | Risk: ${s.riskLevel || "?"}`
      ).join("\n");
      return `📋 Last ${Math.min(count, allSessions.length)} session(s):\n\n${lines}\n\nClick **Session History** tab for full details.`;
    }
    case "search_sessions": {
      const keyword = (payload.keyword || "").toLowerCase();
      const results = allSessions.filter(s =>
        (s.keyConcerns || "").toLowerCase().includes(keyword) ||
        (s.triggerPoints || "").toLowerCase().includes(keyword) ||
        (s.moodObserved || "").toLowerCase().includes(keyword) ||
        (s.actionItems || "").toLowerCase().includes(keyword) ||
        (s.rawNotes || "").toLowerCase().includes(keyword)
      );
      if (!results.length) return `🔍 No sessions found matching **"${payload.keyword}"**.`;
      return `🔍 Found **${results.length}** session(s) matching "${payload.keyword}":\n\n` +
        results.map((s, i) => `**${i + 1}. ${formatDate(s.date)}** — ${s.moodObserved || "?"} | ${(s.keyConcerns || "").slice(0, 80)}...`).join("\n");
    }
    case "update_session": {
      let target = payload.session_index !== undefined ? allSessions[payload.session_index] : allSessions[0];
      if (!target) return "❌ Session not found.";
      await updateDoc(doc(sessionsRef, target.id), { ...payload.updates, updatedAt: serverTimestamp() });
      if (payload.updates?.riskLevel) await updateDoc(patientRef, { latestRisk: payload.updates.riskLevel });
      await loadSessions();
      return `✏️ Session from **${formatDate(target.date)}** updated.`;
    }
    case "delete_session": {
      let target = payload.session_index !== undefined ? allSessions[payload.session_index] : allSessions[0];
      if (!target) return "❌ Session not found.";
      await deleteDoc(doc(sessionsRef, target.id));
      await loadSessions();
      return `🗑️ Session from **${formatDate(target.date)}** deleted.`;
    }
    case "update_patient": {
      await updateDoc(patientRef, { ...payload, updatedAt: serverTimestamp() });
      currentPatientData = { ...currentPatientData, ...payload };
      document.getElementById("view-patient-meta").textContent =
        [currentPatientData.age ? currentPatientData.age + " yrs" : null, currentPatientData.gender, currentPatientData.primaryConcern]
        .filter(Boolean).join(" • ");
      await loadPatients();
      return `👤 Patient details updated.`;
    }
    case "add_patient": {
      const pRef = collection(db, "therapists", currentTherapistId, "patients");
      await addDoc(pRef, { ...payload, latestRisk: "Low", createdAt: serverTimestamp() });
      await loadPatients();
      return `✅ New patient **${payload.name}** added! Click their name in the sidebar.`;
    }
    case "converse":
    default:
      return payload.message || "I'm here to help! What would you like to do?";
  }
}

// ── SESSION HISTORY ───────────────────────────────────────────────────────────
function renderSessionHistory(sessions) {
  const listEl = document.getElementById("session-list");
  if (!sessions.length) { listEl.innerHTML = '<div class="tp-loading">No sessions yet.</div>'; return; }
  listEl.innerHTML = "";
  sessions.forEach(s => {
    const card = document.createElement("div");
    card.className = "tp-session-card";
    card.innerHTML = `
      <div>
        <div class="tp-session-card-date">📅 ${formatDate(s.date)} ${s.duration ? "• " + s.duration + " min" : ""}</div>
        <div class="tp-session-card-meta">Mood: ${s.moodObserved || "—"} | Risk: ${s.riskLevel || "—"}</div>
        <div class="tp-session-card-concerns">${s.keyConcerns || "No concerns noted."}</div>
      </div>
      <span class="tp-risk-pill ${s.riskLevel || "Low"}">${s.riskLevel || "Low"}</span>`;
    card.addEventListener("click", () => openSessionModal(s));
    listEl.appendChild(card);
  });
}

function openSessionModal(s) {
  const fields = [
    ["Date", formatDate(s.date)], ["Duration", s.duration ? s.duration + " min" : "—"],
    ["Mood", s.moodObserved || "—"], ["Risk", s.riskLevel || "—"],
    ["Next Appt", formatDate(s.nextAppointment)], ["Concerns", s.keyConcerns || "—"],
    ["Triggers", s.triggerPoints || "—"], ["History", s.pastHistory || "—"],
    ["Actions", s.actionItems || "—"], ["Notes", s.rawNotes || "—"]
  ];
  document.getElementById("session-modal-body").innerHTML = fields.map(([l, v]) =>
    `<div class="tp-detail-row"><span class="tp-detail-label">${l}</span><span class="tp-detail-value">${v}</span></div>`
  ).join("");
  document.getElementById("session-modal").style.display = "flex";
}

document.getElementById("close-session-modal").addEventListener("click", () => {
  document.getElementById("session-modal").style.display = "none";
});
document.getElementById("session-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
});

// ── OVERVIEW ──────────────────────────────────────────────────────────────────
function renderOverview(sessions) {
  document.getElementById("ov-total").textContent = sessions.length;
  if (!sessions.length) return;
  const latest = sessions[0];
  document.getElementById("ov-last").textContent = formatDate(latest.date);
  document.getElementById("ov-risk").textContent = latest.riskLevel || "—";
  document.getElementById("ov-next").textContent = formatDate(latest.nextAppointment);
  const moodCount = {};
  sessions.forEach(s => { if (s.moodObserved) moodCount[s.moodObserved] = (moodCount[s.moodObserved] || 0) + 1; });
  const topMood = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("ov-mood").textContent = topMood ? topMood[0] : "—";
  const freqs = sessions.filter(s => s.frequencyOfProblem).map(s => Number(s.frequencyOfProblem));
  document.getElementById("ov-freq").textContent = freqs.length
    ? (freqs.reduce((a, b) => a + b, 0) / freqs.length).toFixed(1) + "/week" : "—";
  const triggers = [...new Set(sessions.flatMap(s =>
    (s.triggerPoints || "").split(",").map(t => t.trim()).filter(Boolean)))];
  document.getElementById("ov-triggers").innerHTML = triggers.length
    ? triggers.map(t => `<span class="tp-tag">${t}</span>`).join("") : "None recorded.";
}

// ── TABS ──────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tp-tab").forEach(tab => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});
function switchTab(name) {
  document.querySelectorAll(".tp-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tp-tab-content").forEach(c => { c.style.display = "none"; c.classList.remove("active"); });
  const t = document.getElementById("tab-" + name);
  if (t) { t.style.display = "block"; t.classList.add("active"); }
}

// ── CHAT UI HELPERS ───────────────────────────────────────────────────────────
function addUserMessage(text) {
  const el = document.createElement("div");
  el.className = "tp-msg user";
  el.innerHTML = `<div class="tp-msg-label">You</div>${escapeHtml(text)}`;
  document.getElementById("chat-messages").appendChild(el);
  scrollChat();
}
function addAgentMessage(text, isError = false) {
  const el = document.createElement("div");
  el.className = "tp-msg agent" + (isError ? " error" : "");
  el.innerHTML = `<div class="tp-msg-label">🤖 AI Agent</div>${formatMarkdown(text)}`;
  document.getElementById("chat-messages").appendChild(el);
  scrollChat();
  return el;
}
function addThinkingMessage() {
  const el = document.createElement("div");
  el.className = "tp-msg thinking";
  el.innerHTML = `<div class="tp-msg-label">🤖 AI Agent</div>Thinking...`;
  document.getElementById("chat-messages").appendChild(el);
  scrollChat();
  return el;
}
function scrollChat() {
  const c = document.getElementById("chat-messages");
  c.scrollTop = c.scrollHeight;
}
function formatMarkdown(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}
function escapeHtml(text) {
  return String(text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function formatDate(d) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
function showToast(msg, type = "") {
  const t = document.getElementById("tp-toast");
  t.textContent = msg; t.className = "tp-toast" + (type ? " " + type : "");
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 3000);
}

// ── MY CASES ──────────────────────────────────────────────────────────────────
const casesView = document.getElementById("tp-cases-view");

document.getElementById("tp-cases-btn").addEventListener("click", () => {
  const opening = casesView.style.display === "none";
  casesView.style.display = opening ? "block" : "none";
  // Hide/restore the existing patient views while the cases panel is open
  const empty = document.getElementById("tp-empty-state");
  const chatView = document.getElementById("tp-chat-view");
  if (opening) {
    empty.style.display = "none";
    chatView.style.display = "none";
    loadCases();
  } else {
    empty.style.display = currentPatientId ? "none" : "";
    chatView.style.display = currentPatientId ? "block" : "none";
  }
});

function showCasesTab(which) {
  const bookings = which === "bookings";
  document.getElementById("cases-bookings").style.display = bookings ? "flex" : "none";
  document.getElementById("cases-alerts").style.display = bookings ? "none" : "flex";
  document.getElementById("cases-tab-bookings").classList.toggle("active", bookings);
  document.getElementById("cases-tab-alerts").classList.toggle("active", !bookings);
}
document.getElementById("cases-tab-bookings").addEventListener("click", () => showCasesTab("bookings"));
document.getElementById("cases-tab-alerts").addEventListener("click", () => showCasesTab("alerts"));

function caseTime(c) {
  const t = c.timestamp;
  return t && t.toDate ? t.toDate() : (t ? new Date(t) : null);
}

async function fetchCases(type) {
  // "any" = unassigned; any therapist can pick these up
  const snap = await getDocs(query(
    collection(db, "therapist_cases"),
    where("type", "==", type),
    where("therapist_id", "in", [currentTherapistId, "any"])
  ));
  const cases = [];
  snap.forEach(d => cases.push({ id: d.id, ...d.data() }));
  cases.sort((a, b) => (caseTime(b) || 0) - (caseTime(a) || 0));
  return cases;
}

async function loadCases() {
  const bookingsEl = document.getElementById("cases-bookings");
  const alertsEl = document.getElementById("cases-alerts");
  bookingsEl.textContent = alertsEl.textContent = "Loading...";
  try {
    renderCases(bookingsEl, await fetchCases("booking"), "booking");
    renderCases(alertsEl, await fetchCases("chatbot_flag"), "chatbot_flag");
  } catch (e) {
    console.error("Error loading cases:", e);
    bookingsEl.textContent = alertsEl.textContent = "Error loading cases.";
  }
}

function addLine(parent, label, text) {
  const row = document.createElement("div");
  row.className = "tp-case-row";
  const b = document.createElement("strong");
  b.textContent = label + ": ";
  row.appendChild(b);
  row.appendChild(document.createTextNode(text || "—"));
  parent.appendChild(row);
}

function renderCases(container, cases, type) {
  container.textContent = "";
  if (!cases.length) {
    container.textContent = type === "booking" ? "No session bookings yet." : "No chatbot alerts.";
    return;
  }
  cases.forEach(c => {
    const card = document.createElement("div");
    card.className = "tp-case-card";

    const status = c.status || "new";
    const badge = document.createElement("span");
    badge.className = "tp-status-badge " + status;
    badge.textContent = status;
    card.appendChild(badge);

    const identity = document.createElement("div");
    identity.className = "tp-case-identity";
    addLine(identity, "Patient", c.patient_name || "Anonymous");
    addLine(identity, "Email", c.patient_email || "No email");
    addLine(identity, "Patient ID", c.patient_id || c.patient_uid);
    card.appendChild(identity);

    const when = caseTime(c);
    if (when) {
      const meta = document.createElement("div");
      meta.className = "tp-case-meta";
      meta.textContent = when.toLocaleString();
      card.appendChild(meta);
    }

    if (type === "booking") {
      addLine(card, "Time slot", c.timeslot);
      addLine(card, "Problem", c.problem);
    } else {
      addLine(card, "Triggering message", c.trigger_message);
      addLine(card, "AI responded", c.ai_response);
    }

    const actions = document.createElement("div");
    actions.className = "tp-case-actions";
    const histBtn = document.createElement("button");
    histBtn.className = "tp-btn tp-btn-outline";
    histBtn.textContent = "View Chat History";
    histBtn.addEventListener("click", () => showChatHistory(c));
    actions.appendChild(histBtn);

    if (type === "chatbot_flag" && status === "new") {
      const reviewBtn = document.createElement("button");
      reviewBtn.className = "tp-btn tp-btn-primary";
      reviewBtn.textContent = "Mark Reviewed";
      reviewBtn.addEventListener("click", async () => {
        try {
          await updateDoc(doc(db, "therapist_cases", c.id), { status: "reviewed" });
          badge.className = "tp-status-badge reviewed";
          badge.textContent = "reviewed";
          reviewBtn.remove();
        } catch (e) {
          showToast("Error: " + e.message, "error");
        }
      });
      actions.appendChild(reviewBtn);
    }
    card.appendChild(actions);
    container.appendChild(card);
  });
}

async function showChatHistory(c) {
  const patientId = c.patient_id || c.patient_uid;
  const modal = document.getElementById("chat-history-modal");
  const body = document.getElementById("chat-history-body");
  modal.style.display = "flex";

  // Snapshot attached to the case at booking/flag time; no API call needed
  if (c.chat_history) {
    body.textContent = "";
    const pre = document.createElement("div");
    pre.className = "tp-chat-history-text";
    pre.textContent = c.chat_history;
    body.appendChild(pre);
    return;
  }

  body.textContent = "Loading...";
  try {
    let data;
    const res = await fetch("/api/patient/chat-summary/" + encodeURIComponent(patientId));
    if (res.ok) {
      data = await res.json();
    } else {
      // Server has no Firestore access; read directly (rules allow signed-in users).
      const snap = await getDocs(query(collection(db, "chat_messages"), where("user_id", "==", patientId)));
      const msgs = [];
      snap.forEach(d => msgs.push(d.data()));
      msgs.sort((a, b) => (caseTime(b) || 0) - (caseTime(a) || 0));
      const recent = msgs.slice(0, 10);
      const userMsgs = recent.filter(m => m.role === "user");
      data = recent.length
        ? { summary: `Patient has had ${userMsgs.length} conversations. Recent topics: ${userMsgs.slice(0, 3).map(m => (m.text || "").slice(0, 60)).join("; ") || "n/a"}`, messages: recent }
        : { summary: "No chat history available", messages: [] };
    }
    body.textContent = "";
    const summary = document.createElement("p");
    summary.textContent = data.summary;
    body.appendChild(summary);
    // Messages are newest first; show oldest first
    [...data.messages].reverse().forEach(m => {
      const line = document.createElement("div");
      line.className = "tp-chat-line " + (m.role === "user" ? "user" : "bot");
      line.textContent = (m.role === "user" ? "Patient: " : "MindCare: ") + (m.text || "");
      body.appendChild(line);
    });
  } catch (e) {
    console.error("Error loading chat history:", e);
    body.textContent = "Could not load chat history.";
  }
}

document.getElementById("close-chat-history-modal").addEventListener("click", () => {
  document.getElementById("chat-history-modal").style.display = "none";
});
