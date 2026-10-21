import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
import {validarSolicitud} from '../solicitudes-validation.js';
import {crearGestion,ADMIN_UIDS,validarEdicion} from '../admin-operations.js';
const ADMIN_UID=ADMIN_UIDS[0];
let env,db,ops;
const clock=Date.parse('2026-10-21T15:00:00Z');
const edition={estado:'borrador',nombre:'Cartitas',periodo:'Diciembre 2026',descripcion:'Navidad',contenido:['Carta'],precio:5000,cupos:10,cuposReservados:0,versionGestion:0};
const request={uid:'a',edicionId:'001',nombre:'Ana',apodo:'Anita',email:'ana@example.com',telefono:'3764123456',cantidad:2,entrega:'domicilio',direccion:'Calle 123',localidad:'Posadas',provincia:'Misiones',codigoPostal:'3300',comunicaciones:false,estado:'CONTACTADA'};
const raw={id:'001',...edition,contenido:'Carta\nPostal'};
const makeOps=(user,firestore=db)=>crearGestion({db:firestore,doc,collection,runTransaction,serverTimestamp,Timestamp,currentUser:()=>user,now:()=>clock});
const value=async(path,id)=>(await getDoc(doc(db,path,id))).data();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pixel-mail-club',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
beforeEach(async()=>{
 await env.clearFirestore();db=env.authenticatedContext(ADMIN_UID,{firebase:{sign_in_provider:'password'}}).firestore();ops=makeOps({uid:ADMIN_UID,isAnonymous:false});
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'ediciones','001'),edition);
  await setDoc(doc(ctx.firestore(),'solicitudes','001_a'),{...request,creadaEn:serverTimestamp()});
 });
});
after(async()=>{await env?.cleanup();});
test('dos conversiones simultáneas producen una sola reserva y un solo descuento',async()=>{
 const outcomes=await Promise.allSettled([ops.reservarSolicitud('001_a'),ops.reservarSolicitud('001_a')]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await getDocs(collection(db,'reservas'))).size,1);
 assert.equal((await value('ediciones','001')).cuposReservados,2);
 const r=await value('reservas','solicitud_001_a');
 assert.equal(r.cliente.email,request.email);assert.equal(r.subtotal,10000);
 assert.equal(r.venceEn.toMillis(),clock+48*3600000);assert.equal(r.estado,'PENDIENTE_PAGO');
 assert.equal((await value('ediciones','001')).estado,'borrador');
});
test('concurrencia entre solicitudes respeta los últimos cupos',async()=>{
 await updateDoc(doc(db,'ediciones','001'),{cupos:3});
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'solicitudes','001_b'),{...request,uid:'b'}));
 const results=await Promise.allSettled([ops.reservarSolicitud('001_a'),ops.reservarSolicitud('001_b')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await value('ediciones','001')).cuposReservados,2);
});
test('sin precio, cupo o solicitud activa no se crea ni se descuenta',async()=>{
 for(const patch of [{precio:0},{precio:5000,cuposReservados:10}]){
  await updateDoc(doc(db,'ediciones','001'),patch);
  await assert.rejects(ops.reservarSolicitud('001_a'));
  assert.equal((await getDocs(collection(db,'reservas'))).size,0);
 }
 await updateDoc(doc(db,'ediciones','001'),{precio:5000,cuposReservados:0});
 await updateDoc(doc(db,'solicitudes','001_a'),{estado:'ARCHIVADA',actualizadaEn:serverTimestamp()});
 await assert.rejects(ops.reservarSolicitud('001_a'),/Reactivá/);
});
test('guardar borrador conserva contador y estado, valida cupos y versión',async()=>{
 await ops.reservarSolicitud('001_a');
 await assert.rejects(ops.guardarEdicion({...raw,cupos:1},0),/menores/);
 await ops.guardarEdicion({...raw,nombre:'Nombre nuevo',precio:6000},0);
 const e=await value('ediciones','001');assert.equal(e.estado,'borrador');assert.equal(e.cuposReservados,2);assert.equal(e.precio,6000);
 assert.equal((await value('reservas','solicitud_001_a')).subtotal,10000);
 await assert.rejects(ops.guardarEdicion(raw,0),/cambió/);
 await assert.rejects(ops.guardarEdicion(raw,null),/ya existe/);
});
test('nueva edición solo borrador y no sobrescribe una existente',async()=>{
 await ops.guardarEdicion({...raw,id:'002'},null);
 const e=await value('ediciones','002');assert.equal(e.estado,'borrador');assert.equal(e.cuposReservados,0);
 await updateDoc(doc(db,'ediciones','001'),{estado:'publicada'});
 await assert.rejects(ops.guardarEdicion(raw,0),/borrador/);
 for(const patch of [{precio:'1.2'},{cupos:'0'},{contenido:''},{id:'../'},{precio:''}])assert.throws(()=>validarEdicion({...raw,...patch}));
});
test('confirmar pago requiere verificación, envío y vigencia; no vuelve a descontar',async()=>{
 await ops.reservarSolicitud('001_a');
 await assert.rejects(ops.cambiarReserva('solicitud_001_a','CONFIRMADA'),/verific/i);
 await assert.rejects(ops.cambiarReserva('solicitud_001_a','CONFIRMADA',{verificado:true,costoEnvio:''}),/Completá/);
 await ops.cambiarReserva('solicitud_001_a','CONFIRMADA',{verificado:true,costoEnvio:1500});
 const r=await value('reservas','solicitud_001_a');
 assert.equal(r.estado,'CONFIRMADA');assert.equal(r.total,11500);assert.equal(r.preparacion,'PENDIENTE');
 assert.equal((await value('ediciones','001')).cuposReservados,2);
 await assert.rejects(ops.cambiarReserva('solicitud_001_a','CONFIRMADA',{verificado:true,costoEnvio:1500}),/ya cambió/);
});
test('cerrar vencida libera una sola vez y no permite confirmar un pago tardío',async()=>{
 await ops.reservarSolicitud('001_a');
 await updateDoc(doc(db,'reservas','solicitud_001_a'),{venceEn:Timestamp.fromMillis(clock-1)});
 await assert.rejects(ops.cambiarReserva('solicitud_001_a','CONFIRMADA',{verificado:true,costoEnvio:0}),/venció/);
 await ops.cambiarReserva('solicitud_001_a','CANCELADA');
 assert.equal((await value('ediciones','001')).cuposReservados,0);
 await assert.rejects(ops.cambiarReserva('solicitud_001_a','CANCELADA'),/ya cambió/);
 assert.equal((await value('solicitudes','001_a')).nombre,'Ana');
});
test('preparación y despacho privado con fecha y seguimiento',async()=>{
 await ops.reservarSolicitud('001_a');await ops.cambiarReserva('solicitud_001_a','CONFIRMADA',{verificado:true,costoEnvio:1000});
 await assert.rejects(ops.actualizarPedido('solicitud_001_a',{preparacion:'DESPACHADA'}),/Completá/);
 await ops.actualizarPedido('solicitud_001_a',{preparacion:'DESPACHADA',seguimiento:'ABC123',fechaDespacho:'2026-10-21'});
 const r=await value('reservas','solicitud_001_a');
 assert.equal(r.seguimiento,'ABC123');assert.equal(r.preparacion,'DESPACHADA');
 assert.equal((await value('ediciones','001')).cuposReservados,2);
});
test('reservas históricas se conservan y las manuales nuevas también usan transacción',async()=>{
 await setDoc(doc(db,'reservas','historica'),{edicionId:'001',referencia:'Alicia',cantidad:1,estado:'CONFIRMADA'});
 await updateDoc(doc(db,'ediciones','001'),{cuposReservados:1});
 await ops.reservaManual('001','Pedido manual',2);
 assert.equal((await value('reservas','historica')).referencia,'Alicia');
 assert.equal((await value('ediciones','001')).cuposReservados,3);
});
test('identidad no administradora rechazada por operaciones y por reglas',async()=>{
 await assert.rejects(makeOps({uid:'visitante'}).reservarSolicitud('001_a'),/Acceso denegado/);
 const adb=env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 await assertFails(setDoc(doc(adb,'reservas','inyectada'),{estado:'CONFIRMADA'}));
 await assertFails(updateDoc(doc(adb,'ediciones','001'),{estado:'publicada'}));
});

test('formulario de prueba → solicitud privada → reserva → pedido conserva todos los datos y solo descuenta una vez',async()=>{
 await setDoc(doc(db,'ediciones','999'),{...edition,nombre:'PRUEBA',precio:100,cupos:2});
 const formData={...request,nombre:'Barbi Prueba',apodo:'Barbi',cantidad:'1',condiciones:true};
 const payload={...validarSolicitud(formData,true),uid:ADMIN_UID,edicionId:'999',estado:'NUEVA_CONSULTA',creadaEn:serverTimestamp()};
 const id='999_'+ADMIN_UID+'_portal-test';
 await setDoc(doc(db,'solicitudes',id),payload);
 assert.equal((await value('ediciones','999')).cuposReservados,0);
 assert.equal((await value('ediciones','001')).cuposReservados,0);
 await ops.reservarSolicitud(id);
 const reservationId='solicitud_'+id;
 for(const key of ['nombre','apodo','email','telefono','entrega','direccion','localidad','provincia','codigoPostal'])assert.equal((await value('reservas',reservationId)).cliente[key],payload[key],key);
 assert.equal((await value('ediciones','999')).cuposReservados,1);
 await assert.rejects(ops.reservarSolicitud(id));
 await ops.cambiarReserva(reservationId,'CONFIRMADA',{verificado:true,costoEnvio:0});
 await ops.actualizarPedido(reservationId,{preparacion:'DESPACHADA',seguimiento:'PRUEBA123',fechaDespacho:'2026-10-21'});
 const order=await value('reservas',reservationId);
 assert.equal(order.estado,'CONFIRMADA');assert.equal(order.total,100);assert.equal(order.seguimiento,'PRUEBA123');
 assert.equal(order.cliente.email,payload.email);assert.equal(order.cliente.direccion,payload.direccion);
 assert.equal((await value('ediciones','999')).cuposReservados,1);
 assert.equal((await value('ediciones','999')).estado,'borrador');
 assert.equal((await value('ediciones','001')).cuposReservados,0);
});
