import HorizontalDivider from "@/components/horizontal-divider";
import Section from "@/components/section";
import { StationSkeleton } from "@/components/skeleton";
import { Button, Input } from "zmp-ui";
import TransitionLink from "@/components/transition-link";
import {
  HomeIcon,
  LocationMarkerLineIcon,
  LocationMarkerPackageIcon,
  PlusIcon,
  ShipperIcon,
} from "@/components/vectors";
import {
  deliveryModeState,
  selectedStationState,
  shippingAddressState,
  getUserContactInfo,
  userInfoState,
} from "@/state";
import { formatShippingAddress } from "@/utils/format";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import { Suspense } from "react";
import toast from "react-hot-toast";
import DeliverySummary from "./delivery-summary";

function ShippingAddressSummary() {
  const shippingAddress = useAtomValue(shippingAddressState);

  if (!shippingAddress) {
    return (
      <TransitionLink
        className="flex flex-col space-y-2 justify-center items-center p-4 w-full"
        to="/shipping-address"
      >
        <LocationMarkerPackageIcon />

        <div className="flex space-x-1 items-center text-center p-2">
          <PlusIcon width={16} height={16} />
          <span className="text-sm font-medium">
            Thêm địa chỉ nhận hàng
          </span>
        </div>
      </TransitionLink>
    );
  }

  return (
    <DeliverySummary
      icon={<LocationMarkerLineIcon />}
      title="Địa chỉ nhận hàng"
      subtitle={shippingAddress.name}
      description={formatShippingAddress(shippingAddress)}
      linkTo="/shipping-address"
    />
  );
}

function SelectedStationSummary() {
  const selectedStation = useAtomValue(selectedStationState);

  return (
    <DeliverySummary
      icon={<HomeIcon />}
      title="Nhận hàng tại"
      subtitle={selectedStation.name}
      description={selectedStation.address}
      linkTo="/stations"
    />
  );
}

function PickupRecipientForm() {
  const userInfo = useAtomValue(userInfoState);

  const [recipientName, setRecipientName] = useState(
    userInfo?.name ?? ""
  );
  const [recipientPhone, setRecipientPhone] = useState(
    userInfo?.phone ?? ""
  );
  const [loadingContactInfo, setLoadingContactInfo] = useState(false);

  const handleGetContactInfo = async () => {
    if (loadingContactInfo) return;

    setLoadingContactInfo(true);

    try {
      const contactInfo = await getUserContactInfo();

      setRecipientName(contactInfo.name ?? "");
      setRecipientPhone(contactInfo.phone ?? "");

      toast.success("Đã lấy thông tin người nhận");
    } catch (error) {
      console.warn("Failed to get contact information:", error);
      toast.error("Không thể lấy thông tin người nhận");
    } finally {
      setLoadingContactInfo(false);
    }
  };

  return (
    <div className="bg-section p-4 grid gap-4">
      <Button
        htmlType="button"
        fullWidth
        loading={loadingContactInfo}
        onClick={handleGetContactInfo}
      >
        Lấy thông tin người nhận
      </Button>

      <Input
        name="name"
        label="Tên người nhận"
        placeholder="Nhập tên người nhận"
        value={recipientName}
        onChange={(event) => setRecipientName(event.target.value)}
      />

      <Input
        name="phone"
        label="Số điện thoại"
        placeholder="0912345678"
        value={recipientPhone}
        maxLength={10}
        pattern="^0[0-9]{9}$"
        title="Số điện thoại phải bắt đầu bằng 0 và có đúng 10 chữ số"
        onChange={(event) =>
          setRecipientPhone(
            event.target.value.replace(/\D/g, "").slice(0, 10)
          )
        }
      />
    </div>
  );
}

function Delivery() {
  const [selectedDeliveryMode, setSelectedDeliveryMode] =
    useAtom(deliveryModeState);

  return (
    <Section title="Hình thức giao hàng" className="rounded-lg">
      <div className="grid grid-cols-2 gap-4 p-4 pt-2">
        {(
          [
            {
              type: "shipping",
              name: "Giao tận nơi",
              icon: <ShipperIcon />,
            },
            {
              type: "pickup",
              name: "Tự đến lấy",
              icon: <HomeIcon />,
            },
          ] as const
        ).map((option) => (
          <button
            key={option.type}
            type="button"
            className={
              "flex justify-center items-center space-x-2 text-base font-medium bg-background rounded-full h-12 px-3.5 ".concat(
                selectedDeliveryMode === option.type
                  ? "border border-primary text-primary"
                  : ""
              )
            }
            onClick={() => setSelectedDeliveryMode(option.type)}
          >
            {option.icon}
            <span>{option.name}</span>
          </button>
        ))}
      </div>

      <HorizontalDivider />

      {selectedDeliveryMode === "shipping" ? (
        <ShippingAddressSummary />
      ) : (
        <Suspense fallback={<StationSkeleton />}>
          <SelectedStationSummary />

          {/* Pickup only needs recipient name and phone */}
          {/* <PickupRecipientForm /> */}
        </Suspense>
      )}
    </Section>
  );
}

export default Delivery;