/** Normalize display decorations while keeping the actual stage label exact.
 * @param {unknown} value
 */
export function normalizeCommercialLabel(value){
 return String(value??'').normalize('NFKC').replace(/^[^\p{L}\p{N}]+/gu,'')
  .trim().toLocaleLowerCase('it').replace(/\s+/g,' ');
}
/** @param {unknown} value */
export function isAcceptedStage(value){
 return normalizeCommercialLabel(value)==='preventivo accettato';
}
