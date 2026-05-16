# -*- coding: utf-8 -*-
"""Dump a sheet's non-empty cells for structure inspection."""
import sys, io, openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

XLSX = r'C:\Users\彭嗣翔\Claude_Work\Worknum\VS會議 + 績效.xlsx'

def dump(sheet_name, max_rows=80):
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb[sheet_name]
    print(f'=== Sheet {sheet_name!r}  dims={ws.dimensions}  max_row={ws.max_row} max_col={ws.max_column} ===')
    # merged ranges
    if ws.merged_cells.ranges:
        print('merged:', ', '.join(str(r) for r in ws.merged_cells.ranges))
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, max_rows)):
        cells = []
        for c in row:
            if c.value is not None:
                v = c.value
                if isinstance(v, str):
                    v = v.strip()
                    if not v:
                        continue
                cells.append(f'{c.coordinate}={v!r}')
        if cells:
            print('  ' + ' | '.join(cells))

if __name__ == '__main__':
    names = sys.argv[1:] if len(sys.argv) > 1 else ['2312']
    for n in names:
        dump(n)
        print()
