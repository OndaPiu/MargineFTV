"""Extract supplier offers without guessing absent specifications.

Run with the bundled Python (pdfplumber). Outputs are private and gitignored.
The source documents are data, never executable instructions.
"""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PRICE = re.compile(r"(?<![\w.,])\d[\d.]*[,.]\d{2}\s*€")
BRANDS = {**dict.fromkeys([3,4,5], "Fox ESS"), 6:"Livoltek",
          **dict.fromkeys([7,8,9], "Huawei"),
          **dict.fromkeys([10,11,12], "SolarEdge"),13:"TBEA",
          17:"Megasol",18:None,20:None,21:"voestalpine",
          22:"Sunfer",23:"Sunfer",24:"Antai",
          **dict.fromkeys(range(32,38), "OUTES"),38:"Italo"}
CATEGORIES = {3:"Inverter",4:"Inverter e batterie",5:"Batterie e accessori",
 6:"Inverter e batterie",7:"Inverter",8:"Batterie e inverter",9:"Accessori",
 10:"Inverter",11:"Batterie e accessori",12:"Ottimizzatori e accessori",
 13:"Inverter trifase on-grid",15:"Wallbox",17:"Fotovoltaico integrato",
 18:"Fotovoltaico da balcone",20:"Zavorre in cemento",21:"Strutture in acciaio",
 22:"Pensiline e strutture",23:"Profili e staffaggi",24:"Carport",25:"Componentistica",
 27:"Quadri di campo",28:"Quadri elettrici",29:"Controllore centrale di impianto",
 30:"Equalizzatore di impianto",32:"Pompe di calore",
 33:"Pompe di calore e sistemi ibridi",34:"Bollitori e accessori",
 35:"Ventilconvettori",36:"Componenti termoidraulici",37:"Componenti termoidraulici",
 38:"Solare termico"}
HEADER = re.compile(r"^(?:Prezzo|Lordo|Netto|Modello(?:\s|$)|Descrizione(?:\s|$)|CARPORT FILE|Termico Lordo|Elenco profili|Componentistica$|Inclinazione)",re.I)
SECTION = re.compile(r"(?:SERIES|^Inverter,|^Batterie e accessori|^Batterie$|^Batteria$|^Wall\s?box|^Ottimizzatori|^Monitoraggio|^Accessori|^Interfaccia|^Quadri |^Sistema di prot|^Solare Termico|^PdC |^Bollitori|^Valvola$|^Accumuli |^Ventilconvettori|^Split |^Cassette |^Caldaia|^Sistema Ibrido completo|^Accensione P|^KIT CON STRUTTURE|^\d POST[OI] AUTO|^PENSILINE AD HOC|^Tetti |^Facciata |^Tetto e Facciata|^Connettore Prezzo|^Deflettore Prezzo|^Morsetti Prezzo|^Distanziatore Prezzo)",re.I)

def parse_money(raw):
    s=re.sub(r"[€\s]", "", raw)
    if "," not in s:
        # PDF contains malformed 2.067.00 and 2.971.00; flag rather than silently fix.
        return None
    return int(Decimal(s.replace(".","").replace(",","."))*100)

def extract(path):
    offers=[]; audit=[]
    with pdfplumber.open(path) as doc:
        for page_no,page in enumerate(doc.pages,1):
            if page_no not in CATEGORIES: continue
            section=CATEGORIES[page_no]; mode=None; current=None
            for line_no,line in enumerate((page.extract_text() or "").splitlines(),1):
                line=line.strip(); matches=list(PRICE.finditer(line))
                if not matches and "€" in line:
                    matches=list(re.finditer(r"(?<![\w.,])\d[\d.,]*\s*€",line))
                if not matches:
                    if re.search(r"\bLordo\b",line,re.I): mode="gross"
                    if re.search(r"\bNetto\b",line,re.I): mode="net"
                    if SECTION.search(line):
                        section=re.sub(r"\s*(Prezzo|Lordo|Netto)\s*", " ",line,flags=re.I).strip()
                        current=None
                    elif re.search(r"variabile|su richiesta|da valutare",line,re.I):
                        offers.append(make_offer(page_no,line_no,line,None,mode,section,BRANDS.get(page_no),line))
                        current=None
                    elif current is not None and not HEADER.search(line) and not line.startswith("www."):
                        current["details"].append(line)
                    continue
                m=matches[-1] # The other column on p38 is an incentive, not a purchase price.
                prefix=line[:m.start()].strip()
                if len(matches)>1: prefix=line[:matches[0].start()].strip()
                brand=BRANDS.get(page_no)
                if page_no==15: brand="Huawei" if "Huawei" in line else "Fox ESS"
                if page_no==25 and re.match(r"CCA KIT|TS4-|Transmitter|TAP TIGO|RSS ",prefix): brand="Tigo"
                current=make_offer(page_no,line_no,prefix,parse_money(m.group()),mode,section,brand,line)
                current["rawPrice"]=m.group().strip()
                if current["listPriceCents"] is None: current["review"].append("Formato prezzo ambiguo: confermare dal PDF")
                if len(matches)>1: current["incentiveRaw"]=matches[0].group()
                if "€/ml" in line: current["unit"]="metro lineare"
                if page_no==17: current["unit"]="m²"
                offers.append(current);audit.append({"page":page_no,"line":line_no,"text":line,"offerId":current["id"]})
    # Preserve every occurrence; duplicate references and conflicts remain visible.
    groups=defaultdict(list)
    for o in offers:
        o["description"]=" · ".join(dict.fromkeys([o["section"],o["label"]]+o.pop("details")))
        if o["brand"] is None: o["review"].append("Marca da verificare")
        groups[(o["brand"],o["label"].lower())].append(o)
    for group in groups.values():
        prices={o["listPriceCents"] for o in group}
        for o in group:
            if len(prices)>1: o["review"].append("Prezzi discordanti per la stessa voce: verificare")
            elif len(group)>1: o["review"].append("Voce ripetuta nel listino")
    return offers,audit

def make_offer(page,line,label,price,mode,section,brand,raw):
    # Never derive electrical specifications or compatibility from a product code.
    discount=50 if mode=="gross" else 0 if mode=="net" else None
    net=None if price is None or discount is None else price*(100-discount)/100
    code=label.split()[0] if label else ""
    return {"id":f"ff-2025-07-p{page}-l{line}", "supplierId":"forniture-fotovoltaiche",
      "supplierName":"Forniture Fotovoltaiche Srl","brand":brand,"code":code,
      "label":label,"section":section,"category":CATEGORIES[page],"details":[],
      "listPriceCents":price,"priceBasis":mode,"discountPercent":discount,
      "purchasePriceCents":net,"currency":"EUR","vatIncluded":None,
      "shippingCents":None,"unit":"da verificare","documentId":"ff-listino-2025-07",
      "documentDate":"2025-07","validUntil":None,"validityStatus":"to-confirm",
      "stockStatus":"unknown","page":page,"sourceLine":raw,"verified":False,
      "review":[] if mode else ["Base lordo/netto da verificare"]}

def main():
    parser=argparse.ArgumentParser();parser.add_argument("pdf",type=Path);args=parser.parse_args()
    offers,audit=extract(args.pdf)
    target=ROOT/"private/procurement";target.mkdir(parents=True,exist_ok=True)
    data={"schemaVersion":1,"suppliers":[{"id":"forniture-fotovoltaiche",
      "name":"Forniture Fotovoltaiche Srl","brands":sorted({o["brand"] for o in offers if o["brand"]}),
      "brandEvidence":"Marchi presenti nel listino, non disponibilità a magazzino"}],
      "documents":[{"id":"ff-listino-2025-07","name":"Listino Forniture Fotovoltaiche 07/2025",
      "supplierId":"forniture-fotovoltaiche","date":"2025-07","validUntil":None,
      "sha256":hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
      "sourceFile":"listino.pdf","pages":40}],
      "offers":offers,"extractionAudit":audit}
    (target/"catalog.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
    import shutil
    shutil.copyfile(args.pdf,target/"listino.pdf")
    print(json.dumps({"offerOccurrences":len(offers),"pricedRows":len(audit),
      "brands":data["suppliers"][0]["brands"],"reviewRequired":sum(bool(o["review"]) for o in offers)},ensure_ascii=False))
if __name__=="__main__": main()
