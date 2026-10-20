# Pixel Mail Club 💌

Sitio público independiente de Pixel Gestión.

- Firebase: `pixel-mail-club` (Spark).
- Acceso: Firebase Authentication por enlace al correo.
- Firestore: reglas iniciales cerradas (`allow read, write: if false`).
- Inscripciones y pagos: **deshabilitados** hasta contar con una implementación segura de reservas, precios y cupos.

## Publicación

Publicar estos archivos en la raíz de la rama `main` y habilitar GitHub Pages desde **Settings → Pages → Deploy from a branch → main / (root)**.

URL esperada: https://barbaradavel.github.io/pixel-mail-club/

## Seguridad

No agregar credenciales privadas al repositorio. La configuración Firebase Web es pública, pero las reglas de Firestore deben proteger los datos. No cambiar las reglas a acceso público. La integración administrativa con Pixel Gestión se realizará más adelante mediante autenticación y autorización específicas.

El sitio anterior en Pixel-app-stock seguirá publicado hasta retirarlo expresamente; no crear reservas allí.
