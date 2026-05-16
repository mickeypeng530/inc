# -*- coding: utf-8 -*-
"""Dump procedure-note rows + meeting region for inspection."""
import sys, io, openpyxl
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
XLSX = r'C:\Users\彭嗣翔\Claude_Work\Worknum\VS會議 + 績效.xlsx'

def colname(idx):
    s = ''
    while idx > 0:
        idx, r = divmod(idx - 1, 26)
        s = chr(65 + r) + s
    return s

for sheet in ['2312', '2401', '2402']:
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb[sheet]
    print(f'==== {sheet} (max_row={ws.max_row}) ====')
    for row in ws.iter_rows(min_row=12, max_row=ws.max_row):
        cells = []
        for c in row:
            if c.value is not None:
                v = c.value
                if isinstance(v, str):
                    v = v.strip()
                    if not v:
                        continue
                cells.append(f'{colname(c.column)}{c.row}={v!r}')
        if cells:
            print('  ' + ' | '.join(cells))
    print()
