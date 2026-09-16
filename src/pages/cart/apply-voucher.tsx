import Section from "@/components/section";
import { VoucherIcon } from "@/components/vectors";
import { useToBeImplemented } from "@/hooks";
import { Icon } from "zmp-ui";
import toast from "react-hot-toast";


export default function ApplyVoucher() {
  function noVoucher() {
    return () =>
      toast("Hiện chưa có mã giảm giá", {
        icon: "🛠️",
      });
  }
  const noV = noVoucher();
  return (
    <Section title="Chọn mã giảm giá" className="rounded-lg">
      <button
        className="w-full flex justify-between items-center py-2 px-4 space-x-2 cursor-pointer"
        onClick={noV}
      >
        <div className="flex items-center space-x-2">
          <VoucherIcon />
          <div className="text-sm flex-1">Voucher</div>
        </div>
        <div className="flex items-center space-x-1">
          
        </div>
      </button>
    </Section>
  );
}
