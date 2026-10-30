import { Product } from "@/types";
import { formatPrice } from "@/utils/format";
import TransitionLink from "./transition-link";
import { useState } from "react";
import { Button } from "zmp-ui";
import { useAddToCart } from "@/hooks";
import QuantityInput from "./quantity-input";

export interface ProductItemProps {
  product: Product;
  /**
   * Whether to replace the current page when user clicks on this product item. Default behavior is to push a new page to the history stack.
   * This prop should be used when navigating to a new product detail from a current product detail page (related products, etc.)
   */
  replace?: boolean;
}

export default function ProductItem(props: ProductItemProps) {
  const [selected, setSelected] = useState(false);
  const { addToCart, cartQuantity, stock } = useAddToCart(props.product);
  const renderProductContent = (isTransitioning: boolean) => (
    <>
      <div className="relative">
        <img
          src={props.product.image}
          className="w-full aspect-square object-cover rounded-lg"
          style={{
            viewTransitionName:
              isTransitioning && selected
                ? `product-image-${props.product.id}`
                : undefined,
          }}
          alt={props.product.name}
        />
        {stock === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/65 px-5 py-3 text-sm text-white">
              Hết hàng
            </span>
          </div>
        )}
      </div>
      <div className="pt-2 pb-1.5">
        <div className="pt-1 pb-0.5">
          <div
            style={{
              fontSize: "17px",
              fontWeight: "bold",
              marginBottom: "10px",
            }}
          >
            {props.product.name}
          </div>
        </div>
        <div
          style={{
            color: "#059747e1",
            fontSize: "18px",
            fontWeight: "700",
          }}
        >
          {formatPrice(props.product.price)}
        </div>
        {props.product.originalPrice && (
          <div
            style={{
              fontSize: "15px",
              fontWeight: "500",
            }}
          >
            <span className="text-subtitle line-through">
              {formatPrice(props.product.originalPrice)}
            </span>
            <span className="text-danger">
              -
              {100 -
                Math.round(
                  (props.product.price * 100) / props.product.originalPrice
                )}
              %
            </span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`flex flex-col ${
        stock === 0 ? "cursor-default" : "cursor-pointer"
      } group bg-section rounded-xl shadow-[0_10px_24px_#0D0D0D17]`}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {stock === 0 ? (
        <div className="p-2 pb-0">{renderProductContent(false)}</div>
      ) : (
        <TransitionLink
          to={`/product/${props.product.id}`}
          replace={props.replace}
          className="p-2 pb-0"
          onClick={() => setSelected(true)}
        >
          {({ isTransitioning }) => renderProductContent(isTransitioning)}
        </TransitionLink>
      )}
      {/* <div className="p-2"
      >
        {cartQuantity === 0 ? (
          <Button
            variant="secondary"
            size="small"
            fullWidth
            style={{
              marginTop:''
            }}
            disabled={stock === 0}
            onClick={(e) => {
              e.stopPropagation();
              addToCart(1, {
                toast: true,
              });
            }}
          >
            Thêm vào giỏ main
          </Button>
        ) : (
          <QuantityInput
            value={cartQuantity}
            maxValue={stock}
            onChange={addToCart}
          />
        )}
      </div> */}
    </div>
  );
}
