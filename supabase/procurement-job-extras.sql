-- Salvataggio atomico delle commesse e dei materiali selezionati dai listini.
-- Migrazione extra per listino. Applicare dopo procurement-operational-jobs.sql.
begin;
create or replace function public.save_procurement_job(p_job jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_id text:=p_job->>'id'; v_practice text:=p_job->>'practiceId'; v_version integer:=(p_job->>'version')::integer;
 v_old public.procurement_jobs%rowtype; v_existing boolean; v_practice_data jsonb; v_invoice jsonb;
 v_rate jsonb; v_index integer:=0; v_expected_kind text; v_count integer; v_first_paid boolean:=false;
 v_item jsonb; v_order jsonb; v_saved public.procurement_job_materials%rowtype; v_offer public.procurement_supplier_offers%rowtype;
 v_snapshot jsonb; v_materials jsonb:='[]'::jsonb; v_history bigint; v_current_materials jsonb; v_previous_materials jsonb;
 v_result jsonb; v_product jsonb; v_doc_name text; v_extra jsonb; v_extras jsonb:='[]'::jsonb; v_document public.procurement_documents%rowtype; v_extra_supplier text;
begin
 if nullif(v_id,'') is null or nullif(v_practice,'') is null or v_version is null or v_version<0 then raise exception 'Identificativi commessa non validi.'; end if;
 if jsonb_typeof(p_job->'materials') is distinct from 'array' or jsonb_array_length(p_job->'materials')>500 then raise exception 'Distinta materiali non valida.'; end if;
 if exists(select 1 from jsonb_array_elements(p_job->'materials') m group by m->>'id' having count(*)>1) then raise exception 'Righe materiali duplicate.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('margine-procurement-job:'||v_practice,0));
 perform pg_advisory_xact_lock(hashtextextended('margine-procurement-catalog-import',0));
 select * into v_old from public.procurement_jobs where id=v_id for update; v_existing=found;
 if (v_existing and (v_old.version<>v_version or v_old.practice_id<>v_practice)) or (not v_existing and v_version<>0) then
  raise sqlstate 'PT409' using message='La commessa è cambiata. Ricarica i dati prima di salvare.';
 end if;
 select data into v_practice_data from public.records where id=v_practice and kind='practice' for share;
 if v_practice_data is null then raise exception 'Pratica non trovata.'; end if;
 if not v_existing and lower(btrim(regexp_replace(coalesce(v_practice_data->>'practiceStatus',''),'^[^[:alnum:]]+',''))) not in ('vinta','won') then raise exception 'È richiesto lo stato pratica Vinta.'; end if;
 if jsonb_typeof(p_job->'installments') is distinct from 'array' then raise exception 'Piano rate non valido.'; end if;
 v_count=jsonb_array_length(p_job->'installments');
 if v_count not between 1 and 3 then raise exception 'Seleziona da una a tre rate.'; end if;
 if v_existing and jsonb_array_length(v_old.data->'installments')<>v_count then raise exception 'Il piano rate già avviato richiede una revisione dedicata.'; end if;
 if exists(select 1 from jsonb_array_elements(p_job->'installments') r where nullif(r->>'invoiceId','') is not null group by r->>'invoiceId' having count(*)>1) then raise exception 'Una fattura non può coprire due rate.'; end if;
 for v_rate in select value from jsonb_array_elements(p_job->'installments') loop
  v_index=v_index+1;
  v_expected_kind=case when v_count=1 then 'Saldo' when v_count=2 and v_index=1 then 'Acconto' when v_count=3 and v_index=1 then 'Deposito cauzionale' when v_count=3 and v_index=2 then 'Acconto' else 'Saldo' end;
  if v_rate->>'kind' is distinct from v_expected_kind then raise exception 'Sequenza rate non valida.'; end if;
  if nullif(v_rate->>'invoiceId','') is not null then
   select data into v_invoice from public.records where id=v_rate->>'invoiceId' and kind='invoice' and data->>'practiceId'=v_practice for share;
   if v_invoice is null then raise exception 'Collega una fattura della stessa pratica.'; end if;
   if nullif(v_rate->>'manualReference','') is not null or nullif(v_rate->>'manualPaidDate','') is not null then raise exception 'Usa il pagamento della fattura collegata.'; end if;
   if v_index=1 then v_first_paid=coalesce(v_invoice->'paid'='true'::jsonb,false); end if;
  elsif nullif(v_rate->>'manualPaidDate','') is not null then
   if nullif(btrim(v_rate->>'manualReference'),'') is null then raise exception 'Indica il documento del pagamento manuale.'; end if;
   if (v_rate->>'manualPaidDate')::date>(now() at time zone 'Europe/Rome')::date then raise exception 'Il pagamento ricevuto non può avere una data futura.'; end if;
   if v_index=1 then v_first_paid=true; end if;
  end if;
 end loop;
 if (p_job->>'works'<>'Da avviare' or p_job->>'connection'<>'Da aprire' or exists(select 1 from jsonb_array_elements(p_job->'orders') o where o->>'status'<>'Da ordinare')) and not v_first_paid then
  raise exception 'Registra prima il pagamento iniziale per avviare ordini, connessione e lavori.';
 end if;
 if nullif(p_job->>'completedDate','') is not null and ((p_job->>'works')<>'Conclusi' or (p_job->>'completedDate')::date>(now() at time zone 'Europe/Rome')::date) then raise exception 'Data effettiva di fine lavori non valida.'; end if;
 if v_existing and exists(select 1 from jsonb_array_elements(v_old.data->'orders') o where o->>'status'<>'Da ordinare') then
  select coalesce(jsonb_agg(jsonb_build_object('id',m->'id','offerId',m->'offerId','quantity',m->'quantity') order by m->>'id'),'[]') into v_current_materials from jsonb_array_elements(p_job->'materials') m;
  select coalesce(jsonb_agg(jsonb_build_object('id',m->'id','offerId',m->'offerId','quantity',m->'quantity') order by m->>'id'),'[]') into v_previous_materials from jsonb_array_elements(coalesce(v_old.data->'materials','[]')) m;
  if v_current_materials is distinct from v_previous_materials then raise exception 'I materiali già ordinati richiedono una revisione dell’ordine.'; end if;
 end if;
 if not v_existing then
  insert into public.procurement_jobs(id,practice_id,data,version) values(v_id,v_practice,p_job,v_version+1);
 end if;
 delete from public.procurement_job_materials m where m.job_id=v_id and not exists(select 1 from jsonb_array_elements(p_job->'materials') x where x->>'id'=m.id);
 for v_item in select value from jsonb_array_elements(p_job->'materials') loop
  if nullif(v_item->>'id','') is null then raise exception 'Identificativo materiale mancante.'; end if;
  if (v_item->>'quantity')::numeric<>round((v_item->>'quantity')::numeric,6) then raise exception 'La quantità ammette al massimo sei decimali.'; end if;
  select * into v_saved from public.procurement_job_materials where job_id=v_id and id=v_item->>'id';
  if found then
   if v_saved.offer_id is distinct from v_item->>'offerId' then raise exception 'Per sostituire un prodotto rimuovi la riga e aggiungi quello nuovo.'; end if;
   v_snapshot=v_saved.source_snapshot;v_history=v_saved.offer_history_id;
  else
   select * into v_offer from public.procurement_supplier_offers where id=v_item->>'offerId';
   if not found or not v_offer.active then raise exception 'Prodotto non disponibile nel catalogo attivo.'; end if;
   if v_item ? 'expectedPriceCents' and (v_item->>'expectedPriceCents')::numeric is distinct from v_offer.purchase_price_cents then raise sqlstate 'PT409' using message='Il prezzo del listino è cambiato. Ricarica i dati e seleziona nuovamente il prodotto prima di salvare.'; end if;
   select id into v_history from public.procurement_offer_history where offer_id=v_offer.id and revision=v_offer.revision;
   if v_history is null then raise exception 'Versione del listino non trovata.'; end if;
   v_product=v_offer.source_payload;
   select name into v_doc_name from public.procurement_documents where id=v_offer.document_id;
   v_snapshot=jsonb_build_object('label',v_product->'label','code',v_product->'code','brand',v_product->'brand','description',v_product->'description',
    'supplierId',v_offer.supplier_id,'supplierName',v_product->'supplierName','unit',v_offer.unit,'unitPriceCents',v_offer.purchase_price_cents,
    'currency',v_offer.currency,'vatIncluded',v_offer.vat_included,'documentId',v_offer.document_id,'documentName',v_doc_name,'page',v_offer.source_page,
    'validUntil',v_offer.valid_until,'validityStatus',v_offer.validity_status,'stockStatus',v_offer.stock_status,'review',v_offer.review,'verified',v_offer.verified,'selectedAt',clock_timestamp());
  end if;
  insert into public.procurement_job_materials(job_id,id,offer_id,offer_history_id,quantity,unit_price_cents,source_snapshot)
   values(v_id,v_item->>'id',v_item->>'offerId',v_history,(v_item->>'quantity')::numeric,(v_snapshot->>'unitPriceCents')::numeric,v_snapshot)
   on conflict(job_id,id) do update set quantity=excluded.quantity,updated_at=now();
  v_materials=v_materials||jsonb_build_array(jsonb_build_object('id',v_item->>'id','offerId',v_item->>'offerId','quantity',(v_item->>'quantity')::numeric,'snapshot',v_snapshot));
 end loop;
 for v_order in select value from jsonb_array_elements(p_job->'orders') loop
  if v_order->>'status'<>'Da ordinare' then
   if not exists(select 1 from jsonb_array_elements(v_materials) m where m->'snapshot'->>'supplierId'=v_order->>'supplierId') then raise exception 'Seleziona i materiali del fornitore prima di registrare l’ordine.'; end if;
   if exists(select 1 from jsonb_array_elements(v_materials) m where m->'snapshot'->>'supplierId'=v_order->>'supplierId' and (m->'snapshot'->>'unitPriceCents' is null or m->'snapshot'->>'currency'<>'EUR')) then raise exception 'Conferma i prezzi dei materiali prima di registrare l’ordine.'; end if;
  end if;
 end loop;
 if jsonb_typeof(coalesce(p_job->'extras','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(p_job->'extras','[]'::jsonb))>100 then raise exception 'Extra non validi.'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_job->'extras','[]'::jsonb)) e group by e->>'id' having count(*)>1) then raise exception 'Extra duplicati.'; end if;
 for v_extra in select value from jsonb_array_elements(coalesce(p_job->'extras','[]'::jsonb)) loop
  if nullif(btrim(v_extra->>'id'),'') is null or length(v_extra->>'id')>300 or nullif(btrim(v_extra->>'description'),'') is null or length(v_extra->>'description')>500 then raise exception 'Descrizione extra non valida.'; end if;
  if jsonb_typeof(v_extra->'amountCents') is distinct from 'null' and (jsonb_typeof(v_extra->'amountCents') is distinct from 'number' or (v_extra->>'amountCents')::numeric<0 or (v_extra->>'amountCents')::numeric>1000000000000 or trunc((v_extra->>'amountCents')::numeric)<>(v_extra->>'amountCents')::numeric) then raise exception 'Importo extra non valido.'; end if;
  if jsonb_typeof(v_extra->'vatIncluded') not in ('boolean','null') or not (v_extra ? 'vatIncluded') then raise exception 'IVA extra non valida.'; end if;
  select * into v_document from public.procurement_documents where id=v_extra->>'documentId';
  if not found then raise exception 'Listino extra non trovato.'; end if;
  select name into v_extra_supplier from public.procurement_suppliers where id=v_document.supplier_id;
  v_extras=v_extras||jsonb_build_array(jsonb_build_object('id',v_extra->>'id','documentId',v_document.id,'description',btrim(v_extra->>'description'),'amountCents',v_extra->'amountCents','vatIncluded',v_extra->'vatIncluded','documentName',v_document.name,'supplierId',v_document.supplier_id,'supplierName',v_extra_supplier));
 end loop;
 for v_order in select value from jsonb_array_elements(p_job->'orders') loop
  if v_order->>'status'<>'Da ordinare' and exists(select 1 from jsonb_array_elements(v_extras) e where e->>'supplierId'=v_order->>'supplierId' and e->>'amountCents' is null) then raise exception 'Conferma gli importi degli extra prima di registrare l’ordine.'; end if;
 end loop;
 if v_existing and exists(select 1 from jsonb_array_elements(v_old.data->'orders') o where o->>'status'<>'Da ordinare') then
  select coalesce(jsonb_agg(jsonb_build_object('id',e->'id','documentId',e->'documentId','description',e->'description','amountCents',e->'amountCents','vatIncluded',e->'vatIncluded') order by e->>'id'),'[]'::jsonb) into v_current_materials from jsonb_array_elements(v_extras) e;
  select coalesce(jsonb_agg(jsonb_build_object('id',e->'id','documentId',e->'documentId','description',e->'description','amountCents',e->'amountCents','vatIncluded',e->'vatIncluded') order by e->>'id'),'[]'::jsonb) into v_previous_materials from jsonb_array_elements(coalesce(v_old.data->'extras','[]'::jsonb)) e;
  if v_current_materials is distinct from v_previous_materials then raise exception 'Gli extra già ordinati richiedono una revisione dell’ordine.'; end if;
 end if;
 v_result=p_job||jsonb_build_object('version',v_version+1,'materials',v_materials,'extras',v_extras);
 update public.procurement_jobs set data=v_result,version=v_version+1 where id=v_id;
 return v_result;
end $$;
revoke all on function public.save_procurement_job(jsonb) from public,anon,authenticated;
grant execute on function public.save_procurement_job(jsonb) to service_role;
comment on table public.procurement_job_materials is 'Materiali della commessa con prezzo e versione del listino congelati. Nessun invio di ordini automatico.';
notify pgrst,'reload schema';
commit;
