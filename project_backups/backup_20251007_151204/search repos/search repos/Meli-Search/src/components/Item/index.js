import React from "react";
import "./index.scss";
import { Link } from "react-router-dom";

function Item(props) {
  const { title, img, price, id } = props;
  return (
    <Link to={`/product/${id}`}>
      <div className="container-item">
        <img className="img-item" src={img} />
        <p className="price-item">$ {price}</p>
        <p className="title-item">{title}</p>
      </div>
    </Link>
  );
}

export default Item;
