"""
Creates the first (or any new) HR user account from the command line.

There is deliberately no open '/auth/register' API endpoint -- HR accounts
should be created by an admin/IT, not via self-signup, otherwise anyone
could create an account and gain access to the system.

How to run (from inside the backend folder, with a .env file already set
up -- see .env.example):

    python scripts/create_hr_user.py hr@ihmcl.com
"""

import sys
import os

# So the 'app' package can be imported when this script is run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env BEFORE importing anything from app.* -- those modules read
# DATABASE_URL etc. with os.getenv() at import time.
from dotenv import load_dotenv
load_dotenv()

import getpass

from app.db.session import SessionLocal
from app.db.base import Base
from app.db.session import engine
from app.models.hr_user import HRUser
from app.models import job_profile  # noqa: F401 -- Base needs to see all models
from app.services.auth_service import hash_password


def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/create_hr_user.py <email>")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    password = getpass.getpass("Set password: ")
    password_confirm = getpass.getpass("Re-enter password: ")

    if password != password_confirm:
        print("Passwords do not match. Please try again.")
        sys.exit(1)

    if len(password) < 8:
        print("Password must be at least 8 characters long.")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)  # ensures the hr_users table exists

    db = SessionLocal()
    try:
        existing = db.query(HRUser).filter(HRUser.email == email).first()
        if existing:
            print(f"An account with the email '{email}' already exists.")
            sys.exit(1)

        user = HRUser(email=email, password_hash=hash_password(password))
        db.add(user)
        db.commit()
        print(f"HR account created: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
