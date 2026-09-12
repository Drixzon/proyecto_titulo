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
  const [formulario, setFormulario] = useState(formularioInicial);
  const [eventos, setEventos] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarEventos = async () => {
    const consulta = query(
      collection(db, "eventos"),
      orderBy("nombre", "asc")
    );

    const resultado = await getDocs(consulta);

    const listaEventos = resultado.docs.map((documento) => ({
      id: documento.id,
      ...documento.data(),
    }));

    setEventos(listaEventos);
  };

  const cargarJornadas = async () => {
    const consulta = query(
      collection(db, "jornadas"),
      orderBy("fechaCreacion", "desc")
    );

    const resultado = await getDocs(consulta);

    const listaJornadas = resultado.docs.map((documento) => ({
      id: documento.id,
      ...documento.data(),
    }));

    setJornadas(listaJornadas);
  };

  const cargarDatos = async () => {
    try {
      await Promise.all([cargarEventos(), cargarJornadas()]);
    } catch (error) {
      console.error("Error al cargar la información:", error);
      setMensaje("No fue posible cargar la información.");
    }
  };

  useEffect(() => {
    cargarDatos();
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
      !formulario.fecha ||
      !formulario.inicio ||
      !formulario.termino
    ) {
      setMensaje("Debes completar todos los campos.");
      return false;
    }

    if (formulario.termino <= formulario.inicio) {
      setMensaje("La hora de término debe ser posterior a la hora de inicio.");
      return false;
    }

    const eventoSeleccionado = eventos.find(
      (evento) => evento.id === formulario.eventoId
    );

    if (
      eventoSeleccionado &&
      (formulario.fecha < eventoSeleccionado.fechaInicio ||
        formulario.fecha > eventoSeleccionado.fechaTermino)
    ) {
      setMensaje(
        "La jornada debe estar dentro de las fechas definidas para el evento."
      );
      return false;
    }

    return true;
  };

  const guardarJornada = async (eventoFormulario) => {
    eventoFormulario.preventDefault();
    setMensaje("");

    if (!validarFormulario()) {
      return;
    }

    try {
      setGuardando(true);

      await addDoc(collection(db, "jornadas"), {
        eventoId: formulario.eventoId,
        fecha: formulario.fecha,
        inicio: formulario.inicio,
        termino: formulario.termino,
        almuerzoHabilitado:
          formulario.almuerzoHabilitado === "true",
        creadoPor: auth.currentUser.uid,
        fechaCreacion: serverTimestamp(),
      });

      setFormulario(formularioInicial);
      setMensaje("Jornada guardada correctamente.");

      await cargarJornadas();
    } catch (error) {
      console.error("Error al guardar la jornada:", error);
      setMensaje("No fue posible guardar la jornada.");
    } finally {
      setGuardando(false);
    }
  };

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
        Registra los días y horarios correspondientes a cada evento.
      </p>

      <form className="form-evento" onSubmit={guardarJornada}>
        <label htmlFor="eventoId">Evento</label>
        <select
          id="eventoId"
          name="eventoId"
          value={formulario.eventoId}
          onChange={actualizarCampo}
        >
          <option value="">Selecciona un evento</option>

          {eventos.map((evento) => (
            <option key={evento.id} value={evento.id}>
              {evento.nombre}
            </option>
          ))}
        </select>

        <label htmlFor="fecha">Fecha de la jornada</label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          value={formulario.fecha}
          onChange={actualizarCampo}
        />

        <label htmlFor="inicio">Hora de inicio</label>
        <input
          id="inicio"
          name="inicio"
          type="time"
          value={formulario.inicio}
          onChange={actualizarCampo}
        />

        <label htmlFor="termino">Hora de término</label>
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

        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar jornada"}
        </button>
      </form>

      {mensaje && <p className="mensaje-evento">{mensaje}</p>}

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
                  <td>{obtenerNombreEvento(jornada.eventoId)}</td>
                  <td>{jornada.fecha}</td>
                  <td>{jornada.inicio}</td>
                  <td>{jornada.termino}</td>
                  <td>
                    {jornada.almuerzoHabilitado ? "Sí" : "No"}
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