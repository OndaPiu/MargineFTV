-- Applicare DOPO la versione aggiornata di supabase/procurement.sql.
-- Non modifica il catalogo finché il proprietario non salva una scheda.
begin;
do $$ begin
 if position('active=excluded.active' in pg_get_functiondef('public.import_procurement_catalog(jsonb)'::regprocedure))=0 then
  raise exception 'Applicare prima la versione aggiornata di supabase/procurement.sql.';
 end if;
end $$;

create or replace function public.update_procurement_offer(p_offer_id text,p_expected jsonb,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_catalog jsonb; v_old jsonb; v_new jsonb; v_index integer;
 v_doc jsonb; v_supplier jsonb; v_brand text; v_brand_id text; v_product_id text; v_list numeric; v_purchase numeric; v_discount numeric;
begin
 if jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_changes) is distinct from 'object' or p_changes='{}'::jsonb then
  raise exception 'Modifica catalogo non valida.';
 end if;
 if exists(select 1 from jsonb_object_keys(p_changes) k where k not in (
  'label','code','brand','description','category','section','supplierId','documentId','page','unit','currency',
  'listPriceCents','purchasePriceCents','shippingCents','priceBasis','discountPercent','vatIncluded',
  'validUntil','validityStatus','stockStatus','review','verified','active')) then
  raise exception 'La modifica contiene campi non consentiti.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('margine-procurement-catalog-import',0));
 select data into v_catalog from public.procurement_catalog where id='main' for update;
 if v_catalog is null then raise exception 'Catalogo da importare.'; end if;
 select o.value,(o.ordinality-1)::integer into v_old,v_index
  from jsonb_array_elements(v_catalog->'offers') with ordinality o(value,ordinality) where o.value->>'id'=p_offer_id;
 if v_old is null then raise sqlstate 'PT404' using message='Voce del catalogo non trovata.'; end if;
 if v_old is distinct from p_expected then
  raise sqlstate 'PT409' using message='La voce è stata aggiornata. Ricarica il catalogo e riapri la scheda prima di salvare.';
 end if;
 v_new=v_old||p_changes;
 if nullif(btrim(v_new->>'label'),'') is null or nullif(btrim(v_new->>'unit'),'') is null or v_new->>'currency'<>'EUR' then
  raise exception 'Indicare nome, unità di vendita e prezzi in EUR.';
 end if;
 if jsonb_typeof(v_new->'active') not in ('boolean') and v_new ? 'active' then raise exception 'Stato catalogo non valido.'; end if;
 if jsonb_typeof(v_new->'vatIncluded') not in ('boolean','null') then raise exception 'Indicazione IVA non valida.'; end if;
 if jsonb_typeof(v_new->'verified') is distinct from 'boolean' then raise exception 'Verifica dati non valida.'; end if;
 if v_new->>'stockStatus' not in ('unknown','while-stocks-last','available','unavailable') then raise exception 'Disponibilità non valida.'; end if;
 if v_new->>'validityStatus' not in ('dated','to-confirm') then raise exception 'Validità non valida.'; end if;
 if v_new->>'validityStatus'='dated' and nullif(v_new->>'validUntil','') is null then raise exception 'Indicare la scadenza.'; end if;
 select value into v_doc from jsonb_array_elements(v_catalog->'documents') where value->>'id'=v_new->>'documentId';
 if v_doc is null then raise exception 'Listino di origine non trovato.'; end if;
 if (v_new->>'page')::integer<1 or ((v_doc->>'pages')::integer is not null and (v_new->>'page')::integer>(v_doc->>'pages')::integer) then
  raise exception 'La pagina indicata non esiste nel documento.';
 end if;
 if nullif(v_new->>'supplierId','') is not null then
  select value into v_supplier from jsonb_array_elements(v_catalog->'suppliers') where value->>'id'=v_new->>'supplierId';
  if v_supplier is null then raise exception 'Fornitore non trovato.'; end if;
 end if;
 v_new=v_new||jsonb_build_object('supplierName',coalesce(v_supplier->>'name','Fornitore da identificare'),'documentDate',v_doc->'date');
 v_list=(v_new->>'listPriceCents')::numeric; v_purchase=(v_new->>'purchasePriceCents')::numeric; v_discount=(v_new->>'discountPercent')::numeric;
 if v_new->>'priceBasis'='net' and v_list is distinct from v_purchase then raise exception 'Con prezzo netto, listino e acquisto devono coincidere.'; end if;
 if v_new->>'priceBasis'='gross' and v_list is not null and v_purchase is not null
  and (v_discount is null or abs(v_purchase-v_list*(1-v_discount/100))>0.0001) then raise exception 'Prezzo di acquisto e sconto non corrispondono.'; end if;
 if v_new is not distinct from v_old then return v_old; end if;
 v_new=v_new||jsonb_build_object('manualUpdatedAt',clock_timestamp(),'manualRevision',coalesce((v_old->>'manualRevision')::bigint,0)+1);
 v_catalog=jsonb_set(v_catalog,array['offers',v_index::text],v_new);
 -- La nuova associazione fornitore/marchio deve essere visibile anche nella scheda fornitore.
 v_brand=nullif(btrim(v_new->>'brand'),'');
 if v_supplier is not null and v_brand is not null and not coalesce(v_supplier->'brands','[]'::jsonb) ? v_brand then
  v_supplier=jsonb_set(v_supplier,'{brands}',coalesce(v_supplier->'brands','[]'::jsonb)||jsonb_build_array(v_brand));
  select (ordinality-1)::integer into v_index from jsonb_array_elements(v_catalog->'suppliers') with ordinality s(value,ordinality) where s.value->>'id'=v_supplier->>'id';
  v_catalog=jsonb_set(v_catalog,array['suppliers',v_index::text],v_supplier);
 end if;
 -- Aggiornamento puntuale: lo storico conserva la sola voce, senza duplicare tutto il catalogo a ogni modifica.
 select product_id into v_product_id from public.procurement_supplier_offers where id=p_offer_id;
 if not found then raise exception 'Voce normalizzata assente: importare prima il catalogo con la funzione aggiornata.'; end if;
 if v_brand is not null then
  v_brand_id='brand:'||encode(sha256(convert_to(lower(btrim(v_brand)),'UTF8')),'hex');
  insert into public.procurement_brands(id,name) values(v_brand_id,v_brand) on conflict(id) do nothing;
  if v_supplier is not null then
   insert into public.procurement_supplier_brands(supplier_id,brand_id,evidence)
   values(v_supplier->>'id',v_brand_id,'Scheda aggiornata manualmente dal proprietario') on conflict do nothing;
   update public.procurement_suppliers set source_payload=v_supplier where id=v_supplier->>'id';
  end if;
 end if;
 update public.procurement_supplier_offers set supplier_id=nullif(v_new->>'supplierId',''),document_id=v_new->>'documentId',
  supplier_code=v_new->>'code',description=v_new->>'description',source_page=(v_new->>'page')::integer,
  unit=v_new->>'unit',currency=v_new->>'currency',price_basis=nullif(v_new->>'priceBasis',''),list_price_cents=v_list,
  discount_percent=v_discount,purchase_price_cents=v_purchase,vat_included=(v_new->>'vatIncluded')::boolean,
  shipping_cents=(v_new->>'shippingCents')::numeric,valid_until=nullif(v_new->>'validUntil','')::date,
  validity_status=v_new->>'validityStatus',stock_status=v_new->>'stockStatus',review=v_new->'review',
  verified=(v_new->>'verified')::boolean,active=coalesce((v_new->>'active')::boolean,true),source_payload=v_new
 where id=p_offer_id;
 -- Nessuna modifica ai prodotti già verificati o associati ad altre schede.
 update public.procurement_products set code=v_new->>'code',name=v_new->>'label',description=v_new->>'description',
  category=v_new->>'category',unit=v_new->>'unit',brand_id=v_brand_id
 where id=v_product_id and id='source-product:'||p_offer_id and provisional;
 update public.procurement_catalog set data=v_catalog,updated_at=now() where id='main';
 return v_new;
end $$;
revoke all on function public.update_procurement_offer(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.update_procurement_offer(text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
