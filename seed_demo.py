
"""
ROTC COMMAND
Optimized Firestore Sample Data Generator

Total sample records: 402
Existing documents are preserved.
"""

import argparse

from datetime import date, timedelta, datetime

from firebase_config import get_db
from app import clean_data


# =====================================================
# SAMPLE DATA CONFIGURATION
# =====================================================

COURSES = [
    "BSIT",
    "BSAgri",
    "BSEd",
    "BEEd",
    "BSHM",
    "BSOff Ad"
]

PLATOONS = [
    "Alpha",
    "Bravo",
    "Charlie",
    "Delta"
]

FIRST_NAMES = [
    "Juan", "Maria", "John", "Angela",
    "Mark", "Andrea", "Joshua", "Nicole",
    "Daniel", "Christine", "James", "Patricia",
    "Michael", "Sofia", "Gabriel", "Ashley",
    "Christian", "Grace", "Joseph", "Angel"
]

LAST_NAMES = [
    "Dela Cruz",
    "Santos",
    "Reyes",
    "Garcia",
    "Mendoza",
    "Ramos",
    "Torres",
    "Flores",
    "Gonzales",
    "Villanueva",
    "Castillo",
    "Fernandez"
]

TOPICS = [
    "ROTC Orientation",
    "Physical Fitness Training",
    "Leadership Seminar",
    "First Aid Awareness",
    "Community Service",
    "Team Building",
    "Disaster Preparedness",
    "Values Education",
    "Campus Safety",
    "Environmental Service",
    "Drill Practice",
    "Training Evaluation"
]

COLLECTIONS = [
    "cadets",
    "training_schedules",
    "attendance",
    "announcements",
    "users"
]


# =====================================================
# MAIN FUNCTION
# =====================================================

def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Insert fictional sample records"
    )

    args = parser.parse_args()

    if not args.confirm:

        print(
            "Run: python seed_demo.py --confirm"
        )

        return

    print("\n======================================")
    print(" ROTC COMMAND - SAMPLE DATA GENERATOR")
    print("======================================\n")

    db = get_db()

    now = datetime.now().isoformat(
        timespec="seconds"
    )

    existing = {}

    pending = []

    skipped = 0

    # =================================================
    # LOAD EXISTING RECORDS ONCE
    # =================================================

    print("[1/6] Checking existing records...")

    for collection in COLLECTIONS:

        existing[collection] = {
            doc.id: doc.to_dict() or {}
            for doc in db.collection(collection).stream(
                timeout=60
            )
        }

        print(
            f"  {collection}: "
            f"{len(existing[collection])} existing records"
        )

    student_ids = {
        data.get("student_id"): key
        for key, data in existing["cadets"].items()
    }

    staff_codes = {
        data.get("staff_code"): key
        for key, data in existing["users"].items()
    }

    attendance_pairs = {
        (
            data.get("cadet_id"),
            data.get("training_id")
        )
        for data in existing["attendance"].values()
    }

    # =================================================
    # PREPARE RECORD
    # =================================================

    def add(collection, key, fields):

        nonlocal skipped

        fields = clean_data(
            collection,
            fields,
            creating=True
        )

        if key in existing[collection]:

            skipped += 1

            return key

        if collection == "cadets":

            code = fields["student_id"]

            if code in student_ids:

                skipped += 1

                return student_ids[code]

            student_ids[code] = key

        if collection == "users":

            code = fields["staff_code"]

            if code in staff_codes:

                skipped += 1

                return staff_codes[code]

            staff_codes[code] = key

        if collection == "attendance":

            pair = (
                fields["cadet_id"],
                fields["training_id"]
            )

            if pair in attendance_pairs:

                skipped += 1

                return None

            attendance_pairs.add(pair)

        fields["created_at"] = now
        fields["updated_at"] = now

        reference = db.collection(
            collection
        ).document(key)

        pending.append(
            (reference, fields)
        )

        existing[collection][key] = fields

        return key

    # =================================================
    # 120 CADETS
    # =================================================

    print("\n[2/6] Preparing 120 cadets...")

    cadet_ids = []

    for i in range(1, 121):

        first_name = FIRST_NAMES[
            (i - 1) % len(FIRST_NAMES)
        ]

        last_name = LAST_NAMES[
            ((i - 1) // len(FIRST_NAMES))
            % len(LAST_NAMES)
        ]

        cadet_id = add(
            "cadets",
            f"demo-cadet-{i:03}",
            {
                "student_id": f"DEMO-{i:03}",

                "full_name": (
                    f"{first_name} {last_name}"
                ),

                "course": COURSES[
                    (i - 1) % len(COURSES)
                ],

                "year_level": (
                    (i - 1) % 4
                ) + 1,

                "platoon": PLATOONS[
                    ((i - 1) // 4) % 4
                ],

                "status": (
                    "Inactive"
                    if i % 13 == 0
                    else "Active"
                )
            }
        )

        cadet_ids.append(cadet_id)

    # =================================================
    # 12 TRAINING SCHEDULES
    # =================================================

    print("[3/6] Preparing 12 training schedules...")

    training_ids = []

    for i, title in enumerate(TOPICS, 1):

        training_id = add(
            "training_schedules",
            f"demo-training-{i:02}",
            {
                "title": title,

                "training_date": str(
                    date.today()
                    + timedelta(days=(i - 7) * 7)
                ),

                "start_time": "07:00",

                "location": "Campus Training Grounds",

                "instructor": "Demo Training Officer",

                "description": (
                    f"Scheduled {title.lower()} "
                    "activity for ROTC cadets."
                )
            }
        )

        training_ids.append(training_id)

    # =================================================
    # 240 ATTENDANCE RECORDS
    # =================================================

    print("[4/6] Preparing 240 attendance records...")

    statuses = [
        "Present",
        "Present",
        "Present",
        "Present",
        "Present",
        "Late",
        "Absent",
        "Excused"
    ]

    remarks = {
        "Present": "Attended training session.",
        "Late": "Arrived after scheduled time.",
        "Absent": "Did not attend training.",
        "Excused": "Approved absence."
    }

    for i, cadet_id in enumerate(cadet_ids, 1):

        for j in (1, 2):

            status = statuses[
                (i + j) % len(statuses)
            ]

            add(
                "attendance",
                f"demo-attendance-{i:03}-{j}",
                {
                    "cadet_id": cadet_id,

                    "training_id": training_ids[j - 1],

                    "status": status,

                    "remarks": remarks[status]
                }
            )

    # =================================================
    # 20 ANNOUNCEMENTS
    # =================================================

    print("[5/6] Preparing announcements and personnel...")

    for i in range(1, 21):

        topic = TOPICS[
            (i - 1) % len(TOPICS)
        ]

        add(
            "announcements",
            f"demo-news-{i:02}",
            {
                "title": f"Announcement: {topic}",

                "content": (
                    f"All concerned ROTC cadets are "
                    f"advised to prepare for {topic.lower()}. "
                    "Please observe the scheduled time "
                    "and coordinate with your platoon leader. "
                    "This is a fictional demonstration notice."
                ),

                "date_posted": str(
                    date.today() - timedelta(days=i)
                ),

                "category": [
                    "General",
                    "Training",
                    "Urgent"
                ][i % 3]
            }
        )

    # =================================================
    # 10 PERSONNEL
    # =================================================

    designations = [
        "Training Officer",
        "Administrative Staff",
        "Attendance Coordinator",
        "ROTC Coordinator",
        "Platoon Adviser"
    ]

    for i in range(1, 11):

        add(
            "users",
            f"demo-staff-{i:02}",
            {
                "staff_code": f"DEMO-STAFF-{i:02}",

                "full_name": f"Demo Personnel {i:02}",

                "designation": designations[
                    (i - 1) % len(designations)
                ]
            }
        )

    # =================================================
    # FIRESTORE BATCH WRITE
    # =================================================

    print("\n[6/6] Saving records to Firestore...")

    total = len(pending)

    created = 0

    batch_size = 100

    for start in range(0, total, batch_size):

        batch = db.batch()

        chunk = pending[
            start:start + batch_size
        ]

        for reference, fields in chunk:

            # Create only; never overwrite documents.
            batch.create(reference, fields)

        batch.commit(timeout=60)

        created += len(chunk)

        print(
            f"  Progress: {created}/{total} records saved"
        )

    # =================================================
    # FINAL SUMMARY
    # =================================================

    print("\n======================================")
    print(" SAMPLE DATA IMPORT COMPLETED")
    print("======================================")

    print(f"New records created: {created}")
    print(f"Existing records skipped: {skipped}")

    print("\nCollection totals:")

    for collection in COLLECTIONS:

        print(
            f"  {collection}: "
            f"{len(existing[collection])}"
        )

    print("\nExisting records were not overwritten.")
    print("ROTC Command is ready!")
    print("======================================\n")


if __name__ == "__main__":

    try:

        main()

    except KeyboardInterrupt:

        print("\nImport interrupted.")
        print("You can safely run the command again.")

    except Exception as error:

        print(f"\n[ERROR] {error}")

        raise SystemExit(1)
