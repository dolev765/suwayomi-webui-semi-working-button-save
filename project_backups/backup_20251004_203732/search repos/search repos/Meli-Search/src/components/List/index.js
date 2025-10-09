import React, { useState, useEffect } from "react";
import Item from "../Item";
import axios from "axios";
import "./index.scss";
import { useParams } from "react-router-dom";

function List(props) {
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const searchQuery = props.searchParam ? props.searchParam : "oferta";
  console.log("List", props.searchParam, searchQuery);

  useEffect(() => {
    fetchData();
  }, [searchQuery]);

  async function fetchData() {
    const getItems = await axios.get(
      `https://api.mercadolibre.com/sites/${id}/search?q=${searchQuery}&limit=20`
    );

    setItems(getItems.data.results);
  }

  return (
    <div className="list-container">
      {items
        // .filter(item => {
        //   return item.title.toLowerCase().includes(props.searchParam.toLowerCase());
        // })
        .map((item, key) => {
          return (
            <Item
              title={item.title}
              img={item.thumbnail}
              id={item.id}
              price={item.price}
              key={item.id ? item.id : key}
            />
          );
        })}
    </div>
  );
}

export default List;
