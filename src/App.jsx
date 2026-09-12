import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./services/firebase";
import Login from "./pages/Login";
import PanelAdministrador from "./pages/PanelAdministrador";
import PanelRecepcionista from "./pages/PanelRecepcionista";
import InscripcionPublica from "./pages/InscripcionPublica";
import "./App.css";

function App() {
  const paginaInscripcion =
    window.location.pathname === "/inscripcion";

  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (paginaInscripcion) {
      setCargando(false);
      return undefined;
    }

    const cancelarObservacion = onAuthStateChanged(
      auth,
      async (usuarioFirebase) => {
        try {
          if (usuarioFirebase) {
            const referenciaUsuario = doc(
              db,
              "usuarios",
              usuarioFirebase.uid
            );

            const documentoUsuario = await getDoc(
              referenciaUsuario
            );

            if (
              documentoUsuario.exists() &&
              documentoUsuario.data().activo === true
            ) {
              setUsuario(usuarioFirebase);
              setPerfil(documentoUsuario.data());
            } else {
              await signOut(auth);
              setUsuario(null);
              setPerfil(null);
            }
          } else {
            setUsuario(null);
            setPerfil(null);
          }
        } catch (error) {
          console.error(
            "Error al consultar el usuario:",
            error
          );

          setUsuario(null);
          setPerfil(null);
        } finally {
          setCargando(false);
        }
      }
    );

    return () => cancelarObservacion();
  }, [paginaInscripcion]);

  if (paginaInscripcion) {
    return <InscripcionPublica />;
  }

  if (cargando) {
    return <p className="loading">Cargando sistema...</p>;
  }

  if (!usuario || !perfil) {
    return <Login />;
  }

  if (perfil.rol === "administrador") {
    return <PanelAdministrador perfil={perfil} />;
  }

  if (perfil.rol === "recepcionista") {
    return <PanelRecepcionista perfil={perfil} />;
  }

  return (
    <p className="mensaje-sin-panel">
      El perfil no tiene un panel habilitado.
    </p>
  );
}

export default App;