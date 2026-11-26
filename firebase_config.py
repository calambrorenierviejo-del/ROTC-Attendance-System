
import os
import threading
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv


# =====================================================
# FIREBASE CONFIGURATION
# =====================================================

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env", override=True)

_db = None

# Prevent simultaneous Firebase initialization
_firebase_lock = threading.Lock()


# =====================================================
# FIRESTORE DATABASE CONNECTION
# =====================================================

def get_db():

    global _db

    if _db is not None:
        return _db

    with _firebase_lock:

        if _db is not None:
            return _db

        # Reuse an existing Firebase application
        try:

            firebase_app = firebase_admin.get_app()

        except ValueError:

            credential_path = os.getenv(
                "GOOGLE_APPLICATION_CREDENTIALS",
                "ServiceAccountKey.json"
            ).strip()

            key_file = Path(credential_path)

            if not key_file.is_absolute():
                key_file = BASE_DIR / key_file

            if not key_file.is_file():

                raise FileNotFoundError(
                    f"Firebase service account file not found: "
                    f"{key_file}"
                )

            cred = credentials.Certificate(str(key_file))

            firebase_app = firebase_admin.initialize_app(
                cred
            )

        # Initialize Firestore client only once
        _db = firestore.client(app=firebase_app)

        print("[SUCCESS] Firebase Firestore initialized.")

        return _db
