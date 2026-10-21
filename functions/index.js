import {initializeApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {defineBoolean,defineSecret} from 'firebase-functions/params';
import {google} from 'googleapis';
import {prepararCorreo,EMAILS_ENABLED} from './templates.js';

initializeApp();
const db=getFirestore();
const enabled=defineBoolean('EMAILS_ENABLED',{default:false});
const clientId=defineSecret('GMAIL_CLIENT_ID');
const clientSecret=defineSecret('GMAIL_CLIENT_SECRET');
const refreshToken=defineSecret('GMAIL_REFRESH_TOKEN');
const ADMIN_UIDS=new Set(['aDYubwS1BnXvMKKPbLiB0tLI5wz1','LSf6e03U0xfPDVG3Wmam9BXuAm13']);
const EVENTS=new Set(['solicitud','reserva','pago','despacho']);
const fail=(code,message)=>{throw new HttpsError(code,message);};
const str=v=>String(v??'').trim();
function emailAddress(d){return str(d.cliente?.email||d.email).toLowerCase();}
function emailData(event,d,editionName){
 const c=d.cliente||{};
 return {
  nombre:str(c.nombre||d.nombre||d.referencia),
  apodo:str(c.apodo||d.apodo||d.referencia),
  email:emailAddress(d),
  edicion:str(d.edicionNombre||editionName||d.edicionId),
  cantidad:d.cantidad,
  precioUnitario:d.precioUnitario,
  subtotal:d.subtotal,
  costoEnvio:d.costoEnvio,
  total:d.total,
  estado:d.estado,
  venceEn:d.venceEn,
  pagosHabilitados:d.pagosHabilitados===true,
  instruccionesPago:d.instruccionesPago,
  pagoVerificadoEn:d.pagoVerificadoEn,
  correo:str(d.transportista||d.correo||d.empresaLogistica||''),
  modalidadEntrega:str(c.entrega||d.modalidadEntrega||''),
  fechaDespacho:d.fechaDespacho,
  seguimiento:d.seguimiento,
  urlSeguimiento:d.urlSeguimiento,
  indicacionesRetiro:d.indicacionesRetiro
 };
}
function rawMessage(to,subject,text,html){
 const enc=s=>Buffer.from(s,'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const from='Pixel Mail Club <pixel.stickersss@gmail.com>';
 const safeSubject='=?UTF-8?B?'+Buffer.from(subject,'utf8').toString('base64')+'?=';
 return enc('From: '+from+'\r\nTo: '+to+'\r\nSubject: '+safeSubject+'\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="pixel-mail-club-boundary"\r\n\r\n--pixel-mail-club-boundary\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'+text+'\r\n--pixel-mail-club-boundary\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n'+html+'\r\n--pixel-mail-club-boundary--');
}
async function sourceRecord(event,id){
 if(event==='solicitud'){
  const ref=db.collection('solicitudes').doc(id),snap=await ref.get();
  if(!snap.exists)fail('not-found','No se encontró la solicitud.');
  const d=snap.data();
  if(!['NUEVA_CONSULTA','CONTACTADA'].includes(d.estado))fail('failed-precondition','La solicitud no está en un estado que permita enviar confirmación.');
  const edition=await db.collection('ediciones').doc(str(d.edicionId)).get();
  return {ref,data:{...d,edicionNombre:edition.exists?edition.data().nombre:d.edicionId}};
 }
 const ref=db.collection('reservas').doc(id),snap=await ref.get();
 if(!snap.exists)fail('not-found','No se encontró la reserva.');
 const d=snap.data();
 if(event==='reserva'&&!['PENDIENTE_COTIZACION','PENDIENTE_PAGO'].includes(d.estado))fail('failed-precondition','La reserva no está pendiente.');
 if(event==='pago'&&!(d.estado==='CONFIRMADA'&&d.pagoVerificadoEn))fail('failed-precondition','Solo se puede notificar un pago ya verificado por administración.');
 if(event==='despacho'&&!(d.estado==='CONFIRMADA'&&d.preparacion==='DESPACHADA'))fail('failed-precondition','Marcá el pedido como despachado antes de notificarlo.');
 return {ref,data:d};
}
export const enviarCorreoMailClub=onCall({region:'southamerica-east1',secrets:[clientId,clientSecret,refreshToken],enforceAppCheck:true},async request=>{
 if(!request.auth||!ADMIN_UIDS.has(request.auth.uid)||request.auth.token.firebase?.sign_in_provider==='anonymous')fail('permission-denied','Solo una cuenta administradora puede solicitar correos.');
 if(!enabled.value()||!EMAILS_ENABLED)fail('failed-precondition','Los envíos automáticos siguen desactivados.');
 const event=str(request.data?.evento),id=str(request.data?.documentoId);
 if(!EVENTS.has(event)||!id||id.length>180||/[\/\\]/.test(id))fail('invalid-argument','Evento o identificador inválido.');
 const {ref,data}=await sourceRecord(event,id);
 const to=emailAddress(data);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))fail('failed-precondition','El documento no contiene un correo válido.');
 const eventId=event+'_'+id;
 const dispatchRef=db.collection('emailDispatches').doc(eventId);
 const existing=await dispatchRef.get();
 if(existing.exists&&existing.data().status==='SENT')return {sent:false,duplicate:true,message:'Este correo ya figura como enviado.'};
 if(existing.exists&&existing.data().status==='SENDING')fail('already-exists','El envío ya está en curso; revisá el registro antes de reintentar.');
 await dispatchRef.set({event,documentId:id,status:'SENDING',recipient:to,requestedBy:request.auth.uid,updatedAt:FieldValue.serverTimestamp()},{merge:true});
 try{
  const messageData=emailData(event,data,data.edicionNombre);
  const rendered=prepararCorreo(event,messageData);
  const auth=new google.auth.OAuth2(clientId.value(),clientSecret.value(),'http://localhost');
  auth.setCredentials({refresh_token:refreshToken.value()});
  const gmail=google.gmail({version:'v1',auth});
  const result=await gmail.users.messages.send({userId:'me',requestBody:{raw:rawMessage(to,rendered.subject,rendered.text,rendered.html)}});
  await dispatchRef.set({status:'SENT',gmailMessageId:result.data.id||null,sentAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {sent:true,event,message:'Correo enviado.'};
 }catch(error){
  await dispatchRef.set({status:'ERROR',errorCode:str(error.code||error.status||'send-failed').slice(0,80),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  console.error('Mail Club email send failed',event,id,error.message);
  throw new HttpsError('internal','No se pudo enviar el correo. Revisá el registro administrativo antes de reintentar.');
 }
});
