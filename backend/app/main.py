from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, date
from typing import List, Optional
from contextlib import asynccontextmanager
from jose import jwt, JWTError
import bcrypt
from . import models, schemas, database, reports
from .schemas import CustomPDFRequest
import json
import asyncio
import socket
import threading
import time
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import io
import uuid

SAVED_PDFS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "saved_pdfs")
os.makedirs(SAVED_PDFS_DIR, exist_ok=True)
SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app_settings.json")

ALL_SECTIONS = [
    "dashboard",
    "mechanic",
    "uzlavyaz",
    "system",
    "master",
    "nazoratchi",
    "users",
    "reports",
    "admin",
]

DEFAULT_SETTINGS = {
    "company_name": "FazoLuxe",
    "logo_text": "SR",
    "notification_duration": 10,
    "banner_enabled": False,
    "banner_message": "",
    "banner_duration": 5,
    "banner_color": "#00d2ff",
    "banner_bg": "rgba(0,210,255,0.15)",
    "role_sections": {
        "ADMIN": ALL_SECTIONS,
        "MASTER": ["dashboard", "mechanic", "master", "reports"],
        "NAZORATCHI": ["dashboard", "nazoratchi", "users", "reports", "mechanic"],
        "MECHANIC": ["dashboard", "mechanic", "system"],
        "ELECTRIC": ["dashboard", "mechanic", "system"],
        "UZLAVYAZ": ["dashboard", "uzlavyaz", "mechanic", "reports"],
    },
}


def _clone_default_settings():
    return json.loads(json.dumps(DEFAULT_SETTINGS))


def load_settings():
    settings = _clone_default_settings()

    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                stored = json.load(f)
            if isinstance(stored, dict):
                for key, value in stored.items():
                    if key == "role_sections" and isinstance(value, dict):
                        for role, sections in value.items():
                            if isinstance(sections, list):
                                settings["role_sections"][role] = [str(section) for section in dict.fromkeys(sections)]
                    else:
                        settings[key] = value
        except Exception:
            pass
    else:
        save_settings(settings)

    return settings


def save_settings(settings: dict):
    normalized = _clone_default_settings()

    if isinstance(settings, dict):
        for key, value in settings.items():
            if key == "role_sections" and isinstance(value, dict):
                for role, sections in value.items():
                    if isinstance(sections, list):
                        normalized["role_sections"][role] = [str(section) for section in dict.fromkeys(sections)]
            else:
                normalized[key] = value

    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)

    return normalized


def get_remaining_asnova(machine: models.Machine) -> float:
    initial = machine.initial_asnova_length or 0.0
    current = machine.current_total_meters or 0.0
    at_fill = machine.meters_at_fill or 0.0
    return max(0.0, initial - (current - at_fill))


def machine_has_tracked_asnova(machine: models.Machine) -> bool:
    return (machine.initial_asnova_length or 0.0) > 0


def get_machine_status(machine: models.Machine, now: Optional[datetime] = None) -> str:
    now = now or datetime.utcnow()
    is_esp_online = machine.last_seen and (now - machine.last_seen).total_seconds() < 60

    if not is_esp_online:
        return "OFFLINE"
    if (machine.current_baud or 0) == 0:
        return "ESP_ONLINE_NO_SIGNAL"
    if machine_has_tracked_asnova(machine) and get_remaining_asnova(machine) <= 0:
        return "ASNOVA_EMPTY"
    return "RUNNING"


def ensure_open_asnova_event(db: Session, machine_id: str):
    existing = db.query(models.AsnovaEmptyEvent).filter(
        models.AsnovaEmptyEvent.machine_id == machine_id,
        models.AsnovaEmptyEvent.filled_at == None
    ).order_by(models.AsnovaEmptyEvent.empty_at.desc()).first()
    if existing:
        return existing

    event = models.AsnovaEmptyEvent(machine_id=machine_id)
    db.add(event)
    return event


def close_open_asnova_event(db: Session, machine_id: str, filled_by: Optional[int] = None):
    existing = db.query(models.AsnovaEmptyEvent).filter(
        models.AsnovaEmptyEvent.machine_id == machine_id,
        models.AsnovaEmptyEvent.filled_at == None
    ).order_by(models.AsnovaEmptyEvent.empty_at.desc()).first()

    if not existing:
        return None

    filled_at = datetime.utcnow()
    existing.filled_at = filled_at
    existing.filled_by = filled_by
    existing.delay_minutes = int((filled_at - existing.empty_at).total_seconds() / 60)
    return existing

def seed_data_sync():
    """Seed initial data on startup."""
    db = database.SessionLocal()
    try:
        load_settings()
        admin = db.query(models.User).filter(models.User.username == "SvRvS3003").first()
        if not admin:
            admin_user = models.User(
                username="SvRvS3003",
                password_hash=bcrypt.hashpw("Saidakbar3003!".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
                full_name="Admin",
                role=models.UserRole.ADMIN
            )
            db.add(admin_user)
            db.commit()
        if db.query(models.Machine).count() == 0:
            cat = models.Category(name="Default")
            db.add(cat)
            db.commit()
            for i in range(1, 69):
                m = models.Machine(id=f"S{i}", category_id=cat.id, status="STOPPED")
                db.add(m)
            db.commit()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    seed_data_sync()
    yield
    # Shutdown (cleanup if needed)

async def broadcast_ws():
    if not active_connections:
        return
    db = database.SessionLocal()
    try:
        machines = db.query(models.Machine).all()
        data = []
        now = datetime.utcnow()
        for m in machines:
            remaining = get_remaining_asnova(m)
            status = get_machine_status(m, now)
            data.append({
                "id": m.id, "status": status,
                "meters": round(m.current_total_meters, 2),
                "shift_meters": round(m.shift_meters, 2),
                "remaining": round(remaining, 2),
                "baud": m.current_baud, "protocol": m.current_protocol,
                "connection_source": m.connection_source,
                "preferred_source": m.preferred_source,
                "sys_info": {
                    "ram": {"free": m.esp_free_ram, "total": m.esp_total_ram},
                    "rom": {"free": m.esp_free_rom, "total": m.esp_total_rom},
                    "cpu": m.esp_cpu_freq,
                    "wifi": {"ssid": m.esp_wifi_ssid, "rssi": m.esp_wifi_rssi}
                }
            })
        msg = json.dumps(data)
        for ws in list(active_connections):
            try:
                await ws.send_text(msg)
            except:
                active_connections.remove(ws)
    finally:
        db.close()

def broadcast_priority(machine_id: str):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        interfaces = ["192.168.1.255", "192.168.4.255"]
        message = f"PRIORITY:{machine_id}".encode()
        for ip in interfaces:
            sock.sendto(message, (ip, 4444))
        sock.close()
    except Exception as e:
        print(f"UDP Broadcast Error: {e}")

SECRET_KEY = "SUPER_SECRET_KEY_CHANGEME"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 300

class MachineUpdate(BaseModel):
    meters: float
    shift_meters: float = 0.0
    baud: int = 0
    protocol: str = "UNKNOWN"
    free_ram: int = 0
    total_ram: int = 0
    free_rom: int = 0
    total_rom: int = 0
    cpu_freq: int = 0
    wifi_ssid: str = ""
    wifi_rssi: int = 0
    connection_source: str = "WIFI"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
app = FastAPI(title="Industrial Dashboard API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
models.Base.metadata.create_all(bind=database.engine)
active_connections = []

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

def require_role(*roles):
    def checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return checker

def get_week_start(d: date = None) -> str:
    if d is None:
        d = date.today()
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat()


def serialize_rest_day(rest_day: models.RestDay, db: Session):
    operator_name = ""
    user_name = ""
    person_type = ""

    if rest_day.operator_id:
        operator = db.query(models.Operator).filter(models.Operator.id == rest_day.operator_id).first()
        operator_name = operator.name if operator else ""
        person_type = "operator"

    if rest_day.user_id:
        user = db.query(models.User).filter(models.User.id == rest_day.user_id).first()
        user_name = user.full_name if user else ""
        operator_name = user_name or operator_name
        person_type = "user"

    return schemas.RestDayOut(
        id=rest_day.id,
        operator_id=rest_day.operator_id,
        user_id=rest_day.user_id,
        day_of_week=rest_day.day_of_week,
        week_start=rest_day.week_start,
        operator_name=operator_name,
        user_name=user_name,
        person_type=person_type,
    )

# ─── AUTH ───
@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})
    access_token = create_access_token(data={"sub": user.username}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.get("/settings")
async def get_settings(current_user: models.User = Depends(get_current_user)):
    return load_settings()


@app.put("/settings")
async def update_settings(data: dict, current_user: models.User = Depends(require_role(models.UserRole.ADMIN))):
    settings = load_settings()

    for key, value in data.items():
        if key == "role_sections":
            continue
        settings[key] = value

    return save_settings(settings)


@app.put("/settings/role-sections")
async def update_role_sections(data: dict, current_user: models.User = Depends(require_role(models.UserRole.ADMIN))):
    role = data.get("role")
    sections = data.get("sections", [])

    if not role or not isinstance(sections, list):
        raise HTTPException(status_code=400, detail="role and sections are required")

    settings = load_settings()
    settings.setdefault("role_sections", {})
    settings["role_sections"][role] = [str(section) for section in dict.fromkeys(sections)]
    return save_settings(settings)


@app.put("/settings/banner")
async def update_banner_settings(data: dict, current_user: models.User = Depends(require_role(models.UserRole.ADMIN))):
    settings = load_settings()
    banner_mapping = {
        "enabled": "banner_enabled",
        "message": "banner_message",
        "duration": "banner_duration",
        "color": "banner_color",
        "background": "banner_bg",
    }

    for incoming_key, settings_key in banner_mapping.items():
        if incoming_key in data:
            settings[settings_key] = data[incoming_key]

    return save_settings(settings)

# ─── USER MANAGEMENT ───
@app.get("/users", response_model=List[schemas.User])
async def list_users(db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    if current_user.role == models.UserRole.NAZORATCHI:
        return db.query(models.User).filter(models.User.role != models.UserRole.ADMIN).all()
    return db.query(models.User).all()

@app.post("/users", response_model=schemas.User)
async def create_user(data: schemas.UserCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    if current_user.role == models.UserRole.NAZORATCHI and data.role == models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Nazoratchi cannot create admin users")
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    shift_type = data.shift_type if data.shift_type else "KUNDUZ"
    user = models.User(username=data.username, password_hash=get_password_hash(data.password), full_name=data.full_name, role=data.role, shift_type=shift_type)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@app.put("/users/{user_id}", response_model=schemas.User)
async def update_user(user_id: int, data: schemas.UserUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role == models.UserRole.NAZORATCHI and user.role == models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Nazoratchi cannot edit admin users")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        if current_user.role == models.UserRole.NAZORATCHI and data.role == models.UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Nazoratchi cannot assign admin role")
        user.role = data.role
    if data.password is not None:
        user.password_hash = get_password_hash(data.password)
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.shift_type is not None:
        user.shift_type = data.shift_type
    db.commit()
    db.refresh(user)
    return user

@app.delete("/users/{user_id}")
async def delete_user(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if current_user.role == models.UserRole.NAZORATCHI and user.role == models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Nazoratchi cannot delete admin users")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

# ─── OPERATOR MANAGEMENT ───
@app.get("/operators", response_model=List[schemas.OperatorOut])
async def list_operators(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Operator).all()

@app.post("/operators", response_model=schemas.OperatorOut)
async def create_operator(data: schemas.OperatorCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.MASTER))):
    op = models.Operator(name=data.name, phone=data.phone, shift_type=data.shift_type, position=data.position)
    db.add(op)
    db.commit()
    db.refresh(op)
    return op

@app.put("/operators/{op_id}", response_model=schemas.OperatorOut)
async def update_operator(op_id: int, data: schemas.OperatorUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.MASTER))):
    op = db.query(models.Operator).filter(models.Operator.id == op_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    if data.name is not None:
        op.name = data.name
    if data.phone is not None:
        op.phone = data.phone
    if data.is_active is not None:
        op.is_active = data.is_active
    if data.shift_type is not None:
        op.shift_type = data.shift_type
    if data.position is not None:
        op.position = data.position
    db.commit()
    db.refresh(op)
    return op

@app.delete("/operators/{op_id}")
async def delete_operator(op_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.MASTER))):
    op = db.query(models.Operator).filter(models.Operator.id == op_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    db.delete(op)
    db.commit()
    return {"message": "Operator deleted"}

# ─── ATTENDANCE ───
@app.get("/attendance")
async def list_attendance(month: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if not month:
        month = datetime.utcnow().strftime("%Y-%m")
    records = db.query(models.Attendance).filter(models.Attendance.date.like(f"{month}%")).all()
    return [{"id": r.id, "worker_id": r.worker_id, "date": r.date, "status": r.status} for r in records]

@app.post("/attendance")
async def set_attendance(data: schemas.AttendanceSet, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.MASTER))):
    existing = db.query(models.Attendance).filter(models.Attendance.worker_id == data.worker_id, models.Attendance.date == data.date).first()
    if existing:
        existing.status = data.status
        db.commit()
        return {"message": "Attendance updated", "id": existing.id}
    record = models.Attendance(worker_id=data.worker_id, date=data.date, status=data.status)
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"message": "Attendance set", "id": record.id}

@app.post("/attendance/bulk")
async def bulk_attendance(records: List[schemas.AttendanceSet], db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.MASTER))):
    for data in records:
        existing = db.query(models.Attendance).filter(models.Attendance.worker_id == data.worker_id, models.Attendance.date == data.date).first()
        if existing:
            existing.status = data.status
        else:
            db.add(models.Attendance(worker_id=data.worker_id, date=data.date, status=data.status))
    db.commit()
    return {"message": f"{len(records)} records saved"}

@app.get("/attendance/export")
async def export_attendance_excel(month: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    import pandas as pd
    if not month:
        month = datetime.utcnow().strftime("%Y-%m")
    workers = db.query(models.Operator).filter(models.Operator.is_active == 1).all()
    records = db.query(models.Attendance).filter(models.Attendance.date.like(f"{month}%")).all()
    lookup = {}
    for r in records:
        lookup[(r.worker_id, r.date)] = r.status
    
    # Get rest days for this month
    year, mon = map(int, month.split('-'))
    import calendar
    days_in_month = calendar.monthrange(year, mon)[1]
    rest_days = db.query(models.RestDay).all()
    rest_lookup = {}
    for rd in rest_days:
        if rd.operator_id:
            # Calculate the date for this rest day in the given month
            first_of_month = datetime(year, mon, 1)
            # Find all Mondays of the month and check which one matches week_start
            for d in range(1, days_in_month + 1):
                date = datetime(year, mon, d)
                if date.weekday() == rd.day_of_week:
                    # This is the day of week for this rest day in this month
                    week_start = date - timedelta(days=date.weekday())
                    if rd.week_start == week_start.strftime("%Y-%m-%d"):
                        date_str = f"{month}-{d:02d}"
                        if rd.operator_id not in rest_lookup:
                            rest_lookup[rd.operator_id] = set()
                        rest_lookup[rd.operator_id].add(date_str)
    
    rows = []
    for w in workers:
        row = {"Ism": w.name, "Lavozim": w.position, "Smena": w.shift_type}
        present_count = 0
        for d in range(1, days_in_month + 1):
            date_str = f"{month}-{d:02d}"
            status = lookup.get((w.id, date_str), "")
            # Check rest days
            if not status and w.id in rest_lookup and date_str in rest_lookup[w.id]:
                status = "REST"
            if status == "PRESENT":
                row[f"{d}"] = "+"
                present_count += 1
            elif status == "ABSENT":
                row[f"{d}"] = "-"
            elif status == "REST":
                row[f"{d}"] = "D"
            else:
                row[f"{d}"] = ""
        row["Jami ish kuni"] = present_count
        rows.append(row)
    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=f'Tabel {month}')
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            headers={"Content-Disposition": f"attachment; filename=tabel_{month}.xlsx"})

# ─── ASSIGNMENTS ───
@app.get("/assignments", response_model=List[schemas.AssignmentOut])
async def list_assignments(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    assignments = db.query(models.Assignment).filter(models.Assignment.is_active == 1).all()
    result = []
    for a in assignments:
        result.append(schemas.AssignmentOut(
            id=a.id, operator_id=a.operator_id, machine_id=a.machine_id,
            shift_type=a.shift_type, is_active=a.is_active, assigned_at=a.assigned_at,
            operator_name=a.operator.name if a.operator else ""
        ))
    return result

@app.post("/assignments", response_model=List[schemas.AssignmentOut])
async def create_assignment(data: schemas.AssignmentCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.MASTER))):
    operator = db.query(models.Operator).filter(models.Operator.id == data.operator_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    shift = operator.shift_type
    results = []
    for mid in data.machine_ids:
        # Check if already assigned to ANYONE else (prevent double binding)
        existing = db.query(models.Assignment).filter(
            models.Assignment.machine_id == mid,
            models.Assignment.shift_type == shift,
            models.Assignment.is_active == 1
        ).first()
        if existing and existing.operator_id != data.operator_id:
            raise HTTPException(status_code=400, detail=f"Stanok {mid} boshqa operatorga biriktirilgan!")
        
        # Deactivate old assignments for THIS operator before adding new one
        old_for_same = db.query(models.Assignment).filter(
            models.Assignment.machine_id == mid,
            models.Assignment.shift_type == shift,
            models.Assignment.is_active == 1,
            models.Assignment.operator_id == data.operator_id
        ).all()
        for e in old_for_same:
            e.is_active = 0
            
        a = models.Assignment(operator_id=data.operator_id, machine_id=mid, shift_type=shift)
        db.add(a)
        db.flush()
        results.append(schemas.AssignmentOut(id=a.id, operator_id=a.operator_id, machine_id=a.machine_id, shift_type=a.shift_type, is_active=a.is_active, assigned_at=a.assigned_at, operator_name=""))
    db.commit()
    return results

@app.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.MASTER))):
    a = db.query(models.Assignment).filter(models.Assignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    a.is_active = 0
    db.commit()
    return {"message": "Assignment removed"}

# ─── REST DAYS ───
@app.get("/rest-days", response_model=List[schemas.RestDayOut])
async def list_rest_days(week_start: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    ws = week_start or get_week_start()
    days = db.query(models.RestDay).filter(models.RestDay.week_start == ws).all()
    return [serialize_rest_day(day, db) for day in days]

@app.post("/rest-days")
async def set_rest_day(data: schemas.RestDaySet, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    if data.person_id and data.person_type:
        op_id = data.person_id
        is_user = data.person_type == 'user'
    else:
        op_id = data.operator_id or data.user_id
        is_user = bool(data.user_id)
    
    if not op_id or not data.week_start:
        return {"message": "operator_id/user_id and week_start required", "action": "error"}
    
    existing = db.query(models.RestDay).filter(
        models.RestDay.operator_id == (None if is_user else op_id),
        models.RestDay.user_id == (op_id if is_user else None),
        models.RestDay.week_start == data.week_start,
        models.RestDay.day_of_week == data.day_of_week
    ).first()
    
    if existing:
        return {"message": "Dam kun allaqachon belgilangan", "action": "exists"}

    rd = models.RestDay(
        operator_id=op_id if not is_user else None,
        user_id=op_id if is_user else None,
        day_of_week=data.day_of_week,
        week_start=data.week_start,
        created_by=current_user.id
    )
    db.add(rd)
    db.commit()
    return {"message": "Dam kun belgilandi", "action": "added"}


@app.delete("/rest-days")
async def delete_rest_day(data: schemas.RestDaySet, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    if data.person_id and data.person_type:
        op_id = data.person_id
        is_user = data.person_type == "user"
    else:
        op_id = data.operator_id or data.user_id
        is_user = bool(data.user_id)

    if not op_id or not data.week_start:
        raise HTTPException(status_code=400, detail="operator_id/user_id and week_start required")

    existing = db.query(models.RestDay).filter(
        models.RestDay.operator_id == (None if is_user else op_id),
        models.RestDay.user_id == (op_id if is_user else None),
        models.RestDay.week_start == data.week_start,
        models.RestDay.day_of_week == data.day_of_week
    ).first()

    if not existing:
        raise HTTPException(status_code=404, detail="Rest day not found")

    db.delete(existing)
    db.commit()
    return {"message": "Dam kun olib tashlandi", "action": "removed"}

@app.get("/rest-days/today")
async def get_today_rest(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    today = date.today()
    ws = get_week_start(today)
    dow = today.weekday()
    resting = db.query(models.RestDay).filter(models.RestDay.week_start == ws, models.RestDay.day_of_week == dow).all()
    return [serialize_rest_day(day, db).model_dump() for day in resting]

# ─── MACHINES ───
@app.get("/machines")
async def read_machines(db: Session = Depends(database.get_db)):
    # No authentication required for machines - public endpoint for ESP32
    machines = db.query(models.Machine).all()
    results = []
    now = datetime.utcnow()
    for m in machines:
        remaining = get_remaining_asnova(m)
        status = get_machine_status(m, now)
        results.append({
            "id": m.id, "status": status, "category_id": m.category_id,
            "meters": round(m.current_total_meters, 2), "shift_meters": round(m.shift_meters, 2),
            "remaining": round(remaining, 2), "initial_asnova_length": m.initial_asnova_length,
            "meters_at_fill": m.meters_at_fill, "baud": m.current_baud, "protocol": m.current_protocol,
            "connection_source": m.connection_source, "preferred_source": m.preferred_source,
            "last_seen": m.last_seen.isoformat() if m.last_seen else None,
            "sys_info": {
                "ram": {"free": m.esp_free_ram, "total": m.esp_total_ram},
                "rom": {"free": m.esp_free_rom, "total": m.esp_total_rom},
                "cpu": m.esp_cpu_freq,
                "wifi": {"ssid": m.esp_wifi_ssid, "rssi": m.esp_wifi_rssi}
            }
        })
    return results

@app.post("/machines/{machine_id}/fill")
async def fill_asnova(machine_id: str, data: schemas.MachineUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    machine.initial_asnova_length = data.initial_asnova_length
    machine.meters_at_fill = machine.current_total_meters
    machine.last_operator_id = data.last_operator_id
    machine.status = "RUNNING"
    close_open_asnova_event(db, machine_id, current_user.id)
    new_log = models.AsnovaLog(machine_id=machine_id, operator_id=data.last_operator_id, operator_name=current_user.full_name, length_added=data.initial_asnova_length, meters_at_fill=machine.meters_at_fill)
    db.add(new_log)
    db.commit()
    await broadcast_ws()
    return {"message": "Asnova filled successfully"}


@app.delete("/machines/{machine_id}/clear-asnova")
async def clear_asnova(machine_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    machine.initial_asnova_length = 0.0
    machine.meters_at_fill = machine.current_total_meters or 0.0
    machine.last_operator_id = None
    close_open_asnova_event(db, machine_id, current_user.id)
    db.commit()
    await broadcast_ws()
    return {"message": "Asnova data cleared"}

@app.post("/machines/{machine_id}/update")
async def update_machine_data(machine_id: str, data: MachineUpdate):
    """Public endpoint - ESP32 va USB monitor uchun authenticationsiz"""
    db = database.SessionLocal()
    try:
        machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
        if not machine:
            return {"status": "error", "message": "Machine not found"}

        prev_status = get_machine_status(machine)
        machine.current_total_meters = data.meters
        machine.shift_meters = data.shift_meters
        machine.current_baud = data.baud
        machine.current_protocol = data.protocol
        machine.last_seen = datetime.utcnow()
        
        if hasattr(data, 'connection_source') and data.connection_source:
            machine.connection_source = data.connection_source
        else:
            machine.connection_source = "WIFI"
            
        machine.esp_free_ram = data.free_ram
        machine.esp_total_ram = data.total_ram
        machine.esp_free_rom = data.free_rom
        machine.esp_total_rom = data.total_rom
        machine.esp_cpu_freq = data.cpu_freq
        machine.esp_wifi_ssid = data.wifi_ssid
        machine.esp_wifi_rssi = data.wifi_rssi
        new_status = get_machine_status(machine)

        if prev_status != "ASNOVA_EMPTY" and new_status == "ASNOVA_EMPTY":
            ensure_open_asnova_event(db, machine_id)
        db.commit()
        
        # Broadcast to WebSocket clients
        try:
            await broadcast_ws()
        except:
            pass
            
        return {"status": "ok", "machine_id": machine_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        db.close()

@app.post("/machines/{machine_id}/watch")
async def watch_machine(machine_id: str, current_user: models.User = Depends(get_current_user)):
    broadcast_priority(machine_id)
    return {"message": f"Priority set to {machine_id}"}

@app.post("/machines/{machine_id}/source")
async def set_machine_source(machine_id: str, preferred_source: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    machine.preferred_source = preferred_source
    db.commit()
    return {"message": f"Source updated to {preferred_source}"}

# ─── SYSTEM STATUS ───
@app.get("/system/status")
async def get_system_status(db: Session = Depends(database.get_db)):
    machines = db.query(models.Machine).all()
    now = datetime.utcnow()
    
    total = len(machines)
    online = 0
    running = 0
    offline = 0
    asnova_empty = 0
    no_signal = 0
    
    for m in machines:
        status = get_machine_status(m, now)
        if status != "OFFLINE":
            online += 1
        if status == "OFFLINE":
            offline += 1
        elif status == "ESP_ONLINE_NO_SIGNAL":
            no_signal += 1
        elif status == "ASNOVA_EMPTY":
            asnova_empty += 1
        else:
            running += 1
    
    return {
        "machines_total": total,
        "machines_online": online,
        "machines_running": running,
        "machines_offline": offline,
        "machines_asnova_empty": asnova_empty,
        "machines_no_signal": no_signal,
        "last_update": now.isoformat()
    }

@app.post("/machines/{machine_id}/command")
async def machine_command(machine_id: str, command: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    machine = db.query(models.Machine).filter(models.Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    valid_commands = ["START", "STOP", "RESET", "REBOOT"]
    if command.upper() not in valid_commands:
        raise HTTPException(status_code=400, detail=f"Invalid command. Use: {', '.join(valid_commands)}")
    
    import socket
    msg = f"CMD:{command.upper()}:{machine_id}"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto(msg.encode(), ('192.168.1.255', 4444))
        sock.sendto(msg.encode(), ('192.168.4.255', 4444))
        return {"message": f"Command {command} sent to {machine_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        sock.close()

# ─── REPORTS ───
@app.get("/reports/shift")
async def get_shift_report(date: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    
    machines = db.query(models.Machine).all()
    operators = db.query(models.Operator).filter(models.Operator.is_active == 1).all()
    
    report_data = []
    total_meters = 0.0
    
    for op in operators:
        assignments = db.query(models.Assignment).filter(
            models.Assignment.operator_id == op.id,
            models.Assignment.is_active == 1
        ).all()
        
        op_machines = []
        op_meters = 0.0
        
        for a in assignments:
            m = next((x for x in machines if x.id == a.machine_id), None)
            if m:
                op_machines.append(m.id)
                op_meters += m.shift_meters or 0
        
        if op_machines:
            report_data.append({
                "operator": op.name,
                "position": op.position,
                "shift_type": op.shift_type,
                "machines": ", ".join(op_machines),
                "meters": round(op_meters, 1)
            })
            total_meters += op_meters
    
    return {
        "date": date,
        "operators": report_data,
        "total_meters": round(total_meters, 1),
        "total_operators": len(report_data),
        "generated_at": datetime.now().isoformat()
    }

# ─── UZLAVYAZ ASSIGNMENTS ───
@app.post("/uzlavyaz/assign-machines")
async def assign_machines_to_uzlavyaz(data: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN))):
    """Assign machines to a specific uzlavyaz"""
    uzlavyaz_id = data.get("uzlavyaz_id")
    machine_ids = data.get("machine_ids", [])
    
    uzlavyaz = db.query(models.User).filter(models.User.id == uzlavyaz_id, models.User.role == models.UserRole.UZLAVYAZ).first()
    if not uzlavyaz:
        raise HTTPException(status_code=404, detail="Uzlavyaz not found")
    
    for machine_id in machine_ids:
        existing = db.query(models.UzlavyazAssignment).filter(
            models.UzlavyazAssignment.uzlavyaz_id == uzlavyaz_id,
            models.UzlavyazAssignment.machine_id == machine_id,
            models.UzlavyazAssignment.is_active == 1
        ).first()
        if not existing:
            assignment = models.UzlavyazAssignment(uzlavyaz_id=uzlavyaz_id, machine_id=machine_id)
            db.add(assignment)
    
    db.commit()
    return {"message": f"{len(machine_ids)} machines assigned to {uzlavyaz.full_name}"}

@app.get("/uzlavyaz/{uzlavyaz_id}/machines", response_model=List[schemas.UzlavyazAssignmentOut])
async def get_uzlavyaz_machines(uzlavyaz_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """Get machines assigned to a specific uzlavyaz"""
    assignments = db.query(models.UzlavyazAssignment).filter(
        models.UzlavyazAssignment.uzlavyaz_id == uzlavyaz_id,
        models.UzlavyazAssignment.is_active == 1
    ).all()
    
    result = []
    for a in assignments:
        machine = db.query(models.Machine).filter(models.Machine.id == a.machine_id).first()
        result.append({
            "id": a.id,
            "uzlavyaz_id": a.uzlavyaz_id,
            "machine_id": a.machine_id,
            "assigned_at": a.assigned_at,
            "is_active": a.is_active,
            "machine_name": machine.id if machine else ""
        })
    return result

@app.get("/machines/asnova-empty")
async def get_asnova_empty_machines(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """Get all machines with ASNOVA_EMPTY status"""
    machines = db.query(models.Machine).all()
    now = datetime.utcnow()
    result = []
    
    for m in machines:
        remaining = get_remaining_asnova(m)
        if machine_has_tracked_asnova(m) and get_machine_status(m, now) == "ASNOVA_EMPTY":
            # Find uzlavyaz assignment
            assignment = db.query(models.UzlavyazAssignment).filter(
                models.UzlavyazAssignment.machine_id == m.id,
                models.UzlavyazAssignment.is_active == 1
            ).first()
            
            uzlavyaz_name = ""
            if assignment:
                uzlavyaz = db.query(models.User).filter(models.User.id == assignment.uzlavyaz_id).first()
                uzlavyaz_name = uzlavyaz.full_name if uzlavyaz else ""
            
            # Find last empty event
            last_event = db.query(models.AsnovaEmptyEvent).filter(
                models.AsnovaEmptyEvent.machine_id == m.id,
                models.AsnovaEmptyEvent.filled_at == None
            ).order_by(models.AsnovaEmptyEvent.empty_at.desc()).first()
            
            empty_minutes = 0
            if last_event:
                empty_minutes = int((now - last_event.empty_at).total_seconds() / 60)
            
            result.append({
                "id": m.id,
                "remaining": remaining,
                "uzlavyaz": uzlavyaz_name,
                "empty_minutes": empty_minutes,
                "is_delayed": empty_minutes > 15
            })
    
    return result

@app.get("/uzlavyaz/stats")
async def get_uzlavyaz_stats(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    """Get statistics for all uzlavyaz"""
    uzlavyazlar = db.query(models.User).filter(models.User.role == models.UserRole.UZLAVYAZ, models.User.is_active == 1).all()
    
    stats = []
    now = datetime.utcnow()
    
    for uz in uzlavyazlar:
        assignments = db.query(models.UzlavyazAssignment).filter(
            models.UzlavyazAssignment.uzlavyaz_id == uz.id,
            models.UzlavyazAssignment.is_active == 1
        ).all()
        
        machine_ids = [a.machine_id for a in assignments]
        machines = db.query(models.Machine).filter(models.Machine.id.in_(machine_ids)).all() if machine_ids else []
        
        empty_count = 0
        delayed_count = 0
        total_delay = 0
        
        for m in machines:
            if machine_has_tracked_asnova(m) and get_machine_status(m, now) == "ASNOVA_EMPTY":
                empty_count += 1
                last_event = db.query(models.AsnovaEmptyEvent).filter(
                    models.AsnovaEmptyEvent.machine_id == m.id,
                    models.AsnovaEmptyEvent.filled_at == None
                ).first()
                if last_event:
                    delay = int((now - last_event.empty_at).total_seconds() / 60)
                    total_delay += delay
                    if delay > 15:
                        delayed_count += 1
        
        avg_delay = total_delay / empty_count if empty_count > 0 else 0
        
        stats.append({
            "uzlavyaz_id": uz.id,
            "uzlavyaz_name": uz.full_name,
            "total_machines": len(machines),
            "empty_count": empty_count,
            "delayed_count": delayed_count,
            "avg_delay_minutes": round(avg_delay, 1)
        })
    
    return stats

# ─── SERIAL/USB ───
SERIAL_AVAILABLE = False

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    serial = None
    serial_tools_list_ports = None

@app.get("/serial/ports")
async def list_serial_ports():
    if not SERIAL_AVAILABLE:
        return [{"error": "pyserial not installed", "ports": []}]
    ports = list(serial.tools.list_ports.comports())
    return [{"port": p.device, "description": p.description, "hwid": p.hwid} for p in ports]

class SerialReader:
    def __init__(self):
        self.serial_port = None
        self.reading = False
        
    def open(self, port: str, baud: int = 9600):
        if not SERIAL_AVAILABLE:
            raise HTTPException(status_code=400, detail="pyserial not installed")
        try:
            if self.serial_port and self.serial_port.is_open:
                self.serial_port.close()
            self.serial_port = serial.Serial(port, baud, timeout=1)
            return {"message": f"Opened {port} at {baud}"}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    def read_line(self):
        if self.serial_port and self.serial_port.is_open:
            if self.serial_port.in_waiting:
                return self.serial_port.readline().decode('utf-8', errors='ignore').strip()
        return None
    
    def close(self):
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
            return {"message": "Closed"}
        return {"message": "Not open"}

serial_reader = SerialReader()

@app.post("/serial/connect")
async def connect_serial(port: str, baud: int = 9600):
    return serial_reader.open(port, baud)

@app.get("/serial/read")
async def read_serial():
    line = serial_reader.read_line()
    if line:
        return {"data": line}
    return {"data": None}

@app.post("/serial/disconnect")
async def disconnect_serial():
    return serial_reader.close()

# ─── MECHANIC CALLS ───
@app.get("/mechanic-calls", response_model=List[schemas.MechanicCallOut])
async def list_mechanic_calls(status: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    q = db.query(models.MechanicCall)
    if status:
        q = q.filter(models.MechanicCall.status == status)
    return q.order_by(models.MechanicCall.created_at.desc()).all()

@app.post("/mechanic-calls", response_model=schemas.MechanicCallOut)
async def create_mechanic_call(data: schemas.MechanicCallCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    call = models.MechanicCall(machine_id=data.machine_id, called_by=current_user.id, reason=data.reason, signal_type=data.signal_type)
    db.add(call)
    db.commit()
    db.refresh(call)
    return call

@app.put("/mechanic-calls/{call_id}", response_model=schemas.MechanicCallOut)
async def update_mechanic_call(call_id: int, data: schemas.MechanicCallUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    call = db.query(models.MechanicCall).filter(models.MechanicCall.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    call.status = data.status
    if data.signal_type is not None:
        call.signal_type = data.signal_type
    if data.status == "RESOLVED":
        call.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(call)
    return call

# ─── DAILY PLANS ───
@app.get("/daily-plans")
async def list_daily_plans(date: Optional[str] = None, operator_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    q = db.query(models.DailyPlan)
    if date:
        q = q.filter(models.DailyPlan.date == date)
    if operator_id:
        q = q.filter(models.DailyPlan.operator_id == operator_id)
    plans = q.all()
    result = []
    for p in plans:
        result.append({
            "id": p.id, "operator_id": p.operator_id, "machine_id": p.machine_id,
            "date": p.date, "plan_meters": p.plan_meters, "actual_meters": p.actual_meters,
            "status": p.status, "created_by": p.created_by, "created_at": p.created_at.isoformat(),
            "operator_name": p.operator.name if p.operator else ""
        })
    return result

@app.post("/daily-plans")
async def create_daily_plan(data: schemas.DailyPlanCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    existing = db.query(models.DailyPlan).filter(
        models.DailyPlan.operator_id == data.operator_id,
        models.DailyPlan.machine_id == data.machine_id,
        models.DailyPlan.date == data.date
    ).first()
    if existing:
        existing.plan_meters = data.plan_meters
        existing.status = "PENDING"
        existing.actual_meters = 0.0
        db.commit()
        db.refresh(existing)
        return {"message": "Plan updated", "id": existing.id}
    plan = models.DailyPlan(operator_id=data.operator_id, machine_id=data.machine_id, date=data.date, plan_meters=data.plan_meters, created_by=current_user.id)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {"message": "Plan created", "id": plan.id}

@app.post("/daily-plans/bulk")
async def bulk_daily_plans(data: schemas.DailyPlanBulkCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(require_role(models.UserRole.ADMIN, models.UserRole.NAZORATCHI))):
    count = 0
    for p in data.plans:
        existing = db.query(models.DailyPlan).filter(
            models.DailyPlan.operator_id == p.operator_id,
            models.DailyPlan.machine_id == p.machine_id,
            models.DailyPlan.date == data.date
        ).first()
        if existing:
            existing.plan_meters = p.plan_meters
            existing.status = "PENDING"
            existing.actual_meters = 0.0
        else:
            db.add(models.DailyPlan(operator_id=p.operator_id, machine_id=p.machine_id, date=data.date, plan_meters=p.plan_meters, created_by=current_user.id))
        count += 1
    db.commit()
    return {"message": f"{count} plans saved"}

@app.put("/daily-plans/{plan_id}")
async def update_daily_plan(plan_id: int, data: schemas.DailyPlanUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    plan = db.query(models.DailyPlan).filter(models.DailyPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if data.actual_meters is not None:
        plan.actual_meters = data.actual_meters
    if data.plan_meters is not None:
        plan.plan_meters = data.plan_meters
    if data.status is not None:
        plan.status = data.status
    elif plan.actual_meters >= plan.plan_meters:
        plan.status = "COMPLETED"
    else:
        plan.status = "INCOMPLETE"
    plan.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(plan)
    return {"message": "Plan updated", "status": plan.status}

# ─── MONTHLY REPORT ───
@app.get("/reports/monthly/excel")
async def get_monthly_report_excel(month: Optional[str] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    import pandas as pd
    import calendar
    if not month:
        month = datetime.utcnow().strftime("%Y-%m")
    year, mon = map(int, month.split('-'))
    days_in_month = calendar.monthrange(year, mon)[1]

    operators = db.query(models.Operator).filter(models.Operator.is_active == 1, models.Operator.position == "Operator").all()

    # Get all daily plans for this month
    plans = db.query(models.DailyPlan).filter(models.DailyPlan.date.like(f"{month}%")).all()
    plan_map = {}
    for p in plans:
        key = (p.operator_id, p.date)
        if key not in plan_map:
            plan_map[key] = {"plan": 0, "actual": 0}
        plan_map[key]["plan"] += p.plan_meters
        plan_map[key]["actual"] += p.actual_meters

    # Get assignments
    assignments = db.query(models.Assignment).filter(models.Assignment.is_active == 1).all()
    op_machines = {}
    for a in assignments:
        if a.operator_id not in op_machines:
            op_machines[a.operator_id] = []
        op_machines[a.operator_id].append(a.machine_id)

    rows = []
    for op in operators:
        machines = op_machines.get(op.id, [])
        row = {"Operator": op.name, "Stanoklar": ", ".join(machines) if machines else "—"}
        total_plan = 0
        total_actual = 0
        for d in range(1, days_in_month + 1):
            date_str = f"{month}-{d:02d}"
            key = (op.id, date_str)
            info = plan_map.get(key, {"plan": 0, "actual": 0})
            plan_val = info["plan"]
            actual_val = info["actual"]
            if plan_val > 0:
                pct = round((actual_val / plan_val) * 100, 0) if plan_val > 0 else 0
                row[f"{d}"] = f"{int(actual_val)}/{int(plan_val)} ({int(pct)}%)"
            else:
                row[f"{d}"] = "—"
            total_plan += plan_val
            total_actual += actual_val
        row["Jami reja"] = int(total_plan)
        row["Jami bajarildi"] = int(total_actual)
        row["Umumiy %"] = round((total_actual / total_plan) * 100, 1) if total_plan > 0 else 0
        rows.append(row)

    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=f'Operator {month}')
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            headers={"Content-Disposition": f"attachment; filename=operator_report_{month}.xlsx"})

# ─── PDF REPORTS ───
@app.get("/reports/daily/pdf")
async def get_daily_report_pdf(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    machines = db.query(models.Machine).all()
    rows = []
    total = 0.0
    for m in machines:
        meters = round(m.shift_meters, 1)
        rows.append([m.id, f"{meters} m"])
        total += meters
    rows.append(["JAMI", f"{total:.1f} m"])
    file_obj = reports.generate_pdf_report("KUNLIK SMENA HISOBOTI", ["Stanok", "Metr"], rows)
    return StreamingResponse(file_obj, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=daily_report.pdf"})

@app.get("/reports/monthly/pdf")
async def get_monthly_report_pdf(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    now = datetime.utcnow()
    start_of_month = datetime(now.year, now.month, 1)
    logs = db.query(models.ProductionLog).filter(models.ProductionLog.date >= start_of_month).all()
    op_data = {}
    for l in logs:
        name = l.operator_name or "Unknown"
        if name not in op_data:
            op_data[name] = {"machine": l.machine_id, "days": {}, "total": 0.0}
        day_str = l.date.strftime("%d-%m")
        op_data[name]["days"][day_str] = op_data[name]["days"].get(day_str, 0) + l.meters_woven
        op_data[name]["total"] += l.meters_woven
    rows = []
    for name, info in op_data.items():
        rows.append([name, info["machine"], ""])
        for day, meters in sorted(info["days"].items()):
            rows.append(["", f"  {day}", f"{meters:.0f} m"])
        rows.append(["", "JAMI", f"{info['total']:.0f} m"])
    if not rows:
        rows = [["Ma'lumot yo'q", "", ""]]
    file_obj = reports.generate_pdf_report("OYLIK OPERATOR HISOBOTI", ["Operator", "Kun/Stankok", "Metr"], rows)
    return StreamingResponse(file_obj, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=monthly_report.pdf"})

@app.get("/reports/asnova-remaining/pdf")
async def get_asnova_remaining_pdf(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    machines = db.query(models.Machine).all()
    data = []
    total_remaining = 0.0
    low_warning = []
    for m in machines:
        remaining = max(0.0, m.initial_asnova_length - (m.current_total_meters - m.meters_at_fill))
        initial = m.initial_asnova_length or 0
        if remaining > 0 and initial > 0:
            pct = (remaining / initial) * 100
            status = "📦 Bor" if pct > 20 else "⚠️ Kam"
        elif remaining <= 0:
            status = "❌ Tugagan"
        else:
            status = "❓ Aniqmas"
        data.append([m.id, f"{initial:.0f}m", f"{m.current_total_meters:.0f}m", f"{remaining:.0f}m", status])
        total_remaining += remaining
        if remaining < 500 and remaining > 0:
            low_warning.append(m.id)
    data.append(["JAMI", "", "", f"{total_remaining:.0f}m", ""])
    if low_warning:
        data.append(["", "", "", "", ""])
        data.append([f"E'tibor: {', '.join(low_warning)} stanoklarda kam qolgan", "", "", "", ""])
    file_obj = reports.generate_pdf_report("ASNOVA QOLDI HISOBOTI", ["Stanok", "Boshlang'", "Jami ishlandi", "Qolgan", "Status"], data)
    return StreamingResponse(file_obj, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=asnova_qoldi.pdf"})

@app.get("/reports/monitoring/pdf")
async def get_monitoring_pdf(db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):
    machines = db.query(models.Machine).all()
    data = []
    now = datetime.utcnow()
    for m in machines:
        remaining = get_remaining_asnova(m)
        data.append([m.id, get_machine_status(m, now), f"{m.current_total_meters:.2f}", f"{remaining:.2f}"])
    file_obj = reports.generate_pdf_report("Machine Monitoring Report", ["Machine ID", "Status", "Meters", "Remaining"], data)
    return StreamingResponse(file_obj, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=monitoring_report.pdf"})

@app.post("/reports/generate-pdf")
async def generate_custom_pdf(data: CustomPDFRequest, current_user: models.User = Depends(get_current_user)):
    safe_filename = "".join(c for c in data.filename if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_filename:
        safe_filename = "hisobot"
    pdf_bytes = reports.generate_custom_pdf(data.title, data.rows, data.cols, data.cells)
    pdf_id = str(uuid.uuid4())[:8]
    pdf_path = os.path.join(SAVED_PDFS_DIR, f"{safe_filename}_{pdf_id}.pdf")
    with open(pdf_path, 'wb') as f:
        f.write(pdf_bytes.read())
    meta_path = os.path.join(SAVED_PDFS_DIR, f"{safe_filename}_{pdf_id}.json")
    meta = {
        "id": pdf_id, "title": data.title, "filename": safe_filename,
        "rows": data.rows, "cols": data.cols, "cells": data.cells,
        "pdf_path": pdf_path, "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user.full_name
    }
    with open(meta_path, 'w') as f:
        json.dump(meta, f, ensure_ascii=False)
    with open(pdf_path, 'rb') as f:
        pdf_content = f.read()
    return StreamingResponse(io.BytesIO(pdf_content), media_type="application/pdf",
                           headers={"Content-Disposition": f"attachment; filename={safe_filename}.pdf"})

@app.get("/reports/saved")
async def list_saved_pdfs(current_user: models.User = Depends(get_current_user)):
    result = []
    if not os.path.exists(SAVED_PDFS_DIR):
        return result
    for fname in sorted(os.listdir(SAVED_PDFS_DIR)):
        if fname.endswith('.json') and not fname.startswith('excel_'):
            try:
                with open(os.path.join(SAVED_PDFS_DIR, fname), 'r') as f:
                    meta = json.load(f)
                    result.append({
                        "id": meta.get("id"), "title": meta.get("title"),
                        "filename": meta.get("filename"), "rows": meta.get("rows"),
                        "cols": meta.get("cols"), "created_at": meta.get("created_at"),
                        "created_by": meta.get("created_by")
                    })
            except Exception:
                pass
    return result

@app.get("/reports/saved/{pdf_id}/download")
async def download_saved_pdf(pdf_id: str, current_user: models.User = Depends(get_current_user)):
    for fname in os.listdir(SAVED_PDFS_DIR):
        if fname.endswith('.json') and not fname.startswith('excel_'):
            try:
                with open(os.path.join(SAVED_PDFS_DIR, fname), 'r') as f:
                    meta = json.load(f)
                    if meta.get("id") == pdf_id:
                        pdf_path = meta.get("pdf_path")
                        if pdf_path and os.path.exists(pdf_path):
                            return FileResponse(pdf_path, media_type="application/pdf", filename=f"{meta.get('filename', 'hisobot')}.pdf")
            except Exception:
                pass
    raise HTTPException(status_code=404, detail="PDF not found")

@app.get("/reports/saved/{pdf_id}/data")
async def get_saved_pdf_data(pdf_id: str, current_user: models.User = Depends(get_current_user)):
    for fname in os.listdir(SAVED_PDFS_DIR):
        if fname.endswith('.json') and not fname.startswith('excel_'):
            try:
                with open(os.path.join(SAVED_PDFS_DIR, fname), 'r') as f:
                    meta = json.load(f)
                    if meta.get("id") == pdf_id:
                        return {
                            "id": meta.get("id"), "title": meta.get("title"),
                            "filename": meta.get("filename"), "rows": meta.get("rows"),
                            "cols": meta.get("cols"), "cells": meta.get("cells"),
                            "created_at": meta.get("created_at"), "created_by": meta.get("created_by")
                        }
            except Exception:
                pass
    raise HTTPException(status_code=404, detail="PDF not found")

@app.delete("/reports/saved/{pdf_id}")
async def delete_saved_pdf(pdf_id: str, current_user: models.User = Depends(get_current_user)):
    to_delete = []
    for fname in os.listdir(SAVED_PDFS_DIR):
        if fname.endswith('.json') and not fname.startswith('excel_'):
            try:
                with open(os.path.join(SAVED_PDFS_DIR, fname), 'r') as f:
                    meta = json.load(f)
                    if meta.get("id") == pdf_id:
                        to_delete.append(os.path.join(SAVED_PDFS_DIR, fname))
                        if meta.get("pdf_path") and os.path.exists(meta["pdf_path"]):
                            to_delete.append(meta["pdf_path"])
            except Exception:
                pass
    for path in to_delete:
        try:
            os.remove(path)
        except Exception:
            pass
    return {"message": "PDF deleted"}

# ─── SAVED EXCEL REPORTS ───
@app.post("/reports/save-excel")
async def save_excel_report(data: CustomPDFRequest, current_user: models.User = Depends(get_current_user)):
    safe_filename = "".join(c for c in data.filename if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_filename:
        safe_filename = "hisobot"
    report_id = str(uuid.uuid4())[:8]
    meta = {
        "id": report_id, "title": data.title, "filename": safe_filename,
        "rows": data.rows, "cols": data.cols, "cells": data.cells,
        "mergedCells": data.mergedCells, "colWidths": data.colWidths, "rowHeights": data.rowHeights,
        "type": "excel", "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user.full_name
    }
    meta_path = os.path.join(SAVED_PDFS_DIR, f"excel_{report_id}.json")
    with open(meta_path, 'w') as f:
        json.dump(meta, f, ensure_ascii=False)
    return {"message": "Excel hisobot saqlandi", "id": report_id}

@app.get("/reports/saved-excel")
async def list_saved_excel(current_user: models.User = Depends(get_current_user)):
    result = []
    if not os.path.exists(SAVED_PDFS_DIR):
        return result
    for fname in sorted(os.listdir(SAVED_PDFS_DIR)):
        if fname.startswith('excel_') and fname.endswith('.json'):
            try:
                with open(os.path.join(SAVED_PDFS_DIR, fname), 'r') as f:
                    meta = json.load(f)
                    result.append({
                        "id": meta.get("id"), "title": meta.get("title"),
                        "filename": meta.get("filename"), "rows": meta.get("rows"),
                        "cols": meta.get("cols"), "type": "excel",
                        "created_at": meta.get("created_at"), "created_by": meta.get("created_by")
                    })
            except Exception:
                pass
    return result

@app.get("/reports/saved-excel/{report_id}/data")
async def get_saved_excel_data(report_id: str, current_user: models.User = Depends(get_current_user)):
    for fname in os.listdir(SAVED_PDFS_DIR):
        if fname.startswith('excel_') and fname.endswith('.json'):
            try:
                with open(os.path.join(SAVED_PDFS_DIR, fname), 'r') as f:
                    meta = json.load(f)
                    if meta.get("id") == report_id:
                        return meta
            except Exception:
                pass
    raise HTTPException(status_code=404, detail="Excel report not found")


@app.put("/reports/saved-excel/{report_id}")
async def update_saved_excel(report_id: str, data: CustomPDFRequest, current_user: models.User = Depends(get_current_user)):
    for fname in os.listdir(SAVED_PDFS_DIR):
        if fname.startswith('excel_') and fname.endswith('.json'):
            path = os.path.join(SAVED_PDFS_DIR, fname)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                if meta.get("id") != report_id:
                    continue

                safe_filename = "".join(c for c in data.filename if c.isalnum() or c in (' ', '-', '_')).strip() or meta.get("filename", "hisobot")
                meta.update({
                    "title": data.title,
                    "filename": safe_filename,
                    "rows": data.rows,
                    "cols": data.cols,
                    "cells": data.cells,
                    "mergedCells": data.mergedCells,
                    "colWidths": data.colWidths,
                    "rowHeights": data.rowHeights,
                    "updated_at": datetime.utcnow().isoformat(),
                    "updated_by": current_user.full_name,
                })

                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, ensure_ascii=False, indent=2)
                return {"message": "Excel report updated", "id": report_id}
            except Exception:
                pass

    raise HTTPException(status_code=404, detail="Excel report not found")

@app.get("/reports/saved-excel/{report_id}/download")
async def download_saved_excel(report_id: str, current_user: models.User = Depends(get_current_user)):
    for fname in os.listdir(SAVED_PDFS_DIR):
        if fname.startswith('excel_') and fname.endswith('.json'):
            try:
                with open(os.path.join(SAVED_PDFS_DIR, fname), 'r') as f:
                    meta = json.load(f)
                    if meta.get("id") == report_id:
                        import pandas as pd
                        rows = meta.get("rows", 30)
                        cols = meta.get("cols", 12)
                        cells = meta.get("cells", {})
                        title = meta.get("title", "Hisobot")
                        safe_filename = meta.get("filename", "hisobot")
                        table_data = []
                        for r in range(rows):
                            row = []
                            for c in range(cols):
                                key = f"{r}-{c}"
                                cell = cells.get(key, {})
                                val = cell.get("value", "")
                                if cell.get("linkedMachine"):
                                    val = f"[{cell['linkedMachine']}]"
                                row.append(str(val))
                            table_data.append(row)
                        df = pd.DataFrame(table_data)
                        output = io.BytesIO()
                        with pd.ExcelWriter(output, engine='openpyxl') as writer:
                            df.to_excel(writer, index=False, sheet_name=(title or "Hisobot")[:31])
                        output.seek(0)
                        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                                headers={"Content-Disposition": f"attachment; filename={safe_filename}.xlsx"})
            except Exception:
                pass
    raise HTTPException(status_code=404, detail="Excel report not found")


@app.delete("/reports/saved-excel/{report_id}")
async def delete_saved_excel(report_id: str, current_user: models.User = Depends(get_current_user)):
    for fname in os.listdir(SAVED_PDFS_DIR):
        if fname.startswith('excel_') and fname.endswith('.json'):
            path = os.path.join(SAVED_PDFS_DIR, fname)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                if meta.get("id") != report_id:
                    continue

                os.remove(path)
                return {"message": "Excel report deleted"}
            except Exception:
                pass

    raise HTTPException(status_code=404, detail="Excel report not found")


@app.post("/reports/asnova-pdf")
async def generate_asnova_pdf(payload: dict, current_user: models.User = Depends(get_current_user)):
    machines = payload.get("machines", [])
    rows = []
    total_remaining = 0.0

    for item in machines:
        machine_id = item.get("id", "")
        remaining = float(item.get("remaining", 0) or 0)
        status_text = "❌ Tugagan" if remaining <= 0 else "⚠️ Kam" if remaining < 500 else "📦 Bor"
        rows.append([machine_id, f"{remaining:.1f} m", status_text])
        total_remaining += remaining

    if not rows:
        rows.append(["Ma'lumot yo'q", "", ""])

    rows.append(["JAMI", f"{total_remaining:.1f} m", ""])
    file_obj = reports.generate_pdf_report("ASNOVA QOLDIGI", ["Stanok", "Qolgan", "Holat"], rows)
    return StreamingResponse(file_obj, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=asnova_qoldigi.pdf"})


@app.post("/reports/asnova-excel")
async def generate_asnova_excel(payload: dict, current_user: models.User = Depends(get_current_user)):
    import pandas as pd

    machines = payload.get("machines", [])
    rows = []

    for item in machines:
        remaining = float(item.get("remaining", 0) or 0)
        rows.append({
            "Stanok": item.get("id", ""),
            "Qolgan (m)": round(remaining, 1),
            "Holat": "Tugagan" if remaining <= 0 else "Kam" if remaining < 500 else "Bor",
        })

    if not rows:
        rows.append({"Stanok": "Ma'lumot yo'q", "Qolgan (m)": "", "Holat": ""})

    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Asnova")
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            headers={"Content-Disposition": "attachment; filename=asnova_qoldigi.xlsx"})

@app.post("/reports/saved-excel/download-temp")
async def download_temp_excel(data: CustomPDFRequest, current_user: models.User = Depends(get_current_user)):
    import pandas as pd
    safe_filename = "".join(c for c in data.filename if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_filename:
        safe_filename = "hisobot"
    table_data = []
    for r in range(data.rows):
        row = []
        for c in range(data.cols):
            key = f"{r}-{c}"
            cell = data.cells.get(key, {})
            val = cell.get("value", "")
            if cell.get("linkedMachine"):
                val = f"[{cell['linkedMachine']}]"
            row.append(str(val))
        table_data.append(row)
    df = pd.DataFrame(table_data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=(data.title or "Hisobot")[:31])
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            headers={"Content-Disposition": f"attachment; filename={safe_filename}.xlsx"})
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            db = database.SessionLocal()
            try:
                machines = db.query(models.Machine).all()
                data = []
                now = datetime.utcnow()
                for m in machines:
                    remaining = get_remaining_asnova(m)
                    status = get_machine_status(m, now)
                    data.append({
                        "id": m.id, "status": status,
                        "meters": round(m.current_total_meters, 2),
                        "shift_meters": round(m.shift_meters, 2),
                        "remaining": round(remaining, 2),
                        "baud": m.current_baud, "protocol": m.current_protocol,
                        "connection_source": m.connection_source,
                        "preferred_source": m.preferred_source,
                        "sys_info": {
                            "ram": {"free": m.esp_free_ram, "total": m.esp_total_ram},
                            "rom": {"free": m.esp_free_rom, "total": m.esp_total_rom},
                            "cpu": m.esp_cpu_freq,
                            "wifi": {"ssid": m.esp_wifi_ssid, "rssi": m.esp_wifi_rssi}
                        }
                    })
                await websocket.send_text(json.dumps(data))
            finally:
                db.close()
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS Error: {e}")
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)



# ─── FRONTEND SERVING ───
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
resources_dir = os.path.dirname(backend_dir)
possible_frontends = [
    os.path.join(resources_dir, "frontend_dist"),
    os.path.join(resources_dir, "frontend", "dist"),
    os.path.join(backend_dir, "..", "frontend", "dist"),
    os.path.join(resources_dir, "..", "frontend", "dist"),
    os.path.join(backend_dir, "frontend", "dist"),
    os.path.join(backend_dir, "..", "frontend_dist"),
    os.path.join(resources_dir, "..", "frontend_dist"),
    os.path.join(backend_dir, "frontend_dist"),
]
frontend_dist = None
for path in possible_frontends:
    if os.path.exists(path):
        frontend_dist = path
        break

if frontend_dist:
    app.mount("/assets", StaticFiles(directory=f"{frontend_dist}/assets"), name="assets")

@app.get("/")
async def serve_index():
    if frontend_dist:
        return FileResponse(os.path.join(frontend_dist, "index.html"))
    raise HTTPException(status_code=503, detail="Frontend not found")

@app.get("/{full_path:path}")
async def serve_other(full_path: str):
    if frontend_dist:
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.exists(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
    raise HTTPException(status_code=503, detail="Frontend not found")
