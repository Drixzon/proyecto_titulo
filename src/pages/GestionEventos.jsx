import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

function GestionEventos() {
  const [nombre, setNombre] = useState("");
  const [lugar, setLugar] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaTermino, setFechaTermino] = useState("");
  const [estado, setEstado] = useState("planificado");

  const [eventos, setEventos] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarEventos = async () => {
    try {
      const consulta = await getDocs(collection(db, "eventos"));

      const listaEventos = consulta.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      listaEventos.sort((a, b) =>
        a.fechaInicio.localeCompare(b.fechaInicio)
      );

      setEventos(listaEventos);
    } catch (error) {
      console.error("Error al cargar eventos:", error);
      setMensaje("No fue posible cargar los eventos.");
    }
  };

  useEffect(() => {
    cargarEventos();
  }, []);

  const guardarEvento = async (event) => {
    event.preventDefault();
    setMensaje("");

    if (!nombre || !lugar || !fechaInicio || !fechaTermino) {
      setMensaje("Todos los campos son obligatorios.");
      return;
    }

    if (fechaTermino < fechaInicio) {
      setMensaje("La fecha de término no puede ser anterior al inicio.");
      return;
    }

    try {
      setGuardando(true);

      await addDoc(collection(db, "eventos"), {
        nombre,
        lugar,
        fechaInicio,
        fechaTermino,
        estado,
        creadoPor: auth.currentUser.uid,
        fechaCreacion: serverTimestamp(),
      });

      setNombre("");
      setLugar("");
      setFechaInicio("");
      setFechaTermino("");
      setEstado("planificado");
      setMensaje("Evento guardado correctamente.");

      await cargarEventos();
    } catch (error) {
      console.error("Error al guardar evento:", error);
      setMensaje("No fue posible guardar el evento.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section>
      <h2>Gestión de eventos</h2>

      <form className="form-evento" onSubmit={guardarEvento}>
        <label htmlFor="nombre">Nombre del evento</label>
        <input
          id="nombre"
          type="text"
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
        />

        <label htmlFor="lugar">Lugar</label>
        <input
          id="lugar"
          type="text"
          value={lugar}
          onChange={(event) => setLugar(event.target.value)}
        />

        <label htmlFor="fechaInicio">Fecha de inicio</label>
        <input
          id="fechaInicio"
          type="date"
          value={fechaInicio}
          onChange={(event) => setFechaInicio(event.target.value)}
        />

        <label htmlFor="fechaTermino">Fecha de término</label>
        <input
          id="fechaTermino"
          type="date"
          value={fechaTermino}
          onChange={(event) => setFechaTermino(event.target.value)}
        />

        <label htmlFor="estado">Estado</label>
        <select
          id="estado"
          value={estado}
          onChange={(event) => setEstado(event.target.value)}
        >
          <option value="planificado">Planificado</option>
          <option value="activo">Activo</option>
          <option value="finalizado">Finalizado</option>
        </select>

        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar evento"}
        </button>
      </form>

      {mensaje && <p className="mensaje-evento">{mensaje}</p>}

      <h3>Eventos registrados</h3>

      {eventos.length === 0 ? (
        <p>No existen eventos registrados.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla-eventos">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Lugar</th>
                <th>Inicio</th>
                <th>Término</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id}>
                  <td>{evento.nombre}</td>
                  <td>{evento.lugar}</td>
                  <td>{evento.fechaInicio}</td>
                  <td>{evento.fechaTermino}</td>
                  <td>{evento.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default GestionEventos;