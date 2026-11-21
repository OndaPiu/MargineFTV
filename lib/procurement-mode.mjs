export function hostedReadOnly(){
 return process.env.PROCUREMENT_MODE==='read-only'&&process.env.PROCUREMENT_JOBS_ENABLED!=='1';
}
export function procurementReadOnly(){
 return hostedReadOnly()||(process.env.NODE_ENV!=='production'&&process.env.PROCUREMENT_LOCAL_PREVIEW==='1');
}
