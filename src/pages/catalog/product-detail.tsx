import HorizontalDivider from "@/components/horizontal-divider";
import { useAtomValue } from "jotai";
import { useNavigate, useParams } from "react-router-dom";
import { productState } from "@/state";
import { formatPrice } from "@/utils/format";
import ShareButton from "./share-buttont";
import RelatedProducts from "./related-products";
import { useAddToCart } from "@/hooks";
import { Button } from "zmp-ui";
import Section from "@/components/section";

export default function ProductDetailPage() {
  const { id } = useParams();
  const product = useAtomValue(productState(Number(id)))!;

  const navigate = useNavigate();
  const { addToCart } = useAddToCart(product);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="w-full p-4 pb-2 space-y-4 bg-section">
          <img
            key={product.id}
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover rounded-lg"
            style={{
              viewTransitionName: `product-image-${product.id}`,
            }}
          />
          <div>
            <div className="text-xl font-bold text-primary">
              {formatPrice(product.price)}
            </div>
            {product.originalPrice && (
              <div className="text-2xs space-x-0.5">
                <span className="text-subtitle line-through">
                  {formatPrice(product.originalPrice)}
                </span>
                <span className="text-danger">
                  -
                  {100 -
                    Math.round((product.price * 100) / product.originalPrice)}
                  %
                </span>
              </div>
            )}
            <div className="text-sm mt-1">{product.name}</div>
          </div>
          <ShareButton product={product} />
        </div>
        {product.detail && (
          <>
            <div className="bg-background h-2 w-full"></div>
            <Section title="Mô tả sản phẩm">
              <div className="text-sm whitespace-pre-wrap text-subtitle p-4 pt-2">
                {product.detail}
              </div>
            </Section>
          </>
        )}
        <div className="bg-background h-2 w-full"></div>
        <Section title="Sản phẩm khác">
          <RelatedProducts currentProductId={product.id} />
        </Section>
      </div>

      <HorizontalDivider />
      <div className="flex-none grid grid-cols-2 gap-2 py-3 px-4 bg-section">
        <Button
          variant="tertiary"
          onClick={() => {
            addToCart(1, {
              toast: true,
            });
          }}
        >
          Thêm vào giỏ
        </Button>
        <Button
          onClick={() => {
            addToCart(1);
            navigate("/cart", {
              viewTransition: true,
            });
          }}
        >
          Mua ngay
        </Button>
      </div>
    </div>
  );
}
