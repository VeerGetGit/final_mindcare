"""MindCare LangGraph ReAct agent: memory (Firestore chat_messages), tools, platform knowledge."""
import datetime
import operator
import os
import time
from typing import Annotated, Sequence, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from firebase_db import get_firestore

load_dotenv()

SAFE_DEFAULT_MODEL = 'openai/gpt-oss-20b'


def get_best_model():
    """First preferred model that Groq currently serves.

    Order: MINDCARE_AGENT_MODEL override, then fast/cheap models, then a known-good default.
    The candidates are checked against Groq's live model list, because several older
    models (e.g. llama3-8b-8192) have been decommissioned and would fail every request.
    """
    candidates = [
        os.environ.get('MINDCARE_AGENT_MODEL'),  # user override first
        'gemma2-9b-it',                          # fast, free tier friendly
        'llama3-8b-8192',                        # fallback
        'mixtral-8x7b-32768',                    # last resort
        SAFE_DEFAULT_MODEL,
    ]
    candidates = [m for m in candidates if m]
    try:
        from groq import Groq
        available = {m.id for m in Groq(api_key=os.getenv('GROQ_API_KEY')).models.list().data}
        for m in candidates:
            if m in available:
                return m
    except Exception as e:
        print(f'WARNING: could not list Groq models ({e}); using {candidates[0]}')
        return candidates[0] if os.environ.get('MINDCARE_AGENT_MODEL') else SAFE_DEFAULT_MODEL
    return SAFE_DEFAULT_MODEL


# ── Helpers ─────────────────────────────────────────────────────

def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _status_of(t):
    status = t.get('status')
    if status:
        return str(status).lower()
    if t.get('available') is False:
        return 'offline'
    return 'available'


def _patient_identity(user_id):
    """Patient fields for therapist_cases, using Firebase Auth when possible."""
    name, email = 'Anonymous', 'No email'
    try:
        from firebase_admin import auth
        get_firestore()  # makes sure the Admin app is initialised
        u = auth.get_user(user_id)
        name = u.display_name or name
        email = u.email or email
    except Exception:
        pass
    return {'patient_id': user_id, 'patient_uid': user_id,
            'patient_name': name, 'patient_email': email}


def _require_db():
    db = get_firestore()
    if db is None:
        raise RuntimeError('Database unavailable')
    return db


def _ts(m):
    return m.get('timestamp') or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)


def get_chat_history(user_id, limit=10):
    """Last `limit` chat_messages for the user as HumanMessage/AIMessage, oldest first."""
    db = get_firestore()
    if db is None:
        return []
    try:
        docs = db.collection('chat_messages').where('user_id', '==', user_id).stream()
        msgs = sorted((d.to_dict() for d in docs), key=_ts)[-limit:]
        return [HumanMessage(content=m.get('text', '')) if m.get('role') == 'user'
                else AIMessage(content=m.get('text', '')) for m in msgs if m.get('text')]
    except Exception as e:
        print(f'ERROR: get_chat_history failed: {e}')
        return []


def save_message(user_id, role, text):
    """Persist a chat message ('user' or 'bot')."""
    db = get_firestore()
    if db is None:
        return
    try:
        db.collection('chat_messages').add(
            {'user_id': user_id, 'role': role, 'text': text, 'timestamp': _now()})
    except Exception as e:
        print(f'ERROR: save_message failed: {e}')


# ── Platform knowledge ──────────────────────────────────────────

MINDCARE_INFO = {
    'yoga': 'The Yoga section has guided poses such as Child\'s Pose, Mountain Pose and Bridge Pose to help you relax and stretch.',
    'workout': 'MindCare has Home Workouts (no equipment) and Gym Workouts. Exercise is a great way to release tension and lift your mood.',
    'meditation': 'The dashboard has guided meditation sessions: Breathing Focus (5 min), Body Scan (10 min), Mindfulness (15 min) and Loving Kindness (12 min).',
    'journal': 'The Daily Journal lets you write your thoughts for any date and review recent entries. Writing helps process emotions.',
    'mood': 'Use Today\'s Mood on the dashboard to log how you feel. The Mood Over Time chart shows your weekly pattern.',
    'peer chat': 'The Peer Support Chat has anonymous rooms: General, Anxiety Support and Motivation Room. Please keep it kind and respectful.',
    'therapist': 'You can book a private session with a licensed therapist via "Book Session" on the dashboard, or ask me to help you book one.',
    'habits': 'The Daily Habits tracker covers hydration, sleep, exercise and meditation, with a streak counter to keep you motivated.',
    'breathing': 'Try box breathing in the Breathing Focus meditation: inhale 4, hold 4, exhale 4, hold 4.',
    'community': 'The Peer Community Chat is a safe place to share and support others. Choose a room that fits how you feel.',
}


THERAPIST_CACHE_SECONDS = 300
_therapist_cache = {"data": None, "timestamp": 0}


INFO_ALIASES = {'exercise': 'workout', 'gym': 'workout', 'habit': 'habits',
                'breath': 'breathing', 'meditat': 'meditation', 'journal': 'journal'}


@tool
def get_available_therapists() -> str:
    """List therapists who are currently available for booking, with name and specialization."""
    if _therapist_cache["data"] is not None and time.time() - _therapist_cache["timestamp"] < THERAPIST_CACHE_SECONDS:
        return _therapist_cache["data"]
    try:
        db = _require_db()
        lines = []
        for d in db.collection('therapists').stream():
            t = d.to_dict() or {}
            if _status_of(t) == 'available':
                lines.append(f"- {t.get('name', 'Therapist')} ({t.get('specialization') or 'general counselling'}) - available")
        result = '\n'.join(lines) if lines else 'No therapists are available right now. The patient can book a later slot from the dashboard.'
        _therapist_cache.update(data=result, timestamp=time.time())
        return result
    except Exception as e:
        return f'Could not load therapists: {e}'


@tool
def book_therapy_session(therapist_name: str, timeslot: str, concern: str, user_id: str) -> str:
    """Book a therapy session. Only call after the user has confirmed therapist, timeslot and concern.
    timeslot examples: 'Today 3PM', 'Today 5PM', 'Tomorrow 10AM', 'Tomorrow 2PM', 'Tomorrow 4PM'."""
    try:
        db = _require_db()
        therapist_id, resolved_name = 'any', therapist_name
        for d in db.collection('therapists').stream():
            t = d.to_dict() or {}
            if str(t.get('name', '')).strip().lower() == therapist_name.strip().lower():
                therapist_id, resolved_name = d.id, t.get('name', therapist_name)
                break
        if therapist_id == 'any':
            resolved_name = 'First Available'
        now = _now()
        db.collection('session_bookings').add({
            'user_id': user_id, 'therapist_name': resolved_name, 'therapist_id': therapist_id,
            'timeslot': timeslot, 'notes': concern, 'timestamp': now,
            'status': 'pending', 'booked_via': 'chatbot'})
        db.collection('therapist_cases').add({
            'therapist_id': therapist_id, 'therapist_name': resolved_name,
            **_patient_identity(user_id),
            'type': 'chatbot_booking', 'source': 'chatbot', 'booked_via': 'chatbot',
            'timeslot': timeslot, 'problem': concern, 'status': 'new', 'timestamp': now})
        return f'Session booked with {resolved_name} for {timeslot}. The therapist will confirm shortly.'
    except Exception as e:
        return f'Booking failed: {e}'


@tool
def get_mindcare_info(topic: str) -> str:
    """Get information about a MindCare feature: yoga, workout, meditation, journal, mood,
    peer chat, therapist, habits, breathing, community."""
    t = topic.lower().strip()
    for key, info in MINDCARE_INFO.items():
        if key in t or t in key:
            return info
    for alias, key in INFO_ALIASES.items():
        if alias in t:
            return MINDCARE_INFO[key]
    return 'MindCare offers: ' + ', '.join(MINDCARE_INFO) + '. Ask about any of these.'


@tool
def flag_crisis_message(user_id: str, message: str) -> str:
    """Flag a message showing crisis or self-harm risk so a therapist is notified immediately."""
    try:
        db = _require_db()
        now = _now()
        db.collection('moderation_flags').add(
            {'user_id': user_id, 'message': message, 'timestamp': now, 'type': 'crisis'})
        db.collection('therapist_cases').add({
            'therapist_id': 'any', **_patient_identity(user_id),
            'type': 'chatbot_flag', 'source': 'chatbot',
            'trigger_message': message, 'ai_response': '', 'status': 'urgent', 'timestamp': now})
    except Exception as e:
        print(f'ERROR: flag_crisis_message failed: {e}')
    return 'CRISIS_FLAGGED'


@tool
def get_user_mood_history(user_id: str) -> str:
    """Summarise the user's last 7 logged moods."""
    try:
        db = _require_db()
        docs = db.collection('users').document(user_id).collection('moods').stream()
        entries = sorted((d.to_dict() for d in docs), key=lambda m: m.get('date') or '')[-7:]
        moods = [m['mood'] for m in entries if m.get('mood')]
        if not moods:
            return 'No mood history found. Try logging your mood daily in the dashboard!'
        counts = {}
        for m in moods:
            counts[m.capitalize()] = counts.get(m.capitalize(), 0) + 1
        parts = ', '.join(f'{k}({v})' for k, v in sorted(counts.items(), key=lambda x: -x[1]))
        positive = {'Happy', 'Calm', 'Content', 'Peaceful', 'Excited', 'Energetic'}
        pos = sum(v for k, v in counts.items() if k in positive)
        trend = ('You seem to have more positive days recently!' if pos * 2 >= len(moods)
                 else 'It has been a tougher stretch lately - be gentle with yourself.')
        return f'Your mood over the last {len(moods)} entries: {parts}. {trend}'
    except Exception as e:
        return f'Could not load mood history: {e}'


@tool
def get_user_journal_summary(user_id: str) -> str:
    """Summarise the user's last 3 journal entries."""
    try:
        db = _require_db()
        docs = db.collection('users').document(user_id).collection('journals').stream()
        entries = sorted((d.to_dict() for d in docs), key=lambda j: j.get('date') or '')[-3:]
        if not entries:
            return 'No journal entries found. Writing a journal can really help process emotions!'
        return 'Recent journal entries:\n' + '\n'.join(
            f"- {e.get('date', '?')}: {(e.get('text') or '')[:200]}" for e in entries)
    except Exception as e:
        return f'Could not load journal entries: {e}'


ACTIVITIES = {
    'sad': "Try the Yoga section - Child's Pose and Bridge Pose are great for lifting mood. Also consider writing in your journal.",
    'anxious': 'Try the Breathing exercises in MindCare. Box breathing: inhale 4 counts, hold 4, exhale 4, hold 4. Repeat 4 times.',
    'angry': 'A quick workout can help release tension. Try the Home Workout section - Burpees and Mountain Climbers are great stress relievers.',
    'stressed': 'Try the Mindfulness section. Even 5 minutes of meditation can lower cortisol levels significantly.',
    'tired': 'Gentle yoga is perfect when tired. Try Mountain Pose and Child\'s Pose in the Yoga section.',
    'happy': "Great to hear! Share your positivity in the Peer Community Chat. Your energy can help others!",
}


@tool
def suggest_activity(mood: str) -> str:
    """Suggest a MindCare activity for a mood: sad, anxious, angry, stressed, happy, tired."""
    return ACTIVITIES.get(mood.lower().strip(),
                          'Check out the Wellness section on your dashboard for activities matched to your mood.')


@tool
def get_crisis_resources() -> str:
    """Crisis helpline numbers for India. Use whenever the user may be in crisis."""
    return ('If you are in crisis, please reach out immediately:\n'
            '- iCall (India): 9152987821\n'
            '- Vandrevala Foundation: 1860-2662-345 (24/7)\n'
            '- AASRA: 9820466627\n'
            '- iCall Chat: icallhelpline.org\n'
            'You are not alone. A MindCare therapist has been notified and will reach out to you.')


@tool
def check_habit_streak(user_id: str) -> str:
    """Count the user's current streak of consecutive days with habit entries."""
    try:
        db = _require_db()
        docs = db.collection('users').document(user_id).collection('habitEntries').stream()
        days = {d.to_dict().get('date') for d in docs if (d.to_dict() or {}).get('date')}
        day = datetime.date.today()
        if day.isoformat() not in days:
            day -= datetime.timedelta(days=1)  # streak may still be alive from yesterday
        streak = 0
        while day.isoformat() in days:
            streak += 1
            day -= datetime.timedelta(days=1)
        if streak:
            return f'You have a {streak}-day habit streak! Keep it up!'
        return 'Start your habit streak today in the dashboard!'
    except Exception as e:
        return f'Could not check habit streak: {e}'


ENCOURAGEMENTS = [
    (('exam', 'study', 'test', 'school'), "Exams can feel overwhelming, but you've prepared more than you realise. Take short breaks, breathe, and trust yourself - one step at a time."),
    (('work', 'job', 'boss', 'career'), "Work pressure is heavy, and it's okay to feel drained. Your worth isn't measured by productivity - small pauses and boundaries help you go further."),
    (('relationship', 'partner', 'breakup', 'friend'), "Relationships can hurt deeply because you care deeply. Be patient with your heart; it's okay to feel what you feel while you heal."),
    (('family', 'parents', 'mother', 'father'), "Family situations can be complicated and emotional. You're doing your best, and it's okay to take space and look after yourself too."),
    (('health', 'sick', 'illness', 'pain'), "Looking after your health takes strength, even on slow days. Rest is productive too - be kind to your body and celebrate small improvements."),
    (('lonely', 'loneliness', 'alone'), "Feeling lonely is painful, but reaching out here was a brave step. You're not alone - the Peer Community Chat is full of people who understand."),
    (('fail', 'failure', 'failed', 'mistake'), "Failing doesn't define you - it means you tried, and that takes courage. Every setback carries lessons that make your next attempt stronger."),
    (('anxiety', 'anxious', 'nervous', 'worry', 'panic'), "Anxious thoughts feel loud, but they are not facts. Slow your breathing, ground yourself in the present, and remember this feeling will pass."),
    (('grief', 'loss', 'died', 'death', 'passed away'), "I'm so sorry for your loss. Grief is love with nowhere to go - let yourself feel it, and lean on people who care about you."),
]
GENERAL_ENCOURAGEMENT = "You're doing better than you think, and showing up for yourself matters. Take it one moment at a time - I'm here with you."


@tool
def send_encouragement(situation: str) -> str:
    """Return a warm encouraging message matched to the user's situation (exam, work, relationship,
    family, health, loneliness, failure, anxiety, grief, or general)."""
    s = situation.lower()
    for keywords, message in ENCOURAGEMENTS:
        if any(k in s for k in keywords):
            return message
    return GENERAL_ENCOURAGEMENT


TOOLS = [get_available_therapists, book_therapy_session, get_mindcare_info, flag_crisis_message,
         get_user_mood_history, get_user_journal_summary, suggest_activity, get_crisis_resources,
         check_habit_streak, send_encouragement]

SYSTEM_PROMPT = """You are MindCare Assistant, a compassionate AI mental health companion on the MindCare platform.

MindCare features: yoga, home workouts, gym workouts, peer community chat, mood tracking, daily journaling, habit tracking, breathing exercises, mindfulness, and licensed therapist booking.

Personality: warm, empathetic, non-judgmental, concise (2-4 sentences per response). Always validate feelings before suggesting anything. Use the user's name if you know it.

Tool usage guide:
- User seems sad/anxious/stressed → call suggest_activity with their mood
- User asks about their progress → call get_user_mood_history and check_habit_streak
- User wants to talk about their week → call get_user_journal_summary
- User wants therapist/doctor → call get_available_therapists first, then book_therapy_session after confirmation. When you present the list, start that part of your reply with the exact text "Available therapists:" followed by the names
- User in crisis (mentions suicide, self-harm, want to die, khatam, mar jaana) → IMMEDIATELY call flag_crisis_message AND get_crisis_resources
- User asks about platform features → call get_mindcare_info
- User needs encouragement → call send_encouragement

STRICT RULES:
- Never use: diagnose, disorder, medication, prescription, symptoms, treatment, clinical, mental illness
- Never give medical advice
- Always suggest professional help for serious issues
- Keep responses under 100 words unless explaining a feature
- If user books a session, confirm the details before calling book_therapy_session"""


CRISIS_WORDS = ["suicide", "kill myself", "want to die", "end my life", "self harm", "self-harm",
                "cut myself", "khatam", "mar jaana", "mar jaunga", "mar jaungi", "jeena nahi",
                "hopeless", "worthless"]
SIMPLE_PATTERNS = ["hi", "hello", "hey", "hii", "good morning", "good evening", "good night",
                   "thanks", "thank you", "ok", "okay", "bye", "goodbye"]
PLATFORM_PATTERNS = ["yoga", "workout", "exercise", "gym", "meditation", "breathing", "journal",
                     "habit", "mood", "peer chat", "community", "what can you do", "features",
                     "help me"]


EMOTION_WORDS = ["feel", "feeling", "felt", "i am", "i'm", "sad", "anxious", "stressed", "scared",
                 "angry", "lonely", "depressed", "crying", "cry", "upset", "worried", "afraid",
                 "bad", "awful", "terrible", "hurt", "pain", "lost", "confused", "overwhelmed",
                 "tired of"]


def classify_message(message: str) -> str:
    """Returns: 'simple', 'platform', 'crisis', 'agent'"""
    msg = message.lower().strip()

    # Crisis - handled immediately
    if any(w in msg for w in CRISIS_WORDS):
        return "crisis"

    # Simple greetings - no API call needed
    if msg in SIMPLE_PATTERNS or msg.replace("!", "").strip() in SIMPLE_PATTERNS:
        return "simple"

    # Feelings always win over platform keywords, so emotional messages reach the agent
    if any(w in msg for w in EMOTION_WORDS):
        return "agent"

    # Platform info - lightweight canned responses
    if any(w in msg for w in PLATFORM_PATTERNS):
        return "platform"

    # Everything else goes to the full agent
    return "agent"


SIMPLE_RESPONSES = {
    "hi": "Hi there! 👋 I'm MindCare Assistant. How are you feeling today?",
    "hello": "Hello! I'm here to support you. How can I help you today?",
    "hey": "Hey! How are you doing? I'm here if you need to talk.",
    "hii": "Hi! 😊 How are you feeling right now?",
    "good morning": "Good morning! 🌅 How are you starting your day?",
    "good evening": "Good evening! How has your day been?",
    "good night": "Good night! 🌙 Take care and sleep well.",
    "thanks": "You're welcome! I'm always here if you need support. 💙",
    "thank you": "You're welcome! Take care of yourself. 💙",
    "ok": "I'm here whenever you need me! 😊",
    "okay": "Alright! Let me know if there's anything you need.",
    "bye": "Take care! Remember, I'm always here when you need support. 💙",
    "goodbye": "Goodbye! Wishing you a peaceful day. 💙",
}


class AgentState(TypedDict):
    messages: Annotated[Sequence, operator.add]
    user_id: str


def create_mindcare_agent():
    llm = ChatGroq(model=get_best_model(), temperature=0.7, api_key=os.getenv('GROQ_API_KEY'))
    llm_with_tools = llm.bind_tools(TOOLS)

    def agent_node(state: AgentState):
        response = llm_with_tools.invoke([SystemMessage(content=SYSTEM_PROMPT), *state['messages']])
        # The model must not choose whose data to touch: force the session's user_id.
        for call in getattr(response, 'tool_calls', None) or []:
            if 'user_id' in call.get('args', {}):
                call['args']['user_id'] = state['user_id']
        return {'messages': [response]}

    def route(state: AgentState):
        last = state['messages'][-1]
        return 'tools' if getattr(last, 'tool_calls', None) else END

    graph = StateGraph(AgentState)
    graph.add_node('agent', agent_node)
    graph.add_node('tools', ToolNode(TOOLS))
    graph.set_entry_point('agent')
    graph.add_conditional_edges('agent', route, {'tools': 'tools', END: END})
    graph.add_edge('tools', 'agent')
    return graph.compile()


agent = create_mindcare_agent()
