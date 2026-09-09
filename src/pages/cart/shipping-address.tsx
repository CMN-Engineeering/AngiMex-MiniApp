import { shippingAddressState } from "@/state";
import { useAtom } from "jotai";
import { useResetAtom } from "jotai/utils";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { Button, Icon, Input } from "zmp-ui";

// Cas AddressKit - danh mục hành chính Việt Nam
// https://cas.so/address-kit
const ADDRESS_API_ENDPOINT = "https://production.cas.so/address-kit";
// Cấu trúc hành chính 2 cấp (Tỉnh/Thành - Xã/Phường), áp dụng từ 01/07/2025
const ADDRESS_EFFECTIVE_DATE = "2025-07-01";

interface AddressOption {
  code: string;
  name: string;
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
  const [address, setAddress] = useAtom(shippingAddressState);
  const resetAddress = useResetAtom(shippingAddressState);
  const navigate = useNavigate();

  const [provinces, setProvinces] = useState<AddressOption[]>([]);
  const [wards, setWards] = useState<AddressOption[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  const [provinceCode, setProvinceCode] = useState(
    (address as any)?.provinceCode ?? ""
  );
  const [wardCode, setWardCode] = useState((address as any)?.wardCode ?? "");
  const [detail, setDetail] = useState((address as any)?.detail ?? "");

  // Tải danh sách tỉnh/thành khi vào trang
  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoadingProvinces(true);
      try {
        const res = await fetch(
          `${ADDRESS_API_ENDPOINT}/${ADDRESS_EFFECTIVE_DATE}/provinces`
        );
        const data = await res.json();
        if (!ignore) setProvinces(data.provinces ?? []);
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
    (async () => {
      setLoadingWards(true);
      try {
        const res = await fetch(
          `${ADDRESS_API_ENDPOINT}/${ADDRESS_EFFECTIVE_DATE}/provinces/${provinceCode}/communes`
        );
        const data = await res.json();
        if (!ignore) setWards(data.communes ?? []);
      } catch (err) {
        if (!ignore) toast.error("Không tải được danh sách xã/phường");
      } finally {
        if (!ignore) setLoadingWards(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [provinceCode]);

  return (
    <form
      className="h-full flex flex-col justify-between"
      onSubmit={(e) => {
        e.preventDefault();

        if (!provinceCode || !wardCode) {
          toast.error("Vui lòng chọn đầy đủ tỉnh/thành và xã/phường");
          return;
        }

        const data = new FormData(e.currentTarget);
        const newAddress: Record<string, any> = {};
        data.forEach((value, key) => {
          newAddress[key] = value;
        });

        const province = provinces.find((p) => p.code === provinceCode);
        const ward = wards.find((w) => w.code === wardCode);

        newAddress.provinceCode = provinceCode;
        newAddress.provinceName = province?.name ?? "";
        newAddress.wardCode = wardCode;
        newAddress.wardName = ward?.name ?? "";
        newAddress.detail = detail;

        setAddress(newAddress as typeof address);
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
            label="Địa chỉ chi tiết"
            placeholder="Số nhà, tên đường..."
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>
        <div className="bg-section p-4 grid gap-4">
          <Input
            name="name"
            label="Tên người nhận"
            placeholder="Nhập tên người nhận"
            defaultValue={address?.name}
          />
          <Input
          name="phone"
          label="Số điện thoại"
          placeholder="0912345678"
          defaultValue={address?.phone}
          // type="tel"
          maxLength={10} // Enforces maximum length of 10
          pattern="^0[0-9]{9}$" // HTML5 validation: must start with 0, followed by 9 digits
          title="Số điện thoại phải bắt đầu bằng 0 và có đúng 10 chữ số"
          onKeyPress={(e) => {
            // Prevent typing any non-numeric characters
            if (!/[0-9]/.test(e.key)) {
              e.preventDefault();
            }
          }}
          onChange={(e) => {
            // If the user types a first character that is not '0', force it to '0'
            if (e.target.value.length === 1 && e.target.value !== '0') {
              e.target.value = ''; // Or you can set it to '0' depending on UX preference
            }
          }}
        />
        </div>
        <Button
          fullWidth
          className="!bg-section !text-danger !rounded-none"
          type="danger"
          prefixIcon={<Icon icon="zi-delete" />}
          onClick={() => {
            resetAddress();
            toast.success("Đã xóa địa chỉ");
            navigate(-1);
          }}
        >
          Xóa địa chỉ này
        </Button>
      </div>
      <div className="p-6 pt-4 bg-section">
        <Button htmlType="submit" fullWidth>
          Xong
        </Button>
      </div>
    </form>
  );
}

export default ShippingAddressPage;