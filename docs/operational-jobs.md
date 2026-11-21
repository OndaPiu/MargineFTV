# Commesse operative e materiali dai listini

In **Commesse**, scegliere una pratica vinta e il piano da una, due o tre rate.
Aprire la commessa, compilare i dati e premere **Salva commessa**. Una pratica
può avere una sola commessa: riaprendola si modifica quella esistente.
La fase commerciale non limita l’avvio.

## Materiali

Nella sezione **Materiali della commessa** si cercano prodotti per nome, sigla,
marca, caratteristiche o fornitore. **Aggiungi** inserisce la voce nella distinta;
la quantità accetta anche frazioni per metri, kWp e altre unità. I prodotti
archiviati sono esclusi dalla ricerca. Le avvertenze del listino restano
consultabili e le offerte scadute vengono segnalate.

Al primo salvataggio il server legge il prezzo e la versione del listino:
non accetta prezzi o descrizioni inventati dal client. Se il costo cambia
mentre si prepara la prima selezione, la richiesta viene rifiutata con HTTP 409
e occorre ricaricare i dati e selezionare di nuovo il prodotto.

Le righe salvate conservano descrizione, codice, fornitore, unità, IVA, prezzo e
origine del listino. Modifiche o archiviazioni successive del catalogo non
cambiano il costo della commessa. Per scegliere un prezzo nuovo prima
dell’ordine, rimuovere la riga e aggiungere nuovamente il prodotto.
Il totale arrotonda ai centesimi dopo aver moltiplicato quantità e costo unitario.
Prezzi mancanti restano **Da quotare**: il totale viene indicato come incompleto.

**Prepara ordini per fornitore** crea bozze per i fornitori identificati,
riutilizzando le bozze già presenti. Non invia comunicazioni o acquisti.
Un ordine registrato richiede materiali quotati del fornitore e primo incasso
ricevuto; successivamente la distinta viene bloccata fino alla revisione
dell’ordine. Connessione Emmolo e avanzamento lavori richiedono anch’essi
il primo incasso. Le fatture Enerp mantengono lo stato importato; un pagamento
esterno richiede riferimento del documento e data effettiva non futura.

## Extra per listino

Nella commessa, **Extra per listino** permette di scegliere il listino e aggiungere
più righe per trasporto, installazione o altri costi. Ogni riga ha descrizione,
importo e condizione IVA. L'importo viene sommato una sola volta, senza essere
moltiplicato per la quantità dei prodotti. Un importo vuoto resta da quotare;
zero significa gratuito. Anche senza materiali si possono inserire extra.

Il riepilogo mostra materiali, extra e totale dei costi inseriti. Non converte
l'IVA: somme con condizioni IVA diverse richiedono verifica. Gli extra sono
specifici della commessa e salvati in `procurement_jobs.data.extras`, con il
listino e il fornitore verificati dal server. Dopo un ordine registrato restano
bloccati insieme ai materiali. Un ordine richiede extra del fornitore quotati.
Il campo Trasporto viene rimosso dalla modifica prodotto; eventuali dati storici
rimangono conservati, senza essere aggiunti automaticamente al totale.

Applicare `supabase/procurement-job-extras.sql` dopo la migrazione commesse e
prima della pubblicazione di questa versione. Nessun dato esistente viene
cancellato e nessun costo viene inventato o trasferito automaticamente.

## Archivio e attivazione

1. Applicare `supabase/procurement-operational-jobs.sql` al progetto esistente,
   dopo le migrazioni catalogo già installate.
2. Pubblicare la versione aggiornata dell’app.
3. Configurare `PROCUREMENT_JOBS_ENABLED=1` **solo in produzione** e creare
   un deploy che recepisca la configurazione.

Il nuovo flag abilita i salvataggi delle commesse anche quando la configurazione
precedente conserva `PROCUREMENT_MODE=read-only`. Le anteprime possono mantenere
quel valore senza il flag, con prove non persistenti. L’anteprima locale resta
bloccata per le scritture. Il flag del catalogo rimane indipendente.

`procurement_jobs.data` conserva rate, connessione, lavori, bozze ordine e
distinta. La nuova tabella `procurement_job_materials` conserva anche le righe
relazionali, collegate alla versione di prezzo in `procurement_offer_history`.
L’RPC `save_procurement_job` salva tutto nella stessa transazione e applica
controlli di versione, pratica, incasso e materiali sul database. Una richiesta
fallita non lascia commesse parziali. RLS è attiva; accesso solo dal server.

I collegamenti della nuova tabella impediscono di eliminare offerte e storico
già usati nelle commesse. Prima di una pulizia definitiva del catalogo verificare
anche `procurement_job_materials`.

L’attivazione non crea commesse automaticamente e non emette fatture o ordini.
I promemoria automatici richiedono una successiva implementazione.

## Collaudo

```sh
node --test tests/*.test.mjs
node node_modules/next/dist/bin/next build --webpack
# PGlite installato soltanto nell’ambiente temporaneo di QA:
PROCUREMENT_PGLITE_MODULE=/tmp/margine-supabase-qa/node_modules/@electric-sql/pglite node --test scripts/check-operational-jobs.mjs scripts/check-catalog-editing.mjs scripts/check-procurement-schema.mjs
PROCUREMENT_PGLITE_MODULE=/tmp/margine-supabase-qa/node_modules/@electric-sql/pglite node tests/operational-jobs.http.mjs
node tests/hosted-procurement.http.mjs
node tests/catalog-editing.http.mjs
```

Le prove HTTP delle commesse usano le funzioni SQL reali in un PostgreSQL
incorporato, con soli dati sintetici. Non creano commesse dei clienti reali.
