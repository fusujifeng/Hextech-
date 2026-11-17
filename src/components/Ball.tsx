import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 桌面悬浮球：默认收起态。
 * 单击展开主窗口；按住拖动可移动到桌面任意位置。
 */
export function Ball() {
  const drag = useRef({ down: false, moved: false, x: 0, y: 0 });

  useEffect(() => {
    document.documentElement.classList.add("ball-mode");
    document.body.classList.add("ball-mode");
    return () => {
      document.documentElement.classList.remove("ball-mode");
      document.body.classList.remove("ball-mode");
    };
  }, []);

  const expand = () => {
    invoke("expand_from_ball").catch(() => undefined);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { down: true, moved: false, x: e.screenX, y: e.screenY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.down) return;
    // 移动超过 4px 视为拖拽，否则松开时算点击
    if (!d.moved && Math.hypot(e.screenX - d.x, e.screenY - d.y) > 4) {
      d.moved = true;
      getCurrentWindow().startDragging().catch(() => undefined);
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    d.down = false;
    if (!d.moved) expand();
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="点击展开 ARAMHelper"
        className="flex h-[58px] w-[58px] cursor-pointer select-none items-center justify-center rounded-full border border-gold-400/70 bg-[#0b111c] shadow-[0_6px_18px_rgba(0,0,0,0.55)] transition hover:scale-105 hover:border-gold-300 active:scale-95"
      >
        <img
          src="/app-icon.png"
          alt="ARAMHelper"
          draggable={false}
          className="pointer-events-none h-[46px] w-[46px] rounded-full"
        />
      </div>
    </div>
  );
}
