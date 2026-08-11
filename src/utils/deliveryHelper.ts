/**
 * deliveryHelper.ts
 * Módulo de utilidades para Pedidos a Domicilio:
 * - Cálculo de distancia por coordenadas (Fórmula Haversine)
 * - Verificación de radio de cobertura (Máximo 11 km)
 * - Cálculo/Captura dinámica de costo de envío
 * - Formateador de comandas para WhatsApp
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface DeliveryDetails {
  clientName: string;
  clientPhone: string;
  address: string;
  colonia?: string;
  references?: string;
  coordinates?: Coordinates;
  distanceKm?: number;
  shippingFee: number;
  paymentMethod: "efectivo" | "transferencia" | "tarjeta";
  cashAmountPaid?: number; // Para cálculo de cambio en efectivo
  notes?: string;
}

export const MAX_DELIVERY_RADIUS_KM = 11; // Límite máximo de cobertura a 11 km

/**
 * Calcula la distancia en kilómetros entre dos coordenadas (Fórmula Haversine)
 */
export function calculateDistanceKm(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Redondear a 1 decimal
}

/**
 * Verifica si la distancia está dentro de la cobertura permitida (11 km)
 */
export function isWithinCoverage(distanceKm: number, maxRadiusKm: number = MAX_DELIVERY_RADIUS_KM): boolean {
  return distanceKm <= maxRadiusKm;
}

/**
 * Calcula el costo sugerido de envío según la distancia
 * @param distanceKm Distancia en km
 * @param baseFee Tarifa base (ej. $25)
 * @param baseDistanceKm Distancia base incluida (ej. 3 km)
 * @param extraKmFee Costo por km adicional (ej. $8)
 */
export function calculateSuggestedShippingFee(
  distanceKm: number,
  baseFee: number = 25,
  baseDistanceKm: number = 3,
  extraKmFee: number = 8
): number {
  if (distanceKm <= 0) return baseFee;
  if (distanceKm <= baseDistanceKm) return baseFee;
  const extraKm = Math.ceil(distanceKm - baseDistanceKm);
  return baseFee + extraKm * extraKmFee;
}

/**
 * Formatea el texto del pedido listo para ser enviado por WhatsApp
 */
export function formatWhatsAppOrderMessage(
  orderId: string,
  businessName: string,
  items: Array<{ name: string; quantity: number; price: number; notes?: string }>,
  subtotal: number,
  delivery: DeliveryDetails
): string {
  const total = subtotal + (delivery.shippingFee || 0);
  
  let msg = `🛵 *NUEVO PEDIDO A DOMICILIO - ${businessName.toUpperCase()}*\n`;
  msg += `*Folio:* #${orderId}\n`;
  msg += `-----------------------------------\n`;
  msg += `👤 *Cliente:* ${delivery.clientName}\n`;
  msg += `📞 *Teléfono:* ${delivery.clientPhone}\n`;
  msg += `📍 *Dirección:* ${delivery.address}`;
  if (delivery.colonia) msg += `, Col. ${delivery.colonia}`;
  msg += `\n`;
  
  if (delivery.references) {
    msg += `🏠 *Referencias:* ${delivery.references}\n`;
  }
  
  if (delivery.distanceKm !== undefined) {
    msg += `📏 *Distancia:* ${delivery.distanceKm} km (En cobertura ≤ 11 km)\n`;
  }
  
  msg += `\n🛒 *DETALLE DEL PEDIDO:*\n`;
  items.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    msg += `• ${item.quantity}x ${item.name} ($${item.price.toFixed(2)}) = *$${itemTotal.toFixed(2)}*\n`;
    if (item.notes) {
      msg += `   └ _Nota: ${item.notes}_\n`;
    }
  });

  msg += `\n💵 *DESGLOSE DE CUENTA:*\n`;
  msg += `• Subtotal Platillos: $${subtotal.toFixed(2)}\n`;
  msg += `• Costo de Envío: $${(delivery.shippingFee || 0).toFixed(2)}\n`;
  msg += `👉 *TOTAL A PAGAR: $${total.toFixed(2)}*\n\n`;

  msg += `💳 *Método de Pago:* ${delivery.paymentMethod.toUpperCase()}\n`;
  if (delivery.paymentMethod === "efectivo" && delivery.cashAmountPaid) {
    const cambio = delivery.cashAmountPaid - total;
    msg += `• Paga con: $${delivery.cashAmountPaid.toFixed(2)}\n`;
    msg += `• Cambio a llevar: *$${cambio > 0 ? cambio.toFixed(2) : "0.00"}*\n`;
  }
  
  if (delivery.notes) {
    msg += `\n📝 *Notas Generales:* ${delivery.notes}\n`;
  }

  return encodeURIComponent(msg);
}
