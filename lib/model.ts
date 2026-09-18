export type Practice = {
 id:string; name:string; agent:string; state:string; measure:string; kind:'R'|'S'; source:'Excel'|'Leadora'|'Manuale';
 customerCode:string; contractCode:string; contactId:string; description:string; customerType:string; partner:string; list:string;
 power:number|null; storage:number|null; panel:string; battery:string; quantity:number|null;
 amount:number|null; probability:number|null; closeDate:string; marginDate:string; cost:number|null; commissionRate:number|null;
 historical:null|{contract:number; cost:number; margin:number; commission:number; secondMargin:number|null};
 revenues:{date:string;amount:number;number:string;sourceRow:number}[]; row:number|null; review:string[];
};
export type Invoice={id:string;number:string;date:string;dueDate:string;customerCode:string;customerName:string;contractCode:string;total:number;net:number;tax:number;balance:number|null;paid:boolean|null;practiceId:string|null;source:'Excel'|'Enerp';review:string[]};
export type Entity={id:string;kind:'practice'|'invoice'|'contact';data:Practice|Invoice|Record<string,unknown>;version:number};
export type Snapshot={entities:Entity[];events:{id:string;source:string;summary:string;createdAt:string}[];seedAvailable:boolean};
export const money=(cents:number|null|undefined)=>cents==null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(cents/100);
export const euro=(value:unknown):number|null=>{
 if(value==null||value==='')return null;
 let s=String(value).trim(); if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw new Error('Importo non valido: '+s);
 const neg=s.startsWith('-'); const [whole,dec='']=s.replace('-','').split('.');
 const cents=Number(whole)*100+Number(dec.padEnd(2,'0'));if(!Number.isSafeInteger(cents))throw new Error('Importo troppo grande');return neg?-cents:cents;
};
export function isoDate(value:unknown):string{if(value==null||value==='')return '';let s=String(value);if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){const [d,m,y]=s.split('/');s=`${y}-${m}-${d}`;}if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Data non valida');return s;}
export const blankPractice=(id:string):Practice=>({id,name:'',agent:'',state:'IN TRATTATIVA',measure:'',kind:'S',source:'Manuale',customerCode:'',contractCode:'',contactId:'',description:'',customerType:'',partner:'',list:'',power:null,storage:null,panel:'',battery:'',quantity:1,amount:null,probability:null,closeDate:'',marginDate:'',cost:null,commissionRate:8,historical:null,revenues:[],row:null,review:[]});
export function weighted(p:Practice){return p.amount==null||p.probability==null?null:Math.round(p.amount*p.probability/100);}
export function forecastDate(p:Practice){if(!p.closeDate)return '';const d=new Date(p.closeDate+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+35);return d.toISOString().slice(0,10);}
export function metrics(p:Practice){if(p.historical)return p.historical;const contract=weighted(p);const cost=p.cost??(contract==null?null:Math.round(contract*.8));const margin=contract==null||cost==null?null:contract-cost;const commission=contract==null||p.commissionRate==null?null:Math.round(contract*p.commissionRate/100);return {contract,cost,margin,commission,secondMargin:margin==null||commission==null?null:margin-commission};}
export function missing(p:Practice){return [!p.agent&&'Agente',!p.measure&&'Misura',p.probability==null&&'Probabilità',!p.description&&'Descrizione',!p.contractCode&&'Riferimento Enerp',...p.review].filter(Boolean) as string[];}
export function reportEntries(practices:Practice[],mode:'contract'|'revenue'|'margin'){
 return practices.flatMap(p=>{const m=metrics(p);const base={practiceId:p.id,measure:p.measure||'Da classificare',kind:p.kind};if(mode==='contract')return m.contract==null?[]:[{...base,date:p.closeDate,amount:m.contract}];if(mode==='margin')return m.margin==null?[]:[{...base,date:p.marginDate||forecastDate(p),amount:m.margin}];return p.historical?p.revenues.map(r=>({...base,date:r.date,amount:r.amount})):m.contract==null?[]:[{...base,date:forecastDate(p),amount:m.contract}];});
}
