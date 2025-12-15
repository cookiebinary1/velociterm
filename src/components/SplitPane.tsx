import { useState, useRef, useCallback, useEffect, ReactNode, Fragment, isValidElement } from 'react';

interface SplitPaneProps {
  direction: 'horizontal' | 'vertical';
  children: ReactNode[];
  defaultSplit?: number;
}

export function SplitPane({ direction, children, defaultSplit = 50 }: SplitPaneProps) {
  const [split, setSplit] = useState(defaultSplit);
  const [sizes, setSizes] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragIndexRef = useRef<number>(-1);
  const dragStartPosRef = useRef<number>(0);
  const dragStartSizesRef = useRef<number[]>([]);

  const handleMouseDown = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragIndexRef.current = index;
    dragStartPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
    dragStartSizesRef.current = sizes;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, sizes]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const dragIndex = dragIndexRef.current;
    if (dragIndex < 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const startPos = dragStartPosRef.current;
    const startSizes = dragStartSizesRef.current;

    if (children.length <= 2) {
      let newSplit: number;
      if (direction === 'horizontal') {
        newSplit = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        newSplit = ((e.clientY - rect.top) / rect.height) * 100;
      }
      setSplit(Math.max(20, Math.min(80, newSplit)));
      return;
    }

    const total = direction === 'horizontal' ? rect.width : rect.height;
    if (total <= 0) return;

    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const deltaPct = ((currentPos - startPos) / total) * 100;

    const minPane = 10;
    const next = [...startSizes];
    const a0 = startSizes[dragIndex] ?? 0;
    const b0 = startSizes[dragIndex + 1] ?? 0;

    let a = a0 + deltaPct;
    let b = b0 - deltaPct;

    if (a < minPane) {
      b -= (minPane - a);
      a = minPane;
    }
    if (b < minPane) {
      a -= (minPane - b);
      b = minPane;
    }

    next[dragIndex] = a;
    next[dragIndex + 1] = b;
    setSizes(next);
  }, [direction, children.length]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    dragIndexRef.current = -1;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const n = children.length;
    if (n <= 0) return;
    if (n === 1) {
      setSizes([100]);
      return;
    }
    if (n === 2) {
      setSizes([split, 100 - split]);
      return;
    }
    setSizes((prev) => {
      if (prev.length === n) return prev;
      const each = 100 / n;
      return Array.from({ length: n }, () => each);
    });
  }, [children.length, split]);

  const hasSecondPane = children.length > 1 && children[1] != null;

  const firstStyle = direction === 'horizontal'
    ? { width: hasSecondPane ? `${split}%` : '100%' }
    : { height: hasSecondPane ? `${split}%` : '100%' };

  const secondStyle = direction === 'horizontal'
    ? { width: `${100 - split}%` }
    : { height: `${100 - split}%` };

  return (
    <div
      ref={containerRef}
      className={`split-pane ${direction}`}
      style={{ height: '100%', width: '100%' }}
    >
      {children.length <= 2 ? (
        <>
          <div style={{ ...firstStyle, overflow: 'hidden' }}>
            {children[0]}
          </div>
          {hasSecondPane && (
            <>
              <div
                className="split-handle"
                onMouseDown={(e) => handleMouseDown(0, e)}
              />
              <div style={{ ...secondStyle, overflow: 'hidden' }}>
                {children[1]}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {children.map((child, idx) => {
            const key = isValidElement(child) && child.key != null ? String(child.key) : String(idx);
            return (
            <Fragment key={key}>
              <div
                style={{
                  overflow: 'hidden',
                  ...(direction === 'horizontal'
                    ? { width: `${sizes[idx] ?? 0}%` }
                    : { height: `${sizes[idx] ?? 0}%` }),
                }}
              >
                {child}
              </div>
              {idx < children.length - 1 && (
                <div
                  className="split-handle"
                  onMouseDown={(e) => handleMouseDown(idx, e)}
                />
              )}
            </Fragment>
            );
          })}
        </>
      )}
    </div>
  );
}
