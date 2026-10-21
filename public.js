import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './v12-firebase-config.js';
import { validarSolicitud } from './solicitudes-validation.js';
import { protegerApp } from './app-check.js';
const $=s=>document.querySelector(s);
const form=$('#signup'), status=$('#status'), button=$('#submit');
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);
let edition=null;
let sending=false, submitted=false;
const openedAt=Date.now();
const firebaseApp=getApps().length?getApp():initializeApp(firebaseConfig);
protegerApp(firebaseApp);
const firestore=getFirestore(firebaseApp);
// Identidad anónima separada: nunca reemplaza el acceso por email de la administradora.
const intakeApp=getApps().find(app=>app.name==='solicitudes')||initializeApp(firebaseConfig,'solicitudes');
protegerApp(intakeApp);
const intakeAuth=getAuth(intakeApp),intakeDb=getFirestore(intakeApp);
const auth=getAuth(firebaseApp);
const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
function applyEdition(data){if(!data)return;setText('#editionTitle',data.nombre||'Pixel Mail Club');setText('#editionDescription',data.descripcion||data.periodo||'');setText('#editionBadge',`EDICIÓN ${data.id||'001'} · ${(data.periodo||'').toUpperCase()}`);setText('#selectedEdition',`Edición ${data.id||'001'} · ${data.periodo||''}`);const list=$('#editionContents');if(list&&Array.isArray(data.contenido)){list.replaceChildren(...data.contenido.map(item=>{const li=document.createElement('li');li.textContent=item;return li;}));}document.body.dataset.theme=/^[a-z-]+$/.test(data.tema||'')?data.tema:'navidad';if(data.imagen&&/^\.\.?\/[a-zA-Z0-9_./-]+$/.test(data.imagen)){const art=$('.hero-art');if(art)art.src=data.imagen;}}
function showPrice(){
 const qty=Number(form.elements.cantidad.value||0), valid=Number.isSafeInteger(qty)&&qty>=1&&qty<=20;
 const priceValid=Number.isSafeInteger(edition?.precio)&&edition.precio>0;
 $('#unitPrice').textContent=priceValid?money(edition.precio):'Precio por definir';
 $('#totalPrice').textContent=priceValid&&valid?money(edition.precio*qty):'A confirmar';
 const shipping=$('#shippingEstimate'), grand=$('#grandTotal');
 const local=form.elements.entrega.value==='local';
 if(shipping)shipping.textContent=local?'Sin costo':'A cotizar';
 if(grand)grand.textContent=priceValid&&valid&&local?money(edition.precio*qty):'A confirmar';
 button.disabled=!valid||sending||submitted;
 button.textContent=submitted?'Solicitud recibida 💌':sending?'Enviando…':'Enviar solicitud privada 💌';
}
async function loadEdition(){
 try{const r=await fetch('./edition-preview.json',{cache:'no-store'});if(r.ok)applyEdition(await r.json());}catch{}
 status.textContent='Podés enviar una solicitud privada. No reserva cupos ni inicia las 48 horas de pago.';
 $('#editionPrice').textContent='Precio por definir · envío a cotizar. Los pagos todavía no están habilitados.';
 showPrice();
 onAuthStateChanged(auth,async user=>{
  if(user?.uid!=='LSf6e03U0xfPDVG3Wmam9BXuAm13'){edition=null;showPrice();return;}
  try{
   const snapshot=await getDoc(doc(firestore,'ediciones','001'));
   if(!snapshot.exists()||auth.currentUser?.uid!==user.uid)return;
   // La vista pública usa únicamente el archivo de presentación; no publica el borrador.
   edition={id:snapshot.id,...snapshot.data()};showPrice();
  }catch{edition=null;showPrice();}
 });
}
form.elements.cantidad.addEventListener('input',showPrice);
form.elements.entrega.addEventListener('change',()=>{
 const local=form.elements.entrega.value==='local';
 const addr=form.elements.direccion.closest('label');
 if(addr)addr.hidden=local||form.elements.entrega.value==='sucursal';
 form.elements.direccion.required=form.elements.entrega.value==='domicilio';
 showPrice();
});
form.elements.entrega.dispatchEvent(new Event('change'));
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(sending||submitted)return;
 if(!form.reportValidity())return;
 const fd=new FormData(form);
 if(fd.get('website')||Date.now()-openedAt<3000){status.textContent='Esperá unos segundos y revisá tus datos antes de enviar.';return;}
 let data;
 try{data=validarSolicitud(Object.fromEntries(fd),fd.has('comunicaciones'));}
 catch(error){status.textContent=error.message;return;}
 sending=true;showPrice();status.textContent='Enviando tu solicitud privada…';
 try{
  await intakeAuth.authStateReady();
  const user=intakeAuth.currentUser||(await signInAnonymously(intakeAuth)).user;
  if(!user.isAnonymous)throw new Error('anonymous-required');
  // ID estable + create-only en reglas: ni reintentos ni dos pestañas duplican una solicitud.
  await setDoc(doc(intakeDb,'solicitudes','001_'+user.uid),{
   ...data,uid:user.uid,estado:'NUEVA_CONSULTA',creadaEn:serverTimestamp()
  });
  submitted=true;
  status.textContent='¡Recibimos tu solicitud! Pixel se comunicará con vos. No reservaste cupos ni tenés que pagar todavía.';
  form.reset();
 }catch(error){
  status.textContent=error.code==='permission-denied'
   ?'No se pudo guardar. Si ya enviaste una solicitud desde este navegador, no hace falta repetirla. Si es la primera, contactá a Pixel para revisar la recepción.'
   :error.code==='auth/operation-not-allowed'
   ?'La recepción de solicitudes todavía no está habilitada. Intentá más tarde.'
   :'No pudimos confirmar la recepción. Revisá tu conexión y reintentá: no se duplicará la solicitud.';
 }finally{sending=false;showPrice();}
});
loadEdition();

// V11.1: formulario compacto, tres pasos; conserva validación nativa y envío existente.
let currentStep=0;
const stepSections=[...document.querySelectorAll('.form-step')];
const progressItems=[...document.querySelectorAll('.steps span')];
const prevButton=document.querySelector('#prevStep');
const nextButton=document.querySelector('#nextStep');
function setStep(index){
 currentStep=index;
 stepSections.forEach((section,i)=>{section.classList.toggle('active',i===index);section.setAttribute('aria-hidden',String(i!==index));});
 progressItems.forEach((item,i)=>{item.classList.toggle('active',i===index);item.classList.toggle('done',i<index);});
 prevButton.hidden=index===0;
 nextButton.hidden=index===stepSections.length-1;
 document.querySelector('#signup').scrollIntoView({behavior:'smooth',block:'start'});
}
nextButton.addEventListener('click',()=>{
 const fields=[...stepSections[currentStep].querySelectorAll('input,select,textarea')];
 for(const field of fields){if(!field.checkValidity()){field.reportValidity();return;}}
 setStep(Math.min(currentStep+1,stepSections.length-1));
});
prevButton.addEventListener('click',()=>setStep(Math.max(currentStep-1,0)));
