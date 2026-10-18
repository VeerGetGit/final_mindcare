from flask import Flask, render_template, jsonify, request
import firebase_admin
from firebase_admin import credentials
from groq import Groq
from dotenv import load_dotenv
import json
import os
import re
import datetime

load_dotenv()

app = Flask(__name__)

# ── Groq Client ─────────────────────────────────────────────────
client = Groq(api_key=os.getenv('GROQ_API_KEY'))

# ── Firebase Admin SDK ──────────────────────────────────────────
# cred = credentials.Certificate('static/firebaseadminsdk.json')
# firebase_admin.initialize_app(cred)


# ════════════════════════════════════════════════════════════════
#  PATIENT-FACING ROUTES
# ════════════════════════════════════════════════════════════════

@app.route('/')
def intro():
    return render_template('home.html')

@app.route('/login')
def login():
    api_key = os.getenv('FIREBASE_API_KEY')
    return render_template("login.html", api_key=api_key)

@app.route('/signup')
def signup():
    api_key = os.getenv('FIREBASE_API_KEY')
    return render_template("signup.html", api_key=api_key)

@app.route('/dashboard')
def dashboard():
    api_key = os.getenv('FIREBASE_API_KEY')
    return render_template("dashboard.html", api_key=api_key)

@app.route('/yoga')
def yoga():
    return render_template("Yoga.html")

@app.route('/workout')
def Workout():
    return render_template("Workout.html")

@app.route('/HomeWorkout')
def HomeWorkout():
    return render_template("HomeWorkout.html")

@app.route('/GymWorkout')
def GymWorkout():
    return render_template("GymWorkout.html")


# ── Patient AI Suggestions (Groq) ───────────────────────────────

@app.route('/api/ai-suggestions/<user_mood>')
def ai_suggestion(user_mood):
    try:
        prompt = f"""Give me a motivational quote and five actionable, practical mental health tips for someone feeling {user_mood} today.
Each tip should be simple, direct, and easy to follow.
Please provide the response in the following format:

Quote: "Your motivational quote here."

1. First tip
2. Second tip
3. Third tip
4. Fourth tip
5. Fifth tip"""

        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": prompt}]
        )

        suggestion = response.choices[0].message.content.strip()
        return jsonify({"suggestion": suggestion})

    except Exception as e:
        print(f"❌ Error fetching AI suggestion: {e}")
        return jsonify({"suggestion": "Unable to fetch suggestion right now."}), 500


# ════════════════════════════════════════════════════════════════
#  THERAPIST PORTAL ROUTES
# ════════════════════════════════════════════════════════════════

@app.route('/therapist/login')
def therapist_login():
    api_key = os.getenv('FIREBASE_API_KEY')
    return render_template("therapist_login.html", api_key=api_key)

@app.route('/therapist/portal')
def therapist_portal():
    api_key = os.getenv('FIREBASE_API_KEY')
    return render_template("therapist_portal.html", api_key=api_key)


# ── AI Session Extraction (Groq — llama-3.3-70b for accuracy) ──

# ─────────────────────────────────────────────────────────────────
# ADD THIS ROUTE TO yo.py — replaces the old extract-session route
# This is the full AI agent with 7 tools
# ─────────────────────────────────────────────────────────────────

@app.route('/api/therapist/agent', methods=['POST'])
def therapist_agent():
    try:
        data = request.get_json()
        user_message = data.get('message', '')
        patient = data.get('patient', {})
        sessions_summary = data.get('sessions_summary', 'No sessions yet.')
        chat_history = data.get('chat_history', [])
        today = data.get('today', datetime.date.today().isoformat())

        if not user_message:
            return jsonify({"error": "No message provided"}), 400

        # Build multi-turn history string
        history_str = ""
        if chat_history:
            history_str = "\n".join([
                f"{'Therapist' if m['role'] == 'user' else 'Agent'}: {m['content']}"
                for m in chat_history[-10:]
            ])

        system_prompt = f"""You are an intelligent AI session assistant for a therapist managing patient records.
You have access to 7 tools. Based on the therapist's message, decide which tool to call and extract the required data.

CURRENT PATIENT:
Name: {patient.get('name', '?')}
Age: {patient.get('age', '?')}
Gender: {patient.get('gender', '?')}
Primary Concern: {patient.get('primaryConcern', '?')}

RECENT SESSIONS (index 0 = most recent):
{sessions_summary}

TODAY'S DATE: {today}

CONVERSATION HISTORY:
{history_str if history_str else "This is the start of the conversation."}

AVAILABLE TOOLS:
1. log_session — Log a new therapy session
2. retrieve_sessions — View/list sessions (recent ones)
3. search_sessions — Search sessions by keyword
4. update_session — Edit/update an existing session
5. delete_session — Delete a session
6. update_patient — Update patient profile details
7. add_patient — Add a brand new patient
8. converse — Just reply conversationally (no database action needed)

INSTRUCTIONS:
- Analyze the therapist's message carefully
- Choose the most appropriate tool
- Extract ALL relevant information from the message
- For dates: interpret relative dates using today ({today})
- For session targeting: "last session" = index 0, "second last" = index 1, etc.
- For log_session: extract as much detail as possible from the free-form notes
- Return ONLY valid JSON, no explanation, no markdown

RESPONSE FORMAT:
{{
  "action": "tool_name_here",
  "payload": {{
    // For log_session:
    "date": "YYYY-MM-DD",
    "duration": 50,
    "moodObserved": "Anxious",
    "riskLevel": "Medium",
    "frequencyOfProblem": 3,
    "nextAppointment": "YYYY-MM-DD",
    "keyConcerns": "...",
    "triggerPoints": "...",
    "pastHistory": "...",
    "actionItems": "...",
    "rawNotes": "original text",

    // For retrieve_sessions:
    "count": 5,

    // For search_sessions:
    "keyword": "anxiety",

    // For update_session:
    "session_index": 0,
    "session_date": "YYYY-MM-DD or null",
    "updates": {{ "riskLevel": "High", "moodObserved": "Anxious" }},

    // For delete_session:
    "session_index": 0,
    "session_date": null,

    // For update_patient:
    "age": 28,
    "gender": "Female",
    "primaryConcern": "PTSD",

    // For add_patient:
    "name": "...",
    "age": 25,
    "gender": "Male",
    "primaryConcern": "...",

    // For converse:
    "message": "Your helpful reply here"
  }}
}}"""

        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.1
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)
        return jsonify(result)

    except json.JSONDecodeError:
        return jsonify({
            "action": "converse",
            "payload": {"message": "I had trouble understanding that. Could you rephrase?"}
        })
    except Exception as e:
        print("❌ Agent error:", e)
        return jsonify({"error": str(e)}), 500

# ── Patient AI Chatbot (human-in-the-loop) ──────────────────────

CHAT_SYSTEM_PROMPT = ("You are MindCare, a supportive mental health companion. "
                      "Give short, empathetic responses. Never diagnose. "
                      "Encourage professional help when needed.")
CHAT_MODEL = "llama3-8b-8192"
CHAT_FLAG_REGEX = re.compile(
    r"diagnose|disorder|medication|prescription|suicid|self-harm|\bkill|\bdie\b|hopeless|worthless",
    re.IGNORECASE)
CHAT_FLAGGED_REPLY = "I hear you. A care team member will follow up with you shortly."


def _get_firestore():
    """Firestore via Admin SDK, or None if no credentials are configured."""
    try:
        from firebase_admin import firestore
        if not firebase_admin._apps:
            cred_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
            if cred_json:
                firebase_admin.initialize_app(credentials.Certificate(json.loads(cred_json)))
            elif os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                firebase_admin.initialize_app()
            else:
                return None
        return firestore.client()
    except Exception as e:
        print(f"❌ Firestore unavailable: {e}")
        return None


def _therapist_status(t):
    """'status' field, else a boolean/str 'available' field; defaults to 'available'."""
    status = t.get("status")
    if status:
        return str(status).lower()
    flag = t.get("available")
    if flag is False:
        return "offline"
    if isinstance(flag, str) and flag:
        return flag.lower()
    return "available"


@app.route('/api/therapists')
def list_therapists():
    fs = _get_firestore()
    if fs is None:
        return jsonify({"error": "Firestore is not configured on the server."}), 503
    try:
        therapists = []
        for doc in fs.collection("therapists").stream():
            t = doc.to_dict() or {}
            therapists.append({
                "id": doc.id,
                "name": t.get("name", "Therapist"),
                "specialization": t.get("specialization", ""),
                "status": _therapist_status(t),
            })
        return jsonify(therapists)
    except Exception as e:
        print(f"❌ Error fetching therapists: {e}")
        return jsonify({"error": "Could not load therapists."}), 500


@app.route('/api/patient/chat', methods=['POST'])
def patient_chat():
    try:
        data = request.get_json(silent=True) or {}
        message = (data.get('message') or '').strip()
        user_id = data.get('user_id') or 'anonymous'

        if not message:
            return jsonify({"error": "No message provided"}), 400

        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "user", "content": message}
            ]
        )
        ai_response = response.choices[0].message.content.strip()

        if not CHAT_FLAG_REGEX.search(ai_response):
            return jsonify({"response": ai_response, "flagged": False})

        review = {
            "user_id": user_id,
            "user_message": message,
            "ai_response": ai_response,
            "status": "pending",
            "reviewed": False,
        }
        result = {"response": CHAT_FLAGGED_REPLY, "flagged": True, "saved": False}
        fs = _get_firestore()
        if fs is not None:
            try:
                from firebase_admin import firestore
                fs.collection("pending_reviews").add({**review, "timestamp": firestore.SERVER_TIMESTAMP})
                result["saved"] = True
            except Exception as e:
                print(f"❌ Failed to save pending review: {e}")
        if not result["saved"]:
            # No server credentials: let the signed-in client persist it instead.
            result["review"] = review
        return jsonify(result)

    except Exception as e:
        print(f"❌ Patient chat error: {e}")
        return jsonify({"error": "Chat is unavailable right now."}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)