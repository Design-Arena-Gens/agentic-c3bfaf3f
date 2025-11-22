"use client";

import type { SceneCue } from "../data/scenes";

type SceneFactsProps = {
  scene: SceneCue;
};

export function SceneFacts({ scene }: SceneFactsProps) {
  return (
    <aside className="facts">
      <h3>حقائق سريعة</h3>
      <ul>
        {scene.facts.map((fact, index) => (
          <li key={fact}>
            <span className="facts__index">{index + 1}</span>
            <p>{fact}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
