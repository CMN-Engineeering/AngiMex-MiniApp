import {
  OrderHistoryIcon,
  PackageIcon,
  VoucherIcon,
} from "@/components/vectors";
import { useToBeImplemented } from "@/hooks";
import { OrderStatus } from "@/types";
import { useNavigate } from "react-router-dom";

export default function ProfileActions() {
  const navigate = useNavigate();
  const goToOrders = (status: OrderStatus) => {
    navigate(`/orders/${status}`);
  };

  return (
    <div className="bg-white rounded-lg p-4 grid grid-cols-3 gap-4 border-[0.5px] border-black/15">
      {[
        {
          label: "Đang xử lý",
          icon: VoucherIcon,
          onClick: () => goToOrders("pending"),
        },
        {
          label: "Đang giao",
          icon: PackageIcon,
          onClick: () => goToOrders("shipping"),
        },
        {
          label: "Lịch sử",
          icon: OrderHistoryIcon,
          onClick: () => goToOrders("completed"),
        },
      ].map((action) => (
        <div
          key={action.label}
          className="flex flex-col gap-2 items-center cursor-pointer"
          onClick={action.onClick}
        >
          <div className="w-10 h-10 rounded-full bg-[#EBEFF7] flex items-center justify-center">
            <action.icon active />
          </div>
          <div className="text-2xs text-center">{action.label}</div>
        </div>
      ))}
    </div>
  );
}
