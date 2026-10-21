// Pixel Mail Club — cálculo de cupos en Spark.
// Módulo de lectura para administración. No crea reservas ni habilita compras.
// Para uso futuro con transacciones y validaciones del servidor.
export const ESTADOS_QUE_OCUPAN_CUPO = Object.freeze(['CONFIRMADA','PENDIENTE_PAGO']);

export function calcularCupos(edicion, reservas, ahora = new Date()) {
  const total = Number(edicion?.cupos);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Cupos inválidos');
  const ahoraMs = ahora.getTime();
  if (!Number.isFinite(ahoraMs)) throw new Error('Fecha inválida');
  let ocupados = 0;
  for (const reserva of reservas) {
    if (reserva.edicionId !== edicion.id) continue;
    const cantidad = Number(reserva.cantidad);
    if (!Number.isSafeInteger(cantidad) || cantidad < 1) throw new Error('Cantidad inválida');
    const estado = reserva.estado;
    if (estado === 'CONFIRMADA') {
      ocupados += cantidad;
    } else if (estado === 'PENDIENTE_PAGO') {
      // Acepta Timestamp de Firestore o fecha ISO.
      const valor = reserva.venceEn;
      const vencimiento = typeof valor?.toMillis === 'function'
        ? valor.toMillis() : Date.parse(valor);
      if (!Number.isFinite(vencimiento)) throw new Error('Vencimiento inválido');
      if (vencimiento > ahoraMs) ocupados += cantidad;
    }
  }
  return { total, ocupados, disponibles: Math.max(0, total - ocupados), excedido: ocupados > total };
}

// IMPORTANTE: este cálculo NO evita sobreventas por sí solo.
// La creación de reservas deberá validar cupos con un mecanismo atómico
// y reglas que no permitan alterar precio, estado ni vencimiento libremente.
