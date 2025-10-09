import React from "react";
import "./index.scss";
import { Link } from "react-router-dom";

function Header(props) {
  function handleChange(e) {
    // función que llega del padre
    if (e.key === "Enter") {
      props.handleCallback(e.target.value);
    }
  }

  return (
    <div className="header-container">
      <Link to="/">
        <img
          className="img-header"
          src="https://lh3.googleusercontent.com/kfyGNSlj-zTuOWGvBtSpvPIzC_aHjpQDUv6d9md-edQYxrH7jDHK9-pCFf9PUfQ9sBc"
          alt="logo Meli"
        />
      </Link>

      <input
        className="input-header"
        type="text"
        placeholder="¿Qué querés buscar?"
        onKeyDown={handleChange}
      />
      <p className="text-header">Comprá hoy y pagá después</p>
    </div>
  );
}

export default Header;
