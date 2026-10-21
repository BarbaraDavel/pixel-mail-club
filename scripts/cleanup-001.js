// Herramienta local administrativa. Nunca importar desde el frontend.
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {fileURLToPath} from 'node:url';

export const PROJECT='pixel-mail-club';
export const CONFIRM='ELIMINAR PRUEBAS 001 EN pixel-mail-club';
export function preview(edition,docs){
 if(!edition)throw Error('No existe ediciones/001; no se creará ni eliminará.');
 for(const d of docs){
  if(!['solicitudes','reservas'].includes(d.collection)||d.data.edicionId!=='001')throw Error('Documento fuera de alcance.');
 }
 if(docs.length>400)throw Error('Más de 400 documentos: requiere revisión y estrategia específica.');
 return {proyecto:PROJECT,edicion:'001',configuracionConservada:true,
  solicitudes:docs.filter(d=>d.collection==='solicitudes').length,
  reservas:docs.filter(d=>d.collection==='reservas'&&d.data.estado!=='CONFIRMADA').length,
  pedidosConfirmados:docs.filter(d=>d.collection==='reservas'&&d.data.estado==='CONFIRMADA').length,
  documentos:docs.map(d=>({ruta:d.path,estado:d.data.estado??null,cantidad:d.data.cantidad??null})),
  cambios:{precio:{antes:edition.precio??null,despues:11000},estado:{antes:edition.estado??null,despues:'borrador'},cuposReservados:{antes:edition.cuposReservados??null,despues:0}},
  advertencia:'Todos los registros de 001 se consideran pruebas SOLO tras revisión humana. No hay indicador fiable de prueba.'};
}
async function readScope(reader,db){
 const config=db.doc('ediciones/001');
 const get=ref=>reader===db?ref.get():reader.get(ref);
 const [edition,...results]=await Promise.all([get(config),...['solicitudes','reservas'].map(c=>get(db.collection(c).where('edicionId','==','001')))]);
 const snapshots=results.flatMap(s=>s.docs);
 const docs=snapshots.map(s=>({path:s.ref.path,collection:s.ref.parent.id,data:s.data(),version:s.updateTime.toDate().toISOString()+':'+s.updateTime.nanoseconds}));
 return {edition:edition.data(),editionVersion:edition.updateTime?.toDate().toISOString()+':'+edition.updateTime?.nanoseconds,docs,snapshots,config};
}
const fingerprint=scope=>JSON.stringify({edition:scope.editionVersion,docs:scope.docs.map(d=>[d.path,d.version]).sort()});
export async function main(args=process.argv.slice(2)){
 if(args.some(a=>!['--execute','--dry-run'].includes(a))||args.includes('--execute')&&args.includes('--dry-run'))throw Error('Uso: node scripts/cleanup-001.js [--dry-run | --execute]');
 if(process.env.FIRESTORE_EMULATOR_HOST)throw Error('No usar esta herramienta operativa contra un emulador.');
 initializeApp({credential:applicationDefault(),projectId:PROJECT});
 const db=getFirestore();
 const scope=await readScope(db,db);
 const plan=preview(scope.edition,scope.docs);
 console.log(JSON.stringify(plan,null,2));
 if(!args.includes('--execute')){console.log('DRY-RUN: no se escribió ni eliminó ningún documento.');return;}
 if(!stdin.isTTY)throw Error('Se requiere terminal interactiva; no se acepta confirmación por pipe.');
 const terminal=createInterface({input:stdin,output:stdout});
 let answer;
 try{answer=await terminal.question('Revisá TODAS las rutas anteriores. Para aplicar precio/borrador/contador y eliminar esos registros, escribí: '+CONFIRM+'\n> ');}finally{terminal.close();}
 if(answer!==CONFIRM)throw Error('Cancelado: confirmación incorrecta.');
 await db.runTransaction(async tx=>{
  const current=await readScope(tx,db);
  preview(current.edition,current.docs);
  if(fingerprint(current)!==fingerprint(scope))throw Error('Los datos cambiaron desde la vista previa. Volvé a revisar el dry-run.');
  for(const snapshot of current.snapshots)tx.delete(snapshot.ref);
  tx.update(current.config,{precio:11000,estado:'borrador',cuposReservados:0,
   versionGestion:(current.edition.versionGestion??0)+1,actualizadaEn:FieldValue.serverTimestamp()});
 });
 const after=await readScope(db,db);
 if(after.docs.length||after.edition.precio!==11000||after.edition.estado!=='borrador'||after.edition.cuposReservados!==0)throw Error('Verificación posterior falló: revisar concurrencia y datos. No repetir sin nuevo dry-run.');
 console.log('VERIFICADO: 001 sin solicitudes ni reservas/pedidos; precio 11000, borrador, contador 0. Configuración conservada.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
