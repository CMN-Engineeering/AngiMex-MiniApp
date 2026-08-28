import Section from "@/components/section";
import { VoucherIcon } from "@/components/vectors";
import { useToBeImplemented } from "@/hooks";
import { Icon } from "zmp-ui";

export default function ApplyVoucher() {
  const toBeImplemented = useToBeImplemented();
  return (
    <Section title="Chọn mã giảm giá" className="rounded-lg">
      <button
        className="w-full flex justify-between items-center py-2 px-4 space-x-2 cursor-pointer"
        onClick={toBeImplemented}
      >
        <div className="flex items-center space-x-2">
          <VoucherIcon />
          <div className="text-sm flex-1">Voucher</div>
        </div>
        <div className="flex items-center space-x-1">
          <div className="text-sm font-medium">Chọn</div>
          <Icon icon="zi-chevron-right" />
        </div>
      </button>
    </Section>
  );
}
