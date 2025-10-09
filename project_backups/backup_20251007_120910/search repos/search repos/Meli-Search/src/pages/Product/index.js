import React, { useState, useEffect } from "react";
import axios from "axios";
import "./index.scss";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";

function Product(props) {
  const { id } = useParams();
  const [product, setProduct] = useState([]);
  const [img, setImg] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const getItems = await axios.get(`https://api.mercadolibre.com/items/${id}`);

    setProduct(getItems.data);
    setImg(getItems.data.pictures[0]);
  }

  return (
    <div className="product-container">
      <div className="item-container">
        <img className="product-img" src={img.url} />
        <div className="text-container">
          <p className="product-title">{product.title}</p>
          <span className="product-price">$ {product.price}</span>
          <span className="product-currency">{product.currency_id}</span>
          {product.price !== product.original_price && (
            <span className="product-base-price">{product.original_price}</span>
          )}
          <p className="product-vendidos">
            Cantidad de productos vendidos: {product.sold_quantity}
          </p>
          {product.accepts_mercadopago && <p className="mercadopago">Acepta Mercadopago</p>}
          {product.condition === "new" ? (
            <p className="mercadopago">Nuevo</p>
          ) : (
            <p className="mercadopago">Usado</p>
          )}
        </div>
      </div>
      <Link className="volver" to={`/search/${id.substring(0, 3)}`}>
        Volver
      </Link>
    </div>
  );
}

export default Product;
