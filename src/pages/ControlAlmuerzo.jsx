import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

function ControlAlmuerzo() {
  const lectorRef = useRef(null);
  const procesandoQRRef = useRef(false);

  const [camaraActiva, setCamaraActiva] = useState(false);
  const [codigoManual, setCodigoManual] = useState("");
  const [inscripcion, setInscripcion] = useState(null);
  const [evento, setEvento] = useState(null);
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] =
    useState("");

  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [entregaRegistrada, setEntregaRegistrada] =
    useState(false);

  /*
   * Convierte una fecha AAAA-MM-DD al formato chileno.
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
   * Busca una inscripción utilizando el código
   * leído mediante cámara o escrito manualmente.
   */
  const buscarPorCodigo = async (codigo) => {
    const codigoLimpio = codigo.trim();

    setMensaje("");
    setTipoMensaje("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaSeleccionada("");
    setEntregaRegistrada(false);

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

      /*
       * Solamente muestra jornadas que tengan
       * el almuerzo habilitado.
       */
      const jornadasConAlmuerzo =
        resultadoJornadas.docs
          .map((documentoJornada) => ({
            id: documentoJornada.id,
            ...documentoJornada.data(),
          }))
          .filter(
            (jornada) =>
              jornada.almuerzoHabilitado === true
          )
          .sort((jornadaA, jornadaB) => {
            const fechaA =
              `${jornadaA.fecha} ${jornadaA.inicio}`;

            const fechaB =
              `${jornadaB.fecha} ${jornadaB.inicio}`;

            return fechaA.localeCompare(fechaB);
          });

      setCodigoManual(codigoLimpio);
      setInscripcion(datosInscripcion);

      if (documentoEvento.exists()) {
        setEvento({
          id: documentoEvento.id,
          ...documentoEvento.data(),
        });
      }

      setJornadas(jornadasConAlmuerzo);

      if (jornadasConAlmuerzo.length === 1) {
        setJornadaSeleccionada(
          jornadasConAlmuerzo[0].id
        );
      }

      if (jornadasConAlmuerzo.length === 0) {
        setMensaje(
          "El evento no tiene jornadas con almuerzo habilitado."
        );
        setTipoMensaje("advertencia");
      } else {
        setMensaje(
          "Inscripción encontrada. Selecciona la jornada para entregar el almuerzo."
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
   * Enciende la cámara y comienza a buscar códigos QR.
   */
  const iniciarCamara = async () => {
    setMensaje("");
    setTipoMensaje("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaSeleccionada("");
    setEntregaRegistrada(false);
    procesandoQRRef.current = false;

    try {
      const lector = new Html5Qrcode(
        "lector-qr-almuerzo"
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
           * Impide que el lector procese varias veces
           * el mismo código.
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
           * El lector informa continuamente cuando
           * todavía no encuentra un QR.
           * Estos mensajes no se muestran al usuario.
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
   * Ejecuta la búsqueda manual.
   */
  const buscarManualmente = async (eventoFormulario) => {
    eventoFormulario.preventDefault();

    await detenerCamara();
    await buscarPorCodigo(codigoManual);
  };

  /*
   * Comprueba la asistencia y registra la entrega.
   */
  const registrarEntrega = async () => {
    setMensaje("");
    setTipoMensaje("");

    if (!inscripcion) {
      setMensaje(
        "Primero debes buscar una inscripción."
      );
      setTipoMensaje("error");
      return;
    }

    if (!jornadaSeleccionada) {
      setMensaje(
        "Debes seleccionar una jornada."
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
      setRegistrando(true);

      /*
       * Busca las asistencias correspondientes
       * a la persona seleccionada.
       */
      const consultaAsistencias = query(
        collection(db, "asistencias"),
        where("inscripcionId", "==", inscripcion.id)
      );

      const resultadoAsistencias = await getDocs(
        consultaAsistencias
      );

      /*
       * Comprueba que tenga una asistencia registrada
       * en la jornada seleccionada.
       */
      const documentoAsistencia =
        resultadoAsistencias.docs.find(
          (documento) =>
            documento.data().jornadaId ===
              jornadaSeleccionada &&
            documento.data().estado === "ingresado"
        );

      if (!documentoAsistencia) {
        setMensaje(
          "Entrega no autorizada: la persona todavía no registra su ingreso en esta jornada."
        );
        setTipoMensaje("error");
        return;
      }

      /*
       * Comprueba si el almuerzo ya fue entregado.
       */
      const consultaEntregas = query(
        collection(db, "entregasAlmuerzo"),
        where("inscripcionId", "==", inscripcion.id)
      );

      const resultadoEntregas = await getDocs(
        consultaEntregas
      );

      const entregaDuplicada =
        resultadoEntregas.docs.some(
          (documentoEntrega) =>
            documentoEntrega.data().jornadaId ===
            jornadaSeleccionada
        );

      if (entregaDuplicada) {
        setMensaje(
          "Almuerzo ya entregado: esta persona ya recibió su almuerzo en la jornada seleccionada."
        );
        setTipoMensaje("duplicado");
        setEntregaRegistrada(true);
        return;
      }

      const entregaId =
        `${inscripcion.id}_${jornadaSeleccionada}`;

      const referenciaEntrega = doc(
        db,
        "entregasAlmuerzo",
        entregaId
      );

      await setDoc(referenciaEntrega, {
        inscripcionId: inscripcion.id,
        jornadaId: jornadaSeleccionada,
        asistenciaId: documentoAsistencia.id,
        entregadoPor: auth.currentUser.uid,
        fechaHoraEntrega: serverTimestamp(),
        estado: "entregado",
      });

      setEntregaRegistrada(true);
      setMensaje(
        "Almuerzo entregado correctamente."
      );
      setTipoMensaje("exito");
    } catch (error) {
      console.error(
        "Error al registrar la entrega:",
        error
      );

      setMensaje(
        "No fue posible registrar la entrega de almuerzo."
      );
      setTipoMensaje("error");
    } finally {
      setRegistrando(false);
    }
  };

  /*
   * Limpia la pantalla para atender
   * a la siguiente persona.
   */
  const nuevaEntrega = async () => {
    await detenerCamara();

    setCodigoManual("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaSeleccionada("");
    setMensaje("");
    setTipoMensaje("");
    setEntregaRegistrada(false);
    procesandoQRRef.current = false;
  };

  /*
   * Apaga la cámara si el usuario abandona
   * el módulo de control de almuerzo.
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
      <h2>Control de almuerzo</h2>

      <p className="control-descripcion">
        Escanea el código QR o busca manualmente al
        asistente para registrar la entrega.
      </p>

      <div className="control-grid">
        {/* Lector mediante cámara */}

        <article className="control-tarjeta">
          <h3>Lector de código QR</h3>

          <p>
            Presiona el botón y permite el acceso a la
            cámara del dispositivo.
          </p>

          <div
            id="lector-qr-almuerzo"
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
            <label htmlFor="codigoAlmuerzo">
              Código de inscripción
            </label>

            <input
              id="codigoAlmuerzo"
              type="text"
              value={codigoManual}
              onChange={(eventoInput) =>
                setCodigoManual(
                  eventoInput.target.value
                )
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
          aria-live="assertive"
        >
          {tipoMensaje === "duplicado" && (
            <span className="mensaje-control-icono">
              !
            </span>
          )}

          <span>{mensaje}</span>
        </div>
      )}

      {inscripcion && (
        <article className="resultado-inscripcion">
          <div className="resultado-encabezado">
            <div>
              <p className="resultado-etiqueta">
                Asistente encontrado
              </p>

              <h3>{inscripcion.nombreCompleto}</h3>
            </div>

            <span className="estado-confirmado">
              Inscripción confirmada
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

            <p>
              <strong>Teléfono:</strong>{" "}
              {inscripcion.telefono}
            </p>

            <p>
              <strong>Código:</strong>{" "}
              {inscripcion.codigoQR}
            </p>
          </div>

          {jornadas.length > 0 && (
            <div className="seleccion-jornada">
              <label htmlFor="jornadaAlmuerzo">
                Jornada de entrega
              </label>

              <select
                id="jornadaAlmuerzo"
                value={jornadaSeleccionada}
                onChange={(eventoSelect) => {
                  setJornadaSeleccionada(
                    eventoSelect.target.value
                  );

                  setEntregaRegistrada(false);
                }}
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

              <button
                className="boton-entregar-almuerzo"
                type="button"
                onClick={registrarEntrega}
                disabled={
                  registrando ||
                  entregaRegistrada ||
                  !jornadaSeleccionada
                }
              >
                {registrando
                  ? "Registrando..."
                  : entregaRegistrada
                    ? "Almuerzo entregado"
                    : "Registrar entrega de almuerzo"}
              </button>
            </div>
          )}

          <button
            className="boton-nueva-lectura"
            type="button"
            onClick={nuevaEntrega}
          >
            Atender a la siguiente persona
          </button>
        </article>
      )}
    </section>
  );
}

export default ControlAlmuerzo;