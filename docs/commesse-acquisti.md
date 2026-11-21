# Commesse e acquisti: prima impostazione

## Risultato di questa prima fase

Modulo aggiunto al progetto MargineFTV, percorso /commesse, con collegamento
dall’area commerciale. Il lavoro è una copia locale basata sul commit
aed5bdb9d13fea438cce3578ab0428e66edbc066 di OndaPiu/MargineFTV.
Il modulo è preparato sul ramo codex/commesse-acquisti. Per attivarlo in
produzione servono la revisione, la configurazione dell’archivio e il rilascio.

Sono disponibili:

- Catalogo ricercabile per descrizione, marca, categoria e fornitore, con paginazione.
- Prezzo originale, base lordo/netto, sconto concordato, prezzo di acquisto e fonte.
- Registro fornitori con marchi documentati. Il marchio non viene usato come distributore.
- Scheda del materiale e anomalie da verificare; consultazione dei PDF in anteprima locale.
- Distinta temporanea con quantità, costo dei materiali e differenza rispetto al costo previsto.
- Coda di avvio commesse da tutte le pratiche Vinte, indipendentemente dalla fase commerciale.
- Piani da 1/2/3 rate, importi e scadenze liberi, collegamento a fatture della stessa pratica.
- Pagamento derivato dai documenti importati, oppure registrazione di riferimento e data per documenti esterni.
- Tracciamento ordini per fornitore, lavori e pratica di connessione Emmolo.
- Accesso dedicato, cookie firmato e protezione delle API sul server.

La distinta è una simulazione in memoria, non ancora un ordine salvabile.
Gli ordini di questa fase conservano riferimento, fornitore e avanzamento;
le righe materiali e le configurazioni standard saranno il passo successivo.
Non vengono emesse fatture né inviati ordini o richieste a Emmolo.

## Fonti private

La cartella private/procurement contiene il catalogo e le copie dei documenti.
È esclusa da Git. Non spostare i file in public/ e non importarli nei componenti client.
Il catalogo viene consegnato al browser solo dopo l’accesso alle API riservate.
In produzione, i dati del catalogo risiedono in una tabella Supabase dedicata.

L’importazione Forniture Fotovoltaiche conserva ogni occorrenza del listino,
incluse ripetizioni e prezzi discordanti: il conteggio non equivale a prodotti unici.
Tutte le righe sono provvisorie, anche se non presentano anomalie di estrazione.
Il fornitore è Forniture Fotovoltaiche Srl, listino 07/2025:
prezzi lordi × 0,5, prezzi netti invariati; IVA e validità attuale non confermate.

Gli altri allegati sono registrati nello stesso catalogo, mantenendo:

- Angolo Solare come distributore della locandina Huawei.
- Distributore non identificato per SENEC e per le schede Afore, Lithium Valley e Fox.
- Schede tecniche senza prezzo separate dalle offerte commerciali.
- Modelli e capacità dichiarate distinti (es. E4 9,2 kWh e V3 9 kWh).
- Differenza tra prezzo E4 Home Protect nel PDF e nella locandina.
- Scadenza della locandina SENEC presente solo nel nome del file, da confermare.

Il confronto attuale è economico e manuale. Non certifica equivalenze,
compatibilità, disponibilità, completezza dei kit o convenienza finale.
Le specifiche mancanti non vengono dedotte automaticamente dal codice.
I costi unitari mantengono anche frazioni di centesimo (es. cavi): il totale
si arrotonda dopo la moltiplicazione per la quantità.

## Regole della commessa

1. Avvio con stato pratica Vinta, indipendentemente dalla fase commerciale; una commessa per pratica.
2. Una rata: saldo all’accettazione.
3. Due rate: acconto all’accettazione, saldo durante i lavori o verso la fine.
4. Tre rate: deposito cauzionale all’accettazione, acconto a inizio lavori, saldo a fine lavori.
5. Importi e scadenze sono impostabili; nessuna percentuale è stata inventata.
6. Il documento relativo al deposito cauzionale deve essere definito con chi gestisce la contabilità.
7. Il primo pagamento ricevuto sblocca registrazione ordine, connessione e lavori.
8. Ordini e pratica Emmolo avanzano separatamente.
9. Ogni fattura si può collegare a una sola rata della stessa commessa.
10. Il piano rate avviato non si sostituisce silenziosamente: serve una futura funzione di revisione.

Lo stato Enerp letto qui è quello già presente nelle fatture dell’area commerciale.
Questo modulo non introduce una sincronizzazione periodica aggiuntiva: la
frequenza effettiva dipende dal collegamento Enerp esistente.

## Avvio dell’anteprima

Prerequisiti: Node >=22.13, dipendenze del progetto installate.
L’installer originale richiama scripts/sites-env.mjs, assente nel repository
al commit di origine. Per questa copia l’installazione è stata completata con:

```sh
npm ci --prefer-offline --no-audit --no-fund
node scripts/procurement-preview.mjs
```

Aprire http://127.0.0.1:5180/commesse. Il comando genera .env.local
con una password casuale, se il file non esiste; non stampa la password.
La modalità locale consente il catalogo e la simulazione; non usa pratiche reali
e non finge salvataggi di commesse. Per gli archivi operativi serve Supabase.

## Collegamento all’archivio esistente

Per attivare la creazione delle commesse con distinta materiali dai listini,
vedere [Commesse operative](operational-jobs.md): la migrazione e il flag di
salvataggio sono separati dalla modifica del catalogo.

Per aggiornare o archiviare le singole voci dal sito, vedere
[Modifica del catalogo](catalog-editing.md): migrazione e abilitazione dei
salvataggi sono separate da quelle delle commesse.

Passaggi da eseguire nell’ambiente del proprietario, dopo la revisione:

1. Applicare supabase/schema.sql solo se le tabelle originali non esistono già,
   poi applicare supabase/procurement.sql.
2. Configurare SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sul server.
3. Configurare PROCUREMENT_ACCESS_PASSWORD con almeno 16 caratteri casuali.
   Le credenziali non vanno inserite in chat o nel repository.
4. Rimuovere PROCUREMENT_LOCAL_PREVIEW dall’ambiente di produzione.
5. Verificare il catalogo: node scripts/import-procurement-catalog.mjs
6. Importare con le variabili dell’ambiente configurate:
   node --env-file=.env.local scripts/import-procurement-catalog.mjs --apply
7. Rivedere il ramo codex/commesse-acquisti prima di integrarlo nel ramo di
   produzione e avviare il rilascio su Vercel.

La tabella catalogo è separata dalle API commerciali esistenti, con RLS attivo,
accesso solo tramite service_role e nessuna policy pubblica.
I documenti sorgente sono consultabili solo nell’anteprima locale in questa fase.
La consultazione in produzione richiede un archivio file privato e link protetti,
non ancora realizzati.

L’accesso riservato è una password dedicata al proprietario, non un sistema
multiutente. La rotazione della password invalida le sessioni; durata 8 ore.
La limitazione dei tentativi è per processo, non un limite distribuito.

## Passi successivi concordabili sui dati reali

- Confermare fornitori mancanti, trattamento IVA, trasporto e attualità dei prezzi.
- Validare le righe con anomalie, quantità minime e unità di vendita.
- Definire una prima configurazione standard e i componenti obbligatori.
- Registrare alternative tecniche approvate e vincoli del preventivo accettato.
- Salvare distinta, righe ordine e prezzi validati nella commessa.
- Calcolare il margine della configurazione completa mantenendo separati gli altri costi.
- Predisporre avvisi sulle rate da richiedere e offerte in scadenza.
- Concordare la gestione del documento di deposito e dei casi fuori Enerp.

## Verifica tecnica

```sh
./node_modules/.bin/tsc --noEmit
node --test tests/*.test.mjs
python3 tests/catalog-extraction.test.py
node node_modules/next/dist/bin/next build --webpack
```

I test PDF usano un documento sintetico, senza listini o prezzi riservati.
I test coprono sequenze rate, avvio delle pratiche vinte in qualsiasi fase commerciale, pagamento iniziale,
associazione fatture, sessioni firmate, origine delle richieste, sconti,
prezzi netti, pagine miste, anomalie, incentivi separati e frazioni di centesimo.
La scheda di collaudo dell’anteprima è salvata in output/procurement-qa.json.

## Date commerciali e fine lavori

La data del primo preventivo accettato è memorizzata nella pratica
(acceptedDate), insieme all’istante osservato sul server per gli automatismi
(acceptedAt, UTC). Il giorno è calcolato nel fuso Europe/Rome.
Il passaggio viene intercettato sia nel salvataggio manuale sia nel parser
Leadora utilizzato dal webhook e dall’importazione manuale.
Lo stato pratica Vinta non è richiesto per registrare la data commerciale;
è invece l’unico requisito di stato per avviare la commessa, senza filtro sulla fase commerciale.

Un primo import già in fase accettata e le pratiche storiche già accettate
non ricevono una data inventata. Il giorno storico è compilabile o correggibile
nell’editor della pratica; le importazioni successive conservano il dato.
L’automatismo registra il momento in cui il sistema osserva il passaggio:
non ricostruisce l’ora originale di un evento Leadora arrivato in ritardo.
Una riapertura commerciale non modifica la prima data di accettazione.
La data appare anche nella commessa, letta dalla pratica senza duplicarla.
È inclusa nell’esportazione delle pratiche.

Su richiesta del proprietario, nella commessa è prevista soltanto la data
effettiva di fine lavori (completedDate), senza data prevista.
Passando a Conclusi viene proposta la data odierna, correggibile per
registrazioni tardive. Non sono ammesse date effettive future.
Per commesse già concluse senza data non viene inventata una data storica.
Riaprendo i lavori dall’interfaccia, la data effettiva viene svuotata e sarà
registrata nuovamente alla conclusione.

I nuovi campi sono opzionali nei documenti JSON esistenti: non serve
una migrazione SQL aggiuntiva per queste date.

## Anteprima collegata alle pratiche reali

In sviluppo, mantenendo PROCUREMENT_LOCAL_PREVIEW=1, si può impostare
PROCUREMENT_READ_ONLY_SOURCE_URL all’endpoint HTTPS /api/workspace del
gestionale esistente. L’anteprima rilegge pratiche e fatture al caricamento
e tramite Aggiorna dati, senza registrare copie nel repository.
Il catalogo resta quello privato locale. La stessa sessione firmata protegge
la lettura dei dati reali anche dall’area commerciale locale.

Il pannello Commesse mostra le pratiche reali e consente di simulare il flusso
per quelle idonee. Nessuna commessa simulata viene salvata. Le API rifiutano
le modifiche sia nell’area commerciale sia nell’area operativa durante questa
modalità. Il collegamento di sola lettura è disattivato in produzione.

I nomi delle fasi mantengono il testo originale mostrato all’utente; il
riconoscimento di Preventivo Accettato ignora icone decorative iniziali,
come nella fase Leadora “✍️ Preventivo Accettato”.

## Pubblicazione iniziale della sezione in lavorazione

La variabile server PROCUREMENT_MODE=read-only rende la sola area operativa
consultabile e simulabile anche in produzione. I salvataggi commesse vengono
rifiutati dal server; non si interrogano le nuove tabelle commesse.
L’area commerciale esistente continua a usare normalmente il proprio archivio.
Le pratiche e fatture sono lette dall’archivio Supabase già configurato.

Per questa prima pubblicazione il catalogo può essere fornito con
PROCUREMENT_CATALOG_GZIP_BASE64: JSON del catalogo privato, senza audit
di estrazione, compresso con gzip e codificato in base64. Il valore è una
configurazione riservata del server e non deve essere incluso nel repository
o in variabili NEXT_PUBLIC_. Viene decodificato solo dal server, con un limite
di dimensione, e restituito solo dopo l’accesso all’area riservata.
Non sostituisce il futuro caricamento listini dall’interfaccia.

La password PROCUREMENT_ACCESS_PASSWORD deve essere configurata nel medesimo
ambiente Vercel del rilascio. La modalità locale e la sua fonte HTTPS non
vanno abilitate in produzione. I documenti PDF restano consultabili localmente
finché non sarà predisposto l’archivio file riservato online.

Collaudo della modalità ospitata dopo la compilazione:

```sh
node tests/hosted-procurement.http.mjs
```

Il collaudo avvia server locali isolati con dati sintetici e verifica accesso,
lettura delle pratiche, blocco salvataggi e indipendenza dell’area commerciale.
