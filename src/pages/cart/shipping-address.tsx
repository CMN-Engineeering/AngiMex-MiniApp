import {
  getUserContactInfo,
  refreshOrdersState,
  shippingAddressState,
  userInfoState,
} from "@/state";
import { Location, Order, ShippingAddress } from "@/types";
import { backendPost, getCurrentUserId } from "@/utils/backend";
import { formatShippingAddress } from "@/utils/format";
import { useAtom, useAtomValue } from "jotai";
import { useResetAtom } from "jotai/utils";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Icon, Input } from "zmp-ui";
import { useSetAtom } from "jotai";
import province_data from "./data/province_data.json"
import commune_data from "./data/commune_data.json"

// Cas AddressKit - danh mục hành chính Việt Nam
// https://cas.so/address-kit
const ADDRESS_API_ENDPOINT = "https://production.cas.so/address-kit";
// Cấu trúc hành chính 2 cấp (Tỉnh/Thành - Xã/Phường), áp dụng từ 01/07/2025
const ADDRESS_EFFECTIVE_DATE = "2025-07-01";

interface AddressOption {
  code: string;
  name: string;
}

async function geocodeAddress(address: string): Promise<Location> {
  const apiKey = "pk.57d3574bfb51463df8e8c20bfcf47f65";
  if (!apiKey) {
    throw new Error("locationiq_api_key_missing");
  }
  console.log(address);

  const url = new URL("https://us1.locationiq.com/v1/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "vn");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`locationiq_geocoding_failed_${response.status}`);
  }

  const results: unknown = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("locationiq_address_not_found");
  }

  const firstResult = results[0] as
    | { lat?: unknown; lon?: unknown }
    | null;
  const latitude = Number(firstResult?.lat);
  const longitude = Number(firstResult?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("locationiq_address_not_found");
  }

  return { lat: latitude, lng: longitude };
}

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt có dấu/không dấu
function normalizeSearchText(str: string) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

interface SearchableSelectProps {
  label: string;
  placeholder: string;
  value: string;
  options: AddressOption[];
  disabled?: boolean;
  loading?: boolean;
  onChange: (code: string) => void;
}

function SearchableSelect({
  label,
  placeholder,
  value,
  options,
  disabled,
  loading,
  onChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.code === value);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const normalizedQuery = normalizeSearchText(query);
  const filtered = normalizedQuery
    ? options.filter((o) =>
        normalizeSearchText(o.name).includes(normalizedQuery)
      )
    : options;

  return (
    <div className="grid gap-1">
      <label className="text-sm font-medium">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-left disabled:opacity-50 flex items-center justify-between gap-2"
      >
        <span
          className={`truncate ${selected ? "text-black" : "text-gray-400"}`}
        >
          {loading ? "Đang tải..." : selected ? selected.name : placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
          <path
            d="M2 4l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Bảng chọn hiển thị toàn màn hình, tách biệt hoàn toàn khỏi form phía sau */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="p-1 -ml-1 text-gray-600"
              >
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <path
                    d="M15 5L5 15M5 5l10 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <span className="text-base font-medium">{label}</span>
            </div>

            <div className="px-3 py-3 border-b border-gray-200 shrink-0">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm kiếm..."
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-sm text-gray-400 text-center">
                  Không tìm thấy kết quả
                </div>
              )}
              {filtered.map((o) => (
                <div
                  key={o.code}
                  onClick={() => {
                    onChange(o.code);
                    setOpen(false);
                  }}
                  className={`px-4 py-3 text-sm cursor-pointer border-b border-gray-100 ${
                    o.code === value
                      ? "bg-blue-50 text-blue-600 font-medium"
                      : ""
                  }`}
                >
                  {o.name}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function ShippingAddressPage() {
  const { state } = useLocation();
  const editingOrder = (state as { order?: Order } | null)?.order;
  const [address, setAddress] = useAtom(shippingAddressState);
  const userInfo = useAtomValue(userInfoState);
  const resetAddress = useResetAtom(shippingAddressState);
  const refreshOrders = useSetAtom(refreshOrdersState);
  const navigate = useNavigate();

  const [provinces, setProvinces] = useState<AddressOption[]>([]);
  const [wards, setWards] = useState<AddressOption[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  const initialAddress = editingOrder?.delivery.type === "shipping"
    ? editingOrder.delivery
    : address;
  const [provinceCode, setProvinceCode] = useState(
    initialAddress?.provinceCode ?? ""
  );
  const [wardCode, setWardCode] = useState(initialAddress?.wardCode ?? "");
  const [detail, setDetail] = useState(initialAddress?.detail ?? "");
  const [recipientName, setRecipientName] = useState(
    initialAddress?.name || userInfo?.name || ""
  );
  const [recipientPhone, setRecipientPhone] = useState(
    initialAddress?.phone || userInfo?.phone || ""
  );
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [loadingContactInfo, setLoadingContactInfo] = useState(false);

  const handleGetContactInfo = async () => {
    if (loadingContactInfo) return;

    setLoadingContactInfo(true);
    try {
      const contactInfo = await getUserContactInfo();
      setRecipientName(contactInfo.name);
      setRecipientPhone(contactInfo.phone);
      toast.success("Đã lấy thông tin người nhận");
    } catch (error) {
      console.warn("Failed to get contact information:", error);
      toast.error("Không thể lấy thông tin người nhận");
    } finally {
      setLoadingContactInfo(false);
    }
  };

  // Tải danh sách tỉnh/thành khi vào trang
  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoadingProvinces(true);
      try {
 
        if (!ignore) setProvinces(province_data.provinces ?? []);
      } catch (err) {
        if (!ignore) toast.error("Không tải được danh sách tỉnh/thành");
      } finally {
        if (!ignore) setLoadingProvinces(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Tải danh sách xã/phường mỗi khi tỉnh/thành thay đổi
  useEffect(() => {
    if (!provinceCode) {
      setWards([]);
      return;
    }
    
    let ignore = false;
    
    setLoadingWards(true);
    try {
      // Lọc danh sách xã/phường theo mã tỉnh/thành
      const filteredCommunes = commune_data.communes.filter(
        (commune) => commune.provinceCode === provinceCode
      );

      // Sắp xếp theo tên để hiển thị đẹp hơn trên UI
      const sortedCommunes = filteredCommunes.sort((a, b) => 
        a.name.localeCompare(b.name)
      );

      if (!ignore) setWards(sortedCommunes);
    } catch (err) {
      if (!ignore) toast.error("Không tải được danh sách xã/phường");
    } finally {
      if (!ignore) setLoadingWards(false);
    }
    
    return () => {
      ignore = true;
    };
  }, [provinceCode]);
  return (
    <form
      className="h-full flex flex-col justify-between"
      onSubmit={async (e) => {
        e.preventDefault();

        if (!provinceCode || !wardCode || !detail.trim()) {
          toast.error(
            "Vui lòng chọn tỉnh/thành, xã/phường và nhập số nhà, tên đường"
          );
          return;
        }

        const province = provinces.find((p) => p.code === provinceCode);
        const ward = wards.find((w) => w.code === wardCode);

        const addressDetails: ShippingAddress = {
          provinceCode,
          provinceName: province?.name ?? "",
          wardCode,
          wardName: ward?.name ?? "",
          detail: detail.trim(),
          name: recipientName.trim(),
          phone: recipientPhone.trim(),
        };

        setGeocodingAddress(true);
        let location: Location;
        try {
          location = await geocodeAddress(formatShippingAddress(addressDetails));
        } catch (error) {
          console.warn("Failed to geocode shipping address:", error);
          toast.error(
            error instanceof Error &&
              error.message === "locationiq_api_key_missing"
              ? "Thiếu cấu hình LocationIQ. Vui lòng liên hệ hỗ trợ."
              : error instanceof Error &&
                error.message === "locationiq_address_not_found"
              ? "Không tìm thấy tọa độ địa chỉ. Vui lòng kiểm tra lại địa chỉ."
              : "Không thể tra cứu tọa độ địa chỉ. Vui lòng thử lại sau."
          );
          return;
        } finally {
          setGeocodingAddress(false);
        }

        const shippingAddress: ShippingAddress = { ...addressDetails, location };

        if (editingOrder) {
          setSavingOrder(true);
          try {
            const userId = await getCurrentUserId();
            const response = await backendPost<
              {
                order_code: string;
                user_id: string;
                shipping_address: string;
                location_latitude: number | null;
                location_longitude: number | null;
                receiver_name: string;
                phone_number: string;
              },
              { success: boolean; error?: string }
            >("/update_order_delivery", {
              order_code: String(editingOrder.id),
              user_id: userId,
              shipping_address: formatShippingAddress(shippingAddress),
              location_latitude: shippingAddress.location?.lat ?? null,
              location_longitude: shippingAddress.location?.lng ?? null,
              receiver_name: recipientName.trim(),
              phone_number: recipientPhone.trim(),
            });
            if (!response.success) {
              throw new Error(response.error ?? "update_order_delivery_failed");
            }
            refreshOrders();
            toast.success("Đã cập nhật địa chỉ đơn hàng");
            navigate(`/order/${editingOrder.id}`, {
              replace: true,
              state: {
                ...editingOrder,
                delivery: { ...editingOrder.delivery, ...shippingAddress },
              },
            });
          } catch (error) {
            console.warn("Failed to update order delivery:", error);
            toast.error("Không thể cập nhật địa chỉ đơn hàng. Vui lòng thử lại.");
          } finally {
            setSavingOrder(false);
          }
          return;
        }

        setAddress(shippingAddress);
        toast.success("Đã cập nhật địa chỉ");
        navigate(-1);
      }}
    >
      <div className="py-2 space-y-2">

        <div className="bg-section p-4 grid gap-4" id="address-form">
          <SearchableSelect
            label="Tỉnh/Thành phố"
            placeholder="-- Chọn tỉnh/thành --"
            value={provinceCode}
            options={provinces}
            loading={loadingProvinces}
            onChange={(code) => {
              setProvinceCode(code);
              setWardCode("");
            }}
          />

          <SearchableSelect
            label="Xã/Phường"
            placeholder="-- Chọn xã/phường --"
            value={wardCode}
            options={wards}
            disabled={!provinceCode}
            loading={loadingWards}
            onChange={setWardCode}
          />

          <Input
            name="detail"
            label="Số nhà, tên đường"
            placeholder="Số nhà, tên đường..."
            value={detail}
            required
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>
        <div className="bg-section p-4 grid gap-4">
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
            onChange={(event) => setRecipientPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
          />
          <Button
            htmlType="button"
            fullWidth
            loading={loadingContactInfo}
            onClick={handleGetContactInfo}
          >
            Lấy thông tin người nhận
          </Button>
        </div>
        <Button
          fullWidth
          className="!bg-section !text-danger !rounded-none"
          type="danger"
          prefixIcon={<Icon icon="zi-delete" />}
          onClick={() => {
            if (editingOrder) return;
            resetAddress();
            toast.success("Đã xóa địa chỉ");
            navigate(-1);
          }}
        >
          Xóa địa chỉ này
        </Button>
      </div>
      <div className="p-6 pt-4 bg-section">
        <Button
          htmlType="submit"
          fullWidth
          loading={savingOrder || geocodingAddress}
          disabled={savingOrder || geocodingAddress}
        >
          Xong
        </Button>
      </div>
    </form>
  );
}

export default ShippingAddressPage;