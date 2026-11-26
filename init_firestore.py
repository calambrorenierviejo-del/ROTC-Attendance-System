
from firebase_config import get_db


def main():

    try:

        db = get_db()

        collections = [
            "cadets",
            "training_schedules",
            "attendance",
            "announcements",
            "users"
        ]

        print("\n====================================")
        print(" ROTC COMMAND - FIRESTORE CONNECTION")
        print("====================================\n")

        for collection in collections:

            records = list(
                db.collection(collection).stream()
            )

            print(
                f"[OK] {collection}: "
                f"{len(records)} records"
            )

        print("\nConnected to Firestore successfully!")
        print("ROTC Command is ready.")

    except Exception as error:

        print("\n[ERROR] Firestore connection failed.")
        print(str(error))

        raise SystemExit(1)


if __name__ == "__main__":
    main()
