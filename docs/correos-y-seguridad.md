# Correos preparados; envíos y despliegue desactivados

## Estado de esta rama

No modifica Firestore de producción, no publica 001, no cambia precio ni cupos,
no habilita pagos y no despliega reglas. Los módulos no se importan desde el portal.
Hosting excluye server, emails, scripts, tests y docs. No hay proveedor, credenciales,
conexiones Gmail, función desplegada ni llamadas de red para enviar correo.

`emails/templates.js` genera HTML de tablas con estilos inline y ajuste móvil, más texto
alternativo. Usa el zorrito oficial servido por el hosting de Pixel; si el cliente bloquea
imágenes conserva el nombre y texto alternativo. Verificar la URL de imagen en el entorno
definitivo y probar Gmail móvil/escritorio antes de activar. Los datos se escapan; enlaces
de seguimiento solo HTTPS sin credenciales. Se usa la hora argentina exacta del registro
`venceEn` (no se vuelve a calcular al reintentar). Datos de importes ausentes: “A confirmar”.
Las instrucciones de pago solo aparecen con `pagosHabilitados === true` en la configuración.

## Integración backend pendiente de conexión

`server/email-events.js` exporta `crearIntegracion({db})`, compatible con un cliente Admin
Firestore inyectado. Un futuro trigger `onDocumentWritten` deberá llamar:

```js
await integracion.onDocumentWritten({
  collection: 'reservas', id: snapshot.id,
  before: beforeSnapshot.exists ? beforeSnapshot.data() : null,
  after: afterSnapshot.exists ? afterSnapshot.data() : null,
  edition: editionSnapshot.data()
});
```

Registrar solo `solicitudes/{id}` y `reservas/{id}`; nunca el outbox. Solicitud: creación
NUEVA_CONSULTA. Reserva: creación PENDIENTE_PAGO. Pago: transición a CONFIRMADA y
`pagoVerificadoEn` presente. Despacho: transición a DESPACHADA de un pedido CONFIRMADA.
El panel ahora permite cargar empresa y enlace de seguimiento, además de fecha y número.
El retiro local no genera un falso correo de despacho: si faltan datos postales se bloquea;
necesita un mensaje de retiro en una futura ampliación.

Cada evento crea mediante transacción un documento privado en `emailOutbox` con clave
SHA-256 de colección, ID e hito. Reintentos o invocaciones concurrentes no lo reemplazan.
Registra destinatario, contenido, estado, fechas, intentos, fecha de envío y resultado.
Estados actuales: PREPARED_DISABLED o BLOCKED (sin destinatario, datos incompletos o 999).
`procesar()` devuelve DISABLED sin acceder a un proveedor. La configuración de pagos y
nombre de edición debe leerse en servidor; nunca aceptar esos datos desde el navegador.
Los correos preparados son una foto del evento; no regenerarlos automáticamente si cambia
el precio. No hay escaneo ni envío retroactivo de documentos existentes.

Antes de activar, implementar un worker y adaptar el registro a SENDING/SENT/FAILED/UNKNOWN,
con bloqueo transaccional, identificador del proveedor, timestamp y errores saneados.
Un timeout después de enviar es ambiguo: NO reintentar automáticamente; conciliar primero.
Gmail no ofrece una clave de idempotencia para garantizar entrega exactamente una vez;
el outbox actual evita duplicar eventos, pero no promete entrega exactamente una vez.
Los eventos Firestore pueden llegar fuera de orden: implementar orden por solicitud/pedido
y descartar mensajes obsoletos antes de conectar el worker. Aprobar política de retención
del outbox, que contiene datos personales; solo administración lo lee desde el SDK.

## Gmail oficial de Pixel: opción recomendada

Usar Gmail API con OAuth 2.0 de servidor y alcance mínimo `gmail.send`. La dueña autoriza
la cuenta Pixel; no se solicita su contraseña. Flujo con validación de state y redirect URI
exacta; `access_type=offline` para obtener refresh token. Guardar client secret y refresh
token en un gestor de secretos o credenciales cifradas del backend/n8n, nunca en Git,
Firestore público, HTML o configuración Firebase del navegador. Validar remitente o alias
autorizado. Conectar Gmail en ChatGPT no autoriza por sí mismo al futuro servidor.

Referencias oficiales:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/workspace/gmail/api/auth/web-server

La elección del runtime (por ejemplo n8n propio o backend) y sus costos sigue pendiente;
no añadir Cloud Functions ni cambiar el plan Firebase para esta preparación.

## Inscripciones cerradas por defecto

Reglas y portal exigen simultáneamente `estado == 'publicada'` e
`inscripcionesAbiertas == true` para las solicitudes públicas 001. Falta del campo,
false, edición inexistente o borrador bloquean el SDK. Esto requerirá una apertura futura
explícita del campo por administración; no se escribe ese campo en esta rama.
999 conserva exclusivamente el acceso privado de las dos administradoras no anónimas,
con UID propio y esquema completo. No se cambia ningún UID ni se habilita una inscripción
pública para 999. El outbox rechaza todas las escrituras desde SDK, incluso de administradoras;
solo un backend IAM autorizado podrá registrar eventos.

## Validación local

`npm test` prueba HTML, texto, escaping, enlaces, importes, fechas, transiciones,
duplicados concurrentes y bloqueo de envíos. `npm run test:rules` usa únicamente
`demo-pixel-mail-club` y prueba apertura/cierre, borrador, 999 y privacidad del outbox.
Los tests no contienen proveedor de email ni pueden enviar mensajes.
La revisión visual en clientes reales y el worker de entrega quedan pendientes de autorización.
