"""Shared Firebase Admin / Firestore initialisation for yo.py and agent.py."""
import json
import os

import firebase_admin
from firebase_admin import credentials

_BASE = os.path.dirname(os.path.abspath(__file__))
_ADMIN_KEY_PATHS = [
    os.path.join(_BASE, 'static', 'firebaseadminsdk.json'),
    os.path.join(_BASE, 'static', 'images', 'static', 'firebaseadminsdk.json'),
]


def get_firestore():
    """Firestore via the Admin SDK, initialising it on first use.

    Credentials come from FIREBASE_CREDENTIALS_JSON, GOOGLE_APPLICATION_CREDENTIALS,
    or a local static/firebaseadminsdk.json. Returns None (and prints why) if none work.
    """
    try:
        from firebase_admin import firestore
        if not firebase_admin._apps:
            cred_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
            key_file = next((p for p in _ADMIN_KEY_PATHS if os.path.isfile(p)), None)
            if cred_json:
                firebase_admin.initialize_app(credentials.Certificate(json.loads(cred_json)))
            elif os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                firebase_admin.initialize_app()
            elif key_file:
                firebase_admin.initialize_app(credentials.Certificate(key_file))
            else:
                print("ERROR: Firestore unavailable: no Admin SDK credentials found. Set "
                      "FIREBASE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS, or add "
                      "static/firebaseadminsdk.json")
                return None
        return firestore.client()
    except Exception:
        import traceback
        print("ERROR: Firestore unavailable:")
        traceback.print_exc()
        return None
