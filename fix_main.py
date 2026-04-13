with open('backend/app/main.py', 'r') as f:
    lines = f.readlines()
lines[405] = 'async def create_mechanic_call(data: schemas.MechanicCallCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(get_current_user)):\n'
lines.insert(406, '    call = models.MechanicCall(machine_id=data.machine_id, called_by=current_user.id, reason=data.reason, signal_type=data.signal_type)\n')
with open('backend/app/main.py', 'w') as f:
    f.writelines(lines)
print('Fixed!')