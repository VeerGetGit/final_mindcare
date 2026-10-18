// dashboard.js
// Generate a random color for this user session
const userColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

import { getDatabase, ref as dbRef, push, get, onChildAdded } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCl8Z4reasqvd9eGXoB6z_MDOuze7yoUwY",
  authDomain: "mental-health-d6596.firebaseapp.com",
  projectId: "mental-health-d6596",
  storageBucket: "mental-health-d6596.firebasestorage.app",
  messagingSenderId: "827190774187",
  appId: "1:827190774187:web:1450ed5c595532c7076aee"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const usernameEl = document.getElementById("username");
const profilePic = document.getElementById("profile-pic");
const profileDropdown = document.getElementById("profile-dropdown");
const uploadOption = document.getElementById("upload-option");
const logoutBtn = document.getElementById("logout");
const uploadInput = document.getElementById("upload-pic");
const moodSelect = document.getElementById("mood-select");
const moodForm = document.getElementById("mood-form");
const journalForm = document.getElementById("journal-form");
const journalDatePicker = document.getElementById("journal-date-picker");
const journalText = document.getElementById("journal-text");
const journalView = document.getElementById("journal-view");
const moodChartCanvas = document.getElementById("mood-chart");
const prevWeekBtn = document.getElementById("prev-week");
const nextWeekBtn = document.getElementById("next-week");
const habitItems = document.querySelectorAll('.habit-item');
const currentStreakEl = document.getElementById('current-streak');
const dailyProgressEl = document.getElementById('daily-progress');
const progressPercentageEl = document.getElementById('progress-percentage');
const meditationModal = document.getElementById('meditation-modal');
const meditationSetup = document.getElementById('meditation-setup');
const meditationSession = document.getElementById('meditation-session');
const meditationComplete = document.getElementById('meditation-complete');
const closeMeditationBtn = document.querySelector('.close-meditation');
const meditationBtns = document.querySelectorAll('.meditation-btn');
const meditationTypes = document.querySelectorAll('.meditation-type');
const playPauseBtn = document.getElementById('play-pause-btn');
const stopMeditationBtn = document.getElementById('stop-meditation');
const meditationDoneBtn = document.getElementById('meditation-done');
const timerMinutesEl = document.getElementById('timer-minutes');
const timerSecondsEl = document.getElementById('timer-seconds');
const meditationTitleEl = document.getElementById('meditation-title');
const meditationInstructionEl = document.getElementById('meditation-instruction');
const breathingIndicator = document.getElementById('breathing-indicator');
const progressRingCircle = document.querySelector('.progress-ring-circle');


// Global Variables
let currentUser = null;
let moodChart = null;
let currentWeekOffset = 0;
let currentHabits = {};
let habitStreak = 0;
let meditationTimer = null;
let meditationDuration = 0;
let meditationTimeLeft = 0;
let meditationPaused = false;
let currentMeditationType = '';


// Initialize particles animation
function createParticles() {
  const container = document.querySelector('.particles-container');

  function createParticle() {
    const particle = document.createElement('div');
    particle.className = 'particle';

    const size = Math.random() * 6 + 2;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
    particle.style.animationDelay = Math.random() * 5 + 's';

    container.appendChild(particle);

    setTimeout(() => {
      particle.remove();
    }, 25000);
  }

  // Create initial particles
  for (let i = 0; i < 50; i++) {
    setTimeout(createParticle, i * 100);
  }

  // Continue creating particles
  setInterval(createParticle, 500);
}

const meditationInstructions = {
  'breathing': [
    "Take a deep breath in through your nose for 4 counts...",
    "Hold your breath gently for 4 counts...",
    "Exhale slowly through your mouth for 6 counts...",
    "Focus on the sensation of breathing...",
    "Let your thoughts come and go naturally...",
    "Return your attention to your breath..."
  ],
  'body-scan': [
    "Start by noticing your toes... feel any sensations...",
    "Move your attention to your feet and ankles...",
    "Feel your calves and shins... notice any tension...",
    "Bring awareness to your thighs and hips...",
    "Notice your lower back and abdomen...",
    "Feel your chest and shoulders...",
    "Bring attention to your arms and hands...",
    "Notice your neck and jaw...",
    "Feel your face and the top of your head..."
  ],
  'mindfulness': [
    "Notice the present moment without judgment...",
    "Observe your thoughts like clouds passing by...",
    "Feel your body in this space...",
    "Listen to the sounds around you...",
    "Notice any emotions that arise...",
    "Accept whatever you're experiencing...",
    "Return to the present moment..."
  ],
  'loving-kindness': [
    "Begin by sending love to yourself...",
    "May I be happy, may I be healthy...",
    "Now think of someone you love...",
    "Send them loving thoughts and wishes...",
    "Think of someone neutral to you...",
    "Extend the same loving kindness to them...",
    "Even send love to someone difficult...",
    "Finally, send love to all beings everywhere..."
  ]
};
// Initialize habit tracker
async function initializeHabitTracker() {
  console.log('Initializing habit tracker...');

  initializeDefaultHabits();

  // Load today's habits - WAIT for this to complete
  await loadTodayHabits();

  // Add event listeners for habit controls
  addHabitEventListeners();

  // Add meditation modal event listeners
  addMeditationEventListeners();

  // Update progress display AFTER loading habits
  updateHabitProgress();

  // Test Firestore Connection First
  await testFirestoreConnection();

  // Load habit streak AFTER loading today's habits
  await loadHabitStreak();
}


async function testFirestoreConnection() {
  try {
    console.log('Testing Firestore connection...');
    console.log('Current user:', currentUser);
    console.log('Database instance:', db);

    const testDoc = doc(db, "users", currentUser.uid, "test", "connection");
    const testData = {
      timestamp: Timestamp.now(),
      test: true,
      userAgent: navigator.userAgent,
      userId: currentUser.uid
    };

    console.log('Attempting to write test document:', testData);
    await setDoc(testDoc, testData);

    // Try to read it back
    const readBack = await getDoc(testDoc);
    if (readBack.exists()) {
      console.log('Firestore connection successful! Data:', readBack.data());
      return true;
    } else {
      console.error('Write succeeded but read failed');
      return false;
    }
  } catch (error) {
    console.error('Firestore connection failed:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    return false;
  }
}

// Add habit event listeners
function addHabitEventListeners() {
  // Toggle habit completion
  document.querySelectorAll('.toggle-habit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const habitItem = e.target.closest('.habit-item');
      const habitType = habitItem.dataset.habit;
      const target = e.target.dataset.target;

      if (habitType === 'hydration') return; // Handled separately

      let value = 0;
      if (habitType === 'sleep') {
        value = parseFloat(habitItem.querySelector('.sleep-hours').value) || 0;
      } else if (habitType === 'exercise') {
        value = parseFloat(habitItem.querySelector('.exercise-minutes').value) || 0;
      } else if (habitType === 'meditation') {
        value = currentHabits[habitType]?.value || 0;
      }

      const completed = target ? value >= parseFloat(target) : !currentHabits[habitType]?.completed;

      await updateHabit(habitType, value, completed);
    });
  });

  //water Tracking
  document.querySelectorAll('.add-glass').forEach(btn => {
    btn.addEventListener('click', async () => {
      const current = currentHabits.hydration?.value || 0;
      // FIX: Don't allow more than 8 glasses
      if (current >= 8) {
        showMessage('Daily hydration goal already achieved! 💧', 'info');
        return;
      }
      const newValue = current + 1;
      await updateHabit('hydration', newValue, newValue >= 8);
    });
  });

  document.querySelectorAll('.remove-glass').forEach(btn => {
    btn.addEventListener('click', async () => {
      const current = currentHabits.hydration?.value || 0;
      const newValue = Math.max(current - 1, 0);
      await updateHabit('hydration', newValue, newValue >= 8);
    });
  });

  // Sleep and exercise input changes
  document.querySelectorAll('.sleep-hours, .exercise-minutes').forEach(input => {
    input.addEventListener('input', async (e) => {
      const habitItem = e.target.closest('.habit-item');
      const habitType = habitItem.dataset.habit;
      const value = parseFloat(e.target.value) || 0;
      const target = habitType === 'sleep' ? 7 : 30;
      const completed = value >= target;

      await updateHabit(habitType, value, completed);
    });
  });

  // Meditation buttons
  document.querySelectorAll('.meditation-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const duration = parseInt(btn.dataset.duration);
      startQuickMeditation(duration);
    });
  });
}

// Add meditation modal event listeners
function addMeditationEventListeners() {
  // Close modal
  closeMeditationBtn.addEventListener('click', closeMeditationModal);

  // Close on outside click
  meditationModal.addEventListener('click', (e) => {
    if (e.target === meditationModal) {
      closeMeditationModal();
    }
  });

  // Meditation type selection
  meditationTypes.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const duration = parseInt(btn.dataset.duration);
      startGuidedMeditation(type, duration);
    });
  });

  // Play/Pause button
  playPauseBtn.addEventListener('click', toggleMeditationPause);

  // Stop button
  stopMeditationBtn.addEventListener('click', stopMeditation);

  // Done button
  meditationDoneBtn.addEventListener('click', closeMeditationModal);
}

function initializeDefaultHabits() {
  if (!currentHabits || Object.keys(currentHabits).length === 0) {
    currentHabits = {
      hydration: { value: 0, completed: false },
      sleep: { value: 0, completed: false },
      exercise: { value: 0, completed: false },
      meditation: { value: 0, completed: false }
    };
    console.log('Initialized default habits:', currentHabits);
  }
}

// Load today's habits
async function loadTodayHabits() {
  console.log('Loading today habits for user:', currentUser?.uid);

  if (!currentUser) {
    console.error('No current user available');
    initializeDefaultHabits();
    updateHabitDisplay();
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Loading habits for date:', today);

    // Try Firestore first
    const habitsRef = doc(db, "users", currentUser.uid, "habits", today);
    const habitsSnap = await getDoc(habitsRef);

    if (habitsSnap.exists()) {
      console.log('Found habits in Firestore:', habitsSnap.data());
      currentHabits = habitsSnap.data().habits || {};

      // IMPORTANT: Ensure all habit types exist
      const defaultHabits = {
        hydration: { value: 0, completed: false },
        sleep: { value: 0, completed: false },
        exercise: { value: 0, completed: false },
        meditation: { value: 0, completed: false }
      };

      // Merge with defaults to ensure all habits exist
      currentHabits = { ...defaultHabits, ...currentHabits };

    } else {
      console.log('No habits found in Firestore, initializing defaults');
      initializeDefaultHabits();
    }

    // Always update display after loading
    updateHabitDisplay();
    updateHabitProgress();

  } catch (error) {
    console.error('Error loading habits:', error);
    initializeDefaultHabits();
    updateHabitDisplay();
    updateHabitProgress();
    showMessage('Using offline mode - data will sync when connection is restored', 'warning');
  }
}

// Update habit in database and display
async function updateHabit(habitType, value, completed) {
  try {
    // Store previous completion state for streak calculation
    const wasAllCompleted = areAllHabitsCompleted();

    // Update local state
    currentHabits[habitType] = { value, completed };

    // Update display immediately
    updateHabitDisplay();
    updateHabitProgress();

    const today = new Date().toISOString().split('T')[0];

    console.log('Saving habit to Firestore:', { habitType, value, completed, today });

    try {
      // Save the specific habit
      const habitRef = doc(db, "users", currentUser.uid, "habitEntries", `${today}_${habitType}`);
      await setDoc(habitRef, {
        type: habitType,
        value: value,
        completed: completed,
        date: today,
        updatedAt: Timestamp.now(),
        userId: currentUser.uid
      });

      // Also save the complete habits summary
      const summaryRef = doc(db, "users", currentUser.uid, "habits", today);
      await setDoc(summaryRef, {
        habits: currentHabits,
        date: today,
        updatedAt: Timestamp.now(),
        userId: currentUser.uid
      }, { merge: true });

      console.log('Successfully saved to Firestore');

    } catch (firestoreError) {
      console.error('Firestore save failed:', firestoreError);
      showMessage('Failed to save to cloud, using local storage', 'error');

      // Fallback to localStorage
      const habitData = JSON.parse(localStorage.getItem(`habits_${currentUser.uid}`) || '{}');
      habitData[today] = currentHabits;
      localStorage.setItem(`habits_${currentUser.uid}`, JSON.stringify(habitData));
    }

    // FIX: Only update streak when ALL habits are completed AND it wasn't completed before
    const isNowAllCompleted = areAllHabitsCompleted();
    if (isNowAllCompleted && !wasAllCompleted) {
      console.log('All habits completed for the first time today - updating streak');
      await updateHabitStreak();
    }

    // Add completion animation
    if (completed) {
      addHabitCompletionAnimation(habitType);
    }

  } catch (error) {
    console.error('Error updating habit:', error);
    showMessage('Error saving habit progress', 'error');
  }
}

// Update habit display
function updateHabitDisplay() {
  console.log('Updating habit display with:', currentHabits);

  // Hydration
  const hydrationItem = document.querySelector('.habit-item[data-habit="hydration"]');
  if (hydrationItem) {
    const glassesCount = hydrationItem.querySelector('.glasses-count');
    const value = currentHabits.hydration?.value || 0;
    if (glassesCount) {
      glassesCount.textContent = `${value}/8`;
    }

    if (currentHabits.hydration?.completed) {
      hydrationItem.classList.add('completed');
    } else {
      hydrationItem.classList.remove('completed');
    }
  }

  // Sleep
  const sleepItem = document.querySelector('.habit-item[data-habit="sleep"]');
  if (sleepItem) {
    const sleepInput = sleepItem.querySelector('.sleep-hours');
    const sleepButton = sleepItem.querySelector('.toggle-habit');
    const value = currentHabits.sleep?.value || 0;

    if (sleepInput && value > 0) sleepInput.value = value;

    if (currentHabits.sleep?.completed) {
      sleepItem.classList.add('completed');
      if (sleepButton) sleepButton.classList.add('completed');
    } else {
      sleepItem.classList.remove('completed');
      if (sleepButton) sleepButton.classList.remove('completed');
    }
  }

  // Exercise
  const exerciseItem = document.querySelector('.habit-item[data-habit="exercise"]');
  if (exerciseItem) {
    const exerciseInput = exerciseItem.querySelector('.exercise-minutes');
    const exerciseButton = exerciseItem.querySelector('.toggle-habit');
    const value = currentHabits.exercise?.value || 0;

    if (exerciseInput && value > 0) exerciseInput.value = value;

    if (currentHabits.exercise?.completed) {
      exerciseItem.classList.add('completed');
      if (exerciseButton) exerciseButton.classList.add('completed');
    } else {
      exerciseItem.classList.remove('completed');
      if (exerciseButton) exerciseButton.classList.remove('completed');
    }
  }

  // Meditation
  const meditationItem = document.querySelector('.habit-item[data-habit="meditation"]');
  if (meditationItem) {
    const meditationButton = meditationItem.querySelector('.toggle-habit');

    if (currentHabits.meditation?.completed) {
      meditationItem.classList.add('completed');
      if (meditationButton) meditationButton.classList.add('completed');
    } else {
      meditationItem.classList.remove('completed');
      if (meditationButton) meditationButton.classList.remove('completed');
    }
  }
}

// Update habit progress
function updateHabitProgress() {
  const totalHabits = 4;
  const completedHabits = Object.values(currentHabits).filter(habit => habit.completed).length;
  const percentage = Math.round((completedHabits / totalHabits) * 100);

  // Update progress bar
  if (dailyProgressEl) {
    dailyProgressEl.style.width = `${percentage}%`;
  }

  // Update percentage text
  if (progressPercentageEl) {
    progressPercentageEl.textContent = `${percentage}%`;
  }
}

// Check if all habits are completed
function areAllHabitsCompleted() {
  return Object.values(currentHabits).every(habit => habit.completed);
}

// Load habit streak
async function loadHabitStreak() {
  try {
    console.log('Loading habit streak for user:', currentUser.uid);

    const streakRef = doc(db, "users", currentUser.uid, "profile", "streak");
    const streakSnap = await getDoc(streakRef);

    const today = new Date().toISOString().split('T')[0];
    let lastUpdated = null;

    if (streakSnap.exists()) {
      const data = streakSnap.data();
      habitStreak = data.currentStreak || 0;
      lastUpdated = data.lastUpdated || null;
      console.log('Loaded streak from Firestore:', habitStreak);

      if (lastUpdated && lastUpdated !== today) {
        const lastUpdateDate = new Date(lastUpdated);
        const todayDate = new Date(today);
        const daysDifference = Math.floor((todayDate - lastUpdateDate) / (24 * 60 * 60 * 1000));

        if (daysDifference >= 1) {
          showMissedDaysModal(daysDifference); // Show popup modal if user missed days
        }
      }
    } else {
      console.log('No streak found in Firestore, starting fresh');
      habitStreak = 0;
    }

    if (currentStreakEl) {
      currentStreakEl.textContent = habitStreak;
    }

  } catch (error) {
    console.error('Error loading habit streak:', error);
    habitStreak = 0;
    if (currentStreakEl) {
      currentStreakEl.textContent = '0';
    }
  }
}


function showMissedDaysModal(daysMissed) {
  const modal = document.getElementById('missedDaysModal');
  const closeBtn = document.getElementById('closeMissedModal');
  const acknowledgeBtn = document.getElementById('acknowledgeBtn');
  const messageEl = document.getElementById('missedMessage');

  if (daysMissed === 1) {
    messageEl.textContent = `You missed your habit streak yesterday. Let's restart! 💪`;
  } else {
    messageEl.textContent = `You missed your habit streak for ${daysMissed} days. You can bounce back! 🚀`;
  }

  modal.style.display = 'flex';

  closeBtn.onclick = () => modal.style.display = 'none';
  acknowledgeBtn.onclick = () => modal.style.display = 'none';

  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  };
}



// Update habit streak
async function updateHabitStreak() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Check if today's streak was already counted
    let streakData = null;
    try {
      const streakRef = doc(db, "users", currentUser.uid, "profile", "streak");
      const streakSnap = await getDoc(streakRef);

      if (streakSnap.exists()) {
        streakData = streakSnap.data();

        // If already updated today, don't update again
        if (streakData.lastUpdated === today) {
          console.log('Streak already updated today');
          return;
        }
      }
    } catch (error) {
      console.warn('Could not check existing streak data');
    }

    let newStreak = 1; // Start with 1 for today
    let streakBroken = false;
    let daysMissed = 0;

    let previousStreak = streakData?.currentStreak || 0;

    // Check yesterday's completion for continuity
    // If we have previous streak data
    if (streakData && streakData.lastUpdated) {
      const lastUpdateDate = new Date(streakData.lastUpdated);
      const todayDate = new Date(today);
      const daysDifference = Math.floor((todayDate - lastUpdateDate) / (24 * 60 * 60 * 1000));

      if (daysDifference === 1) {
        // Consecutive day - continue streak
        newStreak = previousStreak + 1;
      } else if (daysDifference > 1) {
        // Gap in streak - it's broken
        streakBroken = true;
        daysMissed = daysDifference - 1;
        newStreak = 1; // Reset to 1 for today
      }
    } else {
      // Check if yesterday was actually completed
      try {
        const yesterdayRef = doc(db, "users", currentUser.uid, "habits", yesterday);
        const yesterdaySnap = await getDoc(yesterdayRef);

        if (yesterdaySnap.exists()) {
          const yesterdayHabits = yesterdaySnap.data().habits || {};
          const yesterdayCompleted = Object.values(yesterdayHabits).every(habit => habit.completed);

          if (yesterdayCompleted) {
            newStreak = (habitStreak || 0) + 1;
          }
        }
      } catch (error) {
        console.warn('Could not check yesterday habits, starting new streak');
      }
    }

    habitStreak = newStreak;

    // Save to database
    try {
      const streakRef = doc(db, "users", currentUser.uid, "profile", "streak");
      await setDoc(streakRef, {
        currentStreak: habitStreak,
        lastUpdated: today,
        updatedAt: Timestamp.now(),
        totalDaysCompleted: (streakData?.totalDaysCompleted || 0) + 1
      }, { merge: true });

      console.log('Streak updated successfully:', habitStreak);
    } catch (firestoreError) {
      // Fallback to localStorage
      localStorage.setItem(`habitStreak_${currentUser.uid}`, habitStreak.toString());
      localStorage.setItem(`habitStreakDate_${currentUser.uid}`, today);
    }

    // Update display
    if (currentStreakEl) {
      currentStreakEl.textContent = habitStreak;
    }

    // Show celebration for milestones
    // Show appropriate message based on streak status
    if (streakBroken && previousStreak > 0) {
      if (daysMissed === 1) {
        showNotification(`💔 Your ${previousStreak}-day streak was broken by missing yesterday. Starting fresh with day 1! 💪`, 'warning');
      } else {
        showNotification(`💔 Your ${previousStreak}-day streak was broken after missing ${daysMissed} days. Back to day 1 - you've got this! 🌟`, 'warning');
      }
    } else if (habitStreak % 7 === 0 && habitStreak > 0) {
      showNotification(`🎉 ${habitStreak} day streak! Amazing consistency!`, 'success');
    } else if (habitStreak > 1) {
      showNotification(`🔥 ${habitStreak} day streak!`, 'success');
    } else {
      showNotification(`🌟 Great job completing all habits today!`, 'success');
    }


  } catch (error) {
    console.error('Error updating habit streak:', error);
  }
}

// Add habit completion animation
function addHabitCompletionAnimation(habitType) {
  const habitItem = document.querySelector(`.habit-item[data-habit="${habitType}"]`);
  if (habitItem) {
    // Add sparkle effect
    const sparkle = document.createElement('div');
    sparkle.innerHTML = '✨';
    sparkle.style.position = 'absolute';
    sparkle.style.fontSize = '2rem';
    sparkle.style.pointerEvents = 'none';
    sparkle.style.animation = 'sparkle 1s ease-out forwards';
    sparkle.style.zIndex = '1000';

    const rect = habitItem.getBoundingClientRect();
    sparkle.style.left = `${rect.right - 50}px`;
    sparkle.style.top = `${rect.top + 10}px`;

    document.body.appendChild(sparkle);

    // Remove sparkle after animation
    setTimeout(() => {
      if (sparkle.parentNode) {
        sparkle.parentNode.removeChild(sparkle);
      }
    }, 1000);
  }
}

// Quick meditation functions
function startQuickMeditation(duration) {
  currentMeditationType = 'quick';
  meditationDuration = duration * 60; // Convert to seconds
  meditationTimeLeft = meditationDuration;

  showMeditationModal();
  showMeditationSession();
  startMeditationTimer();

  // Update meditation title and instruction
  meditationTitleEl.textContent = `${duration} Minute Meditation`;
  meditationInstructionEl.textContent = 'Close your eyes and focus on your breathing...';
}

// Guided meditation functions
function startGuidedMeditation(type, duration) {
  currentMeditationType = type;
  meditationDuration = duration * 60; // Convert to seconds
  meditationTimeLeft = meditationDuration;

  showMeditationSession();
  startMeditationTimer();
  startGuidedInstructions(type);

  // Update meditation title
  const titles = {
    'breathing': 'Breathing Focus',
    'body-scan': 'Body Scan Meditation',
    'mindfulness': 'Mindfulness Meditation',
    'loving-kindness': 'Loving Kindness Meditation'
  };

  meditationTitleEl.textContent = titles[type] || 'Meditation';
}

// Start guided instructions
function startGuidedInstructions(type) {
  const instructions = meditationInstructions[type] || meditationInstructions.breathing;
  let currentInstruction = 0;
  const instructionInterval = Math.floor(meditationDuration / instructions.length);

  // Set initial instruction
  meditationInstructionEl.textContent = instructions[0];

  // Change instructions periodically
  const instructionTimer = setInterval(() => {
    if (meditationTimer && !meditationPaused && currentInstruction < instructions.length - 1) {
      currentInstruction++;
      meditationInstructionEl.textContent = instructions[currentInstruction];
    } else if (!meditationTimer) {
      clearInterval(instructionTimer);
    }
  }, instructionInterval * 1000);
}

// Show meditation modal
function showMeditationModal() {
  meditationModal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

// Close meditation modal
function closeMeditationModal() {
  meditationModal.classList.remove('show');
  document.body.style.overflow = 'auto';

  // Stop meditation if active
  if (meditationTimer) {
    stopMeditation();
  }

  // Reset modal state
  meditationSetup.style.display = 'block';
  meditationSession.style.display = 'none';
  meditationComplete.style.display = 'none';
}

// Show meditation session
function showMeditationSession() {
  meditationSetup.style.display = 'none';
  meditationSession.style.display = 'block';
  meditationComplete.style.display = 'none';
}

// Start meditation timer
function startMeditationTimer() {
  // Clear any existing timer first
  if (meditationTimer) {
    clearInterval(meditationTimer);
  }

  meditationPaused = false;
  playPauseBtn.textContent = '⏸️ Pause';

  // Update progress ring
  const circumference = 2 * Math.PI * 54; // radius = 54
  progressRingCircle.style.strokeDasharray = circumference;
  progressRingCircle.style.strokeDashoffset = 0;

  // Update display immediately
  const minutes = Math.floor(meditationTimeLeft / 60);
  const seconds = meditationTimeLeft % 60;
  timerMinutesEl.textContent = minutes.toString().padStart(2, '0');
  timerSecondsEl.textContent = seconds.toString().padStart(2, '0');

  meditationTimer = setInterval(() => {
    if (!meditationPaused && meditationTimeLeft > 0) {
      meditationTimeLeft--;

      // Update timer display
      const minutes = Math.floor(meditationTimeLeft / 60);
      const seconds = meditationTimeLeft % 60;
      timerMinutesEl.textContent = minutes.toString().padStart(2, '0');
      timerSecondsEl.textContent = seconds.toString().padStart(2, '0');

      // Update progress ring
      const progress = (meditationDuration - meditationTimeLeft) / meditationDuration;
      const offset = circumference * (1 - progress);
      progressRingCircle.style.strokeDashoffset = offset;

      // Check if meditation is complete
      if (meditationTimeLeft <= 0) {
        completeMeditation();
      }
    }
  }, 1000);
}


// Toggle meditation pause
function toggleMeditationPause() {
  if (meditationTimer) {
    meditationPaused = !meditationPaused;
    playPauseBtn.textContent = meditationPaused ? '▶️ Resume' : '⏸️ Pause';
  }
}

// Stop meditation
function stopMeditation() {
  if (meditationTimer) {
    clearInterval(meditationTimer);
    meditationTimer = null;
  }

  // Reset state
  meditationPaused = false;
  playPauseBtn.textContent = '▶️ Play';

  // Show setup screen
  meditationSetup.style.display = 'block';
  meditationSession.style.display = 'none';
  meditationComplete.style.display = 'none';
}

// Complete meditation
async function completeMeditation() {
  if (meditationTimer) {
    clearInterval(meditationTimer);
    meditationTimer = null;
  }

  // Show completion screen
  meditationSession.style.display = 'none';
  meditationComplete.style.display = 'block';

  // Update meditation habit
  const meditationTime = Math.floor((meditationDuration - meditationTimeLeft) / 60);
  const currentValue = currentHabits.meditation?.value || 0;
  await updateHabit('meditation', currentValue + meditationTime, true);

  // FIX: Create a single, short beep sound that stops properly
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // IMPORTANT: Close the audio context after use to prevent continuous playing
    setTimeout(() => {
      audioContext.close();
    }, 600);

  } catch (error) {
    console.log('Audio not available, skipping completion sound');
  }

  // Show success notification
  showNotification('🧘 Meditation completed! Great job!', 'success');
}

// Add CSS for sparkle animation
function addSparkleAnimation() {
  if (!document.getElementById('sparkle-animation')) {
    const style = document.createElement('style');
    style.id = 'sparkle-animation';
    style.textContent = `
      @keyframes sparkle {
        0% {
          transform: scale(0) rotate(0deg);
          opacity: 1;
        }
        50% {
          transform: scale(1.2) rotate(180deg);
          opacity: 1;
        }
        100% {
          transform: scale(0) rotate(360deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize habit tracker when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard DOM loaded');

  // Only handle demo user creation if no real auth is happening
  if (!auth.currentUser) {
    // The onAuthStateChanged will handle everything else
    console.log('Waiting for authentication...');
  }
});

// Export functions for use in other modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeHabitTracker,
    updateHabit,
    startQuickMeditation,
    startGuidedMeditation
  };
}

// Authentication State Observer
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // For demo purposes, we'll create a mock user instead of redirecting
    currentUser = { uid: 'demo-user', email: 'demo@example.com' };
    usernameEl.textContent = 'demo';
  } else {
    currentUser = user;
    usernameEl.textContent = user.email.split("@")[0];
  }

  // Set today's date as default
  const today = new Date().toISOString().split("T")[0];
  journalDatePicker.value = today;

  await loadUserData();
  fetchAISuggestions(currentUser.uid);
  // FIX: Initialize habit tracker AFTER user is authenticated and data is loaded
  addSparkleAnimation();
  console.log('Initializing habit tracker for user:', currentUser.uid);
  await initializeHabitTracker(); // Make this await

  createParticles();
});

// Profile dropdown functionality
profilePic.addEventListener("click", (e) => {
  e.stopPropagation();
  profileDropdown.classList.remove("hidden");
  profileDropdown.classList.add("show");
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!profileDropdown.contains(e.target) && e.target !== profilePic) {
    profileDropdown.classList.remove("show");
    profileDropdown.classList.add("hidden");
  }
});


// Upload photo option
uploadOption.addEventListener("click", () => {
  uploadInput.click();
  profileDropdown.classList.remove("show");
  profileDropdown.classList.add("hidden");
});

// Logout functionality
logoutBtn.addEventListener("click", async () => {
  try {
    if (auth.currentUser) {
      await signOut(auth);
    }
    showMessage("Logged out successfully!", "success");
    setTimeout(() => window.location.href = "/", 500);
  } catch (error) {
    showMessage("Error logging out: " + error.message, "error");
  }
});

// FIXED: Upload Profile Image with proper Firebase integration and reset functionality
uploadInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showMessage("Please select a valid image file", "error");
    // Reset the input so the same file can be selected again
    uploadInput.value = '';
    return;
  }

  // Validate file size (5MB limit)
  if (file.size > 5 * 1024 * 1024) {
    showMessage("File size must be less than 5MB", "error");
    // Reset the input so the same file can be selected again
    uploadInput.value = '';
    return;
  }

  // Show loading message
  showMessage("Uploading profile photo...", "info");

  try {
    // Convert file to base64
    const photoURL = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    console.log("Photo converted to base64, size:", photoURL.length);

    // Update profile pic immediately for better UX
    profilePic.src = photoURL;



    // Create user document data
    const userData = {
      uid: currentUser.uid,
      email: currentUser.email || 'demo@example.com',
      displayName: currentUser.displayName || usernameEl.textContent,
      photoURL: photoURL,
      updatedAt: Timestamp.now(),
      lastPhotoUpdate: new Date().toISOString(),
      photoSize: photoURL.length,
      fileName: file.name,
      fileType: file.type,
      uploadCount: (await getUserUploadCount()) + 1 // Track upload count
    };

    console.log("Saving to Firestore:", {
      uid: userData.uid,
      email: userData.email,
      photoSize: userData.photoSize,
      fileName: userData.fileName,
      uploadCount: userData.uploadCount
    });

    // Save to Firestore
    const userDocRef = doc(db, "users", currentUser.uid);
    await setDoc(userDocRef, userData, { merge: true });

    console.log("Successfully saved to Firestore");

    // Also save to localStorage as backup
    localStorage.setItem(`profilePhoto_${currentUser.uid}`, photoURL);

    // Verify the save by reading back
    const verificationDoc = await getDoc(userDocRef);
    if (verificationDoc.exists() && verificationDoc.data().photoURL) {
      console.log("Verification successful - photo found in database");
      showMessage("Profile photo uploaded successfully!", "success");
    } else {
      throw new Error("Verification failed - photo not found in database");
    }

    // Important: Reset the input value so the same file can be selected again
    uploadInput.value = '';

  } catch (error) {
    console.error("Error uploading photo:", error);
    showMessage("Error uploading photo: " + error.message, "error");

    // Reset the input on error
    uploadInput.value = '';

    // Revert profile pic on error
    await loadProfilePicture();
  }
});

// Helper function to get current upload count
async function getUserUploadCount() {
  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists() && userDoc.data().uploadCount) {
      return userDoc.data().uploadCount;
    }
    return 0;
  } catch (error) {
    console.error("Error getting upload count:", error);
    return 0;
  }
}

// Mood form submission
moodForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const mood = moodSelect.value;
  if (!mood) {
    showMessage("Please select a mood", "error");
    return;
  }

  try {
    const date = new Date().toISOString().split("T")[0];

    // Store in localStorage for demo
    const moodData = JSON.parse(localStorage.getItem('moods') || '{}');
    moodData[date] = {
      mood,
      timestamp: new Date().toISOString(),
      date
    };
    localStorage.setItem('moods', JSON.stringify(moodData));

    // Save to Firestore
    await setDoc(doc(db, "users", currentUser.uid, "moods", date), {
      mood,
      timestamp: Timestamp.now(),
      date,
      uid: currentUser.uid
    });

    showMessage("Mood saved successfully!", "success");
    moodSelect.value = "";
    await loadMoodChart();
  } catch (error) {
    showMessage("Error saving mood: " + error.message, "error");
  }
});

// Journal form submission
journalForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const selectedDate = journalDatePicker.value;
  const text = journalText.value.trim();

  if (!text) {
    showMessage("Please write something in your journal", "error");
    return;
  }

  try {
    // Store in localStorage for demo
    const journalData = JSON.parse(localStorage.getItem('journals') || '{}');
    journalData[selectedDate] = {
      text,
      timestamp: new Date().toISOString(),
      date: selectedDate
    };
    localStorage.setItem('journals', JSON.stringify(journalData));

    // Save to Firestore
    await setDoc(doc(db, "users", currentUser.uid, "journals", selectedDate), {
      text,
      timestamp: Timestamp.now(),
      date: selectedDate,
      uid: currentUser.uid
    });

    showMessage("Journal entry saved!", "success");
    await loadJournalEntries();
  } catch (error) {
    showMessage("Error saving journal: " + error.message, "error");
  }
});

// Date picker change handler
journalDatePicker.addEventListener("change", async () => {
  const selectedDate = journalDatePicker.value;
  const today = new Date().toISOString().split("T")[0];

  if (selectedDate === today) {
    journalText.disabled = false;
    journalText.placeholder = "Write your thoughts for today...";
  } else {
    journalText.disabled = true;
    journalText.placeholder = "You can only edit today's journal entry";
  }

  await loadJournalEntry(selectedDate);
});

// Chart navigation
prevWeekBtn.addEventListener("click", () => {
  currentWeekOffset++;
  loadMoodChart();
});

nextWeekBtn.addEventListener("click", () => {
  if (currentWeekOffset > 0) {
    currentWeekOffset--;
    loadMoodChart();
  }
});

// Load user data
async function loadUserData() {
  await Promise.all([
    loadProfilePicture(),
    loadMoodChart(),
    loadJournalEntries(),
    loadTodayJournal()
  ]);
}

// FIXED: Load profile picture with better error handling
async function loadProfilePicture() {
  try {
    console.log("Loading profile picture for user:", currentUser.uid);

    // Try to load from Firestore first
    const userDocRef = doc(db, "users", currentUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log("User document found in Firestore");

      if (userData.photoURL) {
        console.log("Photo URL found in database, loading...");
        profilePic.src = userData.photoURL;
        // Update localStorage cache
        localStorage.setItem(`profilePhoto_${currentUser.uid}`, userData.photoURL);
        console.log("Profile picture loaded successfully from Firestore");
        return;
      }
    }

    // Fallback to localStorage
    const cachedPhoto = localStorage.getItem(`profilePhoto_${currentUser.uid}`);
    if (cachedPhoto) {
      console.log("Loading profile picture from localStorage cache");
      profilePic.src = cachedPhoto;
    } else {
      console.log("No profile picture found, using default");
    }

  } catch (error) {
    console.error("Error loading profile picture:", error);

    // Final fallback to localStorage
    const cachedPhoto = localStorage.getItem(`profilePhoto_${currentUser.uid}`);
    if (cachedPhoto) {
      console.log("Using localStorage fallback due to error");
      profilePic.src = cachedPhoto;
    }
  }
}

// Load today's journal entry
async function loadTodayJournal() {
  const today = new Date().toISOString().split("T")[0];
  await loadJournalEntry(today);
}

// Load journal entry for specific date
async function loadJournalEntry(date) {
  try {
    let journalText_value = "";

    // Try Firestore first
    const journalRef = doc(db, "users", currentUser.uid, "journals", date);
    const journalSnap = await getDoc(journalRef);

    if (journalSnap.exists()) {
      journalText_value = journalSnap.data().text;
    } else {
      // Fallback to localStorage
      const journalData = JSON.parse(localStorage.getItem('journals') || '{}');
      if (journalData[date]) {
        journalText_value = journalData[date].text;
      }
    }

    journalText.value = journalText_value;

  } catch (error) {
    console.error("Error loading journal entry:", error);

    // Fallback to localStorage on error
    const journalData = JSON.parse(localStorage.getItem('journals') || '{}');
    journalText.value = journalData[date] ? journalData[date].text : "";
  }
}

// Load journal entries for display
async function loadJournalEntries() {
  try {
    let allEntries = [];

    // Try Firestore first
    const journalsRef = collection(db, "users", currentUser.uid, "journals");
    const q = query(journalsRef, orderBy("date", "desc"), limit(10));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      querySnapshot.forEach((doc) => {
        allEntries.push(doc.data());
      });
    } else {
      // Fallback to localStorage
      const journalData = JSON.parse(localStorage.getItem('journals') || '{}');
      allEntries = Object.values(journalData).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    }

    journalView.innerHTML = "";

    if (allEntries.length === 0) {
      journalView.innerHTML = `
        <div class="journal-entry">
          <div class="journal-content">No journal entries yet. Start writing your first entry!</div>
        </div>
      `;
      return;
    }

    allEntries.forEach((data) => {
      const entryElement = document.createElement("div");
      entryElement.className = "journal-entry";
      entryElement.innerHTML = `
        <div class="journal-date">${formatDate(data.date)}</div>
        <div class="journal-content">${data.text}</div>
      `;
      journalView.appendChild(entryElement);
    });

  } catch (error) {
    console.error("Error loading journal entries:", error);

    // Fallback to localStorage on error
    const journalData = JSON.parse(localStorage.getItem('journals') || '{}');
    const entries = Object.values(journalData).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    journalView.innerHTML = "";

    if (entries.length === 0) {
      journalView.innerHTML = `
        <div class="journal-entry">
          <div class="journal-content">No journal entries yet. Start writing your first entry!</div>
        </div>
      `;
    } else {
      entries.forEach((data) => {
        const entryElement = document.createElement("div");
        entryElement.className = "journal-entry";
        entryElement.innerHTML = `
          <div class="journal-date">${formatDate(data.date)}</div>
          <div class="journal-content">${data.text}</div>
        `;
        journalView.appendChild(entryElement);
      });
    }
  }
}

// Load mood chart
async function loadMoodChart() {
  try {
    let allMoods = [];

    // Try Firestore first
    const moodsRef = collection(db, "users", currentUser.uid, "moods");
    const q = query(moodsRef, orderBy("date", "asc"));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      querySnapshot.forEach((doc) => {
        allMoods.push(doc.data());
      });
    } else {
      // Fallback to localStorage
      const moodData = JSON.parse(localStorage.getItem('moods') || '{}');
      allMoods = Object.values(moodData).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // Get current week data (7 days)
    const startIndex = Math.max(0, allMoods.length - 7 - (currentWeekOffset * 7));
    const endIndex = Math.max(7, allMoods.length - (currentWeekOffset * 7));
    const weekMoods = allMoods.slice(startIndex, endIndex);

    // Update navigation buttons
    nextWeekBtn.disabled = currentWeekOffset === 0;
    prevWeekBtn.disabled = startIndex === 0;

    const labels = weekMoods.map(mood => formatDate(mood.date));
    const moodValues = weekMoods.map(mood => getMoodValue(mood.mood));

    // Destroy existing chart
    if (moodChart) {
      moodChart.destroy();
    }

    // Create new chart
    const ctx = moodChartCanvas.getContext("2d");
    moodChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Mood Level',
          data: moodValues,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#00d4ff',
          pointBorderColor: '#ffffff',
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: 'white',
            bodyColor: 'white',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            callbacks: {
              label: function (context) {
                const moodNames = ['', 'Angry', 'Sad', 'Anxious', 'Tired', 'Calm', 'Content', 'Happy', 'Peaceful', 'Excited', 'Energetic'];
                return `Mood: ${moodNames[context.parsed.y]} (${context.parsed.y}/10)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)'
            }
          },
          y: {
            min: 0,
            max: 10,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              stepSize: 1,
              color: 'rgba(255, 255, 255, 0.8)',
              callback: function (value) {
                const moodLabels = ['😡', '😢', '😰', '😴', '😌', '😊', '😀', '😇', '🤩', '⚡'];
                return moodLabels[value - 1] || '';
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error("Error loading mood chart:", error);

    // Fallback to localStorage on error
    const moodData = JSON.parse(localStorage.getItem('moods') || '{}');
    const allMoods = Object.values(moodData).sort((a, b) => new Date(a.date) - new Date(b.date));

    const startIndex = Math.max(0, allMoods.length - 7 - (currentWeekOffset * 7));
    const endIndex = Math.max(7, allMoods.length - (currentWeekOffset * 7));
    const weekMoods = allMoods.slice(startIndex, endIndex);

    nextWeekBtn.disabled = currentWeekOffset === 0;
    prevWeekBtn.disabled = startIndex === 0;

    const labels = weekMoods.map(mood => formatDate(mood.date));
    const moodValues = weekMoods.map(mood => getMoodValue(mood.mood));

    if (moodChart) {
      moodChart.destroy();
    }

    const ctx = moodChartCanvas.getContext("2d");
    moodChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Mood Level',
          data: moodValues,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#00d4ff',
          pointBorderColor: '#ffffff',
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)'
            }
          },
          y: {
            min: 0,
            max: 10,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              stepSize: 1,
              color: 'rgba(255, 255, 255, 0.8)'
            }
          }
        }
      }
    });
  }
}

// Helper function to convert mood to numeric value
function getMoodValue(mood) {
  const moodMap = {
    'angry': 1,
    'sad': 2,
    'anxious': 3,
    'tired': 4,
    'calm': 5,
    'content': 6,
    'happy': 7,
    'peaceful': 8,
    'excited': 9,
    'energetic': 10
  };
  return moodMap[mood] || 5;
}

// Helper function to format date
function formatDate(dateString) {
  const date = new Date(dateString);
  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  };
  return date.toLocaleDateString('en-US', options);
}

// Show message to user
function showMessage(message, type = 'info') {
  // Remove existing messages
  const existingMessages = document.querySelectorAll('.message');
  existingMessages.forEach(msg => msg.remove());

  // Create new message
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 12px;
    color: white;
    font-weight: 600;
    z-index: 10000;
    max-width: 300px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    animation: slideIn 0.3s ease-out;
  `;

  // Set background color based on type
  switch (type) {
    case 'success':
      messageElement.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      break;
    case 'error':
      messageElement.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
      break;
    default:
      messageElement.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
  }

  messageElement.textContent = message;

  // Add slide-in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(messageElement);

  // Remove message after 5 seconds
  setTimeout(() => {
    messageElement.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => messageElement.remove(), 300);
  }, 5000);
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard initialized');

  // Debug: Check Firebase connection
  console.log('Firebase app:', app);
  console.log('Firestore instance:', db);
  console.log('Auth instance:', auth);

  // Trigger auth state change for demo
  if (!currentUser) {
    setTimeout(() => {
      currentUser = {
        uid: 'demo-user-' + Date.now(), // Make it unique
        email: 'demo@example.com'
      };
      usernameEl.textContent = 'demo';

      console.log('Demo user created:', currentUser);

      const today = new Date().toISOString().split("T")[0];
      journalDatePicker.value = today;

      loadUserData();
      createParticles();

      // IMPORTANT: Initialize habit tracker after user is set
      setTimeout(() => {
        console.log('Initializing habit tracker for demo user');
        initializeHabitTracker();
      }, 500);
    }, 100);
  }
});

// 🔹 Anonymous Peer Support Chat 🔹
// Full JavaScript Code with Lazy Loading Like WhatsApp
// import { getDatabase, ref as dbRef, push, get, onChildAdded } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js";

const Db = getDatabase();
const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const sendChat = document.getElementById('send-chat');
const chatRoomSelector = document.getElementById('chat-room-selector');

let currentRoom = chatRoomSelector.value;
let loadedDates = new Set();
let oldestLoadedDate = new Date(); // Track the oldest date we've loaded
let allMessages = new Map(); // Store all messages by date

// Format date to YYYY-MM-DD
function getFormattedDate(date) {
  return date.toISOString().split('T')[0];
}

// Format date for display
function getDisplayDate(dateString) {
  const today = getFormattedDate(new Date());
  const yesterday = getFormattedDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

  if (dateString === today) return 'Today';
  if (dateString === yesterday) return 'Yesterday';

  // Format as readable date
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Load messages for a specific date
function loadMessagesForDate(date) {
  return new Promise((resolve) => {
    const dateKey = getFormattedDate(date);

    if (loadedDates.has(dateKey)) {
      resolve();
      return;
    }

    loadedDates.add(dateKey);
    const chatRef = dbRef(Db, `peer-chat/${currentRoom}/${dateKey}`);

    // Get all messages for this date at once (Firebase v9+ syntax)
    get(chatRef).then((snapshot) => {
      const messages = [];

      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          const msgData = childSnapshot.val();
          messages.push({
            ...msgData,
            id: childSnapshot.key,
            date: dateKey
          });
        });

        // Sort messages by timestamp
        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      }

      allMessages.set(dateKey, messages);
      resolve();
    }).catch((error) => {
      console.error('Error loading messages:', error);
      resolve();
    });
  });
}

// Render all messages in correct order
function renderAllMessages() {
  chatWindow.innerHTML = '';

  // Get all loaded dates and sort them (oldest first)
  const sortedDates = Array.from(loadedDates).sort();

  sortedDates.forEach(dateKey => {
    const messages = allMessages.get(dateKey) || [];

    if (messages.length > 0) {
      // Add date header
      const dateLabel = document.createElement('div');
      dateLabel.textContent = getDisplayDate(dateKey);
      dateLabel.style.cssText = `
                text-align: center;
                margin: 15px 0 10px 0;
                font-size: 11px;
                color: rgba(255, 255, 255, 0.7);
                font-weight: normal;
            `;
      chatWindow.appendChild(dateLabel);

      // Add messages for this date
      messages.forEach(msgData => {
        const msgContainer = document.createElement('div');
        msgContainer.style.cssText = `
                    margin: 6px 0;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    border-left: 3px solid ${msgData.color || '#00d4ff'};
                `;

        const messageText = document.createElement('div');
        messageText.innerHTML = `<span style="color: ${msgData.color || '#00d4ff'}; font-weight: 600;">${msgData.user || 'User'}</span>: ${msgData.message}`;
        messageText.style.cssText = `
                    color: #fff;
                    font-size: 14px;
                    line-height: 1.4;
                    word-wrap: break-word;
                    margin-bottom: 4px;
                `;

        const timestamp = document.createElement('div');
        timestamp.style.cssText = `
                    font-size: 10px;
                    color: rgba(255, 255, 255, 0.6);
                    text-align: right;
                `;

        if (msgData.timestamp) {
          const time = new Date(msgData.timestamp);
          timestamp.textContent = time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          });
        }

        msgContainer.appendChild(messageText);
        msgContainer.appendChild(timestamp);
        chatWindow.appendChild(msgContainer);
      });
    }
  });
}

// Load messages for today and set up real-time listener
function loadTodayMessages() {
  const today = new Date();
  const todayKey = getFormattedDate(today);

  // Clear existing data
  chatWindow.innerHTML = '';
  loadedDates.clear();
  allMessages.clear();
  oldestLoadedDate = new Date(today);

  // Load today's messages
  loadMessagesForDate(today).then(() => {
    renderAllMessages();
    scrollToBottom();

    // Set up real-time listener for today's messages
    const todayRef = dbRef(Db, `peer-chat/${currentRoom}/${todayKey}`);

    console.log('Setting up listener for:', `peer-chat/${currentRoom}/${todayKey}`); // Debug log

    onChildAdded(todayRef, (snapshot) => {
      console.log('New message received:', snapshot.val()); // Debug log

      const msgData = snapshot.val();
      const newMessage = {
        ...msgData,
        id: snapshot.key,
        date: todayKey
      };

      // Add to our messages store
      const todayMessages = allMessages.get(todayKey) || [];

      // Check if message already exists (to avoid duplicates)
      const exists = todayMessages.some(msg => msg.id === newMessage.id);

      if (!exists) {
        console.log('Adding new message to chat'); // Debug log
        todayMessages.push(newMessage);
        // Sort by timestamp
        todayMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        allMessages.set(todayKey, todayMessages);

        // Re-render messages
        renderAllMessages();
        scrollToBottom();
      } else {
        console.log('Message already exists, skipping'); // Debug log
      }
    });
  });
}

// Load previous day's messages
async function loadPreviousDay() {
  const previousDay = new Date(oldestLoadedDate);
  previousDay.setDate(previousDay.getDate() - 1);

  const previousScrollHeight = chatWindow.scrollHeight;

  await loadMessagesForDate(previousDay);
  renderAllMessages();

  // Update oldest loaded date
  oldestLoadedDate = previousDay;

  // Restore scroll position
  chatWindow.scrollTop = chatWindow.scrollHeight - previousScrollHeight;
}

// Scroll to bottom
function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Scroll listener to load previous dates
chatWindow.addEventListener('scroll', () => {
  if (chatWindow.scrollTop === 0) {
    loadPreviousDay();
  }
});

// Send message handler
sendChat.addEventListener('click', () => {
  const message = chatInput.value.trim();
  console.log('Sending message:', message); // Debug log

  if (message) {
    const todayKey = getFormattedDate(new Date());
    const messageData = {
      message,
      timestamp: Date.now(),
      color: (typeof userColor !== 'undefined') ? userColor : '#00d4ff',
      user: (typeof userName !== 'undefined') ? userName : 'User'
    };

    console.log('Message data:', messageData); // Debug log
    console.log('Sending to room:', currentRoom, 'date:', todayKey); // Debug log

    push(dbRef(Db, `peer-chat/${currentRoom}/${todayKey}`), messageData)
      .then(() => {
        console.log('Message sent successfully'); // Debug log
      })
      .catch((error) => {
        console.error('Error sending message:', error); // Debug log
      });

    chatInput.value = '';
  }
});

// Enter key handler for input
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChat.click();
  }
});

// Room change handler
chatRoomSelector.addEventListener('change', () => {
  currentRoom = chatRoomSelector.value;
  loadTodayMessages();
});

// Initialize chat
loadTodayMessages();

// 🔹 AI Suggestion Fetch 🔹
async function fetchAISuggestions(userId) {
  try {
    const response = await fetch(`/api/suggestions/${userId}`);
    const data = await response.json();
    document.getElementById('ai-suggestions').textContent = data.suggestion || 'No suggestions today!';
  } catch (error) {
    console.error('Error fetching AI suggestions:', error);
    document.getElementById('ai-suggestions').textContent = 'Failed to load suggestions.';
  }
}

