import React, { useState, useEffect } from "react";
import {
  calculateDistanceKm,
  isWithinCoverage,
  calculateSuggestedShippingFee,
  MAX_DELIVERY_RADIUS_KM,
  DeliveryDetails,
  formatWhatsAppOrderMessage
} from "../utils/deliveryHelper";
import { MapPin, Navigation, DollarSign, Phone, User, FileText, CheckCircle, AlertTriangle, X } from "lucide-react";

interface DeliveryOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  businessName: string;
  businessPhone?: string;
  storeCoordinates?: { lat: number; lng: number }; // Coordenadas del negocio
  onConfirmDeliveryOrder: (deliveryData: DeliveryDetails) => void;
}

export const DeliveryOrderModal: React.FC<DeliveryOrderModalProps> = ({
  isOpen,
  onClose,
  subtotal,
  businessName,
  businessPhone = "",
  storeCoordinates = { lat: 19.4326, lng: -99.1332 }, // Coordenadas default si no se proveen
  onConfirmDeliveryOrder
}) => {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [address, setAddress] = useState("");
  const [colonia, setColonia] = useState("");
  const [references, setReferences] = useState("");
  
  // Coordenadas y distancia
  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [manualDistance, setManualDistance] = useState<string>("3.0");
  
  // Costo de envío dinámico
  const [shippingFee, setShippingFee] = useState<number>(30); // Costo inicial default
  const [customShippingFee, setCustomShippingFee] = useState<string>("30");
  
  // Pago
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "tarjeta">("efectivo");
  const [cashAmountPaid, setCashAmountPaid] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [errorMsg, setErrorMsg] = useState("");

  // Recalcular distancia y costo cuando cambia la distancia
  useEffect(() => {
    const dist = parseFloat(manualDistance) || 0;
    setDistanceKm(dist);
    const suggestedFee = calculateSuggestedShippingFee(dist);
    setShippingFee(suggestedFee);
    setCustomShippingFee(suggestedFee.toString());
  }, [manualDistance]);

  // Obtener ubicación GPS actual del cliente
  const handleGetLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCustomerLat(lat);
          setCustomerLng(lng);

          const calculatedDist = calculateDistanceKm(storeCoordinates, { lat, lng });
          setDistanceKm(calculatedDist);
          setManualDistance(calculatedDist.toString());

          const fee = calculateSuggestedShippingFee(calculatedDist);
          setShippingFee(fee);
          setCustomShippingFee(fee.toString());

          setErrorMsg("");
        },
        (err) => {
          console.warn("Error obteniendo geolocalización:", err);
          setErrorMsg("No se pudo obtener la ubicación GPS automática. Por favor ingresa los km manualmente.");
        }
      );
    } else {
      setErrorMsg("Geolocalización no soportada en este navegador.");
    }
  };

  if (!isOpen) return null;

  const currentDistance = distanceKm !== null ? distanceKm : (parseFloat(manualDistance) || 0);
  const inCoverage = isWithinCoverage(currentDistance, MAX_DELIVERY_RADIUS_KM);
  const finalShippingFee = parseFloat(customShippingFee) || 0;
  const grandTotal = subtotal + finalShippingFee;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setErrorMsg("Por favor ingresa el Nombre del Cliente.");
      return;
    }
    if (!clientPhone.trim()) {
      setErrorMsg("Por favor ingresa el Teléfono del Cliente.");
      return;
    }
    if (!address.trim()) {
      setErrorMsg("Por favor ingresa la Dirección de entrega.");
      return;
    }

    if (!inCoverage) {
      setErrorMsg(`La ubicación (${currentDistance} km) excede nuestro límite de cobertura de ${MAX_DELIVERY_RADIUS_KM} km.`);
      return;
    }

    const deliveryDetails: DeliveryDetails = {
      clientName,
      clientPhone,
      address,
      colonia,
      references,
      coordinates: customerLat && customerLng ? { lat: customerLat, lng: customerLng } : undefined,
      distanceKm: currentDistance,
      shippingFee: finalShippingFee,
      paymentMethod,
      cashAmountPaid: paymentMethod === "efectivo" ? (parseFloat(cashAmountPaid) || grandTotal) : undefined,
      notes
    };

    onConfirmDeliveryOrder(deliveryDetails);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Pedido a Domicilio</h2>
              <p className="text-emerald-100 text-xs">Cobertura garantizada hasta 11 km a la redonda</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-100 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {errorMsg && (
            <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 p-3.5 rounded-xl text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Sección Cobertura y Distancia */}
          <div className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-400" />
                Distancia y Cobertura (Máx {MAX_DELIVERY_RADIUS_KM} km)
              </span>
              <button
                type="button"
                onClick={handleGetLocation}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5" />
                GPS Automático
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Distancia estimada (km)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={manualDistance}
                  onChange={(e) => setManualDistance(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Estado de Cobertura</label>
                <div
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    inCoverage
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  }`}
                >
                  {inCoverage ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      En cobertura ({currentDistance} km)
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Excede 11 km ({currentDistance} km)
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Datos del Cliente */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-700/60 pb-1">
              Datos del Cliente
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: María López"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Teléfono de Contacto *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Ej: 5512345678"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" /> Calle y Número Exterior/Interior *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Av. Reforma #405 Int 3"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Colonia / Sector</label>
                <input
                  type="text"
                  placeholder="Ej: Col. Juárez"
                  value={colonia}
                  onChange={(e) => setColonia(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Referencias del Domicilio</label>
                <input
                  type="text"
                  placeholder="Ej: Casa azul, portón blanco"
                  value={references}
                  onChange={(e) => setReferences(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Costo de Envío Dinámico */}
          <div className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Costo de Envío a Domicilio (Capturable)
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Costo de Envío ($)</label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={customShippingFee}
                  onChange={(e) => setCustomShippingFee(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col justify-end">
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-700/60 text-xs">
                  <span className="text-slate-400">Subtotal: </span>
                  <span className="text-white font-semibold">${subtotal.toFixed(2)}</span>
                  <br />
                  <span className="text-slate-400">Total + Envío: </span>
                  <span className="text-emerald-400 font-bold">${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Método de Pago y Cambio */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 border-b border-slate-700/60 pb-1">
              Método de Pago
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "efectivo", label: "💵 Efectivo" },
                { id: "transferencia", label: "📱 Transferencia" },
                { id: "tarjeta", label: "💳 Tarjeta al Entregar" }
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    paymentMethod === m.id
                      ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/30"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === "efectivo" && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  ¿Con cuánto billete pagará el cliente? (Para llevar cambio)
                </label>
                <input
                  type="number"
                  placeholder={`Ej: $${Math.ceil(grandTotal / 50) * 50}`}
                  value={cashAmountPaid}
                  onChange={(e) => setCashAmountPaid(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                {parseFloat(cashAmountPaid) > grandTotal && (
                  <p className="text-xs text-emerald-400 mt-1">
                    Cambio a entregar: ${(parseFloat(cashAmountPaid) - grandTotal).toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Notas adicionales del pedido
            </label>
            <input
              type="text"
              placeholder="Ej: Sin cebolla en los tacos, salsa aparte"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Resumen Final & Botón de Enviar */}
          <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 block">Total con envío</span>
              <span className="text-2xl font-black text-emerald-400">${grandTotal.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!inCoverage}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                  inCoverage
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                    : "bg-slate-700 text-slate-500 cursor-not-allowed"
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                Confirmar Pedido a Domicilio
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
