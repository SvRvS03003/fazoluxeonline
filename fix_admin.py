with open('frontend/src/components/AdminPanel.jsx', 'r') as f:
    content = f.read()
content = content.replace(
    "MECHANIC: '#f59e0b' };",
    "MECHANIC: '#f59e0b', ELECTRIC: '#06b6d4' };"
)
content = content.replace(
    '<option value="ADMIN">ADMIN</option>\n              </select>',
    '<option value="ELECTRIC">ELECTRIC</option>\n                <option value="ADMIN">ADMIN</option>\n              </select>'
)
with open('frontend/src/components/AdminPanel.jsx', 'w') as f:
    f.write(content)
print('Fixed!')