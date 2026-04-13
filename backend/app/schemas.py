from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from .models import UserRole

# --- Auth ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# --- User ---
class UserBase(BaseModel):
    username: str
    full_name: str
    role: UserRole
    shift_type: Optional[str] = "KUNDUZ"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    password: Optional[str] = None
    is_active: Optional[int] = None
    shift_type: Optional[str] = None

class User(UserBase):
    id: int
    is_active: int
    class Config:
        from_attributes = True

# --- Operator ---
class OperatorBase(BaseModel):
    name: str
    phone: str = ""
    position: str = "Operator"
    shift_type: str = "KUNDUZ"

class OperatorCreate(OperatorBase):
    pass

class OperatorUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[int] = None
    shift_type: Optional[str] = None
    position: Optional[str] = None

class OperatorOut(OperatorBase):
    id: int
    is_active: int
    shift_type: str = "KUNDUZ"
    created_at: datetime
    class Config:
        from_attributes = True

# --- Attendance ---
class AttendanceSet(BaseModel):
    worker_id: int
    date: str
    status: str = "PRESENT"

class AttendanceOut(BaseModel):
    id: int
    worker_id: int
    date: str
    status: str
    class Config:
        from_attributes = True

# --- Assignment ---
class AssignmentCreate(BaseModel):
    operator_id: int
    machine_ids: List[str]
    shift_type: str = "KUNDUZ"

class AssignmentOut(BaseModel):
    id: int
    operator_id: int
    machine_id: str
    shift_type: str = "KUNDUZ"
    is_active: int
    assigned_at: datetime
    operator_name: str = ""
    class Config:
        from_attributes = True

# --- Rest Day ---
class RestDaySet(BaseModel):
    operator_id: Optional[int] = None
    user_id: Optional[int] = None
    person_id: Optional[int] = None
    person_type: Optional[str] = None
    day_of_week: int = 0
    week_start: Optional[str] = None
    rest_date: Optional[str] = None

class RestDayOut(BaseModel):
    id: int
    operator_id: Optional[int] = None
    user_id: Optional[int] = None
    day_of_week: int
    week_start: str
    operator_name: str = ""
    user_name: str = ""
    person_type: str = ""
    class Config:
        from_attributes = True

# --- Machine ---
class MachineBase(BaseModel):
    id: str
    category_id: int
    status: str

class MachineUpdate(BaseModel):
    initial_asnova_length: float
    last_operator_id: int

class Machine(MachineBase):
    initial_asnova_length: float
    meters_at_fill: float
    current_total_meters: float
    shift_meters: float = 0.0
    remaining_asnova: float = 0.0
    current_baud: int = 0
    current_protocol: str = "UNKNOWN"
    connection_source: str = "OFFLINE"
    preferred_source: str = "AUTO"
    class Config:
        from_attributes = True

# --- Mechanic Call ---
class MechanicCallCreate(BaseModel):
    machine_id: str
    reason: str = ""
    signal_type: str = "MECHANIC"

class MechanicCallOut(BaseModel):
    id: int
    machine_id: str
    called_by: int
    reason: str
    signal_type: str = "MECHANIC"
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class MechanicCallUpdate(BaseModel):
    status: str
    signal_type: Optional[str] = None

# --- Custom PDF ---
class CustomPDFRequest(BaseModel):
    title: str = "Hisobot"
    filename: str = "hisobot"
    rows: int = 30
    cols: int = 12
    cells: dict = {}
    mergedCells: dict = {}
    colWidths: dict = {}
    rowHeights: dict = {}

# --- Daily Plan ---
class DailyPlanCreate(BaseModel):
    operator_id: int
    machine_id: str
    date: str
    plan_meters: float

class DailyPlanUpdate(BaseModel):
    plan_meters: Optional[float] = None
    actual_meters: Optional[float] = None
    status: Optional[str] = None

class DailyPlanOut(BaseModel):
    id: int
    operator_id: int
    machine_id: str
    date: str
    plan_meters: float
    actual_meters: float
    status: str
    created_by: int
    created_at: datetime
    operator_name: str = ""
    class Config:
        from_attributes = True

class DailyPlanBulkCreate(BaseModel):
    date: str
    plans: List[DailyPlanCreate]

# Uzlavyaz Assignment schemas
class UzlavyazAssignmentCreate(BaseModel):
    uzlavyaz_id: int
    machine_id: str

class UzlavyazAssignmentOut(BaseModel):
    id: int
    uzlavyaz_id: int
    machine_id: str
    assigned_at: datetime
    is_active: int
    machine_name: str = ""
    class Config:
        from_attributes = True

# Asnova Empty Event schemas
class AsnovaEmptyEventOut(BaseModel):
    id: int
    machine_id: str
    empty_at: datetime
    filled_at: Optional[datetime] = None
    filled_by: Optional[int] = None
    delay_minutes: Optional[int] = None
    is_acknowledged: int
    class Config:
        from_attributes = True

class UzlavyazStats(BaseModel):
    uzlavyaz_id: int
    uzlavyaz_name: str
    total_machines: int
    empty_count: int
    delayed_count: int  # > 15 min
    avg_delay_minutes: float
