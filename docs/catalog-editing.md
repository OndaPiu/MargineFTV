# Modifica e archiviazione delle voci di catalogo

Ogni voce offre i pulsanti **Modifica** e **Archivia**. La vista **Archiviati**
mostra le voci ritirate e permette il **Ripristino**. Le voci archiviate non
entrano nella distinta di prova; ordini e storico rimangono collegati agli stessi
identificativi. La scheda permette di cambiare nome, sigla, marca, descrizione,
categoria, sezione, unità, fornitore, prezzi, sconto, IVA, trasporto, disponibilità,
validità, pagina e listino di origine, avvertenze e verifica dei dati.

I prezzi sono in EUR: il netto coincide con il prezzo di acquisto, mentre per il
lordo il prezzo di acquisto viene calcolato dallo sconto. Sono conservate le
frazioni di centesimo dei costi unitari. Prezzo vuoto e prezzo zero sono distinti.
Identificativi e metadati originali del documento non vengono rinominati dal form.

## Installazione

1. Applicare `supabase/procurement.sql` aggiornato nel progetto esistente. È
   ripetibile e versiona lo schema normalizzato; non cancella pratiche o catalogo.
   La funzione di importazione ora rispetta `active` e rifiuta una copia obsoleta
   che sovrascriverebbe schede modificate manualmente.
2. Applicare `supabase/procurement-catalog-edit.sql`. Aggiunge la funzione
   `update_procurement_offer`, accessibile soltanto a `service_role`, senza
   modificare dati fino al primo salvataggio esplicito.
3. Pubblicare il codice e impostare **sul server**
   `PROCUREMENT_CATALOG_EDIT_ENABLED=1` nell’ambiente scelto. Il valore predefinito
   mantiene bloccate tutte le mutazioni del catalogo; i form sono consultabili
   in anteprima, con salvataggio disabilitato.

Le credenziali Supabase e la password riservata esistenti non cambiano. Il
catalogo deve provenire da Supabase: la vecchia variabile con il catalogo
compresso deve essere assente. L’anteprima locale non abilita scritture reali.
`PROCUREMENT_MODE=read-only` continua a bloccare il salvataggio delle commesse
anche quando il catalogo è modificabile. La nuova funzione non emette fatture,
non invia ordini e non cambia le pratiche commerciali.

## Coerenza dei dati

Il server verifica sessione, origine della richiesta e campi consentiti. La
funzione SQL usa lo stesso lock delle importazioni, confronta la voce aperta
con quella corrente e rifiuta i form obsoleti con HTTP 409. Non sovrascrive
modifiche contemporanee a un’altra scheda.

Snapshot applicativo, offerta normalizzata, eventuale prodotto provvisorio e
associazione fornitore/marchio sono aggiornati nella stessa transazione.
Il trigger esistente conserva una versione della voce per ogni modifica;
non si crea una copia storica dell’intero catalogo a ogni salvataggio.
I prezzi già concordati nelle righe d’ordine non vengono ricalcolati.

I successivi PDF vanno uniti al catalogo corrente. Un’importazione obsoleta
non deve riattivare una voce archiviata né cancellare correzioni manuali:
la funzione la rifiuta finché il file non viene riconciliato.

## Verifica

```sh
node --test tests/*.test.mjs
node node_modules/next/dist/bin/next build --webpack
node tests/catalog-editing.http.mjs
node tests/hosted-procurement.http.mjs

# PostgreSQL incorporato, senza connessioni all’archivio reale:
npm install --prefix /tmp/margine-supabase-qa --no-audit --no-fund --ignore-scripts @electric-sql/pglite
PROCUREMENT_PGLITE_MODULE=/tmp/margine-supabase-qa/node_modules/@electric-sql/pglite node --test scripts/check-catalog-editing.mjs scripts/check-procurement-schema.mjs
```

Le verifiche usano dati sintetici e coprono precisione dei prezzi, rollback,
conflitti, archiviazione/ripristino, storico, riferimenti degli ordini, permessi
SQL, autorizzazione HTTP e separazione dei salvataggi di catalogo e commesse.
