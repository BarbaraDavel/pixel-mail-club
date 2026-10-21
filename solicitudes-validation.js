// Esquema público; Firestore vuelve a validar cada campo en el servidor.
export function validarSolicitud(raw,comunicaciones){
 const data={edicionId:'001',comunicaciones:!!comunicaciones};
 const limits={nombre:100,apodo:60,email:254,telefono:25,localidad:80,provincia:80,codigoPostal:12,direccion:200};
 for(const [key,max] of Object.entries(limits)){
  const value=String(raw[key]??'').trim();
  if(value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Revisá el campo '+key+'.');
  if(!['apodo','direccion'].includes(key)&&!value)throw new Error('Completá el campo '+key+'.');
  data[key]=value;
 }
 data.email=data.email.toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw new Error('Revisá el email.');
 if(!/^[+0-9() .-]{6,25}$/.test(data.telefono))throw new Error('Revisá el WhatsApp (mínimo 6 caracteres).');
 if(!/^[A-Za-z0-9 -]{3,12}$/.test(data.codigoPostal))throw new Error('Revisá el código postal.');
 data.cantidad=Number(raw.cantidad);
 if(!Number.isSafeInteger(data.cantidad)||data.cantidad<1||data.cantidad>20)throw new Error('Elegí entre 1 y 20 cartitas.');
 if(!['domicilio','sucursal','local'].includes(raw.entrega))throw new Error('Elegí la entrega.');
 data.entrega=raw.entrega;
 if(data.entrega==='domicilio'&&!data.direccion)throw new Error('Completá la dirección de entrega.');
 if(data.entrega!=='domicilio')data.direccion='';
 if(!raw.condiciones)throw new Error('Aceptá las condiciones para continuar.');
 return data;
}
