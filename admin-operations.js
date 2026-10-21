// Operaciones privadas. El SDK se inyecta para probar las mismas transacciones en el emulador.
export const ADMIN_UIDS=Object.freeze(['aDYubwS1BnXvMKKPbLiB0tLI5wz1','LSf6e03U0xfPDVG3Wmam9BXuAm13']);
export const esAdmin=user=>user?.isAnonymous===false&&ADMIN_UIDS.includes(user.uid);
const fail=message=>{throw new Error(message);};
const integer=(value,min,max,label)=>{
 if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')fail('Completá '+label+'.');
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<min||n>max)fail('Revisá '+label+'.');
 return n;
};
const text=(value,max,label,required=false)=>{
 const s=String(value??'').trim();
 if((required&&!s)||s.length>max||/[\u0000-\u001f\u007f]/.test(s))fail('Revisá '+label+'.');
 return s;
};
export function validarEdicion(raw){
 const id=text(raw.id,3,'el número de edición',true);
 if(!/^[0-9]{3}$/.test(id))fail('La edición debe tener tres dígitos, por ejemplo 002.');
 const contenido=String(raw.contenido??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(!contenido.length||contenido.length>30)fail('Ingresá entre 1 y 30 elementos de contenido.');
 contenido.forEach(s=>text(s,300,'el contenido',true));
 return {id,nombre:text(raw.nombre,120,'el nombre',true),periodo:text(raw.periodo,100,'el período',true),
  descripcion:text(raw.descripcion,1000,'la descripción'),contenido,
  precio:integer(raw.precio,0,100000000,'el precio entero en pesos'),
  cupos:integer(raw.cupos,1,100000,'los cupos')};
}
function capacity(edition,qty){
 const max=integer(edition.cupos,0,100000,'los cupos de la edición');
 const used=integer(edition.cuposReservados??0,0,max,'el contador de cupos');
 if(used+qty>max)fail('No quedan suficientes cupos. No se creó la reserva.');
 return used;
}
function prices(edition,qty){
 const unit=integer(edition.precio,1,100000000,'el precio de la edición: primero definilo en Ediciones');
 const subtotal=unit*qty;
 if(!Number.isSafeInteger(subtotal))fail('Importe inválido.');
 return {precioUnitario:unit,subtotal};
}
export function crearGestion({db,doc,collection,runTransaction,serverTimestamp,Timestamp,currentUser,now=()=>Date.now()}){
 const admin=()=>{if(!esAdmin(currentUser()))fail('Acceso denegado. Iniciá sesión con tu cuenta administradora.');};
 return {
  async guardarEdicion(raw,expectedVersion=null){
   admin();const data=validarEdicion(raw),ref=doc(db,'ediciones',data.id);
   await runTransaction(db,async tx=>{
    admin();const snap=await tx.get(ref);
    if(snap.exists()){
     const old=snap.data();
     if(expectedVersion===null)fail('Ese número de edición ya existe. Seleccionalo para editar.');
     if(old.estado!=='borrador')fail('Solo se pueden editar ediciones en borrador desde este panel.');
     if((old.versionGestion??0)!==expectedVersion)fail('La edición cambió. Recargá antes de guardar.');
     const used=capacity(old,0);
     if(data.cupos<used)fail('Los cupos totales no pueden ser menores que los ya reservados.');
     const {id,...fields}=data;
     tx.update(ref,{...fields,versionGestion:expectedVersion+1,actualizadaEn:serverTimestamp()});
    }else{
     if(expectedVersion!==null)fail('La edición ya no existe. Recargá el panel.');
     const {id,...fields}=data;
     tx.set(ref,{...fields,estado:'borrador',cuposReservados:0,versionGestion:1,creadaEn:serverTimestamp(),actualizadaEn:serverTimestamp()});
    }
   });
   return data.id;
  },
  async reservarSolicitud(solicitudId){
   admin();
   const requestRef=doc(db,'solicitudes',solicitudId),reservationId='solicitud_'+solicitudId;
   const ref=doc(db,'reservas',reservationId);
   await runTransaction(db,async tx=>{
    admin();const [requestSnap,existing]=await Promise.all([tx.get(requestRef),tx.get(ref)]);
    if(existing.exists())fail('Esta solicitud ya tiene una reserva. Revisala en Reservas o Pedidos confirmados.');
    if(!requestSnap.exists())fail('La solicitud ya no existe.');
    const r=requestSnap.data();
    if(!['NUEVA_CONSULTA','CONTACTADA'].includes(r.estado))fail('Reactivá la solicitud antes de reservar.');
    const qty=integer(r.cantidad,1,20,'la cantidad');
    const editionRef=doc(db,'ediciones',r.edicionId),editionSnap=await tx.get(editionRef);
    if(!editionSnap.exists())fail('La edición no existe.');
    const e=editionSnap.data(),used=capacity(e,qty),amount=prices(e,qty);
    const cliente={};
    for(const field of ['nombre','apodo','email','telefono','entrega','direccion','localidad','provincia','codigoPostal'])cliente[field]=r[field]??'';
    tx.update(editionRef,{cuposReservados:used+qty});
    tx.set(ref,{solicitudId,edicionId:r.edicionId,edicionNombre:e.nombre||r.edicionId,
     referencia:r.nombre||'Solicitud',cliente,cantidad:qty,...amount,costoEnvio:r.entrega==='local'?0:null,
     estado:'PENDIENTE_PAGO',origen:'SOLICITUD',creadaEn:serverTimestamp(),venceEn:Timestamp.fromMillis(now()+48*60*60*1000)});
   });
   return reservationId;
  },
  async reservaManual(edicionId,referencia,cantidad){
   admin();const qty=integer(cantidad,1,20,'la cantidad'),name=text(referencia,80,'la referencia',true);
   const ref=doc(collection(db,'reservas')),editionRef=doc(db,'ediciones',edicionId);
   await runTransaction(db,async tx=>{
    admin();const snap=await tx.get(editionRef);
    if(!snap.exists())fail('La edición no existe.');
    const e=snap.data(),used=capacity(e,qty),amount=prices(e,qty);
    tx.update(editionRef,{cuposReservados:used+qty});
    tx.set(ref,{edicionId,edicionNombre:e.nombre||edicionId,referencia:name,cantidad:qty,...amount,costoEnvio:null,
     estado:'PENDIENTE_PAGO',origen:'ADMIN',creadaEn:serverTimestamp(),venceEn:Timestamp.fromMillis(now()+48*60*60*1000)});
   });
   return ref.id;
  },
  async cambiarReserva(id,next,{verificado=false,costoEnvio,subtotalLegacy}={}){
   admin();if(!['CONFIRMADA','CANCELADA'].includes(next))fail('Acción inválida.');
   const ref=doc(db,'reservas',id);
   await runTransaction(db,async tx=>{
    admin();const snap=await tx.get(ref);if(!snap.exists())fail('La reserva no existe.');
    const r=snap.data();
    if(r.estado!=='PENDIENTE_PAGO')fail('La reserva ya cambió de estado. Recargá el panel.');
    const editionRef=doc(db,'ediciones',r.edicionId),eSnap=await tx.get(editionRef);
    if(!eSnap.exists())fail('La edición no existe.');
    const qty=integer(r.cantidad,1,20,'la cantidad'),used=capacity(eSnap.data(),0);
    if(used<qty)fail('Contador inconsistente; no se modificó nada.');
    const patch={estado:next,actualizadaEn:serverTimestamp()};
    if(next==='CANCELADA')tx.update(editionRef,{cuposReservados:used-qty});
    else{
     if(!verificado)fail('Confirmá que verificaste el pago recibido.');
     const expiry=r.venceEn?.toMillis?.()??Date.parse(r.venceEn);
     if(!Number.isFinite(expiry)||expiry<=now())fail('La reserva venció. Cerrala y revisá disponibilidad antes de tomar otro pedido.');
     const subtotal=integer(r.subtotal??subtotalLegacy,1,2000000000,'el importe de las cartitas');
     const shipping=r.cliente?.entrega==='local'?0:integer(costoEnvio,0,100000000,'el costo de envío');
     Object.assign(patch,{subtotal,costoEnvio:shipping,total:subtotal+shipping,pagoVerificadoEn:serverTimestamp(),preparacion:'PENDIENTE'});
    }
    tx.update(ref,patch);
   });
  },
  async actualizarPedido(id,raw){
   admin();const state=raw.preparacion;
   if(!['PENDIENTE','EN_PREPARACION','LISTA','DESPACHADA','ENTREGADA'].includes(state))fail('Estado de preparación inválido.');
   const tracking=text(raw.seguimiento,100,'el seguimiento'),date=text(raw.fechaDespacho,10,'la fecha de despacho');
   const correo=text(raw.correo,80,'la empresa de correo'),urlSeguimiento=text(raw.urlSeguimiento,1000,'el enlace de seguimiento');
   if(urlSeguimiento){
    let url;try{url=new URL(urlSeguimiento);}catch{fail('Enlace de seguimiento inválido.');}
    if(url.protocol!=='https:'||url.username||url.password)fail('El enlace de seguimiento debe ser HTTPS y sin credenciales.');
   }
   const parsed=new Date(date+'T12:00:00Z');
   if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date))fail('Revisá la fecha de despacho.');
   if(date&&date>new Date(now()).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}))fail('La fecha de despacho no puede ser futura.');
   const ref=doc(db,'reservas',id);
   await runTransaction(db,async tx=>{
    admin();const snap=await tx.get(ref);if(!snap.exists()||snap.data().estado!=='CONFIRMADA')fail('Solo se puede preparar un pedido confirmado.');
    const local=snap.data().cliente?.entrega==='local';
    if(['DESPACHADA','ENTREGADA'].includes(state)&&!local&&(!tracking||!date||!correo))fail('Completá empresa de correo, seguimiento y fecha de despacho para el envío.');
    tx.update(ref,{preparacion:state,seguimiento:tracking,fechaDespacho:date,correo,urlSeguimiento,actualizadaEn:serverTimestamp()});
   });
  }
 };
}
