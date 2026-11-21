'use client';
import {useState,type FormEvent} from 'react';
import {X} from 'lucide-react';
import type {Catalog,Offer} from '../../lib/procurement';

type Changes=Record<string,unknown>;
const priceText=(n:number|null|undefined)=>n==null?'':String(Number((n/100).toFixed(6))).replace('.',',');
function priceCents(value:string){
 const text=value.trim();if(!text)return null;
 if(!/^\d+(?:[.,]\d{1,6})?$/.test(text))throw new Error('Indica i prezzi senza separatori delle migliaia, con al massimo sei decimali.');
 const cents=Math.round(Number(text.replace(',','.'))*1e6)/1e4;
 if(!Number.isFinite(cents)||cents>1e12)throw new Error('Prezzo non valido.');return cents;
}
export default function OfferEditor({offer,catalog,canSave,onClose,onSave}:{offer:Offer;catalog:Catalog;canSave:boolean;onClose:()=>void;onSave:(offer:Offer,changes:Changes)=>Promise<void>}){
 const [fields,setFields]=useState(()=>({label:offer.label,code:offer.code,brand:offer.brand||'',description:offer.description,
  category:offer.category,section:offer.section,supplierId:offer.supplierId||'',documentId:offer.documentId,page:String(offer.page),unit:offer.unit,
  list:priceText(offer.listPriceCents),purchase:priceText(offer.purchasePriceCents),shipping:priceText(offer.shippingCents),
  priceBasis:offer.priceBasis||'',discount:offer.discountPercent===null?'':String(offer.discountPercent),
  vat:offer.vatIncluded===null?'unknown':offer.vatIncluded?'included':'excluded',validUntil:offer.validUntil||'',
  validity:offer.validityStatus,stock:offer.stockStatus,review:offer.review.join('\n'),verified:offer.verified}));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(key:keyof typeof fields,value:string|boolean)=>setFields(v=>({...v,[key]:value}));
 let computed:number|null=null;
 try{const list=priceCents(fields.list);const discount=Number(fields.discount.replace(',','.'));
  computed=fields.priceBasis==='net'?list:fields.priceBasis==='gross'&&list!==null&&fields.discount!==''&&Number.isFinite(discount)?Math.round(list*(1-discount/100)*10000)/10000:null;
 }catch{}
 async function submit(e:FormEvent){
  e.preventDefault();if(!canSave||busy)return;setBusy(true);setError('');
  try{
   const changes={label:fields.label.trim(),code:fields.code.trim(),brand:fields.brand.trim()||null,description:fields.description,
    category:fields.category.trim(),section:fields.section.trim(),supplierId:fields.supplierId||null,documentId:fields.documentId,
    page:Number(fields.page),unit:fields.unit.trim(),currency:'EUR',listPriceCents:priceCents(fields.list),
    purchasePriceCents:fields.priceBasis?computed:priceCents(fields.purchase),shippingCents:priceCents(fields.shipping),
    priceBasis:fields.priceBasis||null,discountPercent:fields.discount===''?null:Number(fields.discount.replace(',','.')),
    vatIncluded:fields.vat==='unknown'?null:fields.vat==='included',validUntil:fields.validUntil||null,
    validityStatus:fields.validity,stockStatus:fields.stock,review:fields.review.split('\n').map(s=>s.trim()).filter(Boolean),verified:fields.verified};
   await onSave(offer,changes);
  }catch(e){setError(e instanceof Error?e.message:'Modifica non salvata.');}finally{setBusy(false);}
 }
 const input=(key:keyof typeof fields,label:string,options:Record<string,unknown>={})=><label>{label}<input value={String(fields[key])} onChange={e=>set(key,e.target.value)} {...options}/></label>;
 return <div className="p-overlay"><section role="dialog" aria-modal="true" aria-labelledby="offer-editor-title" className="p-dialog p-offer-editor">
  <button className="p-close" aria-label="Chiudi modifica prodotto" disabled={busy} onClick={onClose}><X/></button>
  <p className="p-kicker">CATALOGO / MODIFICA SCHEDA</p><h2 id="offer-editor-title">Modifica prodotto</h2>
  <p>Le modifiche aggiornano la voce nel catalogo condiviso e conservano lo storico dei prezzi.</p>
  {!canSave&&<p className="p-warning">Puoi verificare i campi. Il salvataggio del catalogo non è ancora abilitato in questo ambiente.</p>}
  <form onSubmit={submit}><fieldset disabled={busy} className="p-offer-fields">
   <h3>Prodotto e fornitore</h3><div className="p-editor-grid">
    {input('label','Nome prodotto',{required:true,maxLength:500})}{input('code','Sigla / codice articolo',{maxLength:300})}
    {input('brand','Marca',{list:'catalog-brands',maxLength:200})}<datalist id="catalog-brands">{[...new Set(catalog.offers.map(o=>o.brand).filter(Boolean))].map(b=><option key={b} value={b!}/>)}</datalist>
    <label>Fornitore<select value={fields.supplierId} onChange={e=>set('supplierId',e.target.value)}><option value="">Da identificare</option>{catalog.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {input('category','Categoria',{list:'catalog-categories',maxLength:300})}<datalist id="catalog-categories">{[...new Set(catalog.offers.map(o=>o.category))].map(c=><option key={c} value={c}/>)}</datalist>
    {input('section','Sezione del listino',{maxLength:300})}{input('unit','Unità di vendita',{required:true,maxLength:100})}
   </div><label className="p-edit-description">Descrizione e caratteristiche<textarea rows={5} value={fields.description} maxLength={12000} onChange={e=>set('description',e.target.value)}/></label>
   <h3>Prezzi e condizioni</h3><p className="p-caption">Tutti gli importi sono in euro. Lascia vuoto un prezzo non conosciuto; lo zero indica un costo pari a zero.</p>
   <div className="p-editor-grid"><label>Tipo prezzo<select value={fields.priceBasis} onChange={e=>{set('priceBasis',e.target.value);if(e.target.value==='net')set('discount','0');}}><option value="">Da verificare / costo diretto</option><option value="net">Netto invariato</option><option value="gross">Lordo con sconto</option></select></label>
    {input('list','Prezzo di listino (€)',{inputMode:'decimal'})}
    {input('discount','Sconto (%)',{inputMode:'decimal',disabled:fields.priceBasis!=='gross'})}
    {fields.priceBasis?<label>Prezzo di acquisto calcolato (€)<input readOnly value={priceText(computed)}/></label>:input('purchase','Prezzo di acquisto (€)',{inputMode:'decimal'})}
    {input('shipping','Trasporto (€)',{inputMode:'decimal'})}
    <label>IVA<select value={fields.vat} onChange={e=>set('vat',e.target.value)}><option value="unknown">Da confermare</option><option value="excluded">IVA esclusa</option><option value="included">IVA inclusa</option></select></label>
    <label>Validità offerta<select value={fields.validity} onChange={e=>set('validity',e.target.value)}><option value="to-confirm">Da confermare</option><option value="dated">Con scadenza</option></select></label>
    {input('validUntil','Scadenza offerta',{type:'date',required:fields.validity==='dated'})}
    <label>Disponibilità<select value={fields.stock} onChange={e=>set('stock',e.target.value)}><option value="unknown">Da confermare</option><option value="while-stocks-last">Fino a esaurimento scorte</option><option value="available">Disponibile</option><option value="unavailable">Non disponibile</option></select></label>
   </div><h3>Origine e verifica</h3><div className="p-editor-grid"><label>Listino di origine<select value={fields.documentId} onChange={e=>{set('documentId',e.target.value);set('page','1');}}>{catalog.documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    {input('page','Pagina del listino',{type:'number',min:1,max:catalog.documents.find(d=>d.id===fields.documentId)?.pages,required:true})}
   </div><label className="p-edit-description">Avvertenze e dati da verificare (una voce per riga)<textarea rows={4} value={fields.review} onChange={e=>set('review',e.target.value)}/></label>
   <label className="p-check"><input type="checkbox" checked={fields.verified} onChange={e=>set('verified',e.target.checked)}/>Dati della scheda controllati</label>
   {error&&<p role="alert" className="p-error">{error}</p>}
   <div className="p-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Annulla</button><button type="submit" className="p-primary" disabled={busy||!canSave}>{busy?'Salvataggio…':'Salva modifiche'}</button></div>
  </fieldset></form>
 </section></div>;
}
