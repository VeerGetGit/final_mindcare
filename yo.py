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

from firebase_db import get_firestore as _get_firestore  # shared Admin SDK / Firestore init


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
    # Always returns JSON with a "therapists" list; the client falls back to a
    # direct Firestore read when the status is not 200.
    fs = _get_firestore()
    if fs is None:
        return jsonify({"therapists": [],
                        "error": "Server has no Firebase Admin credentials; see server log."}), 503
    try:
        therapists = []
        for doc in fs.collection("therapists").stream():
            t = doc.to_dict() or {}
            therapists.append({
                "id": doc.id,
                "name": t.get("name", "Therapist"),
                "specialization": t.get("specialization", ""),
                "status": _therapist_status(t),
                "email": t.get("email", ""),
            })
        return jsonify(therapists)
    except Exception:
        import traceback
        print("ERROR: Error fetching therapists:")
        traceback.print_exc()
        return jsonify({"therapists": [], "error": "Could not load therapists from Firestore."}), 500


def _serialize(value):
    """Make Firestore values (timestamps etc.) JSON-safe."""
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _sort_key(item):
    return item.get("timestamp") or ""


@app.route('/api/patient/chat-summary/<user_id>')
def patient_chat_summary(user_id):
    fs = _get_firestore()
    if fs is None:
        return jsonify({"error": "Firestore is not configured on the server."}), 503
    try:
        coll = fs.collection("chat_messages").where("user_id", "==", user_id)
        try:
            from firebase_admin import firestore
            docs = coll.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(10).stream()
            messages = [_serialize(d.to_dict()) for d in docs]
        except Exception:
            # The ordered query needs a composite index; fall back to sorting here.
            messages = sorted((_serialize(d.to_dict()) for d in coll.stream()), key=_sort_key, reverse=True)[:10]

        if not messages:
            return jsonify({"summary": "No chat history available", "messages": []})

        patient_msgs = [m for m in messages if m.get("role") == "user"]
        topics = "; ".join((m.get("text") or "")[:60] for m in patient_msgs[:3]) or "n/a"
        summary = f"Patient has had {len(patient_msgs)} conversations. Recent topics: {topics}"
        return jsonify({"summary": summary, "messages": messages})
    except Exception as e:
        print(f"ERROR: Error building chat summary: {e}")
        return jsonify({"error": "Could not load chat history."}), 500


@app.route('/api/therapist/cases/<therapist_id>')
def therapist_cases(therapist_id):
    fs = _get_firestore()
    if fs is None:
        return jsonify({"error": "Firestore is not configured on the server."}), 503
    try:
        cases = []
        for tid in {therapist_id, "any"}:
            for doc in fs.collection("therapist_cases").where("therapist_id", "==", tid).stream():
                cases.append({"id": doc.id, **_serialize(doc.to_dict())})
        cases.sort(key=_sort_key, reverse=True)
        return jsonify(cases)
    except Exception as e:
        print(f"ERROR: Error fetching cases: {e}")
        return jsonify({"error": "Could not load cases."}), 500


@app.route('/api/admin/expire-pending')
def expire_pending_bookings():
    """Reject session_bookings still pending after 24h and notify the patient.

    Meant for a cron job or manual call. If ADMIN_TASK_TOKEN is set in the environment,
    the request must include ?token=<value>.
    """
    expected = os.getenv('ADMIN_TASK_TOKEN')
    if expected and request.args.get('token') != expected:
        return jsonify({"error": "Forbidden"}), 403
    fs = _get_firestore()
    if fs is None:
        return jsonify({"error": "Firestore is not configured on the server."}), 503
    try:
        from firebase_admin import firestore
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)
        expired = 0
        for doc in fs.collection("session_bookings").where("status", "==", "pending").stream():
            b = doc.to_dict() or {}
            created = b.get("timestamp") or b.get("created_at")
            if not created or not hasattr(created, "tzinfo"):
                continue
            if created.tzinfo is None:
                created = created.replace(tzinfo=datetime.timezone.utc)
            if created > cutoff:
                continue
            doc.reference.update({"status": "rejected"})
            if b.get("user_id"):
                fs.collection("user_notifications").add({
                    "user_id": b["user_id"],
                    "type": "booking_update",
                    "status": "rejected",
                    "therapist_name": b.get("therapist_name", ""),
                    "timeslot": b.get("timeslot", ""),
                    "date": b.get("date", ""),
                    "read": False,
                    "message": "Your session request expired as no response was received. "
                               "You can book a new session.",
                    "created_at": firestore.SERVER_TIMESTAMP,
                })
            expired += 1
        return jsonify({"expired": expired})
    except Exception:
        import traceback
        print("ERROR: expire-pending failed:")
        traceback.print_exc()
        return jsonify({"error": "Could not expire bookings."}), 500


@app.route('/api/patient/chat', methods=['POST'])
def patient_chat():
    try:
        data = request.get_json(silent=True) or {}
        message = (data.get('message') or '').strip()
        user_id = data.get('user_id') or 'anonymous'

        if not message:
            return jsonify({"error": "No message provided"}), 400

        # Imported lazily so the rest of the app still runs if agent deps are missing.
        from agent import (classify_message, SIMPLE_RESPONSES, agent, get_chat_history,
                           save_message, get_mindcare_info, flag_crisis_message,
                           get_crisis_resources)
        from langchain_core.messages import AIMessage, HumanMessage
        from groq import RateLimitError

        msg_type = classify_message(message)
        print(f"Chat [{msg_type}] user={user_id}")

        # Cheap paths: no Groq call
        if msg_type == "simple":
            key = message.lower().strip().replace("!", "").strip()
            reply = SIMPLE_RESPONSES.get(key, "I'm here to help! How are you feeling?")
            save_message(user_id, 'user', message)
            save_message(user_id, 'bot', reply)
            return jsonify({"response": reply, "flagged": False, "handled": True, "api_call": False})

        if msg_type == "platform":
            info = get_mindcare_info.invoke({"topic": message})
            save_message(user_id, 'user', message)
            save_message(user_id, 'bot', info)
            return jsonify({"response": info, "flagged": False, "handled": True, "api_call": False})

        if msg_type == "crisis":
            support = flag_crisis_message.invoke({"user_id": user_id, "message": message})
            resources = support + "\n\n" + get_crisis_resources.invoke({})
            save_message(user_id, 'user', message)
            save_message(user_id, 'bot', resources)
            return jsonify({"response": resources, "flagged": True, "handled": True, "api_call": False})

        # Full agent
        history = get_chat_history(user_id, 10)
        history.append(HumanMessage(content=message))
        save_message(user_id, 'user', message)

        try:
            result = agent.invoke({"messages": history, "user_id": user_id},
                                  {"recursion_limit": 12})
        except RateLimitError:
            fallback = ("I'm a bit busy right now! Please try again in a moment. In the meantime, "
                        "you can explore the Yoga or Meditation sections on your dashboard. 💙")
            save_message(user_id, 'bot', fallback)
            return jsonify({"response": fallback, "flagged": False, "handled": True,
                            "rate_limited": True, "api_call": True})

        ai_response = ""
        for m in reversed(result["messages"]):
            if isinstance(m, AIMessage) and m.content and not m.tool_calls:
                ai_response = m.content if isinstance(m.content, str) else str(m.content)
                break
        ai_response = ai_response.strip() or "I'm here with you. Could you tell me a little more?"

        flagged = any(getattr(m, "name", None) == "flag_crisis_message" for m in result["messages"])
        save_message(user_id, 'bot', ai_response)

        return jsonify({"response": ai_response, "flagged": flagged, "handled": True, "api_call": True})

    except Exception:
        import traceback
        print("ERROR: Patient chat error:")
        traceback.print_exc()
        return jsonify({"error": "Chat is unavailable right now."}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)