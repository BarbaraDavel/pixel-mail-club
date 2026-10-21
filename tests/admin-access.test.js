import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ADMIN_UIDS,esAdmin,crearGestion} from '../admin-operations.js';

test('ambas administradoras; rechaza anónimos, sesiones ausentes y otras cuentas',async()=>{
 for(const uid of ADMIN_UIDS){
  assert.equal(esAdmin({uid,isAnonymous:false}),true);
  assert.equal(esAdmin({uid,isAnonymous:true}),false);
  assert.equal(esAdmin({uid}),false);
 }
 for(const user of [null,undefined,{uid:'otra',isAnonymous:false},...ADMIN_UIDS.map(uid=>({uid,isAnonymous:true}))]){
  assert.equal(esAdmin(user),false);
  const ops=crearGestion({currentUser:()=>user});
  await assert.rejects(ops.reservarSolicitud('existente'),/Acceso denegado/);
 }
});

test('frontend y reglas comparten exactamente la lista de administradoras',async()=>{
 const rules=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
 const list=rules.match(/request.auth.uid in \[([^\]]+)\]/)[1];
 assert.deepEqual([...list.matchAll(/'([^']+)'/g)].map(m=>m[1]),ADMIN_UIDS);
 assert.match(rules,/sign_in_provider != 'anonymous'/);
 for(const path of ['admin.js','public.js']){
  const source=await readFile(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/import \{[^}]*esAdmin[^}]*\} from '\.\/admin-operations.js'/);
  for(const uid of ADMIN_UIDS)assert.equal(source.includes(uid),false);
 }
});
