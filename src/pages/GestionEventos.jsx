import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

/* Valores iniciales del formulario */
const formularioInicial = {
  nombre: "",
  descripcion: "",
  ubicacion: "",
  capacidad: "",
  fechaInicio: "",
  fechaTermino: "",
  estado: "planificado",
};

function GestionEventos() {
  const [formulario, setFormulario] =
    useState(formularioInicial);

  const [eventos, setEventos] = useState([]);
  const [eventoEditandoId, setEventoEditandoId] =
    useState(null);

  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  /* Carga todos los eventos registrados */
  const cargarEventos = async () => {
    try {
      const consulta = query(
        collection(db, "eventos"),
        orderBy("fechaCreacion", "desc")
      );

      const resultado = await getDocs(consulta);

      const listaEventos = resultado.docs.map(
        (documento) => ({
          id: documento.id,
          ...documento.data(),

          /*
           * Los eventos antiguos que no tengan contador
           * se consideran inicialmente con cero inscritos.
           */
          inscritosActuales:
            documento.data().inscritosActuales || 0,
        })
      );

      setEventos(listaEventos);
    } catch (error) {
      console.error(
        "Error al cargar los eventos:",
        error
      );

      setMensaje(
        "No fue posible cargar los eventos."
      );
    }
  };

  useEffect(() => {
    cargarEventos();
  }, []);

  /* Actualiza los campos del formulario */
  const actualizarCampo = (evento) => {
    const { name, value } = evento.target;

    setFormulario((formularioActual) => ({
      ...formularioActual,
      [name]: value,
    }));
  };

  /* Obtiene el evento que está siendo editado */
  const obtenerEventoEditando = () => {
    return eventos.find(
      (evento) => evento.id === eventoEditandoId
    );
  };

  /* Valida los datos ingresados */
  const validarFormulario = () => {
    if (
      !formulario.nombre.trim() ||
      !formulario.descripcion.trim() ||
      !formulario.ubicacion.trim() ||
      !formulario.capacidad ||
      !formulario.fechaInicio ||
      !formulario.fechaTermino
    ) {
      setMensaje(
        "Debes completar todos los campos."
      );

      return false;
    }

    const capacidadIngresada = Number(
      formulario.capacidad
    );

    if (
      !Number.isInteger(capacidadIngresada) ||
      capacidadIngresada <= 0
    ) {
      setMensaje(
        "La capacidad debe ser un número entero mayor que cero."
      );

      return false;
    }

    if (
      formulario.fechaTermino <
      formulario.fechaInicio
    ) {
      setMensaje(
        "La fecha final no puede ser anterior a la fecha inicial."
      );

      return false;
    }

    /*
     * Si se edita un evento, no permite establecer
     * una capacidad inferior a sus inscritos actuales.
     */
    if (eventoEditandoId) {
      const eventoEditando =
        obtenerEventoEditando();

      const inscritosActuales = Number(
        eventoEditando?.inscritosActuales || 0
      );

      if (
        capacidadIngresada < inscritosActuales
      ) {
        setMensaje(
          `La capacidad no puede ser inferior a los ${inscritosActuales} inscritos actuales.`
        );

        return false;
      }
    }

    return true;
  };

  /* Crea o actualiza un evento */
  const guardarEvento = async (
    eventoFormulario
  ) => {
    eventoFormulario.preventDefault();
    setMensaje("");

    if (!validarFormulario()) {
      return;
    }

    const datosEvento = {
      nombre: formulario.nombre.trim(),
      descripcion:
        formulario.descripcion.trim(),
      ubicacion: formulario.ubicacion.trim(),
      capacidad: Number(formulario.capacidad),
      fechaInicio: formulario.fechaInicio,
      fechaTermino: formulario.fechaTermino,
      estado: formulario.estado,
    };

    try {
      setGuardando(true);

      if (eventoEditandoId) {
        const eventoEditando =
          obtenerEventoEditando();

        const referenciaEvento = doc(
          db,
          "eventos",
          eventoEditandoId
        );

        await updateDoc(referenciaEvento, {
          ...datosEvento,

          /*
           * Conserva el número de inscritos.
           * Si es un evento antiguo, comienza en cero.
           */
          inscritosActuales: Number(
            eventoEditando?.inscritosActuales || 0
          ),

          actualizadoPor:
            auth.currentUser.uid,

          fechaActualizacion:
            serverTimestamp(),
        });

        setMensaje(
          "Evento actualizado correctamente."
        );
      } else {
        await addDoc(
          collection(db, "eventos"),
          {
            ...datosEvento,

            /* Todo evento nuevo comienza sin inscritos */
            inscritosActuales: 0,

            creadoPor:
              auth.currentUser.uid,

            fechaCreacion:
              serverTimestamp(),
          }
        );

        setMensaje(
          "Evento guardado correctamente."
        );
      }

      setFormulario(formularioInicial);
      setEventoEditandoId(null);

      await cargarEventos();
    } catch (error) {
      console.error(
        "Error al guardar el evento:",
        error
      );

      setMensaje(
        "No fue posible guardar el evento."
      );
    } finally {
      setGuardando(false);
    }
  };

  /* Carga un evento en el formulario para editarlo */
  const editarEvento = (evento) => {
    setFormulario({
      nombre: evento.nombre || "",
      descripcion: evento.descripcion || "",
      ubicacion: evento.ubicacion || "",
      capacidad: evento.capacidad || "",
      fechaInicio: evento.fechaInicio || "",
      fechaTermino: evento.fechaTermino || "",
      estado: evento.estado || "planificado",
    });

    setEventoEditandoId(evento.id);

    setMensaje(
      `Editando evento. Actualmente tiene ${
        evento.inscritosActuales || 0
      } inscritos.`
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /* Cancela la modificación del evento */
  const cancelarEdicion = () => {
    setFormulario(formularioInicial);
    setEventoEditandoId(null);
    setMensaje("");
  };

  /* Calcula los cupos disponibles de un evento */
  const calcularCuposDisponibles = (
    evento
  ) => {
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

  return (
    <section>
      <h2>Gestión de eventos</h2>

      <p>
        Crea, consulta y actualiza los eventos
        registrados en el sistema.
      </p>

      <form
        className="form-evento"
        onSubmit={guardarEvento}
      >
        <label htmlFor="nombre">
          Nombre del evento
        </label>

        <input
          id="nombre"
          name="nombre"
          type="text"
          value={formulario.nombre}
          onChange={actualizarCampo}
          required
        />

        <label htmlFor="descripcion">
          Descripción
        </label>

        <textarea
          id="descripcion"
          name="descripcion"
          rows="4"
          value={formulario.descripcion}
          onChange={actualizarCampo}
          required
        />

        <label htmlFor="ubicacion">
          Ubicación
        </label>

        <input
          id="ubicacion"
          name="ubicacion"
          type="text"
          value={formulario.ubicacion}
          onChange={actualizarCampo}
          required
        />

        <label htmlFor="capacidad">
          Capacidad máxima
        </label>

        <input
          id="capacidad"
          name="capacidad"
          type="number"
          min="1"
          step="1"
          value={formulario.capacidad}
          onChange={actualizarCampo}
          required
        />

        <label htmlFor="fechaInicio">
          Fecha de inicio
        </label>

        <input
          id="fechaInicio"
          name="fechaInicio"
          type="date"
          value={formulario.fechaInicio}
          onChange={actualizarCampo}
          required
        />

        <label htmlFor="fechaTermino">
          Fecha de término
        </label>

        <input
          id="fechaTermino"
          name="fechaTermino"
          type="date"
          value={formulario.fechaTermino}
          onChange={actualizarCampo}
          required
        />

        <label htmlFor="estado">
          Estado
        </label>

        <select
          id="estado"
          name="estado"
          value={formulario.estado}
          onChange={actualizarCampo}
        >
          <option value="planificado">
            Planificado
          </option>

          <option value="activo">
            Activo
          </option>

          <option value="finalizado">
            Finalizado
          </option>

          <option value="cancelado">
            Cancelado
          </option>
        </select>

        <button
          type="submit"
          disabled={guardando}
        >
          {guardando
            ? "Guardando..."
            : eventoEditandoId
              ? "Actualizar evento"
              : "Guardar evento"}
        </button>

        {eventoEditandoId && (
          <button
            className="boton-cancelar"
            type="button"
            onClick={cancelarEdicion}
          >
            Cancelar edición
          </button>
        )}
      </form>

      {mensaje && (
        <p className="mensaje-evento">
          {mensaje}
        </p>
      )}

      <h3>Eventos registrados</h3>

      {eventos.length === 0 ? (
        <p>No existen eventos registrados.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla-eventos">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ubicación</th>
                <th>Capacidad</th>
                <th>Inscritos</th>
                <th>Cupos disponibles</th>
                <th>Inicio</th>
                <th>Término</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id}>
                  <td>{evento.nombre}</td>
                  <td>{evento.ubicacion}</td>
                  <td>{evento.capacidad}</td>

                  <td>
                    {evento.inscritosActuales || 0}
                  </td>

                  <td>
                    {calcularCuposDisponibles(
                      evento
                    )}
                  </td>

                  <td>{evento.fechaInicio}</td>
                  <td>{evento.fechaTermino}</td>
                  <td>{evento.estado}</td>

                  <td>
                    <button
                      className="boton-editar"
                      type="button"
                      onClick={() =>
                        editarEvento(evento)
                      }
                    >
                      Editar
                    </button>
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

export default GestionEventos;