import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './v12-firebase-config.js';
import {MAILCLUB_API_URL} from './public-config.js';
const $=s=>document.querySelector(s);
const form=$('#signup'), status=$('#status'), button=$('#submit');
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);
let edition=null;
const DEMO_MODE=!MAILCLUB_API_URL;
const firebaseApp=getApps().length?getApp():initializeApp(firebaseConfig);
const firestore=getFirestore(firebaseApp);
const auth=getAuth(firebaseApp);
const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
function applyEdition(data){if(!data)return;setText('#editionTitle',data.nombre||'Pixel Mail Club');setText('#editionDescription',data.descripcion||data.periodo||'');setText('#editionBadge',`EDICIÓN ${data.id||'001'} · ${(data.periodo||'').toUpperCase()}`);setText('#selectedEdition',`Edición ${data.id||'001'} · ${data.periodo||''}`);const list=$('#editionContents');if(list&&Array.isArray(data.contenido)){list.replaceChildren(...data.contenido.map(item=>{const li=document.createElement('li');li.textContent=item;return li;}));}document.body.dataset.theme=/^[a-z-]+$/.test(data.tema||'')?data.tema:'navidad';if(data.imagen&&/^\.\.?\/[a-zA-Z0-9_./-]+$/.test(data.imagen)){const art=$('.hero-art');if(art)art.src=data.imagen;}}
const endpoint=(action)=>MAILCLUB_API_URL.replace(/\/$/,'')+'/'+action;
function showPrice(){
 const qty=Number(form.elements.cantidad.value||0), valid=Number.isSafeInteger(qty)&&qty>=1&&qty<=20;
 const priceValid=Number.isSafeInteger(edition?.precio)&&edition.precio>0;
 $('#unitPrice').textContent=priceValid?money(edition.precio):'Precio por definir';
 $('#totalPrice').textContent=priceValid&&valid?money(edition.precio*qty):'A confirmar';
 const shipping=$('#shippingEstimate'), grand=$('#grandTotal');
 const local=form.elements.entrega.value==='local';
 if(shipping)shipping.textContent=local?'Sin costo':'A cotizar';
 if(grand)grand.textContent=priceValid&&valid&&local?money(edition.precio*qty):'A confirmar';
 button.disabled=DEMO_MODE||!edition||!valid||!MAILCLUB_API_URL;
}
async function loadEdition(){
 if(DEMO_MODE){
  try{const r=await fetch('./edition-preview.json',{cache:'no-store'});if(r.ok)applyEdition(await r.json());}catch(e){console.warn('Vista previa sin archivo de edición:',e);}
  status.textContent='Vista previa: las reservas y los pagos todavía están deshabilitados.';
  $('#editionPrice').textContent='Precio final pendiente de publicación. Las reservas todavía no están habilitadas.';
  showPrice();
  onAuthStateChanged(auth,async user=>{
    try{
      // Firestore solo permite leer borradores a la administradora.
      // Las reglas del servidor, no este control de interfaz, protegen el documento.
      const snapshot=await getDoc(doc(firestore,'ediciones','001'));
      if(!snapshot.exists())return;
      const data={id:snapshot.id,...snapshot.data()};
      if(data.estado!=='publicada'&&user?.uid!=='LSf6e03U0xfPDVG3Wmam9BXuAm13')return;
      edition=data;
      applyEdition(data);
      showPrice();
      $('#editionPrice').textContent=data.estado==='publicada'
        ?'El envío se abona por separado. Reservas aún no habilitadas.'
        :'Vista previa de administración · precio de prueba · edición en borrador.';
    }catch(error){
      if(error.code!=='permission-denied')console.warn('No se pudo consultar la edición:',error);
      edition=null;
      showPrice();
    }
  });
  return;
 }
 try{const res=await fetch(endpoint('edition'),{headers:{Accept:'application/json'}});const json=await res.json();if(!res.ok)throw new Error(json.error||'No se pudo consultar la edición');
 edition=json.edition;applyEdition(edition);if(!edition||!Number.isSafeInteger(edition.precio)||edition.precio<=0)throw new Error('La edición no tiene un precio válido.');
 $('#editionTitle').textContent=edition.nombre;$('#editionDescription').textContent=edition.descripcion||edition.periodo;$('#editionBadge').textContent=`EDICIÓN ${edition.id} · ${(edition.periodo||'').toUpperCase()}`;$('#selectedEdition').textContent=`Edición ${edition.id} · ${edition.periodo}`;$('#editionPrice').textContent='El envío se abona por separado y está a cargo del comprador.';showPrice();
 }catch(err){status.textContent=err.message;$('#editionPrice').textContent='Inscripciones temporalmente no disponibles.';}
}
form.elements.cantidad.addEventListener('input',showPrice);
form.elements.entrega.addEventListener('change',()=>{
 const local=form.elements.entrega.value==='local';
 const addr=form.elements.direccion.closest('label');
 if(addr)addr.hidden=local||form.elements.entrega.value==='sucursal';
 showPrice();
});
form.elements.entrega.dispatchEvent(new Event('change'));
form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity()||!edition)return;const fd=new FormData(form);const data=Object.fromEntries(fd.entries());data.cantidad=Number(data.cantidad);data.comunicaciones=fd.has('comunicaciones');data.edicionId=edition.id;delete data.condiciones;
 button.disabled=true;status.textContent='Registrando tu solicitud…';$('#transferInstructions').hidden=true;
 try{const res=await fetch(endpoint('subscribe'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const json=await res.json();if(!res.ok)throw new Error(json.error||'No se pudo registrar la solicitud');
 if(json.checkoutUrl){location.assign(json.checkoutUrl);return;}
 status.textContent=`Recibimos tu inscripción ${json.reference||''}. Está pendiente de pago; todavía no está confirmada.`;
 if(json.transferInstructions){const el=$('#transferInstructions');el.textContent=json.transferInstructions;el.hidden=false;}
 form.reset();showPrice();
 }catch(err){status.textContent='No se pudo registrar: '+err.message;}finally{showPrice();}
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
