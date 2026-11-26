
import os
import json
import threading
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv


# =====================================================
# ENVIRONMENT CONFIGURATION
# =====================================================

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env", override=False)

_db = None
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

        try:
            firebase_app = firebase_admin.get_app()

        except ValueError:

            firebase_json = os.getenv(
                "FIREBASE_SERVICE_ACCOUNT", ""
            ).strip()

            # =========================================
            # VERCEL CLOUD CONNECTION
            # =========================================

            if firebase_json:

                service_account = json.loads(firebase_json)

                if "private_key" in service_account:
                    service_account["private_key"] = (
                        service_account["private_key"]
                        .replace("\\n", "\n")
                    )

                cred = credentials.Certificate(service_account)

                print("[SUCCESS] Vercel credentials loaded.")

            # =========================================
            # LOCAL PYCHARM CONNECTION
            # =========================================

            else:

                credential_path = os.getenv(
                    "GOOGLE_APPLICATION_CREDENTIALS",
                    "ServiceAccountKey.json"
                ).strip()

                key_file = Path(credential_path)

                if not key_file.is_absolute():
                    key_file = BASE_DIR / key_file

                if not key_file.is_file():
                    raise FileNotFoundError(
                        f"Firebase service account not found: {key_file}"
                    )

                cred = credentials.Certificate(str(key_file))

                print("[SUCCESS] Local credentials loaded.")

            firebase_app = firebase_admin.initialize_app(cred)

        # =============================================
        # INITIALIZE FIRESTORE CLIENT
        # =============================================

        _db = firestore.client(app=firebase_app)

        print("[SUCCESS] Firebase Firestore initialized.")

        return _db
