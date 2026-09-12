import { useState } from "react";
import { signOut } from "firebase/auth";

import { auth } from "../services/firebase";
import GestionEventos from "./GestionEventos";
import GestionJornadas from "./GestionJornadas";

function PanelAdministrador({ perfil }) {
  const [vista, setVista] = useState("inicio");

  const cerrarSesion = async () => {
    await signOut(auth);
  };

  return (
    <div className="panel">
      <header className="panel-header">
        <h1>EventControl</h1>
        <button onClick={cerrarSesion}>Cerrar sesión</button>
      </header>

      <nav className="panel-nav">
        <button onClick={() => setVista("inicio")}>
          Inicio
        </button>

        <button onClick={() => setVista("eventos")}>
          Eventos
        </button>

        <button onClick={() => setVista("jornadas")}>
          Jornadas
        </button>
      </nav>

      <main className="panel-content">
        {vista === "inicio" && (
          <>
            <h2>Panel de administración</h2>
            <p>Bienvenido, {perfil.nombreCompleto}</p>
            <p>Rol: {perfil.rol}</p>
          </>
        )}

        {vista === "eventos" && <GestionEventos />}

        {vista === "jornadas" && <GestionJornadas />}
      </main>
    </div>
  );
}

export default PanelAdministrador;