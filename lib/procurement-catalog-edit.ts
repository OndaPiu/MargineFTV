import {z} from 'zod';
const money=z.number().finite().min(0).max(1e12).refine(v=>Math.abs(v*10000-Math.round(v*10000))<0.01,'Usa al massimo quattro decimali nei centesimi.').nullable();
const isoDate=z.string().refine(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v).nullable();
export const offerChanges=z.object({
 label:z.string().trim().min(1).max(500),code:z.string().trim().max(300),brand:z.string().trim().min(1).max(200).nullable(),
 description:z.string().max(12000),category:z.string().trim().max(300),section:z.string().trim().max(300),
 supplierId:z.string().min(1).max(300).nullable(),documentId:z.string().min(1).max(300),page:z.number().int().min(1).max(100000),
 unit:z.string().trim().min(1).max(100),currency:z.literal('EUR'),listPriceCents:money,purchasePriceCents:money,shippingCents:money,
 priceBasis:z.enum(['gross','net']).nullable(),discountPercent:z.number().finite().min(0).max(100).nullable(),
 vatIncluded:z.boolean().nullable(),validUntil:isoDate,validityStatus:z.enum(['dated','to-confirm']),
 stockStatus:z.enum(['unknown','while-stocks-last','available','unavailable']),review:z.array(z.string().trim().min(1).max(1000)).max(50),verified:z.boolean(),
}).strict().superRefine((v,ctx)=>{
 if(v.priceBasis==='net'&&v.listPriceCents!==v.purchasePriceCents)ctx.addIssue({code:'custom',path:['purchasePriceCents'],message:'Con prezzo netto, listino e acquisto devono coincidere.'});
 if(v.priceBasis==='gross'&&v.listPriceCents!==null&&v.purchasePriceCents!==null&&(v.discountPercent===null||Math.abs(v.purchasePriceCents-v.listPriceCents*(1-v.discountPercent/100))>0.0001))ctx.addIssue({code:'custom',path:['purchasePriceCents'],message:'Il prezzo di acquisto non corrisponde allo sconto.'});
 if(v.validityStatus==='dated'&&!v.validUntil)ctx.addIssue({code:'custom',path:['validUntil'],message:'Indica la scadenza oppure validità da confermare.'});
});
export const offerMutation=z.object({
 id:z.string().min(1).max(300),expected:z.record(z.string(),z.unknown()),
 changes:z.union([offerChanges,z.object({active:z.boolean()}).strict()]),
}).strict();

export function catalogEditingEnabled(){
 return process.env.PROCUREMENT_CATALOG_EDIT_ENABLED==='1'
  &&!(process.env.NODE_ENV!=='production'&&process.env.PROCUREMENT_LOCAL_PREVIEW==='1')
  &&!process.env.PROCUREMENT_CATALOG_GZIP_BASE64
  &&Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
}
