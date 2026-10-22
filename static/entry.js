// static/entry.js: auth for the entry page (/). Reuses the logic from login.js, signup.js and
// therapist_login.js: patients go to /dashboard, therapists to /therapist/portal.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

// Same config as login.js / signup.js (the "/" route does not pass an api_key to the template)
const firebaseConfig = {
  apiKey: "AIzaSyCl8Z4reasqvd9eGXoB6z_MDOuze7yoUwY",
  authDomain: "mental-health-d6596.firebaseapp.com",
  projectId: "mental-health-d6596",
  storageBucket: "mental-health-d6596.firebasestorage.app",
  messagingSenderId: "827190774187",
  appId: "1:827190774187:web:1450ed5c595532c7076aee"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);
const messageEl = $("auth-message");

function showMessage(text, type = "error") {
  messageEl.textContent = text;
  messageEl.className = `auth-message show ${type}`;
}
function clearMessage() { messageEl.className = "auth-message"; }

// ── Tabs ─────────────────────────────────────────────────────────
function switchTab(name) {
  const login = name === "login";
  $("tab-login").classList.toggle("active", login);
  $("tab-register").classList.toggle("active", !login);
  $("login-form").classList.toggle("hidden", !login);
  $("register-form").classList.toggle("hidden", login);
  clearMessage();
}
document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
if (location.hash === "#register") switchTab("register");

// ── Show / hide password ─────────────────────────────────────────
document.querySelectorAll(".toggle-pass").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.target);
    input.type = input.type === "password" ? "text" : "password";
  });
});

// ── Role selector ────────────────────────────────────────────────
document.querySelectorAll(".role-option").forEach((opt) => {
  opt.addEventListener("click", () => {
    document.querySelectorAll(".role-option").forEach((o) => o.classList.toggle("selected", o === opt));
    opt.querySelector("input").checked = true;
  });
});

// ── Routing after sign-in ────────────────────────────────────────
// Therapist accounts are provisioned by an administrator (a doc in "therapists"); everyone else is a patient.
async function routeAfterAuth(user, { createPatientIfMissing = false } = {}) {
  const therapistSnap = await getDoc(doc(db, "therapists", user.uid));
  if (therapistSnap.exists()) {
    const t = therapistSnap.data();
    localStorage.setItem("therapistId", user.uid);
    localStorage.setItem("therapistName", t.name || "");
    localStorage.setItem("therapistEmail", t.email || user.email || "");
    window.location.href = "/therapist/portal";
    return;
  }

  const userRef = doc(db, "users", user.uid);
  let userSnap = await getDoc(userRef);
  if (!userSnap.exists() && createPatientIfMissing) {
    await setDoc(userRef, {
      name: user.displayName || (user.email || "").split("@")[0],
      email: user.email,
      role: "patient",
      createdAt: new Date().toISOString()
    });
    userSnap = await getDoc(userRef);
  }
  if (!userSnap.exists()) throw new Error("User data not found.");

  const data = userSnap.data();
  if (data.role === "therapist") {
    // Registered as a therapist but not yet approved: no portal access without a "therapists" doc
    await signOut(auth);
    throw new Error("Your therapist account is waiting for administrator approval.");
  }

  localStorage.setItem("userId", user.uid);
  localStorage.setItem("userName", data.name || "");
  localStorage.setItem("userEmail", data.email || user.email || "");
  window.location.href = "/dashboard";
}

function friendlyError(error) {
  const code = error && error.code;
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "Incorrect email or password.";
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password") return "Password should be at least 6 characters.";
  if (code === "auth/invalid-email") return "Please enter a valid email address.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  return error.message || "Something went wrong.";
}

// ── Login ────────────────────────────────────────────────────────
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();
  const btn = $("login-btn");
  btn.disabled = true;
  btn.textContent = "Signing in...";
  try {
    const cred = await signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-password").value);
    await routeAfterAuth(cred.user);
  } catch (error) {
    showMessage(friendlyError(error));
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

// ── Google ───────────────────────────────────────────────────────
$("google-btn").addEventListener("click", async () => {
  clearMessage();
  const btn = $("google-btn");
  btn.disabled = true;
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    await routeAfterAuth(cred.user, { createPatientIfMissing: true });
  } catch (error) {
    const msg = friendlyError(error);
    if (msg) showMessage(msg);
    btn.disabled = false;
  }
});

// ── Forgot password ──────────────────────────────────────────────
$("forgot-link").addEventListener("click", async () => {
  clearMessage();
  const email = $("login-email").value.trim();
  if (!email) {
    showMessage("Enter your email above first, then click “Forgot password?”.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("Password reset email sent. Check your inbox.", "success");
  } catch (error) {
    showMessage(friendlyError(error));
  }
});

// ── Register ─────────────────────────────────────────────────────
$("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessage();
  const btn = $("register-btn");
  const name = $("register-name").value.trim();
  const email = $("register-email").value.trim();
  const password = $("register-password").value;
  const role = document.querySelector('input[name="role"]:checked').value;
  if (!name) { showMessage("Please enter your full name."); return; }

  btn.disabled = true;
  btn.textContent = "Creating account...";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;
    await updateProfile(user, { displayName: name });
    await setDoc(doc(db, "users", user.uid), { name, email, role, createdAt: new Date().toISOString() });

    if (role === "therapist") {
      // Portal access is granted by an administrator adding a "therapists" document
      await signOut(auth);
      showMessage("Account created. A MindCare administrator must approve your therapist access before you can use the portal.", "success");
      btn.disabled = false;
      btn.textContent = "Create Account";
      return;
    }
    window.location.href = "/dashboard";
  } catch (error) {
    showMessage(friendlyError(error));
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
});
