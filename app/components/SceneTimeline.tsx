"use client";

import { useMemo } from "react";
import type { SceneCue } from "../data/scenes";

type SceneTimelineProps = {
  scenes: SceneCue[];
  activeIndex: number;
  totalDurationMs: number;
  playbackState: "idle" | "playing" | "rendering" | "completed" | "error";
};

export function SceneTimeline({ scenes, activeIndex, totalDurationMs, playbackState }: SceneTimelineProps) {
  const checkpoints = useMemo(() => {
    let cumulative = 0;
    return scenes.map((scene) => {
      const start = cumulative;
      cumulative += scene.duration * 1000;
      return { start, end: cumulative };
    });
  }, [scenes]);

  return (
    <div className="timeline">
      <div className="timeline__header">
        <h2>مراحل الرحلة</h2>
        <span>{(totalDurationMs / 1000).toFixed(0)} ثانية</span>
      </div>
      <ol className="timeline__list">
        {scenes.map((scene, index) => {
          const isActive = index === activeIndex;
          const { start, end } = checkpoints[index];
          const position = `${Math.round((start / totalDurationMs) * 100)}%`;
          const width = `${Math.round(((end - start) / totalDurationMs) * 100)}%`;

          return (
            <li key={scene.id} className={`timeline__item ${isActive ? "is-active" : ""}`}>
              <div className="timeline__meta">
                <span className="timeline__badge">{index + 1}</span>
                <div>
                  <p className="timeline__title">{scene.title}</p>
                  <p className="timeline__subtitle">{scene.subtitle}</p>
                </div>
              </div>
              <div className="timeline__bar">
                <div className="timeline__track">
                  <span className="timeline__segment" style={{ left: position, width }} />
                </div>
                <span className="timeline__duration">{scene.duration} ث</span>
              </div>
              {isActive && (
                <p className="timeline__description">
                  {playbackState === "rendering" ? "جاري الإدماج في الفيديو" : scene.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
