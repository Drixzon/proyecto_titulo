import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import "../App.css";

function Login() {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  const iniciarSesion = async (event) => {
    event.preventDefault();
    setMensaje("");

    if (!correo.trim() || !contrasena) {
      setTipoMensaje("error");
      setMensaje("Debes ingresar el correo y la contraseña.");
      return;
    }

    try {
      setCargando(true);

      const credencial = await signInWithEmailAndPassword(
        auth,
        correo.trim(),
        contrasena
      );

      setTipoMensaje("exito");
      setMensaje(`Inicio de sesión correcto: ${credencial.user.email}`);
    } catch (error) {
      console.error("Error de autenticación:", error.code);

      setTipoMensaje("error");

      if (error.code === "auth/invalid-credential") {
        setMensaje("El correo o la contraseña no son correctos.");
      } else if (error.code === "auth/too-many-requests") {
        setMensaje("Demasiados intentos. Inténtalo nuevamente más tarde.");
      } else {
        setMensaje("No fue posible iniciar sesión.");
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-information">
        <div className="brand">
          <span className="brand-icon">ECONTROL</span>
          <span>EventControl</span>
        </div>

        <div className="information-content">
          <p className="eyebrow">Gestión de eventos</p>
          <h1>Control organizado de Eventos.</h1>
          <p>
            Administra eventos, jornadas, participantes, asistencias y
            beneficios desde un único sistema. 
          </p>
        </div>

        <p className="information-footer">
          Proyecto de título · Ingeniería Informática IPLACEX
        </p>
      </section>

      <section className="login-access">
        <div className="login-card">
          <div className="mobile-brand">
            <span className="brand-icon">EC</span>
            <span>EventControl</span>
          </div>

          <p className="eyebrow">Área protegida</p>
          <h2>Iniciar sesión</h2>
          <p className="login-description">
            Ingresa con tu cuenta de administrador o personal autorizado.
          </p>

          <form onSubmit={iniciarSesion}>
            <div className="form-group">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                id="correo"
                type="email"
                value={correo}
                onChange={(event) => setCorreo(event.target.value)}
                placeholder="nombre@correo.cl"
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="contrasena">Contraseña</label>
              <input
                id="contrasena"
                type="password"
                value={contrasena}
                onChange={(event) => setContrasena(event.target.value)}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
              />
            </div>

            {mensaje && (
              <div className={`message ${tipoMensaje}`} aria-live="polite">
                {mensaje}
              </div>
            )}

            <button type="submit" disabled={cargando}>
              {cargando ? "Ingresando..." : "Ingresar al sistema"}
            </button>
          </form>

          <p className="support-text">
            El acceso está reservado para personal autorizado.
          </p>
        </div>
      </section>
    </main>
  );
}

export default Login;