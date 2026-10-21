# Solicitudes privadas · publicación manual

## Qué publicar en Firebase

1. En Firebase, proyecto **pixel-mail-club → Firestore Database → Reglas**, copiar **todo el contenido de `firestore.rules`** y pulsar **Publicar**. Es el archivo completo y vigente; no copiar `firestore-solicitudes-propuesta.rules`, que quedó como referencia histórica. Guardar una copia de las reglas actuales antes de reemplazarlas y comparar si se modificaron fuera de este repositorio.
2. En **Authentication → Sign-in method**, habilitar **Anónimo** si todavía no está habilitado. Mantener el proveedor por enlace de email existente y los dominios autorizados.
3. No cambiar el estado de la edición 001, su precio ni sus cupos. No crear documentos de prueba en producción para ejecutar los tests.

Las reglas conservan el UID administrador existente: `LSf6e03U0xfPDVG3Wmam9BXuAm13`. Debe coincidir con el UID de tu cuenta en Authentication; no con su email. Las reglas de ediciones y reservas mantienen los permisos anteriores.

## Protección contra abuso

- El servidor permite crear únicamente `solicitudes/001_UID`, con autenticación anónima y UID propio. Una identidad puede enviar una solicitud por edición; el visitante no puede leerla, modificarla ni borrarla. Tampoco puede crear IDs aleatorios o inyectar precio, pagos, cupos u otros campos.
- Tipos, formatos, longitudes, cantidad de 1 a 20, dirección a domicilio y fecha de servidor se validan en reglas. El navegador agrega normalización, un campo trampa, tiempo mínimo y bloqueo del doble clic. Estos últimos son medidas auxiliares, no barreras del servidor.
- La identidad del formulario usa una instancia Firebase separada. No cierra ni reemplaza la sesión por email de la administradora. No se anuncia que el email informado esté verificado.
- **App Check con reCAPTCHA Enterprise (Fraud Defense).** El código usa `ReCaptchaEnterpriseProvider` con la clave pública del sitio en `app-check-config.js`. En Google Cloud, la clave debe ser Web, basada en puntuación (sin desafíos), de producción y con verificación de dominio habilitada para `barbaradavel.github.io`. Registrar esa misma clave en Firebase App Check con el proveedor Fraud Defense / reCAPTCHA Enterprise. Nunca incluir claves secretas en GitHub.
- La clave pública ya está incorporada. Después de integrar el cambio, esperar el despliegue de GitHub Pages y recargar con Ctrl+F5. Comprobar en App Check las solicitudes verificadas de la página pública y de administración antes de aplicar Enforcement. Si falla la verificación, revisar proveedor, clave y dominio; no asumir que guardar la clave en Firebase alcanza por sí solo.
- Comprobar recepción y administración con esa configuración; después, en **App Check → APIs → Cloud Firestore**, activar **Enforcement / Aplicar**. No activarlo antes de configurar la clave y desplegar todos los clientes que acceden a este proyecto, incluido cualquier otro sistema de gestión. El código prepara App Check tanto para la página pública como para admin.
- Sin App Check aplicado, alguien puede borrar datos del navegador u obtener nuevas identidades y evadir el límite por UID. App Check reduce abuso, pero no sustituye un límite global o por IP. Para campañas de alto tráfico, incorporar un backend con limitación de solicitudes y CAPTCHA validado en servidor. Revisar uso y cuotas en Firebase. No se implementa un límite por IP desde Firestore Rules porque las reglas no disponen de esa información.

## Comprobación manual después de publicar

1. Desde una ventana privada, completar el formulario y enviar. Debe confirmar recepción sin WhatsApp, comprobante, checkout ni plazo de pago.
2. Con la cuenta administradora, abrir `admin.html` y **Actualizar solicitudes**. Revisar datos y cambiar estado a CONTACTADA o ARCHIVADA.
3. Comprobar que el contador de cupos y las reservas previas no cambiaron. La lista carga 25 solicitudes por página.
4. Reenviar desde la misma identidad debe ser rechazado; un visitante no puede listar ni consultar solicitudes, ni siquiera la propia.
5. Cerrar sesión administradora: se ocultan los datos privados. Probar otra cuenta: acceso denegado.

## Tests locales aislados

`npm ci`, `npm test` y `npm run test:rules`.

Los tests de reglas usan el proyecto demo **demo-pixel-mail-club**, nunca producción, con el emulador de Firestore y Java 17 o superior compatible con Firebase CLI 14.22. Cubren privacidad, esquema, duplicados, UID ajeno, moderación y conservación de cupos/reservas. El emulador no comprueba Enforcement de App Check: esa comprobación debe hacerse después de configurarlo.

No se despliegan reglas automáticamente y no se habilitan pagos desde este cambio.

## Gestión privada de ediciones, reservas y pedidos

El admin ahora organiza las consultas, reservas y pedidos por edición. Los pedidos confirmados son las mismas reservas con estado CONFIRMADA; no se copian a otra colección ni se vuelven a descontar cupos.

### Un índice nuevo, sin cambios de reglas

Las reglas de Firestore y App Check se conservan. **No es necesario volver a publicar reglas ni cambiar Enforcement.** Para filtrar solicitudes por edición y mostrar primero las más recientes, crear un índice compuesto:

1. Firebase → Firestore Database → Índices → Compuesto → Crear índice.
2. ID de colección: **solicitudes**. Alcance de consulta: **Colección**.
3. Campo **edicionId**, orden **Ascendente**; campo **creadaEn**, orden **Descendente**.
4. Guardar y esperar el estado **Habilitado / Enabled**. Luego recargar admin.html.

El índice también se define en `firestore.indexes.json`. Si usás Firebase CLI, desde este repositorio: `npx firebase deploy --only firestore:indexes --project pixel-mail-club`. Este comando publica índices, no reglas ni hosting. No ejecutes un deploy general para este cambio.

### Cómo usar el taller

- Seleccioná la edición arriba para ver sus cupos, solicitudes, reservas y pedidos.
- **Ediciones:** editá nombre, período, descripción, contenido (un elemento por renglón), precio entero ARS y cupos. Guardar mantiene el borrador. Podés crear ediciones nuevas con tres dígitos. No se pueden sobrescribir ediciones publicadas desde este editor.
- **Precio 0:** significa pendiente de definir. Se puede guardar el borrador, pero crear una reserva requiere un precio mayor que cero. No se publica ningún precio en la página del cliente por guardar acá.
- **Solicitudes:** Nueva consulta, Contactada y Archivada organizan el seguimiento. Cambiar esos estados no manda mensajes, no reserva y no cobra. Archivar tampoco cancela una reserva existente.
- **Crear reserva · 48 h:** botón en una solicitud activa. Confirmá en el diálogo. La transacción guarda sus datos de contacto y entrega, cantidad, precio de ese momento y vínculo con la solicitud. Usa un ID estable: reintentos o dos pestañas no crean dos reservas para la misma solicitud.
- **Una reserva por solicitud:** incluso cancelada conserva su vínculo e historial; no se recrea automáticamente. Si acordás una nueva reserva con esa persona, podés crearla manualmente y usar una referencia clara.
- **Reservas manuales:** disponibles dentro del desplegable. Se conservan las reservas anteriores, incluso las de prueba o incompletas, en las secciones correspondientes; no se migran ni se borran datos existentes.
- **Verificar pago y confirmar:** solo para reservas vigentes. Ingresá el costo de envío acordado (0 cuando corresponda) y marcá que verificaste el pago recibido. En reservas anteriores sin importe, cargá también el subtotal de cartitas. Esto registra una verificación manual y no realiza ningún cobro, no habilita checkout ni envía mensajes.
- **Pedidos confirmados:** aparecen luego de confirmar el pago, con datos, importes, preparación y seguimiento. Estados: Por preparar, En preparación, Lista para entregar, Despachada y Entregada. Para envíos despachados o entregados se requieren número de seguimiento y fecha de despacho; el retiro local no requiere seguimiento.
- **Cancelar / Cerrar vencida:** devuelve cupos una sola vez mediante transacción. Una reserva vencida no se puede confirmar. Los cupos no se liberan solos al cumplirse las 48 h.
- **Modificar cupos o precio:** no permite bajar la capacidad por debajo de lo ocupado y no altera el precio guardado en reservas anteriores. Si otro editor guardó el borrador, se pide recargar antes de sobrescribirlo.

La página pública sigue recibiendo solicitudes para la edición 001. Crear otro borrador no abre inscripciones ni cambia automáticamente el archivo de presentación público. Los pagos públicos y la publicación siguen pendientes de una decisión posterior.

### Validación del circuito nuevo

`npm test` comprueba validación pública. `npm run test:rules` ejecuta pruebas de reglas y de las operaciones reales del admin en el emulador: conversión simultánea, últimos cupos, precio pendiente, borradores, conservación del contador y precio, confirmación manual, vencimiento/cancelación, historial, envío y acceso de otras identidades.

Después del despliegue, revisar el índice, abrir admin.html con Ctrl+F5 y confirmar que siguen presentes las reservas anteriores. Probar el circuito de reserva/pedido únicamente cuando ya estén definidos los costos y quieras registrar una operación interna; las pruebas automatizadas nunca se ejecutan contra Firebase de producción.


## Prueba completa del portal en la edición 999

Publicar manualmente el archivo completo `firestore.rules` en Firebase Console → Firestore Database → Reglas → Publicar, después de revisar el cambio. Guardar o mergear el PR no publica reglas.

La única ruta nueva de creación permite a la administradora enviar solicitudes para la edición 999, siempre que exista y siga en borrador. Exige su UID, un ID con prefijo `999_UID_`, el mismo esquema de campos y timestamp de servidor. Visitantes y otras cuentas no pueden enviar ni leer las solicitudes de prueba. El formulario público anónimo sigue limitado a 001 y conserva su ID único por UID. No se cambian permisos de reservas ni publicación de ediciones; no se habilitan pagos. App Check continúa aplicado en ambos formularios. No hace falta crear nuevos índices.

1. Mergear y esperar que GitHub Pages termine de desplegar. Publicar las reglas anteriores.
2. Mantener la sesión de administradora que usás en admin, en el mismo navegador/perfil.
3. Seleccionar 999 · PRUEBA en admin → Solicitudes → Abrir formulario de prueba del portal. También se puede abrir `prueba.html` junto a `index.html`. La edición 999 debe permanecer como borrador, con precio de prueba mayor a cero y cupos disponibles.
4. Completar el formulario con datos de prueba y enviar. No debe cambiar ningún cupo. El formulario comparte JS y validación con el público; en prueba escribe con la sesión administradora para no abrir el borrador a visitantes. Por lo tanto, esta prueba comprueba el recorrido de datos y administración; el acceso anónimo público 001 se verifica por separado con el formulario público.
5. Volver al enlace del admin (selecciona 999), actualizar solicitudes y crear la reserva desde la tarjeta recibida. Comprobar nombre, apodo, email, teléfono, entrega, destino y cantidad; se ocupa un cupo por cartita una sola vez.
6. Solo en estos registros de prueba, simular la verificación manual del pago con envío 0; comprobar el pedido confirmado y luego guardar preparación y seguimiento. No realizar transferencias ni pagos.
7. La edición 001, sus solicitudes y reservas existentes deben conservar sus datos y cupos. Mantener 999 sin publicar. Los registros de prueba quedan identificados por su edición; no borrar reservas confirmadas para ajustar contadores.

El ID se genera una vez al abrir la prueba y se conserva al reintentar, para evitar duplicados por errores de conexión. Recargar permite crear una prueba nueva. Si un envío parece haber fallado, actualizar primero Solicitudes de la edición 999 antes de recargar. La página de prueba oculta y vacía el formulario cuando se cierra la sesión; la protección efectiva está en las reglas.
