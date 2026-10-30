import { Product } from "@/types";
import ProductItem from "./product-item";
import { HTMLAttributes } from "react";

export interface ProductGridProps extends HTMLAttributes<HTMLDivElement> {
  products: Product[];
  replace?: boolean;
  showAddToCart?: boolean;
}

export default function ProductGrid({
  products,
  className,
  replace,
  showAddToCart,
  ...props
}: ProductGridProps) {
  const inStockProducts = products.filter(
    (product) => Number(product.stock) > 0
  );
  const outOfStockProducts = products.filter(
    (product) => !(Number(product.stock) > 0)
  );

  return (
    <div
      className={"grid grid-cols-2 px-4 pt-2 pb-8 gap-4 ".concat(
        className ?? ""
      )}
      {...props}
    >
      {inStockProducts.map((product) => (
        <ProductItem
          key={product.id}
          product={product}
          replace={replace}
          showAddToCart={showAddToCart}
        />
      ))}
      {outOfStockProducts.length > 0 && (
        <div className="col-span-2 pt-2 font-semibold text-subtitle"
        style={{
          fontWeight:"bold",
          fontSize:"15px",
          color:"red"
        }}>
          Sản phẩm đã hết hàng
        </div>
      )}
      {outOfStockProducts.map((product) => (
        <ProductItem
          key={product.id}
          product={product}
          replace={replace}
          showAddToCart={showAddToCart}
        />
      ))}
    </div>
  );
}
