import {test,before,after,beforeEach} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,serverTimestamp,Timestamp,writeBatch} from 'firebase/firestore';
let env;
const admin='LSf6e03U0xfPDVG3Wmam9BXuAm13';
const anon=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}}).firestore();
const data=uid=>({uid,edicionId:'001',nombre:'Ana Pérez',apodo:'Ana',email:'ana@example.com',telefono:'+54 376 1234567',cantidad:1,localidad:'Posadas',provincia:'Misiones',codigoPostal:'3300',direccion:'Calle 123',entrega:'domicilio',comunicaciones:false,estado:'NUEVA_CONSULTA',creadaEn:serverTimestamp()});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pixel-mail-club',firestore:{rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();});
after(async()=>{await env?.cleanup();});
test('anónimo crea una sola solicitud sin lectura ni edición propia',async()=>{
 const db=anon('a'),ref=doc(db,'solicitudes','001_a');
 await assertSucceeds(setDoc(ref,data('a')));
 await assertFails(setDoc(ref,data('a')));
 await assertFails(getDoc(ref));await assertFails(getDocs(collection(db,'solicitudes')));
 await assertFails(updateDoc(ref,{estado:'CONTACTADA'}));await assertFails(deleteDoc(ref));
 await assertFails(getDoc(doc(anon('b'),'solicitudes','001_a')));
});
test('rechaza UID falso, ID arbitrario, anónimo ausente y proveedor incorrecto',async()=>{
 await assertFails(setDoc(doc(anon('a'),'solicitudes','random'),data('a')));
 await assertFails(setDoc(doc(anon('a'),'solicitudes','001_a'),data('b')));
 await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(),'solicitudes','001_a'),data('a')));
 await assertFails(setDoc(doc(env.authenticatedContext('a',{firebase:{sign_in_provider:'password'}}).firestore(),'solicitudes','001_a'),data('a')));
});
test('valida campos en servidor, no solo en navegador',async()=>{
 const ref=doc(anon('a'),'solicitudes','001_a');
 for(const patch of [{cantidad:0},{cantidad:21},{cantidad:1.5},{email:'sin-email'},{telefono:'texto'},{nombre:' '},{nombre:'Ana\n\nPérez'},{apodo:'a'.repeat(61)},{direccion:''},{entrega:'otra'},{comunicaciones:'sí'},{edicionId:'002'},{estado:'CONFIRMADA'},{creadaEn:Timestamp.fromMillis(1)},{cuposReservados:1}]){
  await assertFails(setDoc(ref,{...data('a'),...patch}));
 }
 const missing=data('a');delete missing.email;await assertFails(setDoc(ref,missing));
});
test('solo administradora lee y modera, sin alterar datos del solicitante',async()=>{
 await setDoc(doc(anon('a'),'solicitudes','001_a'),data('a'));
 const db=env.authenticatedContext(admin).firestore(),ref=doc(db,'solicitudes','001_a');
 await assertSucceeds(getDocs(collection(db,'solicitudes')));
 await assertSucceeds(updateDoc(ref,{estado:'CONTACTADA',actualizadaEn:serverTimestamp()}));
 await assertFails(updateDoc(ref,{estado:'CONFIRMADA',actualizadaEn:serverTimestamp()}));
 await assertFails(updateDoc(ref,{nombre:'Reemplazo',actualizadaEn:serverTimestamp()}));
 await assertFails(deleteDoc(ref));
});
test('mantiene privacidad de borradores y reservas y evita modificar cupos en lote',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'ediciones','001'),{estado:'borrador',cupos:20,cuposReservados:3});
  await setDoc(doc(ctx.firestore(),'reservas','existente'),{cantidad:3,estado:'PENDIENTE_PAGO'});
 });
 const db=anon('a');
 await assertFails(getDoc(doc(db,'ediciones','001')));
 await assertFails(getDoc(doc(db,'reservas','existente')));
 const batch=writeBatch(db);batch.set(doc(db,'solicitudes','001_a'),data('a'));batch.update(doc(db,'ediciones','001'),{cuposReservados:4});
 await assertFails(batch.commit());
 await assertSucceeds(setDoc(doc(db,'solicitudes','001_a'),data('a')));
 const adb=env.authenticatedContext(admin).firestore();
 const snap=await assertSucceeds(getDoc(doc(adb,'ediciones','001')));
 if(snap.data().cuposReservados!==3)throw new Error('Se modificaron cupos');
 await assertSucceeds(updateDoc(doc(adb,'reservas','existente'),{estado:'CANCELADA'}));
});


test('prueba 999 solo administradora, con esquema completo y borrador privado',async()=>{
 const db=env.authenticatedContext(admin).firestore();
 const ref=doc(db,'solicitudes','999_'+admin+'_test-1');
 const payload={...data(admin),edicionId:'999'};
 await assertFails(setDoc(ref,payload)); // No existe la edición.
 await setDoc(doc(db,'ediciones','999'),{estado:'borrador',cupos:2,cuposReservados:0});
 await assertSucceeds(setDoc(ref,payload));
 await assertFails(setDoc(ref,payload)); // No sobrescribe ni duplica al reintentar.
 for(const client of [anon('a'),env.unauthenticatedContext().firestore(),env.authenticatedContext('otra',{firebase:{sign_in_provider:'password'}}).firestore()]){
  await assertFails(setDoc(doc(client,'solicitudes','999_'+admin+'_test-2'),payload));
  await assertFails(getDoc(doc(client,'solicitudes','999_'+admin+'_test-1')));
  await assertFails(getDoc(doc(client,'ediciones','999')));
 }
 const next=doc(db,'solicitudes','999_'+admin+'_test-2');
 for(const patch of [{uid:'otra'},{edicionId:'001'},{edicionId:'002'},{cantidad:0},{nombre:' '},{email:'mal'},{creadaEn:Timestamp.fromMillis(1)},{campoExtra:true}])await assertFails(setDoc(next,{...payload,...patch}));
 await assertFails(setDoc(doc(db,'solicitudes','999_otro_test-2'),payload));
 await updateDoc(doc(db,'ediciones','999'),{estado:'publicada'});
 await assertFails(setDoc(next,payload));
 await assertFails(setDoc(doc(db,'solicitudes','001_'+admin),data(admin)));
});
