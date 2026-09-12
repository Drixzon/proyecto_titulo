import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "../services/firebase";

const formularioInicial = {
  eventoId: "",
  nombreCompleto: "",
  correo: "",
  telefono: "",
};

function InscripcionPublica() {
  const [formulario, setFormulario] = useState(formularioInicial);
  const [eventos, setEventos] = useState([]);
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [codigoGenerado, setCodigoGenerado] = useState("");

  useEffect(() => {
    const cargarEventosActivos = async () => {
      try {
        const consulta = query(
          collection(db, "eventos"),
          where("estado", "==", "activo")
        );

        const resultado = await getDocs(consulta);

        const listaEventos = resultado.docs
          .map((documento) => ({
            id: documento.id,
            ...documento.data(),
          }))
          .sort((a, b) =>
            (a.fechaInicio || "").localeCompare(b.fechaInicio || "")
          );

        setEventos(listaEventos);
      } catch (error) {
        console.error("Error al cargar eventos:", error);
        setMensaje("No fue posible cargar los eventos disponibles.");
        setTipoMensaje("error");
      } finally {
        setCargandoEventos(false);
      }
    };

    cargarEventosActivos();
  }, []);

  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;

    setFormulario({
      ...formulario,
      [name]: value,
    });
  };

  const validarFormulario = () => {
    if (
      !formulario.eventoId ||
      !formulario.nombreCompleto.trim() ||
      !formulario.correo.trim() ||
      !formulario.telefono.trim()
    ) {
      setMensaje("Debes completar todos los campos.");
      setTipoMensaje("error");
      return false;
    }

    if (formulario.nombreCompleto.trim().length < 3) {
      setMensaje("Ingresa un nombre completo válido.");
      setTipoMensaje("error");
      return false;
    }

    if (!formulario.correo.includes("@")) {
      setMensaje("Ingresa un correo electrónico válido.");
      setTipoMensaje("error");
      return false;
    }

    return true;
  };

  const guardarInscripcion = async (eventoFormulario) => {
    eventoFormulario.preventDefault();

    setMensaje("");
    setTipoMensaje("");
    setCodigoGenerado("");

    if (!validarFormulario()) {
      return;
    }

    try {
      setGuardando(true);

      const codigoQR = `EC-${Date.now()}-${crypto
        .randomUUID()
        .slice(0, 8)}`;

      await addDoc(collection(db, "inscripciones"), {
        eventoId: formulario.eventoId,
        nombreCompleto: formulario.nombreCompleto.trim(),
        correo: formulario.correo.trim().toLowerCase(),
        telefono: formulario.telefono.trim(),
        codigoQR,
        estado: "confirmada",
        fechaInscripcion: serverTimestamp(),
      });

      setCodigoGenerado(codigoQR);
      setMensaje("Inscripción realizada correctamente.");
      setTipoMensaje("exito");
      setFormulario(formularioInicial);
    } catch (error) {
      console.error("Error al guardar la inscripción:", error);
      setMensaje("No fue posible completar la inscripción.");
      setTipoMensaje("error");
    } finally {
      setGuardando(false);
    }
  };

  const eventoSeleccionado = eventos.find(
    (evento) => evento.id === formulario.eventoId
  );
  
  const descargarQR = () => {
  const canvasQR = document.getElementById(
    "codigo-qr-asistente"
  );

  if (!canvasQR) {
    return;
  }

  const imagenQR = canvasQR.toDataURL("image/png");

  const enlaceDescarga = document.createElement("a");

  enlaceDescarga.href = imagenQR;
  enlaceDescarga.download = `EventControl-${codigoGenerado}.png`;

  enlaceDescarga.click();
};

  return (
    <main className="inscripcion-page">
      <section className="inscripcion-card">
        <div className="inscripcion-marca">
          <span className="brand-icon">EC</span>

          <div>
            <h1>EventControl</h1>
            <p>Inscripción de asistentes</p>
          </div>
        </div>

        <h2>Inscripción a eventos</h2>

        <p className="inscripcion-descripcion">
          Completa tus datos para registrar tu participación.
        </p>

        {cargandoEventos ? (
          <p>Cargando eventos disponibles...</p>
        ) : eventos.length === 0 ? (
          <p className="mensaje-inscripcion error">
            No existen eventos activos disponibles.
          </p>
        ) : (
          <form
            className="form-inscripcion"
            onSubmit={guardarInscripcion}
          >
            <label htmlFor="eventoId">Evento</label>

            <select
              id="eventoId"
              name="eventoId"
              value={formulario.eventoId}
              onChange={actualizarCampo}
              required
            >
              <option value="">Selecciona un evento</option>

              {eventos.map((evento) => (
                <option key={evento.id} value={evento.id}>
                  {evento.nombre}
                </option>
              ))}
            </select>

            {eventoSeleccionado && (
              <div className="evento-seleccionado">
                <p>
                  <strong>Ubicación:</strong>{" "}
                  {eventoSeleccionado.ubicacion}
                </p>

                <p>
                  <strong>Fecha:</strong>{" "}
                  {eventoSeleccionado.fechaInicio}
                  {eventoSeleccionado.fechaTermino !==
                    eventoSeleccionado.fechaInicio &&
                    ` al ${eventoSeleccionado.fechaTermino}`}
                </p>
              </div>
            )}

            <label htmlFor="nombreCompleto">
              Nombre completo
            </label>

            <input
              id="nombreCompleto"
              name="nombreCompleto"
              type="text"
              value={formulario.nombreCompleto}
              onChange={actualizarCampo}
              placeholder="Ejemplo: Juan Pérez Soto"
              required
            />

            <label htmlFor="correo">
              Correo electrónico
            </label>

            <input
              id="correo"
              name="correo"
              type="email"
              value={formulario.correo}
              onChange={actualizarCampo}
              placeholder="correo@ejemplo.cl"
              required
            />

            <label htmlFor="telefono">Teléfono</label>

            <input
              id="telefono"
              name="telefono"
              type="tel"
              value={formulario.telefono}
              onChange={actualizarCampo}
              placeholder="+56 9 1234 5678"
              required
            />

            <button type="submit" disabled={guardando}>
              {guardando
                ? "Registrando..."
                : "Completar inscripción"}
            </button>
          </form>
        )}

        {mensaje && (
          <p className={`mensaje-inscripcion ${tipoMensaje}`}>
            {mensaje}
          </p>
        )}

        {codigoGenerado && (
  <div className="codigo-confirmacion">
    <h3>Inscripción confirmada</h3>

    <p>
      Presenta este código QR al ingresar al evento.
    </p>

    <div className="contenedor-qr">
      <QRCodeCanvas
        id="codigo-qr-asistente"
        value={codigoGenerado}
        size={220}
        level="M"
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#102a3d"
        title="Código QR de inscripción a EventControl"
      />
    </div>

    <p className="codigo-texto">
      Código de inscripción:
    </p>

    <strong>{codigoGenerado}</strong>

    <button
      className="boton-descargar-qr"
      type="button"
      onClick={descargarQR}
    >
      Descargar código QR
    </button>
  </div>
)}

        <a className="volver-login" href="/">
          Volver al inicio de sesión
        </a>
      </section>
    </main>
  );
}

export default InscripcionPublica;