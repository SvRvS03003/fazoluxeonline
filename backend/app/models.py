from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Boolean
from sqlalchemy.orm import relationship
from .database import Base
import datetime
import enum

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MASTER = "MASTER"
    NAZORATCHI = "NAZORATCHI"
    MECHANIC = "MECHANIC"
    ELECTRIC = "ELECTRIC"
    UZLAVYAZ = "UZLAVYAZ"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    full_name = Column(String)
    role = Column(Enum(UserRole), default=UserRole.MASTER)
    shift_type = Column(String, default="KUNDUZ")
    is_active = Column(Integer, default=1)

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)

class Machine(Base):
    __tablename__ = "machines"
    id = Column(String, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    status = Column(String, default="STOPPED")
    
    initial_asnova_length = Column(Float, default=0.0)
    meters_at_fill = Column(Float, default=0.0)
    current_total_meters = Column(Float, default=0.0)
    shift_meters = Column(Float, default=0.0)
    
    current_baud = Column(Integer, default=0)
    current_protocol = Column(String, default="UNKNOWN")
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    
    esp_free_ram = Column(Integer, default=0)
    esp_total_ram = Column(Integer, default=0)
    esp_free_rom = Column(Integer, default=0)
    esp_total_rom = Column(Integer, default=0)
    esp_cpu_freq = Column(Integer, default=0)
    esp_wifi_ssid = Column(String, default="")
    esp_wifi_rssi = Column(Integer, default=0)
    connection_source = Column(String, default="OFFLINE")
    preferred_source = Column(String, default="AUTO")
    
    last_operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    category = relationship("Category")
    last_operator = relationship("User", foreign_keys=[last_operator_id])
    assignments = relationship("Assignment", back_populates="machine")

class Position(str, enum.Enum):
    OPERATOR = "Operator"
    MASTER = "Master"
    MECHANIC = "Mexanik"
    UZLAVYAZ = "Uzlavyaz"
    SMENA_BOSHLIGI = "Smena boshlig'i"

class Operator(Base):
    __tablename__ = "operators"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    phone = Column(String, default="")
    position = Column(String, default="Operator")
    shift_type = Column(String, default="KUNDUZ")
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    assignments = relationship("Assignment", back_populates="operator")
    attendance_records = relationship("Attendance", back_populates="worker")

class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("operators.id"))
    date = Column(String)  # YYYY-MM-DD
    status = Column(String, default="PRESENT")  # PRESENT, ABSENT, REST
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    worker = relationship("Operator", back_populates="attendance_records")

class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("operators.id"))
    machine_id = Column(String, ForeignKey("machines.id"))
    shift_type = Column(String, default="KUNDUZ")
    assigned_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_active = Column(Integer, default=1)

    operator = relationship("Operator", back_populates="assignments")
    machine = relationship("Machine", back_populates="assignments")

class RestDay(Base):
    __tablename__ = "rest_days"
    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("operators.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    day_of_week = Column(Integer)
    week_start = Column(String)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class AsnovaLog(Base):
    __tablename__ = "asnova_logs"
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(String, ForeignKey("machines.id"))
    operator_id = Column(Integer, ForeignKey("users.id"))
    operator_name = Column(String)
    length_added = Column(Float)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    meters_at_fill = Column(Float)

class ProductionLog(Base):
    __tablename__ = "production_logs"
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(String, ForeignKey("machines.id"))
    operator_id = Column(Integer, ForeignKey("operators.id"), nullable=True)
    operator_name = Column(String, default="")
    meters_woven = Column(Float)
    shift = Column(Integer)
    date = Column(DateTime, default=datetime.datetime.utcnow)

class MechanicCall(Base):
    __tablename__ = "mechanic_calls"
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(String, ForeignKey("machines.id"))
    called_by = Column(Integer, ForeignKey("users.id"))
    reason = Column(String, default="")
    signal_type = Column(String, default="MECHANIC")
    status = Column(String, default="PENDING")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

class DailyPlan(Base):
    __tablename__ = "daily_plans"
    id = Column(Integer, primary_key=True, index=True)
    operator_id = Column(Integer, ForeignKey("operators.id"))
    machine_id = Column(String, ForeignKey("machines.id"))
    date = Column(String)  # YYYY-MM-DD
    plan_meters = Column(Float, default=0.0)
    actual_meters = Column(Float, default=0.0)
    status = Column(String, default="PENDING")  # PENDING, COMPLETED, INCOMPLETE
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

    operator = relationship("Operator")
    machine = relationship("Machine")

# Uzlavyaz - Stanok assignment (who is responsible for which machines)
class UzlavyazAssignment(Base):
    __tablename__ = "uzlavyaz_assignments"
    id = Column(Integer, primary_key=True, index=True)
    uzlavyaz_id = Column(Integer, ForeignKey("users.id"))  # User with UZLAVYAZ role
    machine_id = Column(String, ForeignKey("machines.id"))
    assigned_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_active = Column(Integer, default=1)

# Asnova empty event tracking (for KPI)
class AsnovaEmptyEvent(Base):
    __tablename__ = "asnova_empty_events"
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(String, ForeignKey("machines.id"))
    empty_at = Column(DateTime, default=datetime.datetime.utcnow)
    filled_at = Column(DateTime, nullable=True)
    filled_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    delay_minutes = Column(Integer, nullable=True)
    is_acknowledged = Column(Integer, default=0)  # 0 = not acknowledged, 1 = acknowledged
