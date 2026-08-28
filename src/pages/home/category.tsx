import TransitionLink from "@/components/transition-link";
import { useAtomValue } from "jotai";
import { categoriesState } from "@/state";

export default function Category() {
  const categories = useAtomValue(categoriesState);

  return (
    <div
      className="bg-section grid gap-x-2 gap-y-4 py-2 px-4 overflow-x-auto"
      style={{
        gridTemplateColumns: `repeat(${Math.ceil(
          categories.length > 4 ? categories.length / 2 : categories.length
        )}, minmax(70px, 1fr))`,
      }}
    >
      {categories.map((category) => (
        <TransitionLink
          key={category.id}
          className="flex flex-col items-center space-y-1 flex-none overflow-hidden cursor-pointer mx-auto"
          to={`/category/${category.id}`}
        >
          <img
            src={category.image}
            className="w-12 h-12 object-cover rounded-full bg-skeleton"
            alt={category.name}
          />
          <div className="text-center text-3xs w-full line-clamp-2 text-subtitle">
            {category.name}
          </div>
        </TransitionLink>
      ))}
    </div>
  );
}
