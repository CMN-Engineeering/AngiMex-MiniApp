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
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Icon, Input } from "zmp-ui";
import { useSetAtom } from "jotai";

const VIETMAP_API_KEY = "8c6fbde67c7fb21a7aa851a3c59d22d5c620ed5ec4d4ef4d";
const VIETMAP_AUTOCOMPLETE_ENDPOINT =
  "https://maps.vietmap.vn/api/autocomplete/v4";

interface VietmapSuggestion {
  display: string;
  name: string;
}

function isVietmapSuggestion(result: unknown): result is VietmapSuggestion {
  if (typeof result !== "object" || result === null) return false;

  const suggestion = result as Record<string, unknown>;
  return (
    typeof suggestion.display === "string" &&
    typeof suggestion.name === "string" &&
    suggestion.name.trim().length > 0
  );
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

function ShippingAddressPage() {
  const { state } = useLocation();
  const editingOrder = (state as { order?: Order } | null)?.order;
  const [address, setAddress] = useAtom(shippingAddressState);
  const userInfo = useAtomValue(userInfoState);
  const resetAddress = useResetAtom(shippingAddressState);
  const refreshOrders = useSetAtom(refreshOrdersState);
  const navigate = useNavigate();

  const initialAddress = editingOrder?.delivery.type === "shipping"
    ? editingOrder.delivery
    : address;
  const [detail, setDetail] = useState(
    initialAddress ? formatShippingAddress(initialAddress) : ""
  );
  const [recipientName, setRecipientName] = useState(
    initialAddress?.name || userInfo?.name || ""
  );
  const [recipientPhone, setRecipientPhone] = useState(
    initialAddress?.phone || userInfo?.phone || ""
  );
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<
    VietmapSuggestion[]
  >([]);
  const [loadingAddressSuggestions, setLoadingAddressSuggestions] =
    useState(false);
  const [addressSuggestionError, setAddressSuggestionError] = useState("");
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [loadingContactInfo, setLoadingContactInfo] = useState(false);

  useEffect(() => {
    const query = detail.trim();
    if (!autocompleteOpen || query.length < 2) {
      setAddressSuggestions([]);
      setLoadingAddressSuggestions(false);
      setAddressSuggestionError("");
      return;
    }

    setAddressSuggestions([]);
    setLoadingAddressSuggestions(true);
    setAddressSuggestionError("");

    if (!VIETMAP_API_KEY) {
      setAddressSuggestions([]);
      setLoadingAddressSuggestions(false);
      setAddressSuggestionError(
        "Chưa cấu hình Vietmap. Vui lòng liên hệ hỗ trợ."
      );
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoadingAddressSuggestions(true);
      setAddressSuggestionError("");

      try {
        const url = new URL(VIETMAP_AUTOCOMPLETE_ENDPOINT);
        url.searchParams.set("apikey", VIETMAP_API_KEY);
        url.searchParams.set("text", query);
        url.searchParams.set("display_type", "3");
        url.searchParams.set("layers", "ADDRESS");

        const response = await fetch(url.toString(), {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`vietmap_autocomplete_failed_${response.status}`);
        }

        const results: unknown = await response.json();
        if (!Array.isArray(results)) {
          throw new Error("vietmap_autocomplete_invalid_response");
        }

        setAddressSuggestions(results.filter(isVietmapSuggestion));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("Failed to load Vietmap address suggestions:", error);
        setAddressSuggestions([]);
        setAddressSuggestionError(
          "Không thể tải gợi ý địa chỉ. Vui lòng thử lại."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingAddressSuggestions(false);
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [detail, autocompleteOpen]);

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

  return (
    <form
      className="h-full flex flex-col justify-between"
      onSubmit={async (e) => {
        e.preventDefault();

        if (!detail.trim()) {
          toast.error("Vui lòng nhập địa chỉ giao hàng");
          return;
        }

        const addressDetails: ShippingAddress = {
          provinceCode: "",
          provinceName: "",
          wardCode: "",
          wardName: "",
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
              : "Không thể tra cứu tọa độ địa chỉ. Vui lòng thử lại hoặc liên hệ hỗ trợ để được tư vấn."
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
          <div className="relative">
            <Input
              name="detail"
              label="Địa chỉ chi tiết"
              placeholder="Số nhà, tên đường..."
              value={detail}
              required
              onFocus={() => setAutocompleteOpen(true)}
              onBlur={() => setAutocompleteOpen(false)}
              onChange={(e) => {
                setDetail(e.target.value);
                setAutocompleteOpen(true);
              }}
            />
            {autocompleteOpen && detail.trim().length >= 2 && (
              <div
                className="absolute inset-x-0 top-full z-20 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
                role="listbox"
                aria-label="Gợi ý địa chỉ"
              >
                {loadingAddressSuggestions && (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    Đang tìm địa chỉ...
                  </div>
                )}
                {!loadingAddressSuggestions && addressSuggestionError && (
                  <div className="px-3 py-2 text-sm text-red-600">
                    {addressSuggestionError}
                  </div>
                )}
                {!loadingAddressSuggestions &&
                  !addressSuggestionError &&
                  addressSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.name}-${index}`}
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setDetail(suggestion.display.trim());
                        setAddressSuggestions([]);
                        setAutocompleteOpen(false);
                      }}
                    >
                      {suggestion.display}
                    </button>
                  ))}
                {!loadingAddressSuggestions &&
                  !addressSuggestionError &&
                  addressSuggestions.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      Không tìm thấy gợi ý địa chỉ.
                    </div>
                  )}
              </div>
            )}
          </div>
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