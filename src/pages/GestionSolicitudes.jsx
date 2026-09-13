import { useEffect, useState } from "react";

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

function GestionSolicitudes() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [jornadas, setJornadas] = useState([]);

  const [cargando, setCargando] = useState(true);
  const [actualizandoId, setActualizandoId] =
    useState(null);
  const [mensaje, setMensaje] = useState("");

  /*
   * Carga las solicitudes y los datos necesarios
   * para mostrar nombres en lugar de identificadores.
   */
  const cargarDatos = async () => {
    try {
      setCargando(true);
      setMensaje("");

      const [
        resultadoSolicitudes,
        resultadoInscripciones,
        resultadoEventos,
        resultadoJornadas,
      ] = await Promise.all([
        getDocs(collection(db, "solicitudesPalabra")),
        getDocs(collection(db, "inscripciones")),
        getDocs(collection(db, "eventos")),
        getDocs(collection(db, "jornadas")),
      ]);

      const listaSolicitudes =
        resultadoSolicitudes.docs
          .map((documento) => ({
            id: documento.id,
            ...documento.data(),
          }))
          .sort((solicitudA, solicitudB) => {
            const fechaA =
              solicitudA.fechaSolicitud?.toMillis?.() || 0;

            const fechaB =
              solicitudB.fechaSolicitud?.toMillis?.() || 0;

            return fechaB - fechaA;
          });

      setSolicitudes(listaSolicitudes);

      setInscripciones(
        resultadoInscripciones.docs.map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
      );

      setEventos(
        resultadoEventos.docs.map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
      );

      setJornadas(
        resultadoJornadas.docs.map((documento) => ({
          id: documento.id,
          ...documento.data(),
        }))
      );
    } catch (error) {
      console.error(
        "Error al cargar las solicitudes:",
        error
      );

      setMensaje(
        "No fue posible cargar las solicitudes."
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  /*
   * Obtiene el nombre del asistente relacionado.
   */
  const obtenerNombreAsistente = (inscripcionId) => {
    const inscripcionEncontrada = inscripciones.find(
      (inscripcion) => inscripcion.id === inscripcionId
    );

    return (
      inscripcionEncontrada?.nombreCompleto ||
      "Asistente no encontrado"
    );
  };

  /*
   * Obtiene el nombre del evento.
   */
  const obtenerNombreEvento = (eventoId) => {
    const eventoEncontrado = eventos.find(
      (evento) => evento.id === eventoId
    );

    return eventoEncontrado?.nombre || "Evento no encontrado";
  };

  /*
   * Presenta la jornada con fecha y horario.
   */
  const obtenerJornada = (jornadaId) => {
    const jornadaEncontrada = jornadas.find(
      (jornada) => jornada.id === jornadaId
    );

    if (!jornadaEncontrada) {
      return "Jornada no encontrada";
    }

    const fecha = new Date(
      `${jornadaEncontrada.fecha}T00:00:00`
    ).toLocaleDateString("es-CL");

    return `${fecha} — ${jornadaEncontrada.inicio} a ${jornadaEncontrada.termino}`;
  };

  /*
   * Cambia el estado de una solicitud.
   */
  const actualizarEstado = async (
    solicitudId,
    nuevoEstado
  ) => {
    if (!auth.currentUser) {
      setMensaje(
        "La sesión del administrador no está disponible."
      );
      return;
    }

    try {
      setActualizandoId(solicitudId);
      setMensaje("");

      const referenciaSolicitud = doc(
        db,
        "solicitudesPalabra",
        solicitudId
      );

      await updateDoc(referenciaSolicitud, {
        estado: nuevoEstado,
        revisadoPor: auth.currentUser.uid,
        fechaRevision: serverTimestamp(),
      });

      setSolicitudes((solicitudesActuales) =>
        solicitudesActuales.map((solicitud) =>
          solicitud.id === solicitudId
            ? {
                ...solicitud,
                estado: nuevoEstado,
              }
            : solicitud
        )
      );

      if (nuevoEstado === "atendida") {
        setMensaje(
          "La solicitud fue marcada como atendida."
        );
      }

      if (nuevoEstado === "rechazada") {
        setMensaje(
          "La solicitud fue marcada como rechazada."
        );
      }

      if (nuevoEstado === "pendiente") {
        setMensaje(
          "La solicitud volvió al estado pendiente."
        );
      }
    } catch (error) {
      console.error(
        "Error al actualizar la solicitud:",
        error
      );

      setMensaje(
        "No fue posible actualizar la solicitud."
      );
    } finally {
      setActualizandoId(null);
    }
  };

  return (
    <section>
      <div className="encabezado-solicitudes">
        <div>
          <h2>Solicitudes de palabra</h2>

          <p>
            Revisa las preguntas e intervenciones
            registradas por recepción.
          </p>
        </div>

        <button
          className="boton-actualizar"
          type="button"
          onClick={cargarDatos}
          disabled={cargando}
        >
          {cargando ? "Cargando..." : "Actualizar lista"}
        </button>
      </div>

      {mensaje && (
        <p className="mensaje-evento">
          {mensaje}
        </p>
      )}

      {cargando ? (
        <p>Cargando solicitudes...</p>
      ) : solicitudes.length === 0 ? (
        <p>No existen solicitudes registradas.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla-eventos tabla-solicitudes">
            <thead>
              <tr>
                <th>Asistente</th>
                <th>Evento</th>
                <th>Jornada</th>
                <th>Pregunta o solicitud</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {solicitudes.map((solicitud) => (
                <tr key={solicitud.id}>
                  <td>
                    {obtenerNombreAsistente(
                      solicitud.inscripcionId
                    )}
                  </td>

                  <td>
                    {obtenerNombreEvento(
                      solicitud.eventoId
                    )}
                  </td>

                  <td>
                    {obtenerJornada(
                      solicitud.jornadaId
                    )}
                  </td>

                  <td className="texto-solicitud">
                    {solicitud.solicitud}
                  </td>

                  <td>
                    <span
                      className={`estado-solicitud ${solicitud.estado}`}
                    >
                      {solicitud.estado}
                    </span>
                  </td>

                  <td>
                    <div className="acciones-solicitud">
                      {solicitud.estado !== "atendida" && (
                        <button
                          className="boton-atender"
                          type="button"
                          disabled={
                            actualizandoId === solicitud.id
                          }
                          onClick={() =>
                            actualizarEstado(
                              solicitud.id,
                              "atendida"
                            )
                          }
                        >
                          Atendida
                        </button>
                      )}

                      {solicitud.estado !== "rechazada" && (
                        <button
                          className="boton-rechazar"
                          type="button"
                          disabled={
                            actualizandoId === solicitud.id
                          }
                          onClick={() =>
                            actualizarEstado(
                              solicitud.id,
                              "rechazada"
                            )
                          }
                        >
                          Rechazar
                        </button>
                      )}

                      {solicitud.estado !== "pendiente" && (
                        <button
                          className="boton-pendiente"
                          type="button"
                          disabled={
                            actualizandoId === solicitud.id
                          }
                          onClick={() =>
                            actualizarEstado(
                              solicitud.id,
                              "pendiente"
                            )
                          }
                        >
                          Pendiente
                        </button>
                      )}
                    </div>
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

export default GestionSolicitudes;