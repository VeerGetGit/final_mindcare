import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

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

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("therapist-login-form");
  const errorMsg = document.getElementById("error-msg");
  const loginBtn = document.getElementById("login-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.classList.remove("show");
    loginBtn.textContent = "Logging in...";
    loginBtn.disabled = true;

    const email = document.getElementById("therapist-email").value.trim();
    const password = document.getElementById("therapist-password").value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check Firestore for therapist role
      const therapistRef = doc(db, "therapists", user.uid);
      const therapistSnap = await getDoc(therapistRef);

      if (!therapistSnap.exists()) {
        await auth.signOut();
        throw new Error("Access denied. This account is not registered as a therapist.");
      }

      const therapistData = therapistSnap.data();

      // Store therapist session info
      localStorage.setItem("therapistId", user.uid);
      localStorage.setItem("therapistName", therapistData.name);
      localStorage.setItem("therapistEmail", therapistData.email);

      window.location.href = "/therapist/portal";

    } catch (error) {
      errorMsg.textContent = error.message;
      errorMsg.classList.add("show");
      loginBtn.textContent = "Login to Portal";
      loginBtn.disabled = false;
    }
  });
});