// static/login.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

// Your Firebase config
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

// Login logic
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const errorMsg = document.getElementById("error-msg");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.classList.remove("show");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get user info from Firestore
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();

        // Save to localStorage (optional)
        localStorage.setItem("userId", user.uid);
        localStorage.setItem("userName", userData.name);
        localStorage.setItem("userEmail", userData.email);

        window.location.href = "/dashboard";
      } else {
        throw new Error("User data not found.");
      }
    } catch (error) {
      errorMsg.textContent = error.message;
      errorMsg.classList.add("show");
    }
  });
});
