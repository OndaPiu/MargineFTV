import type {Entity} from './model';
type Row={id:string;kind:Entity['kind'];data:Record<string,unknown>;version:number};
const url=()=>process.env.SUPABASE_URL?.replace(/\/$/,''); const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
export const isConfigured=()=>Boolean(url()&&key());
async function request(path:string,init:RequestInit={}){const base=url();const k=key();if(!base||!k)throw new Error('Supabase non configurato. Inserisci le variabili dell’app.');const headers=new Headers(init.headers);headers.set('apikey',k);headers.set('Authorization',`Bearer ${k}`);headers.set('Content-Type','application/json');const res=await fetch(`${base}/rest/v1/${path}`,{...init,headers,cache:'no-store'});if(!res.ok){const detail=await res.text();throw new Error(`Supabase ha restituito un errore (${res.status})${detail?': '+detail.slice(0,500):''}.`)};return res.status===204?null:res.json()}
export async function allRecords(){return await request('records?select=id,kind,data,version&order=id.asc') as Row[]}
export async function allEvents(){return await request('events?select=id,source,summary,created_at&order=created_at.desc&limit=20') as {id:string;source:string;summary:string;created_at:string}[]}
export async function getSetting(name:string){const rows=await request(`settings?select=value&key=eq.${encodeURIComponent(name)}&limit=1`) as {value:string}[];return rows[0]?.value??null}
export async function upsertRecords(rows:Row[]){if(rows.length)await request('records?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)})}
export async function insertEvent(source:string,summary:string){await request('events',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:crypto.randomUUID(),source,summary,created_at:new Date().toISOString()})})}
export async function setSetting(name:string,value:string){await request('settings?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({key:name,value})})}
export async function getRecord(id:string){const rows=await request(`records?select=id,kind,data,version&id=eq.${encodeURIComponent(id)}&limit=1`) as Row[];return rows[0]??null}
export async function saveRecord(row:Row,expectedVersion?:number){const current=await getRecord(row.id);if(expectedVersion!=null&&(current?.version??0)!==expectedVersion)throw new Error('La pratica è cambiata. Ricarica prima di salvare.');const next={...row,version:(current?.version??0)+1};await upsertRecords([next]);return next}

export async function deleteRecord(id:string){await request(`records?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}})}

