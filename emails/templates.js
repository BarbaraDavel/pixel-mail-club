// Preparación solamente: sin proveedor, triggers, credenciales ni envío.
export const EMAILS_ENABLED=false;
const required=(data,key)=>{
 const value=String(data[key]??'').trim();
 if(!value)throw Error('Falta '+key);
 return value;
};
export function prepararCorreo(evento,data){
 const nombre=required(data,'nombre'),edicion=required(data,'edicion');
 const greetings='Hola, '+nombre+' 💌\n\n';
 const endings='\n\nHecho con amor,\nPixel Mail Club 🦊';
 const templates={
  solicitud:()=>({subject:'Recibimos tu solicitud 💌',text:'¡Gracias por querer ser parte de '+edicion+'! Recibimos tus datos y pronto nos comunicaremos con vos. Esta solicitud todavía no reserva cupos ni requiere un pago.'}),
  reserva:()=>({subject:'Tus cartitas están reservadas 🦊',text:'Reservamos tus cartitas de '+edicion+'. El importe de las cartitas es '+required(data,'subtotal')+' ARS y el envío '+required(data,'envio')+'. Tu reserva vence el '+required(data,'vencimiento')+' (hora argentina). '+required(data,'instruccionesPago')}),
  pago:()=>({subject:'¡Tu pago está confirmado! 💌',text:'Verificamos tu pago de '+required(data,'total')+' ARS para '+edicion+'. ¡Tu pedido está confirmado! Te avisaremos cuando despachemos tus cartitas.'}),
  despacho:()=>({subject:'¡Tus cartitas ya están en camino! ✨',text:'Despachamos tu pedido de '+edicion+' el '+required(data,'fechaDespacho')+'.\nCorreo: '+required(data,'correo')+'\nNúmero de seguimiento: '+required(data,'seguimiento')})
 };
 if(!templates[evento])throw Error('Evento de correo desconocido');
 const message=templates[evento]();
 return {...message,text:greetings+message.text+endings};
}
