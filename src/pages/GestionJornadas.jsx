import { useEffect, useState } from "react";

import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

const formularioInicial = {
  eventoId: "",
  fecha: "",
  inicio: "",
  termino: "",
  almuerzoHabilitado: "false",
};

function GestionJornadas() {
  const [formulario, setFormulario] =
    useState(formularioInicial);

  const [eventos, setEventos] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  /*
   * Obtiene los eventos registrados.
   */
  const cargarEventos = async () => {
    const consulta = query(
      collection(db, "eventos"),
      orderBy("nombre", "asc")
    );

    const resultado = await getDocs(consulta);

    const listaEventos = resultado.docs.map(
      (documento) => ({
        id: documento.id,
        ...documento.data(),
      })
    );

    setEventos(listaEventos);
  };

  /*
   * Obtiene todas las jornadas registradas.
   */
  const cargarJornadas = async () => {
    const consulta = query(
      collection(db, "jornadas"),
      orderBy("fechaCreacion", "desc")
    );

    const resultado = await getDocs(consulta);

    const listaJornadas = resultado.docs.map(
      (documento) => ({
        id: documento.id,
        ...documento.data(),
      })
    );

    setJornadas(listaJornadas);
  };

  /*
   * Carga eventos y jornadas al abrir el módulo.
   */
  const cargarDatos = async () => {
    try {
      await Promise.all([
        cargarEventos(),
        cargarJornadas(),
      ]);
    } catch (error) {
      console.error(
        "Error al cargar la información:",
        error
      );

      setMensaje(
        "No fue posible cargar la información."
      );
      setTipoMensaje("error");
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  /*
   * Evento actualmente seleccionado en el formulario.
   */
  const eventoSeleccionado = eventos.find(
    (evento) => evento.id === formulario.eventoId
  );

  /*
   * Actualiza los campos del formulario.
   * Si cambia el evento, limpia la fecha anterior.
   */
  const actualizarCampo = (eventoFormulario) => {
    const { name, value } = eventoFormulario.target;

    setMensaje("");
    setTipoMensaje("");

    setFormulario((formularioActual) => ({
      ...formularioActual,
      [name]: value,
      ...(name === "eventoId"
        ? {
            fecha: "",
          }
        : {}),
    }));
  };

  /*
   * Comprueba los campos, las fechas y los duplicados.
   */
  const validarFormulario = () => {
    if (
      !formulario.eventoId ||
      !formulario.fecha ||
      !formulario.inicio ||
      !formulario.termino
    ) {
      setMensaje("Debes completar todos los campos.");
      setTipoMensaje("error");
      return false;
    }

    if (formulario.termino <= formulario.inicio) {
      setMensaje(
        "La hora de término debe ser posterior a la hora de inicio."
      );
      setTipoMensaje("error");
      return false;
    }

    if (
      eventoSeleccionado &&
      (formulario.fecha <
        eventoSeleccionado.fechaInicio ||
        formulario.fecha >
        eventoSeleccionado.fechaTermino)
    ) {
      setMensaje(
        "La jornada debe estar dentro de las fechas definidas para el evento."
      );
      setTipoMensaje("error");
      return false;
    }

    /*
     * Un evento puede tener varias jornadas,
     * pero no dos jornadas en la misma fecha.
     */
    const jornadaDuplicada = jornadas.some(
      (jornada) =>
        jornada.eventoId === formulario.eventoId &&
        jornada.fecha === formulario.fecha
    );

    if (jornadaDuplicada) {
      setMensaje(
        "Este evento ya tiene una jornada registrada para la fecha seleccionada."
      );
      setTipoMensaje("duplicado");
      return false;
    }

    return true;
  };

  /*
   * Guarda una nueva jornada.
   */
  const guardarJornada = async (
    eventoFormulario
  ) => {
    eventoFormulario.preventDefault();

    setMensaje("");
    setTipoMensaje("");

    if (!validarFormulario()) {
      return;
    }

    try {
      setGuardando(true);

      /*
       * Guardamos temporalmente el evento para
       * mantenerlo seleccionado después del registro.
       */
      const eventoIdActual = formulario.eventoId;

      await addDoc(collection(db, "jornadas"), {
        eventoId: eventoIdActual,
        fecha: formulario.fecha,
        inicio: formulario.inicio,
        termino: formulario.termino,
        almuerzoHabilitado:
          formulario.almuerzoHabilitado === "true",
        creadoPor: auth.currentUser.uid,
        fechaCreacion: serverTimestamp(),
      });

      /*
       * Limpiamos fecha y horarios, pero conservamos
       * el evento para registrar el siguiente día.
       */
      setFormulario({
        ...formularioInicial,
        eventoId: eventoIdActual,
      });

      setMensaje(
        "Jornada guardada. Puedes registrar otro día para el mismo evento."
      );
      setTipoMensaje("exito");

      await cargarJornadas();
    } catch (error) {
      console.error(
        "Error al guardar la jornada:",
        error
      );

      setMensaje(
        "No fue posible guardar la jornada."
      );
      setTipoMensaje("error");
    } finally {
      setGuardando(false);
    }
  };

  /*
   * Obtiene el nombre del evento relacionado.
   */
  const obtenerNombreEvento = (eventoId) => {
    const eventoEncontrado = eventos.find(
      (evento) => evento.id === eventoId
    );

    return eventoEncontrado
      ? eventoEncontrado.nombre
      : "Evento no encontrado";
  };

  return (
    <section>
      <h2>Gestión de jornadas</h2>

      <p>
        Registra cada día y horario correspondiente
        al evento.
      </p>

      <form
        className="form-evento"
        onSubmit={guardarJornada}
      >
        <label htmlFor="eventoId">Evento</label>

        <select
          id="eventoId"
          name="eventoId"
          value={formulario.eventoId}
          onChange={actualizarCampo}
        >
          <option value="">
            Selecciona un evento
          </option>

          {eventos.map((evento) => (
            <option
              key={evento.id}
              value={evento.id}
            >
              {evento.nombre}
            </option>
          ))}
        </select>

        {eventoSeleccionado && (
          <div className="evento-seleccionado">
            <p>
              <strong>Periodo permitido:</strong>
            </p>

            <p>
              {eventoSeleccionado.fechaInicio}
              {" al "}
              {eventoSeleccionado.fechaTermino}
            </p>
          </div>
        )}

        <label htmlFor="fecha">
          Fecha de la jornada
        </label>

        <input
          id="fecha"
          name="fecha"
          type="date"
          min={eventoSeleccionado?.fechaInicio || ""}
          max={eventoSeleccionado?.fechaTermino || ""}
          value={formulario.fecha}
          onChange={actualizarCampo}
          disabled={!formulario.eventoId}
        />

        <label htmlFor="inicio">
          Hora de inicio
        </label>

        <input
          id="inicio"
          name="inicio"
          type="time"
          value={formulario.inicio}
          onChange={actualizarCampo}
        />

        <label htmlFor="termino">
          Hora de término
        </label>

        <input
          id="termino"
          name="termino"
          type="time"
          value={formulario.termino}
          onChange={actualizarCampo}
        />

        <label htmlFor="almuerzoHabilitado">
          ¿La jornada incluye almuerzo?
        </label>

        <select
          id="almuerzoHabilitado"
          name="almuerzoHabilitado"
          value={formulario.almuerzoHabilitado}
          onChange={actualizarCampo}
        >
          <option value="false">No</option>
          <option value="true">Sí</option>
        </select>

        <button
          type="submit"
          disabled={guardando}
        >
          {guardando
            ? "Guardando..."
            : "Guardar jornada"}
        </button>
      </form>

      {mensaje && (
        <div
          className={`mensaje-control ${tipoMensaje}`}
          role="alert"
          aria-live="polite"
        >
          {tipoMensaje === "duplicado" && (
            <span className="mensaje-control-icono">
              !
            </span>
          )}

          <span>{mensaje}</span>
        </div>
      )}

      <h3>Jornadas registradas</h3>

      {jornadas.length === 0 ? (
        <p>No existen jornadas registradas.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla-eventos">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Fecha</th>
                <th>Inicio</th>
                <th>Término</th>
                <th>Almuerzo</th>
              </tr>
            </thead>

            <tbody>
              {jornadas.map((jornada) => (
                <tr key={jornada.id}>
                  <td>
                    {obtenerNombreEvento(
                      jornada.eventoId
                    )}
                  </td>

                  <td>{jornada.fecha}</td>
                  <td>{jornada.inicio}</td>
                  <td>{jornada.termino}</td>

                  <td>
                    {jornada.almuerzoHabilitado
                      ? "Sí"
                      : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default GestionJornadas;