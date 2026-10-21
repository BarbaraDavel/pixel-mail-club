import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarSolicitud} from '../solicitudes-validation.js';
const valid={nombre:' Ana Pérez ',apodo:'Anita',email:' ANA@example.com ',telefono:'+54 376 1234567',cantidad:'2',localidad:'Posadas',provincia:'Misiones',codigoPostal:'3300',direccion:'Calle 123',entrega:'domicilio',condiciones:'on'};
test('normaliza datos y conserva consentimiento separado',()=>{
 const d=validarSolicitud(valid,false);
 assert.equal(d.nombre,'Ana Pérez');assert.equal(d.email,'ana@example.com');
 assert.equal(d.cantidad,2);assert.equal(d.comunicaciones,false);
 assert.equal(d.edicionId,'001');assert.equal(d.condiciones,undefined);
});
test('rechaza datos inválidos, cantidades fuera de rango y falta de consentimiento',()=>{
 for(const patch of [{nombre:' '},{email:'a@b'},{telefono:'abc'},{codigoPostal:'!'},{cantidad:'1.5'},{cantidad:'0'},{cantidad:'21'},{cantidad:'NaN'},{entrega:'otra'},{direccion:''},{condiciones:''},{apodo:'a'.repeat(61)}]){
  assert.throws(()=>validarSolicitud({...valid,...patch},false));
 }
});
test('no guarda dirección innecesaria en retiros y no acepta campos inyectados',()=>{
 const d=validarSolicitud({...valid,entrega:'local',uid:'otro',estado:'CONFIRMADA',cuposReservados:99},true);
 assert.equal(d.direccion,'');assert.equal(d.uid,undefined);assert.equal(d.estado,undefined);
 assert.equal(d.cuposReservados,undefined);assert.equal(d.comunicaciones,true);
});
