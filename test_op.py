import urllib.request
import json

API = "http://localhost:8000"

# Login
login_data = "username=SvRvS3003&password=Saidakbar3003!"
req = urllib.request.Request(f"{API}/token", data=login_data.encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
r = urllib.request.urlopen(req)
token = json.loads(r.read())["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("Token OK")

# Create KUNDUZ operator
op1 = json.dumps({"name": "Ali Valiyev", "phone": "+998901111111", "shift_type": "KUNDUZ"}).encode()
req1 = urllib.request.Request(f"{API}/operators", data=op1, headers=headers, method="POST")
r1 = urllib.request.urlopen(req1)
op1_data = json.loads(r1.read())
print(f"Created KUNDUZ operator: {op1_data['name']} (id={op1_data['id']})")

# Create TUNGI operator
op2 = json.dumps({"name": "Vali Aliyev", "phone": "+998902222222", "shift_type": "TUNGI"}).encode()
req2 = urllib.request.Request(f"{API}/operators", data=op2, headers=headers, method="POST")
r2 = urllib.request.urlopen(req2)
op2_data = json.loads(r2.read())
print(f"Created TUNGI operator: {op2_data['name']} (id={op2_data['id']})")

# Assign KUNDUZ operator to S1, S2
asg1 = json.dumps({"operator_id": op1_data["id"], "machine_ids": ["S1", "S2"]}).encode()
req3 = urllib.request.Request(f"{API}/assignments", data=asg1, headers=headers, method="POST")
r3 = urllib.request.urlopen(req3)
print(f"Assigned {op1_data['name']} to S1, S2: {json.loads(r3.read())}")

# Assign TUNGI operator to S3, S4
asg2 = json.dumps({"operator_id": op2_data["id"], "machine_ids": ["S3", "S4"]}).encode()
req4 = urllib.request.Request(f"{API}/assignments", data=asg2, headers=headers, method="POST")
r4 = urllib.request.urlopen(req4)
print(f"Assigned {op2_data['name']} to S3, S4: {json.loads(r4.read())}")

# List assignments
req5 = urllib.request.Request(f"{API}/assignments", headers={"Authorization": f"Bearer {token}"})
r5 = urllib.request.urlopen(req5)
assignments = json.loads(r5.read())
print(f"\nAll assignments:")
for a in assignments:
    print(f"  {a['operator_name']} -> {a['machine_id']} (shift: {a['shift_type']})")