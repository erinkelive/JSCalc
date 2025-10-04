
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Atualizador de bases para a sua calculadora judicial.

✔ SELIC mensal (SGS 4390) via API BCData/SGS
✔ Poupança mensal (SGS 195) via API BCData/SGS (a partir de 04/05/2012)
✔ Backups automáticos (./backups/ARQ.YYYY-MM-DD_HHMMSS.bak)
✔ Verificação de não-regressão com 2 modos:
   - month  (DEFAULT): compara por mês (YYYY-MM), útil quando o arquivo antigo
                       usa datas no meio do mês (ex.: 2021-03-18) para valores mensais.
   - strict: compara datas ISO completas (YYYY-MM-DD).
✔ Restauração automática em caso de falha
✔ WATCH (checagem periódica) opcional
✔ DEBUG (detalhado) e códigos de erro curtos (0xF0001xx / 0xF0002xx)

CLI exemplos:
  python update_indices.py selic --root . --out selic_data.js --debug True
  python update_indices.py poup  --root . --out poupanca_data.js --debug True

  # Verificar regressão contra backup (por mês):
  python update_indices.py verify --root . --target selic_data.js --nr-mode month

  # Restaurar último backup:
  python update_indices.py restore-last --root . --target selic_data.js

  # Watch a cada 12h para SELIC (por mês):
  python update_indices.py watch --what selic --watch 43200 --root . --out selic_data.js --nr-mode month --debug False
"""

from __future__ import annotations
import argparse
import dataclasses
import datetime as dt
import json
import os
import re
import shutil
import sys
import time
from typing import List, Tuple, Dict, Optional

try:
    import urllib.request as urlreq
    import urllib.parse as urlparse
except Exception as e:
    print("ERRO: Ambiente sem urllib.", e)
    sys.exit(1)

# =========================
# CONFIGURAÇÕES (EDITÁVEIS)
# =========================

@dataclasses.dataclass
class Config:
    # ======== Geral ========
    DEBUG: bool = True
    WATCH_SECONDS: int = 0          # 0 = desliga watch
    ROOT_DIR: str = "."
    BACKUP_DIR: str = "./backups"

    # ======== Séries SGS ========
    SGS_BASE: str = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados"
    SGS_SERIE_SELIC_MENSAL: str = "4390"  # Selic acumulada no mês, % a.m.
    SGS_SERIE_SELIC_DIARIA_ANN252: str = "1178"  # Selic diária (anualizada base 252, % a.a. no dia)
    SGS_SERIE_POUP_MENSAL: str = "196"    # Poupança (após 04/05/2012) - rentabilidade no período, % a.m.
    #SGS_SERIE_POUP_ANTIGA: str = "25"     # Poupança (regra antiga) - até 2012-05
    SGS_SERIE_POUP_ANTIGA: str = "7828"     # Poupança (regra antiga) - até 2012-05

    # ======== Arquivos ========
    SELIC_JS_NAME: str = "selic_data.js"
    POUP_JS_NAME: str = "poupanca_data.js"

    # ======== JS: chaves/formatos ========
    SELIC_JS_CONST_NAME: str = "selicFactors"
    POUP_JS_CONST_NAME: str = "poupancaFactors"

    # ======== Datas/formatos ========
    DATE_IN_SGS: str = "%d/%m/%Y"  # data vem em dd/mm/yyyy
    OUT_DATE_ISO: str = "%Y-%m-01" # normalizar mês para dia 01
    POUP_CUTOFF_ISO: str = "2012-05-01"   # a partir deste mês usar série 196; antes usar série 25
    DECIMALS_JS: int = 6

    # ======== Não-regressão ========
    # Modo default agora é "month": compara por YYYY-MM (tolerante a datas DD != 01 no arquivo antigo).
    NR_MODE_DEFAULT: str = "month"    # "month" | "strict"
    TREAT_CHANGED_OLD_VALUES_AS_ERROR: bool = False

    # ======== Mensagens/Erros ========
    ERROR_CODES: Dict[str, str] = dataclasses.field(default_factory=lambda: {
        # SELIC 0xF0001**
        "0xF000101": "Falha ao baixar dados da SGS (SELIC).",
        "0xF000102": "Falha ao extrair/parsear dados SELIC (lista vazia).",
        "0xF000103": "Falha ao serializar/gerar selic_data.js.",
        "0xF000104": "Falha de não-regressão (SELIC: novo perdeu períodos vs antigo).",
        "0xF000105": "Falha ao gravar arquivo/backup (SELIC).",
        "0xF000106": "Falha ao restaurar backup (SELIC).",
        # POUP  0xF0002**
        "0xF000201": "Falha ao baixar dados da SGS (Poupança).",
        "0xF000202": "Falha ao extrair/parsear dados Poupança (lista vazia).",
        "0xF000203": "Falha ao serializar/gerar poupanca_data.js.",
        "0xF000204": "Falha de não-regressão (Poupança: novo perdeu períodos vs antigo).",
        "0xF000205": "Falha ao gravar arquivo/backup (Poupança).",
        "0xF000206": "Falha ao restaurar backup (Poupança).",
    })

CONFIG = Config()

# ==================
# LOG / UTILITÁRIOS
# ==================

def log(msg: str):
    if CONFIG.DEBUG:
        print(f"[DEBUG] {msg}")

def err(code: str, extra: str = ""):
    base = CONFIG.ERROR_CODES.get(code, "Erro desconhecido.")
    if CONFIG.DEBUG:
        print(f"[ERRO] {code} :: {base} {extra}")
    else:
        print(f"ERRO {code}")
    return code

def now_stamp() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d_%H%M%S")

def ensure_dirs():
    os.makedirs(CONFIG.ROOT_DIR, exist_ok=True)
    os.makedirs(CONFIG.BACKUP_DIR, exist_ok=True)

def join_root(name: str) -> str:
    return os.path.join(CONFIG.ROOT_DIR, name)

def month_key(date_iso: str) -> str:
    # date_iso esperado "YYYY-MM-DD"
    return date_iso[:7]  # YYYY-MM

# ===========================
# DOWNLOAD SGS (chunk por ano)
# ===========================

def http_get_json(url: str, timeout: int = 30) -> Optional[list]:
    try:
        log(f"GET {url}")
        with urlreq.urlopen(url, timeout=timeout) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status}")
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except Exception as e:
        return None

def fetch_sgs_series(serie: str, start_year: int = 1990, end_year: Optional[int] = None) -> List[dict]:
    if end_year is None:
        end_year = dt.date.today().year
    base = CONFIG.SGS_BASE.format(serie=serie)
    all_items: List[dict] = []
    for year in range(start_year, end_year + 1):
        ini = f"01/01/{year}"
        fim = f"31/12/{year}"
        params = {"formato": "json", "dataInicial": ini, "dataFinal": fim}
        url = f"{base}?{urlparse.urlencode(params)}"
        js = http_get_json(url)
        if js is None or not isinstance(js, list):
            log(f"Falha ao obter ano {year} da série {serie}.")
            continue
        all_items.extend(js)
    # dedup por data (último vence), ordenar
    seen = {}
    for it in all_items:
        seen[it.get("data")] = it.get("valor")
    out = [{"data": k, "valor": v} for k, v in seen.items() if k]
    def to_date(s): return dt.datetime.strptime(s, CONFIG.DATE_IN_SGS).date()
    out.sort(key=lambda d: to_date(d["data"]))
    return out
def fetch_sgs_series_range(serie: str, start_date: str, end_date: str, step_years: int = 1) -> List[dict]:
    base = CONFIG.SGS_BASE.format(serie=serie)
    d0 = dt.datetime.strptime(start_date, "%d/%m/%Y").date()
    d1 = dt.datetime.strptime(end_date, "%d/%m/%Y").date()
    all_items = []
    y = d0.year
    while y <= d1.year:
        ini = dt.date(y, 1, 1)
        fim = dt.date(min(y + step_years - 1, d1.year), 12, 31)
        if ini < d0: ini = d0
        if fim > d1: fim = d1
        params = {"formato": "json", "dataInicial": ini.strftime("%d/%m/%Y"), "dataFinal": fim.strftime("%d/%m/%Y")}
        url = f"{base}?{urlparse.urlencode(params)}"
        #print (url)
        js = http_get_json(url)
        if js is not None and isinstance(js, list):
            all_items.extend(js)
        y += step_years
    seen = {}
    for it in all_items:
        if it.get("data"):
            seen[it["data"]] = it.get("valor")
    out = [{"data": k, "valor": v} for k, v in seen.items()]
    def to_date(s): return dt.datetime.strptime(s, CONFIG.DATE_IN_SGS).date()
    out.sort(key=lambda d: to_date(d["data"]))
    return out
def fetch_selic1178_monthly_pairs(start_year: int = 1990) -> List[Tuple[str, float]]:
    """
    Busca a série 1178 (Selic anualizada base 252) diariamente e agrega em fator mensal.
    Passos:
      - Para cada dia útil do mês, converter % a.a. base 252 em fator diário: fd = (1 + r_aa) ** (1/252) - 1
      - Fator mensal: prod(1 + fd) - 1 sobre todos os dias úteis daquele mês.
    Retorna [("YYYY-MM-01", fator_mensal_decimal), ...]
    """
    items = fetch_sgs_series(CONFIG.SGS_SERIE_SELIC_DIARIA_ANN252, start_year)
    if not items:
        return []
    # Agrupar por YYYY-MM
    from collections import defaultdict
    buckets = defaultdict(list)
    for it in items:
        raw_date = it.get("data"); raw_val = it.get("valor")
        if not raw_date or raw_val in (None, ""):
            continue
        try:
            d = dt.datetime.strptime(raw_date, CONFIG.DATE_IN_SGS).date()
            key = f"{d.year:04d}-{d.month:02d}"
            r_aa = float(str(raw_val).replace(",", ".").strip()) / 100.0  # % a.a. -> decimal a.a.
            # fator diário correspondente (base 252)
            fd = (1.0 + r_aa) ** (1.0/252.0) - 1.0
        except Exception:
            continue
        buckets[key].append(fd)
    pairs: List[Tuple[str, float]] = []
    for key in sorted(buckets.keys()):
        acc = 1.0
        for fd in buckets[key]:
            acc *= (1.0 + fd)
        fm = acc - 1.0
        date_iso = f"{key}-01"
        pairs.append((date_iso, fm))
    return pairs



# ===========================
# PARSE / SERIALIZAÇÃO JS
# ===========================

PAIR_RE = re.compile(
    r"""\{\s*date\s*:\s*['"](\d{4}-\d{2}-\d{2})['"]\s*,\s*factor\s*:\s*([0-9.]+)\s*\}""",
    re.MULTILINE
)

def read_js_pairs(path: str) -> List[Tuple[str, float]]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    out = [(m.group(1), float(m.group(2))) for m in PAIR_RE.finditer(content)]
    return sorted(out, key=lambda x: x[0])

def serialize_js(const_name: str, pairs: List[Tuple[str, float]]) -> str:
    lines = [f"  {{ date: '{d}', factor: {v:.{CONFIG.DECIMALS_JS}f} }}," for d, v in pairs]
    return f"const {const_name} = [\n" + "\n".join(lines) + "\n];\n"

def backup_file(path: str) -> Optional[str]:
    try:
        if not os.path.exists(path):
            return None
        ensure_dirs()
        stamp = now_stamp()
        base = os.path.basename(path)
        dest = os.path.join(CONFIG.BACKUP_DIR, f"{base}.{stamp}.bak")
        shutil.copy2(path, dest)
        log(f"Backup criado: {dest}")
        return dest
    except Exception as e:
        return None

def non_regression(old: List[Tuple[str, float]], new: List[Tuple[str, float]], code_on_fail: str, mode: str) -> bool:
    if mode == "month":
        # comparar por YYYY-MM
        old_keys = {month_key(d) for d, _ in old}
        new_keys = {month_key(d) for d, _ in new}
    else:  # strict
        old_keys = {d for d, _ in old}
        new_keys = {d for d, _ in new}
    lost = sorted(list(old_keys - new_keys))
    #print ("Old:")
    #print (sorted(list(old_keys)))
    #print ("\n")
    #print ("NEW:")
    #print (sorted(list(new_keys)))
    if lost:
        #err(code_on_fail, extra=f"Períodos perdidos: {lost[:5]}{'...' if len(lost)>5 else ''}")
        err(code_on_fail, extra=f"Períodos perdidos: {lost}{'...' if len(lost)>5 else ''}")
        return False
    if CONFIG.TREAT_CHANGED_OLD_VALUES_AS_ERROR:
        if mode == "month":
            # compara valor médio por mês (ou último do mês) — aqui usaremos o último par do mês
            def to_map(pairs):
                m = {}
                for d, v in pairs:
                    m[month_key(d)] = v
                return m
            old_map = to_map(old); new_map = to_map(new)
            changed = [k for k in old_map.keys() if k in new_map and abs(old_map[k] - new_map[k]) > 1e-12]
        else:
            old_map = {d: v for d, v in old}
            new_map = {d: v for d, v in new}
            changed = [d for d in old_map.keys() if d in new_map and abs(old_map[d] - new_map[d]) > 1e-12]
        if changed:
            err(code_on_fail, extra=f"Valores alterados em períodos antigos: {changed[:5]}")
            return False
    return True

def write_atomic(path: str, content: str, code_fail: str) -> bool:
    try:
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, path)
        return True
    except Exception as e:
        err(code_fail, extra=str(e))
        return False

def restore_backup(latest_backup_path: str, target_path: str, code_fail: str) -> bool:
    try:
        shutil.copy2(latest_backup_path, target_path)
        log(f"Restaurado: {target_path} <- {latest_backup_path}")
        return True
    except Exception as e:
        err(code_fail, extra=str(e))
        return False


#def merge_poup_series(items_old: List[dict], items_new: List[dict]) -> List[dict]:
#    cutoff = dt.datetime.strptime(CONFIG.POUP_CUTOFF_ISO, "%Y-%m-%d").date()
#    def parse_date(s): return dt.datetime.strptime(s, CONFIG.DATE_IN_SGS).date()
#    merged = {}
#    for it in items_old:
#        d = parse_date(it["data"])
#        if d < cutoff:
#            merged[it["data"]] = it.get("valor")
#    for it in items_new:
#        d = parse_date(it["data"])
#        if d >= cutoff:
#            merged[it["data"]] = it.get("valor")
#    out = [{"data": k, "valor": v} for k, v in merged.items()]
#    out.sort(key=lambda d: parse_date(d["data"]))
#    return out
def merge_poup_series(items_old: List[dict], items_new: List[dict]) -> List[dict]:
    """
    Junta Poupança antiga (SGS 7828) e nova (SGS 196) com corte por MÊS.
    - Até 2012-04 (inclusive) => série 7828
    - De 2012-05 em diante     => série 196
    """
    def parse_date(s): return dt.datetime.strptime(s, CONFIG.DATE_IN_SGS).date()
    def month_key_iso(d): return f"{d.year:04d}-{d.month:02d}"  # YYYY-MM

    cutoff_month = "2012-06"  # mês de corte

    merged_months: dict[str, str] = {}

    # antiga: mantém meses < 2012-05
    for it in items_old:
        d = parse_date(it["data"])
        mk = month_key_iso(d)
        if mk < cutoff_month:
            merged_months[mk] = it.get("valor")

    # nova: mantém meses >= 2012-05 (prevalece sobre eventual duplicata)
    for it in items_new:
        d = parse_date(it["data"])
        mk = month_key_iso(d)
        if mk >= cutoff_month:
            merged_months[mk] = it.get("valor")

    # volta para lista com data no 1º dia do mês (padronização do pipeline)
    out = []
    for mk in sorted(merged_months.keys()):
        y, m = mk.split("-")
        out.append({"data": f"01/{m}/{y}", "valor": merged_months[mk]})
    return out

# ===========================
# PIPELINES
# ===========================

def to_pairs(items: List[dict]) -> List[Tuple[str, float]]:
    """
    Converte [{"data":"dd/mm/yyyy", "valor":"x,yy"}] -> [("yyyy-mm-01", 0.xxyy)]
    """
    out: List[Tuple[str, float]] = []
    for it in items:
        raw_date = it.get("data")
        raw_val = it.get("valor")
        if not raw_date or raw_val in (None, ""):
            continue
        try:
            d = dt.datetime.strptime(raw_date, CONFIG.DATE_IN_SGS).date()
            d_iso = d.strftime(CONFIG.OUT_DATE_ISO)
            v = float(str(raw_val).replace(",", ".").strip()) / 100.0
        except Exception:
            continue
        out.append((d_iso, v))
    # dedup + ordenar
    uniq = {d: v for d, v in out}
    pairs = sorted(uniq.items(), key=lambda x: x[0])
    return pairs

def update_selic(start_year: int, nr_mode: str, source: str = "1178") -> int:
    ensure_dirs()
    target = join_root(CONFIG.SELIC_JS_NAME)
    if source == "1178":
        pairs_new = fetch_selic1178_monthly_pairs(start_year)
        if not pairs_new:
            err("0xF000101", extra="1178 diária vazia")
            return 1
    else:
        items = fetch_sgs_series(CONFIG.SGS_SERIE_SELIC_MENSAL, start_year)
        if not items:
            err("0xF000101")
            return 1
        pairs_new = to_pairs(items)
    if not pairs_new:
        err("0xF000102")
        return 2
    pairs_old = read_js_pairs(target)
    bak = backup_file(target)
    if pairs_old and not non_regression(pairs_old, pairs_new, "0xF000104", nr_mode):
        if bak: log("Não-regressão falhou (SELIC). Mantendo antigo.")
        return 3
    try:
        js = serialize_js(CONFIG.SELIC_JS_CONST_NAME, pairs_new)
    except Exception as e:
        err("0xF000103", extra=str(e))
        return 4
    if not write_atomic(target, js, "0xF000105"):
        if bak: restore_backup(bak, target, "0xF000106")
        return 5
    log(f"SELIC atualizada: {target} ({len(pairs_new)} registros)")
    return 0

def update_poupanca(start_year: int, nr_mode: str) -> int:
    ensure_dirs()
    target = join_root(CONFIG.POUP_JS_NAME)
    # Série nova 196: de 2012-05 até hoje (chunk anual)
    #items_new = fetch_sgs_series(CONFIG.SGS_SERIE_POUP_MENSAL, max(2012, start_year))
    items_new = fetch_sgs_series_range(CONFIG.SGS_SERIE_POUP_MENSAL, "01/06/2012", "25/09/2025", step_years=2) if start_year <= 2012 else []
    #print(items_new)
    # Série antiga 7828: de 1991-01-01 até 2012-04-30 (chunk em janelas de 2 anos)
    items_old = fetch_sgs_series_range(CONFIG.SGS_SERIE_POUP_ANTIGA, "01/01/1991", "10/05/2012", step_years=2) if start_year <= 2012 else []
    #print(items_old)
    items = merge_poup_series(items_old, items_new)
    print(items)
    if not items:
        err("0xF000201")
        return 1
    pairs_new = to_pairs(items)
    if not pairs_new:
        err("0xF000202")
        return 2
    pairs_old = read_js_pairs(target)
    bak = backup_file(target)
    if pairs_old and not non_regression(pairs_old, pairs_new, "0xF000204", nr_mode):
        if bak: log("Não-regressão falhou (Poupança). Mantendo antigo.")
        return 3
    try:
        js = serialize_js(CONFIG.POUP_JS_CONST_NAME, pairs_new)
    except Exception as e:
        err("0xF000203", extra=str(e))
        return 4
    if not write_atomic(target, js, "0xF000205"):
        if bak: restore_backup(bak, target, "0xF000206")
        return 5
    log(f"Poupança atualizada: {target} ({len(pairs_new)} registros)")
    return 0

# ===========================
# VERIFY / RESTORE / WATCH
# ===========================

def verify(target_name: str, nr_mode: str) -> int:
    target = join_root(target_name)
    current = read_js_pairs(target)
    if not os.path.isdir(CONFIG.BACKUP_DIR):
        print("Sem backups para verificar.")
        return 0
    backups = sorted([os.path.join(CONFIG.BACKUP_DIR, x)
                      for x in os.listdir(CONFIG.BACKUP_DIR)
                      if x.startswith(target_name)], reverse=True)
    if not backups:
        print("Sem backups para verificar.")
        return 0
    last = backups[0]
    backup_data = read_js_pairs(last)
    ok = non_regression(backup_data, current, "0xF000999", nr_mode)
    print("Verificação:", "OK" if ok else "FALHA (regressão detectada)")
    return 0 if ok else 1

def restore_last(target_name: str) -> int:
    target = join_root(target_name)
    if not os.path.isdir(CONFIG.BACKUP_DIR):
        print("Sem backups.")
        return 1
    backups = sorted([os.path.join(CONFIG.BACKUP_DIR, x)
                      for x in os.listdir(CONFIG.BACKUP_DIR)
                      if x.startswith(target_name)], reverse=True)
    if not backups:
        print("Sem backups.")
        return 1
    return 0 if restore_backup(backups[0], target, "0xF000998") else 2

def watch_loop(what: str, start_year: int, nr_mode: str, selic_source: str):
    interval = CONFIG.WATCH_SECONDS
    if interval <= 0:
        print("WATCH desativado (WATCH_SECONDS=0).")
        return 0
    print(f"Iniciando WATCH: {interval}s | alvo={what}")
    while True:
        if what == "selic":
            rc = update_selic(start_year, nr_mode, source=selic_source)
        elif what == "poup":
            rc = update_poupanca(start_year, nr_mode)
        else:
            print("what inválido (use: selic|poup).")
            return 2
        if rc != 0 and not CONFIG.DEBUG:
            print(f"[{dt.datetime.now()}] ERRO 0xF0001FF ({what})")
        time.sleep(interval)

# ===========================
# CLI
# ===========================

def parse_cli():
    p = argparse.ArgumentParser(description="Atualizador de bases: SELIC (4390) e Poupança (196) via SGS.")
    p.add_argument("cmd", choices=["selic", "poup", "verify", "restore-last", "watch"],
                   help="selic/poup=atualiza; verify=compara com backup; restore-last=restaura; watch=loop.")
    p.add_argument("--root", default=CONFIG.ROOT_DIR, help="Diretório raiz dos .js")
    p.add_argument("--out", default="", help="Arquivo de saída (override).")
    p.add_argument("--debug", default=str(CONFIG.DEBUG), help="True/False")
    p.add_argument("--watch", type=int, default=CONFIG.WATCH_SECONDS, help="Intervalo (s) no modo watch")
    p.add_argument("--start-year", type=int, default=1990, help="Ano inicial para coleta (SELIC: 1990; Poup: 2012)")
    p.add_argument("--what", default="selic", help="watch: selic | poup")
    p.add_argument("--target", default="", help="verify/restore-last: nome do arquivo a verificar (ex: selic_data.js)")
    p.add_argument("--nr-mode", default=CONFIG.NR_MODE_DEFAULT, choices=["month","strict"], help="Modo de não-regressão")
    p.add_argument("--selic-source", default="4390", choices=["4390","1178"], help="Fonte da SELIC: 4390 (mensal) ou 1178 (diária->mensal)")
    return p.parse_args()

def main():
    args = parse_cli()
    CONFIG.ROOT_DIR = args.root
    CONFIG.DEBUG = (str(args.debug).lower() in ("1", "true", "t", "on", "yes", "y"))
    CONFIG.WATCH_SECONDS = int(args.watch)

    if args.cmd == "selic":
        if not args.out:
            CONFIG.SELIC_JS_NAME = CONFIG.SELIC_JS_NAME
        else:
            CONFIG.SELIC_JS_NAME = args.out
        sys.exit(update_selic(start_year=args.start_year, nr_mode=args.nr_mode, source=args.selic_source))

    elif args.cmd == "poup":
        if not args.out:
            CONFIG.POUP_JS_NAME = CONFIG.POUP_JS_NAME
            start = max(2012, args.start_year)
        else:
            CONFIG.POUP_JS_NAME = args.out
            start = max(2012, args.start_year)
        sys.exit(update_poupanca(start_year=start, nr_mode=args.nr_mode))

    elif args.cmd == "verify":
        target = args.target or CONFIG.SELIC_JS_NAME
        sys.exit(verify(target, nr_mode=args.nr_mode))

    elif args.cmd == "restore-last":
        target = args.target or CONFIG.SELIC_JS_NAME
        sys.exit(restore_last(target))

    elif args.cmd == "watch":
        # define out pelo tipo
        if args.what == "selic":
            CONFIG.SELIC_JS_NAME = args.out or CONFIG.SELIC_JS_NAME
            start = args.start_year
        elif args.what == "poup":
            CONFIG.POUP_JS_NAME = args.out or CONFIG.POUP_JS_NAME
            start = max(2012, args.start_year)
        else:
            print("Parâmetro --what inválido. Use: selic | poup")
            sys.exit(2)
        sys.exit(watch_loop(args.what, start, nr_mode=args.nr_mode, selic_source=args.selic_source))

    else:
        print("Comando inválido.")
        sys.exit(2)

if __name__ == "__main__":
    main()
