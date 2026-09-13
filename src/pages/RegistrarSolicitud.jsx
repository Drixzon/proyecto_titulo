import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

function RegistrarSolicitud() {
  const lectorRef = useRef(null);
  const procesandoQRRef = useRef(false);

  const [camaraActiva, setCamaraActiva] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [inscripcion, setInscripcion] = useState(null);
  const [evento, setEvento] = useState(null);
  const [jornadas, setJornadas] = useState([]);
  const [jornadaId, setJornadaId] = useState("");
  const [solicitud, setSolicitud] = useState("");

  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");

  /*
   * Convierte una fecha al formato utilizado en Chile.
   */
  const formatearFecha = (fecha) => {
    if (!fecha) {
      return "Sin fecha";
    }

    return new Date(
      `${fecha}T00:00:00`
    ).toLocaleDateString("es-CL");
  };

  /*
   * Detiene la cámara y libera el dispositivo.
   */
  const detenerCamara = async () => {
    const lector = lectorRef.current;

    if (!lector) {
      setCamaraActiva(false);
      return;
    }

    try {
      if (lector.isScanning) {
        await lector.stop();
      }

      lector.clear();
    } catch (error) {
      console.error(
        "Error al detener la cámara:",
        error
      );
    } finally {
      lectorRef.current = null;
      setCamaraActiva(false);
    }
  };

  /*
   * Busca una inscripción usando el código escaneado
   * o escrito manualmente.
   */
  const buscarPorCodigo = async (codigoRecibido) => {
    const codigoLimpio = codigoRecibido.trim();

    setMensaje("");
    setTipoMensaje("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaId("");
    setSolicitud("");

    if (!codigoLimpio) {
      setMensaje(
        "Debes ingresar o escanear un código de inscripción."
      );
      setTipoMensaje("error");
      procesandoQRRef.current = false;
      return;
    }

    try {
      setBuscando(true);

      const consultaInscripcion = query(
        collection(db, "inscripciones"),
        where("codigoQR", "==", codigoLimpio)
      );

      const resultadoInscripcion = await getDocs(
        consultaInscripcion
      );

      if (resultadoInscripcion.empty) {
        setMensaje(
          "No existe una inscripción asociada a este código."
        );
        setTipoMensaje("error");
        return;
      }

      const documentoInscripcion =
        resultadoInscripcion.docs[0];

      const datosInscripcion = {
        id: documentoInscripcion.id,
        ...documentoInscripcion.data(),
      };

      if (datosInscripcion.estado !== "confirmada") {
        setMensaje(
          "La inscripción encontrada no está confirmada."
        );
        setTipoMensaje("error");
        return;
      }

      const referenciaEvento = doc(
        db,
        "eventos",
        datosInscripcion.eventoId
      );

      const consultaJornadas = query(
        collection(db, "jornadas"),
        where(
          "eventoId",
          "==",
          datosInscripcion.eventoId
        )
      );

      const [documentoEvento, resultadoJornadas] =
        await Promise.all([
          getDoc(referenciaEvento),
          getDocs(consultaJornadas),
        ]);

      const listaJornadas = resultadoJornadas.docs
        .map((documentoJornada) => ({
          id: documentoJornada.id,
          ...documentoJornada.data(),
        }))
        .sort((jornadaA, jornadaB) => {
          const fechaA =
            `${jornadaA.fecha} ${jornadaA.inicio}`;

          const fechaB =
            `${jornadaB.fecha} ${jornadaB.inicio}`;

          return fechaA.localeCompare(fechaB);
        });

      setCodigo(codigoLimpio);
      setInscripcion(datosInscripcion);
      setJornadas(listaJornadas);

      if (documentoEvento.exists()) {
        setEvento({
          id: documentoEvento.id,
          ...documentoEvento.data(),
        });
      }

      if (listaJornadas.length === 1) {
        setJornadaId(listaJornadas[0].id);
      }

      if (listaJornadas.length === 0) {
        setMensaje(
          "El evento no tiene jornadas registradas."
        );
        setTipoMensaje("advertencia");
      } else {
        setMensaje(
          "Asistente encontrado. Completa la solicitud."
        );
        setTipoMensaje("exito");
      }
    } catch (error) {
      console.error(
        "Error al buscar la inscripción:",
        error
      );

      setMensaje(
        "No fue posible consultar la inscripción."
      );
      setTipoMensaje("error");
    } finally {
      setBuscando(false);
      procesandoQRRef.current = false;
    }
  };

  /*
   * Enciende la cámara y comienza la lectura.
   */
  const iniciarCamara = async () => {
    setMensaje("");
    setTipoMensaje("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaId("");
    setSolicitud("");
    procesandoQRRef.current = false;

    try {
      const lector = new Html5Qrcode(
        "lector-qr-solicitud"
      );

      lectorRef.current = lector;

      await lector.start(
        {
          facingMode: "environment",
        },
        {
          fps: 10,
          qrbox: {
            width: 250,
            height: 250,
          },
        },
        async (codigoDetectado) => {
          /*
           * Evita procesar repetidamente
           * el mismo código QR.
           */
          if (procesandoQRRef.current) {
            return;
          }

          procesandoQRRef.current = true;

          await detenerCamara();
          await buscarPorCodigo(codigoDetectado);
        },
        () => {
          /*
           * Se ignoran los intentos donde
           * todavía no se detecta un QR.
           */
        }
      );

      setCamaraActiva(true);
    } catch (error) {
      console.error(
        "No fue posible iniciar la cámara:",
        error
      );

      lectorRef.current = null;
      setCamaraActiva(false);

      setMensaje(
        "No fue posible iniciar la cámara. Revisa los permisos del navegador."
      );
      setTipoMensaje("error");
    }
  };

  /*
   * Ejecuta la búsqueda escrita manualmente.
   */
  const buscarManualmente = async (eventoFormulario) => {
    eventoFormulario.preventDefault();

    await detenerCamara();
    await buscarPorCodigo(codigo);
  };

  /*
   * Guarda la solicitud en Firestore.
   */
  const guardarSolicitud = async (eventoFormulario) => {
    eventoFormulario.preventDefault();

    setMensaje("");
    setTipoMensaje("");

    if (!inscripcion) {
      setMensaje(
        "Primero debes buscar una inscripción."
      );
      setTipoMensaje("error");
      return;
    }

    if (!jornadaId) {
      setMensaje("Debes seleccionar una jornada.");
      setTipoMensaje("error");
      return;
    }

    const solicitudLimpia = solicitud.trim();

    if (solicitudLimpia.length < 5) {
      setMensaje(
        "La solicitud debe tener al menos 5 caracteres."
      );
      setTipoMensaje("error");
      return;
    }

    if (solicitudLimpia.length > 500) {
      setMensaje(
        "La solicitud no puede superar los 500 caracteres."
      );
      setTipoMensaje("error");
      return;
    }

    if (!auth.currentUser) {
      setMensaje(
        "La sesión del recepcionista no está disponible."
      );
      setTipoMensaje("error");
      return;
    }

    try {
      setGuardando(true);

      await addDoc(
        collection(db, "solicitudesPalabra"),
        {
          inscripcionId: inscripcion.id,
          eventoId: inscripcion.eventoId,
          jornadaId,
          solicitud: solicitudLimpia,
          estado: "pendiente",
          registradoPor: auth.currentUser.uid,
          fechaSolicitud: serverTimestamp(),
        }
      );

      setMensaje(
        "Solicitud de palabra registrada correctamente."
      );
      setTipoMensaje("exito");
      setSolicitud("");
    } catch (error) {
      console.error(
        "Error al guardar la solicitud:",
        error
      );

      setMensaje(
        "No fue posible registrar la solicitud."
      );
      setTipoMensaje("error");
    } finally {
      setGuardando(false);
    }
  };

  /*
   * Limpia la pantalla para registrar otra solicitud.
   */
  const nuevaSolicitud = async () => {
    await detenerCamara();

    setCodigo("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaId("");
    setSolicitud("");
    setMensaje("");
    setTipoMensaje("");
    procesandoQRRef.current = false;
  };

  /*
   * Apaga la cámara al cambiar de módulo.
   */
  useEffect(() => {
    return () => {
      const lector = lectorRef.current;

      if (lector?.isScanning) {
        lector
          .stop()
          .then(() => lector.clear())
          .catch((error) => {
            console.error(
              "Error al cerrar el lector:",
              error
            );
          });
      }
    };
  }, []);

  return (
    <section className="control-acceso">
      <h2>Solicitud de palabra</h2>

      <p className="control-descripcion">
        Escanea el código QR o busca manualmente al
        asistente para registrar su intervención.
      </p>

      <div className="control-grid">
        {/* Búsqueda mediante cámara */}

        <article className="control-tarjeta">
          <h3>Lector de código QR</h3>

          <p>
            Presiona el botón y permite el acceso a la
            cámara del dispositivo.
          </p>

          <div
            id="lector-qr-solicitud"
            className="lector-codigo-qr"
          />

          {!camaraActiva ? (
            <button
              className="boton-principal"
              type="button"
              onClick={iniciarCamara}
              disabled={buscando}
            >
              Encender cámara
            </button>
          ) : (
            <button
              className="boton-secundario"
              type="button"
              onClick={detenerCamara}
            >
              Apagar cámara
            </button>
          )}
        </article>

        {/* Búsqueda manual */}

        <article className="control-tarjeta">
          <h3>Búsqueda manual</h3>

          <p>
            Escribe el código cuando no sea posible
            leer el QR.
          </p>

          <form
            className="form-busqueda-manual"
            onSubmit={buscarManualmente}
          >
            <label htmlFor="codigoSolicitud">
              Código de inscripción
            </label>

            <input
              id="codigoSolicitud"
              type="text"
              value={codigo}
              onChange={(eventoInput) =>
                setCodigo(eventoInput.target.value)
              }
              placeholder="Ejemplo: EC-123456..."
            />

            <button
              className="boton-principal"
              type="submit"
              disabled={buscando}
            >
              {buscando
                ? "Buscando..."
                : "Buscar inscripción"}
            </button>
          </form>
        </article>
      </div>

      {mensaje && (
        <div
          className={`mensaje-control ${tipoMensaje}`}
          role="alert"
          aria-live="polite"
        >
          <span>{mensaje}</span>
        </div>
      )}

      {inscripcion && jornadas.length > 0 && (
        <article className="resultado-inscripcion">
          <div className="resultado-encabezado">
            <div>
              <p className="resultado-etiqueta">
                Asistente identificado
              </p>

              <h3>{inscripcion.nombreCompleto}</h3>
            </div>

            <span className="estado-confirmado">
              Confirmada
            </span>
          </div>

          <div className="datos-inscripcion">
            <p>
              <strong>Evento:</strong>{" "}
              {evento?.nombre || "Evento no encontrado"}
            </p>

            <p>
              <strong>Correo:</strong>{" "}
              {inscripcion.correo}
            </p>
          </div>

          <form
            className="form-solicitud-palabra"
            onSubmit={guardarSolicitud}
          >
            <label htmlFor="jornadaSolicitud">
              Jornada
            </label>

            <select
              id="jornadaSolicitud"
              value={jornadaId}
              onChange={(eventoSelect) =>
                setJornadaId(eventoSelect.target.value)
              }
            >
              <option value="">
                Selecciona una jornada
              </option>

              {jornadas.map((jornada) => (
                <option
                  key={jornada.id}
                  value={jornada.id}
                >
                  {formatearFecha(jornada.fecha)}
                  {" — "}
                  {jornada.inicio} a {jornada.termino}
                </option>
              ))}
            </select>

            <label htmlFor="textoSolicitud">
              Pregunta o solicitud
            </label>

            <textarea
              id="textoSolicitud"
              rows="5"
              maxLength="500"
              value={solicitud}
              onChange={(eventoTextarea) =>
                setSolicitud(eventoTextarea.target.value)
              }
              placeholder="Escribe brevemente la pregunta o intervención"
            />

            <small>
              {solicitud.length} de 500 caracteres
            </small>

            <button
              className="boton-principal"
              type="submit"
              disabled={guardando}
            >
              {guardando
                ? "Registrando..."
                : "Registrar solicitud"}
            </button>
          </form>

          <button
            className="boton-nueva-lectura"
            type="button"
            onClick={nuevaSolicitud}
          >
            Registrar otra solicitud
          </button>
        </article>
      )}
    </section>
  );
}

export default RegistrarSolicitud;