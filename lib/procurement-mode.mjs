export function hostedReadOnly(){
 return process.env.PROCUREMENT_MODE==='read-only';
}
export function procurementReadOnly(){
 return hostedReadOnly()||(process.env.NODE_ENV!=='production'&&process.env.PROCUREMENT_LOCAL_PREVIEW==='1');
}
