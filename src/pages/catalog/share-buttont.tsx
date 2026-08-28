import { ShareDecor } from "@/components/vectors";
import { Product } from "@/types";
import { openShareSheet } from "zmp-sdk/apis";
import { Icon } from "zmp-ui";

export default function ShareButton(props: { product: Product }) {
  const share = () => {
    openShareSheet({
      type: "zmp_deep_link",
      data: {
        title: props.product.name,
        thumbnail: props.product.image,
        path: `/product/${props.product.id}`,
      },
    });
  };

  return (
    <button
      className="relative w-full h-10 rounded-lg cursor-pointer overflow-hidden"
      onClick={share}
    >
      <div className="absolute inset-0 bg-[var(--zaui-light-button-secondary-background)] opacity-50" />
      <ShareDecor className="absolute inset-0" />
      <div className="relative flex space-x-1 text-primary text-sm font-medium p-2">
        <div>Chia sẻ ngay cho bạn bè</div>
        <Icon icon="zi-chevron-right" />
      </div>
    </button>
  );
}
