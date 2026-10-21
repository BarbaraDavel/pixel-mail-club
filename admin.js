import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs,runTransaction,serverTimestamp,Timestamp,query,where,orderBy,limit,startAfter,updateDoc} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {protegerApp} from './app-check.js';
import {firebaseConfig} from './v12-firebase-config.js';
import {calcularCupos} from './reservas-cupos.js';
import {crearGestion,esAdmin} from './admin-operations.js';
import {initAdminTabs} from './admin-tabs.js';
const app=getApps().length?getApp():initializeApp(firebaseConfig);
protegerApp(app);
const auth=getAuth(app),db=getFirestore(app);
const gestion=crearGestion({db,doc,collection,runTransaction,serverTimestamp,Timestamp,currentUser:()=>auth.currentUser});
const el=id=>document.getElementById(id);
const tabs=initAdminTabs();
const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
const money=n=>Number.isSafeInteger(n)?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n):'Sin registrar';
const millis=v=>v?.toMillis?.()??Date.parse(v);
const date=v=>{const ms=millis(v);return Number.isFinite(ms)?new Date(ms).toLocaleString('es-AR'):'—';};
const states={PENDIENTE_PAGO:'Pendiente de pago',CONFIRMADA:'Pedido confirmado',CANCELADA:'Cancelada',VENCIDA:'Vencida · cerrar para liberar cupos',PRUEBA:'Registro de prueba'};
const preparation={PENDIENTE:'Por preparar',EN_PREPARACION:'En preparación',LISTA:'Lista para entregar',DESPACHADA:'Despachada',ENTREGADA:'Entregada'};
const delivery={domicilio:'A domicilio',sucursal:'A sucursal',local:'Retiro a convenir en Posadas'};
let editions=[],reservations=[],selected=new URLSearchParams(window.location.search).get('edicion')==='999'?'999':'001',loadedRequests=[],cursor=null,moreRequests=false;
let generation=0,requestsLoading=false,panelLoading=false,editingVersion=null,newEdition=false,actionBusy=false,cancelDialog=null;
const authorized=()=>esAdmin(auth.currentUser);
function feedback(text,error=false){
 if(!authorized())return;
 const p=el('adminActionFeedback');p.hidden=false;p.dataset.kind=error?'error':'success';p.textContent=text;
 p.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function empty(container,text){container.replaceChildren(node('p','empty-list',text));}
function clearPrivate(){
 generation++;loadedRequests=[];cursor=null;editions=[];reservations=[];
 el('adminContent').hidden=true;el('adminActionFeedback').hidden=true;
 for(const id of ['adminRequests','adminReservations','adminReservationsHistory','adminOrders','adminEditionSelect'])el(id).replaceChildren();
 el('adminEditionForm').reset();el('adminNewReservation').reset();
 el('adminRequestSearch').value='';el('adminRequestFilter').value='ACTIVAS';
 if(cancelDialog)cancelDialog();
}
async function loadPanel(){
 if(!authorized())return;
 const ticket=++generation;
 panelLoading=true;requestsLoading=false;el('adminStatus').className='';el('adminStatus').textContent='Actualizando el taller…';
 try{
  const [es,rs]=await Promise.all([getDocs(collection(db,'ediciones')),getDocs(collection(db,'reservas'))]);
  if(!authorized()||ticket!==generation)return;
  editions=es.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
  reservations=rs.docs.map(d=>({id:d.id,...d.data()}));
  const options=el('adminEditionSelect');options.replaceChildren();
  for(const e of editions){const opt=node('option','',e.id+' · '+(e.nombre||'Sin nombre'));opt.value=e.id;options.append(opt);}
  if(!editions.some(e=>e.id===selected))selected=editions[0]?.id||'';
  options.value=selected;
  el('adminContent').hidden=false;el('adminStatus').textContent='Solo vos podés acceder a esta gestión. Los pagos públicos siguen deshabilitados.';
  renderEdition();renderReservations();fillEditionForm();tabs.restore();
  await resetRequests();
 }catch(error){if(ticket===generation&&authorized()){el('adminStatus').textContent='No se pudo cargar el taller: '+(error.code||error.message);el('adminStatus').className='admin-error';}}
 finally{if(ticket===generation)panelLoading=false;}
}
function renderEdition(){
 const e=editions.find(e=>e.id===selected);
 el('adminEdition').textContent=e?e.nombre||'Edición '+e.id:'Creá tu primera edición';
 el('adminPortalTest').hidden=selected!=='999'||e?.estado!=='borrador';
 el('adminReservationNotice').hidden=!e||Number.isSafeInteger(e.precio)&&e.precio>0;
 el('adminState').textContent=e?'Edición '+e.id+' · '+(e.estado||'Sin estado')+' · '+(e.precio>0?money(e.precio)+' por cartita':'Precio por definir'):'';
 try{
  const max=Number(e?.cupos??0),used=Number(e?.cuposReservados??0);
  if(!Number.isSafeInteger(max)||!Number.isSafeInteger(used)||used<0||used>max)throw Error('Contador de cupos inválido. Revisalo antes de reservar.');
  el('adminTotal').textContent=String(max);el('adminUsed').textContent=String(used);el('adminAvailable').textContent=String(max-used);
  const calculated=e?calcularCupos(e,reservations):{ocupados:0};
  el('capacityNote').textContent=calculated.ocupados!==used
   ?'Hay diferencia entre el contador y las reservas vigentes. Las vencidas mantienen sus cupos hasta que las cierres; revisá los registros anteriores.'
   :'Las solicitudes no ocupan cupos. Cada reserva sí: los vencimientos se cierran manualmente.';
 }catch(error){el('capacityNote').textContent=error.message;for(const id of ['adminTotal','adminUsed','adminAvailable'])el(id).textContent='—';}
}
function fillEditionForm(){
 const f=el('adminEditionForm'),e=newEdition?null:editions.find(e=>e.id===selected);
 f.reset();editingVersion=e?(e.versionGestion??0):null;
 for(const key of ['id','nombre','periodo','descripcion','precio','cupos'])f.elements[key].value=e?.[key]??(key==='precio'?0:key==='cupos'?20:'');
 f.elements.contenido.value=e?.contenido?.join('\n')||'';
 f.elements.id.readOnly=!!e;
 const locked=!!e&&e.estado!=='borrador';
 for(const input of f.querySelectorAll('input,textarea,button'))input.disabled=locked;
 el('adminEditionStatus').textContent=locked?'Esta edición no es un borrador y no se edita desde este formulario.':e?'Cambios privados: guardar no publica la edición.':'Nueva edición: se guardará como borrador.';
}
function cardHeader(title,subtitle,right,cls=''){
 const card=node('article','request-card '+cls),head=node('header','request-card-head'),identity=node('div');
 identity.append(node('h4','',title),node('p','request-nickname',subtitle));
 head.append(identity,right);card.append(head);return card;
}
function group(grid,title,fields){
 const section=node('section'),heading=node('h5','',title),dl=node('dl');
 for(const [label,value] of fields){const row=node('div');row.append(node('dt','',label),node('dd','',value===null||value===undefined||value===''?'—':String(value)));dl.append(row);}
 section.append(heading,dl);grid.append(section);
}
function appendClient(grid,c={}){
 group(grid,'Contacto',[['Email',c.email],['WhatsApp',c.telefono]]);
 group(grid,'Entrega',[['Modalidad',delivery[c.entrega]||c.entrega],...(c.entrega==='domicilio'?[['Dirección',c.direccion]]:[]),['Localidad',c.localidad],['Provincia',c.provincia],['Código postal',c.codigoPostal]]);
}
function makeButton(label,handler,cls=''){
 const b=node('button',cls,label);b.type='button';b.addEventListener('click',()=>perform(b,handler));return b;
}
async function perform(button,handler){
 if(actionBusy||!authorized())return;
 actionBusy=true;button.disabled=true;
 try{await handler();}catch(error){feedback(error.message||'No se pudo completar la acción.',true);}
 finally{actionBusy=false;button.disabled=false;}
}
function dialog(title,message,fields=[]){
 if(cancelDialog||!authorized())return Promise.resolve(null);
 const d=el('adminDialog'),form=el('adminDialogForm'),box=el('adminDialogFields');
 el('adminDialogTitle').textContent=title;el('adminDialogText').textContent=message;box.replaceChildren();
 for(const field of fields){
  const label=node('label',field.type==='checkbox'?'dialog-check':'',field.label),input=node('input');
  input.name=field.name;input.type=field.type||'number';input.required=field.required!==false;
  if(field.type!=='checkbox'){input.value=field.value??'';input.min='0';input.max='2000000000';input.step='1';}
  if(field.type==='checkbox')label.prepend(input);else label.append(input);
  box.append(label);
 }
 return new Promise(resolve=>{
  const finish=value=>{form.removeEventListener('submit',submit);el('adminDialogBack').removeEventListener('click',back);d.removeEventListener('cancel',back);cancelDialog=null;d.close();box.replaceChildren();resolve(value);};
  const back=e=>{e?.preventDefault();finish(null);};
  const submit=e=>{e.preventDefault();if(form.reportValidity())finish(new FormData(form));};
  cancelDialog=()=>finish(null);form.addEventListener('submit',submit);el('adminDialogBack').addEventListener('click',back);d.addEventListener('cancel',back);d.showModal();
 });
}
async function resetRequests(){
 loadedRequests=[];cursor=null;moreRequests=false;el('adminRequests').replaceChildren();el('adminRequestsMore').hidden=true;
 await loadRequests();
}
async function loadRequests(){
 if(!authorized()||requestsLoading||!selected)return;
 requestsLoading=true;
 const ticket=generation,edition=selected,out=el('adminRequestsStatus'),more=el('adminRequestsMore');
 more.disabled=true;out.textContent='Cargando solicitudes…';
 try{
  const constraints=[where('edicionId','==',edition),orderBy('creadaEn','desc'),limit(25)];
  if(cursor)constraints.push(startAfter(cursor));
  const snap=await getDocs(query(collection(db,'solicitudes'),...constraints));
  if(ticket!==generation||!authorized()||edition!==selected)return;
  loadedRequests.push(...snap.docs.map(d=>({id:d.id,...d.data()})));
  cursor=snap.docs.at(-1)||cursor;moreRequests=snap.size===25;
  renderRequests();more.hidden=!moreRequests;

 }catch(error){
  if(ticket===generation&&authorized())out.textContent=error.code==='failed-precondition'
   ?'Falta el índice de solicitudes por edición y fecha. Crealo como se indica en FIREBASE-SETUP.md y tocá Actualizar solicitudes.'
   :'No se pudieron cargar solicitudes. Revisá tu conexión y los permisos.';
 }finally{if(ticket===generation){requestsLoading=false;more.disabled=false;}}
}
function renderRequests(){
 const container=el('adminRequests');container.replaceChildren();
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
 const search=normalize(el('adminRequestSearch').value),filter=el('adminRequestFilter').value;
 const visible=loadedRequests.filter(r=>{
  const matchesState=filter==='TODAS'||(filter==='ACTIVAS'?r.estado!=='ARCHIVADA':r.estado===filter);
  const fields=[r.nombre,r.apodo,r.email,r.telefono];
  const matchesText=fields.some(value=>normalize(value).includes(search));
  const digits=search.replace(/\D/g,'');
  const matchesPhone=/^[+\d\s().-]+$/.test(search)&&digits&&String(r.telefono??'').replace(/\D/g,'').includes(digits);
  return matchesState&&(matchesText||matchesPhone);
 });
 el('adminRequestsStatus').textContent=loadedRequests.length
  ?visible.length+' de '+loadedRequests.length+' solicitudes cargadas · '+selected+(moreRequests?' · Hay más por cargar.':'')
  :'Todavía no hay solicitudes para esta edición.';
 if(!visible.length){empty(container,!loadedRequests.length?'Las personas que completen el formulario van a aparecer acá.':'No hay solicitudes cargadas que coincidan con esta búsqueda y filtro.'+(moreRequests?' Probá cargar más solicitudes.':''));return;}
 for(const r of visible){
  const linked=reservations.find(x=>x.solicitudId===r.id||x.id==='solicitud_'+r.id);
  const card=cardHeader(r.nombre||'Sin nombre',r.apodo?'Le gusta que le digan '+r.apodo:'Sin apodo',node('p','request-received','Recibida el '+date(r.creadaEn)));
  const grid=node('div','request-data-grid');appendClient(grid,r);
  group(grid,'Su cartita',[['Edición',r.edicionId],['Cantidad',r.cantidad+' cartita'+(r.cantidad===1?'':'s')],['Recibir novedades',r.comunicaciones?'Sí':'No']]);card.append(grid);
  const footer=node('footer','request-card-footer'),actions=node('div','request-actions'),label=node('label','','Estado de la solicitud'),select=node('select');
  select.setAttribute('aria-label','Estado de la solicitud de '+r.nombre);
  for(const [value,title] of [['NUEVA_CONSULTA','Nueva consulta'],['CONTACTADA','Contactada'],['ARCHIVADA','Archivada']]){const o=node('option','',title);o.value=value;select.append(o);}
  select.value=r.estado;label.append(select);
  select.addEventListener('change',async()=>{
   const previous=r.estado;select.disabled=true;
   try{
    if(!authorized())throw Error('Acceso denegado.');
    await updateDoc(doc(db,'solicitudes',r.id),{estado:select.value,actualizadaEn:serverTimestamp()});
    if(!authorized())return;r.estado=select.value;renderRequests();feedback('Estado guardado. No se envió ningún mensaje.');
   }catch(error){select.value=previous;feedback('No se pudo guardar el estado.',true);}
   finally{select.disabled=false;}
  });
  if(linked){
   actions.append(node('p','admin-muted',states[linked.estado]||linked.estado));
   const a=node('a','',linked.estado==='CONFIRMADA'?'Ver pedido confirmado':'Ver reserva');
   a.href='#registro-'+linked.id;actions.append(a);
  }else if(r.estado!=='ARCHIVADA'){
   actions.append(makeButton('Crear reserva · 48 h',async()=>{
    if(!checkReservationPrice())return;
    const ok=await dialog('Reservar sus cartitas 💌','Se reservarán '+r.cantidad+' cupos para '+r.nombre+' durante 48 horas. Esto no cobra ni envía mensajes. El precio actual de la edición quedará guardado en la reserva.');
    if(!ok)return;
    await gestion.reservarSolicitud(r.id);await loadPanel();tabs.show('reservationsSection');feedback('Reserva creada una sola vez. Podés verla en Reservas.');
   }));
  }else actions.append(node('p','admin-muted','Archivada. Podés cambiarla a Contactada para retomarla.'));
  footer.append(actions,label);card.append(footer);container.append(card);
 }
}
function checkReservationPrice(){
 const e=editions.find(e=>e.id===selected);
 if(e&&Number.isSafeInteger(e.precio)&&e.precio>0)return true;
 tabs.show('editionsSection');el('adminEditionForm').elements.precio.focus();
 feedback('Primero definí y guardá el precio de la edición. No se creó ninguna reserva ni se ocuparon cupos.',true);
 return false;
}
function renderReservations(){
 const pending=el('adminReservations'),history=el('adminReservationsHistory'),orders=el('adminOrders');
 for(const c of [pending,history,orders])c.replaceChildren();
 const items=reservations.filter(r=>r.edicionId===selected||!r.edicionId).sort((a,b)=>(millis(b.creadaEn)||0)-(millis(a.creadaEn)||0));
 for(const r of items){
  const unassigned=!r.edicionId;
  const confirmed=r.estado==='CONFIRMADA',expired=r.estado==='PENDIENTE_PAGO'&&millis(r.venceEn)<=Date.now();
  const state=expired?'VENCIDA':r.estado,badge=node('span','state-badge',(unassigned?'Sin edición · ':'')+(states[state]||state));badge.dataset.state=state;
  const c=r.cliente||{};
  const card=cardHeader(c.nombre||r.referencia||'Registro anterior',c.apodo?'Le gusta que le digan '+c.apodo:r.solicitudId?'Desde una solicitud':'Reserva manual · datos históricos',badge,confirmed?'order-card':'reservation-card');
  card.id='registro-'+r.id;
  const grid=node('div','request-data-grid');
  group(grid,'Su cartita',[['Edición',r.edicionId],['Cantidad',r.cantidad+' cartitas'],['Creada',date(r.creadaEn)],...(confirmed?[['Pago verificado',r.pagoVerificadoEn?date(r.pagoVerificadoEn):'Confirmación anterior']]:[['Vence',date(r.venceEn)]])]);
  group(grid,'Importes',[['Cartitas',money(r.subtotal)],['Envío',r.costoEnvio==null?'A cotizar':money(r.costoEnvio)],['Total',r.total!=null?money(r.total):Number.isSafeInteger(r.subtotal)&&Number.isSafeInteger(r.costoEnvio)?money(r.subtotal+r.costoEnvio):'A confirmar']]);
  group(grid,'Persona y entrega',[['Email',c.email],['WhatsApp',c.telefono],['Modalidad',delivery[c.entrega]||c.entrega],['Destino',[c.direccion,c.localidad,c.provincia,c.codigoPostal].filter(Boolean).join(' · ')]]);
  card.append(grid);
  const footer=node('footer','request-card-footer'),info=node('div');
  info.append(node('p','',confirmed?'Preparación: '+(preparation[r.preparacion]||'Por preparar'):expired?'Cerrá la reserva para devolver los cupos a la edición.':'Los cupos se liberan únicamente al cancelar o cerrar la reserva.'),node('p','record-reference','Referencia: '+(r.referencia||'—')+' · ID '+r.id));
  const actions=node('div','request-actions');
  if(r.estado==='PENDIENTE_PAGO'&&!unassigned){
   if(!expired)actions.append(makeButton('Verificar pago y confirmar',()=>confirmPayment(r)));
   actions.append(makeButton(expired?'Cerrar vencida':'Cancelar reserva',async()=>{
    const ok=await dialog(expired?'Cerrar reserva vencida':'Cancelar reserva','Se liberarán '+r.cantidad+' cupos. No se borrarán la reserva ni la solicitud.');
    if(!ok)return;
    await gestion.cambiarReserva(r.id,'CANCELADA');await loadPanel();feedback('Reserva cerrada y cupos liberados.');
   },'secondary'));
  }
  footer.append(info,actions);card.append(footer);
  if(unassigned){history.append(card);}
  else if(confirmed){card.append(orderForm(r));orders.append(card);}
  else if(r.estado==='PENDIENTE_PAGO')pending.append(card);
  else history.append(card);
 }
 if(!pending.children.length)empty(pending,'No hay reservas pendientes de pago en esta edición.');
 if(!history.children.length)empty(history,'No hay reservas canceladas ni registros anteriores.');
 if(!orders.children.length)empty(orders,'Los pedidos aparecerán acá cuando verifiques el pago de una reserva.');
}
async function confirmPayment(r){
 const fields=[];
 if(!Number.isSafeInteger(r.subtotal))fields.push({name:'subtotalLegacy',label:'Importe de cartitas · ARS (registro anterior sin importe)'});
 if(r.cliente?.entrega!=='local')fields.push({name:'costoEnvio',label:'Costo acordado de envío · ARS (0 si no corresponde)',value:r.costoEnvio??''});
 fields.push({name:'verificado',type:'checkbox',label:'Verifiqué el pago recibido de las cartitas y el envío acordado.'});
 const result=await dialog('Confirmar pedido 💌',(r.cliente?.nombre||r.referencia||'Reserva')+' · '+r.cantidad+' cartitas. '+(r.subtotal?money(r.subtotal)+' de cartitas. ':'')+'Esta acción registra tu verificación manual; no realiza ningún cobro.',fields);
 if(!result)return;
 await gestion.cambiarReserva(r.id,'CONFIRMADA',{verificado:result.has('verificado'),costoEnvio:result.get('costoEnvio'),subtotalLegacy:result.get('subtotalLegacy')});
 await loadPanel();tabs.show('ordersSection');feedback('Pago registrado. El pedido ya aparece en Pedidos confirmados.');
}
function orderForm(r){
 const details=node('details','order-form'),summary=node('summary','','Preparación y seguimiento');
 const f=node('form','admin-form'),pair=node('div','form-pair');
 const statusLabel=node('label','','Estado de preparación'),select=node('select');select.name='preparacion';
 for(const [value,title] of Object.entries(preparation)){const o=node('option','',title);o.value=value;select.append(o);}
 select.value=r.preparacion||'PENDIENTE';statusLabel.append(select);f.append(statusLabel);
 for(const [name,title,type,value] of [['seguimiento','Número de seguimiento','text',r.seguimiento||''],['fechaDespacho','Fecha de despacho','date',r.fechaDespacho||''],['correo','Empresa de correo','text',r.correo||''],['urlSeguimiento','Enlace HTTPS de seguimiento (opcional)','url',r.urlSeguimiento||'']]){
  const label=node('label','',title),input=node('input');input.name=name;input.type=type;input.value=value;input.maxLength=name==='urlSeguimiento'?1000:100;label.append(input);pair.append(label);
 }
 const save=node('button','','Guardar preparación');save.type='submit';f.append(pair,save);
 f.addEventListener('submit',event=>{event.preventDefault();if(f.reportValidity())perform(save,async()=>{
  await gestion.actualizarPedido(r.id,Object.fromEntries(new FormData(f)));await loadPanel();feedback('Preparación y seguimiento guardados.');
 });});
 details.append(summary,f);return details;
}
el('adminNewReservation').addEventListener('submit',event=>{
 event.preventDefault();const f=event.currentTarget;
 if(!selected||!f.reportValidity())return;
 perform(f.querySelector('button'),async()=>{
  if(!checkReservationPrice())return;
  const data=new FormData(f),id=selected;
  const ok=await dialog('Crear reserva manual','La reserva ocupará '+data.get('cantidad')+' cupos durante 48 horas en la edición '+id+'. Para conservar datos de una solicitud, creala desde su tarjeta.');
  if(!ok)return;
  await gestion.reservaManual(id,data.get('referencia'),data.get('cantidad'));f.reset();await loadPanel();tabs.show('reservationsSection');feedback('Reserva manual creada.');
 });
});
el('adminEditionForm').addEventListener('submit',event=>{
 event.preventDefault();const f=event.currentTarget;
 if(!f.reportValidity())return;
 const expected=editingVersion;
 perform(el('adminSaveEdition'),async()=>{
  const id=await gestion.guardarEdicion(Object.fromEntries(new FormData(f)),expected);
  selected=id;newEdition=false;await loadPanel();feedback('Borrador guardado. La edición sigue sin publicarse.');
 });
});
el('adminNewEdition').addEventListener('click',()=>{newEdition=true;fillEditionForm();el('adminEditionForm').elements.id.focus();});
el('adminEditionSelect').addEventListener('change',async event=>{
 if(panelLoading||actionBusy){event.target.value=selected;return;}
 selected=event.target.value;newEdition=false;generation++;requestsLoading=false;
 renderEdition();renderReservations();fillEditionForm();await resetRequests();
});
el('adminRefresh').addEventListener('click',()=>{if(!panelLoading&&!actionBusy)loadPanel();});
el('adminRequestsRefresh').addEventListener('click',()=>{if(!panelLoading&&!requestsLoading&&!actionBusy){generation++;resetRequests();}});
el('adminRequestsMore').addEventListener('click',loadRequests);
el('adminRequestSearch').addEventListener('input',()=>{if(authorized()&&!requestsLoading)renderRequests();});
el('adminRequestFilter').addEventListener('change',()=>{if(authorized()&&!requestsLoading)renderRequests();});
el('adminGoToPrice').addEventListener('click',()=>{if(authorized())checkReservationPrice();});
onAuthStateChanged(auth,user=>{
 clearPrivate();
 if(!esAdmin(user)){el('adminStatus').textContent=user?'Esta cuenta no tiene acceso de administración.':'Iniciá sesión desde la página principal y volvé acá.';return;}
 loadPanel();
});
