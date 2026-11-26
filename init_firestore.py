
import os
from time import perf_counter

from firebase_config import get_db


# =====================================================
# ROTC COMMAND - FIRESTORE INITIALIZATION
# =====================================================

COLLECTIONS = [
    "cadets",
    "training_schedules",
    "attendance",
    "announcements",
    "users"
]


def initialize_firestore():

    start_time = perf_counter()

    print("\n==========================================")
    print(" ROTC COMMAND - FIRESTORE INITIALIZATION")
    print("==========================================\n")

    try:

        db = get_db()

        environment = (
            "Vercel Cloud"
            if os.getenv("VERCEL")
            else "Local PyCharm"
        )

        print(f"[ENVIRONMENT] {environment}")
        print(f"[PROJECT] {db.project}")
        print("[SUCCESS] Firebase credentials loaded.\n")

        total_records = 0

        # Check Firestore collections
        for collection in COLLECTIONS:

            records = db.collection(collection).stream()

            count = sum(1 for _ in records)

            total_records += count

            print(f"[OK] {collection}: {count} records")

        elapsed = perf_counter() - start_time

        print("\n==========================================")
        print("[SUCCESS] Firestore connected successfully!")
        print(f"Total collections checked: {len(COLLECTIONS)}")
        print(f"Total records: {total_records}")
        print(f"Execution time: {elapsed:.2f} seconds")
        print("ROTC Command is ready.")
        print("==========================================\n")

        return True

    except Exception as error:

        print("\n[ERROR] Firestore connection failed.")
        print(f"Error details: {error}")
        print("Please check your Firebase configuration.")

        return False


if __name__ == "__main__":

    if not initialize_firestore():
        raise SystemExit(1)
