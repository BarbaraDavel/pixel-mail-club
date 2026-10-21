import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararCorreo,safeTrackingUrl,EMAILS_ENABLED} from '../emails/templates.js';
import {crearIntegracion,detectarEventos} from '../server/email-events.js';
const fixture={nombre:'Ana Pérez',apodo:'Anita',email:'ana@example.com',edicionId:'001',edicion:'Cartitas bajo el árbol',cantidad:2,precioUnitario:11000,subtotal:22000,costoEnvio:3000,total:25000,venceEn:'2026-12-03T18:30:00Z',pagoVerificadoEn:'2026-12-02T10:00:00Z',fechaDespacho:'2026-12-05',correo:'Andreani',seguimiento:'ABC123',urlSeguimiento:'https://www.andreani.com/seguimiento?numero=ABC123'};
test('cuatro HTML responsive con texto alternativo y datos ficticios',()=>{
 for(const type of ['solicitud','reserva','pago','despacho']){
  const m=prepararCorreo(type,fixture);
  assert.match(m.html,/viewport/);assert.match(m.html,/@media/);assert.match(m.html,/zorrito.png/);
  assert.match(m.text,/Anita/);assert.match(m.html,/Cartitas bajo el árbol/);
 }
 assert.match(prepararCorreo('solicitud',fixture).text,/todavía no está reservado/);
 const reservation=prepararCorreo('reserva',fixture);
 assert.match(reservation.text,/15:30:00/);assert.match(reservation.text,/48 horas/);
 assert.match(reservation.text,/25.000/);assert.match(reservation.text,/no están habilitados/);
 assert.doesNotMatch(prepararCorreo('reserva',{...fixture,instruccionesPago:'SECRETO'}).text,/SECRETO/);
 assert.match(prepararCorreo('reserva',{...fixture,pagosHabilitados:true,instruccionesPago:'Alias de prueba'}).text,/Alias de prueba/);
 assert.match(prepararCorreo('pago',fixture).text,/recibimos y confirmamos tu pago/);
 assert.match(prepararCorreo('despacho',fixture).html,/href="https:\/\/www.andreani.com/);
 assert.match(prepararCorreo('reserva',{...fixture,costoEnvio:null,total:null}).text,/A confirmar/);
});

test('logística dinámica, costos a cargo del comprador y edición sin emojis navideños fijos',()=>{
 const reserva=prepararCorreo('reserva',fixture);
 assert.match(reserva.text,/a cargo del comprador/);
 assert.match(reserva.text,/48 horas/);
 assert.match(reserva.html,/zorrito.png/);
 assert.doesNotMatch(reserva.subject,/🎄/);
 for(const correo of ['Correo Argentino','Andreani','OCA']){
  const m=prepararCorreo('despacho',{...fixture,correo});
  assert.match(m.text,new RegExp(correo));
  assert.match(m.text,/ABC123/);
  assert.match(m.subject,/en camino/);
 }
 const retiro=prepararCorreo('despacho',{...fixture,correo:'Retiro en Posadas',fechaDespacho:null,seguimiento:null,urlSeguimiento:null,indicacionesRetiro:'Coordinar horario por WhatsApp'});
 assert.match(retiro.subject,/lista para retirar/);
 assert.match(retiro.text,/Coordinar horario por WhatsApp/);
 assert.doesNotMatch(retiro.text,/Seguimiento|Fecha de despacho/);
 assert.doesNotMatch(retiro.html,/Seguí tu envío/);
 const sinCodigo=prepararCorreo('despacho',{...fixture,correo:'OCA',seguimiento:null,urlSeguimiento:null});
 assert.doesNotMatch(sinCodigo.text,/Seguimiento:/);
});
test('escapa contenido y descarta enlaces peligrosos; valida datos requeridos',()=>{
 assert.doesNotMatch(prepararCorreo('solicitud',{...fixture,apodo:'<script>alert(1)</script>'}).html,/<script>/);
 for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','mal'])assert.equal(safeTrackingUrl(url),null);
 assert.doesNotMatch(prepararCorreo('despacho',{...fixture,urlSeguimiento:'javascript:alert(1)'}).html,/href=/);
 assert.throws(()=>prepararCorreo('pago',{...fixture,pagoVerificadoEn:null}),/verificación/);
 assert.throws(()=>prepararCorreo('reserva',{...fixture,venceEn:'mal'}),/Fecha/);
 assert.throws(()=>prepararCorreo('despacho',{...fixture,correo:''}),/correo/);
});
function fakeDb(){
 const records=new Map();let lock=Promise.resolve();
 return {records,collection:()=>({doc:id=>({id})}),runTransaction(fn){
  const pending=lock.then(()=>fn({get:async ref=>({exists:()=>records.has(ref.id)}),create:(ref,value)=>{records.set(ref.id,value);}}));
  lock=pending.catch(()=>{});return pending;
 }};
}
test('transiciones y reintentos concurrentes generan un registro, sin envío',async()=>{
 const db=fakeDb(),service=crearIntegracion({db});
 const cases=[['solicitudes',null,{...fixture,estado:'NUEVA_CONSULTA'}],['reservas',null,{...fixture,cliente:fixture,estado:'PENDIENTE_PAGO'}],['reservas',{estado:'PENDIENTE_PAGO'},{...fixture,cliente:fixture,estado:'CONFIRMADA'}],['reservas',{estado:'CONFIRMADA',preparacion:'LISTA'},{...fixture,cliente:fixture,estado:'CONFIRMADA',preparacion:'DESPACHADA'}]];
 for(const [collection,before,after] of cases){
  const event={collection,id:'ficticio',before,after};
  await Promise.all([service.onDocumentWritten(event),service.onDocumentWritten(event)]);
 }
 assert.equal(db.records.size,4);
 for(const [key,row] of db.records){assert.equal(row.status,'PREPARED_DISABLED');assert.equal(row.attempts,0);assert.equal(row.sentAt,null);assert.ok(row.createdAt);assert.match(row.result,/desactivado/);assert.deepEqual(await service.procesar(key),{status:'DISABLED',sent:false});}
 assert.equal(EMAILS_ENABLED,false);
 assert.deepEqual(detectarEventos('reservas',{estado:'CONFIRMADA'},{estado:'CONFIRMADA'}),[]);
 assert.deepEqual(detectarEventos('solicitudes',fixture,null),[]);
});
test('bloquea 999, faltantes de destinatario y despacho incompleto',async()=>{
 const db=fakeDb(),service=crearIntegracion({db});
 for(const [id,data] of [['test',{...fixture,edicionId:'999'}],['missing',{...fixture,email:null}]])await service.onDocumentWritten({collection:'solicitudes',id,before:null,after:{...data,estado:'NUEVA_CONSULTA'}});
 assert.equal(db.records.size,2);for(const row of db.records.values()){assert.equal(row.status,'BLOCKED');assert.equal(row.message,null);}
});
