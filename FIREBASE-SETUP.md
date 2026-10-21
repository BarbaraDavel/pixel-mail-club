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
- **Pendiente de configurar con tus claves: App Check.** Registrar la aplicación web con reCAPTCHA v3 en Firebase App Check y autorizar el dominio de GitHub Pages. Poner la **clave pública del sitio** en `app-check-config.js` y subir el cambio. Nunca poner la clave secreta en GitHub.
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
