# -*- coding: utf-8 -*-
"""
Worknum 歷史資料 import — Batch 1: 2312 / 2401 / 2402(2023-12 ~ 2024-02)

count 對應(已與 user 確認):
  CT:   OPD→ct.opd / ER→ct.er_adm_self / ADM→ct.opd(此期 ADM 價=OPD)
  MR:   OPD+ADM→mr.opd / ER→mr.er_adm_health
  Xray: OPD→xray.opd / ADM→xray.opd / ER→xray.er
  Special: 2312 全混→legacy / 2401 other,HSG / 2402 other,HSG,swallow
  會診/Sono = 單列(2402+)
procedure:每日格子 freeform("PICC*1"、"會診1 PTCD1sono1")→ fuzzy tokenize
meeting:Total 列之後,掃 主講/參與 列,欄位位置每月不同 → heuristic
overtime:加班刷卡列
"""
import sys, io, json, re, openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
XLSX = r'C:\Users\彭嗣翔\Claude_Work\Worknum\VS會議 + 績效.xlsx'
OUT_JSON = r'C:\Users\彭嗣翔\Claude_Work\Worknum\scripts\import_batch2.json'

# batch2:2024-03 / 2024-04
SHEET_MONTH = {'2403': '2024-03', '2404': '2024-04'}
CAT_LABELS = {'CT', 'MR', 'BMD', 'Special', 'X ray', 'Xray', '會診', 'Sono', 'OPD'}
LEGACY_SPECIAL_PRICE = 231

# procedure 名 → atomicId(longest-first 匹配);會診/sono 特殊處理
PROC_ALIAS = [
    # 長 alias 先,避免被短 alias 提前吃掉
    ('trigger point injection', 'inj'),
    ('caudal block', 'caudal_block'),  # 早期 NB 代稱,實際是 Caudal block
    ('cb+nb', 'cb_nb'), ('cb +nb', 'cb_nb'), ('cb nb', 'cb_nb'),
    ('celiac over 2', 'celiaco2'), ('celiac over two', 'celiaco2'),
    ('celiac2', 'celiaco2'), ('celiac', 'celiaco2'),  # 通用 fallback
    ('extremity+echo', 'extremity+echo'), ('extremity', 'extremity+echo'),
    ('subph dr', 'drain_sub'), ('subphdr', 'drain_sub'), ('subphenic', 'drain_sub'),
    ('echo guide', 'echo_guide'),
    ('drainage', 'drain_intra'), ('drain', 'drain_intra'),
    ('ptcdr', 'ptcdr'), ('ptgbd', 'ptgbd'), ('cstame', 'cstame'), ('ctame', 'ctame'),
    ('stame', 'stame'), ('ptcd', 'ptcd'), ('pcnr', 'pcnr'), ('picc', 'picc'),
    ('guide', 'guide'), ('biopsy', 'bone'), ('lung', 'lung'), ('bone', 'bone'),
    ('arthro', 'arthro'), ('ptc', 'ptc'), ('pcn', 'pcn'),
    ('tame', 'extremity+echo'),  # 早期 TAME = Extremity+echo($2100),非 TAE
    ('tae', 'tae'),
    ('caudal', 'caudal_block'),
    ('pic', 'picc'), ('inj', 'inj'), ('nb', 'nb'), ('av', 'av'),
    ('gb', 'ptgbd'),  # GB = PTGBD combo
    ('ptr', 'ptcdr'),  # PTR = PTCDR
]
# 會診 / sono token → 計入 count(非 procedure)
PROC_COUNT_TOKEN = {'會診': 'consult', 'sono': 'sono'}

# meetingCatalog 名稱 → (catalogId, role, amount);exact match 用真 id 不重複
MEETING_CATALOG = {
    '骨科手術案例討論':   ('mtg_ortho_case', '主講', 3000),
    '住院醫師核心課程':   ('mtg_resident',   '主講', 3000),
    'BMD業務討論會':      ('mtg_bmd_biz',    '主講', 0),
    '骨科住院醫師核心課程': ('mtg_ortho_resi', '主講', 0),
    '月 GI-GS':           ('mtg_gigs',       '參與', 500),
    '案例討論會':         ('mtg_case_disc',  '參與', 500),
    'Journal reading':    ('mtg_journal',    '參與', 500),
    '部務會議':           ('mtg_dept',       '參與', 1000),
    '主治醫師會議':       ('mtg_attending',  '參與', 500),
    '癌非癌':             ('mtg_cancer',     '參與', 500),
    'MM':                 ('mtg_mm',         '參與', 500),
    '教學檢討會議':       ('mtg_teach',      '參與', 500),
    '科務會議':           ('mtg_office',     '參與', 0),
    '骨科MM':             ('mtg_ortho_mm',   '參與', 0),
    '全院':               ('mtg_hospital',   '參與', 0),
    'CR業務討論會':       ('mtg_cr_biz',     '參與', 0),
}

# 部分速記其實是 combo:顯示維持速記名,但計價用 combo 總額(單一 item snapshot)
# key = PROC_ALIAS 解析後的 atomicId
PROC_COMBO_PRICE = {
    'picc':  3134,   # PICC+AV
    'pcn':   3315,   # PCN+A-P
    'ptgbd': 2988,   # PTGBD+PTC
}

# 預設 procedure 單價(embedded catalog 沒有時 fallback)
PROC_PRICE_DEFAULT = {
    'pcn': 3000, 'ap': 315, 'pcnr': 480, 'ptc': 1260, 'ptcd': 3840, 'ptcdr': 480,
    'ptgbd': 1728, 'guide': 1520, 'av': 2100, 'picc': 1034, 'tae': 8800,
    'ctame': 8800, 'cstame': 8800, 'stame': 1950, 'lung': 1520, 'bone': 1520,
    'arthro': 360, 'inj': 600, 'nb': 733, 'sono': 150, 'echo_guide': 600,
    'drain_intra': 4843, 'drain_sub': 4598,
    'caudal_block': 540,        # 2404 catalog 'Caudal block' = 540
    'extremity+echo': 2100,     # 2403/2404 catalog 'Extremity+echo' = 2100
    'cb_nb': 2047,              # CB = Caudal($540)+Myelo($907)+SO INJ($600) = 2047
    'celiaco2': 5250,
}

# build proc-token regex(longest-first)
_PROC_RE = re.compile(
    '(' + '|'.join(re.escape(k) for k, _ in PROC_ALIAS) + r'|會診|sono)\s*[\*x]?\s*(\d*)',
    re.IGNORECASE)


def colname(idx):
    s = ''
    while idx > 0:
        idx, r = divmod(idx - 1, 26)
        s = chr(65 + r) + s
    return s


def find_day_header(ws):
    days = {}
    for c in ws[1]:
        if isinstance(c.value, (int, float)) and 1 <= c.value <= 31:
            days[c.column] = int(c.value)
    return days


def parse_embedded_catalog(ws):
    """掃底部單價表:A=proc 名 B=價;回 {atomicId-ish lower: price}."""
    prices = {}
    for r in range(2, ws.max_row + 1):
        a = ws.cell(row=r, column=1).value
        b = ws.cell(row=r, column=2).value
        if isinstance(a, str) and isinstance(b, (int, float)) and b > 0:
            key = a.strip().lower().replace(' ', '')
            prices[key] = b
    return prices


def parse_sheet(ws, month):
    days = find_day_header(ws)
    if not days:
        raise RuntimeError(f'{month}: 找不到日期 header')

    a2 = ws.cell(row=2, column=1).value
    b2 = ws.cell(row=2, column=2).value
    total_in_A = isinstance(a2, (int, float)) and isinstance(b2, str)
    label_col = 2 if total_in_A else 1
    total_col = 1 if total_in_A else 2

    # count 區結束:'Total' 列;同列 D=績效總額 E=稅前薪水
    count_end_row = ws.max_row
    perf_total = None
    pretax_salary = None
    for rr in range(2, ws.max_row + 1):
        a_val = ws.cell(row=rr, column=1).value
        if isinstance(a_val, str) and a_val.strip() == 'Total':
            count_end_row = rr
            d_val = ws.cell(row=rr, column=4).value
            e_val = ws.cell(row=rr, column=5).value
            if isinstance(d_val, (int, float)): perf_total = d_val
            # E 欄稅前薪水以千元為單位(sheet 寫 526 = 52.6 萬 = 526000)
            if isinstance(e_val, (int, float)): pretax_salary = e_val * 1000
            break

    last_data_row = count_end_row - 1

    # 找類別 anchor
    cats = []
    r = 2
    while r <= last_data_row:
        lbl = ws.cell(row=r, column=label_col).value
        lbl = lbl.strip() if isinstance(lbl, str) else lbl
        if lbl in CAT_LABELS:
            subs = []
            rr = r + 1
            while rr <= last_data_row:
                nxt = ws.cell(row=rr, column=label_col).value
                nxt = nxt.strip() if isinstance(nxt, str) else nxt
                if nxt in CAT_LABELS:
                    break
                a_val = ws.cell(row=rr, column=1).value
                if isinstance(a_val, str) and ('加班' in a_val or 'Total' in a_val or '/' in a_val):
                    break
                has_day_data = any(isinstance(ws.cell(row=rr, column=cidx).value, (int, float))
                                   for cidx in days)
                b_val = ws.cell(row=rr, column=2).value
                if has_day_data or (label_col == 1 and isinstance(b_val, (int, float))
                                    and not isinstance(a_val, (int, float, str))):
                    subs.append(rr)
                    rr += 1
                else:
                    break
            cats.append({'label': lbl, 'main': r, 'subs': subs})
            r = rr
        else:
            r += 1

    # 加班刷卡列
    ot_row = None
    for rr in range(2, ws.max_row + 1):
        a_val = ws.cell(row=rr, column=1).value
        if isinstance(a_val, str) and '加班刷卡' in a_val:
            ot_row = rr
            break

    # procedure 備註列:count 區之後、含 '/' 月摘要 或 day 欄有 string 的列
    proc_row = None
    for rr in range(2, count_end_row):
        a_val = ws.cell(row=rr, column=1).value
        b_val = ws.cell(row=rr, column=2).value
        # 月摘要 pattern:A 或 B 有 '/' 或多 proc 名;且 day 欄有 string
        day_has_str = any(isinstance(ws.cell(row=rr, column=cidx).value, str)
                          for cidx in days)
        summary_like = (isinstance(a_val, str) and '/' in a_val) or \
                       (isinstance(b_val, str) and (' ' in b_val or '/' in b_val))
        if day_has_str and (summary_like or isinstance(a_val, (int, float))):
            proc_row = rr
            break
    # fallback:就找第一個 day 欄有 string 的列
    if proc_row is None:
        for rr in range(2, count_end_row):
            if any(isinstance(ws.cell(row=rr, column=cidx).value, str) for cidx in days):
                proc_row = rr
                break

    # 每日 $ 列 = proc_row 的下一列(實測 sum 剛好 = sheet 月計 Total)
    revenue_row = proc_row + 1 if proc_row else None

    return {
        'days': days, 'cats': cats, 'total_in_A': total_in_A,
        'total_col': total_col, 'ot_row': ot_row, 'proc_row': proc_row,
        'revenue_row': revenue_row, 'count_end_row': count_end_row,
        'perf_total': perf_total, 'pretax_salary': pretax_salary,
        'catalog': parse_embedded_catalog(ws),
    }


def build_days(ws, month, meta):
    days = meta['days']
    cats = meta['cats']
    out = {}

    def ensure(dnum):
        date = f'{month}-{dnum:02d}'
        if date not in out:
            out[date] = {'counts': {}, 'procedures': [], 'meetings': [],
                         'overtimeHours': 0, 'schedule': {}, 'notes': '',
                         'updatedAt': '', '_import': True}
        return out[date]

    def set_count(d, key, val):
        if val <= 0:
            return
        parts = key.split('.')
        tgt = d['counts']
        for p in parts[:-1]:
            tgt = tgt.setdefault(p, {})
        tgt[parts[-1]] = tgt.get(parts[-1], 0) + int(val)

    def add_special_other(d, count):
        if count <= 0:
            return
        sp = d['counts'].setdefault('special', {})
        others = sp.setdefault('others', [])
        others.append({'id': f'imp_{month}_{len(others)}_{int(count)}',
                       'catalogId': 'legacy_other', 'amount': LEGACY_SPECIAL_PRICE,
                       'count': int(count)})

    def read_row(rownum):
        res = {}
        for cidx, dnum in days.items():
            v = ws.cell(row=rownum, column=cidx).value
            if isinstance(v, (int, float)) and v != 0:
                res[dnum] = v
        return res

    def sub_label(rownum):
        """讀 A 欄 label,例如 '(HSG)' / '(LDCT)' / '(ER)'"""
        v = ws.cell(row=rownum, column=1).value
        return v.strip() if isinstance(v, str) else ''

    # ---- counts ----
    for cat in cats:
        lbl = cat['label']
        main = read_row(cat['main'])
        subs_data = [read_row(s) for s in cat['subs']]
        sub_labels = [sub_label(s) for s in cat['subs']]

        def assign_subs(default_keys, label_map):
            """
            兩 pass:
              pass 1 — 有 label 的 sub row 照 label_map 指派
              pass 2 — 無 label 的依 default_keys 順序填空缺(skip 已被 label 吃掉的 key)
            """
            assigned = [None] * len(subs_data)
            used_keys = set()
            # pass 1
            for i, alabel in enumerate(sub_labels):
                if not alabel:
                    continue
                for keyword, mapped in label_map.items():
                    if keyword in alabel:
                        assigned[i] = mapped
                        used_keys.add(mapped)
                        break
            # pass 2
            di = 0
            for i in range(len(subs_data)):
                if assigned[i] is not None:
                    continue
                while di < len(default_keys) and default_keys[di] in used_keys:
                    di += 1
                if di < len(default_keys):
                    assigned[i] = default_keys[di]
                    used_keys.add(default_keys[di])
                    di += 1
            return [(assigned[i], subs_data[i]) for i in range(len(subs_data)) if assigned[i]]

        if lbl == 'CT':
            # 主列 = OPD(已含 ADM,因 ADM 為 OPD 同價未獨立列)
            for d, v in main.items():
                set_count(ensure(d), 'ct.opd', v)
            for k, data in assign_subs(['ct.er_adm_self', 'ct.ldct_health'],
                                       {'LDCT': 'ct.ldct_health', 'ER': 'ct.er_adm_self'}):
                for d, v in data.items():
                    set_count(ensure(d), k, v)
        elif lbl == 'MR':
            for d, v in main.items():
                set_count(ensure(d), 'mr.opd', v)
            for k, data in assign_subs(['mr.er_adm_health'], {'ER': 'mr.er_adm_health'}):
                for d, v in data.items():
                    set_count(ensure(d), k, v)
        elif lbl == 'BMD':
            for d, v in main.items():
                set_count(ensure(d), 'bmd', v)
        elif lbl == 'Special':
            for d, v in main.items():
                add_special_other(ensure(d), v)
            # 2402:預設順序 sub1=HSG sub2=Swallow
            # 2404:row 10 顯式 (HSG) → 反過來 sub1=Swallow sub2=HSG
            for k, data in assign_subs(['special.hsg', 'special.swal'],
                                       {'HSG': 'special.hsg', 'Swal': 'special.swal', 'Swallow': 'special.swal'}):
                for d, v in data.items():
                    set_count(ensure(d), k, v)
        elif lbl in ('X ray', 'Xray'):
            # 主列 = OPD;sub1 = PORTABOL(床邊片);sub2 = ER
            for d, v in main.items():
                set_count(ensure(d), 'xray.opd', v)
            for k, data in assign_subs(['xray.portable', 'xray.er'],
                                       {'ER': 'xray.er', 'PORT': 'xray.portable'}):
                for d, v in data.items():
                    set_count(ensure(d), k, v)
        elif lbl == '會診':
            for d, v in main.items():
                set_count(ensure(d), 'consult', v)
        elif lbl == 'Sono':
            for d, v in main.items():
                set_count(ensure(d), 'sono', v)
        elif lbl == 'OPD':
            for d, v in main.items():
                set_count(ensure(d), 'opd', v)

    # ---- overtime ----
    if meta['ot_row']:
        for d, v in read_row(meta['ot_row']).items():
            ensure(d)['overtimeHours'] = float(v)

    # ---- 每日原始 $（importedRevenue,權威值,app 顯示優先用這個）----
    if meta['revenue_row']:
        for d, v in read_row(meta['revenue_row']).items():
            ensure(d)['importedRevenue'] = float(v)

    # ---- procedures ----
    catalog = meta['catalog']
    unmatched = []

    def proc_price(aid):
        # embedded catalog 先,fallback default
        for k in (aid, aid.replace('_', '')):
            if k in catalog:
                return catalog[k]
        return PROC_PRICE_DEFAULT.get(aid, 0)

    # ---- 偵測 detail proc row(row 21 風格)----
    # 格式:「<med_rec_id> <術式全名>」一行一筆;比 row 17 shorthand 詳細(2403/2404 有)
    detail_row = None
    if meta.get('ot_row') and meta.get('count_end_row'):
        for rr in range(meta['ot_row'] + 1, meta['count_end_row']):
            rich = 0
            for cidx in days:
                v = ws.cell(row=rr, column=cidx).value
                if not isinstance(v, str): continue
                for line in v.split('\n'):
                    if re.match(r'^([A-Z]?\d{4,})\s+\S', line.strip()):
                        rich += 1; break
            if rich >= 3:
                detail_row = rr; break

    if detail_row:
        # 用 detail row 解析 procedures(每行 1 筆 + 病歷號)
        for cidx, dnum in days.items():
            v = ws.cell(row=detail_row, column=cidx).value
            if not isinstance(v, str) or not v.strip():
                continue
            d = ensure(dnum)
            for raw in v.split('\n'):
                line = raw.strip()
                if not line: continue
                m = re.match(r'^([A-Z]?\d{4,})\s*(.*)$', line)
                if m:
                    medrec = m.group(1)
                    text = (m.group(2) or '').strip()
                else:
                    medrec = ''
                    text = line
                # match procedure alias(較長 alias 先,因為 PROC_ALIAS 已排序)
                aid = None
                matched_kw = None
                for kw, mapped in PROC_ALIAS:
                    if kw in text.lower():
                        aid = mapped; matched_kw = kw; break
                if not aid:
                    # 沒匹配 → 略過(可能是 meeting note 之類混進來)
                    continue
                price = PROC_COMBO_PRICE.get(aid) or proc_price(aid)
                disp = aid.upper() if len(aid) <= 5 else aid
                d['procedures'].append({
                    'presetId': aid, 'presetName': disp,
                    'medRecord': medrec,
                    'items': [{'atomicId': aid, 'name': disp, 'amount': price}],
                    'time': '', 'note': text, '_import': True,
                })
    elif meta['proc_row']:
        # fallback:用 row 17 shorthand 解析
        prow = meta['proc_row']
        for cidx, dnum in days.items():
            cell = ws.cell(row=prow, column=cidx).value
            if not isinstance(cell, str):
                continue
            txt = cell.strip()
            if not txt:
                continue
            d = ensure(dnum)
            consumed = []
            for m in _PROC_RE.finditer(txt):
                name = m.group(1).lower()
                cnt = int(m.group(2)) if m.group(2) else 1
                consumed.append(m.group(0))
                if name in ('會診',) or name == 'sono':
                    key = PROC_COUNT_TOKEN['會診' if name == '會診' else 'sono']
                    set_count(d, key, cnt)
                    continue
                aid = dict(PROC_ALIAS).get(name)
                if not aid:
                    continue
                price = PROC_COMBO_PRICE.get(aid) or proc_price(aid)
                disp = aid.upper() if len(aid) <= 5 else aid
                for _ in range(cnt):
                    d['procedures'].append({
                        'presetId': aid, 'presetName': disp,
                        'medRecord': '', 'items': [{'atomicId': aid, 'name': disp, 'amount': price}],
                        'time': '', 'note': txt, '_import': True,
                    })
            leftover = txt
            for c in consumed:
                leftover = leftover.replace(c, '', 1)
            leftover = leftover.strip(' /,')
            if leftover:
                unmatched.append(f'{month}-{dnum:02d}: {txt!r} 剩 {leftover!r}')
                d['notes'] = (d['notes'] + ' ' + leftover).strip()

    # 把 detail_row 存到 meta 方便下面 medRecord scan 跳過
    meta['_detail_row'] = detail_row

    # ---- 病歷號 row:daily-$ 跟 Total 之間的 row(2401 病歷號在 ot 前 row 15、2402 在 ot 後 row 20,不一致)----
    # 注意:2401 的 row 17 是「已加/未加」status 註記(PTCD未加、TAE加、未加 — 不是病歷號)
    # filter:剝掉「已加/未加/還沒加」後仍需含 4+ 連續數字才當病歷號
    if meta['revenue_row']:
        end_rr = meta['count_end_row']  # Total 列
        for rr in range(meta['revenue_row'] + 1, end_rr):
            if rr == meta.get('ot_row'):
                continue  # 跳過加班刷卡列(那是時數不是病歷號)
            if rr == meta.get('_detail_row'):
                continue  # detail row 已當作 procedure 來源,每筆病歷號各自附在 proc 內
            for cidx, dnum in days.items():
                v = ws.cell(row=rr, column=cidx).value
                if v is None:
                    continue
                # float 整數值要去掉 .0(如 960485.0 → "960485")
                if isinstance(v, float) and v.is_integer():
                    txt = str(int(v))
                elif isinstance(v, str):
                    txt = v.strip()
                else:
                    txt = str(v).strip()
                if not txt:
                    continue
                # 剝掉 已加/未加/還沒加 status 標記
                cleaned = re.sub(r'\s*(?:未加|已加|還沒加|未開|已開)\s*', ' ', txt).strip()
                # 必須含 4+ 連續數字才算病歷號(濾掉 PTCD未加 / TAE加 / Drainage2 等 status 註記)
                if not re.search(r'\d{4,}', cleaned):
                    continue
                d = ensure(dnum)
                procs = d.get('procedures', [])
                for p in procs:
                    existing = (p.get('medRecord') or '').strip()
                    if not existing:
                        p['medRecord'] = cleaned
                    elif cleaned not in existing:
                        p['medRecord'] = existing + ' / ' + cleaned

    # ---- meetings ----
    mtg_count = parse_meetings(ws, month, meta, ensure)

    # ---- 當月值班數目(值班 label 旁那格,例:IR2平1假)----
    duty_note = None
    for r in range(2, ws.max_row + 1):
        hit = None
        for c in ws[r]:
            if isinstance(c.value, str) and c.value.strip() == '值班':
                hit = c.column
                break
        if hit is not None:
            for cc in ws[r]:
                if cc.column > hit and isinstance(cc.value, str) and cc.value.strip():
                    duty_note = cc.value.strip()
                    break
            if duty_note:
                break

    return out, unmatched, mtg_count, duty_note


def parse_meetings(ws, month, meta, ensure):
    """Total 列之後掃 主講/參與 列。欄位位置每月不同 → 用 heuristic。"""
    start = meta['count_end_row']
    role_re = re.compile(r'^(主講|參與)')
    count = 0
    for r in range(start, ws.max_row + 1):
        # 找 role cell
        role = None
        role_col = None
        for c in ws[r]:
            if isinstance(c.value, str) and role_re.match(c.value.strip()):
                role = role_re.match(c.value.strip()).group(1)
                role_col = c.column
                break
        if not role:
            continue
        # 同列找 dates / name / amount
        # 跳過 A/B/C 欄(稅額/值班/Total label 區)
        # amount 必須在 role 欄之後 — 否則會撞到 procedure ref table(D/E)或稅前薪水(E18)等無關數字
        dates_raw = None
        name = None
        amount = None
        for c in ws[r]:
            if c.column == role_col or c.column <= 3:
                continue
            v = c.value
            if v is None:
                continue
            if isinstance(v, (int, float)):
                if 1 <= v <= 31 and dates_raw is None:
                    dates_raw = str(int(v))
                elif 31 < v <= 15000 and c.column > role_col:
                    # amount 限 role 欄之後
                    amount = v
            elif isinstance(v, str):
                vs = v.strip()
                if re.fullmatch(r'[\d,\s]+', vs):  # "6,13,19,27"
                    dates_raw = vs
                elif c.column > role_col and len(vs) > len(name or ''):
                    # name 也限 role 欄之後(避免抓到左邊的 procedure ref 名稱)
                    name = vs
        if dates_raw is None or name is None:
            continue
        dnums = [int(x) for x in re.split(r'[,\s]+', dates_raw) if x.strip().isdigit()]
        # exact match 既有 catalog → 用真 catalogId,填進既有列不重複
        matched = MEETING_CATALOG.get(name.strip())
        if matched:
            catalogId, mrole, mamt = matched
            role = mrole
            if amount is None:
                amount = mamt
        else:
            catalogId = 'imp_' + re.sub(r'\W+', '', name)[:12]
            if amount is None:
                amount = 3000 if role == '主講' else 500
        for dn in dnums:
            if 1 <= dn <= 31:
                ensure(dn)['meetings'].append({
                    'catalogId': catalogId,
                    'role': role, 'name': name, 'amount': amount, '_import': True,
                })
                count += 1
    return count


def validate(ws, meta, out_days, month):
    total_col = meta['total_col']
    print(f'--- {month} ---')
    for cat in meta['cats']:
        st = ws.cell(row=cat['main'], column=total_col).value
        lbl = cat['label']
        keys = {'CT': ['ct.opd', 'ct.er_adm_self', 'ct.ldct_health'],
                'MR': ['mr.opd', 'mr.er_adm_health'],
                'BMD': ['bmd'],
                'X ray': ['xray.opd', 'xray.portable', 'xray.er'],
                'Xray': ['xray.opd', 'xray.portable', 'xray.er'],
                '會診': ['consult'], 'Sono': ['sono'], 'OPD': ['opd']}.get(lbl)
        parsed = 0
        if lbl == 'Special':
            for d in out_days.values():
                sp = d['counts'].get('special', {})
                parsed += sum(o['count'] for o in sp.get('others', []))
                parsed += sp.get('swal', 0) + sp.get('hsg', 0)
        elif keys:
            for d in out_days.values():
                for k in keys:
                    v = d['counts']
                    for p in k.split('.'):
                        v = v.get(p, {}) if isinstance(v, dict) else 0
                    if isinstance(v, (int, float)):
                        parsed += v
        flag = '' if (isinstance(st, (int, float)) and abs(st - parsed) < 0.5) else '  ⚠️'
        print(f'  計數 {lbl:8s} sheet={st!s:>8} 解析={parsed:>8}{flag}')
    # procedure 總數 vs 月摘要
    proc_total = sum(len(d['procedures']) for d in out_days.values())
    print(f'  procedure 解析共 {proc_total} 筆')
    # overtime 月計
    ot_sum = sum(d['overtimeHours'] for d in out_days.values())
    print(f'  加班時數 解析共 {ot_sum} hr')
    mtg_total = sum(len(d['meetings']) for d in out_days.values())
    print(f'  會議 解析共 {mtg_total} 場次')
    # importedRevenue 月計 vs sheet 'Total' B 欄
    rev_sum = sum(d.get('importedRevenue', 0) for d in out_days.values())
    sheet_total = None
    for rr in range(2, ws.max_row + 1):
        if isinstance(ws.cell(row=rr, column=1).value, str) and ws.cell(row=rr, column=1).value.strip() == 'Total':
            sheet_total = ws.cell(row=rr, column=2).value
            break
    flag = '' if (isinstance(sheet_total,(int,float)) and abs(sheet_total - rev_sum) < 1) else '  ⚠️'
    print(f'  原始收入 解析sum={rev_sum:,.0f}  sheet Total={sheet_total!s}{flag}')


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    all_days = {}
    all_unmatched = []
    monthly_meta = {}
    for sheet, month in SHEET_MONTH.items():
        ws = wb[sheet]
        meta = parse_sheet(ws, month)
        out_days, unmatched, mtg_count, duty_note = build_days(ws, month, meta)
        validate(ws, meta, out_days, month)
        mm = {}
        if duty_note:
            mm['dutyNote'] = duty_note
        if meta.get('perf_total') is not None:
            mm['perfTotal'] = meta['perf_total']
        if meta.get('pretax_salary') is not None:
            mm['pretaxSalary'] = meta['pretax_salary']
        if mm:
            monthly_meta[month] = mm
            print(f'  monthlyMeta = {mm}')
        all_days.update(out_days)
        all_unmatched += unmatched
        print()

    print(f'=== 共 {len(all_days)} 天 ===')
    if all_unmatched:
        print(f'⚠️ procedure 未匹配片段 ({len(all_unmatched)}):')
        for u in all_unmatched:
            print('   ' + u)
    # sample
    sd = sorted(all_days.keys())
    for date in (sd[0], sd[len(sd)//2], sd[-1]):
        print(f'\nsample {date}:')
        print(json.dumps(all_days[date], ensure_ascii=False, indent=2))

    out = {'days': all_days}
    if monthly_meta:
        out['monthlyMeta'] = monthly_meta
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'\n寫出 {OUT_JSON}')


if __name__ == '__main__':
    main()
