// The owner-private preview cannot receive anonymous CRM callbacks.
// Enable only after transport authentication and an accessible ingress are configured.
export async function POST(){return Response.json({error:'Collegamento automatico non attivo. Usare la prova autenticata nella sezione Collegamenti.'},{status:503});}
