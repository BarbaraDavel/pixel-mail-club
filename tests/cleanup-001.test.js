import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preview} from '../scripts/cleanup-001.js';
import {EMAILS_ENABLED,prepararCorreo} from '../emails/templates.js';
test('limpieza solo admite solicitudes/reservas 001 y conserva configuración',()=>{
 const row=(collection,id,estado)=>({collection,path:collection+'/x',data:{edicionId:id,estado}});
 const plan=preview({precio:100,estado:'borrador',cuposReservados:2},[row('solicitudes','001','NUEVA_CONSULTA'),row('reservas','001','CONFIRMADA')]);
 assert.equal(plan.pedidosConfirmados,1);assert.equal(plan.solicitudes,1);
 assert.equal(plan.configuracionConservada,true);assert.equal(plan.cambios.precio.despues,11000);
 for(const r of [row('reservas','999'),row('reservas','002'),row('ediciones','001')])assert.throws(()=>preview({},[r]),/fuera de alcance/);
 assert.throws(()=>preview(null,[]),/No existe/);
 assert.throws(()=>preview({},Array.from({length:401},()=>row('reservas','001'))),/400/);
});
test('correos desactivados y campos de seguimiento/pago obligatorios',()=>{
 assert.equal(EMAILS_ENABLED,false);
 const d={nombre:'Ana',edicion:'Cartitas bajo el árbol'};
 assert.match(prepararCorreo('solicitud',d).text,/todavía no está reservado/);
 for(const type of ['reserva','pago','despacho'])assert.throws(()=>prepararCorreo(type,d),/Falta|Cantidad inválida/);
 assert.match(prepararCorreo('despacho',{...d,fechaDespacho:'2026-10-21',correo:'Andreani',seguimiento:'ABC123'}).text,/ABC123/);
});
