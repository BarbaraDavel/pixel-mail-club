import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs,runTransaction,serverTimestamp,Timestamp,query,orderBy,limit,startAfter,updateDoc} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {protegerApp} from './app-check.js';
import {firebaseConfig} from './v12-firebase-config.js';
import {calcularCupos} from './reservas-cupos.js';
const ADMIN_UID='LSf6e03U0xfPDVG3Wmam9BXuAm13';
const app=getApps().length?getApp():initializeApp(firebaseConfig);
protegerApp(app);
const auth=getAuth(app),db=getFirestore(app);
const el=id=>document.getElementById(id);
const status=el('adminStatus');
const formatDate=v=>{const d=typeof v?.toDate==='function'?v.toDate():new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('es-AR'):'—';};
async function cargarPanel(user){
  el('adminContent').hidden=true;
  el('adminReservations').replaceChildren();
  resetSolicitudes();
  if(!user){status.textContent='Iniciá sesión desde la página principal y volvé acá.';return;}
  if(user.uid!==ADMIN_UID){status.textContent='Esta cuenta no tiene acceso de administración.';return;}
  status.textContent='Cargando datos…';
  try{
    const [editionSnap,reservationsSnap]=await Promise.all([
      getDoc(doc(db,'ediciones','001')),getDocs(collection(db,'reservas'))
    ]);
    if(auth.currentUser?.uid!==ADMIN_UID)return;
    if(!editionSnap.exists())throw new Error('No existe la edición 001.');
    const edition={id:editionSnap.id,...editionSnap.data()};
    const reservas=reservationsSnap.docs.map(d=>({id:d.id,...d.data()}));
    const result=calcularCupos(edition,reservas);
    const contador=Number(edition.cuposReservados??0);
    if(!Number.isSafeInteger(contador)||contador<0||contador>Number(edition.cupos))throw new Error('Contador de cupos inválido');
    el('adminEdition').textContent=edition.nombre||'Edición 001';
    el('adminState').textContent='Estado: '+(edition.estado||'sin definir');
    el('adminTotal').textContent=String(result.total);
    el('adminUsed').textContent=String(contador);
    el('adminAvailable').textContent=String(Number(edition.cupos)-contador);
    const tbody=el('adminReservations');tbody.replaceChildren();
    for(const r of reservas){
      const tr=document.createElement('tr');
      for(const val of [r.referencia||'—',r.id,r.estado||'—',String(r.cantidad??'—'),r.venceEn?formatDate(r.venceEn):'—']){
        const td=document.createElement('td');td.textContent=val;tr.append(td);
      }
      const actions=document.createElement('td');
      if(r.estado==='PENDIENTE_PAGO'){
        const expired=r.venceEn && (typeof r.venceEn.toMillis==='function'?r.venceEn.toMillis():Date.parse(r.venceEn))<=Date.now();
        for(const [label,next] of [[expired?'Cerrar vencida':'Cancelar','CANCELADA'],...(!expired?[['Confirmar pago','CONFIRMADA']]:[])]){
          const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.style.margin='3px';btn.addEventListener('click',()=>cambiarEstado(r,next));actions.append(btn);
        }
      }
      tr.append(actions);tbody.append(tr);
    }
    if(!reservas.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='Todavía no hay reservas.';tr.append(td);tbody.append(tr);}
    status.textContent='Datos cargados · administración';
    if(result.ocupados!==contador){status.textContent='Atención: el contador reservado ('+contador+') difiere del cálculo por vencimientos ('+result.ocupados+'). Los cupos no se liberan hasta cerrar las reservas.';}
    if(result.excedido){status.textContent='Atención: hay más sobres ocupados que cupos totales.';status.className='admin-error';}
    if(auth.currentUser?.uid!==ADMIN_UID)return;
    el('adminContent').hidden=false;
    await cargarSolicitudes();
  }catch(error){status.textContent='No se pudieron leer los datos: '+(error.code||error.message)+'. Verificá los permisos de Firestore.';status.className='admin-error';}
}
onAuthStateChanged(auth,cargarPanel);

async function cambiarEstado(reserva,nuevoEstado){
  if(auth.currentUser?.uid!==ADMIN_UID)return;
  const accion=nuevoEstado==='CONFIRMADA'?'confirmar el pago':'cancelar y liberar '+reserva.cantidad+' cupo(s)';
  const ok=await new Promise(resolve=>{
    const d=document.getElementById('adminDialog');
    document.getElementById('adminDialogTitle').textContent=nuevoEstado==='CONFIRMADA'?'Confirmar pago 💌':'Cancelar reserva 🦊';
    document.getElementById('adminDialogText').textContent='¿Querés '+accion+' de esta reserva?';
    const yes=document.getElementById('adminDialogAccept'),no=document.getElementById('adminDialogBack');
    yes.textContent=nuevoEstado==='CONFIRMADA'?'Confirmar pago':'Sí, cancelar';
    const finish=value=>{yes.removeEventListener('click',accept);no.removeEventListener('click',reject);d.removeEventListener('cancel',reject);d.close();resolve(value);};
    const accept=()=>finish(true),reject=e=>{if(e?.type==='cancel')e.preventDefault();finish(false);};
    yes.addEventListener('click',accept);no.addEventListener('click',reject);d.addEventListener('cancel',reject);d.showModal();
  });
  if(!ok)return;
  status.textContent='Actualizando reserva…';
  try{
    await runTransaction(db,async tx=>{
      const editionRef=doc(db,'ediciones','001'),reservaRef=doc(db,'reservas',reserva.id);
      const [eSnap,rSnap]=await Promise.all([tx.get(editionRef),tx.get(reservaRef)]);
      if(!eSnap.exists()||!rSnap.exists())throw new Error('Datos no encontrados');
      const r=rSnap.data();
      if(r.edicionId!=='001'||r.estado!=='PENDIENTE_PAGO')throw new Error('La reserva ya cambió de estado');
      const vencimiento=r.venceEn?.toMillis?.()??Date.parse(r.venceEn);
      if(nuevoEstado==='CONFIRMADA'&&(!Number.isFinite(vencimiento)||vencimiento<=Date.now()))throw new Error('La reserva venció. No se puede confirmar sin revisar disponibilidad');
      const cantidad=Number(r.cantidad),ocupados=Number(eSnap.data().cuposReservados??0);
      if(!Number.isSafeInteger(cantidad)||cantidad<1||!Number.isSafeInteger(ocupados)||ocupados<cantidad)throw new Error('Contador inconsistente; no se modificó nada');
      if(nuevoEstado==='CANCELADA')tx.update(editionRef,{cuposReservados:ocupados-cantidad});
      tx.update(reservaRef,{estado:nuevoEstado,actualizadaEn:serverTimestamp()});
    });
    await cargarPanel(auth.currentUser);
    const message=document.getElementById('adminActionFeedback');message.hidden=false;message.dataset.kind='success';message.textContent=nuevoEstado==='CANCELADA'?'Reserva cancelada y cupos liberados.':'Pago confirmado correctamente.';message.scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(error){const message=document.getElementById('adminActionFeedback');message.hidden=false;message.dataset.kind='error';message.textContent='No se pudo actualizar: '+(error.code||error.message);message.scrollIntoView({block:'nearest',behavior:'smooth'});console.error(error);}
}

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
    output.textContent='Reserva registrada correctamente.';
    await cargarPanel(auth.currentUser);
    reservationForm.reset();
  }catch(error){
    output.textContent=error.code==='permission-denied'
      ?'Firestore bloquea escrituras, como estaba previsto. Hay que habilitar únicamente escrituras de administración.'
      :'No se creó la reserva: '+(error.code||'error')+' · '+(error.message||'Sin detalles');
    console.error('Error al crear reserva:',error);
  }finally{button.disabled=false;}
});

let requestCursor=null,requestLoading=false,requestGeneration=0;
function resetSolicitudes(){
 requestGeneration++;requestCursor=null;
 el('adminRequests').replaceChildren();
 el('adminRequestsMore').hidden=true;
 el('adminRequestsStatus').textContent='';
}
async function cargarSolicitudes(){
 if(auth.currentUser?.uid!==ADMIN_UID||requestLoading)return;
 requestLoading=true;
 const generation=requestGeneration,more=el('adminRequestsMore'),output=el('adminRequestsStatus');
 more.disabled=true;output.textContent='Cargando solicitudes…';
 try{
  const constraints=[orderBy('creadaEn','desc'),limit(25)];
  if(requestCursor)constraints.push(startAfter(requestCursor));
  const snapshot=await getDocs(query(collection(db,'solicitudes'),...constraints));
  if(generation!==requestGeneration||auth.currentUser?.uid!==ADMIN_UID)return;
  for(const snap of snapshot.docs){
   const r=snap.data(),card=document.createElement('article');
   card.className='request-card';
   const head=document.createElement('header');head.className='request-card-head';
   const identity=document.createElement('div');
   const name=document.createElement('h4');name.textContent=r.nombre||'Sin nombre';
   const nickname=document.createElement('p');nickname.className='request-nickname';
   nickname.textContent=r.apodo?'Le gusta que le digan '+r.apodo:'Sin apodo';
   identity.append(name,nickname);
   const received=document.createElement('p');received.className='request-received';
   received.textContent='Recibida el '+formatDate(r.creadaEn);
   head.append(identity,received);card.append(head);
   const grid=document.createElement('div');grid.className='request-data-grid';
   const group=(title,fields)=>{
    const section=document.createElement('section'),heading=document.createElement('h5'),list=document.createElement('dl');
    heading.textContent=title;
    for(const [label,value] of fields){
     const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
     dt.textContent=label;dd.textContent=value||'—';row.append(dt,dd);list.append(row);
    }
    section.append(heading,list);grid.append(section);
   };
   group('Contacto',[['Email',r.email],['WhatsApp',r.telefono]]);
   const delivery={domicilio:'A domicilio',sucursal:'A sucursal',local:'Retiro a convenir en Posadas'};
   group('Entrega',[['Modalidad',delivery[r.entrega]||r.entrega],...(r.entrega==='domicilio'?[['Dirección',r.direccion]]:[]),['Localidad',r.localidad],['Provincia',r.provincia],['Código postal',r.codigoPostal]]);
   group('Su cartita',[['Edición',r.edicionId],['Cantidad',String(r.cantidad)+' cartita'+(r.cantidad===1?'':'s')],['Recibir novedades',r.comunicaciones?'Sí, aceptó recibir novedades':'No']]);
   card.append(grid);
   const footer=document.createElement('footer');footer.className='request-card-footer';
   const note=document.createElement('p');note.textContent='Solicitud sin reserva de cupo ni pago.';
   const label=document.createElement('label');label.textContent='Estado de la solicitud';
   const select=document.createElement('select');
   select.setAttribute('aria-label','Estado de la solicitud de '+r.nombre);
   for(const [state,text] of [['NUEVA_CONSULTA','Nueva consulta'],['CONTACTADA','Contactada'],['ARCHIVADA','Archivada']]){
    const option=document.createElement('option');option.value=state;option.textContent=text;select.append(option);
   }
   select.value=r.estado;
   select.addEventListener('change',async()=>{
    const previous=r.estado;select.disabled=true;
    try{
     if(auth.currentUser?.uid!==ADMIN_UID)throw new Error('Acceso denegado');
     await updateDoc(doc(db,'solicitudes',snap.id),{estado:select.value,actualizadaEn:serverTimestamp()});
     r.estado=select.value;output.textContent='Estado actualizado. No se modificaron reservas ni cupos.';
    }catch{select.value=previous;output.textContent='No se pudo actualizar el estado.';}
    finally{select.disabled=false;}
   });
   label.append(select);footer.append(note,label);card.append(footer);el('adminRequests').append(card);
  }
  requestCursor=snapshot.docs.at(-1)||requestCursor;
  more.hidden=snapshot.size<25;
  output.textContent=el('adminRequests').children.length?'Solicitudes privadas recibidas.':'Todavía no hay solicitudes.';
 }catch{if(generation===requestGeneration)output.textContent='No se pudieron cargar solicitudes. Revisá que estén publicadas las reglas nuevas de Firestore.';}
 finally{requestLoading=false;more.disabled=false;}
}
el('adminRequestsMore').addEventListener('click',cargarSolicitudes);
el('adminRequestsRefresh').addEventListener('click',()=>{if(requestLoading)return;resetSolicitudes();cargarSolicitudes();});
