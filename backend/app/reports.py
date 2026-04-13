import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import io
import datetime

COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

def col_label(c):
    if c < 26:
        return COL_LABELS[c]
    return COL_LABELS[c // 26 - 1] + COL_LABELS[c % 26]

def generate_weaver_excel(data):
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Weaver Report')
    output.seek(0)
    return output

def generate_pdf_report(title, headers, data):
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=letter)
    elements = []
    
    styles = getSampleStyleSheet()
    elements.append(Paragraph(title, styles['Title']))
    elements.append(Paragraph(f"Generated on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    elements.append(Spacer(1, 12))
    
    table_data = [headers] + data
    t = Table(table_data)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    
    elements.append(t)
    doc.build(elements)
    output.seek(0)
    return output

def generate_custom_pdf(title, num_rows, num_cols, cells_data):
    """Generate PDF from custom Excel-like table data - only includes rows/cols with content."""

    # Find actual bounds of data (only cells with values or styles)
    max_row = -1
    max_col = -1
    min_row = 999999
    min_col = 999999

    for key, cell in cells_data.items():
        val = str(cell.get('value', ''))
        style = cell.get('style', {})
        linked = cell.get('linkedMachine')

        # Include cell if it has value, style, or linked machine
        if val or style or linked:
            r, c = map(int, key.split('-'))
            max_row = max(max_row, r)
            max_col = max(max_col, c)
            min_row = min(min_row, r)
            min_col = min(min_col, c)

    if max_row == -1 or max_col == -1:
        # No data, return minimal table
        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()
        elements.append(Paragraph(title, styles['Title']))
        elements.append(Paragraph("Ma'lumot yo'q", styles['Normal']))
        doc.build(elements)
        output.seek(0)
        return output

    actual_rows = max_row - min_row + 1
    actual_cols = max_col - min_col + 1

    output = io.BytesIO()
    page_size = landscape(letter) if actual_cols > 6 else letter
    doc = SimpleDocTemplate(output, pagesize=page_size, 
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=20*mm, bottomMargin=15*mm)
    elements = []

    styles = getSampleStyleSheet()
    elements.append(Paragraph(title, styles['Title']))
    elements.append(Paragraph(f"Yaratilgan: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    elements.append(Spacer(1, 12))

    # Build table data from cells - only actual data area
    table_rows = []
    for r in range(min_row, max_row + 1):
        row = []
        for c in range(min_col, max_col + 1):
            key = f"{r}-{c}"
            cell = cells_data.get(key, {})
            val = str(cell.get('value', ''))
            if val.startswith('stanok:'):
                machine_id = val.split(':', 1)[1]
                linked = cell.get('linkedMachine', machine_id)
                val = f"{linked}"
            row.append(val)
        table_rows.append(row)

    if not table_rows:
        table_rows = [[""]]

    available_width = page_size[0] - 30*mm
    col_width = max(15*mm, min(30*mm, available_width / max(actual_cols, 1)))
    t = Table(table_rows, colWidths=[col_width] * actual_cols)

    style_commands = [
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.Color(0.6, 0.6, 0.6)),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]

    # Apply cell styles
    for r in range(min_row, max_row + 1):
        for c in range(min_col, max_col + 1):
            key = f"{r}-{c}"
            cell = cells_data.get(key, {})
            cell_style = cell.get('style', {})

            # Adjust coordinates relative to table
            tr = r - min_row
            tc = c - min_col

            if cell_style.get('fontWeight') == 700:
                style_commands.append(('FONTNAME', (tc, tr), (tc, tr), 'Helvetica-Bold'))

            if cell_style.get('fontStyle') == 'italic':
                style_commands.append(('FONTNAME', (tc, tr), (tc, tr), 'Helvetica-Oblique'))

            bg = cell_style.get('background', '')
            if bg and bg != 'transparent':
                try:
                    if bg.startswith('rgba('):
                        parts = bg[5:-1].split(',')
                        cr = float(parts[0].strip()) / 255
                        cg = float(parts[1].strip()) / 255
                        cb = float(parts[2].strip()) / 255
                        style_commands.append(('BACKGROUND', (tc, tr), (tc, tr), colors.Color(cr, cg, cb)))
                    elif bg.startswith('#'):
                        h = bg.lstrip('#')
                        if len(h) == 6:
                            cr = int(h[0:2], 16) / 255
                            cg = int(h[2:4], 16) / 255
                            cb = int(h[4:6], 16) / 255
                            style_commands.append(('BACKGROUND', (tc, tr), (tc, tr), colors.Color(cr, cg, cb)))
                except Exception:
                    pass

            text_color = cell_style.get('color', '')
            if text_color and text_color.startswith('#'):
                try:
                    h = text_color.lstrip('#')
                    if len(h) == 6:
                        cr = int(h[0:2], 16) / 255
                        cg = int(h[2:4], 16) / 255
                        cb = int(h[4:6], 16) / 255
                        style_commands.append(('TEXTCOLOR', (tc, tr), (tc, tr), colors.Color(cr, cg, cb)))
                except Exception:
                    pass

            align = cell_style.get('textAlign', 'center')
            if align:
                style_commands.append(('ALIGN', (tc, tr), (tc, tr), align.upper()))

    t.setStyle(TableStyle(style_commands))
    elements.append(t)
    doc.build(elements)
    output.seek(0)
    return output
