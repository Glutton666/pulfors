import React from "react";
import { G, Polygon } from "react-native-svg";
import type { NotebookBeamGroup } from "@/lib/notebook-beaming";

type Props = { groups: NotebookBeamGroup[] };

export function NotebookBeamLayer({ groups }: Props) {
  return <>
    {groups.map((group) => (
      <G key={group.id} testID="notebook-beam-group">
        {group.segments.map((segment, index) => {
          const dx = segment.x2 - segment.x1;
          const dy = segment.y2 - segment.y1;
          const length = Math.hypot(dx, dy) || 1;
          const nx = (-dy / length) * segment.thickness / 2;
          const ny = (dx / length) * segment.thickness / 2;
          const points = `${segment.x1 + nx},${segment.y1 + ny} ${segment.x2 + nx},${segment.y2 + ny} ${segment.x2 - nx},${segment.y2 - ny} ${segment.x1 - nx},${segment.y1 - ny}`;
          return <Polygon
            key={`${segment.level}-${index}`}
            testID={segment.hook ? "notebook-beam-hook" : `notebook-beam-level-${segment.level}`}
            points={points}
            fill="#111111"
          />;
        })}
      </G>
    ))}
  </>;
}
