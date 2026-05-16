# -*- coding: utf-8 -*-
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
d = json.load(open(r'C:\Users\彭嗣翔\Claude_Work\Worknum\scripts\import_batch1.json', encoding='utf-8'))
for date, day in sorted(d['days'].items()):
    for p in day.get('procedures', []):
        print(f"{date}: {p['presetName']} → {p.get('medRecord') or '(empty)'}")
