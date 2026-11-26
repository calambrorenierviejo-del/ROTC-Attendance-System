# ROTC Command — finalized interface
Python 3.11+ / Flask / Firebase Firestore. Existing app.py, firebase_config.py and init_firestore.py are unchanged. No login: local use only.

1. Open this folder in PyCharm. Copy .env.example to .env (or retain your existing .env).
2. Place a NEW Firebase service account key named ServiceAccountKey.json in this folder. Revoke the previously shared key in Google Cloud IAM. Never commit the key.
3. Run `python -m pip install -r requirements.txt`.
4. Run `python init_firestore.py` to verify connection.
5. Optional: use a test Firestore database/project, then run `python seed_demo.py --confirm` to insert 402 fictional records (120 cadets, 12 schedules, 240 attendance, 20 announcements, 10 personnel). Existing documents are not overwritten. The script is separate from the app and does not run automatically.
6. Run `python app.py` and visit http://127.0.0.1:5000.

Search, filters, pagination, CSV export (all filtered records), print (current page), modal CRUD and dashboard use existing API routes. Delete linked attendance before deleting a cadet or schedule. No live Firebase test was performed during packaging.
