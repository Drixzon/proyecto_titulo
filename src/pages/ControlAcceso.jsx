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

function ControlAcceso() {
  const lectorRef = useRef(null);
  const procesandoQRRef = useRef(false);

  const [camaraActiva, setCamaraActiva] = useState(false);
  const [codigoManual, setCodigoManual] = useState("");
  const [inscripcion, setInscripcion] = useState(null);
  const [evento, setEvento] = useState(null);
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] =
    useState("");

  const [metodoBusqueda, setMetodoBusqueda] = useState("qr");
  const [buscando, setBuscando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [asistenciaRegistrada, setAsistenciaRegistrada] =
    useState(false);

  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");

  /*
   * Detiene correctamente la cámara.
   * Esto también libera el permiso cuando se cambia de pantalla.
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
      console.error("Error al detener la cámara:", error);
    } finally {
      lectorRef.current = null;
      setCamaraActiva(false);
    }
  };

  /*
   * Busca una inscripción utilizando el código contenido
   * en el QR o escrito manualmente.
   */
  const buscarInscripcion = async (codigo, metodo) => {
    const codigoLimpio = codigo.trim();

    setMensaje("");
    setTipoMensaje("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaSeleccionada("");
    setAsistenciaRegistrada(false);

    if (!codigoLimpio) {
      setMensaje("Debes ingresar o escanear un código.");
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

      /*
       * Consulta el evento y las jornadas relacionadas
       * con la inscripción encontrada.
       */
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
          const fechaA = `${jornadaA.fecha} ${jornadaA.inicio}`;
          const fechaB = `${jornadaB.fecha} ${jornadaB.inicio}`;

          return fechaA.localeCompare(fechaB);
        });

      setInscripcion(datosInscripcion);

      if (documentoEvento.exists()) {
        setEvento({
          id: documentoEvento.id,
          ...documentoEvento.data(),
        });
      }

      setJornadas(listaJornadas);
      setMetodoBusqueda(metodo);

      if (listaJornadas.length === 1) {
        setJornadaSeleccionada(listaJornadas[0].id);
      }

      if (listaJornadas.length === 0) {
        setMensaje(
          "Inscripción encontrada, pero el evento no tiene jornadas registradas."
        );
        setTipoMensaje("advertencia");
      } else {
        setMensaje("Inscripción encontrada correctamente.");
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
   * Enciende la cámara tras presionar el botón.
   * Se intenta utilizar preferentemente la cámara trasera.
   */
  const iniciarCamara = async () => {
    setMensaje("");
    setTipoMensaje("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaSeleccionada("");
    setAsistenciaRegistrada(false);
    procesandoQRRef.current = false;

    try {
      const lector = new Html5Qrcode(
        "lector-codigo-qr"
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
           * Evita procesar varias veces el mismo QR mientras
           * la cámara todavía lo está observando.
           */
          if (procesandoQRRef.current) {
            return;
          }

          procesandoQRRef.current = true;

          await detenerCamara();

          await buscarInscripcion(
            codigoDetectado,
            "qr"
          );
        },
        () => {
          /*
           * html5-qrcode informa continuamente cuando
           * una imagen no contiene un QR.
           * No mostramos esos mensajes en pantalla.
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
   * Realiza la búsqueda cuando se escribe un código
   * manualmente.
   */
  const buscarManualmente = async (eventoFormulario) => {
    eventoFormulario.preventDefault();

    await detenerCamara();

    await buscarInscripcion(
      codigoManual,
      "manual"
    );
  };

  /*
   * Crea el documento de asistencia.
   * El ID combina inscripción y jornada para evitar duplicados.
   */
  const registrarAsistencia = async () => {
  setMensaje("");
  setTipoMensaje("");

  if (!inscripcion) {
    setMensaje("Primero debes buscar una inscripción.");
    setTipoMensaje("error");
    return;
  }

  if (!jornadaSeleccionada) {
    setMensaje("Debes seleccionar una jornada.");
    setTipoMensaje("error");
    return;
  }

  if (!auth.currentUser) {
    setMensaje("La sesión del recepcionista no está disponible.");
    setTipoMensaje("error");
    return;
  }

  try {
    setRegistrando(true);

    /*
     * Consulta todas las asistencias de la inscripción.
     * Después comprueba si alguna pertenece a la jornada elegida.
     */
    const consultaAsistencias = query(
      collection(db, "asistencias"),
      where("inscripcionId", "==", inscripcion.id)
    );

    const resultadoAsistencias = await getDocs(
      consultaAsistencias
    );

    const asistenciaDuplicada =
      resultadoAsistencias.docs.some(
        (documentoAsistencia) =>
          documentoAsistencia.data().jornadaId ===
          jornadaSeleccionada
      );

    if (asistenciaDuplicada) {
     setMensaje(
    "Ingreso ya registrado: esta persona ya ingresó a la jornada seleccionada."
     );
     setTipoMensaje("duplicado");
     setAsistenciaRegistrada(true);
     return;
    }

    /*
     * El identificador combina inscripción y jornada.
     * Así se refuerza la prevención de duplicados.
     */
    const asistenciaId =
      `${inscripcion.id}_${jornadaSeleccionada}`;

    const referenciaAsistencia = doc(
      db,
      "asistencias",
      asistenciaId
    );

    await setDoc(referenciaAsistencia, {
      inscripcionId: inscripcion.id,
      jornadaId: jornadaSeleccionada,
      registradoPor: auth.currentUser.uid,
      fechaHoraIngreso: serverTimestamp(),
      metodo: metodoBusqueda,
      estado: "ingresado",
    });

    setAsistenciaRegistrada(true);
    setMensaje("Ingreso registrado correctamente.");
    setTipoMensaje("exito");
  } catch (error) {
    console.error(
      "Error al registrar la asistencia:",
      error
    );

    setMensaje(
      "No fue posible registrar la asistencia."
    );
    setTipoMensaje("error");
  } finally {
    setRegistrando(false);
  }
};

  /*
   * Limpia todos los datos para atender
   * al siguiente asistente.
   */
  const nuevaLectura = async () => {
    await detenerCamara();

    setCodigoManual("");
    setInscripcion(null);
    setEvento(null);
    setJornadas([]);
    setJornadaSeleccionada("");
    setMensaje("");
    setTipoMensaje("");
    setMetodoBusqueda("qr");
    setAsistenciaRegistrada(false);
    procesandoQRRef.current = false;
  };

  /*
   * Si el usuario cambia de pantalla, React ejecutará
   * esta limpieza y apagará la cámara.
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

  const formatearFecha = (fecha) => {
    if (!fecha) {
      return "Sin fecha";
    }

    return new Date(
      `${fecha}T00:00:00`
    ).toLocaleDateString("es-CL");
  };

  return (
    <section className="control-acceso">
      <h2>Control de acceso</h2>

      <p className="control-descripcion">
        Escanea el código QR presentado por el asistente
        o realiza una búsqueda manual.
      </p>

      <div className="control-grid">
        <article className="control-tarjeta">
          <h3>Lector de código QR</h3>

          <p>
            Presiona el botón y permite el acceso a la
            cámara del dispositivo.
          </p>

          <div
            id="lector-codigo-qr"
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
            <label htmlFor="codigoManual">
              Código de inscripción
            </label>

            <input
              id="codigoManual"
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
                Inscripción confirmada
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
              <label htmlFor="jornadaSeleccionada">
                Jornada de ingreso
              </label>

              <select
                id="jornadaSeleccionada"
                value={jornadaSeleccionada}
                onChange={(eventoSelect) => {
                  setJornadaSeleccionada(
                    eventoSelect.target.value
                  );

                  setAsistenciaRegistrada(false);
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
                className="boton-registrar-ingreso"
                type="button"
                onClick={registrarAsistencia}
                disabled={
                  registrando ||
                  asistenciaRegistrada ||
                  !jornadaSeleccionada
                }
              >
                {registrando
                  ? "Registrando..."
                  : asistenciaRegistrada
                    ? "Ingreso registrado"
                    : "Registrar ingreso"}
              </button>
            </div>
          )}

          <button
            className="boton-nueva-lectura"
            type="button"
            onClick={nuevaLectura}
          >
            Atender al siguiente asistente
          </button>
        </article>
      )}
    </section>
  );
}

export default ControlAcceso;