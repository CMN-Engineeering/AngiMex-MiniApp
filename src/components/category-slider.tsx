import { categoriesState } from "@/state";
import { useAtomValue } from "jotai";
import { useParams } from "react-router-dom";
import TransitionLink from "./transition-link";

export default function CategorySlider() {
  const { id } = useParams();
  const categories = useAtomValue(categoriesState);

  return (
    <div className="px-3 py-2 overflow-x-auto flex space-x-2">
      {categories.map((category) => (
        <TransitionLink
          to={`/category/${category.id}`}
          key={category.id}
          className={"h-8 flex-none rounded-full p-1 pr-2 flex items-center space-x-1 border border-black/15 ".concat(
            String(category.id) === id
              ? "bg-primary text-primaryForeground"
              : "bg-section"
          )}
        >
          <img
            src={category.image}
            className="w-6 h-6 rounded-full bg-skeleton"
          />
          <p className="text-xs whitespace-nowrap">{category.name}</p>
        </TransitionLink>
      ))}
    </div>
  );
}
