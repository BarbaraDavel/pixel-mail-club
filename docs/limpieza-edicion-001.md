# Limpieza preparada: edición 001 · Cartitas bajo el árbol

## Inventario pendiente

No se consultó Firestore de producción: este entorno no dispone de credenciales administrativas.
No hay cantidades ni rutas verificadas todavía. No interpretar esto como cero documentos.
No se aplicó el precio ni se ejecutó ninguna eliminación.

El esquema actual guarda los pedidos confirmados dentro de `reservas`, con estado
`CONFIRMADA`; no existe una colección independiente de pedidos en el código actual.
Se consultan exclusivamente `solicitudes` y `reservas` con `edicionId == '001'`.
Registros sin edición o con otro tipo de dato no se infieren por el nombre del documento.
Si existen colecciones heredadas fuera del esquema, necesitan revisión independiente.

## Vista previa (sin escrituras)

En un equipo de confianza, instalar dependencias con `npm ci` y configurar Application
Default Credentials para una identidad IAM autorizada al proyecto `pixel-mail-club`.
No guardar claves ni credenciales en el repositorio o en el directorio público.

```sh
node scripts/cleanup-001.js
```

Muestra ruta, estado y cantidad de cada documento; separa solicitudes, reservas y
pedidos confirmados. También muestra el cambio propuesto de precio a 11000 ARS,
estado a borrador y contador a cero. No realiza escrituras, ni siquiera de configuración.

Revisar que TODOS los registros enumerados sean pruebas. El esquema no permite
distinguir automáticamente una compra real de una prueba. Si alguno es real, NO ejecutar.
Antes de eliminar, obtener y comprobar una copia de respaldo con la herramienta administrativa
habitual. No subir datos personales a GitHub ni compartir el inventario públicamente.

## Ejecución posterior, solo tras revisión

```sh
node scripts/cleanup-001.js --execute
```

Vuelve a mostrar el inventario completo y exige terminal interactiva y la frase exacta
`ELIMINAR PRUEBAS 001 EN pixel-mail-club`. No admite `--yes` ni confirmación por pipe.
No se ejecuta desde npm test, CI, el navegador ni un despliegue.

Elimina exclusivamente los documentos mostrados. Conserva `ediciones/001` y actualiza
precio, estado borrador, contador cero, versión de gestión y fecha de actualización.
La operación es una única transacción; cualquier cambio de documentos desde la vista
previa cancela la ejecución. Límite conservador: 400 documentos. No elimina subcolecciones.
Si existen subcolecciones bajo solicitudes/reservas, revisar su tratamiento antes de ejecutar.
No escribe documentos de 999 ni de ninguna otra edición.

Al terminar, consulta nuevamente y exige cero solicitudes y reservas/pedidos 001,
precio 11000, estado borrador y contador cero. Las solicitudes no ocupan cupos;
sin reservas de ningún estado el contador consistente es cero. El total de cupos se conserva.

Coordinar una ventana sin operaciones administrativas ni ingresos durante la limpieza.
Las inscripciones del portal permanecen cerradas cuando 001 está en borrador;
las reglas existentes permiten crear solicitudes anónimas 001 aun en borrador mediante
acceso directo al SDK. Este cambio NO modifica esas reglas: cerrar también ese acceso
en servidor requiere un cambio separado revisado y autorizado. La verificación posterior
detecta nuevos documentos, pero no impide futuras escrituras.

## Correos preparados y desactivados

`emails/templates.js` prepara textos de solicitud recibida, reserva, pago confirmado y
despacho con seguimiento. `EMAILS_ENABLED=false`; no hay integración con proveedor,
triggers, credenciales, colas ni funciones de envío. No se generan correos al limpiar datos.
Antes de activar: definir remitente Pixel, proveedor y costos compatibles con el plan;
validar destinatario y datos finales; agregar idempotencia por evento y reserva, reintentos
y registro de entregas. El vencimiento de la reserva debe provenir del registro real,
mostrado en hora argentina. El retiro local necesita un evento/mensaje específico.

## Validación

```sh
npm test
node --test tests/cleanup-001.test.js
node --check scripts/cleanup-001.js
node --check emails/templates.js
git diff --check
```

La validación local no demuestra el estado de producción ni sustituye revisar el inventario.
No hay despliegue, migración o activación automática en esta rama.
