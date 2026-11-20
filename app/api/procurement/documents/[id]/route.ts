import {authorized} from '../../../../../lib/procurement-auth';
import {sourceDocument} from '../../../../../lib/procurement-store';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'no-store, private','Vary':'Cookie'};
 if(!authorized(req))return new Response('Accesso richiesto',{status:401,headers});
 const {id}=await params;const file=await sourceDocument(id);
 if(!file)return new Response('Documento non disponibile in questo ambiente',{status:404,headers});
 return new Response(new Uint8Array(file.bytes),{headers:{...headers,'Content-Type':file.name.endsWith('.pdf')?'application/pdf':'image/jpeg','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
}