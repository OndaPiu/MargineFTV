import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
const COOKIE='procurement_session';
function password(){return process.env.PROCUREMENT_ACCESS_PASSWORD||'';}
function sign(value:string){return createHmac('sha256',password()).update(value).digest('hex');}
export function authConfigured(){return password().length>=16;}
export function correctPassword(value:string){
 if(!authConfigured())return false;
 return timingSafeEqual(createHash('sha256').update(value).digest(),createHash('sha256').update(password()).digest());
}
export function sessionCookie(){
 const payload=String(Date.now()+8*60*60*1000)+'.'+randomBytes(24).toString('hex');
 return COOKIE+'='+payload+'.'+sign(payload)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800'+(process.env.NODE_ENV==='production'?'; Secure':'');
}
export function clearSessionCookie(){return COOKIE+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(process.env.NODE_ENV==='production'?'; Secure':'');}
export function authorized(req:Request){
 if(!authConfigured())return false;
 const raw=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!raw)return false;
 const [expires,nonce,signature,...extra]=raw.split('.');
 if(extra.length||!/^\d+$/.test(expires)||!/^([a-f0-9]{48})$/.test(nonce||'')||!/^([a-f0-9]{64})$/.test(signature||''))return false;
 if(Number(expires)<=Date.now()||Number(expires)>Date.now()+8*60*60*1000)return false;
 return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(expires+'.'+nonce),'hex'));
}
export function sameOrigin(req:Request){
 const url=new URL(req.url);
 // Next may normalize req.url to localhost behind a local or hosting proxy.
 // Host is the actual destination selected by the browser.
 const expected=url.protocol+'//'+(req.headers.get('host')||url.host);
 return req.headers.get('origin')===expected;
}
const attempts=new Map<string,{count:number;until:number}>();
export function allowLogin(req:Request){
 const key=req.headers.get('x-forwarded-for')?.split(',')[0]||'local';
 const now=Date.now();for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
 const entry=attempts.get(key)||{count:0,until:now+15*60*1000};
 entry.count++;attempts.set(key,entry);
 return entry.count<=10;
}
