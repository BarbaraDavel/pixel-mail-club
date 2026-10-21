# Backend Gmail de Pixel Mail Club (preparado, desactivado)

Este backend agrega una callable Function privada para enviar las cuatro plantillas aprobadas usando Gmail API.

## Protecciones

- `EMAILS_ENABLED` es un parámetro de Functions con valor predeterminado `false`. Mientras siga así, no envía mensajes.
- Solo acepta llamadas autenticadas de los dos UID administradores existentes; rechaza usuarios anónimos.
- Requiere App Check.
- Los correos se construyen a partir de documentos de Firestore; el cliente no puede elegir arbitrariamente el destinatario.
- Solicitud: solo `NUEVA_CONSULTA` o `CONTACTADA`.
- Reserva: solo `PENDIENTE_COTIZACION` o `PENDIENTE_PAGO`.
- Pago: solo reserva `CONFIRMADA` con `pagoVerificadoEn`.
- Despacho: solo pedido confirmado con `preparacion: DESPACHADA`.
- Registra intentos en `emailDispatches` y evita repetir eventos marcados como enviados. Las dos etapas de reserva tienen claves de idempotencia separadas.
- No se despliega automáticamente esta Function desde los workflows de Hosting.

## Configuración pendiente (no hacer todavía en producción)

1. Firebase Functions requiere que el proyecto tenga habilitada facturación/plan compatible. No cambiar el plan sin revisar costos.
2. Descargar el JSON del cliente OAuth de escritorio de Google Cloud y guardarlo localmente como `functions/gmail-oauth-client.json`. Nunca subirlo a GitHub.
3. En la raíz del repositorio ejecutar `node functions/scripts/gmail-oauth-setup.mjs`. Autorizar con `pixel.stickersss@gmail.com`. El refresh token se guarda localmente en `functions/.gmail-refresh-token`.
4. Cargar los secretos por terminal interactiva, sin pegarlos en archivos ni chats:
   - `firebase functions:secrets:set GMAIL_CLIENT_ID`
   - `firebase functions:secrets:set GMAIL_CLIENT_SECRET`
   - `firebase functions:secrets:set GMAIL_REFRESH_TOKEN`
   Introducir los valores cuando la CLI los solicite. El refresh token se puede leer localmente desde `functions/.gmail-refresh-token`.
5. Desplegar solo la Function, después de revisar el plan y los secretos: `firebase deploy --only functions:enviarCorreoMailClub`.
6. Mantener `EMAILS_ENABLED=false`. Antes de habilitar, integrar un botón administrativo con confirmación y realizar pruebas controladas con destinatarios propios de prueba.
7. La app OAuth está en modo de prueba; los tokens de usuario de prueba pueden caducar. No publicar ni pedir verificación de Google sin revisar previamente los requisitos de marca y privacidad.

## Llamada

La callable `enviarCorreoMailClub` espera `{ evento, documentoId }`, con evento `solicitud | reserva | pago | despacho`. No está conectada al panel todavía. No activar envíos reales hasta integrar y revisar el flujo administrativo.
