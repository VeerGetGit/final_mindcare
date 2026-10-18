// static/signup.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

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

// Signup logic
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const errorMsg = document.getElementById("error-msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    errorMsg.classList.remove("show");

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Store in Firestore
      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        createdAt: new Date().toISOString()
      });

      alert("Signup successful!");
      window.location.href = "/login";
    } catch (error) {
      errorMsg.textContent = error.message;
      errorMsg.classList.add("show");
    }
  });
});
