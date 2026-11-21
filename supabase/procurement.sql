-- MargineFTV: archivio riservato per catalogo e commesse.
-- Eseguire nel SQL Editor Supabase. Richiede public.records già esistente.
-- La transazione non modifica né elimina pratiche, fatture o contatti.
begin;

do $$ begin
  if to_regclass('public.records') is null then
    raise exception 'Manca public.records: applicare prima lo schema commerciale esistente.';
  end if;
end $$;

-- Compatibilità con l'app attuale: le due tabelle JSON restano disponibili.
create table if not exists public.procurement_catalog (
  id text primary key check (id = 'main'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.procurement_jobs (
  id text primary key,
  practice_id text not null unique references public.records(id) on delete restrict,
  data jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.procurement_suppliers (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  company_name text,
  vat_number text,
  email text,
  phone text,
  website text,
  notes text not null default '',
  active boolean not null default true,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.procurement_brands (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists procurement_brand_name_uq on public.procurement_brands(lower(btrim(name)));
create table if not exists public.procurement_supplier_brands (
  supplier_id text not null references public.procurement_suppliers(id) on delete restrict,
  brand_id text not null references public.procurement_brands(id) on delete restrict,
  evidence text not null default '',
  last_seen_at timestamptz not null default now(),
  primary key (supplier_id, brand_id)
);
create table if not exists public.procurement_documents (
  id text primary key,
  supplier_id text references public.procurement_suppliers(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  document_type text not null default 'other' check (document_type in ('price_list','promotion','datasheet','other')),
  source_filename text,
  source_date_label text,
  issued_on date,
  valid_from date,
  valid_until date,
  vat_included boolean,
  sha256 text check (sha256 is null or sha256 ~ '^[a-fA-F0-9]{64}$'),
  storage_bucket text not null default 'margine-procurement-documents',
  storage_path text,
  supersedes_id text references public.procurement_documents(id) on delete restrict,
  archived boolean not null default false,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_from is null or valid_until is null or valid_until >= valid_from),
  check (supersedes_id is null or supersedes_id <> id)
);
create index if not exists procurement_documents_supplier_idx on public.procurement_documents(supplier_id);
create index if not exists procurement_documents_expiry_idx on public.procurement_documents(valid_until);
create table if not exists public.procurement_catalog_imports (
  id text primary key,
  source text not null default 'catalog-import',
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  imported_at timestamptz not null default now()
);
create table if not exists public.procurement_products (
  id text primary key,
  brand_id text references public.procurement_brands(id) on delete restrict,
  code text,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  category text not null default '',
  unit text,
  power_kw numeric(12,4) check (power_kw is null or power_kw >= 0),
  storage_kwh numeric(12,4) check (storage_kwh is null or storage_kwh >= 0),
  phase text check (phase is null or phase in ('single','three')),
  specifications jsonb not null default '{}'::jsonb check (jsonb_typeof(specifications) = 'object'),
  provisional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Il codice non è univoco: alcuni listini riusano codici per kit diversi.
create index if not exists procurement_products_brand_code_idx on public.procurement_products(brand_id,code);
create index if not exists procurement_products_category_idx on public.procurement_products(category);
create table if not exists public.procurement_supplier_offers (
  id text primary key,
  supplier_id text references public.procurement_suppliers(id) on delete restrict,
  product_id text references public.procurement_products(id) on delete restrict,
  document_id text not null references public.procurement_documents(id) on delete restrict,
  supplier_code text,
  description text not null default '',
  source_page integer check (source_page is null or source_page > 0),
  unit text,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  price_basis text check (price_basis is null or price_basis in ('gross','net')),
  list_price_cents numeric(18,4) check (list_price_cents is null or list_price_cents >= 0),
  discount_percent numeric(7,4) check (discount_percent is null or discount_percent between 0 and 100),
  purchase_price_cents numeric(18,4) check (purchase_price_cents is null or purchase_price_cents >= 0),
  vat_included boolean,
  vat_rate numeric(7,4) check (vat_rate is null or vat_rate between 0 and 100),
  shipping_cents numeric(18,4) check (shipping_cents is null or shipping_cents >= 0),
  min_quantity numeric(18,6) check (min_quantity is null or min_quantity > 0),
  valid_until date,
  validity_status text not null default 'to-confirm',
  stock_status text not null default 'unknown',
  stock_checked_at timestamptz,
  review jsonb not null default '[]'::jsonb check (jsonb_typeof(review) = 'array'),
  verified boolean not null default false,
  active boolean not null default true,
  last_import_id text references public.procurement_catalog_imports(id) on delete restrict,
  source_payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procurement_offers_supplier_product_idx on public.procurement_supplier_offers(supplier_id,product_id);
create index if not exists procurement_offers_document_idx on public.procurement_supplier_offers(document_id);
create index if not exists procurement_offers_expiry_idx on public.procurement_supplier_offers(valid_until);
create table if not exists public.procurement_offer_history (
  id bigint generated always as identity primary key,
  offer_id text not null references public.procurement_supplier_offers(id) on delete restrict,
  revision bigint not null,
  import_id text references public.procurement_catalog_imports(id) on delete restrict,
  purchase_price_cents numeric(18,4),
  currency text not null,
  snapshot jsonb not null,
  recorded_at timestamptz not null default now(),
  unique (offer_id,revision)
);

create table if not exists public.procurement_installments (
  id text primary key default gen_random_uuid()::text,
  job_id text not null references public.procurement_jobs(id) on delete restrict,
  position smallint not null check (position between 1 and 3),
  kind text not null check (kind in ('Deposito cauzionale','Acconto','Saldo')),
  milestone text not null default '',
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  due_on date,
  invoice_id text references public.records(id) on delete restrict,
  external_document_number text,
  external_paid_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id,position),
  check (invoice_id is null or (external_document_number is null and external_paid_on is null)),
  check (external_paid_on is null or nullif(btrim(external_document_number),'') is not null)
);
create unique index if not exists procurement_installment_invoice_uq on public.procurement_installments(invoice_id) where invoice_id is not null;
create table if not exists public.procurement_purchase_orders (
  id text primary key default gen_random_uuid()::text,
  job_id text not null references public.procurement_jobs(id) on delete restrict,
  supplier_id text references public.procurement_suppliers(id) on delete restrict,
  reference text,
  status text not null default 'Da ordinare' check (status in ('Da ordinare','Ordinato','Consegnato','Annullato')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  ordered_on date,
  expected_delivery_on date,
  delivered_on date,
  shipping_cents bigint check (shipping_cents is null or shipping_cents >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('Ordinato','Consegnato') or (supplier_id is not null and ordered_on is not null)),
  check (status <> 'Consegnato' or delivered_on is not null),
  check (ordered_on is null or delivered_on is null or delivered_on >= ordered_on)
);
create index if not exists procurement_orders_job_idx on public.procurement_purchase_orders(job_id);
create index if not exists procurement_orders_supplier_idx on public.procurement_purchase_orders(supplier_id);
create table if not exists public.procurement_purchase_order_lines (
  id text primary key default gen_random_uuid()::text,
  order_id text not null references public.procurement_purchase_orders(id) on delete restrict,
  product_id text references public.procurement_products(id) on delete restrict,
  offer_history_id bigint references public.procurement_offer_history(id) on delete restrict,
  description text not null check (btrim(description) <> ''),
  quantity numeric(18,6) not null check (quantity > 0),
  unit text not null check (btrim(unit) <> ''),
  unit_price_cents numeric(18,4) check (unit_price_cents is null or unit_price_cents >= 0),
  vat_included boolean,
  vat_rate numeric(7,4) check (vat_rate is null or vat_rate between 0 and 100),
  line_total_cents numeric generated always as (round(quantity * unit_price_cents)) stored,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procurement_order_lines_order_idx on public.procurement_purchase_order_lines(order_id);
create table if not exists public.procurement_connections (
  id text primary key default gen_random_uuid()::text,
  job_id text not null unique references public.procurement_jobs(id) on delete restrict,
  provider_name text not null default 'Emmolo' check (btrim(provider_name) <> ''),
  supplier_id text references public.procurement_suppliers(id) on delete restrict,
  reference text,
  status text not null default 'Da aprire' check (status in ('Da aprire','Aperta','In lavorazione','Completata')),
  opened_on date,
  completed_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opened_on is null or completed_on is null or completed_on >= opened_on)
);
create table if not exists public.procurement_plant_templates (
  id text primary key default gen_random_uuid()::text,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  power_kw numeric(12,4) check (power_kw is null or power_kw >= 0),
  storage_kwh numeric(12,4) check (storage_kwh is null or storage_kwh >= 0),
  phase text check (phase is null or phase in ('single','three')),
  requirements jsonb not null default '{}'::jsonb check (jsonb_typeof(requirements) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.procurement_template_lines (
  id text primary key default gen_random_uuid()::text,
  template_id text not null references public.procurement_plant_templates(id) on delete restrict,
  product_id text references public.procurement_products(id) on delete restrict,
  description text not null check (btrim(description) <> ''),
  quantity numeric(18,6) not null check (quantity > 0),
  unit text not null check (btrim(unit) <> ''),
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists procurement_template_lines_template_idx on public.procurement_template_lines(template_id);
create table if not exists public.procurement_product_alternatives (
  product_id text not null references public.procurement_products(id) on delete restrict,
  alternative_product_id text not null references public.procurement_products(id) on delete restrict,
  status text not null default 'candidate' check (status in ('candidate','approved','rejected')),
  compatibility_notes text not null default '',
  evidence_document_id text references public.procurement_documents(id) on delete restrict,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id,alternative_product_id),
  check (product_id <> alternative_product_id),
  check (status <> 'approved' or (approved_at is not null and nullif(btrim(compatibility_notes),'') is not null))
);

create or replace function public.procurement_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at=now(); return new; end $$;

create or replace function public.procurement_validate_job_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.records where id=new.practice_id and kind='practice') then
    raise exception 'La commessa deve riferirsi a una pratica esistente.';
  end if;
  return new;
end $$;
drop trigger if exists procurement_job_record on public.procurement_jobs;
create trigger procurement_job_record before insert or update of practice_id on public.procurement_jobs
for each row execute function public.procurement_validate_job_record();

create or replace function public.procurement_validate_installment_invoice()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_practice text;
begin
  if new.invoice_id is not null then
    select practice_id into v_practice from public.procurement_jobs where id=new.job_id;
    if not exists(select 1 from public.records where id=new.invoice_id and kind='invoice' and data->>'practiceId'=v_practice) then
      raise exception 'La fattura deve essere collegata alla stessa pratica della commessa.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists procurement_installment_invoice on public.procurement_installments;
create trigger procurement_installment_invoice before insert or update of job_id,invoice_id on public.procurement_installments
for each row execute function public.procurement_validate_installment_invoice();

create or replace function public.procurement_offer_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (to_jsonb(new)-'updated_at'-'revision'-'last_import_id') is distinct from (to_jsonb(old)-'updated_at'-'revision'-'last_import_id') then
    new.revision=old.revision+1;
  else new.revision=old.revision;
  end if;
  new.updated_at=now(); return new;
end $$;
create or replace function public.procurement_capture_offer_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='INSERT' or new.revision<>old.revision then
    insert into public.procurement_offer_history(offer_id,revision,import_id,purchase_price_cents,currency,snapshot)
    values(new.id,new.revision,new.last_import_id,new.purchase_price_cents,new.currency,to_jsonb(new));
  end if;
  return new;
end $$;
drop trigger if exists procurement_offer_revision on public.procurement_supplier_offers;
create trigger procurement_offer_revision before update on public.procurement_supplier_offers
for each row execute function public.procurement_offer_revision();
drop trigger if exists procurement_offer_history on public.procurement_supplier_offers;
create trigger procurement_offer_history after insert or update on public.procurement_supplier_offers
for each row execute function public.procurement_capture_offer_history();

-- Un solo punto di importazione: normalizzazione e snapshot compatibile sono atomici.
create or replace function public.import_procurement_catalog(p_catalog jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_data jsonb := p_catalog-'extractionAudit';
  v_import text;
  v_item jsonb;
  v_brand text;
  v_brand_id text;
  v_product_id text;
  v_group text;
begin
  if jsonb_typeof(v_data) is distinct from 'object' or v_data->>'schemaVersion' is distinct from '1' then
    raise exception 'Formato catalogo non valido.';
  end if;
  foreach v_group in array array['suppliers','documents','offers'] loop
    if jsonb_typeof(v_data->v_group) is distinct from 'array' then raise exception 'Sezione catalogo mancante: %',v_group; end if;
    if exists(select 1 from jsonb_array_elements(v_data->v_group) x where nullif(btrim(x->>'id'),'') is null)
       or exists(select 1 from jsonb_array_elements(v_data->v_group) x group by x->>'id' having count(*)>1) then
      raise exception 'Identificativi mancanti o duplicati: %',v_group;
    end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('margine-procurement-catalog-import',0));
  -- Un nuovo PDF non deve annullare correzioni o archiviazioni fatte sul sito.
  if exists(select 1 from jsonb_array_elements(v_data->'offers') incoming
    join public.procurement_supplier_offers saved on saved.id=incoming->>'id'
    where coalesce((saved.source_payload->>'manualRevision')::bigint,0)>0
      and coalesce((incoming->>'manualRevision')::bigint,0)<=coalesce((saved.source_payload->>'manualRevision')::bigint,0)
      and incoming is distinct from saved.source_payload) then
    raise sqlstate 'PT409' using message='Il catalogo contiene schede corrette manualmente. Unire il nuovo listino al catalogo aggiornato prima di importare.';
  end if;
  v_import=encode(sha256(convert_to(v_data::text,'UTF8')),'hex');
  if exists(select 1 from public.procurement_catalog_imports where id=v_import) then
    return jsonb_build_object('importId',v_import,'alreadyImported',true);
  end if;
  insert into public.procurement_catalog_imports(id,snapshot) values(v_import,v_data);
  for v_item in select value from jsonb_array_elements(v_data->'suppliers') loop
    insert into public.procurement_suppliers(id,name,source_payload)
    values(v_item->>'id',v_item->>'name',v_item)
    on conflict(id) do update set name=excluded.name,source_payload=excluded.source_payload;
    if jsonb_typeof(v_item->'brands')='array' then
      for v_brand in select jsonb_array_elements_text(v_item->'brands') loop
        if nullif(btrim(v_brand),'') is not null then
          v_brand_id='brand:'||encode(sha256(convert_to(lower(btrim(v_brand)),'UTF8')),'hex');
          insert into public.procurement_brands(id,name) values(v_brand_id,btrim(v_brand)) on conflict(id) do nothing;
          insert into public.procurement_supplier_brands(supplier_id,brand_id,evidence)
          values(v_item->>'id',v_brand_id,coalesce(v_item->>'brandEvidence',''))
          on conflict(supplier_id,brand_id) do update set evidence=excluded.evidence,last_seen_at=now();
        end if;
      end loop;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_data->'documents') loop
    insert into public.procurement_documents(id,supplier_id,name,document_type,source_filename,source_date_label,issued_on,valid_until,vat_included,sha256,source_payload)
    values(v_item->>'id',nullif(v_item->>'supplierId',''),v_item->>'name',coalesce(v_item->>'documentType','other'),v_item->>'sourceFile',v_item->>'date',
      case when v_item->>'date' ~ '^\d{4}-\d{2}-\d{2}$' then (v_item->>'date')::date else null end,
      nullif(v_item->>'validUntil','')::date,(v_item->>'vatIncluded')::boolean,v_item->>'sha256',v_item)
    on conflict(id) do update set supplier_id=excluded.supplier_id,name=excluded.name,document_type=excluded.document_type,source_filename=excluded.source_filename,
      source_date_label=excluded.source_date_label,issued_on=excluded.issued_on,valid_until=excluded.valid_until,
      vat_included=excluded.vat_included,sha256=excluded.sha256,source_payload=excluded.source_payload;
  end loop;
  for v_item in select value from jsonb_array_elements(v_data->'offers') loop
    v_brand=nullif(btrim(v_item->>'brand'),''); v_brand_id=null;
    if v_brand is not null then
      v_brand_id='brand:'||encode(sha256(convert_to(lower(v_brand),'UTF8')),'hex');
      insert into public.procurement_brands(id,name) values(v_brand_id,v_brand) on conflict(id) do nothing;
      if nullif(v_item->>'supplierId','') is not null then
        insert into public.procurement_supplier_brands(supplier_id,brand_id,evidence)
        values(v_item->>'supplierId',v_brand_id,'Prodotto presente nel documento importato') on conflict do nothing;
      end if;
    end if;
    -- Un prodotto provvisorio per voce: nessuna equivalenza tecnica dedotta dal solo codice.
    v_product_id='source-product:'||(v_item->>'id');
    insert into public.procurement_products(id,brand_id,code,name,description,category,unit)
    values(v_product_id,v_brand_id,v_item->>'code',v_item->>'label',coalesce(v_item->>'description',''),coalesce(v_item->>'category',''),v_item->>'unit')
    on conflict(id) do update set brand_id=excluded.brand_id,code=excluded.code,name=excluded.name,
      description=excluded.description,category=excluded.category,unit=excluded.unit
    where public.procurement_products.provisional;
    insert into public.procurement_supplier_offers(id,supplier_id,product_id,document_id,supplier_code,description,source_page,unit,currency,
      price_basis,list_price_cents,discount_percent,purchase_price_cents,vat_included,shipping_cents,valid_until,validity_status,stock_status,review,verified,active,last_import_id,source_payload)
    values(v_item->>'id',nullif(v_item->>'supplierId',''),v_product_id,v_item->>'documentId',v_item->>'code',coalesce(v_item->>'description',''),
      nullif(v_item->>'page','')::integer,v_item->>'unit',coalesce(v_item->>'currency','EUR'),nullif(v_item->>'priceBasis',''),
      nullif(v_item->>'listPriceCents','')::numeric,nullif(v_item->>'discountPercent','')::numeric,nullif(v_item->>'purchasePriceCents','')::numeric,
      (v_item->>'vatIncluded')::boolean,nullif(v_item->>'shippingCents','')::numeric,nullif(v_item->>'validUntil','')::date,
      coalesce(v_item->>'validityStatus','to-confirm'),coalesce(v_item->>'stockStatus','unknown'),coalesce(v_item->'review','[]'::jsonb),
      coalesce((v_item->>'verified')::boolean,false),coalesce((v_item->>'active')::boolean,true),v_import,v_item)
    on conflict(id) do update set supplier_id=excluded.supplier_id,
      product_id=coalesce(public.procurement_supplier_offers.product_id,excluded.product_id),document_id=excluded.document_id,
      supplier_code=excluded.supplier_code,description=excluded.description,source_page=excluded.source_page,unit=excluded.unit,currency=excluded.currency,
      price_basis=excluded.price_basis,list_price_cents=excluded.list_price_cents,discount_percent=excluded.discount_percent,
      purchase_price_cents=excluded.purchase_price_cents,vat_included=excluded.vat_included,shipping_cents=excluded.shipping_cents,
      valid_until=excluded.valid_until,validity_status=excluded.validity_status,stock_status=excluded.stock_status,
      review=excluded.review,verified=excluded.verified,active=excluded.active,last_import_id=excluded.last_import_id,source_payload=excluded.source_payload;
  end loop;
  insert into public.procurement_catalog(id,data) values('main',v_data)
  on conflict(id) do update set data=excluded.data,updated_at=now();
  return jsonb_build_object('importId',v_import,'alreadyImported',false,'suppliers',jsonb_array_length(v_data->'suppliers'),
    'documents',jsonb_array_length(v_data->'documents'),'offers',jsonb_array_length(v_data->'offers'));
end $$;

-- Accesso esclusivamente dal server. Nessuna policy pubblica o anonima.
do $$
declare t text;
begin
  foreach t in array array[
    'procurement_catalog','procurement_jobs','procurement_suppliers','procurement_brands','procurement_supplier_brands',
    'procurement_documents','procurement_catalog_imports','procurement_products','procurement_supplier_offers','procurement_offer_history',
    'procurement_installments','procurement_purchase_orders','procurement_purchase_order_lines','procurement_connections',
    'procurement_plant_templates','procurement_template_lines','procurement_product_alternatives'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
    if t not in ('procurement_catalog_imports','procurement_offer_history','procurement_supplier_brands','procurement_supplier_offers') then
      execute format('drop trigger if exists procurement_touch_updated_at on public.%I',t);
      execute format('create trigger procurement_touch_updated_at before update on public.%I for each row execute function public.procurement_touch_updated_at()',t);
    end if;
  end loop;
end $$;
drop trigger if exists procurement_jobs_touch on public.procurement_jobs;
revoke all on sequence public.procurement_offer_history_id_seq from public,anon,authenticated;
grant usage,select on sequence public.procurement_offer_history_id_seq to service_role;
revoke all on function public.procurement_touch_updated_at(),public.procurement_validate_job_record(),
  public.procurement_validate_installment_invoice(),public.procurement_offer_revision(),public.procurement_capture_offer_history(),
  public.import_procurement_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.procurement_touch_updated_at(),public.procurement_validate_job_record(),
  public.procurement_validate_installment_invoice(),public.procurement_offer_revision(),public.procurement_capture_offer_history(),
  public.import_procurement_catalog(jsonb) to service_role;

-- Storage è presente su Supabase, facoltativo nel collaudo PostgreSQL locale.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('margine-procurement-documents','margine-procurement-documents',false,26214400,array['application/pdf','image/jpeg','image/png'])
    on conflict(id) do update set public=false;
  end if;
end $$;
comment on table public.procurement_supplier_brands is 'Il fornitore tratta il marchio; non certifica disponibilità a magazzino.';
comment on table public.procurement_products is 'Prodotti provvisori distinti finché non vengono verificati; nessuna equivalenza dedotta dal solo codice.';
comment on table public.procurement_supplier_offers is 'Prezzi in centesimi, con frazioni di centesimo per i costi unitari. IVA e disponibilità restano nullable/sconosciute se non confermate.';
comment on table public.procurement_offer_history is 'Versioni storiche delle offerte; gli ordini referenziano la versione scelta e conservano il costo concordato.';
comment on table public.procurement_jobs is 'Compatibilità con il JSON dell’app: fine effettiva in data.completedDate, accettazione nella pratica records.data.acceptedDate.';
notify pgrst,'reload schema';
commit;
