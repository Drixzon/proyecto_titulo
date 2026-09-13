import { useState } from "react";
import { signOut } from "firebase/auth";
import ControlAcceso from "./ControlAcceso";
import ControlAlmuerzo from "./ControlAlmuerzo";
import RegistrarSolicitud from "./RegistrarSolicitud";
import { auth } from "../services/firebase";


function PanelRecepcionista({ perfil }) {
  const [vista, setVista] = useState("inicio");

  const cerrarSesion = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar la sesión:", error);
    }
  };

  return (
    <div className="panel panel-recepcionista">
      
      <header className="panel-header">
        <div>
          <h1>EventControl</h1>
          <p className="panel-tipo">Panel de recepción</p>
        </div>

        <button type="button" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </header>

      <nav className="panel-nav">
        <button
          className={vista === "inicio" ? "activo" : ""}
          type="button"
          onClick={() => setVista("inicio")}
        >
          Inicio
        </button>
        <button
           className={vista === "solicitud" ? "activo" : ""}
           type="button"
           onClick={() => setVista("solicitud")}
             >
           Solicitud de palabra
        </button>
        <button
          className={vista === "controlAcceso" ? "activo" : ""}
          type="button"
          onClick={() => setVista("controlAcceso")}
        >
          Control de acceso
        </button>
         <button

   
           className={vista === "almuerzo" ? "activo" : ""}
           type="button"
           onClick={() => setVista("almuerzo")}
           >
            Control de almuerzo
        </button>
      </nav>

     

      <main className="panel-content">
        {vista === "solicitud" && <RegistrarSolicitud />}
        {vista === "almuerzo" && <ControlAlmuerzo />}
        {vista === "inicio" && (
          <section>
            <h2>Panel del recepcionista</h2>

            <p>
              Bienvenido, {perfil.nombreCompleto}.
            </p>

            <p>
              Desde este panel podrás revisar códigos QR y
              registrar el ingreso de los asistentes.
            </p>

            <div className="resumen-recepcion">
              <article className="tarjeta-recepcion">
                <span className="tarjeta-icono">QR</span>
                

                <div>
                  <h3>Control mediante QR</h3>
                  <p>
                    Escanea el código presentado por el asistente.
                  </p>
                </div>
              </article>

              <article className="tarjeta-recepcion">
                <span className="tarjeta-icono">ID</span>

                <div>
                  <h3>Búsqueda manual</h3>
                  <p>
                    Busca una inscripción cuando no sea posible
                    leer el código QR.
                  </p>
                </div>
              </article>
            </div>
          </section>
        )}

       {vista === "controlAcceso" && <ControlAcceso />}
      </main>
    </div>
  );
}

export default PanelRecepcionista;