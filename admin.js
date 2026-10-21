import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs,runTransaction,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {firebaseConfig} from './v12-firebase-config.js';
import {calcularCupos} from './reservas-cupos.js';
const ADMIN_UID='LSf6e03U0xfPDVG3Wmam9BXuAm13';
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app),db=getFirestore(app);
const el=id=>document.getElementById(id);
const status=el('adminStatus');
const formatDate=v=>{const d=typeof v?.toDate==='function'?v.toDate():new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('es-AR'):'—';};
onAuthStateChanged(auth,async user=>{
  el('adminContent').hidden=true;
  if(!user){status.textContent='Iniciá sesión desde la página principal y volvé acá.';return;}
  if(user.uid!==ADMIN_UID){status.textContent='Esta cuenta no tiene acceso de administración.';return;}
  status.textContent='Cargando datos…';
  try{
    const [editionSnap,reservationsSnap]=await Promise.all([
      getDoc(doc(db,'ediciones','001')),getDocs(collection(db,'reservas'))
    ]);
    if(!editionSnap.exists())throw new Error('No existe la edición 001.');
    const edition={id:editionSnap.id,...editionSnap.data()};
    const reservas=reservationsSnap.docs.map(d=>({id:d.id,...d.data()}));
    const result=calcularCupos(edition,reservas);
    el('adminEdition').textContent=edition.nombre||'Edición 001';
    el('adminState').textContent='Estado: '+(edition.estado||'sin definir');
    el('adminTotal').textContent=String(result.total);
    el('adminUsed').textContent=String(result.ocupados);
    el('adminAvailable').textContent=String(result.disponibles);
    const tbody=el('adminReservations');tbody.replaceChildren();
    for(const r of reservas){
      const tr=document.createElement('tr');
      for(const val of [r.id,r.estado||'—',String(r.cantidad??'—'),r.venceEn?formatDate(r.venceEn):'—']){
        const td=document.createElement('td');td.textContent=val;tr.append(td);
      }
      tbody.append(tr);
    }
    if(!reservas.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='Todavía no hay reservas.';tr.append(td);tbody.append(tr);}
    status.textContent='Datos cargados · modo lectura';
    if(result.excedido){status.textContent='Atención: hay más sobres ocupados que cupos totales.';status.className='admin-error';}
    el('adminContent').hidden=false;
  }catch(error){status.textContent='No se pudieron leer los datos: '+(error.code||error.message)+'. Verificá los permisos de Firestore.';status.className='admin-error';}
});

const reservationForm=el('adminNewReservation');
reservationForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const output=el('adminCreateStatus');
  if(auth.currentUser?.uid!==ADMIN_UID){output.textContent='Acceso denegado.';return;}
  const qty=Number(reservationForm.elements.cantidad.value);
  const referencia=reservationForm.elements.referencia.value.trim();
  if(!Number.isSafeInteger(qty)||qty<1||qty>20||!referencia){output.textContent='Revisá la cantidad y la referencia.';return;}
  const button=reservationForm.querySelector('button');button.disabled=true;
  output.textContent='Registrando reserva…';
  try{
    const editionRef=doc(db,'ediciones','001');
    const reservationRef=doc(collection(db,'reservas'));
    await runTransaction(db,async tx=>{
      const snap=await tx.get(editionRef);
      if(!snap.exists())throw new Error('Edición inexistente');
      const data=snap.data();
      // Este contador es conservador: los vencimientos NO liberan cupos
      // hasta que se implemente un cierre explícito en una transacción.
      const occupied=Number(data.cuposReservados??0);
      const max=Number(data.cupos);
      if(!Number.isSafeInteger(occupied)||occupied<0||!Number.isSafeInteger(max)||occupied+qty>max)throw new Error('No quedan suficientes cupos o el contador es inválido');
      tx.update(editionRef,{cuposReservados:occupied+qty});
      tx.set(reservationRef,{
        edicionId:'001',referencia,cantidad:qty,
        estado:'PENDIENTE_PAGO',creadaEn:serverTimestamp(),
        venceEn:Timestamp.fromMillis(Date.now()+48*60*60*1000)
      });
    });
    output.textContent='Reserva registrada. Actualizá el panel para ver los cambios.';
    reservationForm.reset();
  }catch(error){
    output.textContent=error.code==='permission-denied'
      ?'Firestore bloquea escrituras, como estaba previsto. Hay que habilitar únicamente escrituras de administración.'
      :'No se creó la reserva: '+(error.message||error.code);
  }finally{button.disabled=false;}
});
