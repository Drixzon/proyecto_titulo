import { useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "../services/firebase";

/* Valores iniciales del formulario */
const formularioInicial = {
  eventoId: "",
  tipoDocumento: "rut",
  numeroDocumento: "",
  nombreCompleto: "",
  correo: "",
  telefono: "",
};

/* Elimina puntos, guion y espacios del RUT */
const limpiarRut = (rut) => {
  return rut
    .replace(/[^0-9kK]/g, "")
    .toUpperCase();
};

/* Comprueba el dígito verificador del RUT */
const validarRut = (rut) => {
  const rutLimpio = limpiarRut(rut);

  if (
    rutLimpio.length < 8 ||
    rutLimpio.length > 9
  ) {
    return false;
  }

  const cuerpo = rutLimpio.slice(0, -1);
  const digitoIngresado =
    rutLimpio.slice(-1);

  if (!/^\d+$/.test(cuerpo)) {
    return false;
  }

  let suma = 0;
  let multiplicador = 2;

  for (
    let indice = cuerpo.length - 1;
    indice >= 0;
    indice -= 1
  ) {
    suma +=
      Number(cuerpo[indice]) *
      multiplicador;

    multiplicador =
      multiplicador === 7
        ? 2
        : multiplicador + 1;
  }

  const resultado = 11 - (suma % 11);

  let digitoCalculado;

  if (resultado === 11) {
    digitoCalculado = "0";
  } else if (resultado === 10) {
    digitoCalculado = "K";
  } else {
    digitoCalculado = String(resultado);
  }

  return (
    digitoCalculado === digitoIngresado
  );
};

/* Normaliza el número de pasaporte */
const limpiarPasaporte = (pasaporte) => {
  return pasaporte
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
};

/* Formatea automáticamente un teléfono chileno */
const formatearTelefono = (valor) => {
  let numeros = valor.replace(/\D/g, "");

  if (numeros.startsWith("56")) {
    numeros = numeros.slice(2);
  }

  numeros = numeros.slice(0, 9);

  if (!numeros) {
    return "";
  }

  const primerDigito =
    numeros.slice(0, 1);

  const primerBloque =
    numeros.slice(1, 5);

  const segundoBloque =
    numeros.slice(5, 9);

  let telefonoFormateado =
    `+56 ${primerDigito}`;

  if (primerBloque) {
    telefonoFormateado +=
      ` ${primerBloque}`;
  }

  if (segundoBloque) {
    telefonoFormateado +=
      ` ${segundoBloque}`;
  }

  return telefonoFormateado;
};

/* Genera un identificador para evitar duplicados */
const generarIdentificador = async (
  texto
) => {
  const datos =
    new TextEncoder().encode(texto);

  const resultado =
    await crypto.subtle.digest(
      "SHA-256",
      datos
    );

  return Array.from(
    new Uint8Array(resultado)
  )
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
};

function InscripcionPublica() {
  const [formulario, setFormulario] =
    useState(formularioInicial);

  const [eventos, setEventos] =
    useState([]);

  const [
    cargandoEventos,
    setCargandoEventos,
  ] = useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [mensaje, setMensaje] =
    useState("");

  const [tipoMensaje, setTipoMensaje] =
    useState("");

  const [
    codigoGenerado,
    setCodigoGenerado,
  ] = useState("");

  /* Carga los eventos activos */
  useEffect(() => {
    const cargarEventosActivos =
      async () => {
        try {
          const consulta = query(
            collection(db, "eventos"),
            where(
              "estado",
              "==",
              "activo"
            )
          );

          const resultado =
            await getDocs(consulta);

          const listaEventos =
            resultado.docs
              .map((documento) => ({
                id: documento.id,
                ...documento.data(),

                /*
                 * Los eventos antiguos sin contador
                 * se consideran con cero inscritos.
                 */
                inscritosActuales:
                  documento.data()
                    .inscritosActuales || 0,
              }))
              .sort((a, b) =>
                (
                  a.fechaInicio || ""
                ).localeCompare(
                  b.fechaInicio || ""
                )
              );

          setEventos(listaEventos);
        } catch (error) {
          console.error(
            "Error al cargar los eventos:",
            error
          );

          setMensaje(
            "No fue posible cargar los eventos disponibles."
          );

          setTipoMensaje("error");
        } finally {
          setCargandoEventos(false);
        }
      };

    cargarEventosActivos();
  }, []);

  /* Actualiza los campos del formulario */
  const actualizarCampo = (evento) => {
    const { name, value } =
      evento.target;

    if (name === "telefono") {
      setFormulario(
        (formularioActual) => ({
          ...formularioActual,
          telefono:
            formatearTelefono(value),
        })
      );

      return;
    }

    setFormulario(
      (formularioActual) => ({
        ...formularioActual,
        [name]: value,

        ...(name === "tipoDocumento"
          ? { numeroDocumento: "" }
          : {}),
      })
    );

    /*
     * Limpia los mensajes cuando se selecciona
     * un evento diferente.
     */
    if (name === "eventoId") {
      setMensaje("");
      setTipoMensaje("");
      setCodigoGenerado("");
    }
  };

  /* Normaliza el documento ingresado */
  const obtenerDocumentoNormalizado =
    () => {
      if (
        formulario.tipoDocumento ===
        "rut"
      ) {
        return limpiarRut(
          formulario.numeroDocumento
        );
      }

      return limpiarPasaporte(
        formulario.numeroDocumento
      );
    };

  /* Valida los datos ingresados */
  const validarFormulario = () => {
    if (
      !formulario.eventoId ||
      !formulario.numeroDocumento.trim() ||
      !formulario.nombreCompleto.trim() ||
      !formulario.correo.trim() ||
      !formulario.telefono.trim()
    ) {
      setMensaje(
        "Debes completar todos los campos."
      );

      setTipoMensaje("error");
      return false;
    }

    if (
      formulario.tipoDocumento ===
        "rut" &&
      !validarRut(
        formulario.numeroDocumento
      )
    ) {
      setMensaje(
        "El RUT ingresado no es válido."
      );

      setTipoMensaje("error");
      return false;
    }

    if (
      formulario.tipoDocumento ===
        "pasaporte" &&
      (
        limpiarPasaporte(
          formulario.numeroDocumento
        ).length < 5 ||
        limpiarPasaporte(
          formulario.numeroDocumento
        ).length > 20
      )
    ) {
      setMensaje(
        "Ingresa un número de pasaporte válido."
      );

      setTipoMensaje("error");
      return false;
    }

    if (
      formulario.nombreCompleto
        .trim()
        .length < 3
    ) {
      setMensaje(
        "Ingresa un nombre completo válido."
      );

      setTipoMensaje("error");
      return false;
    }

    if (
      !formulario.correo.includes("@")
    ) {
      setMensaje(
        "Ingresa un correo electrónico válido."
      );

      setTipoMensaje("error");
      return false;
    }

    const telefonoNormalizado =
      formulario.telefono.replace(
        /\D/g,
        ""
      );

    if (
      !/^569\d{8}$/.test(
        telefonoNormalizado
      )
    ) {
      setMensaje(
        "Ingresa un teléfono móvil chileno válido. Ejemplo: +56 9 1234 5678."
      );

      setTipoMensaje("error");
      return false;
    }

    return true;
  };

  /* Calcula los cupos disponibles */
  const calcularCuposDisponibles = (
    evento
  ) => {
    if (!evento) {
      return 0;
    }

    const capacidad = Number(
      evento.capacidad || 0
    );

    const inscritos = Number(
      evento.inscritosActuales || 0
    );

    return Math.max(
      capacidad - inscritos,
      0
    );
  };

  /* Guarda la inscripción y reserva el cupo */
  const guardarInscripcion = async (
    eventoFormulario
  ) => {
    eventoFormulario.preventDefault();

    setMensaje("");
    setTipoMensaje("");
    setCodigoGenerado("");

    if (!validarFormulario()) {
      return;
    }

    try {
      setGuardando(true);

      const documentoNormalizado =
        obtenerDocumentoNormalizado();

      /*
       * La combinación de evento y documento
       * impide una inscripción duplicada.
       */
      const claveInscripcion = [
        formulario.eventoId,
        formulario.tipoDocumento,
        documentoNormalizado,
      ].join("|");

      const identificadorInscripcion =
        await generarIdentificador(
          claveInscripcion
        );

      const referenciaInscripcion = doc(
        db,
        "inscripciones",
        identificadorInscripcion
      );

      const referenciaEvento = doc(
        db,
        "eventos",
        formulario.eventoId
      );

      const codigoQR =
        `EC-${Date.now()}-${crypto
          .randomUUID()
          .slice(0, 8)}`;

      /*
       * La transacción comprueba:
       * 1. Que el evento exista.
       * 2. Que todavía esté activo.
       * 3. Que la persona no esté inscrita.
       * 4. Que todavía existan cupos.
       */
      await runTransaction(
        db,
        async (transaccion) => {
          /*
           * Todas las lecturas deben realizarse
           * antes de comenzar las escrituras.
           */
          const documentoEvento =
            await transaccion.get(
              referenciaEvento
            );

          const inscripcionExistente =
            await transaccion.get(
              referenciaInscripcion
            );

          if (!documentoEvento.exists()) {
            throw new Error(
              "EVENTO_NO_EXISTE"
            );
          }

          const datosEvento =
            documentoEvento.data();

          if (
            datosEvento.estado !==
            "activo"
          ) {
            throw new Error(
              "EVENTO_NO_DISPONIBLE"
            );
          }

          if (
            inscripcionExistente.exists()
          ) {
            throw new Error(
              "INSCRIPCION_DUPLICADA"
            );
          }

          const capacidad = Number(
            datosEvento.capacidad || 0
          );

          const inscritosActuales =
            Number(
              datosEvento
                .inscritosActuales || 0
            );

          if (
            inscritosActuales >= capacidad
          ) {
            throw new Error(
              "EVENTO_SIN_CUPOS"
            );
          }

          /*
           * Reserva un cupo aumentando el contador.
           */
          transaccion.update(
            referenciaEvento,
            {
              inscritosActuales:
                inscritosActuales + 1,
            }
          );

          /*
           * Crea la inscripción dentro de
           * la misma transacción.
           */
          transaccion.set(
            referenciaInscripcion,
            {
              eventoId:
                formulario.eventoId,

              tipoDocumento:
                formulario.tipoDocumento,

              numeroDocumento:
                documentoNormalizado,

              nombreCompleto:
                formulario.nombreCompleto
                  .trim(),

              correo:
                formulario.correo
                  .trim()
                  .toLowerCase(),

              telefono:
                formulario.telefono.trim(),

              codigoQR,

              estado: "confirmada",

              fechaInscripcion:
                serverTimestamp(),
            }
          );
        }
      );

      /*
       * Actualiza el contador mostrado sin
       * volver a consultar todos los eventos.
       */
      setEventos((eventosActuales) =>
        eventosActuales.map((evento) =>
          evento.id ===
          formulario.eventoId
            ? {
                ...evento,
                inscritosActuales:
                  Number(
                    evento
                      .inscritosActuales || 0
                  ) + 1,
              }
            : evento
        )
      );

      setCodigoGenerado(codigoQR);

      setMensaje(
        "Inscripción realizada correctamente."
      );

      setTipoMensaje("exito");
      setFormulario(formularioInicial);
    } catch (error) {
      console.error(
        "Error al guardar la inscripción:",
        error
      );

      if (
        error.message ===
        "INSCRIPCION_DUPLICADA"
      ) {
        setMensaje(
          "Esta persona ya está inscrita en el evento seleccionado."
        );
      } else if (
        error.message ===
        "EVENTO_SIN_CUPOS"
      ) {
        setMensaje(
          "El evento alcanzó su capacidad máxima. No quedan cupos disponibles."
        );
      } else if (
        error.message ===
          "EVENTO_NO_EXISTE" ||
        error.message ===
          "EVENTO_NO_DISPONIBLE"
      ) {
        setMensaje(
          "El evento seleccionado ya no está disponible."
        );
      } else {
        setMensaje(
          "No fue posible completar la inscripción."
        );
      }

      setTipoMensaje("error");
    } finally {
      setGuardando(false);
    }
  };

  /* Obtiene el evento seleccionado */
  const eventoSeleccionado =
    eventos.find(
      (evento) =>
        evento.id ===
        formulario.eventoId
    );

  const cuposDisponibles =
    calcularCuposDisponibles(
      eventoSeleccionado
    );

  /* Descarga el código QR en formato PNG */
  const descargarQR = () => {
    const canvasQR =
      document.getElementById(
        "codigo-qr-asistente"
      );

    if (!canvasQR) {
      return;
    }

    const imagenQR =
      canvasQR.toDataURL("image/png");

    const enlaceDescarga =
      document.createElement("a");

    enlaceDescarga.href = imagenQR;

    enlaceDescarga.download =
      `EventControl-${codigoGenerado}.png`;

    enlaceDescarga.click();
  };

  return (
    <main className="inscripcion-page">
      <section className="inscripcion-card">
        <div className="inscripcion-marca">
          <span className="brand-icon">
            EC
          </span>

          <div>
            <h1>EventControl</h1>
            <p>
              Inscripción de asistentes
            </p>
          </div>
        </div>

        <h2>Inscripción a eventos</h2>

        <p className="inscripcion-descripcion">
          Completa tus datos para registrar
          tu participación.
        </p>

        {cargandoEventos ? (
          <p>
            Cargando eventos disponibles...
          </p>
        ) : eventos.length === 0 ? (
          <p className="mensaje-inscripcion error">
            No existen eventos activos
            disponibles.
          </p>
        ) : (
          <form
            className="form-inscripcion"
            onSubmit={guardarInscripcion}
          >
            <label htmlFor="eventoId">
              Evento
            </label>

            <select
              id="eventoId"
              name="eventoId"
              value={formulario.eventoId}
              onChange={actualizarCampo}
              required
            >
              <option value="">
                Selecciona un evento
              </option>

              {eventos.map((evento) => {
                const disponibles =
                  calcularCuposDisponibles(
                    evento
                  );

                return (
                  <option
                    key={evento.id}
                    value={evento.id}
                    disabled={
                      disponibles === 0
                    }
                  >
                    {evento.nombre} —{" "}
                    {disponibles > 0
                      ? `${disponibles} cupos disponibles`
                      : "Sin cupos"}
                  </option>
                );
              })}
            </select>

            {eventoSeleccionado && (
              <div className="evento-seleccionado">
                <p>
                  <strong>
                    Ubicación:
                  </strong>{" "}
                  {
                    eventoSeleccionado
                      .ubicacion
                  }
                </p>

                <p>
                  <strong>Fecha:</strong>{" "}
                  {
                    eventoSeleccionado
                      .fechaInicio
                  }

                  {eventoSeleccionado
                    .fechaTermino !==
                    eventoSeleccionado
                      .fechaInicio &&
                    ` al ${eventoSeleccionado.fechaTermino}`}
                </p>

                <p>
                  <strong>
                    Cupos disponibles:
                  </strong>{" "}
                  {cuposDisponibles} de{" "}
                  {
                    eventoSeleccionado
                      .capacidad
                  }
                </p>
              </div>
            )}

            <label htmlFor="tipoDocumento">
              Tipo de documento
            </label>

            <select
              id="tipoDocumento"
              name="tipoDocumento"
              value={
                formulario.tipoDocumento
              }
              onChange={actualizarCampo}
              required
            >
              <option value="rut">
                RUT chileno
              </option>

              <option value="pasaporte">
                Pasaporte
              </option>
            </select>

            <label htmlFor="numeroDocumento">
              {formulario.tipoDocumento ===
              "rut"
                ? "RUT"
                : "Número de pasaporte"}
            </label>

            <input
              id="numeroDocumento"
              name="numeroDocumento"
              type="text"
              value={
                formulario.numeroDocumento
              }
              onChange={actualizarCampo}
              placeholder={
                formulario.tipoDocumento ===
                "rut"
                  ? "Ejemplo: 12.345.678-5"
                  : "Ejemplo: PA123456"
              }
              autoComplete="off"
              required
            />

            <label htmlFor="nombreCompleto">
              Nombre completo
            </label>

            <input
              id="nombreCompleto"
              name="nombreCompleto"
              type="text"
              value={
                formulario.nombreCompleto
              }
              onChange={actualizarCampo}
              placeholder="Ejemplo: Juan Pérez Soto"
              autoComplete="name"
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
              autoComplete="email"
              required
            />

            <label htmlFor="telefono">
              Teléfono móvil
            </label>

            <input
              id="telefono"
              name="telefono"
              type="tel"
              inputMode="numeric"
              maxLength="15"
              value={formulario.telefono}
              onChange={actualizarCampo}
              placeholder="+56 9 1234 5678"
              autoComplete="tel"
              required
            />

            <button
              type="submit"
              disabled={
                guardando ||
                (
                  eventoSeleccionado &&
                  cuposDisponibles === 0
                )
              }
            >
              {guardando
                ? "Registrando..."
                : eventoSeleccionado &&
                    cuposDisponibles === 0
                  ? "Evento sin cupos"
                  : "Completar inscripción"}
            </button>
          </form>
        )}

        {mensaje && (
          <p
            className={`mensaje-inscripcion ${tipoMensaje}`}
          >
            {mensaje}
          </p>
        )}

        {codigoGenerado && (
          <div className="codigo-confirmacion">
            <h3>
              Inscripción confirmada
            </h3>

            <p>
              Presenta este código QR al
              ingresar al evento.
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

            <strong>
              {codigoGenerado}
            </strong>

            <button
              className="boton-descargar-qr"
              type="button"
              onClick={descargarQR}
            >
              Descargar código QR
            </button>
          </div>
        )}

        <a
          className="volver-login"
          href="/"
        >
          Volver al inicio de sesión
        </a>
      </section>
    </main>
  );
}

export default InscripcionPublica;