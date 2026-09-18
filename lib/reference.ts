// Saved Excel pivot values inspected on 17 September 2026; cents throughout.
export const measures=['Agrisolare','Conto Termico','Conto Termico 3,0','FTV','FTV promo','Iperammortamento','Solare Termico'];
const raw:{mode:'contract'|'revenue'|'margin';measure:string;values:[string,number][] }[]=[
{mode:'contract',measure:'Agrisolare',values:[['2024-10',64508],['2026-03',197504],['2027',69000]]},
{mode:'contract',measure:'Conto Termico',values:[['2026-10',38500]]},
{mode:'contract',measure:'Conto Termico 3,0',values:[['2026-10',27500]]},
{mode:'contract',measure:'FTV',values:[['2026-01',7500],['2026-09',126442],['2026-10',69795],['2026-11',137700]]},
{mode:'contract',measure:'FTV promo',values:[['2026-02',37500],['2026-04',45000],['2026-11',15000],['2026-12',78057]]},
{mode:'contract',measure:'Iperammortamento',values:[['2026-09',60000],['2026-10',35700]]},
{mode:'contract',measure:'Solare Termico',values:[['2026-05',2239],['2026-12',6450]]},
{mode:'revenue',measure:'Agrisolare',values:[['2026-04',25806],['2026-06',38702],['2026-09',197504],['2027',69000]]},
{mode:'revenue',measure:'Conto Termico',values:[['2026-11',38500]]},
{mode:'revenue',measure:'Conto Termico 3,0',values:[['2026-11',27500]]},
{mode:'revenue',measure:'FTV',values:[['2026-02',7500],['2026-10',126442],['2026-11',69795],['2026-12',137700]]},
{mode:'revenue',measure:'FTV promo',values:[['2026-02',37500],['2026-04',22500],['2026-08',22500],['2026-12',15000],['2027',78057]]},
{mode:'revenue',measure:'Iperammortamento',values:[['2026-10',60000],['2026-11',35700]]},
{mode:'revenue',measure:'Solare Termico',values:[['2026-05',2239],['2027',6450]]},
{mode:'margin',measure:'Agrisolare',values:[['2026-06',14045.92],['2026-12',38969],['2027',13800]]},
{mode:'margin',measure:'Conto Termico',values:[['2026-11',7700]]},
{mode:'margin',measure:'Conto Termico 3,0',values:[['2026-09',5500]]},
{mode:'margin',measure:'FTV',values:[['2026-02',910.18],['2026-09',1300],['2026-10',25288.4],['2026-11',12659],['2026-12',27540]]},
{mode:'margin',measure:'FTV promo',values:[['2026-02',4550.9],['2026-08',5461.08],['2026-12',3000],['2027',15611.4]]},
{mode:'margin',measure:'Iperammortamento',values:[['2026-10',12000],['2026-11',7140]]},
{mode:'margin',measure:'Solare Termico',values:[['2026-05',670],['2027',1290]]},
];
export const reference=raw.flatMap(r=>r.values.map(([date,amount])=>({mode:r.mode,measure:r.measure,date,amount:Math.round(amount*100)})));
