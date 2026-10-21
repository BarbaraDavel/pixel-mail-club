import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calcularCupos} from '../reservas-cupos.js';
test('cotización ocupa cupos sin vencimiento; cancelación los libera; legacy sigue vigente',()=>{
 const now=new Date('2026-12-01T12:00:00Z');
 const rows=[{edicionId:'001',estado:'PENDIENTE_COTIZACION',cantidad:2,venceEn:null},{edicionId:'001',estado:'CANCELADA',cantidad:4},{edicionId:'001',estado:'PENDIENTE_PAGO',cantidad:1,venceEn:'2026-12-02T12:00:00Z'},{edicionId:'999',estado:'PENDIENTE_COTIZACION',cantidad:20}];
 assert.equal(calcularCupos({id:'001',cupos:10},rows,now).ocupados,3);
 rows[0].estado='CANCELADA';
 assert.equal(calcularCupos({id:'001',cupos:10},rows,now).ocupados,1);
});
