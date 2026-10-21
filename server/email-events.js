import {createHash} from 'node:crypto';
import {prepararCorreo,EMAILS_ENABLED} from '../emails/templates.js';

// Adaptador para un futuro trigger Firestore onDocumentWritten. No registrado ni desplegado.
export function detectarEventos(collection,before,after){
 if(!after)return [];
 if(collection==='solicitudes')return !before&&after.estado==='NUEVA_CONSULTA'?['solicitud']:[];
 if(collection!=='reservas')return [];
 const events=[];
 if(after.estado==='PENDIENTE_PAGO'&&(!before||before.estado==='PENDIENTE_COTIZACION'))events.push('reserva');
 if(before&&before.estado!=='CONFIRMADA'&&after.estado==='CONFIRMADA')events.push('pago');
 if(before&&before.preparacion!=='DESPACHADA'&&after.preparacion==='DESPACHADA'&&after.estado==='CONFIRMADA')events.push('despacho');
 return events;
}
export function crearIntegracion({db,now=()=>new Date().toISOString()}){
 return {
  async onDocumentWritten({collection,id,before,after,edition={}}){
   const results=[];
   for(const event of detectarEventos(collection,before,after)){
    // Una notificación por documento y hito. No depende del ID de entrega del trigger.
    const key=createHash('sha256').update(collection+'/'+id+':'+event).digest('hex');
    const ref=db.collection('emailOutbox').doc(key);
    const client=collection==='solicitudes'?after:after.cliente;
    const recipient=client?.email;
    let message=null,error=null;
    try{
     if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient??'')||/[\r\n]/.test(recipient))throw Error('Destinatario ausente o inválido');
     if(after.edicionId==='999')throw Error('Edición de prueba: sin envío');
     message=prepararCorreo(event,{...after,...client,edicion:after.edicionNombre||edition.nombre||after.edicionId,
      pagosHabilitados:edition.pagosHabilitados===true,instruccionesPago:edition.instruccionesPago});
    }catch(e){error=e.message;}
    await db.runTransaction(async tx=>{
     if((await tx.get(ref)).exists())return;
     tx.create(ref,{event,source:collection+'/'+id,edicionId:after.edicionId,recipient:recipient??null,
      message,status:error?'BLOCKED':'PREPARED_DISABLED',createdAt:now(),updatedAt:now(),sentAt:null,
      attempts:0,result:error||'Envío desactivado; pendiente de revisión'});
    });
    results.push(key);
   }
   return results;
  },
  async procesar(key){
   // Interruptor de código cerrado: ni variables de entorno ni un documento lo habilitan.
   if(!EMAILS_ENABLED)return {status:'DISABLED',sent:false};
   throw Error('No hay proveedor de envío activado: requiere implementación y autorización.');
  }
 };
}
