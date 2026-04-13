import urllib.request
import json

# Login first
login_data = "username=SvRvS3003&password=Saidakbar3003!"
req = urllib.request.Request(
    'http://localhost:8000/token',
    data=login_data.encode(),
    headers={"Content-Type": "application/x-www-form-urlencoded"}
)
try:
    r = urllib.request.urlopen(req)
    token = json.loads(r.read())["access_token"]
    print(f"Token: {token[:20]}...")
    
    # Test creating operator
    op_data = json.dumps({"name": "Test Operator", "phone": "+998901234567", "shift_type": "KUNDUZ"}).encode()
    req2 = urllib.request.Request(
        'http://localhost:8000/operators',
        data=op_data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method='POST'
    )
    r2 = urllib.request.urlopen(req2)
    print(f"Create operator: {json.loads(r2.read())}")
    
    # List operators
    req3 = urllib.request.Request(
        'http://localhost:8000/operators',
        headers={"Authorization": f"Bearer {token}"}
    )
    r3 = urllib.request.urlopen(req3)
    ops = json.loads(r3.read())
    print(f"Operators: {len(ops)}")
    for op in ops:
        print(f"  - {op['name']} (shift: {op['shift_type']})")
except Exception as e:
    print(f"Error: {e}")