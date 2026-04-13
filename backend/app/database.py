import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# SR Database Configuration
script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    DB_PATH = script_dir + "/industrial_dashboard.db"
except:
    DB_PATH = os.path.join(script_dir, "industrial_dashboard.db")

print(f"SR FazoLuxe - Database path: {DB_PATH}")

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False, "timeout": 30}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()