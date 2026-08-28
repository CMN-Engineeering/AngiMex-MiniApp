import Section from "./section";
import HorizontalDivider from "./horizontal-divider";
import Carousel from "./carousel";
import { Button, Icon, List } from "zmp-ui";

export function PageSkeleton() {
  return (
    <div className="min-h-full bg-background">
      <div className="bg-section pt-2">
        <div className="px-4">
          <div className="w-full h-12 rounded-lg bg-skeleton animate-pulse" />
        </div>
        <Carousel
          slides={[1, 2, 3].map(() => (
            <div className="w-full aspect-[2/1] rounded-[18px] bg-skeleton animate-pulse" />
          ))}
          disabled
        />
      </div>
      <div className="bg-section space-y-2 mt-2">
        <Section
          title={
            <div className="h-[18px] w-36 rounded-lg bg-skeleton animate-pulse" />
          }
        >
          <div className="pt-2.5 pb-4 flex space-x-6 overflow-x-auto px-4">
            {[1, 2, 3, 4].map((key) => (
              <div
                key={key}
                className="flex flex-col items-center space-y-2 flex-none basis-[70px] overflow-hidden cursor-pointer"
              >
                <div className="w-[70px] h-[70px] object-cover rounded-full border-[0.5px] border-black/15 bg-skeleton animate-pulse" />
                <div className="w-full h-9">
                  <div className="w-full h-[18px] rounded-lg bg-skeleton animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <HorizontalDivider />
      <Section
        title={
          <div className="h-[18px] w-20 rounded-lg bg-skeleton animate-pulse" />
        }
      >
        <div className="grid grid-cols-2 px-4 py-2 gap-4">
          {[1, 2, 3, 4].map((key) => (
            <ProductItemSkeleton key={key} />
          ))}
        </div>
      </Section>
    </div>
  );
}

export function ProductItemSkeleton() {
  return (
    <div className="flex flex-col cursor-progress group bg-section rounded-xl p-2 shadow-[0_10px_24px_#0D0D0D17]">
      <div className="w-full aspect-square bg-skeleton animate-pulse rounded-lg" />
      <div className="pt-2 pb-3">
        <div className="text-xs pt-1 pb-0.5 bg-skeleton animate-pulse rounded-lg inline-block text-transparent">
          Lorem ipsum dolor sit
        </div>
        <div className="mt-0.5 text-sm font-bold bg-skeleton animate-pulse rounded-lg inline-block text-transparent">
          Lorem ipsum dolor sit
        </div>
        <div className="text-3xs space-x-0.5 bg-skeleton animate-pulse rounded-lg inline-block text-transparent">
          Lorem ipsum dolor sit
        </div>
      </div>
      <Button variant="secondary" size="small"></Button>
    </div>
  );
}

export function SelectSkeleton(props: { width: number }) {
  return (
    <div
      className="h-8 rounded-full bg-skeleton animate-pulse px-3 flex items-center justify-end"
      style={{ width: props.width }}
    >
      <Icon icon="zi-chevron-down" />
    </div>
  );
}

export function StationSkeleton() {
  return (
    <button className="flex items-center space-x-4 p-4 pr-2 bg-section rounded-lg text-left">
      <div className="h-14 w-14 rounded-lg bg-skeleton animate-pulse" />
      <div className="flex-1 space-y-0.5">
        <div className="bg-skeleton animate-pulse rounded-lg inline-block text-transparent text-sm">
          Lorem, ipsum dolor
        </div>
        <div className="bg-skeleton animate-pulse rounded-lg inline-block text-transparent text-xs">
          Lorem ipsum dolor sit amet, consectetur adipisicing elit. Illo facilis
        </div>
        <div className="bg-primary opacity-25 animate-pulse rounded-lg inline-block text-transparent text-xs">
          4,3 km
        </div>
      </div>
    </button>
  );
}

export function OrderSummarySkeleton() {
  return (
    <Section
      title={
        <div className="w-full flex justify-between items-center space-x-2 font-normal">
          <span className="text-xs truncate text-transparent bg-skeleton rounded-lg animate-pulse">
            Lorem ipsum dolor sit amet
          </span>
          <span className="text-xs text-transparent bg-skeleton rounded-lg animate-pulse">
            Lorem ipsum
          </span>
        </div>
      }
      className="flex-1 overflow-y-auto rounded-lg"
    >
      <div className="w-full">
        <List.Item
          prefix={
            <div className="w-14 h-14 bg-skeleton rounded-lg animate-pulse" />
          }
          suffix={
            <div className="text-sm font-medium flex items-center h-full bg-skeleton rounded-lg animate-pulse text-transparent">
              xx
            </div>
          }
        >
          <div className="text-sm bg-skeleton rounded-lg animate-pulse text-transparent">
            Lorem ipsum dolor sit
          </div>
          <div className="text-sm font-bold mt-1 bg-skeleton rounded-lg animate-pulse text-transparent">
            Lorem ipsum
          </div>
          <div className="line-through text-4xs bg-skeleton rounded-lg animate-pulse text-transparent">
            Lorem ipsum
          </div>
        </List.Item>
      </div>
      <HorizontalDivider />
      <div className="flex justify-between items-center px-4 py-2 space-x-4">
        <div className="text-xs bg-skeleton rounded-lg animate-pulse text-transparent">
          Lorem ipsum dolor
        </div>
        <div className="text-sm bg-skeleton rounded-lg animate-pulse text-transparent">
          Lorem ipsum
        </div>
      </div>
    </Section>
  );
}

export function UserInfoSkeleton() {
  return (
    <div className="bg-section rounded-lg p-4 flex items-center space-x-4 border-[0.5px] border-black/15">
      <div className="rounded-full h-10 w-10 bg-skeleton animate-pulse" />
      <div className="space-y-0.5 flex-1 overflow-hidden">
        <div className="text-lg truncate bg-skeleton text-transparent animate-pulse">
          Lorem ipsum dolor
        </div>
        <div className="text-sm truncate bg-skeleton text-transparent animate-pulse">
          0912345678
        </div>
      </div>
    </div>
  );
}
