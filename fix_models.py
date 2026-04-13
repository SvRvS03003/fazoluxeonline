with open('backend/app/models.py', 'r') as f:
    content = f.read()
content = content.replace('    MECHANIC = "MECHANIC"', '    MECHANIC = "MECHANIC"\n    ELECTRIC = "ELECTRIC"')
with open('backend/app/models.py', 'w') as f:
    f.write(content)
print('Fixed!')