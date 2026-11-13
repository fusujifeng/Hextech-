import { useState } from "react";
import type { ItemView } from "../lib/types";

interface Props {
  item: ItemView;
  /** 核心装序号 */
  index?: number;
}

export function ItemSlot({ item, index }: Props) {
  const [broken, setBroken] = useState(false);

  return (
    <div className="group flex w-[62px] shrink-0 flex-col items-center gap-1">
      <div className="relative h-[62px] w-[62px] overflow-hidden rounded-lg border border-gold-400/25 bg-black/50 shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition duration-150 group-hover:-translate-y-0.5 group-hover:border-gold-400/70">
        {broken ? (
          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] leading-tight text-gold-300/80">
            {item.name.slice(0, 4)}
          </div>
        ) : (
          <img
            src={item.icon}
            alt={item.name}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        )}
        {index !== undefined && (
          <span className="absolute left-0 top-0 rounded-br-md bg-black/75 px-1 text-[10px] font-semibold text-gold-300">
            {index}
          </span>
        )}
      </div>
      <span className="line-clamp-2 h-[24px] w-full text-center text-[10px] leading-[1.2] text-white/65">
        {item.name}
      </span>
    </div>
  );
}
