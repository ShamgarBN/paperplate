import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Star, Trash2 } from "lucide-react";
import type { Recipe } from "@/lib/db/schema";
import { localImageUrl } from "@/lib/assetUrl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface RecipeCardProps {
  recipe: Recipe;
  cuisineName?: string | null;
  className?: string;
  onDelete?: (recipe: Recipe) => void;
}

export function RecipeCard({
  recipe,
  cuisineName,
  className,
  onDelete,
}: RecipeCardProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (recipe.image_path) {
      localImageUrl(recipe.image_path).then((u) => {
        if (active) setImgUrl(u);
      });
    } else {
      setImgUrl(null);
    }
    return () => {
      active = false;
    };
  }, [recipe.image_path]);

  return (
    <Link
      to="/recipes/$recipeId"
      params={{ recipeId: String(recipe.id) }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-card transition-shadow hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-display text-4xl text-muted-foreground/40">
              {recipe.title.charAt(0).toUpperCase() || "?"}
            </span>
          </div>
        )}
        {cuisineName && (
          <Badge
            variant="secondary"
            className="absolute left-3 top-3 bg-background/90 backdrop-blur"
          >
            {cuisineName}
          </Badge>
        )}
        {onDelete && (
          <Button
            variant="secondary"
            size="icon"
            aria-label={`Delete ${recipe.title}`}
            className="absolute right-3 top-3 h-8 w-8 bg-background/90 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:bg-background hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete(recipe);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-display text-lg font-medium leading-snug tracking-tight">
          {recipe.title}
        </h3>
        <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
          {recipe.total_min != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {recipe.total_min} min
            </span>
          )}
          {recipe.rating != null && recipe.rating > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-current text-amber-500" />
              {recipe.rating}
            </span>
          )}
          <span className="ml-auto">{recipe.base_servings} servings</span>
        </div>
      </div>
    </Link>
  );
}
