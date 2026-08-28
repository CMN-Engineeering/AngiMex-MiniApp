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
  const { addToCart, cartQuantity } = useAddToCart(props.product);

  return (
    <div
      className="flex flex-col cursor-pointer group bg-section rounded-xl shadow-[0_10px_24px_#0D0D0D17]"
      onClick={() => setSelected(true)}
    >
      <TransitionLink
        to={`/product/${props.product.id}`}
        replace={props.replace}
        className="p-2 pb-0"
      >
        {({ isTransitioning }) => (
          <>
            <img
              src={props.product.image}
              className="w-full aspect-square object-cover rounded-lg"
              style={{
                viewTransitionName:
                  isTransitioning && selected // only animate the "clicked" product item in related products list
                    ? `product-image-${props.product.id}`
                    : undefined,
              }}
              alt={props.product.name}
            />
            <div className="pt-2 pb-1.5">
              <div className="pt-1 pb-0.5">
                <div className="text-xs h-9 line-clamp-2">
                  {props.product.name}
                </div>
              </div>
              <div className="mt-0.5 text-sm font-bold text-primary truncate">
                {formatPrice(props.product.price)}
              </div>
              {props.product.originalPrice && (
                <div className="text-3xs space-x-0.5 truncate">
                  <span className="text-subtitle line-through">
                    {formatPrice(props.product.originalPrice)}
                  </span>
                  <span className="text-danger">
                    -
                    {100 -
                      Math.round(
                        (props.product.price * 100) /
                          props.product.originalPrice
                      )}
                    %
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </TransitionLink>
      <div className="p-2">
        {cartQuantity === 0 ? (
          <Button
            variant="secondary"
            size="small"
            fullWidth
            onClick={(e) => {
              e.stopPropagation();
              addToCart(1, {
                toast: true,
              });
            }}
          >
            Thêm vào giỏ
          </Button>
        ) : (
          <QuantityInput value={cartQuantity} onChange={addToCart} />
        )}
      </div>
    </div>
  );
}
