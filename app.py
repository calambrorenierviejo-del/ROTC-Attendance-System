
import os
import re
import secrets
from datetime import date, datetime
from pathlib import Path

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    session
)

from dotenv import load_dotenv
from firebase_config import get_db


# =====================================================
# 1. FLASK CONFIGURATION
# =====================================================

BASE = Path(__file__).resolve().parent

load_dotenv(BASE / ".env", override=True)

app = Flask(__name__)

# Automatically generate a Flask session key.
# No SECRET_KEY is required in the .env file.
# Sessions reset whenever the application restarts.
app.secret_key = secrets.token_hex(32)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=(
        os.getenv("COOKIE_SECURE", "false").lower() == "true"
    ),
    MAX_CONTENT_LENGTH=1024 * 1024
)


# =====================================================
# 2. FIRESTORE COLLECTION SCHEMAS
# =====================================================

SCHEMAS = {

    "cadets": {
        "fields": {
            "student_id": "text",
            "full_name": "text",
            "course": "text",
            "year_level": "integer",
            "platoon": "text",
            "status": "cadet_status"
        },
        "required": [
            "student_id",
            "full_name",
            "course",
            "year_level",
            "platoon",
            "status"
        ],
        "unique": "student_id"
    },

    "training_schedules": {
        "fields": {
            "title": "text",
            "training_date": "date",
            "start_time": "time",
            "location": "text",
            "instructor": "text",
            "description": "optional_text"
        },
        "required": [
            "title",
            "training_date",
            "start_time",
            "location",
            "instructor"
        ]
    },

    "attendance": {
        "fields": {
            "cadet_id": "cadet_ref",
            "training_id": "training_ref",
            "status": "attendance_status",
            "remarks": "optional_text"
        },
        "required": [
            "cadet_id",
            "training_id",
            "status"
        ]
    },

    "announcements": {
        "fields": {
            "title": "text",
            "content": "text",
            "date_posted": "date",
            "category": "category"
        },
        "required": [
            "title",
            "content",
            "date_posted",
            "category"
        ]
    },

    "users": {
        "fields": {
            "staff_code": "text",
            "full_name": "text",
            "designation": "text"
        },
        "required": [
            "staff_code",
            "full_name",
            "designation"
        ],
        "unique": "staff_code"
    }
}


# =====================================================
# 3. API HELPERS
# =====================================================

class ApiError(Exception):

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def reply(data=None, status=200, message="Success"):

    return jsonify({
        "success": True,
        "message": message,
        "data": data
    }), status


def check_resource(resource):

    if resource not in SCHEMAS:
        raise ApiError("Unknown collection", 404)


def require_csrf():

    provided = request.headers.get(
        "X-CSRF-Token", ""
    )

    expected = session.get("csrf", "")

    if not expected or not secrets.compare_digest(
        provided, expected
    ):
        raise ApiError(
            "Invalid security token. Refresh and try again.",
            403
        )


# =====================================================
# 4. INPUT VALIDATION
# =====================================================

def clean_data(resource, payload, creating=False):

    check_resource(resource)

    if not isinstance(payload, dict):
        raise ApiError("A JSON object is required.")

    schema = SCHEMAS[resource]

    if creating:

        missing = [
            field
            for field in schema["required"]
            if not str(payload.get(field, "")).strip()
        ]

        if missing:
            raise ApiError(
                "Required fields: " + ", ".join(missing)
            )

    result = {}

    for field, kind in schema["fields"].items():

        if field not in payload:
            continue

        raw = payload[field]

        if not isinstance(raw, (str, int)) or isinstance(raw, bool):
            raise ApiError(
                f"{field} has an invalid value"
            )

        value = str(raw).strip()

        if field in schema["required"] and not value:
            raise ApiError(
                f"{field} is required"
            )

        max_length = (
            3000
            if field in ("content", "description", "remarks")
            else 180
        )

        if len(value) > max_length:
            raise ApiError(
                f"{field} is too long"
            )

        if kind == "integer":

            if not value.isdigit():
                raise ApiError(
                    "Year level must be a number"
                )

            number = int(value)

            if not 1 <= number <= 4:
                raise ApiError(
                    "Year level must be between 1 and 4"
                )

            result[field] = number
            continue

        if kind == "date" and value:

            try:
                date.fromisoformat(value)
            except ValueError:
                raise ApiError(
                    f"{field} must be a valid YYYY-MM-DD date"
                )

        if kind == "time" and value:

            try:
                datetime.strptime(value, "%H:%M")
            except ValueError:
                raise ApiError(
                    "Time must use HH:MM format"
                )

        choices = {
            "cadet_status": [
                "Active",
                "Inactive"
            ],
            "attendance_status": [
                "Present",
                "Late",
                "Absent",
                "Excused"
            ],
            "category": [
                "General",
                "Training",
                "Urgent"
            ]
        }

        if kind in choices and value not in choices[kind]:
            raise ApiError(
                f"Invalid {field}"
            )

        result[field] = value

    if not result:
        raise ApiError(
            "No valid fields supplied"
        )

    return result


# =====================================================
# 5. FIRESTORE RECORD HELPERS
# =====================================================

def get_record(resource, record_id):

    check_resource(resource)

    snapshot = (
        get_db()
        .collection(resource)
        .document(record_id)
        .get()
    )

    if not snapshot.exists:
        raise ApiError(
            "Record not found",
            404
        )

    return {
        "id": snapshot.id,
        **(snapshot.to_dict() or {})
    }


def public_record(resource, record):

    result = dict(record)

    # Never expose a legacy password hash.
    if resource == "users":
        result.pop("password_hash", None)
        result.pop("password", None)

    return result


# =====================================================
# 6. VALIDATE DOCUMENT REFERENCES
# =====================================================

def validate_refs(resource, data):

    if resource != "attendance":
        return

    references = [
        ("cadet_id", "cadets"),
        ("training_id", "training_schedules")
    ]

    for key, collection in references:

        if key not in data:
            continue

        exists = (
            get_db()
            .collection(collection)
            .document(data[key])
            .get()
            .exists
        )

        if not exists:
            raise ApiError(
                f"{key} does not reference an existing record"
            )


# =====================================================
# 7. UNIQUE FIELD VALIDATION
# =====================================================

def validate_unique(resource, data, exclude_id=None):

    key = SCHEMAS[resource].get("unique")

    if not key or key not in data:
        return

    matches = (
        get_db()
        .collection(resource)
        .where(key, "==", data[key])
        .stream()
    )

    for document in matches:

        if document.id != exclude_id:
            raise ApiError(
                f"{key} already exists",
                409
            )


# =====================================================
# 8. PREVENT DUPLICATE ATTENDANCE
# =====================================================

def validate_attendance_duplicate(data, exclude_id=None):

    if "cadet_id" not in data or "training_id" not in data:
        return

    records = (
        get_db()
        .collection("attendance")
        .where("cadet_id", "==", data["cadet_id"])
        .stream()
    )

    for document in records:

        existing = document.to_dict() or {}

        if (
            document.id != exclude_id
            and existing.get("training_id") == data["training_id"]
        ):
            raise ApiError(
                "Attendance already exists for this cadet "
                "and training session.",
                409
            )


# =====================================================
# 9. SAFE DELETE VALIDATION
# =====================================================

def validate_delete(resource, record_id):

    relationships = {
        "cadets": (
            "attendance",
            "cadet_id"
        ),
        "training_schedules": (
            "attendance",
            "training_id"
        )
    }

    if resource not in relationships:
        return

    child_collection, key = relationships[resource]

    related = (
        get_db()
        .collection(child_collection)
        .where(key, "==", record_id)
        .limit(1)
        .stream()
    )

    if next(iter(related), None):
        raise ApiError(
            "Delete related attendance records first.",
            409
        )


# =====================================================
# 10. ERROR HANDLING
# =====================================================

@app.errorhandler(ApiError)
def api_error(error):

    return jsonify({
        "success": False,
        "message": error.message
    }), error.status


@app.errorhandler(413)
def too_large(error):

    return jsonify({
        "success": False,
        "message": "Request is too large"
    }), 413


@app.errorhandler(Exception)
def unhandled(error):

    app.logger.exception("Request failed")

    if request.path.startswith("/api/"):

        return jsonify({
            "success": False,
            "message": "Server error. Check Flask logs."
        }), 500

    return "Internal server error", 500


# =====================================================
# 11. MAIN DASHBOARD - NO LOGIN
# =====================================================

@app.get("/")
def index():

    session.setdefault(
        "csrf",
        secrets.token_urlsafe(32)
    )

    return render_template(
        "index.html",
        csrf=session["csrf"],
        name="ROTC Command"
    )


# =====================================================
# 12. READ ALL RECORDS
# =====================================================

@app.get("/api/<resource>")
def list_records(resource):

    check_resource(resource)

    records = []

    documents = (
        get_db()
        .collection(resource)
        .stream()
    )

    for document in documents:

        record = {
            "id": document.id,
            **(document.to_dict() or {})
        }

        records.append(
            public_record(resource, record)
        )

    search = (
        request.args.get("q", "")
        .strip()
        .casefold()
    )

    if search:

        records = [
            record
            for record in records
            if any(
                search in str(value).casefold()
                for value in record.values()
            )
        ]

    records.sort(
        key=lambda record: str(
            record.get("created_at", "")
        ),
        reverse=True
    )

    return reply(records)


# =====================================================
# 13. READ SINGLE RECORD
# =====================================================

@app.get("/api/<resource>/<record_id>")
def one_record(resource, record_id):

    check_resource(resource)

    record = get_record(
        resource,
        record_id
    )

    return reply(
        public_record(resource, record)
    )


# =====================================================
# 14. CREATE RECORD
# =====================================================

@app.post("/api/<resource>")
def create_record(resource):

    check_resource(resource)
    require_csrf()

    payload = request.get_json(silent=True)

    data = clean_data(
        resource,
        payload,
        creating=True
    )

    validate_refs(resource, data)
    validate_unique(resource, data)

    if resource == "attendance":
        validate_attendance_duplicate(data)

    now = datetime.now().isoformat(
        timespec="seconds"
    )

    data["created_at"] = now
    data["updated_at"] = now

    document_ref = (
        get_db()
        .collection(resource)
        .document()
    )

    document_ref.set(data)

    created = {
        "id": document_ref.id,
        **data
    }

    return reply(
        public_record(resource, created),
        201,
        "Record created successfully"
    )


# =====================================================
# 15. UPDATE RECORD
# =====================================================

@app.put("/api/<resource>/<record_id>")
def update_record(resource, record_id):

    check_resource(resource)
    require_csrf()

    existing = get_record(
        resource,
        record_id
    )

    payload = request.get_json(silent=True)

    data = clean_data(
        resource,
        payload,
        creating=False
    )

    validate_refs(resource, data)

    validate_unique(
        resource,
        data,
        record_id
    )

    if resource == "attendance":

        merged = {
            **existing,
            **data
        }

        validate_attendance_duplicate(
            merged,
            record_id
        )

    data["updated_at"] = (
        datetime.now()
        .isoformat(timespec="seconds")
    )

    (
        get_db()
        .collection(resource)
        .document(record_id)
        .update(data)
    )

    updated = get_record(
        resource,
        record_id
    )

    return reply(
        public_record(resource, updated),
        message="Record updated successfully"
    )


# =====================================================
# 16. DELETE RECORD
# =====================================================

@app.delete("/api/<resource>/<record_id>")
def delete_record(resource, record_id):

    check_resource(resource)
    require_csrf()

    get_record(resource, record_id)

    validate_delete(
        resource,
        record_id
    )

    (
        get_db()
        .collection(resource)
        .document(record_id)
        .delete()
    )

    return reply(
        message="Record deleted successfully"
    )


# =====================================================
# 17. RUN FLASK APPLICATION
# =====================================================

if __name__ == "__main__":

    debug_mode = (
        os.getenv("FLASK_DEBUG", "false").lower()
        == "true"
    )

    port = int(
        os.getenv("PORT", "5000")
    )

    app.run(
        debug=debug_mode,
        host="127.0.0.1",
        port=port
    )
